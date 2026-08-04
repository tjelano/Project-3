import { Billboard, Text } from '@react-three/drei'
import { TILE_HEIGHT } from '../data/hexBoard'
import { WATER_Y } from '../three/layout'
import type { Port } from '../data/boardGraph'
import { RESOURCE_COLORS, RESOURCE_LABELS } from '../game/types'
import { BRASS_MATERIAL, DOCK_WOOD_MATERIAL, decorMaterial } from '../three/materials'

const GENERIC_PORT_COLOR = '#f2f2f2'
// How far beyond the board edge the dock floats, into the open void.
const DOCK_OFFSET = 0.55

// Deck sits at the tile surface; the stilts run from just under it down past
// the waterline so the pier is visibly founded in the sea rather than hovering.
const STILT_LENGTH = TILE_HEIGHT / 2 - WATER_Y + 0.1
const STILT_POSITIONS: [number, number][] = [
  [-0.06, -0.34],
  [0.06, -0.34],
  [-0.06, 0.02],
  [0.06, 0.02],
]

function portColor(type: Port['type']): string {
  return type === '3:1' ? GENERIC_PORT_COLOR : RESOURCE_COLORS[type]
}

function portLabel(type: Port['type']): string {
  return type === '3:1' ? '3:1 Any' : `2:1 ${RESOURCE_LABELS[type]}`
}

function PortMarker({ port }: { port: Port }) {
  // Matches the rotation convention used throughout the board (HexTile,
  // EdgeSlot, RobberTileTarget): rotation.y = atan2(x, z) maps local +Z to
  // the world direction (x, z) — i.e. straight outward, away from center.
  const outwardAngle = Math.atan2(port.x, port.z)
  const dockX = port.x + Math.sin(outwardAngle) * DOCK_OFFSET
  const dockZ = port.z + Math.cos(outwardAngle) * DOCK_OFFSET
  const color = portColor(port.type)

  return (
    <group position={[dockX, TILE_HEIGHT / 2, dockZ]} rotation={[0, outwardAngle, 0]}>
      {/* Deck: three separate planks with hairline gaps between them. One
          solid box reads as plastic; the gaps are what say "boards". */}
      {[-0.048, 0, 0.048].map((x) => (
        <mesh key={x} position={[x, 0, -0.15]} material={DOCK_WOOD_MATERIAL} castShadow receiveShadow>
          <boxGeometry args={[0.042, 0.028, 0.55]} />
        </mesh>
      ))}

      {/* Structural cross-beams under the deck, carrying it to the stilts. */}
      {[-0.34, 0.02].map((z) => (
        <mesh key={z} position={[0, -0.028, z]} material={DOCK_WOOD_MATERIAL} castShadow receiveShadow>
          <boxGeometry args={[0.17, 0.026, 0.04]} />
        </mesh>
      ))}

      {/* Stilts driven down into the water. Their length is derived from the
          waterline so they always reach it — if the sea level is ever
          retuned, the piers follow instead of dangling. */}
      {STILT_POSITIONS.map(([x, z], i) => (
        <mesh
          key={i}
          position={[x, -0.028 - STILT_LENGTH / 2, z]}
          material={DOCK_WOOD_MATERIAL}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.014, 0.016, STILT_LENGTH, 6]} />
        </mesh>
      ))}

      {/* flag pole */}
      <mesh position={[0, 0.21, 0.12]} material={BRASS_MATERIAL} castShadow>
        <cylinderGeometry args={[0.011, 0.013, 0.42, 12]} />
      </mesh>
      {/* Finial — a small brass ball caps the pole rather than a raw cut. */}
      <mesh position={[0, 0.425, 0.12]} material={BRASS_MATERIAL} castShadow>
        <sphereGeometry args={[0.019, 8, 6]} />
      </mesh>

      {/* Flag in two folded segments: the second panel is angled back from
          the first, so the pennant reads as caught in the wind while staying
          completely static — no per-frame cost across nine ports. */}
      <group position={[0.012, 0.335, 0.12]}>
        <mesh position={[0.037, 0, 0.006]} material={decorMaterial(color)} castShadow>
          <boxGeometry args={[0.075, 0.085, 0.011]} />
        </mesh>
        <mesh
          position={[0.104, -0.004, 0.021]}
          rotation={[0, -0.42, 0.05]}
          material={decorMaterial(color)}
          castShadow
        >
          <boxGeometry args={[0.062, 0.073, 0.011]} />
        </mesh>
      </group>
      {/* floating rate badge — always faces the camera so it's readable
          from any orbit angle */}
      <Billboard position={[0, 0.55, 0.12]}>
        <mesh position={[0, 0, -0.01]}>
          <planeGeometry args={[0.5, 0.16]} />
          <meshBasicMaterial color="#0b1220" transparent opacity={0.72} />
        </mesh>
        <Text
          fontSize={0.1}
          color={color}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.006}
          outlineColor="#0b1220"
          // troika-three-text's WebGL glyph-atlas generator (generateSDF_GL)
          // hard-requires ANGLE_instanced_arrays. Brave's anti-fingerprinting
          // WebGL hardening can report that extension as unavailable even on
          // a GPU that supports it, and troika's own JS-worker fallback for
          // that failure path throws too — an uncaught rejection that broke
          // every Text glyph on the board. Forcing the worker-thread SDF
          // path from the start skips WebGL for glyph generation entirely.
          //
          // Drei's TextProps typing predates this troika instance property,
          // so it isn't in the .d.ts even though Text.js forwards it at
          // runtime — cast narrowly here rather than widen drei's types.
          {...({ gpuAccelerateSDF: false } as Record<string, unknown>)}
        >
          {portLabel(port.type)}
        </Text>
      </Billboard>
    </group>
  )
}

export function PortMarkers({ ports }: { ports: Port[] }) {
  return (
    <group>
      {ports.map((port) => (
        <PortMarker key={port.id} port={port} />
      ))}
    </group>
  )
}
