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
// This formula is untouched by the figurine redesign below: every part of
// the new model is built relative to the same BASE reference point
// (localY = -ROBBER_HEIGHT / 2) the old placeholder cylinder's bottom sat
// at, so the clearance above the tile/token stays exactly what it was.
const ROBBER_Y = TILE_HEIGHT / 2 + 0.12 + 0.05 + ROBBER_HEIGHT / 2 + 0.02

// Nudges the figurine off dead-center so it stands beside the number chit
// instead of sitting directly on top of it and hiding it completely — the
// chit stays fully visible (and clickable, once robber-move targeting is
// live) no matter which hex the robber is parked on. Sized to clear the
// chit's own footprint, not just eyeballed: the token disc is
// TOKEN_RADIUS (0.26) and the figurine's own cone base is ROBBER_RADIUS
// (0.22), so anything less than their sum (0.48) still overlaps the chit
// — the old 0.15 left the cone reaching to x=-0.07, deep inside the chit's
// edge. 0.55 clears it with a small visible gap, and (plus the cone's own
// 0.22 reach) stays well inside the hex's own ~0.87-1.0 radius, nowhere
// near the tile edge.
const ROBBER_X_OFFSET = 0.55

// A stylized rogue figurine, built from a handful of low-poly primitives —
// one shared material throughout (ROBBER_MATERIAL), so it reads as a single
// stone/plastic token rather than a painted miniature. Every silhouette cue
// comes from FORM, not color, matching how the game's other pieces (dice,
// chits) stay monochrome and let geometry + sheen do the work.
const BASE_Y = -ROBBER_HEIGHT / 2

const TORSO_HEIGHT = ROBBER_HEIGHT * 0.6
const TORSO_BOTTOM_R = ROBBER_RADIUS
const TORSO_Y = BASE_Y + TORSO_HEIGHT / 2
const TORSO_TOP_Y = BASE_Y + TORSO_HEIGHT

const HEAD_RADIUS = ROBBER_RADIUS * 0.34
const HEAD_Y = TORSO_TOP_Y + HEAD_RADIUS * 0.5

const BRIM_RADIUS = ROBBER_RADIUS * 0.82
const BRIM_HEIGHT = 0.035
const BRIM_Y = HEAD_Y + HEAD_RADIUS * 0.35

const CROWN_HEIGHT = ROBBER_HEIGHT * 0.3
const CROWN_RADIUS = ROBBER_RADIUS * 0.36
// Tilted and nudged off-center for a jaunty, worn-in silhouette rather than
// a perfectly symmetrical hat — echoes the "asymmetrical" note on the sack.
const CROWN_TILT = 0.22
const CROWN_Y = BRIM_Y + BRIM_HEIGHT / 2 + CROWN_HEIGHT / 2 - 0.01

// Loot sack: an icosahedron (inherently low-poly — 20 facets) squashed
// non-uniformly so it reads as a lumpy bundle rather than a gemstone, slung
// to one side and behind the torso at shoulder height.
const SACK_RADIUS = ROBBER_RADIUS * 0.4
const SACK_Y = TORSO_TOP_Y - TORSO_HEIGHT * 0.3
const SACK_X = ROBBER_RADIUS * 0.6
const SACK_Z = -ROBBER_RADIUS * 0.4

function RobberToken({ tile }: { tile: HexTileData }) {
  return (
    <group position={[tile.x + ROBBER_X_OFFSET, ROBBER_Y, tile.z]}>
      {/* Cloak/torso: a tapered cone reads immediately as a hooded, cloaked
          figure — the classic robed-rogue silhouette in a single shape. */}
      <mesh position={[0, TORSO_Y, 0]} material={ROBBER_MATERIAL} castShadow receiveShadow>
        <coneGeometry args={[TORSO_BOTTOM_R, TORSO_HEIGHT, 7]} />
      </mesh>

      {/* Head, tucked just under the hat brim. */}
      <mesh position={[0, HEAD_Y, 0]} material={ROBBER_MATERIAL} castShadow>
        <icosahedronGeometry args={[HEAD_RADIUS, 0]} />
      </mesh>

      {/* Wide-brimmed traveler's hat: a flat disc plus a tilted crown,
          offset off-axis for character instead of a stiff, centered cone. */}
      <mesh position={[0, BRIM_Y, 0]} material={ROBBER_MATERIAL} castShadow>
        <cylinderGeometry args={[BRIM_RADIUS, BRIM_RADIUS * 0.9, BRIM_HEIGHT, 7]} />
      </mesh>
      <mesh
        position={[CROWN_RADIUS * 0.3, CROWN_Y, 0]}
        rotation={[0, 0, CROWN_TILT]}
        material={ROBBER_MATERIAL}
        castShadow
      >
        <coneGeometry args={[CROWN_RADIUS, CROWN_HEIGHT, 6]} />
      </mesh>

      {/* Bundle of stolen loot, slung over one shoulder — asymmetrical
          scale so it reads as a soft, lumpy sack rather than a gem. */}
      <mesh
        position={[SACK_X, SACK_Y, SACK_Z]}
        rotation={[0.3, 0.5, -0.2]}
        scale={[0.95, 1.2, 0.8]}
        material={ROBBER_MATERIAL}
        castShadow
      >
        <icosahedronGeometry args={[SACK_RADIUS, 0]} />
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
