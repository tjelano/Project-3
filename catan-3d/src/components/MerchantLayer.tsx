import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { TILE_HEIGHT, type Biome, type HexTileData } from '../data/hexBoard'
import { getTileEdgeOverlay, getTileOverlay } from '../three/hexTerrain'
import type { Building } from '../game/types'

// Cities & Knights Merchant (Task 13) — "Take control of the merchant
// piece; place it on any land hex next to one of your buildings." Copies
// RobberLayer.tsx's per-tile invisible-hitbox + always-on glow structure
// (confirmed not directly reusable/parametrizable — RobberLayer's own
// props, colors, and single-click-then-done shape are hardcoded to the
// robber, same conclusion TileSwapLayer's own header comment already
// reached for Invention), with 2 differences from that pattern: (a) the
// eligible-tile set is filtered to land hexes adjacent to the PLACING
// player's own buildings, not "every tile" the way RobberLayer allows, and
// (b) a distinct highlight/marker color so a Merchant placement never reads
// as a robber threat or a Metropolis claim.
const MERCHANT_HIGHLIGHT_COLOR = '#3fa9f5'

// Placeholder-first policy (this plan's Global Constraints — placeholder
// art before commissioned art): no bespoke model yet for the Merchant, so
// this reuses the same simple-geometric-marker approach Phase A's
// Metropolis used as ITS placeholder differentiator (components/
// GamePieces.tsx's METROPOLIS_MARKER_COLOR gold cone floated above a city),
// just as its own standalone piece rather than a marker riding on top of
// something else, and recolored distinctly from both the Robber figurine
// (ROBBER_HIGHLIGHT_COLOR '#d64545') and the Metropolis marker
// (METROPOLIS_MARKER_COLOR '#f4c430') so all 3 board pieces stay visually
// unambiguous at a glance.
const MERCHANT_MARKER_COLOR = '#3fa9f5'
const MERCHANT_CONE_RADIUS = 0.14
const MERCHANT_CONE_HEIGHT = 0.36
// Same "sits above where a number token would be" reasoning as RobberLayer's
// own ROBBER_STAND_Y — the piece stands on the tile, not embedded in it.
const MERCHANT_STAND_Y = TILE_HEIGHT / 2 + 0.12 + 0.05
const MERCHANT_Y = MERCHANT_STAND_Y + MERCHANT_CONE_HEIGHT / 2
// Offset to the OPPOSITE side of the tile center from RobberLayer's own
// ROBBER_X_OFFSET (+0.55), so a Merchant sharing a hex with the Robber (both
// pieces can land anywhere, nothing forbids overlap) never fully hides
// either figure — same clear-of-center reasoning, mirrored sign.
const MERCHANT_X_OFFSET = -0.55

function MerchantToken({ tile }: { tile: HexTileData }) {
  return (
    <mesh position={[tile.x + MERCHANT_X_OFFSET, MERCHANT_Y, tile.z]}>
      <coneGeometry args={[MERCHANT_CONE_RADIUS, MERCHANT_CONE_HEIGHT, 6]} />
      <meshStandardMaterial color={MERCHANT_MARKER_COLOR} emissive={MERCHANT_MARKER_COLOR} emissiveIntensity={0.5} />
    </mesh>
  )
}

// Same "always on, not just while hovering" role as RobberLayer's own
// RobberTileGlow — the placeholder marker alone can get lost against taller
// terrain, so the tile itself needs to read as "the Merchant is here" too.
function MerchantTileGlow({ tile }: { tile: HexTileData }) {
  const glowGeometry = getTileEdgeOverlay(tile.biome, tile.id, 0.06)
  return (
    <group position={[tile.x, TILE_HEIGHT / 2, tile.z]} scale={[0.985, 1, 0.985]}>
      <mesh geometry={glowGeometry}>
        <meshStandardMaterial
          color={MERCHANT_HIGHLIGHT_COLOR}
          emissive={MERCHANT_HIGHLIGHT_COLOR}
          emissiveIntensity={0.9}
          transparent
          opacity={0.45}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

// Identical structure to RobberLayer's RobberTileTarget: terrain-conforming
// invisible hitbox plus a hover-only glow, distinct only in its highlight
// color (MERCHANT_HIGHLIGHT_COLOR, a "you can place this" blue, rather than
// the robber's "this is a threat" red).
function MerchantTileTarget({ tile, onSelect }: { tile: HexTileData; onSelect: () => void }) {
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
            color={MERCHANT_HIGHLIGHT_COLOR}
            emissive={MERCHANT_HIGHLIGHT_COLOR}
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

// Forward-compatible land/sea filter. Every Biome value that exists in this
// codebase today (forest/pasture/fields/hills/mountains/desert) is a land
// hex — desert itself is still land, it just produces no resource, so it
// stays eligible for placement even though trading its (nonexistent)
// resource would be moot. There is no 'sea'/'ocean' Biome value yet, so
// this check is a genuine no-op for Phase B; it exists so a future
// Seafarers-style ocean tile has an obvious place to plug in, per this
// task's own brief.
const LAND_BIOMES: Biome[] = ['forest', 'pasture', 'fields', 'hills', 'mountains', 'desert']

function isLandTile(tile: HexTileData): boolean {
  return LAND_BIOMES.includes(tile.biome)
}

// Same "reverse-lookup via vertexTileIds" pattern App.tsx's own
// countAdjacentBiomeHexes (Task 7, Irrigation/Mining) already uses for
// "which hexes touch any of this player's buildings" — here testing
// "touches AT LEAST ONE owned building" rather than counting biome matches.
function isAdjacentToPlayerBuilding(
  tile: HexTileData,
  playerId: number,
  settlements: Record<string, Building>,
  vertexTileIds: Map<string, string[]>,
): boolean {
  for (const [vertexId, building] of Object.entries(settlements)) {
    if (building.ownerId !== playerId) continue
    if ((vertexTileIds.get(vertexId) ?? []).includes(tile.id)) return true
  }
  return false
}

export interface MerchantLayerProps {
  tiles: HexTileData[]
  merchantTileId: string | null
  // Non-null while a placement is active on THIS client's own screen — see
  // App.tsx's pendingMerchantPlacement (local-only, never broadcast, same
  // treatment pendingInventionSwap/pendingDiplomacyRemoval already get).
  // Carries the id of the player DOING the placing, so the eligible-tile
  // filter below checks adjacency against the right player's buildings.
  placingPlayerId: number | null
  settlements: Record<string, Building>
  vertexTileIds: Map<string, string[]>
  onSelectTile: (tileId: string) => void
}

export function MerchantLayer({
  tiles,
  merchantTileId,
  placingPlayerId,
  settlements,
  vertexTileIds,
  onSelectTile,
}: MerchantLayerProps) {
  const merchantTile = tiles.find((tile) => tile.id === merchantTileId)

  return (
    <group>
      {merchantTile && <MerchantTileGlow tile={merchantTile} />}
      {merchantTile && <MerchantToken tile={merchantTile} />}
      {placingPlayerId != null &&
        tiles
          .filter(
            (tile) => isLandTile(tile) && isAdjacentToPlayerBuilding(tile, placingPlayerId, settlements, vertexTileIds),
          )
          .map((tile) => <MerchantTileTarget key={tile.id} tile={tile} onSelect={() => onSelectTile(tile.id)} />)}
    </group>
  )
}
