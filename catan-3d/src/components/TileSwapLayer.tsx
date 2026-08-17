import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { TILE_HEIGHT, type HexTileData } from '../data/hexBoard'
import { getTileEdgeOverlay, getTileOverlay } from '../three/hexTerrain'

// Cities & Knights Invention — "Swap 2 number discs of your choice (except
// 2, 6, 8, or 12)." Copies RobberLayer.tsx's per-tile invisible-hitbox
// pattern (confirmed not directly reusable/parametrizable — RobberLayer's
// own props, colors, and single-click-then-done shape are hardcoded to the
// robber) but accumulates 2 clicks instead of 1, and has no token/glow to
// render for "where the robber currently is" — there's no equivalent
// standing piece for a number-swap, just the board tiles themselves.

// Distinct from RobberLayer's ROBBER_HIGHLIGHT_COLOR (a red "this is a
// threat" color) — gold reads as "you can pick this" the same way this
// codebase's other selection affordances (Metropolis pulse, trade
// selection) already use gold.
const SWAP_HOVER_COLOR = '#f2c14e'
// A second, cooler color marks the tile already picked as the FIRST of the
// 2 — distinct from the hover gold so a player can tell "already chosen"
// apart from "hovering, not yet chosen" at a glance.
const SWAP_SELECTED_COLOR = '#4ea8f2'

// CN3087: these 4 numbers can never be part of an Invention swap.
const EXCLUDED_NUMBERS = [2, 6, 8, 12]

// Persistent (not just on-hover) highlight for the tile already picked as
// the first half of the swap — mirrors RobberTileGlow's "always on" role
// below, just with the selection color instead of the threat color.
function TileSwapSelectedGlow({ tile }: { tile: HexTileData }) {
  const glowGeometry = getTileEdgeOverlay(tile.biome, tile.id, 0.06)
  return (
    <group position={[tile.x, TILE_HEIGHT / 2, tile.z]} scale={[0.985, 1, 0.985]}>
      <mesh geometry={glowGeometry}>
        <meshStandardMaterial
          color={SWAP_SELECTED_COLOR}
          emissive={SWAP_SELECTED_COLOR}
          emissiveIntensity={0.9}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

// Same terrain-conforming invisible hitbox + hover-glow pair as
// RobberLayer's RobberTileTarget — see that component's own comment for why
// both use terrain-CONFORMING geometry rather than a flat disc.
function TileSwapTarget({ tile, onSelect }: { tile: HexTileData; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false)

  const pickGeometry = getTileOverlay(tile.biome, tile.id, 0.01)
  const glowGeometry = getTileOverlay(tile.biome, tile.id, 0.016)

  return (
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

      {hovered && (
        <mesh geometry={glowGeometry}>
          <meshStandardMaterial
            color={SWAP_HOVER_COLOR}
            emissive={SWAP_HOVER_COLOR}
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

export interface TileSwapLayerProps {
  tiles: HexTileData[]
  active: boolean
  firstTileId: string | null
  onSelectTile: (tileId: string) => void
}

export function TileSwapLayer({ tiles, active, firstTileId, onSelectTile }: TileSwapLayerProps) {
  if (!active) return null

  return (
    <group>
      {tiles.map((tile) => {
        // Desert (and any other numberless tile) and 2/6/8/12 are never
        // swappable — no hitbox at all, matching RobberTileTarget's own
        // "only render targets for the tiles this mode actually allows"
        // shape (there, every tile qualifies; here, most do but not all).
        if (tile.number == null || EXCLUDED_NUMBERS.includes(tile.number)) return null
        // The tile already picked first is excluded from the SECOND click's
        // eligible set (no self-swap, and prevents re-picking the same tile)
        // — rendered as a persistent selected-glow instead of a click target.
        if (tile.id === firstTileId) return <TileSwapSelectedGlow key={tile.id} tile={tile} />
        return <TileSwapTarget key={tile.id} tile={tile} onSelect={() => onSelectTile(tile.id)} />
      })}
    </group>
  )
}
