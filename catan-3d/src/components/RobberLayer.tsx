import { useState } from 'react'
import { useGLTF } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { TILE_HEIGHT, type HexTileData } from '../data/hexBoard'
import { getTileEdgeOverlay, getTileOverlay } from '../three/hexTerrain'
import { useClonedModel } from '../hooks/useClonedModel'
import { ModelErrorBoundary } from './ModelErrorBoundary'
import robberModelUrl from '../assets/models/robber-figurine-v2.glb'

const ROBBER_HIGHLIGHT_COLOR = '#d64545'

// The model's own bounding box is ~symmetric around its local origin
// (roughly ±0.95 on its tall axis, measured via gltf-transform inspect —
// nearly identical to the previous robber-figurine.glb's own ±0.9515,
// despite being an unrelated export) — Meshy centres a model on its
// bounding box, not on its feet, so local y=0 lands at chest height
// rather than the ground. ROBBER_Y below already accounts for that by
// adding the scaled half-height on top of the stand height, so the
// primitive itself needs no further offset — its OWN y=0 (chest height)
// sits at the outer group's origin, and the outer group's origin is
// already placed half a (scaled) model-height above the stand surface.
const ROBBER_MODEL_HALF_HEIGHT = 0.9512
const ROBBER_SCALE = 0.23

// Sits above where a number token would be, so it visually stacks on top —
// matching how the physical robber piece covers the number chit in Catan.
const ROBBER_STAND_Y = TILE_HEIGHT / 2 + 0.12 + 0.05
const ROBBER_Y = ROBBER_STAND_Y + ROBBER_MODEL_HALF_HEIGHT * ROBBER_SCALE

// Nudges the figurine off dead-center so it stands beside the number chit
// instead of sitting directly on top of it and hiding it completely — the
// chit stays fully visible (and clickable, once robber-move targeting is
// live) no matter which hex the robber is parked on. 0.55 clears the
// chit's TOKEN_RADIUS (0.26) with a visible gap and stays well inside the
// hex's own ~0.87-1.0 radius, nowhere near the tile edge.
const ROBBER_X_OFFSET = 0.55

useGLTF.preload(robberModelUrl)

function RobberToken({ tile }: { tile: HexTileData }) {
  const instance = useClonedModel(robberModelUrl)
  return (
    <group position={[tile.x + ROBBER_X_OFFSET, ROBBER_Y, tile.z]}>
      <primitive object={instance} scale={ROBBER_SCALE} />
    </group>
  )
}

// Same terrain-conforming overlay technique as RobberTileTarget's hover
// highlight below, but always on (not just while hovering during a move) —
// the figurine alone can get lost against taller terrain (mountains,
// trees) around it, so the tile itself needs to read as "the robber is
// here" at a glance.
function RobberTileGlow({ tile }: { tile: HexTileData }) {
  const glowGeometry = getTileEdgeOverlay(tile.biome, tile.id, 0.060)
  return (
    <group position={[tile.x, TILE_HEIGHT / 2, tile.z]} scale={[0.985, 1, 0.985]}>
      <mesh geometry={glowGeometry}>
        <meshStandardMaterial
          color={ROBBER_HIGHLIGHT_COLOR}
          emissive={ROBBER_HIGHLIGHT_COLOR}
          emissiveIntensity={0.9}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

function RobberTileTarget({ tile, onSelect }: { tile: HexTileData; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false)

  // Both the hit target and the glow use terrain-CONFORMING geometry rather
  // than a flat disc. A flat overlay at any single height either floats above
  // the raised rim or sinks into the terraces; this hugs every fold. The two
  // are lifted by different amounts so the glow never z-fights the picker.
  const pickGeometry = getTileOverlay(tile.biome, tile.id, 0.01)
  const glowGeometry = getTileOverlay(tile.biome, tile.id, 0.016)

  return (
    // Same origin and scale as the tile mesh in CatanBoard, so terrain-local
    // heights line up exactly.
    <group position={[tile.x, TILE_HEIGHT / 2, tile.z]} scale={[0.985, 1, 0.985]}>
      <mesh
        geometry={pickGeometry}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(false)
        }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          onSelect()
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* hover highlight: a translucent red glow, distinct from the
          cyan/gold build-ghost colors since this is a threat, not a build */}
      {hovered && (
        <mesh geometry={glowGeometry}>
          <meshStandardMaterial
            color={ROBBER_HIGHLIGHT_COLOR}
            emissive={ROBBER_HIGHLIGHT_COLOR}
            emissiveIntensity={0.6}
            transparent
            opacity={0.4}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}

interface RobberLayerProps {
  tiles: HexTileData[]
  robberTileId: string
  isMovingRobber: boolean
  onMoveRobber: (tileId: string) => void
}

export function RobberLayer({ tiles, robberTileId, isMovingRobber, onMoveRobber }: RobberLayerProps) {
  const robberTile = tiles.find((tile) => tile.id === robberTileId)

  return (
    <group>
      {robberTile && <RobberTileGlow tile={robberTile} />}
      {robberTile && (
        <ModelErrorBoundary label="robber figurine">
          <RobberToken tile={robberTile} />
        </ModelErrorBoundary>
      )}
      {isMovingRobber &&
        tiles.map((tile) => <RobberTileTarget key={tile.id} tile={tile} onSelect={() => onMoveRobber(tile.id)} />)}
    </group>
  )
}
