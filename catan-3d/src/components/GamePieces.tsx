import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import settlementModelUrl from '../assets/models/settlement.glb'
import cityModelUrl from '../assets/models/settlement-city.glb'
import roadModelUrl from '../assets/models/road.glb'

/**
 * Authored miniatures for the player-built pieces (replacing the earlier
 * procedural geometry). None of the three source GLBs carry a material —
 * gltf-transform inspect confirms "No materials found" for all of them —
 * so there's nothing baked-in to fight: the SAME plain per-color material
 * is applied to the whole (single-mesh) model, the direct GLB equivalent
 * of the old pieceMaterial/shadeMaterial cached-per-colour system.
 */

const pieceCache = new Map<string, THREE.MeshPhysicalMaterial>()

function pieceMaterial(color: string): THREE.MeshPhysicalMaterial {
  const cached = pieceCache.get(color)
  if (cached) return cached
  const created = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.45,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
  })
  pieceCache.set(color, created)
  return created
}

useGLTF.preload(settlementModelUrl)
useGLTF.preload(cityModelUrl)
useGLTF.preload(roadModelUrl)

// useGLTF caches by URL and returns the SAME scene graph on every call;
// cloning is what lets multiple pieces of the same type/colour each have
// their own instance instead of fighting over one shared object's
// transform and material (same pattern as CatanBoard's BiomeTileModel).
function useTintedModel(url: string, color: string) {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const clone = scene.clone()
    const material = pieceMaterial(color)
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return clone
  }, [scene, color])
}

// ---------------------------------------------------------------------------
// SETTLEMENT
//
// The model's own bounding box is ~symmetric around its local origin (like
// every other GLB in this pack) — Meshy centres a model on its bounding
// box, not on its feet — so SETTLEMENT_HALF_HEIGHT lifts it to rest ON the
// group origin instead of straddling it. SETTLEMENT_SCALE targets a
// footprint radius (~0.13) in the neighbourhood of BoardInteractions'
// VERTEX_HITBOX_RADIUS (0.16), matching the old procedural piece's size.
// ---------------------------------------------------------------------------
const SETTLEMENT_SCALE = 0.2
const SETTLEMENT_HALF_HEIGHT = 0.9507 * SETTLEMENT_SCALE

export function SettlementModel({ color }: { color: string }) {
  const instance = useTintedModel(settlementModelUrl, color)
  return <primitive object={instance} position={[0, SETTLEMENT_HALF_HEIGHT, 0]} scale={SETTLEMENT_SCALE} />
}

// ---------------------------------------------------------------------------
// CITY
//
// Same centred-bbox convention as the settlement above. Scaled larger
// (~0.21 footprint radius vs settlement's ~0.13) so an upgrade stays
// legible across the table without reading any UI, matching the old
// procedural piece's "deliberately over-scaled" design intent.
// ---------------------------------------------------------------------------
const CITY_SCALE = 0.4
const CITY_HALF_HEIGHT = 0.9509 * CITY_SCALE

export function CityModel({ color }: { color: string }) {
  const instance = useTintedModel(cityModelUrl, color)
  return <primitive object={instance} position={[0, CITY_HALF_HEIGHT, 0]} scale={CITY_SCALE} />
}

// ---------------------------------------------------------------------------
// ROAD
//
// The only piece whose scale is dynamic, not fixed — `span` is the edge's
// actual world-space length, and the model has to stretch to fill it
// exactly (same reasoning as PortMarkers' DOCK_LENGTH_OFFSET: the model's
// own length has to be measured, not guessed). ROAD_NATIVE_LENGTH is the
// model's own X bounding-box span (its long axis); scaling uniformly by
// span/ROAD_NATIVE_LENGTH stretches it to fit without distorting its
// authored cross-section proportions. The model's long axis is local X,
// but EdgeSlot's parent group already rotates local +Z along the edge (see
// BoardInteractions.tsx) — the same axis-swap dock.glb and hills-tile.glb
// needed — so a 90° yaw remaps X onto that Z.
// ---------------------------------------------------------------------------
const ROAD_NATIVE_LENGTH = 1.80281
const ROAD_HALF_HEIGHT_UNSCALED = 0.37317

export function RoadModel({ color, span }: { color: string; span: number }) {
  const instance = useTintedModel(roadModelUrl, color)
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
