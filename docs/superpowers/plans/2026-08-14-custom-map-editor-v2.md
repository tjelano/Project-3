# Custom Map Editor v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players browse, edit, and delete their saved custom board shapes from a sidebar in the drawing editor, and paint a specific biome onto specific tiles instead of leaving every tile's biome to chance.

**Architecture:** `CustomBoardShape` gains one new optional field, `biomeOverrides`, keyed the same way `HexTileData.id` already is (`${col}-${row}`). `buildHexBoardFromCells` consumes matching entries out of its existing random biome pool for painted tiles before assigning the rest — no separate ratio-target math, so it can't go negative or divide by zero when someone paints more of a biome than its natural share. `BoardShapeEditor.tsx` gains a sidebar (browse/select/delete) and a `mode: 'editing' | 'preview'` split — selecting a saved map loads it read-only so you can see it before committing, with a separate Edit button to make changes. `biomeOverrides` threads through the exact same optional-field pattern `customBoardCells`/`customBoardName` already use everywhere: `GameStartInfo`, the `game-started` broadcast payload, and `MatchSnapshot`.

**Tech Stack:** React 19 + TypeScript, Vite, Vitest, Tailwind. No new dependencies.

**Design doc:** `docs/superpowers/specs/2026-08-14-custom-map-editor-v2-design.md`

## Global Constraints

- No new dependencies.
- `cells: BoardCell[]` on `CustomBoardShape` stays untouched — shape and painted biome are separate concerns. Built-in shapes, `boardGraph.ts`, `cellNeighbors`/`cellPosition` need zero changes.
- Number tokens (2–12) always stay fully random, painted tile or not — only biome is paintable.
- Every new field threaded through the online/snapshot pipeline (`biomeOverrides`) is optional and defaults to `undefined`/absent on anything saved before this feature — no migration needed anywhere.
- Match this project's existing conventions: no semicolons, 2-space indent, comments explain *why* not *what*, `console.error('[Catan] ...')` prefix for logged errors, `tsc -b` (not `tsc --noEmit`) for verification.

---

### Task 1: Data model — `CustomBoardShape.biomeOverrides` + resurrect delete/load

**Files:**
- Modify: `catan-3d/src/data/customBoardShapes.ts`
- Test: `catan-3d/src/data/customBoardShapes.test.ts` (new)

**Interfaces:**
- Produces: `CustomBoardShape { id: string; name: string; cells: BoardCell[]; biomeOverrides?: Record<string, Biome> }`, `export function loadCustomBoardShapes(): CustomBoardShape[]`, `export function deleteCustomBoardShape(id: string): CustomBoardShape[]` (returns the new list, same convention as `saveCustomBoardShape`), `export function saveCustomBoardShape(shape: CustomBoardShape): CustomBoardShape[]` (unchanged signature).

- [ ] **Step 1: Write the failing tests**

Create `catan-3d/src/data/customBoardShapes.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { deleteCustomBoardShape, loadCustomBoardShapes, saveCustomBoardShape, type CustomBoardShape } from './customBoardShapes'

// customBoardShapes.ts reads/writes the real global `localStorage` —
// vitest's configured 'node' environment (vite.config.ts) has none, so
// this stands in a fresh in-memory implementation before every test (no
// cross-test bleed, no need to touch vitest's environment config just for
// this one file).
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage() as unknown as Storage
})

describe('saveCustomBoardShape / loadCustomBoardShapes', () => {
  it('round-trips a shape with no biomeOverrides', () => {
    const shape: CustomBoardShape = { id: 'a', name: 'Test', cells: [{ col: 0, row: 0 }] }
    saveCustomBoardShape(shape)
    expect(loadCustomBoardShapes()).toEqual([shape])
  })

  it('round-trips a shape with biomeOverrides', () => {
    const shape: CustomBoardShape = {
      id: 'b',
      name: 'Painted',
      cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }],
      biomeOverrides: { '0-0': 'desert' },
    }
    saveCustomBoardShape(shape)
    expect(loadCustomBoardShapes()).toEqual([shape])
  })

  it('overwrites an existing shape with the same id instead of duplicating it', () => {
    saveCustomBoardShape({ id: 'a', name: 'First', cells: [{ col: 0, row: 0 }] })
    saveCustomBoardShape({ id: 'a', name: 'Second', cells: [{ col: 0, row: 0 }] })
    const shapes = loadCustomBoardShapes()
    expect(shapes.length).toBe(1)
    expect(shapes[0].name).toBe('Second')
  })

  it('drops a saved entry whose biomeOverrides contains an invalid biome', () => {
    localStorage.setItem(
      'catan3d.customBoardShapes',
      JSON.stringify([{ id: 'bad', name: 'Bad', cells: [{ col: 0, row: 0 }], biomeOverrides: { '0-0': 'lava' } }]),
    )
    expect(loadCustomBoardShapes()).toEqual([])
  })

  it('keeps a saved entry whose biomeOverrides is absent', () => {
    localStorage.setItem(
      'catan3d.customBoardShapes',
      JSON.stringify([{ id: 'ok', name: 'OK', cells: [{ col: 0, row: 0 }] }]),
    )
    expect(loadCustomBoardShapes().length).toBe(1)
  })
})

describe('deleteCustomBoardShape', () => {
  it('removes only the matching id', () => {
    saveCustomBoardShape({ id: 'a', name: 'A', cells: [{ col: 0, row: 0 }] })
    saveCustomBoardShape({ id: 'b', name: 'B', cells: [{ col: 0, row: 0 }] })
    deleteCustomBoardShape('a')
    expect(loadCustomBoardShapes().map((s) => s.id)).toEqual(['b'])
  })

  it('is a no-op when the id does not exist', () => {
    saveCustomBoardShape({ id: 'a', name: 'A', cells: [{ col: 0, row: 0 }] })
    deleteCustomBoardShape('nonexistent')
    expect(loadCustomBoardShapes().map((s) => s.id)).toEqual(['a'])
  })

  it('returns the updated list', () => {
    saveCustomBoardShape({ id: 'a', name: 'A', cells: [{ col: 0, row: 0 }] })
    const result = deleteCustomBoardShape('a')
    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/data/customBoardShapes.test.ts`
Expected: FAIL — `loadCustomBoardShapes`/`deleteCustomBoardShape` aren't exported yet, `biomeOverrides` isn't a recognized field.

- [ ] **Step 3: Update `customBoardShapes.ts`**

Replace the full file with:

```ts
import type { Biome, BoardCell } from './hexBoard'
import { BIOME_COLORS } from './hexBoard'

export interface CustomBoardShape {
  id: string
  name: string
  cells: BoardCell[]
  // Sparse — only painted tiles appear here, keyed the same way
  // HexTileData.id already is (`${col}-${row}`). Absent entirely on shapes
  // saved before this feature, which is what keeps them working exactly as
  // before (fully random) with zero migration needed.
  biomeOverrides?: Record<string, Biome>
}

// Namespaced so it can't collide with any other app sharing this origin —
// matches LocalSetup.tsx's own localStorage key convention.
const STORAGE_KEY = 'catan3d.customBoardShapes'

function isPlausibleBiomeOverrides(value: unknown): value is Record<string, Biome> {
  if (typeof value !== 'object' || value === null) return false
  // BIOME_COLORS is a Record<Biome, string> — its own keys ARE exactly the
  // valid Biome values, so `in` doubles as the validity check without
  // needing a separate exported list of biome names.
  return Object.values(value).every((biome) => typeof biome === 'string' && biome in BIOME_COLORS)
}

// Only checks the fields actually read downstream without a fallback —
// buildHexBoardFromCells (hexBoard.ts) does cells.length immediately once a
// shape is picked, so a malformed/legacy entry with a missing or
// non-array `cells` would otherwise throw the instant that shape was
// selected, not when it was loaded.
function isPlausibleCustomBoardShape(value: unknown): value is CustomBoardShape {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  if (typeof s.id !== 'string' || typeof s.name !== 'string' || !Array.isArray(s.cells)) return false
  if (s.biomeOverrides !== undefined && !isPlausibleBiomeOverrides(s.biomeOverrides)) return false
  return true
}

export function loadCustomBoardShapes(): CustomBoardShape[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPlausibleCustomBoardShape)
  } catch {
    // Storage can throw in private-browsing modes or when disabled, or hold
    // corrupted JSON from a previous version — either way, treat it as "no
    // saved shapes yet" rather than crashing the setup screen.
    return []
  }
}

export function saveCustomBoardShape(shape: CustomBoardShape): CustomBoardShape[] {
  const next = [...loadCustomBoardShapes().filter((existing) => existing.id !== shape.id), shape]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Same non-fatal storage failure as above — the shape still works for
    // the rest of this session, it just won't persist to the next visit.
  }
  return next
}

export function deleteCustomBoardShape(id: string): CustomBoardShape[] {
  const next = loadCustomBoardShapes().filter((existing) => existing.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Same non-fatal storage failure as above.
  }
  return next
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/data/customBoardShapes.test.ts`
Expected: PASS, all 8 tests.

- [ ] **Step 5: Type-check and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/data/customBoardShapes.ts src/data/customBoardShapes.test.ts`
Expected: no errors from either command.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/data/customBoardShapes.ts catan-3d/src/data/customBoardShapes.test.ts
git commit -m "feat: add biomeOverrides field and resurrect delete/load for custom board shapes"
```

---

### Task 2: Generation logic — `buildHexBoardFromCells`/`buildHexBoard` biome overrides

**Files:**
- Modify: `catan-3d/src/data/hexBoard.ts`
- Test: `catan-3d/src/data/hexBoard.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 (this task only touches generation logic, not persistence).
- Produces: `buildHexBoardFromCells(cells: BoardCell[], seed?: string, desertOverride?: number, biomeOverrides?: Record<string, Biome>): HexTileData[]`, `buildHexBoard(seed?: string, shapeId?: BoardShapeId, customCells?: BoardCell[], customBiomeOverrides?: Record<string, Biome>): HexTileData[]` — both existing exports, each gaining one new trailing optional parameter. Every existing call site (with 0–3 args) keeps compiling unchanged.

- [ ] **Step 1: Write the failing tests**

Add to the end of `catan-3d/src/data/hexBoard.test.ts` (import `buildHexBoardFromCells` alongside the existing `buildHexBoard` import at the top):

```ts
import { buildHexBoard, buildHexBoardFromCells } from './hexBoard'
```

```ts
describe('buildHexBoardFromCells biome overrides', () => {
  const cells = [
    { col: 0, row: 0 },
    { col: 0, row: 1 },
    { col: 0, row: 2 },
    { col: 1, row: 0 },
    { col: -1, row: -1 },
  ]

  it('assigns the exact painted biome to a painted tile', () => {
    const board = buildHexBoardFromCells(cells, 'seed-1', undefined, { '0-0': 'desert' })
    const tile = board.find((t) => t.col === 0 && t.row === 0)
    expect(tile?.biome).toBe('desert')
    expect(tile?.number).toBeNull()
  })

  it('still produces exactly one tile per input cell', () => {
    const board = buildHexBoardFromCells(cells, 'seed-1', undefined, { '0-0': 'desert' })
    expect(board.length).toBe(cells.length)
  })

  it('produces the same result for the same seed with the same overrides', () => {
    const overrides = { '0-0': 'mountains' as const }
    const board1 = buildHexBoardFromCells(cells, 'seed-2', undefined, overrides)
    const board2 = buildHexBoardFromCells(cells, 'seed-2', undefined, overrides)
    expect(board1).toEqual(board2)
  })

  it('is unaffected by biomeOverrides being entirely absent (backward compatible)', () => {
    const withUndefined = buildHexBoardFromCells(cells, 'seed-3')
    const withEmpty = buildHexBoardFromCells(cells, 'seed-3', undefined, {})
    expect(withUndefined).toEqual(withEmpty)
  })

  it('handles painting more of a biome than its natural share without crashing or losing tiles', () => {
    // desertCountFor(5) is 1 — painting 3 deserts already exceeds the
    // natural share for two of them. This must not throw or shrink the board.
    const overrides = { '0-0': 'desert' as const, '0-1': 'desert' as const, '0-2': 'desert' as const }
    const board = buildHexBoardFromCells(cells, 'seed-4', undefined, overrides)
    expect(board.length).toBe(cells.length)
    const painted = board.filter((t) => ['0-0', '0-1', '0-2'].includes(`${t.col}-${t.row}`))
    expect(painted.every((t) => t.biome === 'desert')).toBe(true)
  })

  it('still assigns a random number to a painted non-desert tile', () => {
    const board = buildHexBoardFromCells(cells, 'seed-5', undefined, { '0-0': 'mountains' })
    const tile = board.find((t) => t.col === 0 && t.row === 0)
    expect(tile?.number).not.toBeNull()
    expect(tile?.number).toBeGreaterThanOrEqual(2)
    expect(tile?.number).toBeLessThanOrEqual(12)
  })
})

describe('buildHexBoard with customBiomeOverrides', () => {
  it('passes overrides through only when a custom shape is active', () => {
    const customCells = [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 0 }]
    const board = buildHexBoard('seed-6', 'standard', customCells, { '0-0': 'hills' })
    const tile = board.find((t) => t.col === 0 && t.row === 0)
    expect(tile?.biome).toBe('hills')
  })

  it('ignores customBiomeOverrides when no custom cells are given', () => {
    const withOverrides = buildHexBoard('seed-7', 'standard', undefined, { '0-0': 'hills' })
    const without = buildHexBoard('seed-7', 'standard')
    expect(withOverrides).toEqual(without)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/data/hexBoard.test.ts`
Expected: FAIL — `buildHexBoardFromCells`/`buildHexBoard` don't accept a 4th argument yet, painted biomes aren't respected.

- [ ] **Step 3: Update `buildHexBoardFromCells` and `buildHexBoard`**

In `catan-3d/src/data/hexBoard.ts`, replace the `buildHexBoardFromCells` function with:

```ts
export function buildHexBoardFromCells(
  cells: BoardCell[],
  seed?: string,
  desertOverride?: number,
  biomeOverrides?: Record<string, Biome>,
): HexTileData[] {
  const random = seed ? createSeededRandom(seed) : Math.random
  const tileCount = cells.length
  const desertCount = desertOverride ?? desertCountFor(tileCount)

  // Painting a tile's biome consumes one matching entry out of the SAME
  // pool every board already generates from — not a separate "shrink the
  // target ratio" calculation, which breaks the moment someone paints more
  // of a biome than its natural share (target could go negative, or every
  // biome could hit 0 remaining while tiles are still unpainted — a
  // divide-by-zero waiting to happen). Best-effort: if a painted biome
  // isn't left in the pool anymore, that tile just doesn't consume
  // anything — painting beyond a biome's natural share simply means 0 more
  // of it get added at random elsewhere.
  let pool = shuffle(buildBiomePool(tileCount, desertCount), random)
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
  // tiles whenever a removal above couldn't find a match — reshuffle and
  // take exactly what's needed, so the final length is always correct and
  // any discarded excess is random rather than a fixed tail.
  pool = shuffle(pool, random).slice(0, tileCount - paintedCount)

  const numberSequence = shuffle(buildNumberPool(tileCount - desertCount), random)
  let poolIndex = 0
  let numberIndex = 0

  return cells.map((cell) => {
    const { x, z } = cellPosition(cell)
    const key = `${cell.col}-${cell.row}`
    const biome = biomeOverrides?.[key] ?? pool[poolIndex++]
    const number = biome === 'desert' ? null : numberSequence[numberIndex++]
    return { id: key, col: cell.col, row: cell.row, x, z, biome, number }
  })
}
```

Replace the `buildHexBoard` function with:

```ts
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
  const biomeOverrides = isCustom ? customBiomeOverrides : undefined
  return buildHexBoardFromCells(cells, seed, desertOverride, biomeOverrides)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/data/hexBoard.test.ts`
Expected: PASS, all tests including the pre-existing ones above (unaffected by this change).

- [ ] **Step 5: Run the full test suite, type-check, and lint**

Run: `cd catan-3d && npx vitest run && npx tsc -b && npx eslint src/data/hexBoard.ts src/data/hexBoard.test.ts`
Expected: all tests pass (58 pre-existing + new ones), no type or lint errors. `tsc -b` in particular confirms every existing caller of `buildHexBoard`/`buildHexBoardFromCells` (App.tsx, RoomLobby.tsx, hexBoard.test.ts itself) still compiles with the new trailing optional parameter.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/data/hexBoard.ts catan-3d/src/data/hexBoard.test.ts
git commit -m "feat: let buildHexBoardFromCells respect painted biome overrides"
```

---

### Task 3: `BoardShapeEditor` — biome painting

**Files:**
- Modify: `catan-3d/src/components/hud/BoardShapeEditor.tsx`

**Interfaces:**
- Consumes: `Biome`, `BIOME_COLORS` from `../../data/hexBoard` (Task 2's generation logic reads the `biomeOverrides` shape this task produces).
- Produces: no change to `BoardShapeEditor`'s own props (`onSave: (shape: CustomBoardShape) => void`, `onClose: () => void`) — this task only changes what `onSave` is called with.

No sidebar yet — this task only adds the ability to paint a biome onto an already-selected tile, on top of the single-canvas editor that exists today. Manual verification only (no RTL/component-test setup in this project — every other UI change this session used `tsc -b`/`eslint`/live browser check the same way).

- [ ] **Step 1: Add biome-paint state and the palette UI**

In `catan-3d/src/components/hud/BoardShapeEditor.tsx`, update the top import:

```ts
import { useMemo, useState } from 'react'
import { cellNeighbors, cellPosition, type BoardCell, type Biome, BIOME_COLORS } from '../../data/hexBoard'
import type { CustomBoardShape } from '../../data/customBoardShapes'
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap'
```

Add, right after `CORNER_ANGLES_DEG`:

```ts
const BIOME_PALETTE: Biome[] = ['forest', 'pasture', 'fields', 'hills', 'mountains', 'desert']
```

Inside the component, add new state right after the existing `selected`/`name` state:

```ts
const [selected, setSelected] = useState<Set<string>>(new Set())
const [paintedBiomes, setPaintedBiomes] = useState<Map<string, Biome>>(new Map())
const [name, setName] = useState('')
const [activeBrush, setActiveBrush] = useState<Biome | 'erase' | null>(null)
```

- [ ] **Step 2: Replace `toggleCell`'s call sites with a biome-aware click handler**

Keep the existing `toggleCell` function exactly as-is (still needed for the "add to shape" and "remove from shape" cases). Add a new handler right after it:

```ts
const toggleCell = (cell: BoardCell) => {
  const key = cellKey(cell)
  setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
}

// Water tile: adds it to the shape, no biome painted. Land tile with a
// biome brush active: paints that biome (stays in the shape either way).
// Land tile with the eraser active: clears any painted biome, stays in
// the shape. Land tile with no brush selected: the original toggle-off —
// removes it from the shape, and clears any paint on it too, so a tile
// that's re-added later doesn't resurrect stale paint from a previous edit.
const handleTileClick = (cell: BoardCell) => {
  const key = cellKey(cell)
  const isLand = selected.has(key)
  if (!isLand) {
    toggleCell(cell)
    return
  }
  if (activeBrush === null) {
    toggleCell(cell)
    setPaintedBiomes((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    return
  }
  if (activeBrush === 'erase') {
    setPaintedBiomes((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    return
  }
  setPaintedBiomes((prev) => new Map(prev).set(key, activeBrush))
}
```

- [ ] **Step 3: Update `handleSave` to include `biomeOverrides`**

Replace `handleSave`:

```ts
const handleSave = () => {
  if (!canSave) return
  const cells: BoardCell[] = [...selected].map((key) => {
    const [col, row] = key.split(':').map(Number)
    return { col, row }
  })
  // Re-keyed from BoardShapeEditor's own colon-separated cellKey format
  // (safely parseable back into numbers, including negatives, via split(':'))
  // to the hyphen format HexTileData.id/buildHexBoardFromCells use
  // (`${col}-${row}`) — that format is write/lookup-only everywhere it's
  // consumed, never split apart, which is exactly why it's safe there but
  // NOT safe for this component's own selected-cells bookkeeping (a
  // negative coordinate like col=-1 makes "-1--2" ambiguous to split on
  // '-', which is why cellKey uses ':' instead).
  const biomeOverrides: Record<string, Biome> = {}
  for (const [key, biome] of paintedBiomes) {
    if (!selected.has(key)) continue
    const [col, row] = key.split(':').map(Number)
    biomeOverrides[`${col}-${row}`] = biome
  }
  onSave({
    id: `custom-${Date.now()}`,
    name: name.trim(),
    cells,
    ...(Object.keys(biomeOverrides).length > 0 ? { biomeOverrides } : {}),
  })
}
```

- [ ] **Step 4: Wire the click handler, tile fill color, palette UI, and the copy update**

Replace the instructions paragraph:

```tsx
<p className="mt-1 font-body text-xs text-white/60">
  Click hexes to mark land. Paint a biome onto a tile to fix it — leave tiles unpainted to keep them random. Numbers always shuffle fresh every game.
</p>
```

Replace the polygon's `onClick`/`className`/add a `style` (inside the `COL_RANGE.flatMap` block):

```tsx
const isSelected = selected.has(key)
const paintedBiome = paintedBiomes.get(key)
return (
  <polygon
    key={key}
    points={hexPolygonPoints(cx, cy, HEX_PIXEL_RADIUS - 1.5)}
    onClick={() => handleTileClick(cell)}
    className={`cursor-pointer stroke-white/15 transition-colors ${
      !isSelected ? 'fill-white/5 hover:fill-white/15' : paintedBiome ? '' : 'fill-gold/80 hover:fill-gold'
    }`}
    style={paintedBiome ? { fill: BIOME_COLORS[paintedBiome] } : undefined}
    strokeWidth={1}
  />
)
```

Add the palette, right after the "tiles selected / not connected" status row and before the name-input row:

```tsx
<div className="mt-3 flex flex-wrap items-center gap-2">
  <span className="font-body text-[11px] tracking-[0.1em] text-white/50 uppercase">Paint biome</span>
  {BIOME_PALETTE.map((biome) => (
    <button
      key={biome}
      type="button"
      onClick={() => setActiveBrush((prev) => (prev === biome ? null : biome))}
      aria-label={`Paint ${biome}`}
      aria-pressed={activeBrush === biome}
      title={biome}
      className={`h-6 w-6 rounded-full border-2 transition-transform ${
        activeBrush === biome ? 'scale-110 border-white' : 'border-white/30 hover:border-white/60'
      }`}
      style={{ backgroundColor: BIOME_COLORS[biome] }}
    />
  ))}
  <button
    type="button"
    onClick={() => setActiveBrush((prev) => (prev === 'erase' ? null : 'erase'))}
    aria-label="Clear painted biome"
    aria-pressed={activeBrush === 'erase'}
    className={`rounded-lg border px-2 py-1 font-body text-[10px] tracking-[0.05em] uppercase transition-colors ${
      activeBrush === 'erase' ? 'border-gold text-gold' : 'border-glass-border text-white/50 hover:text-white'
    }`}
  >
    Erase
  </button>
</div>
```

Update the Clear button to also reset painted biomes (otherwise clearing the whole shape leaves orphaned paint data sitting in state, invisible until the next save):

```tsx
<button
  type="button"
  onClick={() => {
    setSelected(new Set())
    setPaintedBiomes(new Map())
  }}
  className="rounded-lg border border-glass-border bg-white/5 px-3 py-2 font-body text-[11px] tracking-[0.1em] text-white/60 uppercase transition-colors hover:border-player-1/50 hover:text-player-1"
>
  Clear
</button>
```

- [ ] **Step 5: Type-check, lint, and build**

Run: `cd catan-3d && npx tsc -b && npx eslint src/components/hud/BoardShapeEditor.tsx && npm run build`
Expected: no errors.

- [ ] **Step 6: Manual verification in the browser**

Start the dev server if it isn't already running (`cd catan-3d && npm run dev`), open the app, go to Game Setup → Pass & Play → Start Game → Custom Maps → draw a shape. Select a swatch from the new palette, click a land tile — it should fill with that biome's color instead of gold. Click a painted tile with the eraser active — it reverts to gold. Click a painted tile with no brush active — it's removed from the shape entirely and its color resets. Save, then check the browser console for errors (should be none).

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/components/hud/BoardShapeEditor.tsx
git commit -m "feat: let players paint a fixed biome onto custom board tiles"
```

---

### Task 4: `BoardShapeEditor` — sidebar (browse / preview / edit / delete / new)

**Files:**
- Modify: `catan-3d/src/components/hud/BoardShapeEditor.tsx`

**Interfaces:**
- Consumes: `loadCustomBoardShapes`, `deleteCustomBoardShape` from `../../data/customBoardShapes` (Task 1).
- Produces: no change to `BoardShapeEditor`'s props — `onSave`/`onClose` keep their exact signatures. The "Use This Map" button calls the same `onSave` prop the Save button already does.

- [ ] **Step 1: Add sidebar/mode state**

Add imports:

```ts
import { deleteCustomBoardShape, loadCustomBoardShapes, type CustomBoardShape } from '../../data/customBoardShapes'
```

Add state, after the `activeBrush` state from Task 3:

```ts
const [mode, setMode] = useState<'editing' | 'preview'>('editing')
const [editingId, setEditingId] = useState<string | null>(null)
const [savedShapes, setSavedShapes] = useState<CustomBoardShape[]>(() => loadCustomBoardShapes())
const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
```

- [ ] **Step 2: Add `resetToBlank`, `loadShapeIntoCanvas`, and `buildCurrentShape`; gate tile clicks on `mode`**

Add these three functions, replacing `handleSave` from Task 3 (its logic moves into `buildCurrentShape`, reused by both Save and Use This Map):

```ts
const resetToBlank = () => {
  setSelected(new Set())
  setPaintedBiomes(new Map())
  setName('')
  setEditingId(null)
  setActiveBrush(null)
  setMode('editing')
}

// shape.biomeOverrides is keyed by the hyphen format (`${col}-${row}`),
// which is write/lookup-only and never safely split back into numbers
// (see the comment on buildCurrentShape below for why). Looking each
// override up FORWARD from shape.cells' own known col/row — instead of
// trying to parse the override keys apart — sidesteps that entirely.
const loadShapeIntoCanvas = (shape: CustomBoardShape) => {
  setSelected(new Set(shape.cells.map(cellKey)))
  const nextPainted = new Map<string, Biome>()
  for (const cell of shape.cells) {
    const override = shape.biomeOverrides?.[`${cell.col}-${cell.row}`]
    if (override) nextPainted.set(cellKey(cell), override)
  }
  setPaintedBiomes(nextPainted)
  setName(shape.name)
  setEditingId(shape.id)
  setActiveBrush(null)
  setMode('preview')
}

// Shared by the Save button (editing mode) and the Use This Map button
// (preview mode) — in preview mode nothing can have changed since
// loadShapeIntoCanvas ran (tile clicks are disabled outside 'editing'), so
// this reproduces the exact loaded shape; in editing mode it captures
// whatever's just been drawn/painted.
const buildCurrentShape = (): CustomBoardShape => {
  const cells: BoardCell[] = [...selected].map((key) => {
    const [col, row] = key.split(':').map(Number)
    return { col, row }
  })
  // Re-keyed from this component's own colon-separated cellKey format
  // (safely parseable back into numbers, including negatives) to the
  // hyphen format HexTileData.id/buildHexBoardFromCells use — see
  // loadShapeIntoCanvas's own comment for why colon vs. hyphen matters here.
  const biomeOverrides: Record<string, Biome> = {}
  for (const [key, biome] of paintedBiomes) {
    if (!selected.has(key)) continue
    const [col, row] = key.split(':').map(Number)
    biomeOverrides[`${col}-${row}`] = biome
  }
  return {
    id: editingId ?? `custom-${Date.now()}`,
    name: name.trim(),
    cells,
    ...(Object.keys(biomeOverrides).length > 0 ? { biomeOverrides } : {}),
  }
}
```

Replace `handleTileClick` (from Task 3) with the same body plus one new guard line at the top, so it no-ops outside editing mode:

```ts
const handleTileClick = (cell: BoardCell) => {
  if (mode !== 'editing') return
  const key = cellKey(cell)
  const isLand = selected.has(key)
  if (!isLand) {
    toggleCell(cell)
    return
  }
  if (activeBrush === null) {
    toggleCell(cell)
    setPaintedBiomes((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    return
  }
  if (activeBrush === 'erase') {
    setPaintedBiomes((prev) => {
      if (!prev.has(key)) return prev
      const next = new Map(prev)
      next.delete(key)
      return next
    })
    return
  }
  setPaintedBiomes((prev) => new Map(prev).set(key, activeBrush))
}
```

- [ ] **Step 3: Rebuild the JSX — sidebar, mode-aware canvas/controls, preview vs. editing action buttons**

Replace the entire `return (...)` block with:

```tsx
return (
  <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-board-navy/90 backdrop-blur-md">
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="board-shape-editor-heading"
      tabIndex={-1}
      className="flex max-h-[90vh] w-[960px] flex-col rounded-2xl border border-glass-border bg-glass p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
    >
      <h2 id="board-shape-editor-heading" className="font-display text-xl text-white">
        {mode === 'preview' ? 'Preview Board Shape' : 'Draw a Board Shape'}
      </h2>
      <p className="mt-1 font-body text-xs text-white/60">
        {mode === 'preview'
          ? 'This is a saved shape. Use it as-is, or Edit to change it.'
          : 'Click hexes to mark land. Paint a biome onto a tile to fix it — leave tiles unpainted to keep them random. Numbers always shuffle fresh every game.'}
      </p>

      <div className="mt-4 flex min-h-0 flex-1 gap-4">
        <div className="flex w-48 shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-glass-border bg-board-navy/60 p-2">
          <button
            type="button"
            onClick={resetToBlank}
            className="rounded-lg border border-glass-border bg-white/5 py-2 font-body text-[11px] tracking-[0.1em] text-gold uppercase transition-colors hover:border-gold/50"
          >
            + New Map
          </button>
          {savedShapes.length === 0 && (
            <p className="mt-2 px-1 font-body text-[11px] text-white/40">No saved maps yet.</p>
          )}
          {savedShapes.map((shape) => (
            <div
              key={shape.id}
              className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-1.5 ${
                editingId === shape.id ? 'border-gold/60 bg-gold/10' : 'border-glass-border bg-white/5'
              }`}
            >
              <button
                type="button"
                onClick={() => loadShapeIntoCanvas(shape)}
                className="min-w-0 flex-1 truncate text-left font-body text-xs text-white hover:text-gold"
              >
                {shape.name}
                <span className="ml-1 text-white/40">({shape.cells.length})</span>
              </button>
              {pendingDeleteId === shape.id ? (
                <button
                  type="button"
                  onClick={() => {
                    setSavedShapes(deleteCustomBoardShape(shape.id))
                    if (editingId === shape.id) resetToBlank()
                    setPendingDeleteId(null)
                  }}
                  className="shrink-0 font-body text-[10px] font-semibold text-player-1 uppercase"
                >
                  Confirm?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(shape.id)}
                  aria-label={`Delete ${shape.name}`}
                  className="shrink-0 font-body text-xs text-white/40 hover:text-player-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto rounded-xl border border-glass-border bg-board-navy/60 p-3">
            <svg viewBox="-320 -280 640 560" className="mx-auto block h-auto w-full max-w-[680px]">
              {COL_RANGE.flatMap((col) =>
                ROW_RANGE.map((row) => {
                  const cell = { col, row }
                  const key = cellKey(cell)
                  const { x, z } = cellPosition(cell)
                  const cx = x * HEX_PIXEL_RADIUS
                  const cy = z * HEX_PIXEL_RADIUS
                  const isSelected = selected.has(key)
                  const paintedBiome = paintedBiomes.get(key)
                  return (
                    <polygon
                      key={key}
                      points={hexPolygonPoints(cx, cy, HEX_PIXEL_RADIUS - 1.5)}
                      onClick={() => handleTileClick(cell)}
                      className={`stroke-white/15 transition-colors ${mode === 'editing' ? 'cursor-pointer' : 'cursor-default'} ${
                        !isSelected ? 'fill-white/5 hover:fill-white/15' : paintedBiome ? '' : 'fill-gold/80 hover:fill-gold'
                      }`}
                      style={paintedBiome ? { fill: BIOME_COLORS[paintedBiome] } : undefined}
                      strokeWidth={1}
                    />
                  )
                }),
              )}
            </svg>
          </div>

          <div className="mt-3 flex items-center justify-between font-body text-[11px] text-white/50">
            <span>{selected.size} tiles selected</span>
            {selected.size > 0 && !connected && (
              <span className="text-player-1">Not all connected — every tile needs a land neighbor.</span>
            )}
          </div>

          {mode === 'editing' && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="font-body text-[11px] tracking-[0.1em] text-white/50 uppercase">Paint biome</span>
              {BIOME_PALETTE.map((biome) => (
                <button
                  key={biome}
                  type="button"
                  onClick={() => setActiveBrush((prev) => (prev === biome ? null : biome))}
                  aria-label={`Paint ${biome}`}
                  aria-pressed={activeBrush === biome}
                  title={biome}
                  className={`h-6 w-6 rounded-full border-2 transition-transform ${
                    activeBrush === biome ? 'scale-110 border-white' : 'border-white/30 hover:border-white/60'
                  }`}
                  style={{ backgroundColor: BIOME_COLORS[biome] }}
                />
              ))}
              <button
                type="button"
                onClick={() => setActiveBrush((prev) => (prev === 'erase' ? null : 'erase'))}
                aria-label="Clear painted biome"
                aria-pressed={activeBrush === 'erase'}
                className={`rounded-lg border px-2 py-1 font-body text-[10px] tracking-[0.05em] uppercase transition-colors ${
                  activeBrush === 'erase' ? 'border-gold text-gold' : 'border-glass-border text-white/50 hover:text-white'
                }`}
              >
                Erase
              </button>
            </div>
          )}

          {mode === 'editing' && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name this shape"
                aria-label="Shape name"
                maxLength={30}
                className="min-w-0 flex-1 rounded-lg border border-glass-border bg-white/5 px-3 py-2 font-body text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set())
                  setPaintedBiomes(new Map())
                }}
                className="rounded-lg border border-glass-border bg-white/5 px-3 py-2 font-body text-[11px] tracking-[0.1em] text-white/60 uppercase transition-colors hover:border-player-1/50 hover:text-player-1"
              >
                Clear
              </button>
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-glass-border bg-white/5 py-2.5 font-display text-sm font-semibold text-white transition-colors hover:border-white/30"
            >
              Cancel
            </button>
            {mode === 'preview' ? (
              <>
                <button
                  type="button"
                  onClick={() => setMode('editing')}
                  className="flex-1 rounded-lg border border-gold/50 bg-white/5 py-2.5 font-display text-sm font-semibold text-gold transition-colors hover:border-gold"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onSave(buildCurrentShape())}
                  className="flex-1 rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95"
                >
                  Use This Map
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!canSave}
                onClick={() => onSave(buildCurrentShape())}
                className="flex-1 rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                Save Shape
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
)
```

- [ ] **Step 4: Type-check, lint, and build**

Run: `cd catan-3d && npx tsc -b && npx eslint src/components/hud/BoardShapeEditor.tsx && npm run build`
Expected: no errors. If `tsc -b` flags `canSave`/`connected` as unused in preview mode — it won't, both are still read (`canSave` gates the Save button, `connected` still renders the warning text) — but double check the diff didn't drop either.

- [ ] **Step 5: Manual verification in the browser**

Restart the dev server if needed. Draw and save a shape with a couple of painted tiles. Reopen the editor — the sidebar should list it. Click it: canvas shows the shape read-only (clicking tiles does nothing), painted tiles keep their color, name field is gone (preview mode), buttons read Cancel / Edit / Use This Map. Click Edit — tile clicks work again, Save Shape replaces the bottom-right button. Click the ✕ next to a saved map, then Confirm? — it disappears from the sidebar; if it was the one loaded, the canvas resets to blank. Click + New Map at any point — canvas clears and returns to editing mode.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/components/hud/BoardShapeEditor.tsx
git commit -m "feat: add a sidebar to browse, preview, edit, and delete saved custom maps"
```

---

### Task 5: Thread `biomeOverrides` through the online/snapshot pipeline

**Files:**
- Modify: `catan-3d/src/components/hud/StartScreen.tsx`
- Modify: `catan-3d/src/components/hud/RoomLobby.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`
- Modify: `catan-3d/src/multiplayer/matchSnapshot.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `buildHexBoard(seed?, shapeId?, customCells?, customBiomeOverrides?)` from Task 2; `CustomBoardShape.biomeOverrides` from Task 1.
- Produces: `GameStartInfo.customBoardBiomeOverrides?: Record<string, Biome>`, `MatchSnapshot.customBoardBiomeOverrides?: Record<string, Biome>`, `GameStartedPayload`/`RoomChannelHandlers.onGameStarted`/`broadcastGameStarted` all gain a trailing `customBoardBiomeOverrides?: Record<string, Biome>`. This mirrors exactly how `customBoardCells`/`customBoardName` already flow through every one of these files — same optional-field, same "only present for a custom shape" pattern.

This task is pure plumbing (no new logic, no new UI) — every step is a small, mechanical addition parallel to an existing field. No automated tests (there's nothing here with independent logic to unit-test; correctness is "does it thread through," verified by `tsc -b` and the live two-tab test in Task 6).

- [ ] **Step 1: `StartScreen.tsx` — `GameStartInfo.customBoardBiomeOverrides`**

Update the type import at the top:

```ts
import type { BoardCell, BoardShapeId, Biome } from '../../data/hexBoard'
```

Add the field to `GameStartInfo`, right after `customBoardName?: string`:

```ts
customBoardCells?: BoardCell[]
customBoardName?: string
customBoardBiomeOverrides?: Record<string, Biome>
```

In the `onConfirmCustom` callback's `kind === 'local'` branch, add the new field to the `onStart({...})` call:

```ts
onStart({
  ...pendingRegionSelect.info,
  boardShapeId: undefined,
  customBoardCells: shape.cells,
  customBoardName: shape.name,
  customBoardBiomeOverrides: shape.biomeOverrides,
})
```

The `kind === 'host'` branch needs no change — it already carries the whole `shape: CustomBoardShape` object into `HostRegionConfig.customBoardShape`, which now includes `biomeOverrides` automatically via Task 1's type change.

- [ ] **Step 2: `RoomLobby.tsx` — broadcast and local `onStart`**

Replace the `onGameStarted` handler passed to `useRoomChannel` (starts with `onGameStarted: (` right after the `// Only meaningful for a joiner...` comment, ends at the closing `},` right before `})` closes the `useRoomChannel(...)` call) with:

```ts
onGameStarted: (
  names,
  hostName,
  receivedBoardShapeId,
  receivedGameRules,
  receivedCustomCells,
  receivedCustomName,
  receivedClientIds,
  receivedColorTokens,
  receivedCustomBiomeOverrides,
) => {
  onStart({
    playerCount: names.length,
    names,
    // Prefer the host's own authoritative array when the broadcast
    // carries one — every receiver resolving colors independently off
    // its own local presence snapshot (the old behavior, kept below as
    // a fallback for an older/mismatched build) is exactly what let two
    // clients start the same match with two different colors on the
    // same seat: track() is debounced 400ms, so that local snapshot can
    // be stale at the instant this broadcast lands.
    colorTokens:
      receivedColorTokens ??
      names.map((name, index) => {
        const matchId = receivedClientIds?.[index]
        const match = matchId ? players.find((p) => p.id === matchId) : players.find((p) => p.name === name)
        return match?.colorToken ?? ALL_COLOR_TOKENS[index % ALL_COLOR_TOKENS.length]
      }),
    gameRules: receivedGameRules,
    boardShapeId: receivedBoardShapeId,
    customBoardCells: receivedCustomCells,
    customBoardName: receivedCustomName,
    customBoardBiomeOverrides: receivedCustomBiomeOverrides,
    online: {
      roomCode,
      localPlayerName: selfName,
      isHost: normalizePlayerName(selfName) === normalizePlayerName(hostName),
      // Lets App.tsx resolve "which seat am I" by stable clientId
      // instead of re-matching selfName against `names` — the host's
      // own view of this name can still be stale (track() is
      // debounced) the instant they click Start Game, which used to
      // permanently lock a fast-typing joiner out of their own turn.
      localClientId: clientId,
      clientIds: receivedClientIds,
      hostName,
    },
  })
},
```

In `handleStart()`, replace the `broadcastGameStarted(...)` call with:

```ts
broadcastGameStarted(
  names,
  selfName,
  currentBoardShapeId ?? 'standard',
  props.gameRules,
  currentCustomBoardShape?.cells,
  currentCustomBoardShape?.name,
  clientIds,
  colorTokens,
  currentCustomBoardShape?.biomeOverrides,
)
```

And, right after it in the same `handleStart()`, replace the `onStart({...})` call with:

```ts
onStart({
  playerCount: names.length,
  names,
  colorTokens,
  gameRules: props.gameRules,
  boardShapeId: currentBoardShapeId,
  customBoardCells: currentCustomBoardShape?.cells,
  customBoardName: currentCustomBoardShape?.name,
  customBoardBiomeOverrides: currentCustomBoardShape?.biomeOverrides,
  online: { roomCode, localPlayerName: selfName, isHost: true, localClientId: clientId, clientIds, hostName: selfName },
})
```

- [ ] **Step 3: `useRoomChannel.ts` — `GameStartedPayload`, handler, broadcast function**

Update the type import at the top:

```ts
import type { BoardCell, BoardShapeId, Biome } from '../data/hexBoard'
```

Add the field to `GameStartedPayload`, right after `colorTokens?: PlayerColorToken[]`:

```ts
// Also parallel to `names`/`cells` — the specific biome painted onto each
// tile of a custom shape, if any. Sparse (only painted tiles are keys) and
// keyed the same way HexTileData.id already is. Absent whenever the match
// isn't on a custom shape, or the custom shape has no painted tiles.
customBoardBiomeOverrides?: Record<string, Biome>
```

Add the trailing parameter to `RoomChannelHandlers.onGameStarted`'s signature:

```ts
onGameStarted?: (
  names: string[],
  hostName: string,
  boardShapeId: BoardShapeId,
  gameRules: GameRules,
  customBoardCells?: BoardCell[],
  customBoardName?: string,
  clientIds?: string[],
  colorTokens?: PlayerColorToken[],
  customBoardBiomeOverrides?: Record<string, Biome>,
) => void
```

In the `channel.on<GameStartedPayload>('broadcast', { event: 'game-started' }, ...)` handler, add the new argument to the `handlersRef.current.onGameStarted?.(...)` call:

```ts
handlersRef.current.onGameStarted?.(
  payload.names,
  payload.hostName,
  payload.boardShapeId,
  payload.gameRules,
  payload.customBoardCells,
  payload.customBoardName,
  payload.clientIds,
  payload.colorTokens,
  payload.customBoardBiomeOverrides,
)
```

Add the trailing parameter to `broadcastGameStarted`'s signature and include it in the sent payload:

```ts
const broadcastGameStarted = (
  names: string[],
  hostName: string,
  boardShapeId: BoardShapeId,
  gameRules: GameRules,
  customBoardCells?: BoardCell[],
  customBoardName?: string,
  clientIds?: string[],
  colorTokens?: PlayerColorToken[],
  customBoardBiomeOverrides?: Record<string, Biome>,
) => {
  void channelRef.current?.send({
    type: 'broadcast',
    event: 'game-started',
    payload: {
      names,
      hostName,
      boardShapeId,
      gameRules,
      customBoardCells,
      customBoardName,
      clientIds,
      colorTokens,
      customBoardBiomeOverrides,
    },
  })
}
```

- [ ] **Step 4: `matchSnapshot.ts` — `MatchSnapshot.customBoardBiomeOverrides`**

Update the type import at the top:

```ts
import type { BoardCell, BoardShapeId, Biome } from '../data/hexBoard'
```

Add the field to `MatchSnapshot`, right after `customBoardCells?: BoardCell[]`:

```ts
customBoardCells?: BoardCell[]
customBoardBiomeOverrides?: Record<string, Biome>
```

No change needed to `isPlausibleMatchSnapshot` — this field, like `customBoardCells`, is only ever read through `??`/optional chaining in `restoreFromSnapshot` (Step 5 below), so it isn't one of the fields that guard checks.

- [ ] **Step 5: `App.tsx` — state, `resetGame`, `restoreFromSnapshot`, `startGame`, autosave**

Update the hexBoard type import at the top:

```ts
import { buildHexBoard, type BoardCell, type BoardShapeId, type Biome } from './data/hexBoard'
```

Add new state, right after `customBoardCells`'s own declaration:

```ts
const [customBoardCells, setCustomBoardCells] = useState<BoardCell[] | undefined>(undefined)
const [customBoardBiomeOverrides, setCustomBoardBiomeOverrides] = useState<Record<string, Biome> | undefined>(undefined)
```

Replace `resetGame`'s signature and the first part of its body — from the `const resetGame = (` line through the `setTiles(freshTiles)` line (do not touch anything from `setRobberTileId(...)` onward; that part of the function is unrelated and unchanged) — with:

```ts
const resetGame = (
  count: number,
  names?: string[],
  online?: {
    roomCode: string
    localPlayerName: string
    isHost: boolean
    localClientId?: string
    clientIds?: string[]
    hostName?: string
  },
  // A restart needs a NEW layout, not the same one every time — the room
  // code alone is a constant seed, so reusing it here would reshuffle to
  // the exact same board on every "New Game". restartGame generates a
  // fresh seed and broadcasts it; every other caller (a fresh Start Game
  // submission) omits this and falls back to the room-code seed below, so
  // every client's first buildHexBoard() call still lands on the
  // IDENTICAL tile layout without any of them needing to coordinate one.
  boardSeed?: string,
  // Present only on a fresh Start Game submission (LocalSetup/OnlineSetup
  // both always pass one). Omitted on restart/return-to-menu, which fall
  // back to the CURRENT boardShapeId state — "New Game" reshuffles tiles
  // but deliberately keeps whatever shape was originally chosen.
  shapeId?: BoardShapeId,
  // Set together with shapeId on a fresh submission — a player-drawn
  // shape's raw cells, or undefined if they picked a built-in one (which
  // must still WIN over a stale custom shape from an earlier game this
  // session, hence gating on isFreshSubmission below rather than `??`).
  customCells?: BoardCell[],
  // Present only on a fresh submission — same "keeps the prior value on
  // restart" treatment as shapeId, gated on the SAME isFreshSubmission
  // flag rather than its own presence check.
  rules?: GameRules,
  colorTokens?: PlayerColorToken[],
  // Same "present only on a fresh submission" treatment as customCells —
  // gated on the SAME isFreshSubmission flag, so "New Game" (no shapeId
  // passed) keeps whatever custom biome painting was already active
  // instead of losing it.
  customBiomeOverrides?: Record<string, Biome>,
) => {
  const isFreshSubmission = shapeId !== undefined
  const effectiveShapeId = shapeId ?? boardShapeId
  const effectiveCustomCells = isFreshSubmission ? customCells : customBoardCells
  const effectiveCustomBiomeOverrides = isFreshSubmission ? customBiomeOverrides : customBoardBiomeOverrides
  const effectiveRules = isFreshSubmission ? (rules ?? gameRules) : gameRules
  setBoardShapeId(effectiveShapeId)
  setCustomBoardCells(effectiveCustomCells)
  setCustomBoardBiomeOverrides(effectiveCustomBiomeOverrides)
  setGameRules(effectiveRules)
  setTotalRollsThisGame(0)
  setConsecutiveDoublesThisTurn(0)
  // Local Pass & Play omits the seed entirely and keeps its original
  // random board.
  const effectiveBoardSeed = online ? (boardSeed ?? online.roomCode) : undefined
  const freshTiles = buildHexBoard(effectiveBoardSeed, effectiveShapeId, effectiveCustomCells, effectiveCustomBiomeOverrides)
  setTiles(freshTiles)
```

In `startGame`, replace the `resetGame(...)` call with:

```ts
resetGame(
  info.playerCount,
  info.names,
  info.online,
  undefined,
  info.boardShapeId ?? 'standard',
  info.customBoardCells,
  info.gameRules ?? DEFAULT_GAME_RULES,
  info.colorTokens,
  info.customBoardBiomeOverrides,
)
```

In `restoreFromSnapshot`, replace this contiguous block (its signature is unchanged, only the body from `setBoardShapeId` through the `buildHexBoard` line changes):

```ts
const shapeId = snapshot.boardShapeId ?? 'standard'
setBoardShapeId(shapeId)
setCustomBoardCells(snapshot.customBoardCells)
setGameRules(snapshot.gameRules ?? DEFAULT_GAME_RULES)
setTotalRollsThisGame(snapshot.totalRollsThisGame ?? 0)
setConsecutiveDoublesThisTurn(snapshot.consecutiveDoublesThisTurn ?? 0)
setStartingPlayerIndex(snapshot.startingPlayerIndex ?? 0)
const freshTiles = buildHexBoard(online.roomCode, shapeId, snapshot.customBoardCells)
```

with:

```ts
const shapeId = snapshot.boardShapeId ?? 'standard'
setBoardShapeId(shapeId)
setCustomBoardCells(snapshot.customBoardCells)
setCustomBoardBiomeOverrides(snapshot.customBoardBiomeOverrides)
setGameRules(snapshot.gameRules ?? DEFAULT_GAME_RULES)
setTotalRollsThisGame(snapshot.totalRollsThisGame ?? 0)
setConsecutiveDoublesThisTurn(snapshot.consecutiveDoublesThisTurn ?? 0)
setStartingPlayerIndex(snapshot.startingPlayerIndex ?? 0)
const freshTiles = buildHexBoard(online.roomCode, shapeId, snapshot.customBoardCells, snapshot.customBoardBiomeOverrides)
```

In the autosave `useEffect`, replace the `snapshot: MatchSnapshot = {` object literal's first two data fields and the effect's dependency array's matching two entries. The object literal currently starts:

```ts
const snapshot: MatchSnapshot = {
  hostName: onlineInfo.hostName,
  boardShapeId,
  customBoardCells,
  gameRules,
```

replace with:

```ts
const snapshot: MatchSnapshot = {
  hostName: onlineInfo.hostName,
  boardShapeId,
  customBoardCells,
  customBoardBiomeOverrides,
  gameRules,
```

and the dependency array currently starts:

```ts
}, [
  onlineInfo,
  isEffectiveHost,
  gameStarted,
  boardShapeId,
  customBoardCells,
  gameRules,
```

replace with:

```ts
}, [
  onlineInfo,
  isEffectiveHost,
  gameStarted,
  boardShapeId,
  customBoardCells,
  customBoardBiomeOverrides,
  gameRules,
```

Nothing else in the snapshot object or the dependency array changes — both continue exactly as they already do today past `gameRules,`.
```

- [ ] **Step 6: Type-check, lint, test, and build**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run && npm run build`
Expected: no errors, all tests pass. `tsc -b` is the important check here — it confirms every one of the five files' new optional parameters/fields line up positionally and by type with how every caller invokes them.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/components/hud/StartScreen.tsx catan-3d/src/components/hud/RoomLobby.tsx catan-3d/src/multiplayer/useRoomChannel.ts catan-3d/src/multiplayer/matchSnapshot.ts catan-3d/src/App.tsx
git commit -m "feat: thread painted biome overrides through online start/broadcast/snapshot"
```

---

### Task 6: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Full automated check**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run && npm run build`
Expected: zero errors across all four, all tests passing (58 pre-existing + the new ones from Tasks 1–2).

- [ ] **Step 2: Live local-play check**

Start the dev server, open the app, Pass & Play → Custom Maps → draw a shape, paint 2–3 tiles with different biomes, save, start the game. On the actual 3D board, confirm the painted tiles show the correct biome and every other tile looks normally random. Open the browser console — no errors.

- [ ] **Step 3: Live two-client online check**

With two browser tabs (or two browser profiles) pointed at the same dev server: host a room, pick Custom Maps, load a previously-saved painted shape from the sidebar (not a freshly-drawn one — this specifically exercises the `biomeOverrides` broadcast path), hit Use This Map, and have the second tab join. Confirm both tabs' boards show the identical painted tiles in the identical spots. Check both consoles for errors.

- [ ] **Step 4: Report back**

Summarize what was verified and flag anything that didn't match expectations before considering this feature done.
