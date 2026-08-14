# Custom Map Editor v2 — Design

**Date:** 2026-08-14
**Status:** Approved by user, ready for implementation planning

## Context

`catan-3d`'s custom board editor (`BoardShapeEditor.tsx`, opened from `RegionSelectMenu.tsx`'s "Custom Maps" row) currently only lets a player draw the *shape* of a board — click hexes to mark land, with a live "is this one connected landmass" check. Biome and number-token placement is always fully random, generated fresh every game via `buildHexBoardFromCells` in `hexBoard.ts`.

Saved shapes persist to `localStorage` via `saveCustomBoardShape` (`data/customBoardShapes.ts`), keyed by `id`. `loadCustomBoardShapes` exists in that same file but nothing in the UI currently calls it — there is no way to browse, reload, or delete a previously drawn shape. The flow today is strictly: draw → save → play, once, with no revisiting.

This design adds three things, confirmed with the user:

1. A sidebar in the editor listing every saved custom map, with select/preview, edit, and delete.
2. The ability to paint a specific biome onto specific tiles while drawing, instead of leaving every tile's biome to chance.
3. (Falls out of #2, not a separate mechanism) — the "amount of resources" on a map is simply whatever the player paints; there is no separate ratio-only control.

## Decisions from clarifying questions

- **One mechanism, not two.** Painting a tile's exact biome *is* the resource-count control. No separate ratio/count editor.
- **Partial painting is allowed.** A tile can be left unpainted (shuffles randomly each game, exactly like today). Players paint only the tiles they care about — e.g. force a desert in one corner, leave the rest random.
- **Number tokens stay random**, always. Only biome is paintable. This keeps some replayability even on a fully hand-painted map, and keeps scope smaller.
- **Sidebar interaction:** clicking a saved map's row selects it and loads it into the canvas as a **read-only preview** (tile clicks do nothing). A **"Use This Map"** button appears once something is selected/previewed, and confirms + starts a game with it directly — no need to enter edit mode. A separate **"Edit"** button switches the loaded map into an editable canvas (tile clicks now paint/toggle, Save applies). **"New Map"** clears the canvas to a blank, immediately-editable state (today's default).
- Deleting a saved map has its own confirm step (the old `ConfirmDialog.tsx` was deleted as dead code earlier this session — either revive a similar small confirm affordance, or use a lightweight inline "click again to confirm" pattern; implementation detail, not a design fork).

## Data model changes

`data/customBoardShapes.ts`:

```ts
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
```

`cells: BoardCell[]` itself is **untouched** — shape and painted biome stay separate concerns. Nothing that only cares about shape (built-in `BOARD_SHAPES`, `boardGraph.ts`, `cellNeighbors`/`cellPosition`) needs to change.

`loadCustomBoardShapes` needs to become `export`ed again (it was just made private during this session's dead-code cleanup, on the correct assumption at the time that nothing called it — this feature is what gives it a real external caller again). `deleteCustomBoardShape` needs to be re-added (it was deleted as genuinely dead code this session; this feature is exactly what makes it live).

## Generation logic changes

`data/hexBoard.ts`'s `buildHexBoardFromCells(cells, seed?, desertOverride?)` gains a new optional parameter, `biomeOverrides?: Record<string, Biome>`.

Naively subtracting painted counts from each biome's target (then filling the remainder) breaks the moment someone paints *more* of a biome than its natural share — the remaining per-biome targets no longer sum to the actual number of unpainted tiles, and in the extreme (every biome already at/over quota, but tiles are still unpainted) it's a divide-by-zero waiting to happen. The simpler, always-correct approach: build the existing full-board pool exactly as today, then *consume* matching entries out of it for painted tiles, and only random-assign whatever's left.

Algorithm:
1. Build `pool = buildBiomePool(tileCount, desertCount)` — the existing function, **completely unchanged** — a `tileCount`-length array already matching the target biome/desert ratio for a board this size, then shuffle it (existing seeded-shuffle machinery, unchanged).
2. For each painted tile (in `biomeOverrides`), remove one matching entry for that biome from the pool (`indexOf` + `splice`) — best-effort: if that biome isn't left in the pool (painted more of it than its natural share), just leave the pool alone for that tile. This is what naturally caps a biome at "0 more added randomly" once its natural share is used up, without any separate floor/clamp logic.
3. The pool may now be longer than the number of actually-unpainted tiles (whenever step 2 couldn't find a match for some painted tile). Shuffle again and `slice(0, unpaintedCount)` — this both fixes the length and means any discarded excess is random, not a fixed tail.
4. Assign: painted cells get their fixed override biome directly; unpainted cells consume the final pool in order, exactly like today's single sequential assignment.
5. Desert count still comes from `desertCountFor`/`desertOverride` exactly as today (unaffected — desert is just one more entry in the same pool, handled by the same steps above, no special-casing needed).

This keeps a partially-painted board close to the standard overall ratio instead of the painted tiles skewing it (e.g. painting 3 mountains on a standard-sized board means 0 more mountains get added randomly, not 3 extra on top of a full random allocation), degrades gracefully when painting is unbalanced (excess painted biome is simply not replenished, never a crash), and reuses `buildBiomePool`/`shuffle` verbatim rather than introducing new allocation math.

Numbers: `buildNumberPool`/number assignment is **unchanged** — always fully random across all non-desert tiles, painted or not.

## UI changes

### `BoardShapeEditor.tsx`

- New sidebar (left rail, alongside the existing canvas) listing saved shapes via `loadCustomBoardShapes()` — name + tile count per row.
- Row click → loads that shape's `cells`/`biomeOverrides`/`name` into local state, sets a new `mode: 'preview' | 'editing'` to `'preview'`. In preview mode, tile clicks are disabled; the canvas still renders the shape and painted biomes (colored by biome, unpainted tiles in the existing neutral "land" color) so the player can see exactly what they're about to use.
- Delete action per row (with a confirm step) calls `deleteCustomBoardShape(id)` and refreshes the list; if the deleted shape is the one currently loaded, reset the canvas to blank/editable.
- **"Use This Map"** button (visible whenever `mode === 'preview'`): calls `onSave` (or a new equivalently-named callback) with the currently-loaded shape as-is, without requiring a save step first (it's already saved — this just confirms+plays it).
- **"Edit"** button (visible whenever `mode === 'preview'`): flips `mode` to `'editing'`, enabling tile interaction on the already-loaded shape.
- **"New Map"** button: clears all canvas state (`selected`, `biomeOverrides`, `name`) and sets `mode` to `'editing'` — matches today's only current behavior, now reachable as an explicit reset rather than the sole default.
- Biome palette: a small row of the 6 biome swatches (matching `BIOME_COLORS`) plus a "clear to random" eraser, shown only in `'editing'` mode. Selecting a swatch sets an `activeBrush: Biome | 'erase' | null` state.
- Tile click behavior in `'editing'` mode:
  - Water tile clicked → added to shape as land (today's behavior, unchanged), no biome painted.
  - Land tile clicked, `activeBrush` is a biome → paint that biome onto it (stays in shape either way).
  - Land tile clicked, `activeBrush === 'erase'` → clear any painted biome on it back to random (stays in shape).
  - Land tile clicked, `activeBrush === null` (no brush selected) → removes it from the shape (today's toggle-off behavior, preserved as the default/no-brush interaction).
- Save button (only meaningful in `'editing'` mode): unchanged upsert-by-id semantics via `saveCustomBoardShape` — overwrites if editing a loaded shape, creates new if starting from "New Map".

### `RegionSelectMenu.tsx`

Minimal change: `BoardShapeEditor`'s `onSave` callback already flows into `onConfirmCustom` → `saveCustomBoardShape` → confirm. The "Use This Map" action funnels through the same path (it's really just "save-then-confirm" on an already-saved shape, which is a no-op save). No structural change expected here beyond whatever prop/callback renaming falls out of the editor's own new modes.

### `data/hexBoard.ts` callers

`buildHexBoard`/`buildHexBoardFromCells` callers (App.tsx's `resetGame`/`restoreFromSnapshot`, `RoomLobby.tsx`'s game-started broadcast path) need to thread `biomeOverrides` alongside the existing `customBoardCells`/`customBoardName` — same broadcast/snapshot payload shape, one more optional field, same "only present for a custom shape" pattern already established for `customBoardCells`.

## Out of scope for this pass (explicitly deferred)

Raised as possible follow-ups, not part of this design:
- Preview thumbnails in the sidebar (tiny rendered hex-grid icon per row)
- "Duplicate" action on a saved map (save-as-copy)
- A live paint-progress counter ("3/3 mountains painted") while editing
