# App.tsx Reducer Refactor — Sub-plan 4: C&K Board-Piece Bucket (Board + Progress)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Cities & Knights' 6 remaining board-piece/barbarian-progress fields (`robberActive`, `merchantTileId`, `merchantHolderId`, `barbarianTrackPosition`, `activeBarbarianAttack`, `knightsPromotedThisTurn`) out of `App.tsx` `useState` and into the reducer — 3 extending the existing `BoardState`/`board.ts`, 3 forming a brand-new `ProgressState`/`progress.ts` slice.

**Architecture:** `GameState = { board: BoardState; players: Player[]; turn: TurnState; progress: ProgressState }`, composed via `src/game/gameState.ts`'s `reduceGame`, which runs every sub-reducer against every dispatched action unconditionally (each slice ignores actions it doesn't own via its switch's `default` case). This sub-plan adds 3 fields + 2 actions directly to the existing `board.ts` (matching how `robberTileId`/`pirateTileId` already live there) and creates a new `progress.ts` following the identical shape `turn.ts` already established (own file, own `initialState`, own action union, one more line in `reduceGame`).

**Tech Stack:** React 18 + TypeScript, `useReducer`, Vitest for reducer unit tests, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-apptsx-reducer-refactor-design.md` — this plan's own concrete field-by-field design (verified against the live code this session) supersedes that spec's loose sketch of `ProgressState`/the C&K board-piece fields (same relationship Sub-plan 2's and Sub-plan 3's own concrete designs had to their spec sketches).

## Global Constraints

- **Trusted-apply pattern (`CONVENTIONS.md` §1) is unchanged and non-negotiable.** One client decides a non-deterministic value, broadcasts it, every client — including the decider — applies the exact same decided result via a shared function, never re-deriving it. This sub-plan moves *where* 6 decided values live (reducer instead of `useState`), never *how* they get decided.
- **Composition pattern extends, doesn't change.** `GameState`/`GameAction` currently compose as `{ board: BoardState; players: Player[]; turn: TurnState }` / `BoardAction | PlayersAction | TurnAction`, with `reduceGame` running every sub-reducer against every action unconditionally. This sub-plan adds `progress: ProgressState` as one more line in that same composition (own file, own action union member, one more `reduceGame` line — no new composition mechanism) and adds 3 fields directly to the existing `board.ts`, matching how `board`/`players`/`turn` already compose.
- **The classification rule is the binding test for "does this state move," and all 6 fields were independently re-verified against it this session** (not just taken from the spec's own batch-check list):
  - `robberActive`, `merchantTileId`, `merchantHolderId`, `barbarianTrackPosition` qualify via rule 1 (dual-write) — each is written from both the local actor's own dispatch path (inside `rollDice`, or a local click handler like `handleMerchantTileSelect`) AND a broadcast-receiver block (`onBarbarianAttackResolved`, `onBarbarianShipAdvanced`, `onMerchantMoved`), the strongest possible signal that the app is already hand-syncing this state across clients.
  - `activeBarbarianAttack` qualifies via rule 1 through a real shared trusted-apply function (`applyBarbarianAttackResult`, `App.tsx:3314`) called identically by the local `rollDice` path and the `onBarbarianAttackResolved` receiver — **despite not round-tripping through `MatchSnapshot` at all.** Its exclusion from the snapshot is a deliberate reconnect-behavior choice (a reconnect mid-attack can't resume the attack modal, so it's always cleared, never restored — see `restoreFromSnapshot`'s own comment at `App.tsx:6701-6708`), preserved exactly as-is by this migration. It is not a disqualifying signal.
  - `knightsPromotedThisTurn` qualifies via rule 1 through its own shared reset (the reducer's `TURN_ADVANCED` case, which every slice already shares — see `turn.ts`'s own `TURN_ADVANCED` case) plus dual local (`promoteKnight`, `playSmithing`) / receiver (`onKnightPromoted`, `onSmithingPlayed`) add-sites.
- **`npm run build` (not just `tsc`/`eslint`/`vitest`) is required before any task is reported done** — this project's own history has a real case (Board Foundation, Seafarers sub-plan 1) of a broken Vite asset import that only `npm run build` caught.
- **Bare `npx tsc --noEmit` checks zero files on this project — do not use it as a task's typecheck command.** `catan-3d/tsconfig.json` is solution-style (`"files": []` + project references), so `tsc --noEmit` exits 0 unconditionally without checking anything. Every task below uses `npx tsc -p tsconfig.app.json` as the real per-task typecheck gate (run from the `catan-3d/` directory).
- **This sub-plan's own binding constraints**, verified against the live code this session:
  1. **Every new action dispatches via bare `dispatch(...)`, never `dispatchGameAction`.** `ROBBER_MOVED`/`PIRATE_MOVED`/`TAXATION_RESOLVED`/`TURN_ADVANCED` already establish this precedent in `board.ts` — their callers build their own `inform()`/`playSfx()` calls manually instead of going through `dispatchGameAction`'s banner/sfx/broadcast wrapper. `ROBBER_ACTIVATED`, `MERCHANT_MOVED`, `BARBARIAN_TRACK_POSITION_SET`, `BARBARIAN_ATTACK_SET`, and `KNIGHTS_PROMOTED_THIS_TURN_ADDED` all follow this: no banner/sfx/broadcast side effects are added anywhere by this migration — it relocates storage only.
  2. **No combined reset/restore action for `ProgressState`.** Every `ProgressState` field uses the same granular action at its reset/restore site as at every other site — matching the immediately-prior sub-plan's own explicit "no combined `RESET_TURN`/`RESTORE_TURN`" precedent (`turn.ts` has neither). `BoardState`'s existing `RESET_BOARD`/`RESTORE_BOARD` DO get widened rather than bypassed, since they are pre-existing whole-slice actions this sub-plan extends (not new ones this sub-plan would be introducing) and are already dispatched, unconditionally, at the exact reset/restore sites this sub-plan's 3 `BoardState` fields also need to clear/restore at.
  3. **Read-preserving alias pattern, matching `turn.ts`'s own established convention (not `board.ts`'s pre-project `robberTileId`/`pirateTileId` convention).** Reading the live code this session found TWO different conventions already in `App.tsx` for a reducer-backed field: `turn.ts`'s fields (`gamePhase`, `currentPlayerIndex`, `setupStepIndex`, etc.) are each aliased ONCE, right where their old `useState` declaration sat — `const gamePhase = gameState.turn.gamePhase` (`App.tsx:497`) — which every downstream read site (including the autosave-snapshot object-literal shorthand and its `useEffect` dependency array) keeps referencing as a bare identifier, unchanged. `board.ts`'s older fields (`robberTileId`, `pirateTileId`) instead use fully-qualified `gameState.board.robberTileId` at every one of their ~10 read sites, with no alias — an older convention that predates this reducer-refactor project (from the separate "Board Foundation" Seafarers-era migration the spec's own Global Constraints cite). This sub-plan's 6 fields follow the **`turn.ts` convention**: one `const X = gameState.board.X` / `const X = gameState.progress.X` alias per field, declared exactly where the old `useState` line sat. This is what makes the read/gate sites listed below correctly "not touched" — they keep compiling and behaving identically because the bare identifier they reference still resolves.
  4. **Explicitly out of scope, do not touch:** `pillageQueue`, `winnerDrawQueue`, `resolvedPillageVertexIdsRef`, `merchantFleetRate`, `chasingRobberKnightId`, `chasingPirateKnightId`, `pendingTaxation`. Two real adjacency risks exist where an in-scope line sits textually next to one of these — both are flagged explicitly at their exact site in Task 3 below (the `applyBarbarianAttackResult`/`pillageQueue` adjacency at `App.tsx:3314-3316`, and the `resetGame`/`restoreFromSnapshot` 4-statement `activeBarbarianAttack`/`pillageQueue`/`resolvedPillageVertexIdsRef`/`winnerDrawQueue` clear-cluster at `App.tsx:6531-6534` and `App.tsx:6709-6712`). No other in-scope line in this sub-plan sits adjacent to an out-of-scope one closely enough to risk it.

---

## File Structure

- **Modify** `catan-3d/src/game/reducers/board.ts` — add 3 fields to `BoardState`/`initialBoardState`, 2 new `BoardAction` members, widen `RESTORE_BOARD`'s payload, add 2 `reduceBoard` cases, widen `RESET_BOARD`/`RESTORE_BOARD`'s existing cases.
- **Modify** `catan-3d/src/game/reducers/board.test.ts` — add tests for the 2 new actions and the 2 widened cases; update 4 pre-existing `RESTORE_BOARD` test literals so they keep satisfying the widened action type.
- **Create** `catan-3d/src/game/reducers/progress.ts` — new `ProgressState`/`initialProgressState`/`ProgressAction`/`reduceProgress`.
- **Create** `catan-3d/src/game/reducers/progress.test.ts` — full coverage matching `turn.test.ts`'s conventions.
- **Modify** `catan-3d/src/game/gameState.ts` — wire `progress` into `GameState`/`initialGameState`/`GameAction`/`reduceGame`.
- **Modify** `catan-3d/src/App.tsx` — migrate all 6 fields' `useState` declarations and every mid-game/reset/restore call site onto the reducer; one already-dispatched `RESTORE_BOARD` call site gets widened (in two steps, across Task 1 and Task 2); one dead line (`applyTurnAdvance`'s `setKnightsPromotedThisTurn(new Set())`) gets deleted outright.
- **Not touched:** `catan-3d/src/multiplayer/matchSnapshot.ts` (its `MatchSnapshot` interface already carries `robberActive?`, `merchantTileId?`, `merchantHolderId?`, `barbarianTrackPosition?` — unchanged; `activeBarbarianAttack`/`knightsPromotedThisTurn` were never part of it and stay that way), `catan-3d/src/components/hud/GameHud.tsx` (its prop types already match: `merchantHolderId: number | null`, `barbarianTrackPosition: number`, `knightsPromotedThisTurn: Set<string>` — no change needed since the alias pattern keeps every prop-passing call site a bare, still-valid identifier).

---

### Task 1: Extend `board.ts`, create `progress.ts`, wire `gameState.ts`

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/game/reducers/board.test.ts`
- Create: `catan-3d/src/game/reducers/progress.ts`
- Create: `catan-3d/src/game/reducers/progress.test.ts`
- Modify: `catan-3d/src/game/gameState.ts`
- Modify: `catan-3d/src/App.tsx:6618-6627` (approximate) — see Step 12 below; this is the one deliberate exception to "Task 1 has zero App.tsx changes"

**Interfaces:**
- Consumes: existing `BoardState`/`BoardAction`/`reduceBoard`/`initialBoardState` (`board.ts`); existing `GameState`/`GameAction`/`reduceGame`/`initialGameState` (`gameState.ts`); `BarbarianAttackResult` from `src/game/knights.ts` (confirmed export at `knights.ts:258-266`).
- Produces: `BoardState.robberActive: boolean`, `BoardState.merchantTileId: string | null`, `BoardState.merchantHolderId: number | null`; `BoardAction` members `{ type: 'ROBBER_ACTIVATED' }` and `{ type: 'MERCHANT_MOVED'; tileId: string; holderId: number }`; widened `RESTORE_BOARD` action carrying `robberActive`/`merchantTileId`/`merchantHolderId`; new `ProgressState { barbarianTrackPosition: number; activeBarbarianAttack: BarbarianAttackResult | null; knightsPromotedThisTurn: Set<string> }`, `initialProgressState`, `ProgressAction` (3 members), `reduceProgress(state, action, fullState)`; `GameState.progress: ProgressState`; `GameAction` includes `ProgressAction`.

This task is pure reducer-slice construction — nothing in `App.tsx` reads `gameState.board.robberActive`/`merchantTileId`/`merchantHolderId` or `gameState.progress.*` yet (Tasks 2/3 wire those reads). The one exception: `RESTORE_BOARD` is a **pre-existing** action already dispatched from `App.tsx` today (unlike `ROBBER_ACTIVATED`/`MERCHANT_MOVED`, which are brand new and have zero callers). Widening its required payload without also touching that one existing call site would leave the build broken between Task 1 and Task 2 — so Step 12 below adds a temporary, behaviorally-inert pass-through at that one site, which Task 2 then replaces with real snapshot-sourced values.

- [ ] **Step 1: Write failing tests for `board.ts`'s 2 new actions and 2 widened cases**

Read `catan-3d/src/game/reducers/board.test.ts` first if you haven't already this session — match its exact style (plain `describe`/`it`, `reduceBoard(state, action, initialGameState)`, `toEqual`/`toBe`).

Append these `describe` blocks (after the existing `describe('reduceBoard — PIRATE_MOVED', ...)` block, before `describe('reduceBoard — action not owned by this reducer', ...)`):

```ts
describe('reduceBoard — ROBBER_ACTIVATED', () => {
  it('sets robberActive to true', () => {
    const result = reduceBoard(initialBoardState, { type: 'ROBBER_ACTIVATED' }, initialGameState)
    expect(result.robberActive).toBe(true)
  })

  it('leaves every other field untouched', () => {
    const result = reduceBoard(initialBoardState, { type: 'ROBBER_ACTIVATED' }, initialGameState)
    expect(result).toEqual({ ...initialBoardState, robberActive: true })
  })
})

describe('reduceBoard — MERCHANT_MOVED', () => {
  it('sets merchantTileId and merchantHolderId together', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'MERCHANT_MOVED', tileId: 'F3', holderId: 2 },
      initialGameState,
    )
    expect(result.merchantTileId).toBe('F3')
    expect(result.merchantHolderId).toBe(2)
  })

  it('leaves every other field untouched', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'MERCHANT_MOVED', tileId: 'F3', holderId: 2 },
      initialGameState,
    )
    expect(result).toEqual({ ...initialBoardState, merchantTileId: 'F3', merchantHolderId: 2 })
  })
})

describe('reduceBoard — RESET_BOARD (Cities & Knights fields)', () => {
  it('resets robberActive to false and merchantTileId/merchantHolderId to null', () => {
    const dirty = { ...initialBoardState, robberActive: true, merchantTileId: 'F3', merchantHolderId: 2 }
    const result = reduceBoard(dirty, { type: 'RESET_BOARD', robberTileId: 'D1' }, initialGameState)
    expect(result.robberActive).toBe(false)
    expect(result.merchantTileId).toBeNull()
    expect(result.merchantHolderId).toBeNull()
  })
})

describe('reduceBoard — RESTORE_BOARD (Cities & Knights fields)', () => {
  it('restores robberActive/merchantTileId/merchantHolderId verbatim', () => {
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
        robberActive: true,
        merchantTileId: 'F3',
        merchantHolderId: 2,
      },
      initialGameState,
    )
    expect(result.robberActive).toBe(true)
    expect(result.merchantTileId).toBe('F3')
    expect(result.merchantHolderId).toBe(2)
  })
})
```

Also update the 4 **pre-existing** `RESTORE_BOARD` test literals so they keep satisfying the widened action type (TypeScript will report "missing properties" on these once `board.ts` is edited in Step 3 — fix them now so Step 4 shows a clean pass, not new type noise):

In `describe('reduceBoard — RESTORE_BOARD', ...)` (~line 240), change:
```ts
      { type: 'RESTORE_BOARD', settlements, roads, ships: {}, shipsBuiltThisTurn: [], hasMovedShipThisTurn: false, robberTileId: 'D1', pirateTileId: null },
```
to:
```ts
      { type: 'RESTORE_BOARD', settlements, roads, ships: {}, shipsBuiltThisTurn: [], hasMovedShipThisTurn: false, robberTileId: 'D1', pirateTileId: null, robberActive: false, merchantTileId: null, merchantHolderId: null },
```

In `describe('reduceBoard — ships data model', ...)`, the `'RESTORE_BOARD restores ships and per-turn ship tracking verbatim'` test (~line 277-295), change:
```ts
      {
        type: 'RESTORE_BOARD',
        settlements: {},
        roads: {},
        ships: { E1: 2 },
        shipsBuiltThisTurn: ['E1'],
        hasMovedShipThisTurn: true,
        robberTileId: 'D1',
        pirateTileId: null,
      },
```
to:
```ts
      {
        type: 'RESTORE_BOARD',
        settlements: {},
        roads: {},
        ships: { E1: 2 },
        shipsBuiltThisTurn: ['E1'],
        hasMovedShipThisTurn: true,
        robberTileId: 'D1',
        pirateTileId: null,
        robberActive: false,
        merchantTileId: null,
        merchantHolderId: null,
      },
```

In `describe('reduceBoard — robber/pirate data model', ...)`, the `'RESTORE_BOARD restores robberTileId and pirateTileId verbatim'` test (~line 306-323), change:
```ts
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
```
to:
```ts
      {
        type: 'RESTORE_BOARD',
        settlements: {},
        roads: {},
        ships: {},
        shipsBuiltThisTurn: [],
        hasMovedShipThisTurn: false,
        robberTileId: 'D1',
        pirateTileId: 'S1',
        robberActive: false,
        merchantTileId: null,
        merchantHolderId: null,
      },
```

And the `'RESTORE_BOARD accepts a null pirateTileId (pirate parked on the frame)'` test (~line 325-342), change:
```ts
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
```
to:
```ts
      {
        type: 'RESTORE_BOARD',
        settlements: {},
        roads: {},
        ships: {},
        shipsBuiltThisTurn: [],
        hasMovedShipThisTurn: false,
        robberTileId: 'D1',
        pirateTileId: null,
        robberActive: false,
        merchantTileId: null,
        merchantHolderId: null,
      },
```

- [ ] **Step 2: Run the test file to verify the new tests fail**

Run (from `catan-3d/`): `npx vitest run src/game/reducers/board.test.ts`

Expected: the 4 new `describe` blocks' tests FAIL (`ROBBER_ACTIVATED`/`MERCHANT_MOVED` aren't valid action types yet, so `reduceBoard` hits its `default` case and returns state unchanged — `result.robberActive` is `undefined`, not `true`). The 4 edited pre-existing tests may show a TypeScript "excess property" diagnostic in your editor at this point (the extra fields aren't part of the type yet) — that's expected and self-resolves in Step 3; Vitest's own test runner doesn't typecheck, so it still executes and passes them.

- [ ] **Step 3: Implement `board.ts`'s 3 fields, 2 actions, 2 widened cases**

Read `catan-3d/src/game/reducers/board.ts` in full first (confirm nothing has drifted from what's quoted here).

In the `BoardState` interface, after `pirateTileId: string | null`, add:
```ts
  // Cities & Knights robber activation — starts inert (robber behaves as
  // base-game: always movable on a rolled 7). Permanently flips true the
  // first time a barbarian attack resolves, regardless of outcome — CN3087
  // p.7: "The robber does not activate until after it has been placed on
  // the desert following the first barbarian attack." Never reset back to
  // false except by a full game reset (RESET_BOARD).
  robberActive: boolean
  // Cities & Knights Merchant board piece — same category as
  // robberTileId/pirateTileId just above, not a per-player field: the piece
  // sits on one tile and is controlled by at most one player at a time.
  // null until the card is first played and placed. Always set together,
  // via the single MERCHANT_MOVED action below — there is no case where
  // one changes without the other.
  merchantTileId: string | null
  merchantHolderId: number | null
```

In `initialBoardState`, after `pirateTileId: null,`, add:
```ts
  robberActive: false,
  merchantTileId: null,
  merchantHolderId: null,
```

In the `BoardAction` union, after the `PIRATE_MOVED` member, add:
```ts
  | { type: 'ROBBER_ACTIVATED' }
  | { type: 'MERCHANT_MOVED'; tileId: string; holderId: number }
```

Widen the `RESTORE_BOARD` member — change:
```ts
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
to:
```ts
  | {
      type: 'RESTORE_BOARD'
      settlements: Record<string, Building>
      roads: Record<string, number>
      ships: Record<string, number>
      shipsBuiltThisTurn: string[]
      hasMovedShipThisTurn: boolean
      robberTileId: string
      pirateTileId: string | null
      robberActive: boolean
      merchantTileId: string | null
      merchantHolderId: number | null
    }
```

In `reduceBoard`, after the `case 'PIRATE_MOVED':` case, add 2 new cases:
```ts
    case 'ROBBER_ACTIVATED':
      return { ...state, robberActive: true }
    case 'MERCHANT_MOVED':
      return { ...state, merchantTileId: action.tileId, merchantHolderId: action.holderId }
```

Widen the `RESET_BOARD` case — change:
```ts
      return { settlements: {}, roads: {}, ships: {}, shipsBuiltThisTurn: [], hasMovedShipThisTurn: false, robberTileId: action.robberTileId, pirateTileId: null }
```
to:
```ts
      return { settlements: {}, roads: {}, ships: {}, shipsBuiltThisTurn: [], hasMovedShipThisTurn: false, robberTileId: action.robberTileId, pirateTileId: null, robberActive: false, merchantTileId: null, merchantHolderId: null }
```

Widen the `RESTORE_BOARD` case — change:
```ts
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
to:
```ts
    case 'RESTORE_BOARD':
      return {
        settlements: action.settlements,
        roads: action.roads,
        ships: action.ships,
        shipsBuiltThisTurn: action.shipsBuiltThisTurn,
        hasMovedShipThisTurn: action.hasMovedShipThisTurn,
        robberTileId: action.robberTileId,
        pirateTileId: action.pirateTileId,
        robberActive: action.robberActive,
        merchantTileId: action.merchantTileId,
        merchantHolderId: action.merchantHolderId,
      }
```

`describeBoardAction` is **not** touched: `ROBBER_ACTIVATED`/`MERCHANT_MOVED` dispatch via bare `dispatch(...)` (Global Constraint 1), never through `dispatchGameAction`, so `describeBoardAction` is never called with either — its existing `default` case already returns `{ message: null, sfx: null }` safely for any unlisted action type, same as it already does for every players-only/turn-only action.

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run src/game/reducers/board.test.ts`
Expected: PASS, all tests including the pre-existing ones.

- [ ] **Step 5: Write failing tests for the new `progress.ts` module**

Create `catan-3d/src/game/reducers/progress.test.ts`, matching `turn.test.ts`'s exact conventions (`describe` per action, `initialGameState` as the `fullState` argument, `toEqual` spread-immutability checks, plus the "action not owned by this reducer" block every sibling reducer test file has):

```ts
import { describe, expect, it } from 'vitest'
import { reduceProgress, initialProgressState } from './progress'
import { initialGameState } from '../gameState'
import type { BarbarianAttackResult } from '../knights'

describe('reduceProgress — BARBARIAN_TRACK_POSITION_SET', () => {
  it('sets barbarianTrackPosition, leaves every other field untouched', () => {
    const result = reduceProgress(
      initialProgressState,
      { type: 'BARBARIAN_TRACK_POSITION_SET', position: 4 },
      initialGameState,
    )
    expect(result).toEqual({ ...initialProgressState, barbarianTrackPosition: 4 })
  })
})

describe('reduceProgress — BARBARIAN_ATTACK_SET', () => {
  const sampleResult: BarbarianAttackResult = {
    barbarianStrength: 5,
    defenderStrength: 3,
    defendersWin: false,
    pillageTargets: [{ playerId: 1, eligibleCityVertexIds: ['V1'] }],
    winners: [],
  }

  it('sets activeBarbarianAttack to the given result', () => {
    const result = reduceProgress(
      initialProgressState,
      { type: 'BARBARIAN_ATTACK_SET', result: sampleResult },
      initialGameState,
    )
    expect(result).toEqual({ ...initialProgressState, activeBarbarianAttack: sampleResult })
  })

  it('accepts null (clearing the attack once resolved/dismissed)', () => {
    const dirty = { ...initialProgressState, activeBarbarianAttack: sampleResult }
    const result = reduceProgress(dirty, { type: 'BARBARIAN_ATTACK_SET', result: null }, initialGameState)
    expect(result.activeBarbarianAttack).toBeNull()
  })
})

describe('reduceProgress — KNIGHTS_PROMOTED_THIS_TURN_ADDED', () => {
  it('adds a single knight id to an empty set', () => {
    const result = reduceProgress(
      initialProgressState,
      { type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: ['knight-1-1'] },
      initialGameState,
    )
    expect(result.knightsPromotedThisTurn).toEqual(new Set(['knight-1-1']))
  })

  it('adds multiple knight ids in one dispatch (Smithing)', () => {
    const result = reduceProgress(
      initialProgressState,
      { type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: ['knight-1-1', 'knight-1-2'] },
      initialGameState,
    )
    expect(result.knightsPromotedThisTurn).toEqual(new Set(['knight-1-1', 'knight-1-2']))
  })

  it('merges into an already-populated set rather than replacing it', () => {
    const dirty = { ...initialProgressState, knightsPromotedThisTurn: new Set(['knight-1-1']) }
    const result = reduceProgress(
      dirty,
      { type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: ['knight-2-1'] },
      initialGameState,
    )
    expect(result.knightsPromotedThisTurn).toEqual(new Set(['knight-1-1', 'knight-2-1']))
  })

  it('leaves barbarianTrackPosition/activeBarbarianAttack untouched', () => {
    const result = reduceProgress(
      initialProgressState,
      { type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: ['knight-1-1'] },
      initialGameState,
    )
    expect(result.barbarianTrackPosition).toBe(0)
    expect(result.activeBarbarianAttack).toBeNull()
  })
})

describe('reduceProgress — TURN_ADVANCED', () => {
  it('clears knightsPromotedThisTurn, leaves barbarianTrackPosition/activeBarbarianAttack untouched', () => {
    const sampleResult: BarbarianAttackResult = {
      barbarianStrength: 5,
      defenderStrength: 3,
      defendersWin: true,
      pillageTargets: [],
      winners: [{ playerId: 1, tied: false }],
    }
    const dirty = {
      barbarianTrackPosition: 3,
      activeBarbarianAttack: sampleResult,
      knightsPromotedThisTurn: new Set(['knight-1-1']),
    }
    const result = reduceProgress(dirty, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 }, initialGameState)
    expect(result).toEqual({ ...dirty, knightsPromotedThisTurn: new Set() })
  })
})

describe('reduceProgress — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reduceProgress(initialProgressState, { type: 'RESET_BOARD', robberTileId: 'D1' }, initialGameState)
    expect(result).toBe(initialProgressState)
  })
})
```

- [ ] **Step 6: Run the new test file to verify it fails**

Run: `npx vitest run src/game/reducers/progress.test.ts`
Expected: FAIL — `./progress` doesn't exist yet, so the import itself fails (`Cannot find module './progress'` or equivalent).

- [ ] **Step 7: Implement `progress.ts`**

Create `catan-3d/src/game/reducers/progress.ts`. The `BarbarianAttackResult` import path is confirmed against the live code: `App.tsx` imports it as `type BarbarianAttackResult` from `'./game/knights'` (i.e. `src/game/knights.ts`, relative to `src/App.tsx`); `players.ts` (in the same `src/game/reducers/` directory `progress.ts` lives in) already imports a sibling export from that same file via `from '../knights'` — so `../knights` is the correct relative path from `src/game/reducers/progress.ts`.

```ts
import type { GameAction, GameState } from '../gameState'
import type { BarbarianAttackResult } from '../knights'

export interface ProgressState {
  barbarianTrackPosition: number
  activeBarbarianAttack: BarbarianAttackResult | null
  knightsPromotedThisTurn: Set<string>
}

export const initialProgressState: ProgressState = {
  barbarianTrackPosition: 0,
  activeBarbarianAttack: null,
  knightsPromotedThisTurn: new Set(),
}

export type ProgressAction =
  | { type: 'BARBARIAN_TRACK_POSITION_SET'; position: number }
  | { type: 'BARBARIAN_ATTACK_SET'; result: BarbarianAttackResult | null }
  | { type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED'; knightIds: string[] }

export function reduceProgress(state: ProgressState, action: GameAction, _fullState: GameState): ProgressState {
  switch (action.type) {
    case 'BARBARIAN_TRACK_POSITION_SET':
      return { ...state, barbarianTrackPosition: action.position }
    case 'BARBARIAN_ATTACK_SET':
      return { ...state, activeBarbarianAttack: action.result }
    case 'KNIGHTS_PROMOTED_THIS_TURN_ADDED':
      return { ...state, knightsPromotedThisTurn: new Set([...state.knightsPromotedThisTurn, ...action.knightIds]) }
    case 'TURN_ADVANCED':
      return { ...state, knightsPromotedThisTurn: new Set() }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full
      // GameAction union (every slice's actions), not just ProgressAction,
      // so most of that union — including every board-only and
      // players-only action — is legitimately unhandled here. reduceProgress
      // only owns the 3 dedicated cases above, plus TURN_ADVANCED (declared
      // as a PlayersAction member — see players.ts — and already handled by
      // reduceBoard, reducePlayers, and reduceTurn too; each slice applies
      // its own share of the same turn-advance effect to the same action).
      return state
  }
}
```

- [ ] **Step 8: Run the test file to verify it passes**

Run: `npx vitest run src/game/reducers/progress.test.ts`
Expected: PASS.

- [ ] **Step 9: Wire `progress` into `gameState.ts`**

Read `catan-3d/src/game/gameState.ts` first (confirm nothing has drifted). Replace its full contents:

```ts
import { reduceBoard, initialBoardState, type BoardState, type BoardAction } from './reducers/board'
import { reducePlayers, type PlayersAction } from './reducers/players'
import { reduceTurn, initialTurnState, type TurnState, type TurnAction } from './reducers/turn'
import { reduceProgress, initialProgressState, type ProgressState, type ProgressAction } from './reducers/progress'
import { createInitialPlayers, type Player } from './types'

export interface GameState {
  board: BoardState
  players: Player[]
  turn: TurnState
  progress: ProgressState
}

export const initialGameState: GameState = {
  board: initialBoardState,
  // Matches the default the old `useState(() => createInitialPlayers(3))`
  // used to seed with, before a real game (resetGame) replaces it.
  players: createInitialPlayers(3),
  turn: initialTurnState,
  progress: initialProgressState,
}

export type GameAction = BoardAction | PlayersAction | TurnAction | ProgressAction

export function reduceGame(state: GameState, action: GameAction): GameState {
  return {
    board: reduceBoard(state.board, action, state),
    players: reducePlayers(state.players, action, state),
    turn: reduceTurn(state.turn, action, state),
    progress: reduceProgress(state.progress, action, state),
  }
}
```

- [ ] **Step 10: Run the full reducer test suite**

Run: `npx vitest run src/game`
Expected: PASS — `board.test.ts`, `progress.test.ts`, `turn.test.ts`, `players.test.ts` (and any other `src/game/**/*.test.ts`) all green.

- [ ] **Step 11: Typecheck**

Run: `npx tsc -p tsconfig.app.json`
Expected: this will currently FAIL on exactly one pre-existing call site — `App.tsx`'s `RESTORE_BOARD` dispatch (the existing `restoreFromSnapshot` function) — because `RESTORE_BOARD`'s payload now requires `robberActive`/`merchantTileId`/`merchantHolderId`, which that call site doesn't yet supply. Step 12 fixes exactly this.

- [ ] **Step 12: Widen the one pre-existing `App.tsx` `RESTORE_BOARD` call site (temporary pass-through)**

This is the sole App.tsx change in Task 1, and it's a deliberately inert one: `RESTORE_BOARD` is a pre-existing action `App.tsx` already dispatches today (unlike `ROBBER_ACTIVATED`/`MERCHANT_MOVED`, brand new with zero callers), so widening its required payload without touching this one call site breaks the build. Source the 3 new fields from the **still-live local `useState` values** (Task 2 hasn't run yet, so `robberActive`/`merchantTileId`/`merchantHolderId` still exist as local state) — nothing reads `gameState.board.robberActive`/`merchantTileId`/`merchantHolderId` yet, so this write is behaviorally inert; it exists purely to satisfy the widened type until Task 2 replaces it with real snapshot-sourced values.

Find (inside `restoreFromSnapshot`, `App.tsx:6618-6627` approximate):
```tsx
    dispatch({
      type: 'RESTORE_BOARD',
      settlements: snapshot.settlements,
      roads: snapshot.roads,
      ships: snapshot.ships ?? {},
      shipsBuiltThisTurn: snapshot.shipsBuiltThisTurn ?? [],
      hasMovedShipThisTurn: snapshot.hasMovedShipThisTurn ?? false,
      robberTileId: snapshot.robberTileId,
      pirateTileId: snapshot.pirateTileId ?? null,
    })
```

Replace with:
```tsx
    dispatch({
      type: 'RESTORE_BOARD',
      settlements: snapshot.settlements,
      roads: snapshot.roads,
      ships: snapshot.ships ?? {},
      shipsBuiltThisTurn: snapshot.shipsBuiltThisTurn ?? [],
      hasMovedShipThisTurn: snapshot.hasMovedShipThisTurn ?? false,
      robberTileId: snapshot.robberTileId,
      pirateTileId: snapshot.pirateTileId ?? null,
      // Placeholder pass-through — Task 2 of this sub-plan replaces this
      // with real snapshot-sourced values (snapshot.robberActive ?? false,
      // etc.) once robberActive/merchantTileId/merchantHolderId themselves
      // move out of local useState. Sourcing from the still-live local
      // state here keeps this pre-existing RESTORE_BOARD call site
      // type-safe against the widened action without changing behavior:
      // nothing reads gameState.board.robberActive/merchantTileId/
      // merchantHolderId yet.
      robberActive,
      merchantTileId,
      merchantHolderId,
    })
```

- [ ] **Step 13: Re-run typecheck and the full existing test suite**

Run: `npx tsc -p tsconfig.app.json`
Expected: clean, no errors.

Run: `npx vitest run`
Expected: full existing suite PASS (no regressions).

- [ ] **Step 14: Build**

Run (from `catan-3d/`): `npm run build`
Expected: succeeds.

- [ ] **Step 15: Commit**

```bash
git add src/game/reducers/board.ts src/game/reducers/board.test.ts src/game/reducers/progress.ts src/game/reducers/progress.test.ts src/game/gameState.ts src/App.tsx
git commit -m "feat: extend BoardState with C&K board-piece fields, add ProgressState slice"
```

---

### Task 2: Migrate `robberActive`, `merchantTileId`, `merchantHolderId` (`BoardState` fields) in `App.tsx`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `BoardState.robberActive`/`merchantTileId`/`merchantHolderId`, `BoardAction`'s `ROBBER_ACTIVATED`/`MERCHANT_MOVED` members, widened `RESET_BOARD`/`RESTORE_BOARD` (all from Task 1).
- Produces: `gameState.board.robberActive`/`merchantTileId`/`merchantHolderId` as the live source of truth in `App.tsx` — local `useState` for these 3 fields fully removed; the `RESTORE_BOARD` call site (temporarily widened with a placeholder in Task 1) now carries real snapshot-sourced values.

`App.tsx` has no dedicated test file (confirmed precedent: `useRoomChannel.ts` doesn't either — see the spec's own "Deviation, Sub-plan 1" note). This task's verification is `npx tsc -p tsconfig.app.json` + the full existing Vitest suite + `npm run build`, matching how Sub-plan 1 (the broadcast dispatcher, pure wiring with no new reducer logic) was verified.

- [ ] **Step 1: Replace the 3 `useState` declarations with reducer-backed aliases**

Read `App.tsx:580-654` (approximate) first to confirm nothing has drifted.

Find:
```tsx
  // Cities & Knights robber activation — starts inert (robber behaves as
  // base-game: always movable on a rolled 7). Permanently flips true the
  // first time a barbarian attack resolves (Task 4), regardless of
  // outcome. Until then, a 7 still forces discard but the robber never
  // moves and nothing is stolen — CN3087 p.7: "The robber does not
  // activate until after it has been placed on the desert following the
  // first barbarian attack."
  const [robberActive, setRobberActive] = useState(false)

  // Cities & Knights barbarian ship position on its 7-space track (0-6).
  // Advances on each 'ship' event-die face; resets to 0 after every attack.
  const [barbarianTrackPosition, setBarbarianTrackPosition] = useState(0)

  // Cities & Knights barbarian attack (Task 5) — the CURRENT result being
  // walked through (for the modal's headline/strength-comparison display),
  // plus the full pending lists for both post-attack choices (NOT assumed
  // front-ordered — see activePillageTarget/activeWinnerDrawPlayerId below
  // for why).
  const [activeBarbarianAttack, setActiveBarbarianAttack] = useState<BarbarianAttackResult | null>(null)
  const [pillageQueue, setPillageQueue] = useState<BarbarianPillageTarget[]>([])
  const [winnerDrawQueue, setWinnerDrawQueue] = useState<number[]>([]) // player ids, tied winners only

  // Cities & Knights Merchant (Task 13) — App-level board-piece state, same
  // category as gameState.board.robberTileId, not a per-player field: the
  // piece sits on one tile and is controlled by at most one player at a
  // time, independent of createInitialPlayers/Player. null until the card is
  // first played and placed.
  const [merchantTileId, setMerchantTileId] = useState<string | null>(null)
  const [merchantHolderId, setMerchantHolderId] = useState<number | null>(null)
```

Replace with (only the `robberActive`/`merchantTileId`/`merchantHolderId` declarations change in this task — `barbarianTrackPosition`, `activeBarbarianAttack`, `pillageQueue`, `winnerDrawQueue` are Task 3's or explicitly out of scope, and stay exactly as they are for now):
```tsx
  // Cities & Knights robber activation — starts inert (robber behaves as
  // base-game: always movable on a rolled 7). Permanently flips true the
  // first time a barbarian attack resolves (Task 4), regardless of
  // outcome. Until then, a 7 still forces discard but the robber never
  // moves and nothing is stolen — CN3087 p.7: "The robber does not
  // activate until after it has been placed on the desert following the
  // first barbarian attack."
  const robberActive = gameState.board.robberActive

  // Cities & Knights barbarian ship position on its 7-space track (0-6).
  // Advances on each 'ship' event-die face; resets to 0 after every attack.
  const [barbarianTrackPosition, setBarbarianTrackPosition] = useState(0)

  // Cities & Knights barbarian attack (Task 5) — the CURRENT result being
  // walked through (for the modal's headline/strength-comparison display),
  // plus the full pending lists for both post-attack choices (NOT assumed
  // front-ordered — see activePillageTarget/activeWinnerDrawPlayerId below
  // for why).
  const [activeBarbarianAttack, setActiveBarbarianAttack] = useState<BarbarianAttackResult | null>(null)
  const [pillageQueue, setPillageQueue] = useState<BarbarianPillageTarget[]>([])
  const [winnerDrawQueue, setWinnerDrawQueue] = useState<number[]>([]) // player ids, tied winners only

  // Cities & Knights Merchant (Task 13) — App-level board-piece state, same
  // category as gameState.board.robberTileId, not a per-player field: the
  // piece sits on one tile and is controlled by at most one player at a
  // time, independent of createInitialPlayers/Player. null until the card is
  // first played and placed.
  const merchantTileId = gameState.board.merchantTileId
  const merchantHolderId = gameState.board.merchantHolderId
```

- [ ] **Step 2: `rollDice`'s barbarian-ship `isFirstActivation` branch — `setRobberActive(true)` becomes `dispatch(ROBBER_ACTIVATED)`**

Find (`App.tsx:3469-3496` approximate — note `setBarbarianTrackPosition` calls in this same block are untouched here, Task 3's concern):
```tsx
    if (gameRules.citiesAndKnightsBarbarians && eventDie === 'ship') {
      const nextPosition = barbarianTrackPosition + 1
      if (nextPosition >= BARBARIAN_TRACK_LENGTH - 1) {
        // Reached the final position — resolve the attack NOW, roller-only
        // (same authority model as the progress-card draw above: this
        // client's own computation is trusted and broadcast, not
        // independently re-derived by receivers).
        const currentMetropolisVertexIds = new Set(
          Object.values(metropolisVertexIds).filter((v): v is string => v != null),
        )
        const attackResult = resolveBarbarianAttack(players, gameState.board.settlements, currentMetropolisVertexIds)
        const isFirstActivation = !robberActive
        setBarbarianTrackPosition(0)
        if (isFirstActivation) {
          setRobberActive(true)
          // CN3087 p.7: the robber does not activate until after the first
          // barbarian attack — a one-time state transition, announced the
          // same way this project already announces others (e.g. Chase Away
          // the Robber's arm/resolve banners).
          inform('The barbarians have landed — the robber is now active.')
        }
        applyBarbarianAttackResult(attackResult) // Task 5 defines this
        if (onlineInfo) broadcastBarbarianAttackResolved({ result: attackResult, robberActivated: isFirstActivation })
      } else {
        setBarbarianTrackPosition(nextPosition)
        if (onlineInfo) broadcastBarbarianShipAdvanced({ position: nextPosition })
      }
    }
```

Replace the `setRobberActive(true)` line only:
```tsx
        if (isFirstActivation) {
          dispatch({ type: 'ROBBER_ACTIVATED' })
          // CN3087 p.7: the robber does not activate until after the first
          // barbarian attack — a one-time state transition, announced the
          // same way this project already announces others (e.g. Chase Away
          // the Robber's arm/resolve banners).
          inform('The barbarians have landed — the robber is now active.')
        }
```

- [ ] **Step 3: `onBarbarianAttackResolved` receiver — `setRobberActive(true)` becomes `dispatch(ROBBER_ACTIVATED)`**

Find (`App.tsx:1663-1670`, note `setBarbarianTrackPosition(0)` above it is untouched here, Task 3's concern):
```tsx
    onBarbarianAttackResolved: (payload) => {
      setBarbarianTrackPosition(0)
      if (payload.robberActivated) {
        setRobberActive(true)
        inform('The barbarians have landed — the robber is now active.')
      }
      applyBarbarianAttackResult(payload.result)
    },
```

Replace:
```tsx
    onBarbarianAttackResolved: (payload) => {
      setBarbarianTrackPosition(0)
      if (payload.robberActivated) {
        dispatch({ type: 'ROBBER_ACTIVATED' })
        inform('The barbarians have landed — the robber is now active.')
      }
      applyBarbarianAttackResult(payload.result)
    },
```

- [ ] **Step 4: `onMerchantMoved` receiver — 2 setters become 1 dispatch**

Find (`App.tsx:2098-2101`):
```tsx
    onMerchantMoved: (payload) => {
      setMerchantTileId(payload.tileId)
      setMerchantHolderId(payload.holderId)
    },
```

Replace:
```tsx
    onMerchantMoved: (payload) => {
      dispatch({ type: 'MERCHANT_MOVED', tileId: payload.tileId, holderId: payload.holderId })
    },
```

- [ ] **Step 5: `handleMerchantTileSelect` — 2 setters become 1 dispatch (broadcast call untouched)**

Find (`App.tsx:5168-5189`):
```tsx
  const handleMerchantTileSelect = (tileId: string) => {
    // Unlike handleInventionTileSelect (whose picker can only ever be armed
    // and resolved inside one turn, because handleEndTurn refuses to advance
    // past it), this handler was reachable during an OPPONENT's turn: End
    // Turn used to allow advancing with pendingMerchantPlacement still set,
    // leaving this client's tile picker live so the Merchant (1 VP + a 2:1
    // rate) could be placed mid-opponent-turn. Guarded first, exactly like
    // every playX handler in this file. handleEndTurn now also refuses to
    // advance while a placement is pending, so the legitimate flow — play
    // Merchant, place it, then end your turn — is unaffected: isMyTurn is
    // true for the whole of it.
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    if (pendingMerchantPlacement == null) return
    const playerId = pendingMerchantPlacement
    setMerchantTileId(tileId)
    setMerchantHolderId(playerId)
    setPendingMerchantPlacement(null)
    if (onlineInfo) broadcastMerchantMoved({ tileId, holderId: playerId })
  }
```

Replace the 2 setter lines only:
```tsx
    if (pendingMerchantPlacement == null) return
    const playerId = pendingMerchantPlacement
    dispatch({ type: 'MERCHANT_MOVED', tileId, holderId: playerId })
    setPendingMerchantPlacement(null)
    if (onlineInfo) broadcastMerchantMoved({ tileId, holderId: playerId })
```

- [ ] **Step 6: `resetGame` — delete the now-redundant `setRobberActive(false)` line**

`resetGame` already dispatches `RESET_BOARD` later in its own body (`App.tsx:6426`, unchanged by this task — its payload is still just `robberTileId`), and `RESET_BOARD`'s reducer case was widened in Task 1 to also reset `robberActive: false`. The standalone setter is now dead code.

Find (`App.tsx:6371-6377`):
```tsx
    // Cities & Knights barbarian-track gate (Task 3) — same "always reset on
    // a fresh game" treatment as every other single-shot C&K flag below: a
    // leftover `true` from a PREVIOUS match's resolved barbarian attack would
    // let the robber move on the very first 7 of a brand-new match, even
    // with a from-scratch barbarian track that hasn't had a first attack yet.
    setRobberActive(false)
    setBarbarianTrackPosition(0)
```

Replace (delete only the `setRobberActive(false)` line; `setBarbarianTrackPosition(0)` stays — Task 3's concern):
```tsx
    // Cities & Knights barbarian-track gate (Task 3) — same "always reset on
    // a fresh game" treatment as every other single-shot C&K flag below: a
    // leftover `true` from a PREVIOUS match's resolved barbarian attack would
    // let the robber move on the very first 7 of a brand-new match, even
    // with a from-scratch barbarian track that hasn't had a first attack yet.
    // (robberActive itself is reset by the RESET_BOARD dispatch below, whose
    // reducer case now covers it — see board.ts.)
    setBarbarianTrackPosition(0)
```

- [ ] **Step 7: `resetGame` — delete the now-redundant `setMerchantTileId(null)`/`setMerchantHolderId(null)` lines**

Find (`App.tsx:6483-6492`):
```tsx
    // Cities & Knights Merchant (Task 13) — same reasoning as
    // metropolisHolders/metropolisVertexIds above: a leftover holder/tile
    // from a PREVIOUS match would silently keep granting 2:1 trades and +1
    // VP to whoever last controlled it, on every client, for the rest of
    // this session. pendingMerchantPlacement is local-only pending state,
    // same "always reset on a fresh game" treatment pendingInventionSwap
    // gets just above.
    setMerchantTileId(null)
    setMerchantHolderId(null)
    setPendingMerchantPlacement(null)
```

Replace (delete the 2 board-piece setters; `pendingMerchantPlacement` stays untouched, it's local-only, not part of this migration):
```tsx
    // Cities & Knights Merchant (Task 13) — same reasoning as
    // metropolisHolders/metropolisVertexIds above: a leftover holder/tile
    // from a PREVIOUS match would silently keep granting 2:1 trades and +1
    // VP to whoever last controlled it, on every client, for the rest of
    // this session. (merchantTileId/merchantHolderId themselves are reset
    // by the RESET_BOARD dispatch below, whose reducer case now covers
    // them — see board.ts.) pendingMerchantPlacement is local-only pending
    // state, same "always reset on a fresh game" treatment
    // pendingInventionSwap gets just above.
    setPendingMerchantPlacement(null)
```

- [ ] **Step 8: `restoreFromSnapshot` — replace the Task 1 placeholder with real snapshot-sourced values**

Find (the `RESTORE_BOARD` dispatch as Task 1 Step 12 left it):
```tsx
    dispatch({
      type: 'RESTORE_BOARD',
      settlements: snapshot.settlements,
      roads: snapshot.roads,
      ships: snapshot.ships ?? {},
      shipsBuiltThisTurn: snapshot.shipsBuiltThisTurn ?? [],
      hasMovedShipThisTurn: snapshot.hasMovedShipThisTurn ?? false,
      robberTileId: snapshot.robberTileId,
      pirateTileId: snapshot.pirateTileId ?? null,
      // Placeholder pass-through — Task 2 of this sub-plan replaces this
      // with real snapshot-sourced values (snapshot.robberActive ?? false,
      // etc.) once robberActive/merchantTileId/merchantHolderId themselves
      // move out of local useState. Sourcing from the still-live local
      // state here keeps this pre-existing RESTORE_BOARD call site
      // type-safe against the widened action without changing behavior:
      // nothing reads gameState.board.robberActive/merchantTileId/
      // merchantHolderId yet.
      robberActive,
      merchantTileId,
      merchantHolderId,
    })
```

Replace:
```tsx
    dispatch({
      type: 'RESTORE_BOARD',
      settlements: snapshot.settlements,
      roads: snapshot.roads,
      ships: snapshot.ships ?? {},
      shipsBuiltThisTurn: snapshot.shipsBuiltThisTurn ?? [],
      hasMovedShipThisTurn: snapshot.hasMovedShipThisTurn ?? false,
      robberTileId: snapshot.robberTileId,
      pirateTileId: snapshot.pirateTileId ?? null,
      // Cities & Knights Barbarians/Merchant — same optional/backward-
      // compatible `?? default` treatment robberTileId/pirateTileId above
      // already get: absent on any snapshot saved before these fields
      // existed.
      robberActive: snapshot.robberActive ?? false,
      merchantTileId: snapshot.merchantTileId ?? null,
      merchantHolderId: snapshot.merchantHolderId ?? null,
    })
```

- [ ] **Step 9: `restoreFromSnapshot` — delete the now-redundant standalone `setMerchantTileId`/`setMerchantHolderId`/`setRobberActive` lines**

These setters no longer exist after Step 1 removed their `useState` declarations — this is a required deletion, not optional cleanup.

Find (`App.tsx:6642-6650`):
```tsx
    // Cities & Knights Merchant (Task 13) — same optional/backward-compatible
    // `?? null` treatment as metropolisHolders/metropolisVertexIds above:
    // absent on any snapshot saved before this feature existed.
    setMerchantTileId(snapshot.merchantTileId ?? null)
    setMerchantHolderId(snapshot.merchantHolderId ?? null)
    // Cities & Knights Barbarians (Tasks 3/4) — same optional/backward-
    // compatible treatment as merchantTileId/merchantHolderId above.
    setBarbarianTrackPosition(snapshot.barbarianTrackPosition ?? 0)
    setRobberActive(snapshot.robberActive ?? false)
```

Replace (delete the 3 board-piece-field setters; `setBarbarianTrackPosition` stays — Task 3's concern):
```tsx
    // Cities & Knights Merchant (Task 13) — merchantTileId/merchantHolderId
    // are now restored by the widened RESTORE_BOARD dispatch above (see
    // board.ts's RESTORE_BOARD case), same optional/backward-compatible
    // `?? default` treatment robberTileId/pirateTileId already get there.
    // Cities & Knights Barbarians (Tasks 3/4) — same optional/backward-
    // compatible treatment as merchantTileId/merchantHolderId above.
    setBarbarianTrackPosition(snapshot.barbarianTrackPosition ?? 0)
```

- [ ] **Step 10: Confirm the 6 robberActive read/gate sites and the merchant read sites still compile unchanged**

No edits needed here — this is a verification-only step. Confirm by reading (don't need to change anything):
- `applyDiscard` (`App.tsx:1353`): `if (!gameRules.citiesAndKnightsBarbarians || robberActive) {`
- The discard self-heal `useEffect` (`App.tsx:2587` body, `App.tsx:2595` dependency array): both reference bare `robberActive`
- `rollDice`'s rolled-a-7 branch (`App.tsx:3587`): `} else if (!gameRules.citiesAndKnightsBarbarians || robberActive) {`
- `armChaseRobber` (`App.tsx:5280`): `if (gameRules.citiesAndKnightsBarbarians && !robberActive) {`
- `armChasePirate` (`App.tsx:5314`): same gate
- `armTaxation` (`App.tsx:6035`): same gate
- `getPortRate` (`App.tsx:2680-2684`): reads bare `merchantHolderId`/`merchantTileId`
- VP-scoring call sites (`App.tsx:2563`, `4112`, `5782`, `5792`): pass bare `merchantHolderId` as an argument to `getPlayerScore`/`getPublicScore`
- `MerchantLayer` render prop (`App.tsx:7145`): `merchantTileId={merchantTileId}`
- `GameHudProps.merchantHolderId` prop (`App.tsx:7318`): `merchantHolderId={merchantHolderId}`

All of these keep compiling and behaving identically because Step 1's alias declarations (`const robberActive = gameState.board.robberActive`, etc.) preserve the bare identifier every one of these sites already references.

- [ ] **Step 11: Typecheck**

Run: `npx tsc -p tsconfig.app.json`
Expected: clean.

- [ ] **Step 12: Run the full existing test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 13: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 14: Commit**

```bash
git add src/App.tsx
git commit -m "feat: migrate robberActive/merchantTileId/merchantHolderId onto BoardState"
```

---

### Task 3: Migrate `barbarianTrackPosition`, `activeBarbarianAttack`, `knightsPromotedThisTurn` (`ProgressState` fields) in `App.tsx`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `ProgressState`/`ProgressAction`/`reduceProgress`/`initialProgressState` (Task 1); `GameState.progress` (Task 1).
- Produces: `gameState.progress.barbarianTrackPosition`/`activeBarbarianAttack`/`knightsPromotedThisTurn` as the live source of truth — local `useState` for all 3 fully removed; `applyTurnAdvance`'s redundant `knightsPromotedThisTurn` clear line deleted outright.

Same verification approach as Task 2 (no dedicated `App.tsx` test file — `npx tsc -p tsconfig.app.json` + full existing suite + `npm run build`).

**Two adjacency risks apply in this task** (Global Constraint 4) — flagged again at their exact site below, since this is where they're actually reachable:
1. `applyBarbarianAttackResult` sets `activeBarbarianAttack` AND `pillageQueue` on two adjacent lines — only the first is in scope.
2. `resetGame` and `restoreFromSnapshot` each clear `activeBarbarianAttack`/`pillageQueue`/`resolvedPillageVertexIdsRef`/`winnerDrawQueue` as a 4-statement cluster — only the first is in scope, at both sites.

- [ ] **Step 1: Replace the 3 `useState` declarations with reducer-backed aliases**

Read `App.tsx:580-654` (approximate) first — note this is the same block Task 2 already partially edited; the `robberActive`/`merchantTileId`/`merchantHolderId` lines below reflect Task 2's finished state.

Find:
```tsx
  // Cities & Knights robber activation — starts inert (robber behaves as
  // base-game: always movable on a rolled 7). Permanently flips true the
  // first time a barbarian attack resolves (Task 4), regardless of
  // outcome. Until then, a 7 still forces discard but the robber never
  // moves and nothing is stolen — CN3087 p.7: "The robber does not
  // activate until after it has been placed on the desert following the
  // first barbarian attack."
  const robberActive = gameState.board.robberActive

  // Cities & Knights barbarian ship position on its 7-space track (0-6).
  // Advances on each 'ship' event-die face; resets to 0 after every attack.
  const [barbarianTrackPosition, setBarbarianTrackPosition] = useState(0)

  // Cities & Knights barbarian attack (Task 5) — the CURRENT result being
  // walked through (for the modal's headline/strength-comparison display),
  // plus the full pending lists for both post-attack choices (NOT assumed
  // front-ordered — see activePillageTarget/activeWinnerDrawPlayerId below
  // for why).
  const [activeBarbarianAttack, setActiveBarbarianAttack] = useState<BarbarianAttackResult | null>(null)
  const [pillageQueue, setPillageQueue] = useState<BarbarianPillageTarget[]>([])
  const [winnerDrawQueue, setWinnerDrawQueue] = useState<number[]>([]) // player ids, tied winners only

  // Cities & Knights Merchant (Task 13) — App-level board-piece state, same
  // category as gameState.board.robberTileId, not a per-player field: the
  // piece sits on one tile and is controlled by at most one player at a
  // time, independent of createInitialPlayers/Player. null until the card is
  // first played and placed.
  const merchantTileId = gameState.board.merchantTileId
  const merchantHolderId = gameState.board.merchantHolderId
```

Replace (only `barbarianTrackPosition` and `activeBarbarianAttack` change — `pillageQueue`/`winnerDrawQueue` are explicitly out of scope and stay exactly as `useState`):
```tsx
  // Cities & Knights robber activation — starts inert (robber behaves as
  // base-game: always movable on a rolled 7). Permanently flips true the
  // first time a barbarian attack resolves (Task 4), regardless of
  // outcome. Until then, a 7 still forces discard but the robber never
  // moves and nothing is stolen — CN3087 p.7: "The robber does not
  // activate until after it has been placed on the desert following the
  // first barbarian attack."
  const robberActive = gameState.board.robberActive

  // Cities & Knights barbarian ship position on its 7-space track (0-6).
  // Advances on each 'ship' event-die face; resets to 0 after every attack.
  const barbarianTrackPosition = gameState.progress.barbarianTrackPosition

  // Cities & Knights barbarian attack (Task 5) — the CURRENT result being
  // walked through (for the modal's headline/strength-comparison display),
  // plus the full pending lists for both post-attack choices (NOT assumed
  // front-ordered — see activePillageTarget/activeWinnerDrawPlayerId below
  // for why).
  const activeBarbarianAttack = gameState.progress.activeBarbarianAttack
  const [pillageQueue, setPillageQueue] = useState<BarbarianPillageTarget[]>([])
  const [winnerDrawQueue, setWinnerDrawQueue] = useState<number[]>([]) // player ids, tied winners only

  // Cities & Knights Merchant (Task 13) — App-level board-piece state, same
  // category as gameState.board.robberTileId, not a per-player field: the
  // piece sits on one tile and is controlled by at most one player at a
  // time, independent of createInitialPlayers/Player. null until the card is
  // first played and placed.
  const merchantTileId = gameState.board.merchantTileId
  const merchantHolderId = gameState.board.merchantHolderId
```

- [ ] **Step 2: `knightsPromotedThisTurn`'s declaration**

Find (`App.tsx:641-649` approximate):
```tsx
  // Cities & Knights knight promote (Task 8) — once per turn, per knight
  // INSTANCE (a future Smithing card promotes 2 different knights for free
  // in one play, which must stay legal, so this is a Set of knight ids, not
  // a single flag or count). Cleared in applyTurnAdvance alongside
  // pendingKnightRecruit/armedKnightAction just above — same "shared
  // choke point for both the local end-turn action AND the remote
  // TURN_PASSED receiver" reasoning, not handleEndTurn, which only guards
  // and delegates to endTurn -> applyTurnAdvance.
  const [knightsPromotedThisTurn, setKnightsPromotedThisTurn] = useState<Set<string>>(new Set())
```

Replace:
```tsx
  // Cities & Knights knight promote (Task 8) — once per turn, per knight
  // INSTANCE (a future Smithing card promotes 2 different knights for free
  // in one play, which must stay legal, so this is a Set of knight ids, not
  // a single flag or count). Cleared by reduceProgress's own TURN_ADVANCED
  // case (game/reducers/progress.ts) — same "shared choke point for both
  // the local end-turn action AND the remote TURN_PASSED receiver"
  // reasoning applyTurnAdvance's existing dispatch of TURN_ADVANCED already
  // gives every other slice that resets on turn-advance.
  const knightsPromotedThisTurn = gameState.progress.knightsPromotedThisTurn
```

- [ ] **Step 3: `onBarbarianShipAdvanced` receiver**

Find (`App.tsx:1660-1662`):
```tsx
    onBarbarianShipAdvanced: (payload) => {
      setBarbarianTrackPosition(payload.position)
    },
```

Replace:
```tsx
    onBarbarianShipAdvanced: (payload) => {
      dispatch({ type: 'BARBARIAN_TRACK_POSITION_SET', position: payload.position })
    },
```

- [ ] **Step 4: `onBarbarianAttackResolved` receiver**

Find (as Task 2 Step 3 left it):
```tsx
    onBarbarianAttackResolved: (payload) => {
      setBarbarianTrackPosition(0)
      if (payload.robberActivated) {
        dispatch({ type: 'ROBBER_ACTIVATED' })
        inform('The barbarians have landed — the robber is now active.')
      }
      applyBarbarianAttackResult(payload.result)
    },
```

Replace:
```tsx
    onBarbarianAttackResolved: (payload) => {
      dispatch({ type: 'BARBARIAN_TRACK_POSITION_SET', position: 0 })
      if (payload.robberActivated) {
        dispatch({ type: 'ROBBER_ACTIVATED' })
        inform('The barbarians have landed — the robber is now active.')
      }
      applyBarbarianAttackResult(payload.result)
    },
```

- [ ] **Step 5: `rollDice`'s barbarian-ship branch — both `setBarbarianTrackPosition` calls**

Find (as Task 2 Step 2 left it):
```tsx
        const attackResult = resolveBarbarianAttack(players, gameState.board.settlements, currentMetropolisVertexIds)
        const isFirstActivation = !robberActive
        setBarbarianTrackPosition(0)
        if (isFirstActivation) {
          dispatch({ type: 'ROBBER_ACTIVATED' })
          // CN3087 p.7: the robber does not activate until after the first
          // barbarian attack — a one-time state transition, announced the
          // same way this project already announces others (e.g. Chase Away
          // the Robber's arm/resolve banners).
          inform('The barbarians have landed — the robber is now active.')
        }
        applyBarbarianAttackResult(attackResult) // Task 5 defines this
        if (onlineInfo) broadcastBarbarianAttackResolved({ result: attackResult, robberActivated: isFirstActivation })
      } else {
        setBarbarianTrackPosition(nextPosition)
        if (onlineInfo) broadcastBarbarianShipAdvanced({ position: nextPosition })
      }
```

Replace:
```tsx
        const attackResult = resolveBarbarianAttack(players, gameState.board.settlements, currentMetropolisVertexIds)
        const isFirstActivation = !robberActive
        dispatch({ type: 'BARBARIAN_TRACK_POSITION_SET', position: 0 })
        if (isFirstActivation) {
          dispatch({ type: 'ROBBER_ACTIVATED' })
          // CN3087 p.7: the robber does not activate until after the first
          // barbarian attack — a one-time state transition, announced the
          // same way this project already announces others (e.g. Chase Away
          // the Robber's arm/resolve banners).
          inform('The barbarians have landed — the robber is now active.')
        }
        applyBarbarianAttackResult(attackResult) // Task 5 defines this
        if (onlineInfo) broadcastBarbarianAttackResolved({ result: attackResult, robberActivated: isFirstActivation })
      } else {
        dispatch({ type: 'BARBARIAN_TRACK_POSITION_SET', position: nextPosition })
        if (onlineInfo) broadcastBarbarianShipAdvanced({ position: nextPosition })
      }
```

- [ ] **Step 6: `resetGame`'s `setBarbarianTrackPosition(0)` — real conversion, not a deletion**

`ProgressState` has no combined reset action (Global Constraint 2), so unlike `robberActive`/`merchantTileId`/`merchantHolderId` in Task 2, this site becomes a real dispatch.

Find (as Task 2 Step 6 left it):
```tsx
    // Cities & Knights barbarian-track gate (Task 3) — same "always reset on
    // a fresh game" treatment as every other single-shot C&K flag below: a
    // leftover `true` from a PREVIOUS match's resolved barbarian attack would
    // let the robber move on the very first 7 of a brand-new match, even
    // with a from-scratch barbarian track that hasn't had a first attack yet.
    // (robberActive itself is reset by the RESET_BOARD dispatch below, whose
    // reducer case now covers it — see board.ts.)
    setBarbarianTrackPosition(0)
```

Replace:
```tsx
    // Cities & Knights barbarian-track gate (Task 3) — same "always reset on
    // a fresh game" treatment as every other single-shot C&K flag below: a
    // leftover `true` from a PREVIOUS match's resolved barbarian attack would
    // let the robber move on the very first 7 of a brand-new match, even
    // with a from-scratch barbarian track that hasn't had a first attack yet.
    // (robberActive itself is reset by the RESET_BOARD dispatch below, whose
    // reducer case now covers it — see board.ts. barbarianTrackPosition has
    // no such combined reset action — ProgressState deliberately has none,
    // see progress.ts — so it's reset here explicitly.)
    dispatch({ type: 'BARBARIAN_TRACK_POSITION_SET', position: 0 })
```

- [ ] **Step 7: `restoreFromSnapshot`'s `setBarbarianTrackPosition(...)` — real conversion**

Find (as Task 2 Step 9 left it):
```tsx
    // Cities & Knights Merchant (Task 13) — merchantTileId/merchantHolderId
    // are now restored by the widened RESTORE_BOARD dispatch above (see
    // board.ts's RESTORE_BOARD case), same optional/backward-compatible
    // `?? default` treatment robberTileId/pirateTileId already get there.
    // Cities & Knights Barbarians (Tasks 3/4) — same optional/backward-
    // compatible treatment as merchantTileId/merchantHolderId above.
    setBarbarianTrackPosition(snapshot.barbarianTrackPosition ?? 0)
```

Replace:
```tsx
    // Cities & Knights Merchant (Task 13) — merchantTileId/merchantHolderId
    // are now restored by the widened RESTORE_BOARD dispatch above (see
    // board.ts's RESTORE_BOARD case), same optional/backward-compatible
    // `?? default` treatment robberTileId/pirateTileId already get there.
    // Cities & Knights Barbarians (Tasks 3/4) — barbarianTrackPosition has
    // no combined restore action (ProgressState deliberately has none, see
    // progress.ts), so it's restored here explicitly; same optional/
    // backward-compatible treatment as merchantTileId/merchantHolderId above.
    dispatch({ type: 'BARBARIAN_TRACK_POSITION_SET', position: snapshot.barbarianTrackPosition ?? 0 })
```

- [ ] **Step 8: `applyBarbarianAttackResult` — ADJACENCY RISK 1: touch only the `setActiveBarbarianAttack` line**

Find (`App.tsx:3314-3316`):
```tsx
  const applyBarbarianAttackResult = (result: BarbarianAttackResult) => {
    setActiveBarbarianAttack(result)
    setPillageQueue(result.pillageTargets)
```

Replace (the very next line, `setPillageQueue(result.pillageTargets)`, is explicitly out of scope — do not touch it, even though it sits immediately below):
```tsx
  const applyBarbarianAttackResult = (result: BarbarianAttackResult) => {
    dispatch({ type: 'BARBARIAN_ATTACK_SET', result })
    setPillageQueue(result.pillageTargets)
```

- [ ] **Step 9: `resetGame` — ADJACENCY RISK 2 (site A): touch only `setActiveBarbarianAttack(null)`**

Find (`App.tsx:6526-6534`):
```tsx
    // Cities & Knights barbarian attack (Task 5) — same "always reset on a
    // fresh game" treatment as robberActive/barbarianTrackPosition above: a
    // leftover attack result or pending pillage/draw queue from a PREVIOUS
    // match would otherwise pop the attack modal (or strand a queue entry
    // no current player can ever clear) the instant the new game starts.
    setActiveBarbarianAttack(null)
    setPillageQueue([])
    resolvedPillageVertexIdsRef.current.clear()
    setWinnerDrawQueue([])
```

Replace (the 3 lines below `setActiveBarbarianAttack(null)` — `setPillageQueue([])`, `resolvedPillageVertexIdsRef.current.clear()`, `setWinnerDrawQueue([])` — are explicitly out of scope; do not touch them even though all 4 statements sit in one tight cluster):
```tsx
    // Cities & Knights barbarian attack (Task 5) — same "always reset on a
    // fresh game" treatment as robberActive/barbarianTrackPosition above: a
    // leftover attack result or pending pillage/draw queue from a PREVIOUS
    // match would otherwise pop the attack modal (or strand a queue entry
    // no current player can ever clear) the instant the new game starts.
    dispatch({ type: 'BARBARIAN_ATTACK_SET', result: null })
    setPillageQueue([])
    resolvedPillageVertexIdsRef.current.clear()
    setWinnerDrawQueue([])
```

- [ ] **Step 10: `restoreFromSnapshot` — ADJACENCY RISK 2 (site B): touch only `setActiveBarbarianAttack(null)`**

Find (`App.tsx:6701-6712`):
```tsx
    // Cities & Knights barbarian attack — same "always reset on restore"
    // treatment as the pending flags above. The connection-restored resync
    // effect can call restoreFromSnapshot at any time, including mid-attack:
    // a stranded pillageQueue entry would then point at a vertex the
    // restored settlements may already show as a settlement (the auto-skip
    // effect could act on it), and a stranded activeBarbarianAttack would
    // re-open the modal over state it no longer describes. Matches
    // resetGame's own clearing of these same three.
    setActiveBarbarianAttack(null)
    setPillageQueue([])
    resolvedPillageVertexIdsRef.current.clear()
    setWinnerDrawQueue([])
```

Replace (same adjacency risk as Step 9 — `setPillageQueue([])`/`resolvedPillageVertexIdsRef.current.clear()`/`setWinnerDrawQueue([])` stay untouched):
```tsx
    // Cities & Knights barbarian attack — same "always reset on restore"
    // treatment as the pending flags above. The connection-restored resync
    // effect can call restoreFromSnapshot at any time, including mid-attack:
    // a stranded pillageQueue entry would then point at a vertex the
    // restored settlements may already show as a settlement (the auto-skip
    // effect could act on it), and a stranded activeBarbarianAttack would
    // re-open the modal over state it no longer describes. Matches
    // resetGame's own clearing of these same three.
    dispatch({ type: 'BARBARIAN_ATTACK_SET', result: null })
    setPillageQueue([])
    resolvedPillageVertexIdsRef.current.clear()
    setWinnerDrawQueue([])
```

- [ ] **Step 11: The "Close" button `onClick` — 3rd and last `activeBarbarianAttack` null-setting site**

Find (`App.tsx:7480-7490`):
```tsx
          {pillageQueue.length === 0 && winnerDrawQueue.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-20 z-50 flex justify-center">
              <button
                type="button"
                onClick={() => setActiveBarbarianAttack(null)}
                className="pointer-events-auto rounded-lg bg-gradient-to-b from-gold to-gold-deep px-6 py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95"
              >
                Close
              </button>
            </div>
          )}
```

Replace:
```tsx
          {pillageQueue.length === 0 && winnerDrawQueue.length === 0 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-20 z-50 flex justify-center">
              <button
                type="button"
                onClick={() => dispatch({ type: 'BARBARIAN_ATTACK_SET', result: null })}
                className="pointer-events-auto rounded-lg bg-gradient-to-b from-gold to-gold-deep px-6 py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95"
              >
                Close
              </button>
            </div>
          )}
```

- [ ] **Step 12: `onKnightPromoted` receiver**

Find (`App.tsx:2121-2124`):
```tsx
    onKnightPromoted: (payload) => {
      dispatch({ type: 'KNIGHT_PROMOTED', playerId: payload.playerId, knightId: payload.knightId, newStrength: payload.newStrength })
      setKnightsPromotedThisTurn((prev) => new Set(prev).add(payload.knightId))
    },
```

Replace (the existing `KNIGHT_PROMOTED` dispatch stays; only the setter line changes):
```tsx
    onKnightPromoted: (payload) => {
      dispatch({ type: 'KNIGHT_PROMOTED', playerId: payload.playerId, knightId: payload.knightId, newStrength: payload.newStrength })
      dispatch({ type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: [payload.knightId] })
    },
```

- [ ] **Step 13: `onSmithingPlayed` receiver**

Find (`App.tsx:2172-2179`):
```tsx
    onSmithingPlayed: (payload) => {
      dispatch({ type: 'SMITHING_PLAYED', playerId: payload.playerId, knightIds: payload.knightIds })
      setKnightsPromotedThisTurn((prev) => {
        const next = new Set(prev)
        for (const knightId of payload.knightIds) next.add(knightId)
        return next
      })
    },
```

Replace (the existing `SMITHING_PLAYED` dispatch stays; the functional-updater block is replaced with 1 dispatch carrying the whole array — matches `PROGRESS_CARDS_DRAWN`'s own multi-element idiom):
```tsx
    onSmithingPlayed: (payload) => {
      dispatch({ type: 'SMITHING_PLAYED', playerId: payload.playerId, knightIds: payload.knightIds })
      dispatch({ type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: payload.knightIds })
    },
```

- [ ] **Step 14: `promoteKnight`**

Find (`App.tsx:5549-5572`):
```tsx
  const promoteKnight = (knightId: string) => {
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    const knight = player.knightPieces.find((k) => k.id === knightId)
    if (!knight) {
      warn('Cannot promote that knight.')
      return
    }
    if (knightsPromotedThisTurn.has(knightId)) {
      warn('That knight was already promoted this turn.')
      return
    }
    if (!canPromoteKnight(player, knight)) {
      warn('Cannot promote that knight.')
      return
    }
    const next = nextKnightStrength(knight.strength)!
    dispatch({ type: 'KNIGHT_PROMOTED', playerId: player.id, knightId, newStrength: next })
    setKnightsPromotedThisTurn((prev) => new Set(prev).add(knightId))
    if (onlineInfo) broadcastKnightPromoted({ playerId: player.id, knightId, newStrength: next })
  }
```

Replace the setter line only:
```tsx
    const next = nextKnightStrength(knight.strength)!
    dispatch({ type: 'KNIGHT_PROMOTED', playerId: player.id, knightId, newStrength: next })
    dispatch({ type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: [knightId] })
    if (onlineInfo) broadcastKnightPromoted({ playerId: player.id, knightId, newStrength: next })
  }
```

- [ ] **Step 15: `playSmithing`**

Find (`App.tsx:5697-5730`):
```tsx
  const playSmithing = () => {
    if (!canPlayProgressCardNow()) return
    if (!isMyTurn) {
      warn("It's not your turn.")
      return
    }
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('smithing')) {
      warn('No Smithing card to play.')
      return
    }
    // selectSmithingPromotions (game/knights.ts) tracks a RUNNING copy of
    // knightSupply while picking candidates, rather than trusting a single
    // static check per candidate — see its own comment for why: two knights
    // eligible for the SAME next tier can't both be selected off a snapshot
    // showing supply[next] === 1 for both, only off a count that actually
    // decrements as each candidate is accepted.
    const toPromote = selectSmithingPromotions(
      { ...player, resources: { ...player.resources, wool: 999, ore: 999 } },
      knightsPromotedThisTurn,
    )
    if (toPromote.length === 0) {
      warn('No knights eligible to promote.')
      return
    }
    dispatch({ type: 'SMITHING_PLAYED', playerId: player.id, knightIds: toPromote.map((k) => k.id) })
    setKnightsPromotedThisTurn((prev) => {
      const next = new Set(prev)
      for (const k of toPromote) next.add(k.id)
      return next
    })
    inform(`${player.name} played Smithing — promoted ${toPromote.length} knight(s).`)
    if (onlineInfo) broadcastSmithingPlayed({ playerId: player.id, knightIds: toPromote.map((k) => k.id) })
  }
```

Replace the functional-updater block:
```tsx
    dispatch({ type: 'SMITHING_PLAYED', playerId: player.id, knightIds: toPromote.map((k) => k.id) })
    dispatch({ type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED', knightIds: toPromote.map((k) => k.id) })
    inform(`${player.name} played Smithing — promoted ${toPromote.length} knight(s).`)
    if (onlineInfo) broadcastSmithingPlayed({ playerId: player.id, knightIds: toPromote.map((k) => k.id) })
  }
```

- [ ] **Step 16: `applyTurnAdvance` — delete the now-dead `setKnightsPromotedThisTurn(new Set())` line**

`reduceProgress`'s own `TURN_ADVANCED` case (wired in Task 1) already clears `knightsPromotedThisTurn` on the exact same dispatch this function already makes one line below — this mirrors the immediately-prior sub-plan's own precedent for `hasRolledThisTurn`/`devCardPlayedThisTurn`/`consecutiveDoublesThisTurn`/`currentPlayerIndex` (delete, don't convert, since the existing `TURN_ADVANCED` dispatch already covers it). This is also a **required** deletion, not optional — the setter no longer exists after Step 2 removed its `useState` declaration.

Find (`App.tsx:915-925`):
```tsx
    // Cities & Knights knight promote (Task 8) — same turn-boundary exploit
    // pendingKnightRecruit's own comment above describes: without this, a
    // stale knightsPromotedThisTurn entry from the OUTGOING player would
    // wrongly block the incoming player from promoting a same-id-coincident
    // knight, or (more importantly) simply never get cleared for the
    // outgoing player's own next turn. Cleared here — not in
    // handleEndTurn, which only guards and delegates to endTurn, which
    // calls this — so both the local end-turn action and the remote
    // TURN_PASSED receiver apply the identical reset.
    setKnightsPromotedThisTurn(new Set())
    dispatch({ type: 'TURN_ADVANCED', nextPlayerIndex: nextIndex })
```

Replace (delete the setter line and update the now-stale comment; the `TURN_ADVANCED` dispatch is untouched):
```tsx
    // Cities & Knights knight promote (Task 8) — same turn-boundary exploit
    // pendingKnightRecruit's own comment above describes: without this, a
    // stale knightsPromotedThisTurn entry from the OUTGOING player would
    // wrongly block the incoming player from promoting a same-id-coincident
    // knight, or (more importantly) simply never get cleared for the
    // outgoing player's own next turn. Cleared by reduceProgress's own
    // TURN_ADVANCED case (game/reducers/progress.ts) on the SAME dispatch
    // just below — not in handleEndTurn, which only guards and delegates to
    // endTurn, which calls this — so both the local end-turn action and the
    // remote TURN_PASSED receiver apply the identical reset.
    dispatch({ type: 'TURN_ADVANCED', nextPlayerIndex: nextIndex })
```

- [ ] **Step 17: Confirm the remaining read sites still compile unchanged**

No edits needed — verification only:
- `promoteKnight`'s own `.has(knightId)` guard (`App.tsx:5560`)
- `selectSmithingPromotions`'s `.has()` check inside `game/knights.ts` — takes `knightsPromotedThisTurn` as a parameter (`playSmithing`'s call site at `App.tsx:5716` passes the bare identifier)
- `GameHud.tsx`'s `KnightsPanel` `canPromote` prop (`GameHud.tsx:881`) and the `GameHudProps.knightsPromotedThisTurn: Set<string>` prop passed at `App.tsx:7344`
- `GameHudProps.barbarianTrackPosition: number` prop passed at `App.tsx:7328`

All keep compiling because Step 1/Step 2's aliases preserve the bare identifiers.

- [ ] **Step 18: Typecheck**

Run: `npx tsc -p tsconfig.app.json`
Expected: clean.

- [ ] **Step 19: Run the full existing test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 20: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 21: Commit**

```bash
git add src/App.tsx
git commit -m "feat: migrate barbarianTrackPosition/activeBarbarianAttack/knightsPromotedThisTurn onto ProgressState"
```

---

## Self-Review

**1. Spec coverage** — all 6 fields covered: `robberActive` (Task 1 reducer + Task 2 App.tsx: declaration, 2 mid-game sites, reset deletion, restore widen), `merchantTileId`/`merchantHolderId` (Task 1 + Task 2: declaration, 2 mid-game sites, reset deletion, restore widen), `barbarianTrackPosition` (Task 1 + Task 3: declaration, 4 mid-game sites, reset conversion, restore conversion), `activeBarbarianAttack` (Task 1 + Task 3: declaration, 1 shared trusted-apply site, 3 null-setting sites with both adjacency risks flagged), `knightsPromotedThisTurn` (Task 1 + Task 3: declaration, 4 add sites, 1 deletion site). `board.ts`/`board.test.ts` wiring is Task 1 Steps 1-4; `gameState.ts` wiring is Task 1 Step 9. Both flagged adjacency risks are called out at their real, verified sites (Task 3 Step 8 for `applyBarbarianAttackResult`/`pillageQueue`; Task 3 Steps 9-10 for the `resetGame`/`restoreFromSnapshot` 4-statement clusters). The cross-task `RESTORE_BOARD` compile-safety issue (a gap the brief's "zero App.tsx changes in Task 1" claim didn't account for) is resolved with an explicit temporary-placeholder step (Task 1 Step 12) that Task 2 Step 8 replaces with real values — documented as a deliberate, narrow deviation, not silently patched over.

**2. Placeholder scan** — no "TBD"/"implement later"/"add appropriate handling"/"similar to Task N" language anywhere in the task steps; every code block is real, complete code read from (or precisely derived from) the live files this session, not paraphrased or invented.

**3. Type consistency** — checked across all 3 tasks: `ProgressState`/`ProgressAction`/`reduceProgress`/`initialProgressState` names and signatures introduced in Task 1 are used identically in Task 3 (no renaming drift). `BoardState.robberActive`/`merchantTileId`/`merchantHolderId` and `BoardAction`'s `ROBBER_ACTIVATED`/`MERCHANT_MOVED` introduced in Task 1 match their usage in Task 2 exactly. The widened `RESTORE_BOARD` payload shape is consistent between Task 1's type definition, Task 1 Step 12's temporary placeholder call site, and Task 2 Step 8's final call site. Task 3's "find" blocks were re-derived to reflect Task 2's edits already applied (not the pre-Task-2 original text) at every site the two tasks share (`onBarbarianAttackResolved`, `rollDice`'s barbarian-ship branch, `resetGame`, `restoreFromSnapshot`) — verified line-by-line against what Task 2's own "replace" blocks produce.

No gaps found requiring an added task; no fixes were needed beyond the cross-task `RESTORE_BOARD` sequencing already resolved during drafting (see Global Constraints and Task 1 Step 12's rationale).
