# Seafarers Ships & Longest Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ship building/movement (`BUILD_SHIP`, `MOVE_SHIP`) to the board/players reducers, and extend Longest Road into Longest Route (roads+ships, breaking only at non-owned buildings) — reducer-level and algorithm-level correctness, fully tested via Vitest, with dispatch/eligibility plumbing wired in `App.tsx` and multiplayer broadcast wired in `useRoomChannel.ts`. No 3D click-to-place UI in this plan (see Global Constraints).

**Architecture:** Ships are a second `Record<edgeId, playerId>` map on `BoardState`, sibling to `roads`, built/moved via two new `BoardAction` cases that are near-verbatim copies of the existing `BUILD_ROAD`/`REMOVE_ROAD` cases — no new reducer pattern. `calculateLongestRoad` (`game/trophies.ts`) gains an optional `ships` parameter (defaulted to `{}`, so every existing call site and test is untouched) and threads an edge-type ('road'/'ship') through its DFS to enforce the "only chain at your own building" rule. Placement/movement eligibility (which edges are legal) lives in `App.tsx` as plain helper functions mirroring the existing road-eligibility helpers exactly, dispatched and broadcast through the same generic `dispatchGameAction`/`broadcastGameAction` machinery every other board-piece action already uses.

**Tech Stack:** TypeScript, Vitest, the existing reducer/broadcast conventions established across this project's players-slice migration and Board Foundation sub-plan.

**Spec:** `docs/superpowers/specs/2026-08-23-seafarers-ships-open-sea-design.md` (see its "Actions", "Longest Route", and "Setup change" sections). Rules verified verbatim against `docs/superpowers/specs/references/seafarers-rules-reference.md`'s "Ships" section — placement rules, movement rules, and the Longest Route nuance are all cited there directly; this plan's eligibility checks implement those citations precisely, not a paraphrase.

## Global Constraints

- **No 3D ship-placement UI in this plan.** `RegionSelectMenu.tsx` still doesn't offer `seafarersBasic` (deferred by Board Foundation's own plan, still unresolved), and no `EdgeSlot`-style clickable ship hitbox exists yet. This plan builds ship building/movement as dispatchable, fully-tested reducer + eligibility-helper + broadcast logic — exercised via Vitest and direct dispatch, not yet reachable by clicking anything in the 3D scene. Wiring real 3D ship placement is a follow-up once the board-shape picker itself is wired in.
- **The pirate does not exist yet** (Robber & Pirate Migration is the next sub-plan after this one). CN3083's ship-placement/movement rules include "not adjacent to the pirate's hex" — this plan cannot implement that clause, since there is no `pirateTileId` to check against. Every ship eligibility helper this plan adds has a comment flagging this gap explicitly. **The next sub-plan (Robber & Pirate Migration) must revisit `edgeTouchesSea`'s call sites in `App.tsx` (`buildShipRaw`, `moveShipRaw`) to add the pirate-adjacency block once `pirateTileId` exists** — do not let this silently stay missing.
- **Setup-phase ship substitution is out of scope.** `BUILD_SHIP` carries an `isSetup: boolean` field for forward compatibility with the spec's data model, but `buildShipRaw` (this plan's only call site) never dispatches with `isSetup: true` — there is no setup-flow UI change in this plan. Whichever sub-plan eventually wires the new board shape into the setup flow will add that call site.
- **New shared multiplayer state goes into the reducer, not `useState`** (`CONVENTIONS.md` §1, restated in the parent spec's own Global Constraints). Per-turn ship tracking (`shipsBuiltThisTurn`, `hasMovedShipThisTurn`) therefore lives on `BoardState`, cleared via the existing `TURN_ADVANCED` action — not as a new local `useState`, even though the pre-existing `freeRoadsRemaining`/`hasRolledThisTurn` are (legacy, predates this rule; not a template to copy for new state).
- **`npm run build` is a mandatory verification command for every task in this plan**, in addition to `tsc -b`/`eslint`/`vitest run`. This project's own Board Foundation sub-plan shipped a real build-breaking regression that all three of those missed (a broken `.glb` import) and only `vite build` caught — `catan-3d/package.json`'s existing `"build"` script already runs `tsc -b && vite build`, so use it directly rather than the separate three-command sequence.
- **Grep for hand-maintained lists before finishing any task that adds a new `BoardAction`/`PlayersAction` variant.** Board Foundation's own final review found a real bug this way (`MerchantLayer.tsx`'s hand-maintained `LAND_BIOMES` array silently missing a new biome value — `tsc` cannot catch a non-exhaustive plain array). This plan's own `describeBoardAction` switch (`game/reducers/board.ts`) is one such list this plan touches directly (Task 2); check for others before each task's final commit.
- Every new/changed reducer case follows the "pure appliers, no re-validation" convention already established: eligibility is checked once, in `App.tsx`, before dispatch — the reducer trusts the action's fields and never re-derives or re-checks them.

## Task 1: Data model — ships, per-turn ship tracking, sea-adjacency graph primitive, snapshot persistence

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/game/types.ts`
- Modify: `catan-3d/src/data/boardGraph.ts`
- Modify: `catan-3d/src/multiplayer/matchSnapshot.ts`
- Modify: `catan-3d/src/App.tsx`
- Test: `catan-3d/src/game/reducers/board.test.ts`
- Test: `catan-3d/src/data/boardGraph.test.ts`
- Test: `catan-3d/src/game/types.test.ts`

**Interfaces:**
- Produces: `BoardState` gains `ships: Record<string, number>`, `shipsBuiltThisTurn: string[]`, `hasMovedShipThisTurn: boolean`. `Player` gains `shipsRemaining: number`. `BoardGraph` gains `edgeTileIds: Map<string, string[]>` (edge id → the 1 or 2 tile ids sharing that edge). New constants `STARTING_SHIPS = 15`, `SHIP_COST: Partial<Resources> = { lumber: 1, wool: 1 }` in `game/types.ts`.
- Consumes: nothing new from other tasks — this is the foundation task every other task in this plan depends on.

Current state (verified by direct read):
- `catan-3d/src/game/reducers/board.ts:5-13`: `BoardState`/`initialBoardState` (2 fields: `settlements`, `roads`).
- `catan-3d/src/game/reducers/board.ts:52-59`: `RESET_BOARD`/`RESTORE_BOARD` cases.
- `catan-3d/src/data/boardGraph.ts:18-33`: `BoardGraph` interface (6 fields, no per-edge tile lookup).
- `catan-3d/src/data/boardGraph.ts:72-114`: `buildBoardGraph`'s per-tile corner loop, where edges are constructed.
- `catan-3d/src/game/types.ts:156-189`: `Player` interface. `roadsRemaining` at line 165 is the field to mirror.
- `catan-3d/src/game/types.ts:353,357`: `STARTING_ROADS = 15`, `ROAD_COST: Partial<Resources> = { lumber: 1, brick: 1 }` — the exact constants to mirror.
- `catan-3d/src/game/types.ts:495-527`: `createInitialPlayers` — `roadsRemaining = Math.ceil(STARTING_ROADS * scale)` (line 506) computed alongside `settlementsRemaining`/`citiesRemaining`, then spread into the returned object literal (line 517).
- `catan-3d/src/multiplayer/matchSnapshot.ts:50-51`: `MatchSnapshot.settlements`/`.roads` (required fields).
- `catan-3d/src/App.tsx:6097`: `dispatch({ type: 'RESTORE_BOARD', settlements: snapshot.settlements, roads: snapshot.roads })`.
- `catan-3d/src/App.tsx:6347-6348`: snapshot save, `settlements: gameState.board.settlements, roads: gameState.board.roads,`.
- `catan-3d/src/App.tsx:6069-6087`: `normalizedPlayers` restore-normalization map — the `?? fallback` pattern every optional-since-some-version `Player` field uses (`commodities: p.commodities ?? emptyCommodities()` etc.).

- [ ] **Step 1: Write the failing tests**

```ts
// catan-3d/src/game/reducers/board.test.ts — new describe block
describe('reduceBoard — ships data model', () => {
  it('initialBoardState has empty ships and clean per-turn ship tracking', () => {
    expect(initialBoardState.ships).toEqual({})
    expect(initialBoardState.shipsBuiltThisTurn).toEqual([])
    expect(initialBoardState.hasMovedShipThisTurn).toBe(false)
  })

  it('RESET_BOARD clears ships and per-turn ship tracking', () => {
    const dirty = {
      settlements: {},
      roads: {},
      ships: { E1: 1 },
      shipsBuiltThisTurn: ['E1'],
      hasMovedShipThisTurn: true,
    }
    const result = reduceBoard(dirty, { type: 'RESET_BOARD' }, initialGameState)
    expect(result.ships).toEqual({})
    expect(result.shipsBuiltThisTurn).toEqual([])
    expect(result.hasMovedShipThisTurn).toBe(false)
  })

  it('RESTORE_BOARD restores ships and per-turn ship tracking verbatim', () => {
    const result = reduceBoard(
      initialBoardState,
      {
        type: 'RESTORE_BOARD',
        settlements: {},
        roads: {},
        ships: { E1: 2 },
        shipsBuiltThisTurn: ['E1'],
        hasMovedShipThisTurn: true,
      },
      initialGameState,
    )
    expect(result.ships).toEqual({ E1: 2 })
    expect(result.shipsBuiltThisTurn).toEqual(['E1'])
    expect(result.hasMovedShipThisTurn).toBe(true)
  })
})
```

```ts
// catan-3d/src/data/boardGraph.test.ts — new describe block
describe('buildBoardGraph — edgeTileIds', () => {
  it('gives a single-tile board every edge exactly one adjacent tile id', () => {
    const tiles = [{ id: '0-0', col: 0, row: 0, x: 0, z: 0, biome: 'fields' as const, number: 5 }]
    const graph = buildBoardGraph(tiles)
    expect(graph.edges).toHaveLength(6)
    for (const edge of graph.edges) {
      expect(graph.edgeTileIds.get(edge.id)).toEqual(['0-0'])
    }
  })

  it('gives an interior edge between two adjacent tiles both tile ids', () => {
    const tiles = buildHexBoard() // standard 19-tile board has real interior edges
    const graph = buildBoardGraph(tiles)
    const interiorEdge = graph.edges.find((e) => (graph.edgeTileIds.get(e.id) ?? []).length === 2)
    expect(interiorEdge).toBeDefined()
    const tileIds = graph.edgeTileIds.get(interiorEdge!.id)!
    expect(tileIds).toHaveLength(2)
    expect(new Set(tileIds).size).toBe(2) // two distinct tiles, not the same tile twice
  })
})
```

```ts
// catan-3d/src/game/types.test.ts — extend the existing createInitialPlayers describe block
it('gives every player STARTING_SHIPS ships, scaled the same way roads are', () => {
  const players = createInitialPlayers(2)
  expect(players[0].shipsRemaining).toBe(STARTING_SHIPS)
  expect(players[1].shipsRemaining).toBe(STARTING_SHIPS)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run board.test -t "ships data model" && npx vitest run boardGraph.test -t "edgeTileIds" && npx vitest run types.test -t "STARTING_SHIPS"`
Expected: FAIL — `ships`/`shipsBuiltThisTurn`/`hasMovedShipThisTurn` don't exist on `BoardState`, `edgeTileIds` doesn't exist on `BoardGraph`, `shipsRemaining`/`STARTING_SHIPS` don't exist yet (TypeScript errors).

- [ ] **Step 3: Extend `BoardState` and its reducer cases**

`catan-3d/src/game/reducers/board.ts`:
```ts
export interface BoardState {
  settlements: Record<string, Building>
  roads: Record<string, number>
  ships: Record<string, number> // edge id -> owning player id, same shape as roads
  // Edge ids a ship was built on THIS turn — a ship can't be moved the same
  // turn it was built (CN3083 p.2). Cleared on TURN_ADVANCED.
  shipsBuiltThisTurn: string[]
  // At most 1 ship move per turn (CN3083 p.2). Cleared on TURN_ADVANCED.
  hasMovedShipThisTurn: boolean
}

export const initialBoardState: BoardState = {
  settlements: {},
  roads: {},
  ships: {},
  shipsBuiltThisTurn: [],
  hasMovedShipThisTurn: false,
}
```

Update `RESET_BOARD` and `RESTORE_BOARD`'s action type + cases:
```ts
  | { type: 'RESET_BOARD' }
  | {
      type: 'RESTORE_BOARD'
      settlements: Record<string, Building>
      roads: Record<string, number>
      ships: Record<string, number>
      shipsBuiltThisTurn: string[]
      hasMovedShipThisTurn: boolean
    }
```
```ts
    case 'RESET_BOARD':
      return { settlements: {}, roads: {}, ships: {}, shipsBuiltThisTurn: [], hasMovedShipThisTurn: false }
    case 'RESTORE_BOARD':
      return {
        settlements: action.settlements,
        roads: action.roads,
        ships: action.ships,
        shipsBuiltThisTurn: action.shipsBuiltThisTurn,
        hasMovedShipThisTurn: action.hasMovedShipThisTurn,
      }
```

- [ ] **Step 4: Add `Player.shipsRemaining`, `STARTING_SHIPS`, `SHIP_COST`**

`catan-3d/src/game/types.ts` — add to the `Player` interface, directly below `roadsRemaining`:
```ts
  shipsRemaining: number
```
Add directly below `STARTING_ROADS`/`ROAD_COST`:
```ts
export const STARTING_SHIPS = 15
export const SHIP_COST: Partial<Resources> = { lumber: 1, wool: 1 }
```
In `createInitialPlayers`, add alongside the other `*Remaining` computations:
```ts
  const shipsRemaining = Math.ceil(STARTING_SHIPS * scale)
```
and add `shipsRemaining,` to the returned object literal, next to `roadsRemaining,`.

- [ ] **Step 5: Add `BoardGraph.edgeTileIds`**

`catan-3d/src/data/boardGraph.ts` — add to the interface:
```ts
export interface BoardGraph {
  vertices: BoardVertex[]
  edges: BoardEdge[]
  vertexById: Map<string, BoardVertex>
  tileVertexIds: Map<string, string[]>
  vertexTileIds: Map<string, string[]>
  vertexEdgeIds: Map<string, string[]>
  tileCenters: Map<string, { x: number; z: number }>
  // Edge id -> the 1 or 2 tile ids that share this edge (1 = boundary edge,
  // touching exactly one hex; 2 = interior edge, between two hexes). Lets a
  // ship-placement check ask "does this edge border a sea tile" the same
  // way tileVertexIds/vertexTileIds already answer the equivalent question
  // for vertices.
  edgeTileIds: Map<string, string[]>
}
```
In `buildBoardGraph`, add the new map alongside the others:
```ts
  const edgeTileIds = new Map<string, string[]>()
```
Inside the per-tile corner loop, immediately after the existing `if (!edgeById.has(id)) { ... }` block (still inside the `for (let i = 0; i < corners.length; i++)` loop, but OUTSIDE that `if`, so it runs for every corner of every tile — this is what gives a shared edge exactly 2 entries):
```ts
      // Every tile visits each of its own 6 edges exactly once in this
      // loop (regardless of whether the edge itself was just created or
      // already existed from a neighboring tile), so this runs
      // unconditionally: a boundary edge (visited by only one tile) ends
      // up with exactly 1 entry, an interior edge (visited by both
      // tiles that share it) ends up with exactly 2.
      const tileIds = edgeTileIds.get(id)
      if (tileIds) {
        tileIds.push(tile.id)
      } else {
        edgeTileIds.set(id, [tile.id])
      }
```
Add `edgeTileIds,` to the returned object.

Two test fixtures construct a `BoardGraph` object literal directly rather than via `buildBoardGraph` and need the new field added so they still type-check:
- `catan-3d/src/data/boardGraph.test.ts` — the `emptyGraph: BoardGraph` literal (around line 44): add `edgeTileIds: new Map(),`.
- `catan-3d/src/game/knights.test.ts` — the inline `BoardGraph`-shaped return object (around line 32): add `edgeTileIds: new Map()` to the object literal.

- [ ] **Step 6: Wire ships through match-snapshot save/restore**

`catan-3d/src/multiplayer/matchSnapshot.ts` — add to `MatchSnapshot`, directly below `roads: Record<string, number>`, all three optional (absent on any snapshot saved before this feature existed, matching every other post-launch field's treatment in this file):
```ts
  // Seafarers ships (Ships & Longest Route sub-plan) — same optional/
  // backward-compatible treatment as merchantTileId etc. above: absent on
  // any snapshot saved before this feature existed. restoreFromSnapshot
  // (App.tsx) falls back to {}/[]/false, which is always correct for a
  // pre-feature match (no ships existed to have been built or moved).
  ships?: Record<string, number>
  shipsBuiltThisTurn?: string[]
  hasMovedShipThisTurn?: boolean
```
Do NOT add these to `isPlausibleMatchSnapshot` — that function only validates REQUIRED fields (confirmed by reading it: every field it checks is a required `MatchSnapshot` field, no optional field is checked), and these three are optional by design.

`catan-3d/src/App.tsx` — snapshot save (around line 6347-6348), add alongside the existing `roads` line:
```ts
      ships: gameState.board.ships,
      shipsBuiltThisTurn: gameState.board.shipsBuiltThisTurn,
      hasMovedShipThisTurn: gameState.board.hasMovedShipThisTurn,
```
Snapshot restore (the `RESTORE_BOARD` dispatch around line 6097), change:
```ts
    dispatch({ type: 'RESTORE_BOARD', settlements: snapshot.settlements, roads: snapshot.roads })
```
to:
```ts
    dispatch({
      type: 'RESTORE_BOARD',
      settlements: snapshot.settlements,
      roads: snapshot.roads,
      ships: snapshot.ships ?? {},
      shipsBuiltThisTurn: snapshot.shipsBuiltThisTurn ?? [],
      hasMovedShipThisTurn: snapshot.hasMovedShipThisTurn ?? false,
    })
```
In the `normalizedPlayers` restore-normalization map (around line 6069-6087), add alongside the other `?? fallback` lines:
```ts
      // Seafarers shipsRemaining (Ships & Longest Route sub-plan) — same
      // pre-feature-snapshot gap as commodities/cityImprovements above.
      shipsRemaining: p.shipsRemaining ?? STARTING_SHIPS,
```
(`STARTING_SHIPS` needs importing into `App.tsx` from `./game/types` if not already imported — check the existing import line for `STARTING_ROADS`/similar constants and add it alongside.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run board.test -t "ships data model" && npx vitest run boardGraph.test -t "edgeTileIds" && npx vitest run types.test -t "STARTING_SHIPS"`
Expected: PASS.

- [ ] **Step 8: Full verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build`
Expected: all four clean. `npm run build` is not optional — see Global Constraints.

- [ ] **Step 9: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/types.ts catan-3d/src/data/boardGraph.ts catan-3d/src/multiplayer/matchSnapshot.ts catan-3d/src/App.tsx catan-3d/src/game/reducers/board.test.ts catan-3d/src/data/boardGraph.test.ts catan-3d/src/game/types.test.ts catan-3d/src/game/knights.test.ts
git commit -m "feat: add ships data model — BoardState, Player, BoardGraph, snapshot persistence"
```

---

## Task 2: `BUILD_SHIP`, `MOVE_SHIP`, and `TURN_ADVANCED` reducer cases

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/board.test.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`

**Interfaces:**
- Consumes: `BoardState.ships`/`.shipsBuiltThisTurn`/`.hasMovedShipThisTurn` (Task 1). `Player.shipsRemaining`, `SHIP_COST` (Task 1).
- Produces: `BoardAction` gains `BUILD_SHIP` and `MOVE_SHIP`. `reduceBoard` gains a `TURN_ADVANCED` case (new — this action already exists as a `PlayersAction`, but `reduceBoard` never handled it before now). `describeBoardAction` gains matching cases. `reducePlayers` gains a `BUILD_SHIP` case (cost deduction).

Current state (verified by direct read):
- `catan-3d/src/game/reducers/board.ts:15-22`: `BoardAction` union (7 variants, `BUILD_ROAD`/`REMOVE_ROAD` are the ones to mirror).
- `catan-3d/src/game/reducers/board.ts:36-37`: `BUILD_ROAD` case — `return { ...state, roads: { ...state.roads, [action.edgeId]: action.playerId } }`.
- `catan-3d/src/game/reducers/board.ts:46-51`: `REMOVE_ROAD` case — the `if (!(id in state.X)) return state` guard style to mirror for `MOVE_SHIP`'s `fromEdgeId` check.
- `catan-3d/src/game/reducers/board.ts:70-102`: `describeBoardAction` — exhaustive-by-convention switch over `BoardAction`'s own cases (not type-enforced, since its parameter is the full `GameAction` union — see its own `default` comment). `BUILD_ROAD` returns `{ message: null, sfx: 'roadPlacement' }`.
- `catan-3d/src/game/reducers/players.ts:58`: `TURN_ADVANCED` already exists as a `PlayersAction` variant.
- `catan-3d/src/game/reducers/players.ts:91-100`: `BUILD_ROAD` case — `resources: action.isSetup || action.isFreeRoad ? p.resources : deductCost(p.resources, ROAD_COST), roadsRemaining: p.roadsRemaining - 1`. This is the exact pattern to mirror for `BUILD_SHIP`.
- `catan-3d/src/game/gameState.ts:19-24`: `reduceGame` calls `reduceBoard` AND `reducePlayers` on every dispatched action unconditionally — a new `board.ts` case for `TURN_ADVANCED` needs no new dispatch site, since `App.tsx:869` already does `dispatch({ type: 'TURN_ADVANCED', nextPlayerIndex: nextIndex })` through the same combined dispatcher every other action uses.

- [ ] **Step 1: Write the failing tests**

```ts
// catan-3d/src/game/reducers/board.test.ts — new describe blocks
describe('reduceBoard — BUILD_SHIP', () => {
  it('places a ship at the given edge, owned by the given player', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SHIP', edgeId: 'E1', playerId: 1, isSetup: false, isFreeShip: false },
      initialGameState,
    )
    expect(result.ships['E1']).toBe(1)
  })

  it('records the edge in shipsBuiltThisTurn', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SHIP', edgeId: 'E1', playerId: 1, isSetup: false, isFreeShip: false },
      initialGameState,
    )
    expect(result.shipsBuiltThisTurn).toEqual(['E1'])
  })

  it('leaves roads untouched', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SHIP', edgeId: 'E1', playerId: 1, isSetup: false, isFreeShip: false },
      initialGameState,
    )
    expect(result.roads).toEqual({})
  })
})

describe('reduceBoard — MOVE_SHIP', () => {
  it('moves an owned ship from one edge to another', () => {
    const withShip = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SHIP', edgeId: 'E1', playerId: 1, isSetup: false, isFreeShip: false },
      initialGameState,
    )
    const result = reduceBoard(withShip, { type: 'MOVE_SHIP', fromEdgeId: 'E1', toEdgeId: 'E2', playerId: 1 }, initialGameState)
    expect(result.ships['E1']).toBeUndefined()
    expect(result.ships['E2']).toBe(1)
  })

  it('sets hasMovedShipThisTurn', () => {
    const withShip = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SHIP', edgeId: 'E1', playerId: 1, isSetup: false, isFreeShip: false },
      initialGameState,
    )
    const result = reduceBoard(withShip, { type: 'MOVE_SHIP', fromEdgeId: 'E1', toEdgeId: 'E2', playerId: 1 }, initialGameState)
    expect(result.hasMovedShipThisTurn).toBe(true)
  })

  it('is a no-op when fromEdgeId has no ship', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'MOVE_SHIP', fromEdgeId: 'E1', toEdgeId: 'E2', playerId: 1 },
      initialGameState,
    )
    expect(result).toEqual(initialBoardState)
  })
})

describe('reduceBoard — TURN_ADVANCED', () => {
  it('clears shipsBuiltThisTurn and hasMovedShipThisTurn', () => {
    const dirty = { ...initialBoardState, shipsBuiltThisTurn: ['E1'], hasMovedShipThisTurn: true }
    const result = reduceBoard(dirty, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 }, initialGameState)
    expect(result.shipsBuiltThisTurn).toEqual([])
    expect(result.hasMovedShipThisTurn).toBe(false)
  })

  it('leaves ships themselves untouched', () => {
    const dirty = { ...initialBoardState, ships: { E1: 1 } }
    const result = reduceBoard(dirty, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 }, initialGameState)
    expect(result.ships).toEqual({ E1: 1 })
  })
})
```

```ts
// catan-3d/src/game/reducers/players.test.ts — new describe block
describe('reducePlayers — BUILD_SHIP', () => {
  it('deducts SHIP_COST and decrements shipsRemaining outside setup/free ships', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 1, brick: 0, wool: 1, grain: 0, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'BUILD_SHIP', edgeId: 'E1', playerId: players[0].id, isSetup: false, isFreeShip: false },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })
    expect(player.shipsRemaining).toBe(players[0].shipsRemaining - 1)
  })

  it('does not deduct resources when isSetup is true', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'BUILD_SHIP', edgeId: 'E1', playerId: players[0].id, isSetup: true, isFreeShip: false },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources).toEqual(players[0].resources)
  })

  it('does not deduct resources when isFreeShip is true', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'BUILD_SHIP', edgeId: 'E1', playerId: players[0].id, isSetup: false, isFreeShip: true },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources).toEqual(players[0].resources)
  })

  it('leaves other players untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'BUILD_SHIP', edgeId: 'E1', playerId: players[0].id, isSetup: false, isFreeShip: false },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[1].id)).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run board.test -t "BUILD_SHIP" && npx vitest run board.test -t "MOVE_SHIP" && npx vitest run board.test -t "TURN_ADVANCED" && npx vitest run players.test -t "BUILD_SHIP"`
Expected: FAIL — `BUILD_SHIP`/`MOVE_SHIP` aren't valid `BoardAction`s yet, `reduceBoard` has no `TURN_ADVANCED` case, `reducePlayers` has no `BUILD_SHIP` case.

- [ ] **Step 3: Add `BUILD_SHIP`/`MOVE_SHIP` to `BoardAction`, implement all three `board.ts` cases**

`catan-3d/src/game/reducers/board.ts` — add to the `BoardAction` union, alongside `BUILD_ROAD`/`REMOVE_ROAD`:
```ts
  | { type: 'BUILD_SHIP'; edgeId: string; playerId: number; isSetup: boolean; isFreeShip: boolean }
  | { type: 'MOVE_SHIP'; fromEdgeId: string; toEdgeId: string; playerId: number }
```
Add to `reduceBoard`'s switch, alongside the `BUILD_ROAD`/`REMOVE_ROAD` cases:
```ts
    case 'BUILD_SHIP':
      return {
        ...state,
        ships: { ...state.ships, [action.edgeId]: action.playerId },
        shipsBuiltThisTurn: [...state.shipsBuiltThisTurn, action.edgeId],
      }
    case 'MOVE_SHIP': {
      if (!(action.fromEdgeId in state.ships)) return state
      const ships = { ...state.ships }
      delete ships[action.fromEdgeId]
      ships[action.toEdgeId] = action.playerId
      return { ...state, ships, hasMovedShipThisTurn: true }
    }
    case 'TURN_ADVANCED':
      return { ...state, shipsBuiltThisTurn: [], hasMovedShipThisTurn: false }
```
Add to `describeBoardAction`'s switch:
```ts
    case 'BUILD_SHIP':
      return { message: null, sfx: 'roadPlacement' }
    case 'MOVE_SHIP':
      return { message: null, sfx: null }
```

- [ ] **Step 4: Add `BUILD_SHIP` to `reducePlayers`**

`catan-3d/src/game/reducers/players.ts` — add to the switch, mirroring the `BUILD_ROAD` case exactly:
```ts
    case 'BUILD_SHIP':
      return players.map((p) =>
        p.id === action.playerId
          ? {
              ...p,
              resources: action.isSetup || action.isFreeShip ? p.resources : deductCost(p.resources, SHIP_COST),
              shipsRemaining: p.shipsRemaining - 1,
            }
          : p,
      )
```
(`SHIP_COST` needs importing from `'../types'` alongside the existing `ROAD_COST` import at the top of this file — add it to that same import line. `MOVE_SHIP` needs no `reducePlayers` case: moving a ship costs nothing and doesn't change `shipsRemaining`, matching the spec's own note that movement is "a separate, pre-dispatch eligibility check" with no cost.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run board.test -t "BUILD_SHIP" && npx vitest run board.test -t "MOVE_SHIP" && npx vitest run board.test -t "TURN_ADVANCED" && npx vitest run players.test -t "BUILD_SHIP"`
Expected: PASS.

- [ ] **Step 6: Full verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build`
Expected: all four clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/board.test.ts catan-3d/src/game/reducers/players.test.ts
git commit -m "feat: add BUILD_SHIP, MOVE_SHIP, and TURN_ADVANCED reducer cases"
```

---

## Task 3: Longest Route — merge roads and ships in `calculateLongestRoad`

**Files:**
- Modify: `catan-3d/src/game/trophies.ts`
- Test: `catan-3d/src/game/trophies.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 beyond the `Record<string, number>` shape `ships` already has (this task's own tests construct `ships` fixtures directly, the same way the existing tests construct `roads` fixtures directly — no dependency on `BUILD_SHIP` actually existing). This task can be implemented in parallel with Task 2 if desired; its only real dependency is Task 1's data shapes.
- Produces: `calculateLongestRoad` gains a new trailing optional parameter `ships: Record<string, number> = {}`. Callers that don't pass it get byte-identical behavior to today (see below) — no existing call site needs updating, though `App.tsx`'s real call site should eventually pass the real `gameState.board.ships` (out of scope for this task, since no UI drives ship placement yet — flag as a one-line follow-up for whichever sub-plan adds the 3D UI, so Longest Route actually counts ships once they're placeable).

Current state (verified by direct read): `catan-3d/src/game/trophies.ts:10-66`, full function reproduced in this plan's own earlier research — see the parameter list at lines 10-20 and the `dfs` closure at lines 45-59.

- [ ] **Step 1: Write the failing tests**

```ts
// catan-3d/src/game/trophies.test.ts — extend the existing describe('calculateLongestRoad', ...) block.
// Reuses the existing edge/graphOf/chain/ownedBy helpers already defined at the top of this file.

it('counts ships the same as roads when there are no roads at all', () => {
  const edges = chain('A', 'B', 'C', 'D', 'E', 'F') // 5 edges
  expect(calculateLongestRoad(1, {}, graphOf(edges), {}, new Map(), ownedBy(1, edges))).toBe(5)
})

it('chains a road directly into a ship through an owned settlement', () => {
  // A-B-C is roads, C-D-E is ships, with a settlement at C (the junction).
  const roadEdges = chain('A', 'B', 'C')
  const shipEdges = chain('C', 'D', 'E')
  const roads = ownedBy(1, roadEdges)
  const ships = ownedBy(1, shipEdges)
  const settlements: Record<string, Building> = { C: { ownerId: 1, type: 'settlement' } }
  expect(calculateLongestRoad(1, roads, graphOf([...roadEdges, ...shipEdges]), settlements, new Map(), ships)).toBe(4)
})

it('breaks a road-to-ship transition at a vertex with no owned building', () => {
  // Same topology as above, but NO settlement at C — the junction vertex.
  const roadEdges = chain('A', 'B', 'C')
  const shipEdges = chain('C', 'D', 'E')
  const roads = ownedBy(1, roadEdges)
  const ships = ownedBy(1, shipEdges)
  // Longest run without crossing the type boundary: either A-B-C (2 roads) or C-D-E (2 ships).
  expect(calculateLongestRoad(1, roads, graphOf([...roadEdges, ...shipEdges]), {}, new Map(), ships)).toBe(2)
})

it('does not break a same-type continuation at a vertex with no owned building', () => {
  // All-ship chain through an un-owned vertex — no type mismatch, so it's never blocked.
  const shipEdges = chain('A', 'B', 'C', 'D', 'E')
  expect(calculateLongestRoad(1, {}, graphOf(shipEdges), {}, new Map(), ownedBy(1, shipEdges))).toBe(4)
})

it("still breaks at an opponent's building regardless of edge type", () => {
  const roadEdges = chain('A', 'B', 'C')
  const shipEdges = chain('C', 'D', 'E')
  const roads = ownedBy(1, roadEdges)
  const ships = ownedBy(1, shipEdges)
  const settlements: Record<string, Building> = { C: { ownerId: 2, type: 'settlement' } } // opponent's, not mine
  expect(calculateLongestRoad(1, roads, graphOf([...roadEdges, ...shipEdges]), settlements, new Map(), ships)).toBe(2)
})

it('the very first edge from a starting vertex is never type-constrained', () => {
  // A single ship edge with nothing before it — no incoming type exists yet.
  const shipEdges = chain('A', 'B')
  expect(calculateLongestRoad(1, {}, graphOf(shipEdges), {}, new Map(), ownedBy(1, shipEdges))).toBe(1)
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run trophies.test -t "ships the same as roads"`
Expected: FAIL — `calculateLongestRoad` doesn't accept a 6th argument yet (TypeScript error), and does not merge roads/ships.

- [ ] **Step 3: Implement the type-threaded DFS**

Replace `calculateLongestRoad`'s full body in `catan-3d/src/game/trophies.ts`:
```ts
export function calculateLongestRoad(
  playerId: number,
  roads: Record<string, number>,
  graph: BoardGraph,
  settlements: Record<string, Building>,
  // Cities & Knights knights: vertex id -> owning player id, for every
  // knight currently on the board (any strength, active or inactive — both
  // block equally per CN3087 p.9). Defaults to empty so every pre-existing
  // call site (and the whole pre-existing test suite above) keeps behaving
  // identically when this house rule is off.
  knightOwnerByVertex: ReadonlyMap<string, number> = new Map(),
  // Seafarers ships: same shape as roads, a second edge-ownership map.
  // Defaults to empty so every pre-existing call site keeps behaving
  // identically — see the backward-compatibility note below.
  ships: Record<string, number> = {},
): number {
  // One combined edge set plus a per-edge type lookup — an edge is either a
  // road or a ship, never both (BUILD_ROAD/BUILD_SHIP's own eligibility
  // checks in App.tsx enforce that edges can't hold both piece types).
  const edgeType = new Map<string, 'road' | 'ship'>()
  const ownedEdgeIds = new Set<string>()
  for (const edge of graph.edges) {
    if (roads[edge.id] === playerId) {
      ownedEdgeIds.add(edge.id)
      edgeType.set(edge.id, 'road')
    } else if (ships[edge.id] === playerId) {
      ownedEdgeIds.add(edge.id)
      edgeType.set(edge.id, 'ship')
    }
  }
  if (ownedEdgeIds.size === 0) return 0

  const adjacency = new Map<string, { edgeId: string; nextVertex: string }[]>()
  for (const edge of graph.edges) {
    if (!ownedEdgeIds.has(edge.id)) continue
    const addEntry = (from: string, to: string) => {
      const entry = { edgeId: edge.id, nextVertex: to }
      const list = adjacency.get(from)
      if (list) list.push(entry)
      else adjacency.set(from, [entry])
    }
    addEntry(edge.a, edge.b)
    addEntry(edge.b, edge.a)
  }

  const isBlockedByOpponent = (vertexId: string): boolean => {
    const building = settlements[vertexId]
    if (building != null && building.ownerId !== playerId) return true
    const knightOwnerId = knightOwnerByVertex.get(vertexId)
    return knightOwnerId != null && knightOwnerId !== playerId
  }

  const hasOwnBuilding = (vertexId: string): boolean => settlements[vertexId]?.ownerId === playerId

  const dfs = (vertex: string, visitedEdges: Set<string>, incomingType: 'road' | 'ship' | null): number => {
    // An opponent's settlement/city breaks the road here — arriving is
    // fine (already counted by the caller), but the path can't extend
    // further from this vertex.
    if (isBlockedByOpponent(vertex) && visitedEdges.size > 0) return 0

    let best = 0
    for (const { edgeId, nextVertex } of adjacency.get(vertex) ?? []) {
      if (visitedEdges.has(edgeId)) continue
      const outgoingType = edgeType.get(edgeId)!
      // CN3083: "roads and ships are only considered part of the same
      // route if they connect to each other at one of your buildings."
      // incomingType is null only for the very first edge taken from any
      // starting vertex — that edge is never constrained, matching the
      // spec's own note. This is a SEPARATE check from isBlockedByOpponent
      // above: an empty (no building) vertex now blocks a type transition
      // even though it never blocked a same-type continuation.
      if (incomingType != null && incomingType !== outgoingType && !hasOwnBuilding(vertex)) continue
      visitedEdges.add(edgeId)
      best = Math.max(best, 1 + dfs(nextVertex, visitedEdges, outgoingType))
      visitedEdges.delete(edgeId)
    }
    return best
  }

  let longest = 0
  for (const vertex of adjacency.keys()) {
    longest = Math.max(longest, dfs(vertex, new Set(), null))
  }
  return longest
}
```
Backward-compatibility note (verify this reasoning holds while implementing, don't just trust it): with `ships = {}` (the default), the `else if` branch never fires, so `edgeType.get(edgeId)` is `'road'` for every explored edge — `incomingType !== outgoingType` is therefore always `false` once `incomingType` becomes non-null, so the new type-transition branch never actually executes for any all-road call. Every pre-existing test in this file (all of which omit the new 6th argument) must keep passing unchanged.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run trophies.test`
Expected: PASS — both the new tests above AND every pre-existing test in this file (confirms backward compatibility empirically, not just by the reasoning above).

- [ ] **Step 5: Full verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build`
Expected: all four clean.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/trophies.ts catan-3d/src/game/trophies.test.ts
git commit -m "feat: merge roads and ships into Longest Route, breaking type transitions at non-owned buildings"
```

---

## Task 4: Ship building — eligibility, dispatch, and multiplayer broadcast

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `BoardState.ships`/`.edgeTileIds` (Tasks 1-2), `BUILD_SHIP` action shape (Task 2), `SHIP_COST`/`Player.shipsRemaining` (Task 1).
- Produces: `edgeTouchesSea`, `hasPlayerShipAt`, `isShipPlacementConnected`, `applyShipPlacement`, `buildShipRaw` (all local to `App.tsx`, mirroring the equivalent road-building functions exactly). `ShipBuiltPayload`, `broadcastShipBuilt`, `onShipBuilt` (in `useRoomChannel.ts`, mirroring `RoadBuiltPayload`/`broadcastRoadBuilt`/`onRoadBuilt` exactly).
- No 3D UI calls `buildShipRaw` yet (Global Constraints) — it is dispatchable directly and covered by this task's own manual dispatch checks (Step 4 below), not by a click handler.

Current state (verified by direct read):
- `catan-3d/src/App.tsx:2370-2400`: `hasPlayerRoadAt`, `isBlockedForRoadPlacement`, `isRoadPlacementConnected` — the exact eligibility-helper pattern to mirror for ships (skip the knight-block equivalent: CN3083's rules-reference doc only documents "may not build a ship past an opponent's building," which the connectivity check below already handles the same way roads do — no Cities & Knights knight-blocking rule is documented for ships).
- `catan-3d/src/App.tsx:2804-2874`: `buildRoadRaw` — the full eligibility-check-then-dispatch function to mirror.
- `catan-3d/src/App.tsx:2842`: `if (gameState.board.roads[edgeId] != null) { warn('That road is already occupied.'); return }` — needs extending so roads and ships mutually exclude each other on the same edge (CN3083: "ships and roads may not occupy the same coastal edge").
- `catan-3d/src/App.tsx:934-936`: `applyRoadPlacement` — the dispatch-plus-local-side-effect function to mirror (the free-piece budget decrement).
- `catan-3d/src/App.tsx:382`: `const [freeRoadsRemaining, setFreeRoadsRemaining] = useState(0)` — per the spec's Dev card changes section, a free ship placement consumes this SAME counter (no new counter needed).
- `catan-3d/src/App.tsx:263,272`: `tileById`, `edgeById` — the two lookup maps `edgeTouchesSea` needs.
- `catan-3d/src/App.tsx:728-745`: `broadcastGameAction`'s switch — `BUILD_SHIP`'s payload matches its `GameAction` shape exactly (like `BUILD_ROAD` does), so it belongs in this generic switch, not a bespoke call site.
- `catan-3d/src/App.tsx:1373`: `broadcastRoadBuilt` destructured from the `useRoomChannel` hook's return value — the import list to extend.
- `catan-3d/src/App.tsx:1449-1450`: `onRoadBuilt: (payload) => applyRoadPlacement(payload.edgeId, payload.playerId, gamePhase === 'setup', payload.isFreeRoad, false),` — the handler-registration pattern to mirror.
- `catan-3d/src/multiplayer/useRoomChannel.ts:102-111`: `RoadBuiltPayload` interface.
- `catan-3d/src/multiplayer/useRoomChannel.ts:705`: `onRoadBuilt?: (payload: RoadBuiltPayload) => void` in the handlers interface.
- `catan-3d/src/multiplayer/useRoomChannel.ts:978-980`: `channel.on<RoadBuiltPayload>('broadcast', { event: 'ROAD_BUILT' }, ({ payload }) => { handlersRef.current.onRoadBuilt?.(payload) })`.
- `catan-3d/src/multiplayer/useRoomChannel.ts:1252-1254`: `broadcastRoadBuilt = (payload) => { void channelRef.current?.send({ type: 'broadcast', event: 'ROAD_BUILT', payload }) }`.
- `catan-3d/src/multiplayer/useRoomChannel.ts:1413`: `broadcastRoadBuilt` in the hook's returned object — the export list to extend.

- [ ] **Step 1: Add `ShipBuiltPayload`/`broadcastShipBuilt`/`onShipBuilt` to `useRoomChannel.ts`**

This is pure mechanical transcription of the 5 `RoadBuiltPayload`/`broadcastRoadBuilt`/`onRoadBuilt` touch points — no new pattern, no judgment calls beyond the field list below. Add at each of the 5 locations cited above, in the same relative position as their `RoadBuilt` counterparts:

```ts
// Interface, alongside RoadBuiltPayload:
export interface ShipBuiltPayload {
  edgeId: string
  playerId: number
  // Same reasoning as RoadBuiltPayload.isFreeRoad above — a free ship
  // placement (from a Road Building card) needs the actor to say so
  // explicitly, since dev-card plays aren't broadcast in this phase.
  isFreeShip: boolean
}
```
```ts
// Handlers interface, alongside onRoadBuilt:
  onShipBuilt?: (payload: ShipBuiltPayload) => void
```
```ts
// Subscription, alongside the ROAD_BUILT one:
    channel.on<ShipBuiltPayload>('broadcast', { event: 'SHIP_BUILT' }, ({ payload }) => {
      handlersRef.current.onShipBuilt?.(payload)
    })
```
```ts
// Broadcast function, alongside broadcastRoadBuilt:
  const broadcastShipBuilt = (payload: ShipBuiltPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'SHIP_BUILT', payload })
  }
```
```ts
// Returned object, alongside broadcastRoadBuilt:
    broadcastShipBuilt,
```

- [ ] **Step 2: Add ship-building eligibility helpers to `App.tsx`**

Add directly after `isRoadPlacementConnected` (around line 2400):
```ts
  const edgeTouchesSea = (edgeId: string): boolean => {
    const tileIds = graph.edgeTileIds.get(edgeId) ?? []
    return tileIds.some((tileId) => tileById.get(tileId)?.biome === 'sea')
  }

  const hasPlayerShipAt = (vertexId: string, playerId: number): boolean => {
    const edgeIds = graph.vertexEdgeIds.get(vertexId) ?? []
    return edgeIds.some((edgeId) => gameState.board.ships[edgeId] === playerId)
  }

  // CN3083: "a new ship must connect to one of your existing ships or
  // buildings — NOT roads." Deliberately does not fall back to
  // hasPlayerRoadAt the way isRoadPlacementConnected does — a road ending
  // at a coastal vertex does not, by itself, let a ship branch off it; the
  // road has to terminate at a settlement/city first (which the
  // settlements check below already covers).
  //
  // KNOWN GAP (see this plan's Global Constraints): CN3083 also blocks
  // placement on any edge of the hex the pirate currently occupies. The
  // pirate doesn't exist yet (Robber & Pirate Migration sub-plan) — this
  // function has no way to check that yet. Revisit once pirateTileId exists.
  const isShipPlacementConnected = (edgeId: string, playerId: number): boolean => {
    const edge = edgeById.get(edgeId)
    if (!edge) return false
    if (
      gameState.board.settlements[edge.a]?.ownerId === playerId ||
      gameState.board.settlements[edge.b]?.ownerId === playerId
    )
      return true
    return hasPlayerShipAt(edge.a, playerId) || hasPlayerShipAt(edge.b, playerId)
  }
```

- [ ] **Step 3: Add `applyShipPlacement` and `buildShipRaw`**

Add `applyShipPlacement` directly after `applyRoadPlacement` (around line 936):
```ts
  const applyShipPlacement = (edgeId: string, playerId: number, isSetup: boolean, isFreeShip: boolean, isDeciding: boolean) => {
    dispatchGameAction({ type: 'BUILD_SHIP', edgeId, playerId, isSetup, isFreeShip }, isDeciding)
    if (isFreeShip) setFreeRoadsRemaining((prev) => Math.max(0, prev - 1))
  }
```

Add `buildShipRaw` directly after `buildRoadRaw` (around line 2874). Setup-phase ship substitution is out of scope for this plan (Global Constraints) — this function only ever dispatches with `isSetup: false`:
```ts
  const buildShipRaw = (edgeId: string) => {
    if (!canInteract()) return

    const player = players[currentPlayerIndex]
    const isFreeShip = freeRoadsRemaining > 0

    if (!isFreeShip && !hasRolledThisTurn) {
      warn('Roll the dice before building.')
      return
    }
    if (gameState.board.roads[edgeId] != null || gameState.board.ships[edgeId] != null) {
      warn('That edge is already occupied.')
      return
    }
    if (!edgeTouchesSea(edgeId)) {
      warn('Ships can only be placed on edges bordering the sea.')
      return
    }
    if (!isShipPlacementConnected(edgeId, player.id)) {
      warn('Ship must connect to one of your ships or buildings.')
      return
    }
    if (player.shipsRemaining <= 0) {
      warn('You have no ships left to place.')
      return
    }
    if (!isFreeShip && !canAfford(player.resources, SHIP_COST)) {
      warn('Not enough resources for a ship.')
      return
    }

    applyShipPlacement(edgeId, player.id, false, isFreeShip, true)
  }
```
(`SHIP_COST` needs importing from `./game/types` alongside the existing `ROAD_COST` import.)

Update `buildRoadRaw`'s existing occupancy check (the one cited in Current State above) to also reject a ship-occupied edge:
```ts
    if (gameState.board.roads[edgeId] != null || gameState.board.ships[edgeId] != null) {
      warn('That edge is already occupied.')
      return
    }
```
(replaces the road-only check and its old `'That road is already occupied.'` message — the new message covers both piece types, since the edge is occupied either way.)

- [ ] **Step 4: Wire broadcast and receiver registration**

Add to `broadcastGameAction`'s switch, alongside `BUILD_ROAD`:
```ts
      case 'BUILD_SHIP':
        broadcastShipBuilt({ edgeId: action.edgeId, playerId: action.playerId, isFreeShip: action.isFreeShip })
        break
```
Destructure `broadcastShipBuilt` from the `useRoomChannel` hook's return value, alongside `broadcastRoadBuilt` (around line 1373).
Register the receiver, alongside `onRoadBuilt` (around line 1449-1450):
```ts
    onShipBuilt: (payload) =>
      applyShipPlacement(payload.edgeId, payload.playerId, false, payload.isFreeShip, false),
```

- [ ] **Step 5: Manual dispatch verification (no 3D UI exists yet to click-test)**

Since no click handler calls `buildShipRaw` yet, verify the wiring end-to-end with a temporary script-style check rather than a UI click. Run this from `catan-3d/`, adjusting the import path to the real repo location:
```ts
// Confirm this compiles and runs without throwing — a quick sanity check,
// not a permanent test file. Delete after running.
import { buildHexBoard } from './src/data/hexBoard'
import { buildBoardGraph } from './src/data/boardGraph'
console.log('edgeTileIds size:', buildBoardGraph(buildHexBoard()).edgeTileIds.size)
```
Expected: prints a number roughly matching the board's total edge count (a 19-tile standard board has 72 edges) — confirms `edgeTileIds` is populated for a real board, not just the unit-test fixtures.

- [ ] **Step 6: Full verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build`
Expected: all four clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: wire ship-building eligibility, dispatch, and multiplayer broadcast"
```

---

## Task 5: Ship movement — eligibility, dispatch, and multiplayer broadcast

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `BoardState.shipsBuiltThisTurn`/`.hasMovedShipThisTurn` (Task 1), `MOVE_SHIP` action shape (Task 2), `isShipPlacementConnected`/`edgeTouchesSea` (Task 4).
- Produces: `isShipEndOpen`, `canMoveShip`, `applyShipMove`, `moveShipRaw` (local to `App.tsx`). `ShipMovedPayload`, `broadcastShipMoved`, `onShipMoved` (in `useRoomChannel.ts`, same mechanical pattern as Task 4's `ShipBuiltPayload` triple).

Current state: same 5 touch points in `useRoomChannel.ts` cited in Task 4, mirrored again for a second event — `RoadBuiltPayload`'s sibling `RobberMovedPayload` (`useRoomChannel.ts:113`) is a useful second reference for a "moved" event's payload shape, though this task's payload is simpler (no steal to report).

- [ ] **Step 1: Add `ShipMovedPayload`/`broadcastShipMoved`/`onShipMoved` to `useRoomChannel.ts`**

Same 5 touch points as Task 4 Step 1, same mechanical pattern:
```ts
// Interface:
export interface ShipMovedPayload {
  fromEdgeId: string
  toEdgeId: string
  playerId: number
}
```
```ts
// Handlers interface:
  onShipMoved?: (payload: ShipMovedPayload) => void
```
```ts
// Subscription:
    channel.on<ShipMovedPayload>('broadcast', { event: 'SHIP_MOVED' }, ({ payload }) => {
      handlersRef.current.onShipMoved?.(payload)
    })
```
```ts
// Broadcast function:
  const broadcastShipMoved = (payload: ShipMovedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'SHIP_MOVED', payload })
  }
```
```ts
// Returned object:
    broadcastShipMoved,
```

- [ ] **Step 2: Add ship-movement eligibility helpers to `App.tsx`**

Add directly after `isShipPlacementConnected` (Task 4):
```ts
  // CN3083: "you may only move a ship if at least one of its two ends is
  // open — an end is open when it is NOT adjacent to one of your own ships
  // or buildings." shipEdgeId is excluded from the "own ship" check so the
  // ship being evaluated doesn't anchor itself.
  const isShipEndOpen = (vertexId: string, shipEdgeId: string, playerId: number): boolean => {
    if (gameState.board.settlements[vertexId]?.ownerId === playerId) return false
    const edgeIds = graph.vertexEdgeIds.get(vertexId) ?? []
    return !edgeIds.some((edgeId) => edgeId !== shipEdgeId && gameState.board.ships[edgeId] === playerId)
  }

  // KNOWN GAP (see this plan's Global Constraints): CN3083 also blocks
  // moving a ship to or from an edge of the hex the pirate currently
  // occupies — not checkable yet, no pirateTileId exists.
  const canMoveShip = (edgeId: string, playerId: number): boolean => {
    if (gameState.board.ships[edgeId] !== playerId) return false
    if (gameState.board.shipsBuiltThisTurn.includes(edgeId)) return false
    const edge = edgeById.get(edgeId)
    if (!edge) return false
    return isShipEndOpen(edge.a, edgeId, playerId) || isShipEndOpen(edge.b, edgeId, playerId)
  }
```

- [ ] **Step 3: Add `applyShipMove` and `moveShipRaw`**

Add directly after `applyShipPlacement` (Task 4):
```ts
  const applyShipMove = (fromEdgeId: string, toEdgeId: string, playerId: number, isDeciding: boolean) => {
    dispatchGameAction({ type: 'MOVE_SHIP', fromEdgeId, toEdgeId, playerId }, isDeciding)
  }
```
Add directly after `buildShipRaw` (Task 4):
```ts
  const moveShipRaw = (fromEdgeId: string, toEdgeId: string) => {
    if (!canInteract()) return

    const player = players[currentPlayerIndex]

    if (!hasRolledThisTurn) {
      warn('Roll the dice before moving a ship.')
      return
    }
    if (gameState.board.hasMovedShipThisTurn) {
      warn('You may only move one ship per turn.')
      return
    }
    if (!canMoveShip(fromEdgeId, player.id)) {
      warn('That ship cannot be moved.')
      return
    }
    if (gameState.board.roads[toEdgeId] != null || gameState.board.ships[toEdgeId] != null) {
      warn('That edge is already occupied.')
      return
    }
    if (!edgeTouchesSea(toEdgeId)) {
      warn('Ships can only be placed on edges bordering the sea.')
      return
    }
    // Checked against the board state BEFORE the move applies — the ship
    // being moved is still "at" fromEdgeId for this check, which is exactly
    // right: it correctly allows pivoting a ship around a vertex it already
    // anchors, without needing to special-case that against toEdgeId.
    if (!isShipPlacementConnected(toEdgeId, player.id)) {
      warn('Ship must connect to one of your ships or buildings.')
      return
    }

    applyShipMove(fromEdgeId, toEdgeId, player.id, true)
  }
```

- [ ] **Step 4: Wire broadcast and receiver registration**

Add to `broadcastGameAction`'s switch, alongside `BUILD_SHIP`:
```ts
      case 'MOVE_SHIP':
        broadcastShipMoved({ fromEdgeId: action.fromEdgeId, toEdgeId: action.toEdgeId, playerId: action.playerId })
        break
```
Destructure `broadcastShipMoved` from the `useRoomChannel` hook's return value, alongside `broadcastShipBuilt`.
Register the receiver, alongside `onShipBuilt`:
```ts
    onShipMoved: (payload) =>
      applyShipMove(payload.fromEdgeId, payload.toEdgeId, payload.playerId, false),
```

- [ ] **Step 5: Manual dispatch verification**

Same approach as Task 4 Step 5 — no click handler exists yet. Confirm by direct inspection that `canMoveShip`, `isShipEndOpen`, and `moveShipRaw` type-check and that their logic reads correctly against the CN3083 citations in this plan's spec references (Global Constraints already names the one deliberately-deferred piece — pirate adjacency).

- [ ] **Step 6: Full verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build`
Expected: all four clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: wire ship-movement eligibility, dispatch, and multiplayer broadcast"
```

---

## Task 6: Final verification

- [ ] **Step 1:** `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build` — must all be clean.
- [ ] **Step 2:** Boot smoke test — start the dev server (`npx vite`), confirm HTTP 200 with a clean server log, then stop it. Check for and kill any orphaned `vite`/`node` process afterward before removing the worktree (this project's own recorded lesson from the Board Foundation sub-plan — write the log to the scratchpad directory, not the filesystem root, which fails on Windows Git Bash).
- [ ] **Step 3:** Grep for any other hand-maintained list that might need a ship-related entry now that `BoardAction` has grown two new variants — e.g. `grep -rn "BUILD_ROAD" catan-3d/src --include=*.ts --include=*.tsx` and check every match's surrounding context for a switch/list that handles `BUILD_ROAD` but doesn't yet have a `BUILD_SHIP` counterpart. This plan's own Task 2/4/5 already covered `describeBoardAction`, `broadcastGameAction`, and the occupancy check in `buildRoadRaw` — this step is a final sweep for anything missed, not a re-check of those three.
- [ ] **Step 4:** Note for the human partner in the final report: (a) no 3D ship-placement UI exists yet — ships are fully reducer-correct and broadcast-wired but not clickable; (b) the pirate-adjacency placement/movement block is a known, explicitly-flagged gap for the next sub-plan (Robber & Pirate Migration) to close; (c) `App.tsx`'s real `calculateLongestRoad` call site still doesn't pass `gameState.board.ships` — flagged in Task 3, needs picking up once ships are actually placeable, otherwise Longest Route silently won't count them even after this plan ships.

No commit for this task (verification only) — proceed to the final whole-branch review once Steps 1-3 are clean.
