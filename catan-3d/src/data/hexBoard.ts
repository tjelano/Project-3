export type Biome = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert'

export const BIOME_COLORS: Record<Biome, string> = {
  forest: '#2e7d32',
  pasture: '#a4d65e',
  fields: '#f4c430',
  hills: '#c1682b',
  mountains: '#78909c',
  desert: '#dbc38f',
}

export interface HexTileData {
  id: string
  col: number
  row: number
  x: number
  z: number
  biome: Biome
  number: number | null
}

// Standard Catan board shape: 5 columns of heights 3-4-5-4-3.
const COLUMN_HEIGHTS = [3, 4, 5, 4, 3]

// Flat-top hexagon spacing (radius = center-to-vertex distance).
export const HEX_RADIUS = 1
/**
 * Prism thickness of a tile.
 *
 * Deliberately generous: the island needs enough freeboard for a real swell
 * to roll against it without either overtopping the surface or dropping its
 * troughs below the tile's underside (which would flash a gap beneath the
 * board). At 0.2 the sea had ~0.02 of usable travel; at 0.44 there is room
 * for 0.11 crests AND the tile stays ~57% submerged, which is what gives the
 * coastline a visible cliff instead of a paper edge.
 *
 * Everything vertical derives from this — dice rest height, robber, ports,
 * buildings, tray rim, waterline — so raising it lifts the board coherently.
 */
export const TILE_HEIGHT = 0.44
const COLUMN_SPACING = HEX_RADIUS * 1.5
const ROW_SPACING = HEX_RADIUS * Math.sqrt(3)

// Standard Catan resource counts: 4 forest, 4 pasture, 4 fields, 3 hills,
// 3 mountains, 1 desert — shuffled fresh on every buildHexBoard() call.
const BIOME_POOL: Biome[] = [
  'hills', 'hills', 'hills',
  'forest', 'forest', 'forest', 'forest',
  'pasture', 'pasture', 'pasture', 'pasture',
  'fields', 'fields', 'fields', 'fields',
  'mountains', 'mountains', 'mountains',
  'desert',
]

// Standard Catan number-token distribution: 18 tokens for the 18 non-desert
// tiles (2 and 12 appear once, everything else from 3-11 except 7 twice —
// 7 has no token because it triggers the robber instead). Shuffled fresh on
// every buildHexBoard() call and dealt only to non-desert tiles, so wherever
// the desert lands it's automatically skipped.
const NUMBER_POOL: number[] = [5, 3, 10, 6, 8, 4, 11, 9, 4, 12, 6, 2, 9, 3, 11, 5, 10, 8]

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function buildHexBoard(): HexTileData[] {
  const tiles: HexTileData[] = []
  const biomeSequence = shuffle(BIOME_POOL)
  const numberSequence = shuffle(NUMBER_POOL)
  let biomeIndex = 0
  let numberIndex = 0

  COLUMN_HEIGHTS.forEach((height, col) => {
    const x = (col - 2) * COLUMN_SPACING
    const rowOffset = (height - 1) / 2

    for (let row = 0; row < height; row++) {
      const z = (row - rowOffset) * ROW_SPACING
      const biome = biomeSequence[biomeIndex]
      const number = biome === 'desert' ? null : numberSequence[numberIndex++]

      tiles.push({ id: `${col}-${row}`, col, row, x, z, biome, number })
      biomeIndex++
    }
  })

  return tiles
}
