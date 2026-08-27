import { createSeededRandom, shuffle } from '../utils/seededRandom'

export type Biome = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert' | 'sea' | 'gold'

export const BIOME_COLORS: Record<Biome, string> = {
  forest: '#2e7d32',
  pasture: '#a4d65e',
  fields: '#f4c430',
  hills: '#c1682b',
  mountains: '#78909c',
  desert: '#dbc38f',
  sea: '#1e6091',
  gold: '#d4af37',
}

// Edit these directly to move a biome's tile up (higher) or down (lower).
// Each model has a very different amount of its own sculpted geometry
// below its local origin (mountains' base runs nearly 3x deeper than
// fields'), so a single shared elevation value doesn't produce a visually
// level board — these six were measured directly from each GLB's real
// vertex data (a triangle-area-weighted histogram of upward-facing
// surfaces only, which excludes each model's flat underside base plate and
// isolates the actual visible terrain plateau) so every biome's plateau
// starts aligned to brick (hills)'s. Consumed by CatanBoard.tsx for tile +
// number-chit height (the chit rides along automatically since it's nested
// in the same elevation group). Docks are NOT derived from this
// (PortMarkers.tsx anchors them at a fixed TILE_HEIGHT/2) — raising them to
// match would leave them floating above the shoreline instead of resting
// on it.
export const BIOME_ELEVATION: Record<Biome, number> = {
  hills: 0.15,
  mountains: 0.31,
  forest: 0.21,
  desert: 0.245,
  fields: 0.13,
  pasture: 0.12,
  // PLACEHOLDER — not measured from WaterHexTile.glb's real geometry the way
  // the 6 values above were (see this plan's Global Constraints). Sits below
  // every land elevation so water reads as "lower" than the island; verify
  // visually via the dev server once Task 2 wires the model in, and adjust
  // this one constant if it clips or floats.
  sea: 0.05,
  // PLACEHOLDER — gold-tile.glb is real art now, but this value is still
  // fields' own already-measured elevation, carried over from when gold
  // reused fields' model. Not yet measured from gold-tile.glb's own
  // geometry the way the 6 land values above were; verify visually via the
  // dev server and adjust this one constant if it clips or floats (same
  // treatment as sea's own placeholder above).
  gold: 0.13,
}

// Edit this directly to move every settlement/road/hover-ghost up (higher)
// or down (lower) — all of them share this one height (BoardInteractions.tsx).
// A vertex or edge can touch tiles of DIFFERENT biomes/elevations, so
// there's no single tile to derive a "correct" height from; started at
// 0.31 (mountains' own BIOME_ELEVATION, the tallest biome) so nothing
// clips into any tile, at the cost of floating a bit above shorter ones.
export const STRUCTURE_ELEVATION = 0.10

export interface HexTileData {
  id: string
  col: number
  row: number
  x: number
  z: number
  biome: Biome
  number: number | null
}

export type BoardShapeId =
  | 'standard'
  | 'newfoundland'
  | 'peanut'
  | 'bigPeanut'
  | 'apocalypse'
  | 'newIsland'
  | 'northAmerica'
  | 'southAmerica'
  | 'bigBasic'
  | 'seafarersBasic'

// One land hex, addressed in "odd-q" vertical offset coordinates — the
// standard scheme for column-based hex grids. Even columns sit at integer
// multiples of ROW_SPACING; odd columns are shifted down by half a row (see
// cellPosition below). This is what guarantees ANY set of cells — including
// ones a player draws by hand in the board editor (BoardShapeEditor.tsx) —
// assembles into a geometrically valid board with no manual adjacency
// reasoning: two cells are true hex-neighbors exactly when their
// cellPosition() outputs land one hex-step apart, which falls straight out
// of the col/row arithmetic.
export interface BoardCell {
  col: number
  row: number
}

function isOddColumn(col: number): boolean {
  return ((col % 2) + 2) % 2 === 1
}

// The 6 odd-q neighbor coordinates of a cell — exported for
// BoardShapeEditor.tsx's live "is this one connected landmass" check, so a
// player drawing a shape gets warned before saving something assignPorts'
// boundary-walk couldn't handle.
export function cellNeighbors(cell: BoardCell): BoardCell[] {
  const { col, row } = cell
  const diagonalRow = isOddColumn(col) ? row + 1 : row - 1
  return [
    { col, row: row - 1 },
    { col, row: row + 1 },
    { col: col - 1, row },
    { col: col - 1, row: diagonalRow },
    { col: col + 1, row },
    { col: col + 1, row: diagonalRow },
  ]
}

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

// Exported so BoardShapeEditor.tsx's 2D grid can position cells using the
// EXACT same math the real board uses — guarantees "what you clicked" and
// "what renders" can never silently drift apart.
export function cellPosition(cell: BoardCell): { x: number; z: number } {
  return {
    x: cell.col * COLUMN_SPACING,
    z: (cell.row + (isOddColumn(cell.col) ? 0.5 : 0)) * ROW_SPACING,
  }
}

// Authored as column heights (contiguous, centered — easy to write and
// review by hand) and expanded into explicit BoardCell[] below. Newfoundland
// and peanut are INSPIRED by real fan-made Catan maps
// (catancollector.com/maps-scenarios), not reproductions — their specific
// tile content and any special rules (Seafarers ships, gold hexes, the
// Pirate, multi-island layouts, etc.) are deliberately not carried over,
// only a general coastline shape. Kept to adjacent-column height
// differences of at most 1 so each shape stays a single connected landmass
// — the same property assignPorts' boundary-walk depends on.
type ColumnShapeId = 'standard' | 'newfoundland' | 'peanut'

const BUILT_IN_COLUMN_HEIGHTS: Record<ColumnShapeId, number[]> = {
  standard: [3, 4, 5, 4, 3],
  newfoundland: [2, 3, 4, 4, 3, 2, 1],
  peanut: [3, 3, 2, 3, 2, 3, 3],
}

// Expands a column-heights array into explicit, centered cells. Each
// column's row range is centered on z=0 as closely as an INTEGER row start
// allows, given that column's own odd-q parity shift — exact centering
// isn't always achievable (a column's height parity and its position's
// column parity can conflict), so this rounds to the nearest valid integer
// start. That's a purely cosmetic sub-hex nudge, never an adjacency
// correctness issue: every cell still lands on a valid odd-q coordinate, so
// two cells one column and one row-step apart are always true neighbors
// regardless of the rounding.
function columnHeightsToCells(heights: number[]): BoardCell[] {
  const cells: BoardCell[] = []
  const colOffset = (heights.length - 1) / 2
  heights.forEach((height, colIndex) => {
    const col = colIndex - colOffset
    const shift = isOddColumn(col) ? 0.5 : 0
    const rowStart = Math.round(-(height - 1) / 2 - shift)
    for (let i = 0; i < height; i++) {
      cells.push({ col, row: rowStart + i })
    }
  })
  return cells
}

// Every cell topologically adjacent to `landCells` that isn't already part of
// it — a 1-hex-wide ring fully surrounding the given land shape. Used to
// generate the Seafarers board's sea ring algorithmically instead of hand-
// authoring coordinates (see the Seafarers board-foundation plan).
function ringAround(landCells: BoardCell[]): BoardCell[] {
  const landKeys = new Set(landCells.map((c) => `${c.col}-${c.row}`))
  const ring: BoardCell[] = []
  const seenRingKeys = new Set<string>()
  for (const cell of landCells) {
    for (const neighbor of cellNeighbors(cell)) {
      const key = `${neighbor.col}-${neighbor.row}`
      if (landKeys.has(key) || seenRingKeys.has(key)) continue
      seenRingKeys.add(key)
      ring.push(neighbor)
    }
  }
  return ring
}

// Computed once at module scope so both BOARD_SHAPES (the cell list) and
// BIOME_OVERRIDES_BY_SHAPE (the sea-ring/gold pins) below can reference the
// same land/ring cells rather than recomputing them.
const SEAFARERS_BASIC_LAND_CELLS = columnHeightsToCells(BUILT_IN_COLUMN_HEIGHTS.standard)
const SEAFARERS_BASIC_SEA_RING = ringAround(SEAFARERS_BASIC_LAND_CELLS)
const SEAFARERS_BASIC_CELLS = [...SEAFARERS_BASIC_LAND_CELLS, ...SEAFARERS_BASIC_SEA_RING]

// Player-drawn shapes (BoardShapeEditor.tsx), promoted to permanent
// built-ins so every player has them without needing localStorage — cells
// copied verbatim from each shape's saved CustomBoardShape.cells. Each one
// already passed the editor's own "single connected landmass" check at
// save time (that's a save-blocking requirement there), so this doesn't
// re-derive them from a column-heights array the way the 3 originals do.
type PromotedShapeId = 'bigPeanut' | 'apocalypse' | 'newIsland' | 'northAmerica' | 'southAmerica' | 'bigBasic'

const PROMOTED_CUSTOM_SHAPES: Record<PromotedShapeId, BoardCell[]> = {
  bigPeanut: [
    { col: 0, row: 0 }, { col: 0, row: -1 }, { col: 0, row: -2 }, { col: -1, row: -3 }, { col: -2, row: -3 },
    { col: -3, row: -3 }, { col: -4, row: -2 }, { col: -4, row: -1 }, { col: -4, row: 0 }, { col: -3, row: 0 },
    { col: -2, row: 1 }, { col: -1, row: 1 }, { col: -1, row: 2 }, { col: -1, row: 3 }, { col: 0, row: 4 },
    { col: 1, row: 4 }, { col: 2, row: 4 }, { col: 3, row: 3 }, { col: 3, row: 2 }, { col: 3, row: 1 },
    { col: 2, row: 1 }, { col: 1, row: 0 }, { col: -3, row: -1 }, { col: -3, row: -2 }, { col: -2, row: -2 },
    { col: -1, row: -2 }, { col: -2, row: -1 }, { col: -2, row: 0 }, { col: -1, row: -1 }, { col: -1, row: 0 },
    { col: 0, row: 1 }, { col: 0, row: 2 }, { col: 0, row: 3 }, { col: 1, row: 2 }, { col: 1, row: 1 },
    { col: 2, row: 2 }, { col: 2, row: 3 }, { col: 1, row: 3 },
  ],
  apocalypse: [
    { col: 0, row: 0 }, { col: 0, row: -1 }, { col: 0, row: -2 }, { col: 0, row: -3 }, { col: 0, row: 1 },
    { col: 0, row: 2 }, { col: 1, row: 1 }, { col: 2, row: 1 }, { col: 3, row: 0 }, { col: 3, row: -1 },
    { col: 3, row: -2 }, { col: 2, row: -2 }, { col: 1, row: -3 }, { col: -1, row: -3 }, { col: -2, row: -2 },
    { col: -3, row: -2 }, { col: -3, row: -1 }, { col: -3, row: 0 }, { col: -2, row: 1 }, { col: -1, row: 1 },
    { col: -1, row: 0 }, { col: -2, row: 0 }, { col: -2, row: -1 }, { col: -1, row: -2 }, { col: -1, row: -1 },
    { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 1, row: -1 }, { col: 2, row: -1 }, { col: 1, row: -2 },
  ],
  newIsland: [
    { col: 0, row: 0 }, { col: 0, row: -1 }, { col: -1, row: -2 }, { col: -2, row: -2 }, { col: -2, row: -1 },
    { col: -2, row: 0 }, { col: -2, row: 1 }, { col: -2, row: 2 }, { col: -2, row: 3 }, { col: -3, row: 2 },
    { col: -1, row: 1 }, { col: 0, row: 2 }, { col: 0, row: 1 }, { col: -1, row: 0 }, { col: -1, row: -1 },
    { col: 1, row: -1 }, { col: 2, row: 0 }, { col: 3, row: 0 },
  ],
  northAmerica: [
    { col: 0, row: 0 }, { col: 0, row: -1 }, { col: 0, row: -2 }, { col: -1, row: -3 }, { col: -2, row: -3 },
    { col: -3, row: -4 }, { col: -4, row: -3 }, { col: -3, row: -3 }, { col: -3, row: -2 }, { col: -2, row: -1 },
    { col: -2, row: 0 }, { col: -2, row: 1 }, { col: -2, row: 2 }, { col: -1, row: 2 }, { col: -1, row: 3 },
    { col: 0, row: 4 }, { col: 1, row: 4 }, { col: 2, row: 5 }, { col: 2, row: 4 }, { col: 0, row: 3 },
    { col: 0, row: 2 }, { col: 0, row: 1 }, { col: -1, row: 1 }, { col: -1, row: 0 }, { col: -1, row: -1 },
    { col: -1, row: -2 }, { col: -2, row: -2 }, { col: 1, row: 1 }, { col: 2, row: 2 }, { col: 3, row: 2 },
    { col: 2, row: 1 }, { col: 1, row: 0 }, { col: 1, row: -1 }, { col: 2, row: 0 }, { col: 2, row: -1 },
    { col: 2, row: -2 }, { col: 3, row: -2 }, { col: 3, row: -1 },
  ],
  southAmerica: [
    { col: 0, row: 0 }, { col: 0, row: -1 }, { col: 0, row: -2 }, { col: 0, row: -3 }, { col: -1, row: -4 },
    { col: -2, row: -3 }, { col: -2, row: -2 }, { col: -2, row: -1 }, { col: -1, row: -1 }, { col: -1, row: 0 },
    { col: -1, row: 1 }, { col: -1, row: 2 }, { col: -1, row: 3 }, { col: -1, row: 4 }, { col: 0, row: 3 },
    { col: 0, row: 2 }, { col: 0, row: 1 }, { col: -1, row: -2 }, { col: -1, row: -3 }, { col: 1, row: -3 },
    { col: 2, row: -2 }, { col: 3, row: -2 }, { col: 3, row: -1 }, { col: 2, row: -1 }, { col: 1, row: -2 },
    { col: 1, row: -1 }, { col: 2, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 },
  ],
  bigBasic: [
    { col: 0, row: 0 }, { col: 0, row: -1 }, { col: 0, row: -2 }, { col: 0, row: -3 }, { col: 0, row: -4 },
    { col: 0, row: 1 }, { col: 0, row: 2 }, { col: 0, row: 3 }, { col: 1, row: 2 }, { col: 2, row: 2 },
    { col: 3, row: 1 }, { col: -1, row: 2 }, { col: -2, row: 2 }, { col: -3, row: 1 }, { col: -3, row: 0 },
    { col: -3, row: -1 }, { col: -3, row: -2 }, { col: -3, row: -3 }, { col: -2, row: -3 }, { col: -1, row: -4 },
    { col: 1, row: -4 }, { col: 2, row: -3 }, { col: 3, row: -3 }, { col: 3, row: -2 }, { col: 3, row: -1 },
    { col: 3, row: 0 }, { col: 2, row: 1 }, { col: 1, row: 1 }, { col: 1, row: 0 }, { col: 1, row: -1 },
    { col: 1, row: -2 }, { col: 1, row: -3 }, { col: 2, row: -2 }, { col: 2, row: -1 }, { col: 2, row: 0 },
    { col: -2, row: 1 }, { col: -1, row: 1 }, { col: -1, row: 0 }, { col: -2, row: 0 }, { col: -1, row: -1 },
    { col: -2, row: -1 }, { col: -1, row: -2 }, { col: -2, row: -2 }, { col: -1, row: -3 },
  ],
}

// Desert count for these 4 was requested explicitly (not derived from
// desertCountFor's automatic ~1-per-19-tiles ratio, which would give
// bigPeanut/southAmerica the same count coincidentally but undershoots
// northAmerica and bigBasic) — kept as an explicit override rather than
// relying on that coincidence so intent survives even if a shape's cell
// list ever changes. apocalypse/newIsland were never given an explicit
// count, so they fall through to the automatic ratio like any other shape.
const DESERT_COUNT_OVERRIDES: Partial<Record<BoardShapeId, number>> = {
  bigPeanut: 2,
  northAmerica: 3,
  southAmerica: 2,
  bigBasic: 4,
}

// Mirrors DESERT_COUNT_OVERRIDES's own pattern — per-shape pinned biomes for
// built-in shapes, applied by buildHexBoard below alongside the existing
// custom-editor override path, not replacing it.
const BIOME_OVERRIDES_BY_SHAPE: Partial<Record<BoardShapeId, Record<string, Biome>>> = {
  seafarersBasic: {
    ...Object.fromEntries(SEAFARERS_BASIC_SEA_RING.map((c) => [`${c.col}-${c.row}`, 'sea' as const])),
    // 2 land cells pinned to gold, chosen from opposite ends of standard's
    // own 5-column layout so they sit spread apart rather than adjacent.
    // Verified by hand-tracing columnHeightsToCells([3,4,5,4,3]): column -2
    // (colIndex 0, height 3, even column so shift=0) gets rowStart =
    // round(-(3-1)/2) = -1, producing rows [-1,0,1] — so '-2--1' (col -2,
    // row -1) is a real cell. Column 2 (colIndex 4, height 3) is symmetric,
    // same rows [-1,0,1] — so '2-1' (col 2, row 1) is a real cell too. Both
    // keys use the exact `${cell.col}-${cell.row}` format buildHexBoardFromCells
    // itself looks up overrides by.
    '-2--1': 'gold',
    '2-1': 'gold',
  },
}

const BOARD_SHAPES: Record<BoardShapeId, BoardCell[]> = {
  ...(Object.fromEntries(
    Object.entries(BUILT_IN_COLUMN_HEIGHTS).map(([id, heights]) => [id, columnHeightsToCells(heights)]),
  ) as Record<ColumnShapeId, BoardCell[]>),
  ...PROMOTED_CUSTOM_SHAPES,
  seafarersBasic: SEAFARERS_BASIC_CELLS,
}

// Standard Catan resource RATIO: 4 forest, 4 pasture, 4 fields, 3 hills,
// 3 mountains per 18 non-desert tiles, always exactly 1 desert. Every board
// shape scales this same ratio to its own tile count via
// allocateProportional's largest-remainder rounding — plugging in the
// standard board's own 18 reproduces exactly [4,4,4,3,3] with no rounding
// drift, which is what makes this a strict generalization rather than a
// behavior change for the existing board.
const BIOME_WEIGHTS: Record<Exclude<Biome, 'desert' | 'sea' | 'gold'>, number> = {
  forest: 4,
  pasture: 4,
  fields: 4,
  hills: 3,
  mountains: 3,
}

// Largest-remainder apportionment: split `total` across `weights` as close
// to their exact proportions as an integer count allows, giving the leftover
// unit(s) to whichever category's rounded-down count is furthest below its
// true share. Standard rounding (round-half-up per category independently)
// can't guarantee the parts sum to `total` at all; this always does.
function allocateProportional<K extends string>(weights: Record<K, number>, total: number): Record<K, number> {
  const entries = Object.entries(weights) as [K, number][]
  const sumWeights = entries.reduce((sum, [, weight]) => sum + weight, 0)
  const exact = entries.map(([key, weight]) => [key, (weight * total) / sumWeights] as const)

  const result = {} as Record<K, number>
  let allocated = 0
  for (const [key, value] of exact) {
    const floor = Math.floor(value)
    result[key] = floor
    allocated += floor
  }

  const remainders = exact
    .map(([key, value]) => [key, value - result[key]] as const)
    .sort((a, b) => b[1] - a[1])
  for (let i = 0; allocated < total; i++, allocated++) {
    result[remainders[i % remainders.length][0]] += 1
  }
  return result
}

// Standard's own ratio is 1 desert per 19 tiles — scaling that same ratio
// to a bigger board (rather than staying hardcoded at exactly 1) is what
// keeps a sprawling custom BoardShapeEditor.tsx shape from reading as
// "standard, but stretched" with a single lonely desert lost in a much
// bigger island. Never below 1 — every board needs at least one tile for
// the robber to start on.
function desertCountFor(tileCount: number): number {
  return Math.max(1, Math.round(tileCount / 19))
}

function buildBiomePool(tileCount: number, desertCount: number): Biome[] {
  const nonDesertCount = tileCount - desertCount
  const counts = allocateProportional(BIOME_WEIGHTS, nonDesertCount)
  const pool: Biome[] = new Array(desertCount).fill('desert')
  for (const [biome, count] of Object.entries(counts) as [Biome, number][]) {
    for (let i = 0; i < count; i++) pool.push(biome)
  }
  return pool
}

// Standard Catan number-token distribution: every number 3-11 except 7
// appears twice, 2 and 12 (the rarest rolls by design) appear once — 18
// tokens for 18 non-desert tiles. Generalizes to other tile counts by
// filling one full pass of all 10 values first (matching the extremes'
// single appearance), then additional passes of just the inner 8 — for
// nonDesertCount=18 this reproduces the exact standard distribution.
const INNER_NUMBERS = [3, 4, 5, 6, 8, 9, 10, 11]
const EXTREME_NUMBERS = [2, 12]

function buildNumberPool(nonDesertCount: number): number[] {
  const pool: number[] = []
  for (let round = 0; pool.length < nonDesertCount; round++) {
    const values = round === 0 ? [...INNER_NUMBERS, ...EXTREME_NUMBERS] : INNER_NUMBERS
    for (const value of values) {
      if (pool.length >= nonDesertCount) break
      pool.push(value)
    }
  }
  return pool
}

/**
 * Shared by every board source — the 3 built-in shapes below AND custom
 * player-drawn ones from BoardShapeEditor.tsx — so a hand-drawn board gets
 * the exact same biome ratio / number distribution / seeded-shuffle
 * treatment as Standard. Online matches must pass `seed` (the room code) —
 * every client calls this independently, and without a shared seed each
 * would land on a completely different tile layout, silently corrupting
 * resource distribution the instant dice rolls start syncing (same total,
 * different tiles under it). Local Pass & Play omits it and keeps its
 * original Math.random() board.
 */
export function buildHexBoardFromCells(
  cells: BoardCell[],
  seed?: string,
  desertOverride?: number,
  biomeOverrides?: Record<string, Biome>,
): HexTileData[] {
  const random = seed ? createSeededRandom(seed) : Math.random
  const tileCount = cells.length
  // Cells pinned to 'sea' or 'gold' can never be drawn from the pool (both
  // are structurally excluded from BIOME_WEIGHTS) — sizing the pool and
  // desert count off the FULL tileCount left phantom slots for every such
  // cell, which the excess-trimming fallback below then discarded randomly
  // rather than proportionally. For a board with many sea/gold cells (e.g.
  // seafarersBasic: 18 sea + 2 gold out of 37), this produced boards missing
  // an entire resource on ~7% of seeds and the wrong desert count. Excluding
  // them from the sizing math up front means the pool is built for exactly
  // the cells that will actually draw from it — every other shape has zero
  // sea/gold overrides, so this is a no-op for them.
  const nonPoolPaintedCount = biomeOverrides
    ? cells.filter((cell) => {
        const override = biomeOverrides[`${cell.col}-${cell.row}`]
        return override === 'sea' || override === 'gold'
      }).length
    : 0
  const poolTileCount = tileCount - nonPoolPaintedCount
  const desertCount = desertOverride ?? desertCountFor(poolTileCount)

  // Painting a tile's biome consumes one matching entry out of the SAME
  // pool every board already generates from — not a separate "shrink the
  // target ratio" calculation, which breaks the moment someone paints more
  // of a biome than its natural share (target could go negative, or every
  // biome could hit 0 remaining while tiles are still unpainted — a
  // divide-by-zero waiting to happen). Best-effort: if a painted biome
  // isn't left in the pool anymore, that tile just doesn't consume
  // anything — painting beyond a biome's natural share simply means 0 more
  // of it get added at random elsewhere.
  let pool = shuffle(buildBiomePool(poolTileCount, desertCount), random)
  let paintedCount = 0
  if (biomeOverrides) {
    for (const cell of cells) {
      const override = biomeOverrides[`${cell.col}-${cell.row}`]
      if (!override) continue
      paintedCount++
      const idx = pool.indexOf(override)
      if (idx !== -1) pool.splice(idx, 1)
    }
  }
  // The pool can still be longer than the number of actually-unpainted
  // tiles whenever a removal above couldn't find a match. Truncating has to
  // stay desert-aware: App.tsx assumes at least one desert tile always
  // exists (that's where the robber starts), so a blind slice() that could
  // randomly drop the board's only desert entry is a real, reproducible
  // crash — not just a cosmetic ratio drift. Drop non-desert entries first;
  // only eat into desert entries if there's nothing else left to trim.
  const excess = pool.length - (tileCount - paintedCount)
  if (excess > 0) {
    const shuffledPool = shuffle(pool, random)
    const deserts = shuffledPool.filter((biome) => biome === 'desert')
    const nonDeserts = shuffledPool.filter((biome) => biome !== 'desert')
    const keptNonDeserts = nonDeserts.slice(0, Math.max(0, nonDeserts.length - excess))
    pool = shuffle([...deserts, ...keptNonDeserts], random)
  } else {
    pool = shuffle(pool, random)
  }

  // Resolve every cell's biome first, then size the number pool off the
  // board's ACTUAL non-desert tile count — not a static target, which can
  // be wrong once painting shifts how many tiles actually end up desert
  // (the truncation above isn't biome-aware, so it can discard a desert
  // entry from the pool without anything correcting for it downstream).
  let poolIndex = 0
  const biomes = cells.map((cell) => {
    const key = `${cell.col}-${cell.row}`
    return biomeOverrides?.[key] ?? pool[poolIndex++]
  })
  const actualNonDesertCount = biomes.filter((biome) => biome !== 'desert' && biome !== 'sea').length
  const numberSequence = shuffle(buildNumberPool(actualNonDesertCount), random)
  let numberIndex = 0

  return cells.map((cell, index) => {
    const { x, z } = cellPosition(cell)
    const key = `${cell.col}-${cell.row}`
    const biome = biomes[index]
    const number = biome === 'desert' || biome === 'sea' ? null : numberSequence[numberIndex++]
    return { id: key, col: cell.col, row: cell.row, x, z, biome, number }
  })
}

/**
 * `shapeId` defaults to 'standard', so every pre-existing call site (tests
 * included) is unaffected. `customCells`, when non-empty, overrides
 * `shapeId` entirely — this is how a saved BoardShapeEditor.tsx shape gets
 * played, while keeping the simple id-based path for the 3 built-ins.
 */
export function buildHexBoard(
  seed?: string,
  shapeId: BoardShapeId = 'standard',
  customCells?: BoardCell[],
  customBiomeOverrides?: Record<string, Biome>,
): HexTileData[] {
  const isCustom = customCells != null && customCells.length > 0
  // shapeId can arrive from an online peer's game-started broadcast, which
  // isn't runtime-validated against BoardShapeId — a stale build on one tab,
  // or any future shape id rename, would otherwise index BOARD_SHAPES with
  // an unrecognized key, get undefined back, and crash on cells.length two
  // lines below before the match ever starts, permanently stranding that
  // client on the lobby screen. Falling back to 'standard' keeps it playable.
  if (!isCustom && !(shapeId in BOARD_SHAPES)) {
    console.error('[Catan] Unknown board shape id, falling back to standard:', shapeId)
  }
  const cells = isCustom ? customCells : (BOARD_SHAPES[shapeId] ?? BOARD_SHAPES.standard)
  // Overrides only apply to the shapeId path — a player's own freshly-drawn
  // custom shape in the editor always gets the automatic ratio, regardless
  // of what a promoted built-in with the same tile count happens to use.
  const desertOverride = isCustom ? undefined : DESERT_COUNT_OVERRIDES[shapeId]
  const biomeOverrides = isCustom ? customBiomeOverrides : BIOME_OVERRIDES_BY_SHAPE[shapeId]
  return buildHexBoardFromCells(cells, seed, desertOverride, biomeOverrides)
}
