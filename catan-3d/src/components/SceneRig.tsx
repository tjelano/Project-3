import { useRef, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { seatAngle } from '../three/seating'

/**
 * CINEMATIC RIG — a museum vitrine at dusk.
 *
 * Classic three-point studio lighting, with the ratios chosen for contrast
 * rather than legibility:
 *
 *   KEY   warm, high, camera-right. The only shadow-caster, so the scene
 *         has exactly one unambiguous light direction.
 *   FILL  COOL and weak (~1:5 against key). This is the most important
 *         choice in the rig — an untinted fill produces grey shadows,
 *         which is what "flat prototype" actually looks like. A blue fill
 *         makes every shadow cavity read as coloured depth instead.
 *   RIM   cool-white, low and behind, aimed back at camera. Grazes the
 *         silhouette of every mountain, tree and sheep and lifts it off
 *         the tile behind it.
 *
 * Plus a wide, soft SPOT straight down for the vitrine pool — bright at
 * the island, falling away toward the frame, so the eye is pulled to the
 * board rather than the rim.
 *
 * Ambient is nearly zero on purpose. Fill and IBL do that job with
 * direction and colour; flat ambient would wash out everything above.
 */

const ENABLE_POST_PROCESSING = true

// --- Three-point ratios ---------------------------------------------------
// Toned down from the first pass, which read as harsh daylight rather than a
// gallery. The RATIOS are preserved (key still dominates, fill stays cool and
// weak) — only the absolute levels came down, so the contrast and the coloured
// shadow cavities survive while the glare does not.
const KEY_INTENSITY = 1.75
const FILL_INTENSITY = 0.42
const RIM_INTENSITY = 1.15
const POOL_INTENSITY = 0.95
const AMBIENT_INTENSITY = 0.09

const KEY_COLOR = '#ffe6bd'
const FILL_COLOR = '#5d84cf'
const RIM_COLOR = '#dce9ff'
const POOL_COLOR = '#ffeacd'

// --- Shadows --------------------------------------------------------------
// Softness comes from VSM (set on the Canvas), which blurs the shadow map
// natively. We deliberately do NOT use drei's <SoftShadows>: it monkey-
// patches three's shadowmap fragment chunk for PCSS, and that patch is
// incompatible with three 0.185 — it fails every fragment shader in the
// scene with "VALIDATE_STATUS false". VSM needs no patching.
const SHADOW_BLUR = 6

// --- Post -----------------------------------------------------------------
const AO_RADIUS = 0.45
// Was 1.7, which crushed the sand and terracotta toward black in the cavities.
const AO_INTENSITY = 1.05
// High threshold so bloom catches only true speculars — brass, clearcoat
// glints, snow caps — and never the broad matte tile tops.
// Threshold raised and intensity halved: bloom should be a soft halo on the
// brightest brass and snow, never a veil over the whole board.
const BLOOM_THRESHOLD = 0.96
const BLOOM_INTENSITY = 0.28

// --- Table-seat camera lock -------------------------------------------
// Online matches only: the camera swings to face whoever currently holds
// the turn, a synchronized "spectator" cut every client sees together —
// not each player's own personal seat, which would mean nobody ever
// watches the active player's side of the board.
const CAMERA_SEAT_LERP_RATE = 2.2 // higher = snappier swing between seats
const SEAT_SNAP_EPSILON = 0.002 // radians; below this, stop driving the camera and hand control back

// Shortest signed angular distance from `from` to `to`, wrapped to
// [-PI, PI] — without this, swinging from 350° to 10° would take the long
// way around through 180° instead of the 20° hop through 0°.
function wrapAngleDelta(from: number, to: number): number {
  let delta = (to - from) % (Math.PI * 2)
  if (delta > Math.PI) delta -= Math.PI * 2
  if (delta < -Math.PI) delta += Math.PI * 2
  return delta
}

interface SceneRigProps {
  currentPlayerIndex: number
  playerCount: number
  isOnline: boolean
  controlsRef: RefObject<OrbitControlsImpl | null>
}

export function SceneRig({ currentPlayerIndex, playerCount, isOnline, controlsRef }: SceneRigProps) {
  // Tracks the seat we were last driving toward, so a genuine turn change
  // (not just this component re-rendering) is what arms a new swing.
  const prevPlayerIndexRef = useRef(currentPlayerIndex)
  const transitioningRef = useRef(false)

  useFrame((state, delta) => {
    if (!isOnline || playerCount <= 0) return

    if (currentPlayerIndex !== prevPlayerIndexRef.current) {
      prevPlayerIndexRef.current = currentPlayerIndex
      transitioningRef.current = true
    }
    if (!transitioningRef.current) return

    const camera = state.camera
    // Only azimuth (orbit angle) is driven — radius and height are read
    // fresh from wherever the camera currently is, so the player's own
    // zoom/tilt survives the swing instead of snapping back to a default.
    const horizontalRadius = Math.hypot(camera.position.x, camera.position.z)
    const currentAzimuth = Math.atan2(camera.position.x, camera.position.z)
    const targetAzimuth = seatAngle(currentPlayerIndex, playerCount)

    const angleDelta = wrapAngleDelta(currentAzimuth, targetAzimuth)
    if (Math.abs(angleDelta) < SEAT_SNAP_EPSILON) {
      // Close enough: stop actively driving the camera so OrbitControls'
      // own damping and the player's free dragging take over cleanly.
      transitioningRef.current = false
      return
    }

    const k = 1 - Math.exp(-CAMERA_SEAT_LERP_RATE * delta)
    const nextAzimuth = currentAzimuth + angleDelta * k
    camera.position.x = horizontalRadius * Math.sin(nextAzimuth)
    camera.position.z = horizontalRadius * Math.cos(nextAzimuth)
    // OrbitControls derives its own internal spherical state by reading
    // camera.position relative to its target at the START of update() —
    // it doesn't fight or overwrite this external write, it adopts it.
    controlsRef.current?.update()
  })

  return (
    <>
      <ambientLight intensity={AMBIENT_INTENSITY} color={FILL_COLOR} />

      {/* KEY — the only shadow caster */}
      <directionalLight
        position={[7, 10.5, 5]}
        intensity={KEY_INTENSITY}
        color={KEY_COLOR}
        castShadow
        // The tray is FRAME_OUTER (13.6) across, so its corners sit ~9.6 from
        // the origin — well outside the old +/-7.5 frustum, which is exactly
        // why shadows were being guillotined near the top and bottom rails.
        // 11.5 covers the whole tray with margin for the mountain peaks.
        // Bounded to a standard 2048x2048 (down from 3072) — VSM renders the
        // map twice (depth pass + blur pass), and 3072 pushed that pair past
        // 100MB of VRAM on constrained/integrated GPUs, a plausible trigger
        // for a silently lost WebGL context on some drivers.
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-11.5}
        shadow-camera-right={11.5}
        shadow-camera-top={11.5}
        shadow-camera-bottom={-11.5}
        shadow-camera-near={0.1}
        shadow-camera-far={48}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={SHADOW_BLUR}
        shadow-blurSamples={16}
      />

      {/* FILL — cool, opposite the key, deliberately weak */}
      <directionalLight position={[-8, 3.5, -4]} intensity={FILL_INTENSITY} color={FILL_COLOR} />

      {/* RIM — low and behind, grazing every silhouette */}
      <directionalLight position={[-3.5, 3, -9]} intensity={RIM_INTENSITY} color={RIM_COLOR} />

      {/* Vitrine pool: wide cone, heavy penumbra, no shadow of its own. */}
      <spotLight
        position={[0, 14, 0]}
        angle={0.62}
        penumbra={1}
        decay={0}
        intensity={POOL_INTENSITY}
        color={POOL_COLOR}
      />

      {/* IBL. Built from Lightformer primitives rather than a drei `preset`
          so nothing is fetched from a CDN — the scene lights identically
          offline. This is what the brass inlay and port poles reflect;
          without it, metalness ~1 renders essentially black. */}
      <Environment resolution={256}>
        <Lightformer
          intensity={1.5}
          position={[0, 6, -7]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[14, 8, 1]}
          color="#cfe3ff"
        />
        <Lightformer
          intensity={0.85}
          position={[-7, 2.5, 5]}
          rotation={[0, Math.PI / 4, 0]}
          scale={[9, 5, 1]}
          color="#ffd9a0"
        />
        <Lightformer
          intensity={0.55}
          position={[7, 1.5, -2]}
          rotation={[0, -Math.PI / 3, 0]}
          scale={[9, 5, 1]}
          color="#7aa7ff"
        />
        {/* Narrow strip overhead — reads as a gallery downlight in the
            reflection on the water and the metal. */}
        <Lightformer
          intensity={1.5}
          position={[0, 9, 1]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[2.5, 12, 1]}
          color="#ffffff"
        />
      </Environment>

      {/* Only bites at maximum zoom-out, softening the far frame corners. */}
      <fog attach="fog" args={['#070c16', 24, 52]} />

      {ENABLE_POST_PROCESSING && (
        <EffectComposer multisampling={4} enableNormalPass>
          <N8AO
            aoRadius={AO_RADIUS}
            intensity={AO_INTENSITY}
            distanceFalloff={0.6}
            quality="medium"
            color="#0a1420"
          />
          <Bloom mipmapBlur luminanceThreshold={BLOOM_THRESHOLD} intensity={BLOOM_INTENSITY} />
          <Vignette offset={0.26} darkness={0.55} eskil={false} />
        </EffectComposer>
      )}
    </>
  )
}
