import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Physics, RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'
import { TILE_HEIGHT } from '../data/hexBoard'
import { DieMesh } from './DieMesh'
import { DIE_SIZE, faceValueFromQuaternion } from '../three/dieFaces'

// Same reference height Dice3D's closed-form REST_Y uses, so a die resting
// under real physics lands flush with the same tray surface a spectator's
// scripted tumble would.
const FLOOR_TOP_Y = TILE_HEIGHT / 2 + 0.02

// Matches Dice3D's BOUND_X/BOUND_Z_MIN/BOUND_Z_MAX — the same hex-island
// extents proven (by every board screenshot this project has taken) to sit
// fully inside the camera frustum, now built as real static colliders
// instead of manual per-frame bounce math.
const BOUND_X = 2.4
const BOUND_Z_MIN = -2.3
const BOUND_Z_MAX = 2.8
const WALL_HALF_HEIGHT = 2

// Kinetic-explosion launch, in the same spirit as Dice3D's
// randomOutwardVelocity/randomSpinSpeed: a strong burst in a random
// direction with random spin, no aim point — real physics (gravity,
// friction, restitution, wall bounces) takes it from there. These are
// target VELOCITIES (world units/sec, rad/sec) — Rapier's applyImpulse
// takes momentum, not velocity, so they get scaled by the body's own
// mass/moment of inertia below before being applied. A die this small has
// a tiny mass (~0.04 at the collider's default density), so applying these
// numbers directly as impulses previously produced a resulting velocity
// two orders of magnitude too fast, launching dice clean off the tray.
const EXPLOSION_MIN_SPEED = 3.5
const EXPLOSION_MAX_SPEED = 6
const SPIN_MIN = 10
const SPIN_MAX = 18
// I = (1/6) * m * s^2 for a uniform solid cube of side length s — used to
// convert a target angular velocity into the torque impulse that actually
// produces it, the rotational counterpart of impulse = mass * velocity.
const CUBE_INERTIA_FACTOR = 1 / 6

// A die can coast through a near-zero-velocity instant mid-bounce (e.g. at
// the peak of an arc) without actually being at rest. Requiring the
// velocity to stay under threshold for a sustained window — not just one
// lucky frame — avoids reading that instant as "settled".
const LINEAR_SLEEP_THRESHOLD = 0.05
const ANGULAR_SLEEP_THRESHOLD = 0.08
const SETTLE_HOLD_DURATION = 0.35
// Safety net: force a result even if friction/restitution somehow never
// fully quiet the simulation down (e.g. a die stuck rocking in a corner).
const MAX_ROLL_DURATION = 6

export interface PhysicsRollTarget {
  rollId: number
}

interface PhysicsDice3DProps {
  roll: PhysicsRollTarget | null
  onSettled: (d1: number, d2: number) => void
}

function randomOutwardVelocity(): THREE.Vector3 {
  const angle = Math.random() * Math.PI * 2
  const speed = EXPLOSION_MIN_SPEED + Math.random() * (EXPLOSION_MAX_SPEED - EXPLOSION_MIN_SPEED)
  return new THREE.Vector3(Math.cos(angle) * speed, 0, Math.sin(angle) * speed)
}

function randomSpinVelocity(): THREE.Vector3 {
  const sign = () => (Math.random() < 0.5 ? -1 : 1)
  return new THREE.Vector3(
    (SPIN_MIN + Math.random() * (SPIN_MAX - SPIN_MIN)) * sign(),
    (SPIN_MIN + Math.random() * (SPIN_MAX - SPIN_MIN)) * sign(),
    (SPIN_MIN + Math.random() * (SPIN_MAX - SPIN_MIN)) * sign(),
  )
}

// Real Rapier simulation for whoever is actually rolling: two dynamic
// RigidBody dice with box colliders sized to DIE_SIZE, thrown into a static
// floor+walls tray with a random impulse and torque, left to gravity,
// friction and restitution. Once both dice hold still for a sustained
// window, the settled face is read straight off each body's own rotation
// via faceValueFromQuaternion — nothing here decides or steers the outcome.
export function PhysicsDice3D({ roll, onSettled }: PhysicsDice3DProps) {
  const bodyRefs = [useRef<RapierRigidBody>(null), useRef<RapierRigidBody>(null)]
  const lastRollId = useRef<number | null>(null)
  const hasThrown = useRef(false)
  const settledFired = useRef(true)
  const quietElapsed = useRef(0)
  const totalElapsed = useRef(0)
  const scratchQuat = useRef(new THREE.Quaternion())

  useEffect(() => {
    if (!roll || roll.rollId === lastRollId.current) return
    lastRollId.current = roll.rollId
    hasThrown.current = true
    settledFired.current = false
    quietElapsed.current = 0
    totalElapsed.current = 0

    bodyRefs.forEach((ref, i) => {
      const body = ref.current
      if (!body) return

      // Spawn dead-center on the board, mirroring Dice3D's spawn spread —
      // a small per-die jitter around the same origin the burst explodes
      // outward from.
      const spawnX = (Math.random() - 0.5) * 0.3 + (i === 0 ? -0.3 : 0.3)
      const spawnZ = (Math.random() - 0.5) * 0.3
      const spawnY = FLOOR_TOP_Y + 1.5 + Math.random() * 0.6

      body.setTranslation({ x: spawnX, y: spawnY, z: spawnZ }, true)
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)

      // impulse = mass * Δvelocity, torqueImpulse = I * ΔangularVelocity —
      // scaling the target velocities by the body's own (density-derived)
      // mass/inertia is what makes the resulting motion match those
      // target speeds regardless of how heavy Rapier considers this die.
      const mass = body.mass()
      const momentOfInertia = CUBE_INERTIA_FACTOR * mass * DIE_SIZE * DIE_SIZE
      body.applyImpulse(randomOutwardVelocity().multiplyScalar(mass), true)
      body.applyTorqueImpulse(randomSpinVelocity().multiplyScalar(momentOfInertia), true)
    })
    // Only re-run when a genuinely new roll comes in — body refs are
    // stable across re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll?.rollId])

  useFrame((_, delta) => {
    if (!hasThrown.current || settledFired.current) return
    const dt = Math.min(delta, 1 / 30)
    totalElapsed.current += dt

    let allQuiet = true
    for (const ref of bodyRefs) {
      const body = ref.current
      if (!body) {
        allQuiet = false
        continue
      }
      const lv = body.linvel()
      const av = body.angvel()
      const linSpeed = Math.hypot(lv.x, lv.y, lv.z)
      const angSpeed = Math.hypot(av.x, av.y, av.z)
      if (linSpeed > LINEAR_SLEEP_THRESHOLD || angSpeed > ANGULAR_SLEEP_THRESHOLD) {
        allQuiet = false
      }
    }

    quietElapsed.current = allQuiet ? quietElapsed.current + dt : 0

    const forceSettle = totalElapsed.current > MAX_ROLL_DURATION
    if (forceSettle || (allQuiet && quietElapsed.current >= SETTLE_HOLD_DURATION)) {
      settledFired.current = true
      const values = bodyRefs.map((ref) => {
        const body = ref.current
        if (!body) return 1
        const r = body.rotation()
        scratchQuat.current.set(r.x, r.y, r.z, r.w)
        return faceValueFromQuaternion(scratchQuat.current)
      })
      onSettled(values[0], values[1])
    }
  })

  if (!roll) return null

  return (
    <Physics gravity={[0, -30, 0]}>
      <RigidBody
        ref={bodyRefs[0]}
        colliders={false}
        restitution={0.4}
        friction={0.5}
        angularDamping={0.15}
        linearDamping={0.05}
        position={[-0.3, FLOOR_TOP_Y + DIE_SIZE / 2, 0]}
      >
        <CuboidCollider args={[DIE_SIZE / 2, DIE_SIZE / 2, DIE_SIZE / 2]} restitution={0.4} friction={0.5} />
        <DieMesh />
      </RigidBody>
      <RigidBody
        ref={bodyRefs[1]}
        colliders={false}
        restitution={0.4}
        friction={0.5}
        angularDamping={0.15}
        linearDamping={0.05}
        position={[0.3, FLOOR_TOP_Y + DIE_SIZE / 2, 0]}
      >
        <CuboidCollider args={[DIE_SIZE / 2, DIE_SIZE / 2, DIE_SIZE / 2]} restitution={0.4} friction={0.5} />
        <DieMesh />
      </RigidBody>

      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[6, 0.5, 6]} friction={0.7} position={[0, FLOOR_TOP_Y - 0.5, (BOUND_Z_MIN + BOUND_Z_MAX) / 2]} />
        <CuboidCollider
          args={[0.1, WALL_HALF_HEIGHT, (BOUND_Z_MAX - BOUND_Z_MIN) / 2 + 0.2]}
          position={[BOUND_X + 0.1, FLOOR_TOP_Y + WALL_HALF_HEIGHT, (BOUND_Z_MIN + BOUND_Z_MAX) / 2]}
        />
        <CuboidCollider
          args={[0.1, WALL_HALF_HEIGHT, (BOUND_Z_MAX - BOUND_Z_MIN) / 2 + 0.2]}
          position={[-BOUND_X - 0.1, FLOOR_TOP_Y + WALL_HALF_HEIGHT, (BOUND_Z_MIN + BOUND_Z_MAX) / 2]}
        />
        <CuboidCollider
          args={[BOUND_X + 0.2, WALL_HALF_HEIGHT, 0.1]}
          position={[0, FLOOR_TOP_Y + WALL_HALF_HEIGHT, BOUND_Z_MAX + 0.1]}
        />
        <CuboidCollider
          args={[BOUND_X + 0.2, WALL_HALF_HEIGHT, 0.1]}
          position={[0, FLOOR_TOP_Y + WALL_HALF_HEIGHT, BOUND_Z_MIN - 0.1]}
        />
      </RigidBody>
    </Physics>
  )
}
