import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_HEIGHT } from '../data/hexBoard'
import { DieMesh } from './DieMesh'
import { DIE_SIZE, REST_EULER } from '../three/dieFaces'

const REST_Y = TILE_HEIGHT / 2 + DIE_SIZE / 2 + 0.02

// Dice now spawn dead-center on the board (X=0, Z=0) and explode outward
// from there — see the throw-setup effect below. The boundary box has to
// be centered on the origin to match: the hex island itself spans roughly
// this range and has always rendered fully in frame throughout this
// project (every board screenshot shows it uncropped), so bouncing dice
// back within it keeps them safely inside the camera's frustum no matter
// which direction they launch toward.
const BOUND_X = 2.4
const BOUND_Z_MIN = -2.3
const BOUND_Z_MAX = 2.8
const BOUNCE_DAMPING = 0.55

// Real per-axis physics for the tumble: a single, constant friction/gravity
// law for the entire phase (no mode-switching partway through), so there is
// never a moment where one force abruptly replaces another. Everything
// simply decays until it's negligible.
const LINEAR_FRICTION = 3.2 // per-second decay rate for horizontal velocity
const ANGULAR_DECAY_K = 4.2 // exponential decay constant for angular spin
const GRAVITY = 30 // downward acceleration driving the vertical bounce
const BOUNCE_RESTITUTION = 0.45 // fraction of vertical speed kept per bounce
const MIN_BOUNCE_SPEED = 0.6 // below this, the die stops bouncing for good
const EXPLOSION_MIN_SPEED = 4 // outward launch speed range from the center
const EXPLOSION_MAX_SPEED = 8

const TUMBLE_DURATION = 1.3
const TOTAL_DURATION = TUMBLE_DURATION

// Total angle a spin of initial speed `s` accumulates over the whole tumble,
// given exponential decay s(t) = s * e^(-k*t): the closed-form integral
// ∫₀ᵀ s·e^(-k·t) dt = s·(1 − e^(−k·T)) / k. This is a pure function of the
// chosen speed and the fixed duration/decay constant — NOT of how many
// frames actually render or how long each one takes — so it can be computed
// once, up front, before the animation ever plays a single frame.
const TOTAL_DECAY_FACTOR = (1 - Math.exp(-ANGULAR_DECAY_K * TUMBLE_DURATION)) / ANGULAR_DECAY_K

interface DieAnimState {
  elapsed: number
  velX: number
  velY: number
  velZ: number
  // Fixed per-axis spin speed for this roll, and the starting Euler angles
  // that pre-compensate for exactly the rotation that speed will
  // accumulate — together these make the tumble land on the target face
  // with no correction needed afterward.
  spinSpeed: THREE.Vector3
  initialEuler: THREE.Vector3
}

function randomSpinSpeed(): THREE.Vector3 {
  const sign = () => (Math.random() < 0.5 ? -1 : 1)
  return new THREE.Vector3(
    (8 + Math.random() * 6) * sign(),
    (8 + Math.random() * 6) * sign(),
    (8 + Math.random() * 6) * sign(),
  )
}

// A random direction in the full circle around the center, at a strong
// random speed — the "kinetic explosion" launch. No aim point, no target:
// just a burst outward, with friction and the boundary bounce taking it
// from there.
function randomOutwardVelocity() {
  const angle = Math.random() * Math.PI * 2
  const speed = EXPLOSION_MIN_SPEED + Math.random() * (EXPLOSION_MAX_SPEED - EXPLOSION_MIN_SPEED)
  return { velX: Math.cos(angle) * speed, velZ: Math.sin(angle) * speed }
}

function createRestingAnim(): DieAnimState {
  return {
    elapsed: TOTAL_DURATION,
    velX: 0,
    velY: 0,
    velZ: 0,
    spinSpeed: new THREE.Vector3(),
    initialEuler: new THREE.Vector3(),
  }
}

export interface DiceRollTarget {
  d1: number
  d2: number
  rollId: number
}

interface Dice3DProps {
  roll: DiceRollTarget | null
  onSettled: () => void
}

// Scripted roll with real per-axis tumble physics (friction-decayed
// horizontal velocity, gravity-driven vertical bounce, friction-decayed
// spin) and no separate "settle" stage bolted on afterward. The trick that
// makes this land exactly on the predetermined face (generated up front in
// App.tsx — this component just has to depict it convincingly): the spin's
// decay curve is a closed-form function of time, so the TOTAL rotation each
// axis will accumulate over the whole tumble is known before the animation
// ever starts. The die's starting orientation is pre-biased backward by
// exactly that amount, so as the same decaying spin plays forward, it
// arrives precisely on the target the moment the tumble ends — with zero
// angular velocity, since that's exactly when the spin has decayed away.
// No slerp, no corrective snap: the face is already right.
export function Dice3D({ roll, onSettled }: Dice3DProps) {
  const groupRefs = [useRef<THREE.Group>(null), useRef<THREE.Group>(null)]
  const animsRef = useRef<DieAnimState[]>([createRestingAnim(), createRestingAnim()])
  const settledFired = useRef(true)
  const lastRollId = useRef<number | null>(null)

  useEffect(() => {
    if (!roll || roll.rollId === lastRollId.current) return
    lastRollId.current = roll.rollId
    settledFired.current = false

    const values = [roll.d1, roll.d2]
    values.forEach((value, i) => {
      const anim = animsRef.current[i]
      // Spawn dead-center on the board — a small jitter keeps the two dice
      // from starting exactly coincident, but both are still, in effect,
      // "the center."
      const spawnX = (Math.random() - 0.5) * 0.3
      const spawnZ = (Math.random() - 0.5) * 0.3

      anim.elapsed = 0
      anim.velY = 0

      // Kinetic explosion: a strong burst outward in a random direction,
      // as if thrown from the center toward the coasts. Friction and the
      // boundary bounce take it from there — nothing is aimed anywhere.
      const burst = randomOutwardVelocity()
      anim.velX = burst.velX
      anim.velZ = burst.velZ

      // Pre-orient the target face: choose the spin, work out exactly how
      // much rotation it will accumulate by the end of the tumble, and set
      // the STARTING orientation that many degrees "before" the target.
      anim.spinSpeed = randomSpinSpeed()
      const [targetX, targetY, targetZ] = REST_EULER[value]
      anim.initialEuler.set(
        targetX - anim.spinSpeed.x * TOTAL_DECAY_FACTOR,
        targetY - anim.spinSpeed.y * TOTAL_DECAY_FACTOR,
        targetZ - anim.spinSpeed.z * TOTAL_DECAY_FACTOR,
      )

      const group = groupRefs[i].current
      if (group) {
        group.position.set(spawnX, 1.5 + Math.random() * 0.6, spawnZ)
        group.rotation.set(anim.initialEuler.x, anim.initialEuler.y, anim.initialEuler.z)
      }
    })
    // Only re-run when a genuinely new roll comes in — group refs are
    // stable and roll.d1/d2 are tied 1:1 to rollId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll?.rollId])

  // react-three-fiber's idiomatic per-frame animation pattern: mutate
  // Three.js objects held via refs directly inside useFrame, bypassing
  // React's render cycle entirely so 60fps updates don't trigger 60fps
  // re-renders. react-hooks/immutability doesn't recognize this as the same
  // category of legitimate imperative escape hatch as ref.current mutation
  // — same reasoning applies in PhysicsDice3D.tsx and Ocean.tsx.
  /* eslint-disable react-hooks/immutability */
  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    let restingCount = 0

    for (let i = 0; i < 2; i++) {
      const group = groupRefs[i].current
      const anim = animsRef.current[i]
      if (!group) continue

      if (anim.elapsed >= TOTAL_DURATION) {
        restingCount++
        continue
      }

      anim.elapsed += dt
      const t = Math.min(anim.elapsed, TUMBLE_DURATION)

      // Rotation: a pure function of elapsed time, not an iterated state —
      // frame-rate independent, and guaranteed by the pre-orientation above
      // to reach exactly the target Euler angles once t reaches
      // TUMBLE_DURATION. Once that happens this keeps recomputing the same
      // exact value every frame, so the die simply holds still — no
      // separate settle branch, no slerp, nothing left to snap.
      const decay = (1 - Math.exp(-ANGULAR_DECAY_K * t)) / ANGULAR_DECAY_K
      group.rotation.set(
        anim.initialEuler.x + anim.spinSpeed.x * decay,
        anim.initialEuler.y + anim.spinSpeed.y * decay,
        anim.initialEuler.z + anim.spinSpeed.z * decay,
      )

      // Horizontal motion: real velocity integration with friction decay
      // plus the invisible boundary-box bounce. No steering anywhere —
      // wherever this naturally stops is the die's rest spot.
      group.position.x += anim.velX * dt
      group.position.z += anim.velZ * dt
      anim.velX *= 1 - Math.min(dt * LINEAR_FRICTION, 0.9)
      anim.velZ *= 1 - Math.min(dt * LINEAR_FRICTION, 0.9)

      if (group.position.x > BOUND_X) {
        group.position.x = BOUND_X
        anim.velX = -Math.abs(anim.velX) * BOUNCE_DAMPING
      } else if (group.position.x < -BOUND_X) {
        group.position.x = -BOUND_X
        anim.velX = Math.abs(anim.velX) * BOUNCE_DAMPING
      }
      if (group.position.z > BOUND_Z_MAX) {
        group.position.z = BOUND_Z_MAX
        anim.velZ = -Math.abs(anim.velZ) * BOUNCE_DAMPING
      } else if (group.position.z < BOUND_Z_MIN) {
        group.position.z = BOUND_Z_MIN
        anim.velZ = Math.abs(anim.velZ) * BOUNCE_DAMPING
      }

      // Vertical motion: real gravity pulling it down and a damped bounce
      // off the ground — the bounce height and rhythm emerge from the
      // physics instead of a pre-baked curve.
      anim.velY -= GRAVITY * dt
      group.position.y += anim.velY * dt
      if (group.position.y <= REST_Y) {
        group.position.y = REST_Y
        anim.velY = Math.abs(anim.velY) > MIN_BOUNCE_SPEED ? -anim.velY * BOUNCE_RESTITUTION : 0
      }

      // Safety net: whatever the random throw parameters produced,
      // guarantee every die is fully at rest for the last sliver of the
      // tumble. By this point friction has already reduced velocity to a
      // faint residual, so this never reads as a cut.
      if (anim.elapsed > TUMBLE_DURATION - 0.12) {
        anim.velX = 0
        anim.velZ = 0
        anim.velY = 0
        group.position.y = REST_Y
      }
    }

    // Mutual dice collision: a cheap X/Z distance check between the two
    // dice, treating each as a bounding sphere the width of a die. This
    // only ever touches velX/velZ and position.x/z — rotation is a pure
    // function of elapsed time computed entirely above, so colliding can
    // never disturb the pre-computed landing face.
    const anim0 = animsRef.current[0]
    const anim1 = animsRef.current[1]
    const group0 = groupRefs[0].current
    const group1 = groupRefs[1].current
    if (group0 && group1 && (anim0.elapsed < TOTAL_DURATION || anim1.elapsed < TOTAL_DURATION)) {
      const dx = group1.position.x - group0.position.x
      const dz = group1.position.z - group0.position.z
      const dist = Math.hypot(dx, dz)
      if (dist < DIE_SIZE && dist > 0.0001) {
        const nx = dx / dist
        const nz = dz / dist

        // Elastic exchange of the velocity component along the collision
        // normal — equal masses, so for a 1D elastic collision the normal
        // components simply swap between the two dice. The tangential
        // component (perpendicular to the normal) is untouched.
        const v0n = anim0.velX * nx + anim0.velZ * nz
        const v1n = anim1.velX * nx + anim1.velZ * nz
        anim0.velX += (v1n - v0n) * nx
        anim0.velZ += (v1n - v0n) * nz
        anim1.velX += (v0n - v1n) * nx
        anim1.velZ += (v0n - v1n) * nz

        // Push apart along the same normal so they don't stay
        // mathematically embedded in one another after the bounce.
        const pushEach = (DIE_SIZE - dist) / 2 + 0.001
        group0.position.x -= nx * pushEach
        group0.position.z -= nz * pushEach
        group1.position.x += nx * pushEach
        group1.position.z += nz * pushEach
      }
    }

    if (restingCount === 2 && !settledFired.current) {
      settledFired.current = true
      onSettled()
    }
  })
  /* eslint-enable react-hooks/immutability */

  if (!roll) return null

  return (
    <group>
      <group ref={groupRefs[0]} position={[-0.3, REST_Y, 0]}>
        <DieMesh />
      </group>
      {/* react-hooks/refs doesn't yet trace a ref reached through array
          indexing back to the plain useRef() call that created it — this is
          the exact same kind of ref as the one directly above. */}
      {/* eslint-disable-next-line react-hooks/refs */}
      <group ref={groupRefs[1]} position={[0.3, REST_Y, 0]}>
        <DieMesh />
      </group>
    </group>
  )
}
