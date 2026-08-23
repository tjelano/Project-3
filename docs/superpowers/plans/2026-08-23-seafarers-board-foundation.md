# Seafarers Board Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `sea`/`gold` biomes, one new sea-hex board shape, and the rendering wiring needed to generate and display it — the foundation every other Seafarers sub-plan (Ships & Longest Route, Robber & Pirate, Gold Fields) depends on to be end-to-end testable.

**Architecture:** Extends the existing biome/board-shape system (`data/hexBoard.ts`) the same way every prior board shape was added — no new mechanism. A new `'seafarersBasic'` shape is generated algorithmically (a sea ring grown around `standard`'s existing land layout via the already-exported `cellNeighbors` hex-adjacency function) rather than hand-authored, and its sea/gold cells are pre-pinned via a new per-shape override table mirroring the existing `DESERT_COUNT_OVERRIDES` pattern.

**Tech Stack:** TypeScript, Vitest, React Three Fiber (`.glb` model loading via existing `CatanBoard.tsx` conventions).

**Spec:** `docs/superpowers/specs/2026-08-23-seafarers-ships-open-sea-design.md` (see its "New board shape" section)

## Global Constraints

- This plan does NOT wire the new shape into `RegionSelectMenu.tsx` (the player-facing shape picker) — that component hand-positions each shape as a hotspot on background art, and adding a new one needs real art/positioning the user does themselves once ready. This plan's shape is reachable via `buildHexBoard('seafarersBasic')` directly and via tests; UI selection is a follow-up.
- `WaterHexTile.glb` (currently at the repo root, untracked) is the confirmed sea-hex model — move it into `catan-3d/src/assets/models/`, do not leave it at the repo root.
- No model exists yet for gold fields — reuse an existing land-biome model as an explicit, flagged placeholder (this plan uses `fields-tile.glb`, since "golden fields" is visually closer to gold than forest/mountains/hills). Do not attempt to author new gold-field art.
- `BIOME_ELEVATION`'s existing 6 values were measured from each model's real geometry (a triangle-area-weighted histogram of upward-facing surfaces, per its own comment) — this plan does not have a measurement tool for `WaterHexTile.glb`, so its elevation value is a flagged placeholder requiring visual verification via the dev server, not a measured value. Gold reuses fields' own already-measured elevation (same placeholder model).
- Follow the exact pattern of the 5 other `Record<Biome, X>` tables when adding entries — do not restructure any of them into `Partial` records; they are intentionally exhaustive so a missing biome is a compile error, not a silent runtime gap.

## Task 1: Add `sea`/`gold` biomes, update every exhaustive biome table, exclude sea from number-disc assignment

**Files:**
- Modify: `catan-3d/src/data/hexBoard.ts`
- Modify: `catan-3d/src/game/types.ts`
- Test: `catan-3d/src/data/hexBoard.test.ts`

**Interfaces:**
- Produces: `Biome` gains `'sea' | 'gold'`. `BIOME_TO_RESOURCE['sea']`/`['gold']` both `null` (same as desert — gold's resource is player-chosen at production time, not looked up here; this table is untouched beyond adding the two required entries).

Current state (verified by direct read):
- `catan-3d/src/data/hexBoard.ts:3`: `export type Biome = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert'`
- `catan-3d/src/data/hexBoard.ts:5-12`: `BIOME_COLORS: Record<Biome, string>` (exhaustive, 6 entries)
- `catan-3d/src/data/hexBoard.ts:28-35`: `BIOME_ELEVATION: Record<Biome, number>` (exhaustive, 6 entries)
- `catan-3d/src/game/types.ts:325-332`: `BIOME_TO_RESOURCE: Record<Biome, ResourceType | null>` (exhaustive, 6 entries, `desert: null`)
- `catan-3d/src/game/types.ts:334+`: `BIOME_LABELS: Record<Biome, string>` (exhaustive, 6 entries — re-confirm with `grep -n "BIOME_LABELS" catan-3d/src/game/types.ts` before editing, this excerpt was cut off)
- `catan-3d/src/components/CatanBoard.tsx:18-25`: `BIOME_MODEL_URLS: Record<Biome, string>` (exhaustive, 6 entries — Task 2's job, not this task's; do not touch this file here)

Number-disc exclusion, current code (`catan-3d/src/data/hexBoard.ts`, inside `buildHexBoardFromCells`, verified by direct read — re-confirm exact lines with `grep -n "biome === 'desert'" catan-3d/src/data/hexBoard.ts` since Task numbers may shift them):
```ts
const actualNonDesertCount = biomes.filter((biome) => biome !== 'desert').length
```
and:
```ts
const number = biome === 'desert' ? null : numberSequence[numberIndex++]
```

- [ ] **Step 1: Write the failing tests**

```ts
// catan-3d/src/data/hexBoard.test.ts — add to the existing describe block for buildHexBoardFromCells
it('excludes sea tiles from number-disc assignment, same as desert', () => {
  const cells = [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }]
  const overrides = { '0-0': 'sea' as const }
  const tiles = buildHexBoardFromCells(cells, 'test-seed', undefined, overrides)
  const seaTile = tiles.find((t) => t.id === '0-0')!
  expect(seaTile.biome).toBe('sea')
  expect(seaTile.number).toBeNull()
})

it('assigns a number disc to gold-field tiles, same as any producing land biome', () => {
  const cells = [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }]
  const overrides = { '0-0': 'gold' as const }
  const tiles = buildHexBoardFromCells(cells, 'test-seed', undefined, overrides)
  const goldTile = tiles.find((t) => t.id === '0-0')!
  expect(goldTile.biome).toBe('gold')
  expect(goldTile.number).not.toBeNull()
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run hexBoard.test -t "sea tiles from number-disc"`
Expected: FAIL — `'sea'`/`'gold'` aren't valid `Biome` values yet (TypeScript error) and the exclusion logic doesn't exist yet.

- [ ] **Step 3: Add the two biomes and update every exhaustive table**

`catan-3d/src/data/hexBoard.ts`:
```ts
export type Biome = 'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert' | 'sea' | 'gold'
```
```ts
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
```
```ts
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
  // Reuses fields' own already-measured elevation, since gold reuses fields'
  // model as a placeholder (Task 2) — will need its own value once real
  // gold-field art exists.
  gold: 0.13,
}
```
`catan-3d/src/game/types.ts` — confirm the exact current `BIOME_LABELS` entries with `grep -n -A10 "BIOME_LABELS" catan-3d/src/game/types.ts` first, then add:
```ts
sea: 'Sea',
gold: 'Gold Field',
```
to both `BIOME_TO_RESOURCE` (both `null`, same as `desert`) and `BIOME_LABELS` (values above), preserving every existing entry unchanged.

- [ ] **Step 4: Fix number-disc assignment to exclude sea**

Change:
```ts
const actualNonDesertCount = biomes.filter((biome) => biome !== 'desert').length
```
to:
```ts
const actualNonDesertCount = biomes.filter((biome) => biome !== 'desert' && biome !== 'sea').length
```
and:
```ts
const number = biome === 'desert' ? null : numberSequence[numberIndex++]
```
to:
```ts
const number = biome === 'desert' || biome === 'sea' ? null : numberSequence[numberIndex++]
```
Do not change gold's treatment — it falls through to the `numberSequence[numberIndex++]` branch unchanged, since gold fields do produce.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run hexBoard.test`
Expected: PASS, including the 2 new tests and every pre-existing test in the file unchanged.

- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: all three clean. `tsc -b` in particular will catch any other exhaustive `Record<Biome, ...>` table this step's grep missed — if it reports a missing-property error anywhere, add the two entries there too before proceeding (same pattern as the tables above).

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/data/hexBoard.ts catan-3d/src/game/types.ts catan-3d/src/data/hexBoard.test.ts
git commit -m "feat: add sea/gold biomes, exclude sea from number-disc assignment"
```

---

## Task 2: Wire WaterHexTile.glb as the sea model, add a placeholder gold model

**Files:**
- Move: `WaterHexTile.glb` (repo root) → `catan-3d/src/assets/models/water-tile.glb`
- Modify: `catan-3d/src/components/CatanBoard.tsx`

**Interfaces:**
- Consumes: `Biome` now includes `'sea' | 'gold'` (Task 1).
- Produces: `BIOME_MODEL_URLS` covers all 8 biomes — no other code depends on this beyond `CatanBoard.tsx`'s own rendering.

Current state (verified by direct read, `catan-3d/src/components/CatanBoard.tsx:1-25` — re-confirm with `grep -n "BIOME_MODEL_URLS\|from '../assets/models" catan-3d/src/components/CatanBoard.tsx`):
```tsx
import pastureTileModelUrl from '../assets/models/pasture-tile.glb'
import desertTileModelUrl from '../assets/models/desert-tile.glb'

const BIOME_MODEL_URLS: Record<Biome, string> = {
  forest: forestTileModelUrl,
  hills: hillsTileModelUrl,
  mountains: mountainsTileModelUrl,
  fields: fieldsTileModelUrl,
  pasture: pastureTileModelUrl,
  desert: desertTileModelUrl,
}
```

- [ ] **Step 1: Move the model file**

```bash
git mv WaterHexTile.glb catan-3d/src/assets/models/water-tile.glb
```
(`git mv` preserves history better than a manual move+add+rm; if the file is genuinely untracked — confirm with `git status WaterHexTile.glb` first — use a plain `mv` instead, since `git mv` requires the source to already be tracked.)

- [ ] **Step 2: Add the import and wire both new biomes**

Add near the other model imports:
```tsx
import waterTileModelUrl from '../assets/models/water-tile.glb'
```
Update `BIOME_MODEL_URLS`:
```tsx
const BIOME_MODEL_URLS: Record<Biome, string> = {
  forest: forestTileModelUrl,
  hills: hillsTileModelUrl,
  mountains: mountainsTileModelUrl,
  fields: fieldsTileModelUrl,
  pasture: pastureTileModelUrl,
  desert: desertTileModelUrl,
  sea: waterTileModelUrl,
  // PLACEHOLDER — no gold-field model exists yet, reusing fields' own model
  // (see this plan's Global Constraints). Swap for real gold-field art once
  // it exists; nothing else needs to change when that happens, this is the
  // only line that names the model.
  gold: fieldsTileModelUrl,
}
```

- [ ] **Step 3: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: all three clean. This is a rendering/asset wire-up with no new reducer logic — no new automated test applies here, matching how the existing 6 models have none of their own either.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/assets/models/water-tile.glb catan-3d/src/components/CatanBoard.tsx
git commit -m "feat: wire WaterHexTile.glb as the sea biome model, placeholder for gold"
```

---

## Task 3: New `seafarersBasic` board shape — algorithmic sea ring + pinned gold fields

**Files:**
- Modify: `catan-3d/src/data/hexBoard.ts`
- Test: `catan-3d/src/data/hexBoard.test.ts`

**Interfaces:**
- Consumes: `cellNeighbors(cell: BoardCell): BoardCell[]` — already exported (`catan-3d/src/data/hexBoard.ts:100`), correct hex-adjacency math, already used by `BoardShapeEditor.tsx`'s own connectivity check. Do not reimplement neighbor math.
- Produces: `BoardShapeId` gains `'seafarersBasic'`. `buildHexBoard('seafarersBasic')` returns a board with `standard`'s 19 land hexes (2 pinned to `'gold'`) surrounded by a ring of `'sea'` hexes.

Current state (verified by direct read — re-confirm line numbers with `grep -n "DESERT_COUNT_OVERRIDES\|BUILT_IN_COLUMN_HEIGHTS\|const BOARD_SHAPES" catan-3d/src/data/hexBoard.ts`):
```ts
const BUILT_IN_COLUMN_HEIGHTS: Record<ColumnShapeId, number[]> = {
  standard: [3, 4, 5, 4, 3],
  newfoundland: [2, 3, 4, 4, 3, 2, 1],
  peanut: [3, 3, 2, 3, 2, 3, 3],
}
```
```ts
const DESERT_COUNT_OVERRIDES: Partial<Record<BoardShapeId, number>> = {
  bigPeanut: 2,
  northAmerica: 3,
  southAmerica: 2,
  bigBasic: 4,
}

const BOARD_SHAPES: Record<BoardShapeId, BoardCell[]> = {
  ...(Object.fromEntries(
    Object.entries(BUILT_IN_COLUMN_HEIGHTS).map(([id, heights]) => [id, columnHeightsToCells(heights)]),
  ) as Record<ColumnShapeId, BoardCell[]>),
  ...PROMOTED_CUSTOM_SHAPES,
}
```
`buildHexBoard`'s wrapper (`catan-3d/src/data/hexBoard.ts:438-461`):
```ts
export function buildHexBoard(
  seed?: string,
  shapeId: BoardShapeId = 'standard',
  customCells?: BoardCell[],
  customBiomeOverrides?: Record<string, Biome>,
): HexTileData[] {
  const isCustom = customCells != null && customCells.length > 0
  if (!isCustom && !(shapeId in BOARD_SHAPES)) {
    console.error('[Catan] Unknown board shape id, falling back to standard:', shapeId)
  }
  const cells = isCustom ? customCells : (BOARD_SHAPES[shapeId] ?? BOARD_SHAPES.standard)
  const desertOverride = isCustom ? undefined : DESERT_COUNT_OVERRIDES[shapeId]
  const biomeOverrides = isCustom ? customBiomeOverrides : undefined
  return buildHexBoardFromCells(cells, seed, desertOverride, biomeOverrides)
}
```
**The bug this task must fix:** `biomeOverrides` is unconditionally `undefined` for any built-in `shapeId` path (only the hand-drawn custom-editor path gets them) — a named shape can never carry its own pinned biomes today. This task adds a new `BIOME_OVERRIDES_BY_SHAPE` table (mirroring `DESERT_COUNT_OVERRIDES`'s existing pattern exactly) and changes the wrapper to apply it.

- [ ] **Step 1: Write the failing tests**

```ts
// catan-3d/src/data/hexBoard.test.ts
describe('seafarersBasic board shape', () => {
  it('surrounds the standard land layout with a ring of sea hexes', () => {
    const tiles = buildHexBoard('test-seed', 'seafarersBasic')
    const standardLandCells = tiles.filter((t) => t.biome !== 'sea')
    expect(standardLandCells).toHaveLength(19) // standard's own land-hex count, unchanged
    const seaTiles = tiles.filter((t) => t.biome === 'sea')
    expect(seaTiles.length).toBeGreaterThan(0)
    expect(seaTiles.every((t) => t.number === null)).toBe(true)
  })

  it('pins exactly 2 gold-field cells, both producing (non-null number)', () => {
    const tiles = buildHexBoard('test-seed', 'seafarersBasic')
    const goldTiles = tiles.filter((t) => t.biome === 'gold')
    expect(goldTiles).toHaveLength(2)
    expect(goldTiles.every((t) => t.number !== null)).toBe(true)
  })

  it('is deterministic for a given seed', () => {
    const a = buildHexBoard('same-seed', 'seafarersBasic')
    const b = buildHexBoard('same-seed', 'seafarersBasic')
    expect(a).toEqual(b)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run hexBoard.test -t "seafarersBasic"`
Expected: FAIL — `'seafarersBasic'` isn't a valid `BoardShapeId` yet.

- [ ] **Step 3: Add the shape id and the ring-generation helper**

Add `'seafarersBasic'` to `BoardShapeId` (find its declaration with `grep -n "export type BoardShapeId" catan-3d/src/data/hexBoard.ts`):
```ts
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
```

Add a ring-generation helper near `columnHeightsToCells` (uses the already-exported `cellNeighbors`, no new adjacency math):
```ts
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
```

- [ ] **Step 4: Add the shape definition and its pinned biome overrides**

Add to `BOARD_SHAPES` (find its declaration with `grep -n "const BOARD_SHAPES" catan-3d/src/data/hexBoard.ts`), computing the shape once at module scope so both the cell list and the override table can reference the same land/ring cells:
```ts
const SEAFARERS_BASIC_LAND_CELLS = columnHeightsToCells(BUILT_IN_COLUMN_HEIGHTS.standard)
const SEAFARERS_BASIC_SEA_RING = ringAround(SEAFARERS_BASIC_LAND_CELLS)
const SEAFARERS_BASIC_CELLS = [...SEAFARERS_BASIC_LAND_CELLS, ...SEAFARERS_BASIC_SEA_RING]

const BOARD_SHAPES: Record<BoardShapeId, BoardCell[]> = {
  ...(Object.fromEntries(
    Object.entries(BUILT_IN_COLUMN_HEIGHTS).map(([id, heights]) => [id, columnHeightsToCells(heights)]),
  ) as Record<ColumnShapeId, BoardCell[]>),
  ...PROMOTED_CUSTOM_SHAPES,
  seafarersBasic: SEAFARERS_BASIC_CELLS,
}
```
Add the new per-shape override table, mirroring `DESERT_COUNT_OVERRIDES`'s exact pattern, placed right after it:
```ts
// Mirrors DESERT_COUNT_OVERRIDES's own pattern — per-shape pinned biomes for
// built-in shapes, applied by buildHexBoard below (Step 5) alongside the
// existing custom-editor override path, not replacing it.
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
```

- [ ] **Step 5: Apply the override table in `buildHexBoard`'s wrapper**

Change:
```ts
const biomeOverrides = isCustom ? customBiomeOverrides : undefined
```
to:
```ts
const biomeOverrides = isCustom ? customBiomeOverrides : BIOME_OVERRIDES_BY_SHAPE[shapeId]
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run hexBoard.test`
Expected: PASS, including all 3 new `seafarersBasic` tests and every pre-existing test unchanged (confirms `DESERT_COUNT_OVERRIDES`-driven shapes and the custom-editor path are unaffected by the wrapper change).

- [ ] **Step 7: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: all three clean.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/data/hexBoard.ts catan-3d/src/data/hexBoard.test.ts
git commit -m "feat: add seafarersBasic board shape (algorithmic sea ring + pinned gold fields)"
```

---

## Task 4: Final verification

- [ ] **Step 1:** `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run` — must be clean.
- [ ] **Step 2:** Boot smoke test — start the dev server, confirm HTTP 200 with no console errors, then stop it. Check for and kill any orphaned `vite` process afterward before removing the worktree (this project's own recorded lesson — `TaskStop` doesn't always kill the underlying node child cleanly).
- [ ] **Step 3:** Confirm `WaterHexTile.glb` no longer exists at the repo root (`git status` should show it moved, not both an untracked root copy and a tracked assets copy).
- [ ] **Step 4:** Note for the human partner in the final report: `BIOME_ELEVATION.sea` (Task 1) and the gold-field placeholder model (Task 2) are both flagged placeholders needing visual verification/replacement once real assets exist — not blocking, but should not be silently forgotten.

No commit for this task (verification only) — proceed to the final whole-branch review once Steps 1-3 are clean.
