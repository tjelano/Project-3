import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * Stylized tabletop miniatures for the player-built pieces.
 *
 * Split out of BoardInteractions so that file stays about hit-testing and
 * placement rules while the modelling lives here.
 *
 * Materials are cached per colour: a city alone is ~20 meshes and a full
 * 4-player board can carry 60+ roads, so allocating a material per mesh
 * would put hundreds of redundant instances on the GPU.
 */

const pieceCache = new Map<string, THREE.MeshPhysicalMaterial>()

/** The owner's colour, lacquered — the primary body of every piece. */
function pieceMaterial(color: string): THREE.MeshPhysicalMaterial {
  const cached = pieceCache.get(color)
  if (cached) return cached
  const created = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.45,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    flatShading: true,
  })
  pieceCache.set(color, created)
  return created
}

const shadeCache = new Map<string, THREE.MeshPhysicalMaterial>()

/**
 * A darker shade of the SAME owner colour, used for roofs, trim, timber and
 * doorways. Deriving these from the player's hue instead of using a neutral
 * grey means a piece still scans as "yours" at a glance, while the value
 * contrast gives the silhouette internal detail.
 */
function shadeMaterial(color: string, factor: number, key: string): THREE.MeshPhysicalMaterial {
  const id = color + ':' + key
  const cached = shadeCache.get(id)
  if (cached) return cached
  const created = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color).multiplyScalar(factor),
    roughness: 0.6,
    metalness: 0,
    flatShading: true,
  })
  shadeCache.set(id, created)
  return created
}

// ---------------------------------------------------------------------------
// SETTLEMENT — a European cottage.
//
// The silhouette does the work: walls, then a dual-pitch roof built from two
// slabs that OVERHANG the walls on every side. That overhang, and the ridge
// cap seaming the two pitches, is what separates a cottage from a box with a
// cone on top — a real roof throws a shadow line down onto the wall below.
// ---------------------------------------------------------------------------
const ROOF_PITCH = 0.72 // radians, ~41°: steep enough to read at table scale

export function SettlementModel({ color }: { color: string }) {
  const wall = pieceMaterial(color)
  const roof = shadeMaterial(color, 0.55, 'roof')
  const trim = shadeMaterial(color, 0.32, 'trim')

  return (
    <group>
      <mesh position={[0, 0.065, 0]} material={wall} castShadow receiveShadow>
        <boxGeometry args={[0.2, 0.13, 0.17]} />
      </mesh>

      {/* recessed doorway, sunk into the wall face */}
      <mesh position={[0, 0.042, 0.0852]} material={trim} castShadow>
        <boxGeometry args={[0.05, 0.075, 0.007]} />
      </mesh>

      {/* dual-pitch roof — two overhanging slabs */}
      <mesh
        position={[0, 0.168, 0.052]}
        rotation={[ROOF_PITCH, 0, 0]}
        material={roof}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.235, 0.02, 0.15]} />
      </mesh>
      <mesh
        position={[0, 0.168, -0.052]}
        rotation={[-ROOF_PITCH, 0, 0]}
        material={roof}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[0.235, 0.02, 0.15]} />
      </mesh>

      {/* ridge cap sealing the seam between the pitches */}
      <mesh position={[0, 0.214, 0]} material={trim} castShadow>
        <boxGeometry args={[0.243, 0.018, 0.026]} />
      </mesh>

      <mesh position={[0.062, 0.228, 0.03]} material={trim} castShadow receiveShadow>
        <boxGeometry args={[0.032, 0.085, 0.032]} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// CITY — a fortified twin-tower keep.
//
// Deliberately over-scaled against the cottage: roughly twice the footprint
// and height, so an upgrade is legible across the table without reading any
// UI. Merlons are generated around each tower rim rather than placed by
// hand, which keeps their spacing exact at any radius.
// ---------------------------------------------------------------------------
const MERLONS_PER_TOWER = 8

function CrenellatedTower({
  radius,
  height,
  body,
  trim,
}: {
  radius: number
  height: number
  body: THREE.Material
  trim: THREE.Material
}) {
  const merlons = useMemo(
    () =>
      Array.from({ length: MERLONS_PER_TOWER }, (_, i) => {
        const angle = (i / MERLONS_PER_TOWER) * Math.PI * 2
        return {
          x: Math.cos(angle) * radius * 0.88,
          z: Math.sin(angle) * radius * 0.88,
          angle,
        }
      }),
    [radius],
  )

  return (
    <group>
      {/* Slight taper (wider at the base) reads as load-bearing masonry. */}
      <mesh position={[0, height / 2, 0]} material={body} castShadow receiveShadow>
        <cylinderGeometry args={[radius, radius * 1.12, height, 8]} />
      </mesh>

      {/* parapet ring the battlements stand on */}
      <mesh position={[0, height + 0.012, 0]} material={trim} castShadow receiveShadow>
        <cylinderGeometry args={[radius * 1.16, radius * 1.16, 0.024, 8]} />
      </mesh>

      {merlons.map((m, i) => (
        <mesh
          key={i}
          position={[m.x, height + 0.046, m.z]}
          rotation={[0, -m.angle, 0]}
          material={body}
          castShadow
        >
          <boxGeometry args={[radius * 0.44, 0.044, radius * 0.44]} />
        </mesh>
      ))}
    </group>
  )
}

export function CityModel({ color }: { color: string }) {
  const stone = pieceMaterial(color)
  const trim = shadeMaterial(color, 0.5, 'stone')
  const gate = shadeMaterial(color, 0.3, 'gate')

  return (
    <group>
      <mesh position={[0, 0.032, 0]} material={trim} castShadow receiveShadow>
        <boxGeometry args={[0.32, 0.064, 0.24]} />
      </mesh>

      {/* curtain wall joining the towers */}
      <mesh position={[0, 0.142, 0]} material={stone} castShadow receiveShadow>
        <boxGeometry args={[0.17, 0.155, 0.13]} />
      </mesh>
      <mesh position={[0, 0.228, 0]} material={trim} castShadow>
        <boxGeometry args={[0.182, 0.022, 0.142]} />
      </mesh>

      {/* gatehouse arch */}
      <mesh position={[0, 0.106, 0.0668]} material={gate} castShadow>
        <boxGeometry args={[0.062, 0.09, 0.008]} />
      </mesh>

      {/* Twin towers at uneven heights — the asymmetry is what reads as
          architecture rather than as a symmetrical toy. */}
      <group position={[-0.108, 0.064, 0]}>
        <CrenellatedTower radius={0.062} height={0.3} body={stone} trim={trim} />
      </group>
      <group position={[0.108, 0.064, 0]}>
        <CrenellatedTower radius={0.055} height={0.225} body={stone} trim={trim} />
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// ROAD — a timber log path.
//
// Two rails running the length of the edge with cross-ties beneath them.
// Held to four meshes on purpose: roads are by far the most numerous piece
// (up to 60 on a full 4-player board), so this is the one model where mesh
// count actually matters.
// ---------------------------------------------------------------------------
export function RoadModel({ color, span }: { color: string; span: number }) {
  const rail = pieceMaterial(color)
  const timber = shadeMaterial(color, 0.62, 'timber')

  return (
    <group>
      {[-0.036, 0.036].map((x) => (
        <mesh
          key={x}
          position={[x, 0.055, 0]}
          // The parent group already rotates local +Z along the edge, so
          // tipping the cylinder onto X lays each log down the roadway.
          rotation={[Math.PI / 2, 0, 0]}
          material={rail}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.026, 0.026, span, 6]} />
        </mesh>
      ))}
      {[-0.27, 0.27].map((t) => (
        <mesh key={t} position={[0, 0.028, span * t]} material={timber} castShadow receiveShadow>
          <boxGeometry args={[0.125, 0.03, 0.05]} />
        </mesh>
      ))}
    </group>
  )
}
