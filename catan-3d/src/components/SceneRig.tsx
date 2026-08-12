import { Suspense } from 'react'
import { Environment, Lightformer } from '@react-three/drei'
import { Bloom, EffectComposer, N8AO, Vignette } from '@react-three/postprocessing'
import { FRAME_OUTER } from '../three/layout'

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

// --- Panorama background ---------------------------------------------------
// Drop-in slot, inactive until a real image exists at PANORAMA_URL — flip
// ENABLE_PANORAMA_BACKGROUND once it does. Must be a SEAMLESS 360-degree
// equirectangular panorama (2:1 aspect, horizon at the vertical center);
// a normal single-angle photo will look wrapped/distorted across the sphere.
// Rendered as a SEPARATE <Environment background="only" ...>, deliberately
// apart from the Lightformer-driven <Environment> below — that one still
// drives all IBL reflections (the tuned brass/metal look described in the
// file header) untouched by whatever ends up in the photo. The vitrine's
// dark fog and Vignette (below) were tuned against a black void and will
// likely need retuning once a bright warm room is actually behind it.
const ENABLE_PANORAMA_BACKGROUND = false
const PANORAMA_URL = '/environment/gameroom-panorama.jpg'

export function SceneRig({ outerSize = FRAME_OUTER }: { outerSize?: number }) {
  // Standard: tray is FRAME_OUTER (13.6) across, corners ~9.6 from origin,
  // and 11.5 was tuned to cover that with margin for the mountain peaks —
  // i.e. a margin of 11.5 - 13.6/2 = 4.7 beyond the tray's own half-width.
  // Reapplying that same margin to whatever outerSize actually is keeps
  // bigger boards (Newfoundland/Peanut/custom shapes) from having their
  // shadows guillotined at the frustum edge the way the original fixed
  // 11.5 would for anything wider than standard.
  const shadowExtent = outerSize / 2 + 4.7

  return (
    <>
      <ambientLight intensity={AMBIENT_INTENSITY} color={FILL_COLOR} />

      {/* KEY — the only shadow caster */}
      <directionalLight
        position={[7, 10.5, 5]}
        intensity={KEY_INTENSITY}
        color={KEY_COLOR}
        castShadow
        // Bounded to a standard 2048x2048 (down from 3072) — VSM renders the
        // map twice (depth pass + blur pass), and 3072 pushed that pair past
        // 100MB of VRAM on constrained/integrated GPUs, a plausible trigger
        // for a silently lost WebGL context on some drivers.
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
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

      {ENABLE_PANORAMA_BACKGROUND && (
        <Suspense fallback={null}>
          <Environment files={PANORAMA_URL} background="only" />
        </Suspense>
      )}

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
