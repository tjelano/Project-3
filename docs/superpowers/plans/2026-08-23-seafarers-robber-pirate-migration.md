# Seafarers Robber & Pirate Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the robber's position from `App.tsx`'s `useState` into `BoardState` (the reducer), keeping it fully playable throughout, and add the pirate as a new board piece that mirrors the robber's steal mechanic but only interacts with sea hexes and ships — including a player-facing choice between moving the robber or the pirate, and a pirate counterpart to Cities & Knights' "Chase Away the Robber."

**Architecture:** `ROBBER_MOVED` (an existing `PlayersAction` that already does the steal) gains a `reduceBoard` case that writes `action.tileId` into `state.robberTileId` — the same "one action, multiple sub-reducers" pattern `BUILD_ROAD`/`BUILD_SHIP` already use. `TAXATION_RESOLVED` (Cities & Knights, already dispatched whenever the robber moves via that card) gets the identical treatment. A new `PIRATE_MOVED` action mirrors `ROBBER_MOVED`'s exact shape; its steal body is factored into one shared helper both actions' `reducePlayers` cases call, since the existing steal logic is already fully generic (confirmed by direct reading — no robber-specific code in it). The pirate's own move/steal/chase-away mechanics are near-verbatim copies of the robber's equivalents, substituting sea-hex-only placement and ship-ownership (not building-ownership) for victim eligibility. A new `gamePhase` value, `'chooseRobberOrPirate'`, sits in front of the existing `'moveRobber'` phase for the two triggers the spec names (a rolled 7, a played Knight card) — Cities & Knights' Taxation and Chase Away the Robber are untouched, since neither is in the spec's pirate-choice scope, and Chase Away gets its own independent, parallel pirate counterpart rather than a shared/branching one.

**Tech Stack:** TypeScript, Vitest, this project's established reducer/broadcast conventions.

**Spec:** `docs/superpowers/specs/2026-08-23-seafarers-ships-open-sea-design.md` (see its "Robber & pirate" section). Rules verified verbatim against `docs/superpowers/specs/references/seafarers-rules-reference.md`'s "The pirate" section for placement/steal eligibility; CN3087's chase-away note (already implemented for the robber in this codebase) is the template for the pirate's counterpart.

## Global Constraints

- **The robber must stay fully playable after every task.** Unlike ships (no prior UI to preserve), the robber is used in every single game today. Task 3 (the migration itself) is the highest-risk task in this plan — its own verification steps require an actual manual playtest (roll to a 7, move the robber, confirm a steal happens), not just `tsc`/`vitest`.
- **`npm run build` is a mandatory verification command** for every task, in addition to `tsc -b`/`eslint`/`vitest run` — this project's own established lesson (a prior sub-plan shipped a build-breaking regression that only `vite build` caught).
- **Taxation (Cities & Knights) and Chase Away the Robber are NOT in this plan's pirate-choice scope.** Taxation always resolves via the robber specifically (CN3087's own card, unrelated to Seafarers) — its `resolveTaxation`/`applyTaxationResolved` functions are migrated off `useState` (Global Constraint above) but otherwise untouched. Chase Away the Robber gets an independent, parallel pirate counterpart (`armChasePirate`/`canChasePirate`/`chasingPirateKnightId`) — not a shared/unified function — matching this codebase's established "near-verbatim copy, not a branching abstraction" pattern for symmetric mechanics (e.g. `BUILD_SHIP` mirroring `BUILD_ROAD`).
- **Gold-field production, the 2 Seafarers dev-card changes (Road Building building ships, Knight activating pirate-vs-robber as a CHOICE — this plan builds the choice UI itself, but the dev-card text/UX polish beyond the functional choice is not required), and the setup-phase ship substitution are out of scope** — later sub-plans or explicitly deferred, per the spec's own phase split.
- **No new UI beyond what's specified.** The robber-or-pirate choice is a minimal 2-option picker (reuses the existing `warn`/`inform` toast conventions and a simple state flag — not a new modal component unless a task's own Steps say so).
- Every new/changed reducer case follows "pure appliers, no re-validation" — eligibility (adjacency, ownership, sea-vs-land) is checked once in `App.tsx` before dispatch, never re-derived in the reducer.
- Grep for hand-maintained lists (`describeBoardAction`'s switch, `broadcastGameAction`'s switch, `useRoomChannel.ts`'s 5-touch-point broadcast pattern) whenever a task adds a new action variant — this project's own recorded lesson from two prior sub-plans.

## Task 1: Data model — `robberTileId`/`pirateTileId` on `BoardState`, `tileEdgeIds` on `BoardGraph`

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/data/boardGraph.ts`
- Modify: `catan-3d/src/multiplayer/matchSnapshot.ts`
- Test: `catan-3d/src/game/reducers/board.test.ts`
- Test: `catan-3d/src/data/boardGraph.test.ts`

**Interfaces:**
- Produces: `BoardState` gains `robberTileId: string` (required — every board has a robber, matching today's `useState` init) and `pirateTileId: string | null` (nullable — "parked on the frame" per CN3083). `BoardGraph` gains `tileEdgeIds: Map<string, string[]>` (tile id → the 6 edge ids bounding it — the reverse of `tileEdgeIds`'s sibling `tileVertexIds`, and the reverse of the existing `edgeTileIds` added by the Ships & Longest Route sub-plan). `RESET_BOARD`'s action type gains a required `robberTileId: string` field (the fresh board's desert tile — the caller always knows this at reset time, since it's derived from the freshly generated tiles). `RESTORE_BOARD`'s action type gains `robberTileId: string` and `pirateTileId: string | null`.
- Consumes: nothing from other tasks — this is this sub-plan's foundation task.

Current state (verified by direct read):
- `catan-3d/src/game/reducers/board.ts:5-22`: `BoardState`/`initialBoardState`/`BoardAction` (post Ships sub-plan: `settlements`, `roads`, `ships`, `shipsBuiltThisTurn`, `hasMovedShipThisTurn` — no robber/pirate fields yet).
- `catan-3d/src/game/reducers/board.ts` `RESET_BOARD`/`RESTORE_BOARD` cases — currently reset/restore only the 5 fields above.
- `catan-3d/src/data/boardGraph.ts:18-33`: `BoardGraph` interface — has `tileVertexIds`/`vertexTileIds` as an existing forward/reverse pair, and `edgeTileIds` (edge → tiles) added by the prior sub-plan, but no tile → edges reverse of `edgeTileIds`.
- `catan-3d/src/data/boardGraph.ts`, `buildBoardGraph`'s per-tile corner loop — where `edgeTileIds` is populated (pushes `tile.id` for every corner visit, unconditionally).
- `catan-3d/src/multiplayer/matchSnapshot.ts:61`: `robberTileId: string` — ALREADY a required `MatchSnapshot` field (this predates the reducer migration; no change needed here). No `pirateTileId` field exists yet.

- [ ] **Step 1: Write the failing tests**

```ts
// catan-3d/src/game/reducers/board.test.ts — new describe block
describe('reduceBoard — robber/pirate data model', () => {
  it('RESET_BOARD sets robberTileId to the given tile and pirateTileId to null', () => {
    const dirty = { ...initialBoardState, robberTileId: 'stale', pirateTileId: 'S1' }
    const result = reduceBoard(dirty, { type: 'RESET_BOARD', robberTileId: 'D1' }, initialGameState)
    expect(result.robberTileId).toBe('D1')
    expect(result.pirateTileId).toBeNull()
  })

  it('RESTORE_BOARD restores robberTileId and pirateTileId verbatim', () => {
    const result = reduceBoard(
      initialBoardState,
      {
        type: 'RESTORE_BOARD',
        settlements: {},
        roads: {},
        ships: {},
        shipsBuiltThisTurn: [],
        hasMovedShipThisTurn: false,
        robberTileId: 'D1',
        pirateTileId: 'S1',
      },
      initialGameState,
    )
    expect(result.robberTileId).toBe('D1')
    expect(result.pirateTileId).toBe('S1')
  })

  it('RESTORE_BOARD accepts a null pirateTileId (pirate parked on the frame)', () => {
    const result = reduceBoard(
      initialBoardState,
      {
        type: 'RESTORE_BOARD',
        settlements: {},
        roads: {},
        ships: {},
        shipsBuiltThisTurn: [],
        hasMovedShipThisTurn: false,
        robberTileId: 'D1',
        pirateTileId: null,
      },
      initialGameState,
    )
    expect(result.pirateTileId).toBeNull()
  })
})
```

```ts
// catan-3d/src/data/boardGraph.test.ts — new describe block
describe('buildBoardGraph — tileEdgeIds', () => {
  it('gives every tile exactly 6 edge ids', () => {
    const tiles = buildHexBoard() // standard 19-tile board
    const graph = buildBoardGraph(tiles)
    for (const tile of tiles) {
      expect(graph.tileEdgeIds.get(tile.id)).toHaveLength(6)
    }
  })

  it('is the exact reverse of edgeTileIds', () => {
    const tiles = buildHexBoard()
    const graph = buildBoardGraph(tiles)
    for (const [tileId, edgeIds] of graph.tileEdgeIds) {
      for (const edgeId of edgeIds) {
        expect(graph.edgeTileIds.get(edgeId)).toContain(tileId)
      }
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run board.test -t "robber/pirate data model" && npx vitest run boardGraph.test -t "tileEdgeIds"`
Expected: FAIL — `robberTileId`/`pirateTileId` aren't valid `BoardState` fields yet, `RESET_BOARD`/`RESTORE_BOARD` don't accept the new fields, `tileEdgeIds` doesn't exist on `BoardGraph`.

- [ ] **Step 3: Extend `BoardState`, `RESET_BOARD`, `RESTORE_BOARD`**

`catan-3d/src/game/reducers/board.ts`:
```ts
export interface BoardState {
  settlements: Record<string, Building>
  roads: Record<string, number>
  ships: Record<string, number>
  shipsBuiltThisTurn: string[]
  hasMovedShipThisTurn: boolean
  robberTileId: string
  // null = parked on the frame — a legal "off the board" state the robber
  // never has (CN3083). Set once the pirate first activates; there is no
  // meaningful "initial" tile for it the way the robber starts on desert.
  pirateTileId: string | null
}
```
`initialBoardState` needs a real tile id for `robberTileId` — but `initialBoardState` is a module-level constant with no board to derive one from (the real starting position is always set via `RESET_BOARD` once a board exists, exactly like `initialGameState.players` gets replaced by `resetGame` today). Use the empty string as an explicit "not yet placed" sentinel, matching no other field's convention but the only honest value available at module-load time:
```ts
export const initialBoardState: BoardState = {
  settlements: {},
  roads: {},
  ships: {},
  shipsBuiltThisTurn: [],
  hasMovedShipThisTurn: false,
  robberTileId: '',
  pirateTileId: null,
}
```
Update `RESET_BOARD`/`RESTORE_BOARD`'s action type and cases:
```ts
  | { type: 'RESET_BOARD'; robberTileId: string }
  | {
      type: 'RESTORE_BOARD'
      settlements: Record<string, Building>
      roads: Record<string, number>
      ships: Record<string, number>
      shipsBuiltThisTurn: string[]
      hasMovedShipThisTurn: boolean
      robberTileId: string
      pirateTileId: string | null
    }
```
```ts
    case 'RESET_BOARD':
      return {
        settlements: {},
        roads: {},
        ships: {},
        shipsBuiltThisTurn: [],
        hasMovedShipThisTurn: false,
        robberTileId: action.robberTileId,
        pirateTileId: null,
      }
    case 'RESTORE_BOARD':
      return {
        settlements: action.settlements,
        roads: action.roads,
        ships: action.ships,
        shipsBuiltThisTurn: action.shipsBuiltThisTurn,
        hasMovedShipThisTurn: action.hasMovedShipThisTurn,
        robberTileId: action.robberTileId,
        pirateTileId: action.pirateTileId,
      }
```

- [ ] **Step 4: Add `BoardGraph.tileEdgeIds`**

`catan-3d/src/data/boardGraph.ts` — add to the interface, directly below `edgeTileIds`:
```ts
  // Tile id -> the 6 edge ids bounding it — the exact reverse of
  // edgeTileIds above, same "forward/reverse pair" shape tileVertexIds/
  // vertexTileIds already use. Lets the pirate's steal-eligibility check
  // ask "which edges border this hex" the way it already asks "which
  // vertices border this hex" via tileVertexIds.
  tileEdgeIds: Map<string, string[]>
```
In `buildBoardGraph`, add the new map alongside the others (`const tileEdgeIds = new Map<string, string[]>()`), then inside the per-tile corner loop, in the SAME unconditional spot `edgeTileIds` is populated (so it runs once per tile per edge, giving every tile exactly 6 entries regardless of whether the edge itself was newly created or already existed from a neighbor):
```ts
      const tileIds = edgeTileIds.get(id)
      if (tileIds) {
        tileIds.push(tile.id)
      } else {
        edgeTileIds.set(id, [tile.id])
      }
      // Mirrors the block above in the opposite direction — every tile
      // visits each of its own 6 edges exactly once in this loop.
      const edgeIds = tileEdgeIds.get(tile.id)
      if (edgeIds) {
        edgeIds.push(id)
      } else {
        tileEdgeIds.set(tile.id, [id])
      }
```
Add `tileEdgeIds,` to the returned object.

Update the two test fixtures that construct a `BoardGraph` object literal directly (found by grepping `edgeTileIds: new Map()` — added by the prior sub-plan): `catan-3d/src/data/boardGraph.test.ts`'s `emptyGraph` literal and `catan-3d/src/game/knights.test.ts`'s inline literal both need `tileEdgeIds: new Map()` added alongside.

- [ ] **Step 5: Add `MatchSnapshot.pirateTileId`**

`catan-3d/src/multiplayer/matchSnapshot.ts` — add directly below the existing `robberTileId: string` field:
```ts
  // Seafarers pirate (Robber & Pirate Migration sub-plan) — optional,
  // backward-compatible treatment matching every other post-launch field
  // in this file: absent on any snapshot saved before this feature
  // existed. restoreFromSnapshot (App.tsx) falls back to `?? null`, which
  // is always correct for a pre-feature match (the pirate never existed
  // to have been placed).
  pirateTileId?: string | null
```
Do NOT add this to `isPlausibleMatchSnapshot` (optional fields aren't validated there, matching the established pattern — `robberTileId` itself IS validated since it's required, unchanged).

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run board.test -t "robber/pirate data model" && npx vitest run boardGraph.test -t "tileEdgeIds"`
Expected: PASS.

- [ ] **Step 7: Full verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build`
Expected: all four clean. `tsc` will show errors in `App.tsx` at this point (RESET_BOARD/RESTORE_BOARD dispatch sites don't pass the new required fields yet, and `BoardState` no longer has the shape `App.tsx`'s untouched `robberTileId` `useState` expects to coexist with) — that's expected and Task 3's job to fix. **This task's own `tsc -b` check is scoped to `catan-3d/src/game/` and `catan-3d/src/data/` compiling in isolation**: run `npx tsc -b` and confirm the ONLY errors are inside `App.tsx` (not inside any file this task touches) before proceeding. If `board.ts`/`boardGraph.ts`/`matchSnapshot.ts` themselves have errors, fix those; `App.tsx` errors are out of scope for this task and expected until Task 3.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/data/boardGraph.ts catan-3d/src/multiplayer/matchSnapshot.ts catan-3d/src/game/reducers/board.test.ts catan-3d/src/data/boardGraph.test.ts catan-3d/src/game/knights.test.ts
git commit -m "feat: add robberTileId/pirateTileId to BoardState, tileEdgeIds to BoardGraph"
```

---

## Task 2: `ROBBER_MOVED`/`TAXATION_RESOLVED` board cases, `PIRATE_MOVED` action

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/board.test.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`

**Interfaces:**
- Consumes: `BoardState.robberTileId`/`.pirateTileId` (Task 1).
- Produces: `reduceBoard` gains cases for `ROBBER_MOVED` (writes `action.tileId` into `robberTileId`, unconditionally — see the note on `applyRobberMove`'s current conditional-dispatch below, which Task 3 fixes at the call site, not here), `TAXATION_RESOLVED` (same, for the Cities & Knights card that also relocates the robber), and `PIRATE_MOVED` (writes `action.tileId` into `pirateTileId` — nullable, so `null` legally parks it). `reducePlayers` gains a `PIRATE_MOVED` case reusing `ROBBER_MOVED`'s steal logic via one shared helper.

Current state (verified by direct read):
- `catan-3d/src/game/reducers/players.ts`, `ROBBER_MOVED`'s existing case (already dispatched, already does the steal — `reduceBoard` has never had a case for this action at all until now):
```ts
    case 'ROBBER_MOVED': {
      if (action.victimId == null || action.stolenItem == null) return players
      const stolenItem = action.stolenItem
      const isCommodity = (COMMODITY_ORDER as string[]).includes(stolenItem)
      return players.map((p) => {
        if (p.id === action.victimId) {
          return isCommodity
            ? { ...p, commodities: { ...p.commodities, [stolenItem as CommodityType]: p.commodities[stolenItem as CommodityType] - 1 } }
            : { ...p, resources: { ...p.resources, [stolenItem as ResourceType]: p.resources[stolenItem as ResourceType] - 1 } }
        }
        if (p.id === action.thiefId) {
          return isCommodity
            ? { ...p, commodities: { ...p.commodities, [stolenItem as CommodityType]: p.commodities[stolenItem as CommodityType] + 1 } }
            : { ...p, resources: { ...p.resources, [stolenItem as ResourceType]: p.resources[stolenItem as ResourceType] + 1 } }
        }
        return p
      })
    }
```
This case body has ZERO robber-specific logic (confirmed by direct reading) — it's a generic "transfer 1 item from victimId to thiefId" body, reusable verbatim for the pirate.
- `catan-3d/src/game/reducers/players.ts`, `ROBBER_MOVED`'s action type (already exists): `| { type: 'ROBBER_MOVED'; tileId: string; thiefId: number; victimId: number | null; stolenItem: StolenItem | null }`
- `catan-3d/src/game/reducers/players.ts`, `TAXATION_RESOLVED`'s action type (already exists, Cities & Knights — not shown in full here since this task only adds a `reduceBoard` case for it, not a `reducePlayers` change; confirm its exact shape with `grep -n "TAXATION_RESOLVED" catan-3d/src/game/reducers/players.ts` before writing the board.ts case, since only its `tileId` field matters here).

- [ ] **Step 1: Write the failing tests**

```ts
// catan-3d/src/game/reducers/board.test.ts — new describe blocks
describe('reduceBoard — ROBBER_MOVED', () => {
  it('moves the robber to the given tile', () => {
    const state = { ...initialBoardState, robberTileId: 'D1' }
    const result = reduceBoard(
      state,
      { type: 'ROBBER_MOVED', tileId: 'F3', thiefId: 1, victimId: null, stolenItem: null },
      initialGameState,
    )
    expect(result.robberTileId).toBe('F3')
  })

  it('leaves the pirate untouched', () => {
    const state = { ...initialBoardState, robberTileId: 'D1', pirateTileId: 'S1' }
    const result = reduceBoard(
      state,
      { type: 'ROBBER_MOVED', tileId: 'F3', thiefId: 1, victimId: null, stolenItem: null },
      initialGameState,
    )
    expect(result.pirateTileId).toBe('S1')
  })
})

describe('reduceBoard — TAXATION_RESOLVED', () => {
  it('moves the robber to the given tile', () => {
    const state = { ...initialBoardState, robberTileId: 'D1' }
    const result = reduceBoard(
      state,
      { type: 'TAXATION_RESOLVED', playerId: 1, tileId: 'F3', steals: [] },
      initialGameState,
    )
    expect(result.robberTileId).toBe('F3')
  })
})

describe('reduceBoard — PIRATE_MOVED', () => {
  it('moves the pirate to the given tile', () => {
    const state = { ...initialBoardState, pirateTileId: null }
    const result = reduceBoard(
      state,
      { type: 'PIRATE_MOVED', tileId: 'S5', thiefId: 1, victimId: null, stolenItem: null },
      initialGameState,
    )
    expect(result.pirateTileId).toBe('S5')
  })

  it('accepts a null tileId (parked on the frame)', () => {
    const state = { ...initialBoardState, pirateTileId: 'S5' }
    const result = reduceBoard(
      state,
      { type: 'PIRATE_MOVED', tileId: null, thiefId: 1, victimId: null, stolenItem: null },
      initialGameState,
    )
    expect(result.pirateTileId).toBeNull()
  })

  it('leaves the robber untouched', () => {
    const state = { ...initialBoardState, robberTileId: 'D1', pirateTileId: null }
    const result = reduceBoard(
      state,
      { type: 'PIRATE_MOVED', tileId: 'S5', thiefId: 1, victimId: null, stolenItem: null },
      initialGameState,
    )
    expect(result.robberTileId).toBe('D1')
  })
})
```

```ts
// catan-3d/src/game/reducers/players.test.ts — new describe block
describe('reducePlayers — PIRATE_MOVED', () => {
  it('transfers the stolen resource from victim to thief, identically to ROBBER_MOVED', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'PIRATE_MOVED', tileId: 'S5', thiefId: players[0].id, victimId: players[1].id, stolenItem: 'lumber' },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(2)
    expect(result.find((p) => p.id === players[1].id)!.resources.lumber).toBe(0)
  })

  it('is a no-op when there is nothing to steal', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'PIRATE_MOVED', tileId: 'S5', thiefId: players[0].id, victimId: null, stolenItem: null },
      initialGameState,
    )
    expect(result).toEqual(players)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run board.test -t "ROBBER_MOVED" && npx vitest run board.test -t "TAXATION_RESOLVED" && npx vitest run board.test -t "PIRATE_MOVED" && npx vitest run players.test -t "PIRATE_MOVED"`
Expected: FAIL — none of these cases exist yet, `PIRATE_MOVED` isn't a valid action.

- [ ] **Step 3: Add the 3 `reduceBoard` cases**

`catan-3d/src/game/reducers/board.ts` — add `PIRATE_MOVED` to the `BoardAction` union:
```ts
  | { type: 'PIRATE_MOVED'; tileId: string | null; thiefId: number; victimId: number | null; stolenItem: StolenItem | null }
```
(`StolenItem` needs importing from `'../types'` if not already imported — check the existing import line.)

Add to `reduceBoard`'s switch:
```ts
    case 'ROBBER_MOVED':
      return { ...state, robberTileId: action.tileId }
    case 'TAXATION_RESOLVED':
      return { ...state, robberTileId: action.tileId }
    case 'PIRATE_MOVED':
      return { ...state, pirateTileId: action.tileId }
```
Add to `describeBoardAction`'s switch (this file's hand-maintained action-description list, per Global Constraints):
```ts
    case 'ROBBER_MOVED':
    case 'TAXATION_RESOLVED':
      // No banner/sfx here — App.tsx's applyRobberMove/applyTaxationResolved
      // already build their own richer `inform(...)` message (steal outcome,
      // biome name) and play their own sfx directly, bypassing
      // describeBoardAction entirely for these two actions, same as
      // RESET_BOARD/RESTORE_BOARD already do (see that case's own comment).
      return { message: null, sfx: null }
    case 'PIRATE_MOVED':
      return { message: null, sfx: null }
```

- [ ] **Step 4: Factor the steal body into a shared helper, add the `PIRATE_MOVED` `reducePlayers` case**

`catan-3d/src/game/reducers/players.ts` — extract `ROBBER_MOVED`'s existing case body into a standalone function directly above the `reducePlayers` switch:
```ts
// Shared by ROBBER_MOVED and PIRATE_MOVED — genuinely piece-agnostic: a
// resource/commodity transfer between two players keyed by stolenItem, with
// no reference to a tile, a biome, or which piece triggered it. tileId is
// deliberately not a parameter here — neither caller's steal logic needs it,
// it only matters to the corresponding reduceBoard case and to App.tsx's own
// toast-message lookup.
function applyStealTransfer(
  players: Player[],
  thiefId: number,
  victimId: number | null,
  stolenItem: StolenItem | null,
): Player[] {
  if (victimId == null || stolenItem == null) return players
  const isCommodity = (COMMODITY_ORDER as string[]).includes(stolenItem)
  return players.map((p) => {
    if (p.id === victimId) {
      return isCommodity
        ? { ...p, commodities: { ...p.commodities, [stolenItem as CommodityType]: p.commodities[stolenItem as CommodityType] - 1 } }
        : { ...p, resources: { ...p.resources, [stolenItem as ResourceType]: p.resources[stolenItem as ResourceType] - 1 } }
    }
    if (p.id === thiefId) {
      return isCommodity
        ? { ...p, commodities: { ...p.commodities, [stolenItem as CommodityType]: p.commodities[stolenItem as CommodityType] + 1 } }
        : { ...p, resources: { ...p.resources, [stolenItem as ResourceType]: p.resources[stolenItem as ResourceType] + 1 } }
    }
    return p
  })
}
```
Replace `ROBBER_MOVED`'s existing case body with a call to it, and add `PIRATE_MOVED` right alongside:
```ts
    case 'ROBBER_MOVED':
      return applyStealTransfer(players, action.thiefId, action.victimId, action.stolenItem)
    case 'PIRATE_MOVED':
      return applyStealTransfer(players, action.thiefId, action.victimId, action.stolenItem)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run board.test -t "ROBBER_MOVED" && npx vitest run board.test -t "TAXATION_RESOLVED" && npx vitest run board.test -t "PIRATE_MOVED" && npx vitest run players.test -t "PIRATE_MOVED"`
Expected: PASS. Also run the full `players.test.ts` file to confirm `ROBBER_MOVED`'s PRE-EXISTING tests still pass unchanged after the extraction: `npx vitest run players.test -t "ROBBER_MOVED"`.

- [ ] **Step 6: Full verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build`
Expected: `board.ts`/`players.ts` and their tests compile and pass clean. `App.tsx` still has pre-existing errors from Task 1 (expected, Task 3's job) — confirm no NEW `App.tsx` errors were introduced by this task's changes (the error set should be identical to Task 1's, not larger).

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/board.test.ts catan-3d/src/game/reducers/players.test.ts
git commit -m "feat: add ROBBER_MOVED/TAXATION_RESOLVED board cases, PIRATE_MOVED action with shared steal helper"
```

---

## Task 3: Migrate `App.tsx`'s `robberTileId` off `useState` — HIGH SCRUTINY

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `BoardState.robberTileId` (Task 1), the 3 `reduceBoard` cases (Task 2).
- Produces: no new interfaces — this task's entire job is making every existing robber-reading/writing site in `App.tsx` use `gameState.board.robberTileId` instead of a local `useState`, with the robber staying exactly as playable as it is today. Nothing about the robber's player-visible behavior should change.

**This is the highest-risk task in this plan.** The robber is used in every game today (every rolled 7, every Knight card). Read every citation below directly against the current file before editing — Tasks 1-2 may have shifted line numbers slightly.

Current state (verified by direct read; ~15 sites across `App.tsx`):

1. **Declaration** (~line 548): `const [robberTileId, setRobberTileId] = useState(() => tiles.find((tile) => tile.biome === 'desert')!.id)` — **delete this line entirely.**
2. **`applyRobberMove`** (~line 980-1028): currently calls `setRobberTileId(tileId)` unconditionally (line ~1000) but only dispatches `ROBBER_MOVED` CONDITIONALLY (`if (victimId != null && safeStolenItem != null)`, ~line 1004) — i.e. today, the robber still visually moves even when nobody has anything to steal, but no `ROBBER_MOVED` action reaches the reducer in that case. After migration, the piece-move MUST become the dispatch (there's no other way to write `robberTileId` now) — so **remove the `if` gate and dispatch `ROBBER_MOVED` unconditionally**, deleting `setRobberTileId(tileId)` entirely. `reducePlayers`'s `ROBBER_MOVED` case (via `applyStealTransfer`, Task 2) already no-ops correctly when `victimId`/`stolenItem` are null, so this is a pure behavior-preserving refactor: the piece always moves (now via `reduceBoard`'s new case), the steal only happens when there's something to steal (unchanged). Confirm nothing downstream depended on the OLD conditional-dispatch behavior (e.g. a receiver checking whether a `ROBBER_MOVED` broadcast arrived to infer "was there a steal") — there isn't: `broadcastRobberMoved` in `moveRobber` (site 8 below) already fires unconditionally today, regardless of whether `applyRobberMove` internally dispatched or not, so receivers already only ever learn about a robber move via the broadcast payload's own `victimId`/`stolenItem` fields, never via dispatch-occurred-or-not.
3. **`RESOURCES_PRODUCED`'s robber-blocking check** (~line 3372-3382, and a third site ~line 3425 for the Science-level-3 exclusion) — 3 separate `robberTileId` reads, all comparing a tile id against the closure variable. Change each to `gameState.board.robberTileId`.
4. **`applyTaxationResolved`** (~line 3699-3738) — same unconditional-`setRobberTileId` pattern as `applyRobberMove`, but `TAXATION_RESOLVED` is ALREADY dispatched unconditionally in this function (confirmed — `dispatch({ type: 'TAXATION_RESOLVED', ... })` is not gated). Simply delete the `setRobberTileId(tileId)` line; Task 2's new `reduceBoard` case for `TAXATION_RESOLVED` now handles the position write.
5. **`resolveTaxation`'s move-eligibility check** (~line 3767): `if (tileId === robberTileId)` → `if (tileId === gameState.board.robberTileId)`.
6. **`moveRobber`'s move-eligibility check** (~line 3818): same change.
7. **`armChaseRobber`'s adjacency check** (~line 5006): `if (!adjacentTileIds.has(robberTileId))` → `if (!adjacentTileIds.has(gameState.board.robberTileId))`.
8. **Game-reset** (~line 6027): `setRobberTileId((desertTile ?? freshTiles[0]).id)` — this now needs to flow through `RESET_BOARD`'s new `robberTileId` parameter (Task 1). Find the `dispatch({ type: 'RESET_BOARD' })` call site in the SAME reset function (the board reset and the robber reset currently happen as two separate statements; after migration they're the same dispatch) and change it to `dispatch({ type: 'RESET_BOARD', robberTileId: (desertTile ?? freshTiles[0]).id })`, then delete the standalone `setRobberTileId(...)` line.
9. **Snapshot restore** (~line 6280): `setRobberTileId(snapshot.robberTileId)` — this now needs to flow through `RESTORE_BOARD`'s dispatch (Task 1 extended its payload). Find the `dispatch({ type: 'RESTORE_BOARD', settlements: ..., roads: ..., ships: ..., shipsBuiltThisTurn: ..., hasMovedShipThisTurn: ... })` call in the SAME restore function and add `robberTileId: snapshot.robberTileId, pirateTileId: snapshot.pirateTileId ?? null,` to that single dispatch object, then delete the standalone `setRobberTileId(...)` line.
10. **Snapshot save** (~line 6534, object-literal field; ~line 6577, `useEffect` dependency array): change `robberTileId,` → `robberTileId: gameState.board.robberTileId,` in the saved-snapshot object literal, and add `pirateTileId: gameState.board.pirateTileId,` alongside it. In the dependency array, change `robberTileId,` → `gameState.board.robberTileId,` and add `gameState.board.pirateTileId,`.
11. **`<RobberLayer>` prop** (~line 6751): `robberTileId={robberTileId}` → `robberTileId={gameState.board.robberTileId}`.
12. **`canChaseRobber` prop closure** (~line 6975): `.has(robberTileId)` → `.has(gameState.board.robberTileId)`.

- [ ] **Step 1: Make all 12 changes above**

Work through the list in order, confirming each site's actual current line/content before editing (Tasks 1-2 may have shifted things by a handful of lines). Do not change any OTHER behavior in the functions you're touching — this is a pure state-relocation task.

- [ ] **Step 2: Typecheck**

Run: `cd catan-3d && npx tsc -b`
Expected: clean — zero errors anywhere, including `App.tsx` (this is the task that resolves every `App.tsx` error Tasks 1-2 left pending).

- [ ] **Step 3: Full automated verification**

Run: `cd catan-3d && npx eslint src && npx vitest run && npm run build`
Expected: all three clean, full suite passing.

- [ ] **Step 4: Manual playtest — mandatory, not optional**

Automated tests cannot exercise the 3D click-to-move-robber flow. Start the dev server (`npx vite`), open the app, and actually play through:
1. Start a new game (confirms `RESET_BOARD`'s new `robberTileId` parameter places the robber on the desert tile correctly — check the console for errors and confirm the robber figurine renders on the desert hex).
2. Roll dice until a 7 comes up (or use whatever dev/debug shortcut this project has for forcing a specific roll, if one exists — check for one before manually re-rolling many times).
3. Confirm the robber-move UI activates, click a different hex, confirm the robber figurine actually moves there.
4. If a steal was available, confirm resources actually transferred (check a player's hand before/after).
5. If Cities & Knights knights are enabled in this session's house rules, test "Chase Away the Robber" once: arm it from an adjacent knight, confirm the robber moves and the knight deactivates.
6. Save and reload/reconnect (or use the snapshot save/restore flow if this project has a manual trigger for it) — confirm the robber's position survives a restore.

Report the exact steps taken and outcomes in your task report — this is the one verification step in this whole sub-plan that cannot be skipped or approximated by reading code, since a regression here breaks live gameplay for every match.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "refactor: migrate robberTileId from useState to BoardState, preserving existing behavior"
```

---

## Task 4: Pirate movement and steal mechanic

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `BoardState.pirateTileId` (Task 1), `PIRATE_MOVED` action (Task 2), `BoardGraph.tileEdgeIds` (Task 1), `gameState.board.ships` (Ships & Longest Route sub-plan).
- Produces: `edgeTouchesSea`-adjacent helper `isPirateEligibleTile` (sea-only placement check), `pirateVictimShipOwners` (collects distinct ship-owner ids touching a tile, mirroring `moveRobber`'s building-owner collection), `applyPiratePlace` (the shared apply-and-dispatch helper, mirroring `applyRobberMove`), `movePirate` (the click-handler equivalent of `moveRobber`, minus the taxation/chase-away branches — those are Task 5's job for chase-away, and taxation never applies to the pirate). `PirateMovedPayload`/`broadcastPirateMoved`/`onPirateMoved` in `useRoomChannel.ts`, mirroring `RobberMovedPayload`'s existing 5-touch-point pattern (already established for `ShipBuiltPayload`/`ShipMovedPayload` by the prior sub-plan).

**No player-facing trigger for the pirate exists after this task** — `movePirate` is dispatchable and fully tested, but nothing calls it yet (same `void movePirate` idiom the Ships sub-plan established for `buildShipRaw`/`moveShipRaw`, since `noUnusedLocals: true` is on). Task 6 wires the actual trigger UI.

**Note on `GamePhase`:** `movePirate`'s own body (Step 3 below) needs to check `gamePhase !== 'movePirate'`, and Task 5's `armChasePirate` needs to set `setGamePhase('movePirate')` — both come before Task 6 (which is where the OTHER new phase, `'chooseRobberOrPirate'`, is needed for the choice picker). This task therefore extends `GamePhase` itself, adding only `'movePirate'`; Task 6 extends it a second time, adding `'chooseRobberOrPirate'`.

Current state (verified by direct read):
- `catan-3d/src/multiplayer/useRoomChannel.ts:113` (approx): `RobberMovedPayload` interface — `{ tileId: string; thiefId: number; victimId: number | null; stolenItem: StolenItem | null }` — the exact shape to mirror, except `tileId` becomes `tileId: string | null` for the pirate (parkable).
- `catan-3d/src/App.tsx`'s `moveRobber` (~line 3799-3893) — the victim-collection loop (lines ~3828-3855) is the template: for each vertex of the target tile, find the building owner (excluding the thief, deduped, friendly-robber-filtered). The pirate's version does the same over EDGES instead of vertices, checking `gameState.board.ships[edgeId]` ownership instead of `gameState.board.settlements[vertexId]?.ownerId`, with NO friendly-robber-style VP filter (CN3083 doesn't mention one for the pirate — confirm this stays absent, don't add one speculatively).
- `catan-3d/src/App.tsx`'s `heldItemsFor`/`pickRandom` (module-scope functions, ~line 190-210) — reusable as-is for the pirate's item pick.

- [ ] **Step 1: Add `PirateMovedPayload`/`broadcastPirateMoved`/`onPirateMoved` to `useRoomChannel.ts`**

Same mechanical 5-touch-point pattern as `RobberMovedPayload`:
```ts
// Interface, alongside RobberMovedPayload:
export interface PirateMovedPayload {
  tileId: string | null
  thiefId: number
  victimId: number | null
  stolenItem: StolenItem | null
}
```
```ts
// Handlers interface:
  onPirateMoved?: (payload: PirateMovedPayload) => void
```
```ts
// Subscription:
    channel.on<PirateMovedPayload>('broadcast', { event: 'PIRATE_MOVED' }, ({ payload }) => {
      handlersRef.current.onPirateMoved?.(payload)
    })
```
```ts
// Broadcast function:
  const broadcastPirateMoved = (payload: PirateMovedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'PIRATE_MOVED', payload })
  }
```
```ts
// Returned object:
    broadcastPirateMoved,
```

- [ ] **Step 2: Extend `GamePhase` with `'movePirate'`**

`catan-3d/src/App.tsx:123`, current state: `export type GamePhase = 'setup' | 'playing' | 'discard' | 'moveRobber'`. Change to:
```ts
export type GamePhase = 'setup' | 'playing' | 'discard' | 'moveRobber' | 'movePirate'
```
(Task 6 extends this again, adding `'chooseRobberOrPirate'` — do not add it here, `'movePirate'` is the only value this task's own code needs.)

- [ ] **Step 3: Add pirate eligibility helpers to `App.tsx`**

Add near `edgeTouchesSea`/`isShipPlacementConnected` (`shipEligibility.ts` or `App.tsx`, wherever `edgeTouchesSea` currently lives — check its actual location, it may have moved during the Ships sub-plan's own fix round):
```ts
  // CN3083: the pirate may only be placed on a sea hex.
  const isPirateEligibleTile = (tileId: string): boolean => tileById.get(tileId)?.biome === 'sea'

  // CN3083: "only choose 1 player with a ship on that hex" — collects every
  // distinct ship owner touching the tile's 6 edges, excluding the thief.
  // Mirrors moveRobber's building-owner collection exactly, over edges/ships
  // instead of vertices/settlements. No friendly-robber-style VP filter —
  // CN3083 doesn't specify one for the pirate.
  const pirateVictimShipOwners = (tileId: string, thiefId: number): number[] => {
    const edgeIds = graph.tileEdgeIds.get(tileId) ?? []
    const ownerIds: number[] = []
    for (const edgeId of edgeIds) {
      const ownerId = gameState.board.ships[edgeId]
      if (ownerId != null && ownerId !== thiefId && !ownerIds.includes(ownerId)) {
        ownerIds.push(ownerId)
      }
    }
    return ownerIds
  }
```

- [ ] **Step 4: Add `applyPiratePlace` and `movePirate`**

Add directly after `applyRobberMove`:
```ts
  const applyPiratePlace = (
    tileId: string | null,
    thiefId: number,
    victimId: number | null,
    stolenItem: StolenItem | null,
  ) => {
    const safeStolenItem =
      stolenItem != null && ((RESOURCE_ORDER as string[]).includes(stolenItem) || (COMMODITY_ORDER as string[]).includes(stolenItem))
        ? stolenItem
        : null
    if (stolenItem != null && safeStolenItem == null) {
      console.error('[Catan] Ignoring pirate-move payload with an invalid stolen item:', stolenItem)
    }
    dispatch({ type: 'PIRATE_MOVED', tileId, thiefId, victimId, stolenItem: safeStolenItem })
    playSfx('robber')

    let stealNote = ''
    if (victimId != null && safeStolenItem != null) {
      const isCommodity = (COMMODITY_ORDER as string[]).includes(safeStolenItem)
      const thief = playerById.get(thiefId)
      const victim = playerById.get(victimId)
      if (thief && victim) {
        const label = isCommodity ? COMMODITY_LABELS[safeStolenItem as CommodityType] : RESOURCE_LABELS[safeStolenItem as ResourceType]
        stealNote = ` ${thief.name} stole 1 ${label} from ${victim.name}!`
      }
    } else if (victimId != null) {
      const victim = playerById.get(victimId)
      if (victim) stealNote = ` ${victim.name} had nothing to steal.`
    }

    if (tileId != null) {
      const tile = tileById.get(tileId)
      if (tile) inform(`The Pirate moves to ${BIOME_LABELS[tile.biome]}.${stealNote}`)
    } else {
      inform('The Pirate returns to the frame.')
    }
    setGamePhase('playing')
  }

  const movePirate = (tileId: string | null) => {
    if (winner) return
    if (gamePhase !== 'movePirate') return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (tileId != null && !isPirateEligibleTile(tileId)) {
      warn('The Pirate can only be placed on a sea hex.')
      return
    }

    const thief = players[currentPlayerIndex]
    let victimId: number | null = null
    let stolenItem: StolenItem | null = null
    if (tileId != null) {
      const victimIds = pirateVictimShipOwners(tileId, thief.id)
      if (victimIds.length > 0) {
        victimId = pickRandom(victimIds)
        const victim = playerById.get(victimId)
        if (victim) {
          const heldItems = heldItemsFor(victim)
          if (heldItems.length > 0) stolenItem = pickRandom(heldItems)
        }
      }
    }

    applyPiratePlace(tileId, thief.id, victimId, stolenItem)
    if (onlineInfo) broadcastPirateMoved({ tileId, thiefId: thief.id, victimId, stolenItem })
  }
  // No 3D UI calls movePirate yet (the robber-or-pirate choice picker is a
  // later task in this same sub-plan) — kept reachable so noUnusedLocals
  // doesn't flag it, same idiom the Ships sub-plan established.
  void movePirate
```

- [ ] **Step 5: Wire broadcast and receiver registration**

Destructure `broadcastPirateMoved` from the `useRoomChannel` hook's return value, alongside `broadcastRobberMoved`. Register the receiver:
```ts
    onPirateMoved: (payload) =>
      applyPiratePlace(payload.tileId, payload.thiefId, payload.victimId, payload.stolenItem),
```

- [ ] **Step 6: Run tests, full verification**

There is no formal test file for this eligibility logic yet (it's closures inside `App.tsx`, same situation the Ships sub-plan's final review found and partially fixed by extracting `shipEligibility.ts` — extracting `isPirateEligibleTile`/`pirateVictimShipOwners` into a similarly testable pure module is NOT required by this task, but flag it as a Minor concern in your task report if you judge it worth a follow-up, the same way the Ships sub-plan's own untested closures were flagged before their bug was found).

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build`
Expected: all four clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: add pirate movement and ship-based steal mechanic"
```

---

## Task 5: Chase Away the Pirate

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `movePirate`/`applyPiratePlace` (Task 4), `BoardState.pirateTileId` (Task 1), `BoardGraph.tileVertexIds` (existing).
- Produces: `chasingPirateKnightId` (local state, mirrors `chasingRobberKnightId`), `armChasePirate`/`canChasePirate` (mirrors `armChaseRobber`/its adjacency-check closure exactly, checking `pirateTileId` instead of `robberTileId` — and skipping the `pirateTileId == null` case, since a parked pirate can't be adjacent to anything), `movePirate`'s tail gains the same `KNIGHT_DEACTIVATED_AFTER_CHASE` dispatch-and-clear sequence `moveRobber`'s tail already has for `chasingRobberKnightId`.

Current state (verified by direct read):
- `catan-3d/src/App.tsx`, `chasingRobberKnightId` declaration (~line 624): `const [chasingRobberKnightId, setChasingRobberKnightId] = useState<string | null>(null)`.
- `catan-3d/src/App.tsx`, `armChaseRobber` (~line 4980-5012, full body already quoted in this plan's research — the gate order is: barbarian-activation → turn ownership → `gamePhase === 'playing'` → knight exists & active → knight adjacent to `robberTileId`).
- `catan-3d/src/App.tsx`, `moveRobber`'s tail (~line 3887-3892): `if (chasingRobberKnightId) { dispatch({ type: 'KNIGHT_DEACTIVATED_AFTER_CHASE', playerId: thief.id, knightId: chasingRobberKnightId }); setChasingRobberKnightId(null); if (onlineInfo) broadcastKnightDeactivatedAfterChase({ playerId: thief.id, knightId: chasingRobberKnightId }) }` — a SEPARATE dispatch issued right after the move's own dispatch/broadcast, not batched into it.
- `catan-3d/src/App.tsx`, `canChaseRobber` prop closure (~line 6975): `canChaseRobber={(knight) => new Set(graph.vertexTileIds.get(knight.vertexId) ?? []).has(gameState.board.robberTileId)}` (post-Task-3 form) — passed to the knight panel for per-knight UI gating.

- [ ] **Step 1: Add `chasingPirateKnightId` state and `armChasePirate`**

Add directly after `chasingRobberKnightId`'s declaration:
```ts
  // Mirrors chasingRobberKnightId exactly, for the pirate's own Chase Away
  // counterpart (CN3083/CN3087: the existing C&K chase-away mechanic
  // applies to whichever piece — robber or pirate — the acting knight is
  // adjacent to).
  const [chasingPirateKnightId, setChasingPirateKnightId] = useState<string | null>(null)
```
Add directly after `armChaseRobber`, mirroring its exact gate order but checking `pirateTileId`:
```ts
  const armChasePirate = (knightId: string) => {
    if (gameRules.citiesAndKnightsBarbarians && !robberActive) {
      warn('The robber has not activated yet.')
      return
    }
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (gamePhase !== 'playing') {
      warn('Cannot chase the pirate right now.')
      return
    }
    const player = players[currentPlayerIndex]
    const knight = player.knightPieces.find((k) => k.id === knightId)
    if (!knight || !knight.active) {
      warn('That knight cannot chase the pirate.')
      return
    }
    if (gameState.board.pirateTileId == null) {
      warn('The Pirate is not on the board.')
      return
    }
    const adjacentTileIds = new Set(graph.vertexTileIds.get(knight.vertexId) ?? [])
    if (!adjacentTileIds.has(gameState.board.pirateTileId)) {
      warn('That knight is not next to the pirate.')
      return
    }
    setChasingPirateKnightId(knightId)
    setGamePhase('movePirate')
  }
```

- [ ] **Step 2: Add `movePirate`'s chase-away tail**

`movePirate` (Task 4) currently ends right after its `broadcastPirateMoved` call. Add, mirroring `moveRobber`'s tail exactly:
```ts
    if (chasingPirateKnightId) {
      const chaserId = chasingPirateKnightId
      dispatch({ type: 'KNIGHT_DEACTIVATED_AFTER_CHASE', playerId: thief.id, knightId: chaserId })
      setChasingPirateKnightId(null)
      if (onlineInfo) broadcastKnightDeactivatedAfterChase({ playerId: thief.id, knightId: chaserId })
    }
```
(Placed after the existing `if (onlineInfo) broadcastPirateMoved(...)` line from Task 4, inside the same function.)

- [ ] **Step 3: Add `canChasePirate` prop closure**

Directly alongside `canChaseRobber`'s existing prop (wherever the knight panel component receives it):
```tsx
canChasePirate={(knight) =>
  gameState.board.pirateTileId != null &&
  new Set(graph.vertexTileIds.get(knight.vertexId) ?? []).has(gameState.board.pirateTileId)
}
```
This requires the knight-panel component (`GameHud` or wherever `canChaseRobber` is actually consumed — confirm the exact component and prop-threading path by reading `canChaseRobber`'s full consumer chain, not just its declaration site) to also accept and use a new `canChasePirate`/`onArmChasePirate` prop pair, mirroring `canChaseRobber`/`onArmChaseRobber` exactly. Wire `onArmChasePirate={armChasePirate}` alongside.

- [ ] **Step 4: Full verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build`
Expected: all four clean.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/hud/GameHud.tsx
git commit -m "feat: add Chase Away the Pirate, mirroring the robber's existing chase-away mechanic"
```

(Adjust the `git add` file list to match whichever component file actually needed the new props in Step 3 — confirm the real path during implementation rather than trusting this plan's guess.)

---

## Task 6: Robber-or-pirate choice UI

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `movePirate` (Task 4), the existing `moveRobber`/`'moveRobber'` gamePhase (untouched).
- Produces: `GamePhase` gains `'chooseRobberOrPirate'` and `'movePirate'`. A new local trigger point replaces the 2 in-scope `setGamePhase('moveRobber')` call sites (Knight card, rolled 7) with `setGamePhase('chooseRobberOrPirate')`; a minimal picker (2 buttons: "Move the Robber" / "Move the Pirate") resolves into either the existing `'moveRobber'` phase or the new `'movePirate'` phase. Taxation and Chase Away the Robber/Pirate are untouched — they arm their OWN specific phase directly (`'moveRobber'` or `'movePirate'`), bypassing the choice screen entirely, since those triggers are already piece-specific by construction (Taxation always robber; each chase-away function already knows which piece it's chasing).

Current state (verified by direct read):
- `catan-3d/src/App.tsx:123`: by this point in the plan, Task 4 has already extended this to `export type GamePhase = 'setup' | 'playing' | 'discard' | 'moveRobber' | 'movePirate'` — re-confirm the exact current text before editing, don't assume it's still the pre-Task-4 form.
- 2 in-scope trigger sites (confirmed the OTHER 4 `setGamePhase('moveRobber')` sites — discard-resolves x2, Chase Away the Robber, Taxation — are OUT of scope, per this plan's Global Constraints):
  - `applyKnightPlay` (~line 1037-1042): `setGamePhase('moveRobber')` at the end, unconditional.
  - The rolled-7 direct branch (~line 3356-3358): `setGamePhase('moveRobber')` inside an `else if (!gameRules.citiesAndKnightsBarbarians || robberActive)` branch.
- `<RobberLayer isMovingRobber={gamePhase === 'moveRobber' && !winner && isMyTurn} onMoveRobber={moveRobber} ...>` (~line 6752-6753) — the existing robber tile-picker's activation condition.

- [ ] **Step 1: Extend `GamePhase` with `'chooseRobberOrPirate'`**

`'movePirate'` already exists on this type from Task 4 — this step ADDS one more value, it doesn't redefine the type from scratch:
```ts
export type GamePhase = 'setup' | 'playing' | 'discard' | 'chooseRobberOrPirate' | 'moveRobber' | 'movePirate'
```

- [ ] **Step 2: Change the 2 in-scope trigger sites**

`applyKnightPlay`: change `setGamePhase('moveRobber')` to `setGamePhase('chooseRobberOrPirate')`, and update its `inform(...)` message from `'Move the Robber.'` to something reflecting the choice, e.g. `` `${player.name} played a Knight! Choose the Robber or the Pirate.` ``.

The rolled-7 branch: same change — `setGamePhase('moveRobber')` → `setGamePhase('chooseRobberOrPirate')`, and its `inform('Rolled 7 — move the Robber.')` → `inform('Rolled 7 — choose the Robber or the Pirate.')`.

Leave every other `setGamePhase('moveRobber')` call site (discard x2, Chase Away the Robber, Taxation) and every `setGamePhase('movePirate')` call site (Chase Away the Pirate, from Task 5) completely untouched.

- [ ] **Step 3: Add the choice picker**

Add two handler functions near `moveRobber`/`movePirate`:
```ts
  const chooseRobber = () => {
    if (gamePhase !== 'chooseRobberOrPirate') return
    if (!isMyTurn) return
    setGamePhase('moveRobber')
  }

  const choosePirate = () => {
    if (gamePhase !== 'chooseRobberOrPirate') return
    if (!isMyTurn) return
    setGamePhase('movePirate')
  }
```
Find wherever this project renders turn-phase-conditional action buttons (the same rendering region `RobberLayer`'s `isMovingRobber` prop or an equivalent HUD banner lives in — search for how the existing `'discard'`/`'moveRobber'` phases surface UI to the player, since `'chooseRobberOrPirate'` needs the SAME kind of visible affordance, not a new modal system). Add a minimal conditional render, matching this project's existing conventions for phase-gated prompts (a HUD banner or overlay with 2 buttons is sufficient — do not build a new dialog/modal component if an existing banner pattern already fits):
```tsx
{gamePhase === 'chooseRobberOrPirate' && isMyTurn && !winner && (
  <div className="robber-pirate-choice">
    <button onClick={chooseRobber}>Move the Robber</button>
    <button onClick={choosePirate}>Move the Pirate</button>
  </div>
)}
```
(Match this project's actual existing CSS/className conventions for similar overlays rather than inventing a new one — find and reuse whatever class the discard-phase or trade-phase banners already use as a base, adjusting only the content.)

- [ ] **Step 4: Wire the pirate tile-picker rendering**

`RobberLayer` currently only renders click targets for LAND tiles implicitly (it iterates `tiles.map(...)` with no biome filter — it relies on `isMovingRobber` only being true during `'moveRobber'`, and the robber is never expected to target a sea tile anyway, so this has never needed a filter). For the pirate, either extend `RobberLayer` to accept a `mode: 'robber' | 'pirate'` prop that filters its click targets by biome (`'sea'` for pirate, everything-but-sea for robber — though today land-only was never actually enforced, just incidentally true), or render RobberLayer twice with different props. Prefer extending `RobberLayer` itself (single component, less duplication) — add:
```tsx
interface RobberLayerProps {
  tiles: HexTileData[]
  robberTileId: string
  isMovingRobber: boolean
  onMoveRobber: (tileId: string) => void
  hiddenTilesMode: GameRules['hiddenTiles']
  revealedTileIds: ReadonlySet<string>
  // NEW — when set, this component instead renders the PIRATE (a
  // nullable position, sea-tile-only click targets, and a "return to
  // frame" affordance is out of scope for this task's minimal picker —
  // the pirate can be PLACED via a sea-tile click but not yet explicitly
  // parked back to null through this UI).
  pirateTileId?: string | null
  isMovingPirate?: boolean
  onMovePirate?: (tileId: string) => void
}
```
Inside the component, when `isMovingPirate` is true, render sea-tile-only click targets (`tiles.filter((t) => t.biome === 'sea')`) calling `onMovePirate` instead of `onMoveRobber`, and render the pirate's own figurine/glow at `pirateTileId` (when non-null) the same way the robber's are rendered — reuse `RobberTileGlow`/`RobberToken`-equivalent visuals if a pirate-specific model exists, or flag in your task report if it doesn't (a placeholder reuse of the robber's own token model is an acceptable interim choice, matching this whole project's established "flag and use an existing model as a placeholder" pattern from the Board Foundation sub-plan — do not block this task on new 3D art).

Wire the new props at `RobberLayer`'s call site:
```tsx
pirateTileId={gameState.board.pirateTileId}
isMovingPirate={gamePhase === 'movePirate' && !winner && isMyTurn}
onMovePirate={movePirate}
```

- [ ] **Step 5: Full verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build`
Expected: all four clean.

- [ ] **Step 6: Manual playtest**

Boot the dev server, roll to a 7 (or play a Knight card), confirm the choice picker appears, confirm choosing the pirate enters the sea-hex picker and actually places the pirate (figurine visible, position persists), confirm choosing the robber still works exactly as it did before this task (regression check against Task 3's own playtest).

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/RobberLayer.tsx
git commit -m "feat: add robber-or-pirate choice UI for the 7-roll and Knight-card triggers"
```

---

## Task 7: Close the pirate-adjacency ship-eligibility gaps

**Files:**
- Modify: `catan-3d/src/game/shipEligibility.ts`
- Modify: `catan-3d/src/App.tsx`
- Test: `catan-3d/src/game/shipEligibility.test.ts`

**Interfaces:**
- Consumes: `BoardState.pirateTileId` (Task 1), `BoardGraph.edgeTileIds` (Ships & Longest Route sub-plan).
- Produces: `isShipPlacementConnected` and the ship-movement eligibility path both reject any edge bordering the pirate's current tile. Closes the 3 `KNOWN GAP` comments the Ships & Longest Route sub-plan explicitly left for this sub-plan to pick up (confirmed present at `App.tsx`'s `edgeTouchesSea`/`buildShipRaw`/`moveShipRaw`, and `shipEligibility.ts`'s `isShipPlacementConnected`).

Current state (verified by direct read): grep `KNOWN GAP` in `catan-3d/src/App.tsx` and `catan-3d/src/game/shipEligibility.ts` for the exact current locations and wording — these were added by the prior sub-plan and this task's job is to replace each with real logic, not just acknowledge them.

- [ ] **Step 1: Write the failing tests**

```ts
// catan-3d/src/game/shipEligibility.test.ts — new describe block
describe('isShipPlacementConnected — pirate adjacency', () => {
  it('rejects placement on an edge bordering the pirate\'s hex', () => {
    // Edge AB borders tile T1 (the pirate's hex) and tile T2.
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    graph.edgeTileIds.set('AB', ['T1', 'T2'])
    const settlements: Record<string, Building> = { A: { ownerId: 1, type: 'settlement' } }
    expect(isShipPlacementConnected(graph, edgeMap(edges), settlements, {}, 'AB', 1, undefined, 'T1')).toBe(false)
  })

  it('still allows placement on an edge NOT bordering the pirate\'s hex', () => {
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    graph.edgeTileIds.set('AB', ['T2', 'T3'])
    const settlements: Record<string, Building> = { A: { ownerId: 1, type: 'settlement' } }
    expect(isShipPlacementConnected(graph, edgeMap(edges), settlements, {}, 'AB', 1, undefined, 'T1')).toBe(true)
  })

  it('a null pirateTileId (parked) blocks nothing', () => {
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    const settlements: Record<string, Building> = { A: { ownerId: 1, type: 'settlement' } }
    expect(isShipPlacementConnected(graph, edgeMap(edges), settlements, {}, 'AB', 1, undefined, null)).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run shipEligibility.test -t "pirate adjacency"`
Expected: FAIL — `isShipPlacementConnected` doesn't accept a `pirateTileId` argument yet.

- [ ] **Step 3: Extend `isShipPlacementConnected` with a pirate-adjacency check**

`catan-3d/src/game/shipEligibility.ts` — add a new trailing optional parameter (after `excludeEdgeId`, so every existing call site keeps compiling unchanged, same backward-compatible-by-appending pattern `calculateLongestRoad`'s `ships` parameter used):
```ts
export function isShipPlacementConnected(
  graph: BoardGraph,
  edgeById: Map<string, BoardEdge>,
  settlements: Record<string, Building>,
  ships: Record<string, number>,
  edgeId: string,
  playerId: number,
  excludeEdgeId?: string,
  pirateTileId?: string | null,
): boolean {
  const edge = edgeById.get(edgeId)
  if (!edge) return false
  if (pirateTileId != null && (graph.edgeTileIds.get(edgeId) ?? []).includes(pirateTileId)) return false
  if (settlements[edge.a]?.ownerId === playerId || settlements[edge.b]?.ownerId === playerId) return true
  return (
    hasPlayerShipAt(graph, ships, edge.a, playerId, excludeEdgeId) ||
    hasPlayerShipAt(graph, ships, edge.b, playerId, excludeEdgeId)
  )
}
```
Remove the module's `KNOWN GAP` comment on this function (the gap is now closed) — replace it with a plain rules citation if useful, but don't leave stale "not implemented yet" wording once it is.

- [ ] **Step 4: Update `App.tsx`'s call sites and remove its 3 `KNOWN GAP` comments**

`buildShipRaw`'s call to `isShipPlacementConnected(...)`: add `gameState.board.pirateTileId` as the 8th argument (after `fromEdgeId`'s slot, which `buildShipRaw` doesn't pass — use `undefined` for `excludeEdgeId` there, matching its existing call, then the pirate tile id).

`moveShipRaw`'s call: add `gameState.board.pirateTileId` as the 8th argument, after its existing `fromEdgeId` `excludeEdgeId` argument.

`edgeTouchesSea` needs its own pirate check too — CN3083 blocks a ship from being placed OR moved to any edge of the pirate's hex, which is really the same check `isShipPlacementConnected` now performs — but `edgeTouchesSea` and `isShipPlacementConnected` are independent checks in the current eligibility chain (both must pass). Confirm during implementation whether `edgeTouchesSea` needs its OWN pirate-exclusion (i.e., can the pirate's own hex itself ever be a valid "touches sea" edge that a naive check would allow before `isShipPlacementConnected` catches it) — if `isShipPlacementConnected`'s new check already fully covers the pirate-adjacency rule for every call site that also calls it, `edgeTouchesSea` itself may not need its own change beyond removing its now-stale `KNOWN GAP` comment. Verify this reasoning against the actual call chain before deciding, and document which you found in your task report.

Remove all 3 `KNOWN GAP` comments (`edgeTouchesSea`, `buildShipRaw`, `moveShipRaw`) once their gap is genuinely closed — don't leave stale "not implemented yet" comments once it is.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run shipEligibility.test`
Expected: PASS, including every pre-existing test in this file (confirms the new trailing optional parameter is backward-compatible, same proof style the Ships sub-plan's own Longest Route change used).

- [ ] **Step 6: Full verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build`
Expected: all four clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/shipEligibility.ts catan-3d/src/game/shipEligibility.test.ts catan-3d/src/App.tsx
git commit -m "feat: block ship placement/movement on edges bordering the pirate's hex"
```

---

## Task 8: Final verification

- [ ] **Step 1:** `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run && npm run build` — must all be clean.
- [ ] **Step 2:** Boot smoke test — start the dev server, confirm HTTP 200 with a clean server log, then stop it. Check for and kill any orphaned `vite`/`node` process afterward before removing the worktree (this project's own recorded lesson — write the log to the scratchpad directory, not the filesystem root).
- [ ] **Step 3:** Repeat Task 3's manual playtest checklist ONE MORE TIME against the fully-merged branch (not just Task 3's own isolated commit) — roll to a 7, confirm the choice picker appears, move the robber, confirm it still works exactly as before this whole sub-plan; separately, move the pirate, confirm a ship-owner steal works if a ship happens to be on the target hex (may require manually dispatching `BUILD_SHIP` via devtools/console first, since no 3D ship-placement UI exists yet per the Ships sub-plan's own scope — note this limitation in your report rather than treating it as a blocker).
- [ ] **Step 4:** Grep for any other hand-maintained list that might need a robber/pirate-related entry now that `BoardAction` has grown `ROBBER_MOVED`/`TAXATION_RESOLVED`/`PIRATE_MOVED` cases — e.g. `grep -rn "ROBBER_MOVED" catan-3d/src --include=*.ts --include=*.tsx` and check every match's surrounding context for a switch/list that handles it but doesn't yet have a `PIRATE_MOVED` counterpart.
- [ ] **Step 5:** Note for the human partner in the final report: (a) the pirate's figurine/token likely reuses the robber's own 3D model as a placeholder (Task 6) — flag if real pirate art should replace it later; (b) ship-pirate-blocking (Task 7) has no automated end-to-end test exercising a real ship placement attempt near a real pirate position on a real board, only unit-level `shipEligibility.test.ts` coverage — worth a manual check once ship-placement UI exists; (c) Taxation and the setup-phase ship substitution remain untouched, as scoped.

No commit for this task (verification only) — proceed to the final whole-branch review once Steps 1-4 are clean.
