import { useMemo, memo } from 'react'
import { TILE_HEIGHT, type HexTileData } from '../data/hexBoard'
import { getTileTerrain } from '../three/hexTerrain'
import { TILE_MATERIALS } from '../three/materials'
import {
  DesertRocks,
  FieldsWheat,
  ForestTrees,
  HillBumps,
  MountainPeaks,
  NumberToken,
  PastureSheep,
} from './TileDecorations'

// A hair under 1 so neighbouring tiles keep a visible seam. The sculpted
// rim already separates them visually, so this is only insurance against
// z-fighting where two hex edges meet exactly.
const TILE_GAP_SCALE = 0.985

const HexTile = memo(function HexTile({ tile }: { tile: HexTileData }) {
  // The sculpted mesh and its decorations share one cached height field, so
  // every asset on this tile is planted on the same surface.
  const terrain = useMemo(() => getTileTerrain(tile.biome, tile.id), [tile.biome, tile.id])

  return (
    <group position={[tile.x, 0, tile.z]}>
      {/* Local y = 0 in the terrain geometry is the nominal tile top, and the
          prism extends down to -TILE_HEIGHT — so lifting by TILE_HEIGHT/2
          reproduces the original tile footprint exactly, keeping every
          vertex/edge/port coordinate in boardGraph valid. */}
      <mesh
        geometry={terrain.geometry}
        material={TILE_MATERIALS[tile.biome]}
        position={[0, TILE_HEIGHT / 2, 0]}
        scale={[TILE_GAP_SCALE, 1, TILE_GAP_SCALE]}
        castShadow
        receiveShadow
      />

      {/* Decorations report their Y in TERRAIN-LOCAL space (0 = nominal tile
          top), exactly like the geometry above. Mounting them in a group at
          the same offset means a decoration's height can be used verbatim
          from heightAt() with no per-component fudge factor. */}
      <group position={[0, TILE_HEIGHT / 2, 0]}>
        {tile.biome === 'mountains' && <MountainPeaks seed={tile.id} />}
        {tile.biome === 'hills' && <HillBumps seed={tile.id} />}
        {tile.biome === 'forest' && <ForestTrees seed={tile.id} />}
        {tile.biome === 'pasture' && <PastureSheep seed={tile.id} />}
        {tile.biome === 'fields' && <FieldsWheat seed={tile.id} />}
        {tile.biome === 'desert' && <DesertRocks seed={tile.id} />}
        {tile.number !== null && <NumberToken value={tile.number} />}
      </group>
    </group>
  )
})

export const CatanBoard = memo(function CatanBoard({ tiles }: { tiles: HexTileData[] }) {
  return (
    <group>
      {tiles.map((tile) => (
        <HexTile key={tile.id} tile={tile} />
      ))}
    </group>
  )
})
