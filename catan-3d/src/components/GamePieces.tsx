import { useGLTF } from '@react-three/drei'
import { useClonedModel } from '../hooks/useClonedModel'
import { ModelErrorBoundary } from './ModelErrorBoundary'
import type { PlayerColorToken } from '../game/types'
import settlementPlayer1Url from '../assets/models/pieces/settlement-player-1.glb'
import settlementPlayer2Url from '../assets/models/pieces/settlement-player-2.glb'
import settlementPlayer3Url from '../assets/models/pieces/settlement-player-3.glb'
import settlementPlayer4Url from '../assets/models/pieces/settlement-player-4.glb'
import settlementPlayer5Url from '../assets/models/pieces/settlement-player-5.glb'
import settlementPlayer6Url from '../assets/models/pieces/settlement-player-6.glb'
import cityPlayer1Url from '../assets/models/pieces/settlement-city-player-1.glb'
import cityPlayer2Url from '../assets/models/pieces/settlement-city-player-2.glb'
import cityPlayer3Url from '../assets/models/pieces/settlement-city-player-3.glb'
import cityPlayer4Url from '../assets/models/pieces/settlement-city-player-4.glb'
import cityPlayer5Url from '../assets/models/pieces/settlement-city-player-5.glb'
import cityPlayer6Url from '../assets/models/pieces/settlement-city-player-6.glb'
import roadPlayer1Url from '../assets/models/pieces/road-player-1.glb'
import roadPlayer2Url from '../assets/models/pieces/road-player-2.glb'
import roadPlayer3Url from '../assets/models/pieces/road-player-3.glb'
import roadPlayer4Url from '../assets/models/pieces/road-player-4.glb'
import roadPlayer5Url from '../assets/models/pieces/road-player-5.glb'
import roadPlayer6Url from '../assets/models/pieces/road-player-6.glb'

/**
 * Authored miniatures for the player-built pieces. Each piece type is the
 * SAME model in all six variants (identical geometry, verified via
 * gltf-transform inspect — every colour's bounding box matches exactly) —
 * only the roof material differs, baked into the GLB itself. There's no
 * runtime tinting step anymore: the correct pre-textured file is loaded
 * directly for a piece's owner colour.
 */

const SETTLEMENT_URLS: Record<PlayerColorToken, string> = {
  'player-1': settlementPlayer1Url,
  'player-2': settlementPlayer2Url,
  'player-3': settlementPlayer3Url,
  'player-4': settlementPlayer4Url,
  'player-5': settlementPlayer5Url,
  'player-6': settlementPlayer6Url,
}
const CITY_URLS: Record<PlayerColorToken, string> = {
  'player-1': cityPlayer1Url,
  'player-2': cityPlayer2Url,
  'player-3': cityPlayer3Url,
  'player-4': cityPlayer4Url,
  'player-5': cityPlayer5Url,
  'player-6': cityPlayer6Url,
}
const ROAD_URLS: Record<PlayerColorToken, string> = {
  'player-1': roadPlayer1Url,
  'player-2': roadPlayer2Url,
  'player-3': roadPlayer3Url,
  'player-4': roadPlayer4Url,
  'player-5': roadPlayer5Url,
  'player-6': roadPlayer6Url,
}

for (const url of Object.values(SETTLEMENT_URLS)) useGLTF.preload(url)
for (const url of Object.values(CITY_URLS)) useGLTF.preload(url)
for (const url of Object.values(ROAD_URLS)) useGLTF.preload(url)

// ---------------------------------------------------------------------------
// SETTLEMENT
//
// bboxMin/Max: [-0.78397, -1, -0.67759] / [0.78397, 1, 0.67759] (identical
// across all six colour variants) — centred on the bounding box, not on its
// feet, so SETTLEMENT_HALF_HEIGHT lifts it to rest ON the group origin
// instead of straddling it. SETTLEMENT_SCALE targets a footprint radius
// (~0.13) in the neighbourhood of BoardInteractions' VERTEX_HITBOX_RADIUS
// (0.16), matching the old procedural piece's size.
// ---------------------------------------------------------------------------
const SETTLEMENT_SCALE = 0.166
const SETTLEMENT_HALF_HEIGHT = 1 * SETTLEMENT_SCALE

// Split out as its own leaf so ModelErrorBoundary (in the exported wrapper
// below) can actually catch a failed useClonedModel call — a boundary can
// only catch throws from its DESCENDANTS' render, not from the parent
// component that renders the boundary itself.
function SettlementMesh({ colorToken }: { colorToken: PlayerColorToken }) {
  const instance = useClonedModel(SETTLEMENT_URLS[colorToken])
  return <primitive object={instance} position={[0, SETTLEMENT_HALF_HEIGHT, 0]} scale={SETTLEMENT_SCALE} />
}

export function SettlementModel({ colorToken }: { colorToken: PlayerColorToken }) {
  return (
    <ModelErrorBoundary label="settlement model">
      <SettlementMesh colorToken={colorToken} />
    </ModelErrorBoundary>
  )
}

// ---------------------------------------------------------------------------
// CITY
//
// bboxMin/Max: [-0.74005, -1, -0.71151] / [0.74005, 1, 0.71151]. Same
// centred-bbox convention as the settlement above. Scaled larger (~0.21
// footprint radius vs settlement's ~0.13) so an upgrade stays legible
// across the table without reading any UI, matching the old procedural
// piece's "deliberately over-scaled" design intent.
// ---------------------------------------------------------------------------
const CITY_SCALE = 0.284
const CITY_HALF_HEIGHT = 1 * CITY_SCALE

// Placeholder-first policy (per this expansion's plan): a Metropolis has no
// bespoke model yet, so it's differentiated from a plain city by scaling the
// SAME pre-textured GLB up and floating a small marker above it. Can't use a
// material tint instead — these GLBs are pre-textured per-color with no
// runtime tinting step (see the file-level comment above).
const METROPOLIS_SCALE_MULTIPLIER = 1.3
const METROPOLIS_MARKER_COLOR = '#f4c430' // gold, matches this UI's existing gold accent elsewhere

function CityMesh({ colorToken, isMetropolis }: { colorToken: PlayerColorToken; isMetropolis: boolean }) {
  const instance = useClonedModel(CITY_URLS[colorToken])
  const scale = isMetropolis ? CITY_SCALE * METROPOLIS_SCALE_MULTIPLIER : CITY_SCALE
  return (
    <group>
      <primitive object={instance} position={[0, CITY_HALF_HEIGHT, 0]} scale={scale} />
      {isMetropolis && (
        // Placeholder marker — a simple floating gold cone, not final art.
        // Swap for real Metropolis geometry in a later pass per this
        // expansion's placeholder-first policy.
        <mesh position={[0, CITY_HALF_HEIGHT * 2 + 0.15, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.08, 0.18, 4]} />
          <meshStandardMaterial color={METROPOLIS_MARKER_COLOR} emissive={METROPOLIS_MARKER_COLOR} emissiveIntensity={0.4} />
        </mesh>
      )}
    </group>
  )
}

export function CityModel({
  colorToken,
  isMetropolis = false,
}: {
  colorToken: PlayerColorToken
  isMetropolis?: boolean
}) {
  return (
    <ModelErrorBoundary label="city model">
      <CityMesh colorToken={colorToken} isMetropolis={isMetropolis} />
    </ModelErrorBoundary>
  )
}

// ---------------------------------------------------------------------------
// ROAD
//
// bboxMin/Max: [-1, -0.39223, -0.19363] / [1, 0.39223, 0.19363]. The only
// piece whose scale is dynamic, not fixed — `span` is the edge's actual
// world-space length, and the model has to stretch to fill it exactly (same
// reasoning as PortMarkers' DOCK_LENGTH_OFFSET: the model's own length has
// to be measured, not guessed). ROAD_NATIVE_LENGTH is the model's own X
// bounding-box span (its long axis); scaling uniformly by
// span/ROAD_NATIVE_LENGTH stretches it to fit without distorting its
// authored cross-section proportions. The model's long axis is local X, but
// EdgeSlot's parent group already rotates local +Z along the edge (see
// BoardInteractions.tsx) — the same axis-swap dock.glb and hills-tile.glb
// needed — so a 90° yaw remaps X onto that Z.
// ---------------------------------------------------------------------------
const ROAD_NATIVE_LENGTH = 2
const ROAD_HALF_HEIGHT_UNSCALED = 0.39223

function RoadMesh({ colorToken, span }: { colorToken: PlayerColorToken; span: number }) {
  const instance = useClonedModel(ROAD_URLS[colorToken])
  const scale = span / ROAD_NATIVE_LENGTH
  return (
    <primitive
      object={instance}
      position={[0, ROAD_HALF_HEIGHT_UNSCALED * scale, 0]}
      rotation={[0, Math.PI / 2, 0]}
      scale={scale}
    />
  )
}

export function RoadModel({ colorToken, span }: { colorToken: PlayerColorToken; span: number }) {
  return (
    <ModelErrorBoundary label="road model">
      <RoadMesh colorToken={colorToken} span={span} />
    </ModelErrorBoundary>
  )
}
