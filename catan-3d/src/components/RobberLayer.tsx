import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { TILE_HEIGHT, type HexTileData } from '../data/hexBoard'
import { getTileOverlay } from '../three/hexTerrain'
import { ROBBER_MATERIAL } from '../three/materials'

const ROBBER_HIGHLIGHT_COLOR = '#d64545'
const ROBBER_RADIUS = 0.22
const ROBBER_HEIGHT = 0.34
// Sits above where a number token would be, so it visually stacks on top —
// matching how the physical robber piece covers the number chit in Catan.
const ROBBER_Y = TILE_HEIGHT / 2 + 0.12 + 0.05 + ROBBER_HEIGHT / 2 + 0.02

function RobberToken({ tile }: { tile: HexTileData }) {
  return (
    <group position={[tile.x, ROBBER_Y, tile.z]}>
      <mesh material={ROBBER_MATERIAL} castShadow receiveShadow>
        <cylinderGeometry args={[ROBBER_RADIUS, ROBBER_RADIUS * 1.15, ROBBER_HEIGHT, 8]} />
      </mesh>
      <mesh position={[0, ROBBER_HEIGHT / 2 + 0.05, 0]} material={ROBBER_MATERIAL} castShadow>
        <sphereGeometry args={[ROBBER_RADIUS * 0.55, 8, 6]} />
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
      {robberTile && <RobberToken tile={robberTile} />}
      {isMovingRobber &&
        tiles.map((tile) => <RobberTileTarget key={tile.id} tile={tile} onSelect={() => onMoveRobber(tile.id)} />)}
    </group>
  )
}
