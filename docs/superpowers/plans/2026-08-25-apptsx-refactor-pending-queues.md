# App.tsx Reducer Refactor — Sub-plan 6: Pending Queues (Uniform Half)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 7 fields — `discardPlayerIds`, `scienceFreeResourcePlayerIds`, `goldFieldResourcePlayerIds`, `pillageQueue`, `winnerDrawQueue`, `progressCardOverLimitPlayerIds`, `revealedTileIds` (a brand-new `PendingQueuesState`/`pendingQueues.ts` slice) — out of `App.tsx` `useState` and into the reducer, via 17 new action types across ~28 call sites.

**Architecture:** `GameState = { board: BoardState; players: Player[]; turn: TurnState; progress: ProgressState; decks: DecksState; trophies: TrophiesState }`, composed via `src/game/gameState.ts`'s `reduceGame`, which runs every sub-reducer against every dispatched action unconditionally (each slice ignores actions it doesn't own via its switch's `default` case). This sub-plan adds one more slice the identical way `progress.ts`/`decks.ts`/`trophies.ts` were added: own file, own `initialState`, own action union, one more line in `reduceGame`. `GameState` becomes `{ board; players; turn; progress; decks; trophies; pendingQueues }`.

**Tech Stack:** React 19 + TypeScript, `useReducer`, Vitest for reducer unit tests, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-apptsx-reducer-refactor-design.md` — this plan's own concrete field-by-field design (verified against the live code this session) supersedes that spec's loose sketch of `PendingState` (same relationship every prior sub-plan's own concrete design had to its spec sketch). The spec's `PendingState` sketch listed 9 fields (the 7 here plus `pendingTrade` and `freeRoadsRemaining`) as one future sub-plan; live-code research this session found ~47 total setter call sites across those 9 fields, split unevenly — `pendingTrade` (11 sites, no shared helper) and `freeRoadsRemaining` (8 sites across 5+ unrelated mechanics) are each bespoke, while these 7 fields (~28 sites) share a uniform, already-partially-migrated pattern (`dequeueOne`/`activeQueueEntry` from Sub-plan 2's `game/pendingQueue.ts`). The user approved splitting this into two sub-plans. **This plan covers ONLY the 7-field uniform half.** `pendingTrade` and `freeRoadsRemaining` are explicitly OUT OF SCOPE — a separate future sub-plan (pushing the spec's original "GameHud prop restructuring" sub-plan from 7th to 8th).

**Naming note:** `src/game/pendingQueue.ts` (singular) **already exists** — a pure-helpers file (`activeQueueEntry`, `dequeueOne`) created in Sub-plan 2 and already imported by `App.tsx` today (`import { activeQueueEntry, dequeueOne } from './game/pendingQueue'`, `App.tsx:105`). This sub-plan creates a **different** file, `src/game/reducers/pendingQueues.ts` (plural, a reducer slice), in a different directory. The existing `src/game/pendingQueue.ts` is not touched — its two functions are only ever imported, never modified — and both files coexist. Do not confuse the two, and do not let an editor auto-import resolve `PendingQueuesState`/`reducePendingQueues` to the wrong file.

---

## Global Constraints

- **Trusted-apply pattern (`CONVENTIONS.md` §1) is unchanged and non-negotiable.** One client decides a non-deterministic value, broadcasts it, every client — including the decider — applies the exact same decided result via a shared function, never re-deriving it. This sub-plan moves *where* 7 decided values live (reducer instead of `useState`), never *how* they get decided.
- **Composition pattern extends, doesn't change.** `GameState`/`GameAction` currently compose as `{ board; players; turn; progress; decks; trophies }` / `BoardAction | PlayersAction | TurnAction | ProgressAction | DecksAction | TrophiesAction`, with `reduceGame` running every sub-reducer against every action unconditionally. This sub-plan adds `pendingQueues: PendingQueuesState` as one more line in that same composition (own file, own action union member, one more `reduceGame` line — no new composition mechanism), matching how `board`/`players`/`turn`/`progress`/`decks`/`trophies` already compose.
- **The classification rule is the binding test for "does this state move," and all 7 fields qualify via rule 1 (dual-write)** — each is written from both a local actor's own dispatch path AND a broadcast-receiver block, the strongest possible signal that the app is already hand-syncing this state across clients. Several already route their dequeue step through the shared `dequeueOne` helper from Sub-plan 2, which is itself evidence the app already treats "remove one resolved entry" as a single piece of shared logic — this sub-plan just relocates where the array it operates on lives (reducer state instead of a `useState` cell), not the logic itself. See the Data Model section below for each field's own specific justification.
- **The relative-vs-absolute classification rule is itself a binding constraint on every action's shape, not just descriptive color.** Rationale: Sub-plan 5's (the immediately-prior sub-plan, Decks & Trophies) final whole-branch review found a REAL correctness bug — `onBarbarianWinnerDrawResolved`/`onProgressCardsDrawn` had been migrated from React's batch-safe functional `setState` updater (`setProgressCardDecks((prev) => ({ ...prev, [track]: prev[track].slice(1) }))`, safe regardless of closure staleness) to an ABSOLUTE dispatch computed from a closed-over `progressCardDecks` alias, reintroducing a stale-closure race reachable via rapid-fire same-track broadcasts (the winner-draw timeout sweep can fire multiple `PROGRESS_CARD_DECK_SET`-shaped updates for the same track in quick succession; two dispatches both reading the same stale alias would have the second silently overwrite instead of compound with the first). The fix, `PROGRESS_CARD_DECK_POPPED`, computes the slice against LIVE reducer state (`state.progressCardDecks[action.track]`) instead. **The binding rule this sub-plan follows:** whenever the OLD code's `setX((prev) => someFn(prev))` (or any setState call reading the CURRENT value of the field being mutated) is converted, the replacement MUST be a RELATIVE action — the reducer computes the new value from `state.X` itself, never from a value the dispatch site computed off a component-closure read of that same field. An ABSOLUTE "set to computed value X" action is only safe when the OLD code's setState call did NOT read the field's own current value (a plain overwrite from other inputs). Every one of this plan's 17 actions was classified this way and RE-VERIFIED against the actual current `App.tsx` this session (not just trusted from the originating research pass) — see the Data Model section below for each field's classification and the exact site that justifies it. Do not "simplify" any relative action back to absolute even if a single call site looks safe in isolation — the classification is about the FIELD's overall write pattern across every actor+receiver pair, not any one site.
- **`npm run build` (not just `tsc`/`eslint`/`vitest`) is required before any task is reported done** — this project's own history has a real case (Board Foundation, Seafarers sub-plan 1) of a broken Vite asset import that only `npm run build` caught.
- **Bare `npx tsc --noEmit` checks zero files on this project — do not use it as a task's typecheck command.** `catan-3d/tsconfig.json` is solution-style (`"files": []` + project references), so `tsc --noEmit` exits 0 unconditionally without checking anything. Every task below uses `npx tsc -p tsconfig.app.json` (run from the `catan-3d/` directory) as the real per-task typecheck gate.
- **This sub-plan's own binding constraints**, verified against the live code this session:
  1. **Every new action dispatches via bare `dispatch(...)`, never `dispatchGameAction`.** No banner/sfx/broadcast side effects are added anywhere by this migration — it relocates storage only.
  2. **No single combined reset/restore action across all 7 fields.** Some individual fields DO get their own dedicated `_SET`/`_CLEARED` action used specifically (and only) at their reset/restore sites, because that field's mid-game action is relative-only and can't itself express "replace everything" (e.g. `DISCARD_PLAYERS_SET` is absolute and reused at 3 sites — population, reset, restore — while `SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED` exists only for reset/restore since the mid-game action, `_ADDED`, is relative). This is a per-field granular design, not the "one combined reset action for everything" pattern this project has consistently avoided (matching Sub-plan 3's/4's/5's own explicit precedent of no combined `RESET_TURN`/`RESTORE_TURN`/combined `PendingQueuesState` restore action).
  3. **Read-preserving alias pattern, matching `turn.ts`'s/`progress.ts`'s/`decks.ts`'s/`trophies.ts`'s own established convention.** Every migrated field gets exactly ONE alias, declared exactly where its old `useState` line sat: `const discardPlayerIds = gameState.pendingQueues.discardPlayerIds`, etc. Every downstream read/gate site (`activeQueueEntry` calls, `canPerformAction`'s gating checks, `validDiscardPlayerIds`'s `useMemo`, the autosave-snapshot object, GameHud props, …) keeps referencing the same bare identifier, unchanged, and keeps compiling and behaving identically. None of these read sites are touched by this migration.
  4. **`tsconfig.app.json` has `noUnusedLocals: true` and `noUnusedParameters: true`.** Verified this session by grepping every remaining `App.tsx` usage of the two helpers this migration drains: `dequeueOne` (imported at `App.tsx:105` alongside `activeQueueEntry`) is used at exactly 6 sites, all 6 converting to dispatch calls across Tasks 2–4 — after Task 4's edit, it has ZERO remaining references, so Task 4 MUST delete `dequeueOne` from that import line (keeping `activeQueueEntry`, which has 6 unrelated READ-site usages that are never touched). `revealTilesForVertex` (imported at `App.tsx:39`) is used at exactly 1 site, converting in Task 4 — after that edit it has ZERO remaining references, so Task 4 MUST delete that entire import line. `BarbarianPillageTarget` (imported as a type at `App.tsx:120`, inside the `./game/knights` import block) is used at exactly 1 site — the `pillageQueue` `useState` type annotation — converting in Task 3, so Task 3 MUST delete that one `type BarbarianPillageTarget,` line from the import block. Leaving any of these three imports in place after their last usage is removed fails `npx tsc -p tsconfig.app.json` and `npm run build`.
  5. **`applyDiscard`'s `remaining` variable is NOT deleted, even though its state-mutation counterpart is.** Verified this session by reading the live function body (`App.tsx:1333-1351`): `const remaining = dequeueOne(discardPlayerIds, (id) => id, playerId)` is read TWICE after computation — once by a `debugLog(...)` call on the very next line, and once by `if (remaining.length === 0) { ... }` a few lines down, which gates the phase-transition dispatch (`GAME_PHASE_SET` to either `'chooseRobberOrPirate'` or `'playing'`). Only the STATE WRITE — the `setDiscardPlayerIds(remaining)` line immediately after `remaining`'s computation — converts to `dispatch({ type: 'DISCARD_PLAYER_REMOVED', playerId })`; the `const remaining = dequeueOne(...)` line stays exactly as-is, still reading the `discardPlayerIds` alias (a pure, synchronous READ of the pre-dispatch value, not a write — `dispatch` is async, so this local computation and the reducer's own upcoming update never race). This is a genuine deviation from a same-session research pass's shorthand description ("both lines are deleted") — Task 2 Step 4 below shows the exact corrected diff. Every other one of this plan's 17 actions' call sites WAS confirmed to have no such trailing read (checked individually — see the Self-Review Notes at the end of this document).
     **Residual limitation, confirmed pre-existing and NOT introduced or worsened by this migration:** if `applyDiscard` is called twice in quick succession (e.g., two players' discard broadcasts processed back-to-back before a re-render), the SECOND call's local `remaining` read could compute from a `discardPlayerIds` alias that hasn't yet reflected the FIRST call's dispatch — the same class of staleness this sub-plan's own binding constraint exists to eliminate. This does NOT apply to the reducer's own state (the `DISCARD_PLAYER_REMOVED` dispatch is relative, computed by the reducer against its own live state, so `gameState.pendingQueues.discardPlayerIds` is always correct regardless of call ordering) — it applies ONLY to the local `remaining.length === 0` phase-transition gate and the `debugLog` call. Critically, `discardPlayerIds` was a plain closure read (never a functional updater) in the PRE-migration code too, so this exact limitation already existed before this sub-plan touched the file — the migration neither introduces it nor is obligated to fix it, matching this project's established precedent of preserving (not silently patching) pre-existing gaps outside a pure-refactor's declared scope. Not an action item.
  6. **Explicitly out of scope, do not touch:** `pendingTrade`, `freeRoadsRemaining` (deferred to a separate future sub-plan — see Goal above); `resolvedPillageVertexIdsRef` (a `useRef`, not reducer state — sits directly adjacent to `pillageQueue`'s reset/restore sites, see Task 3); the already-migrated `BARBARIAN_ATTACK_SET`/`activeBarbarianAttack` dispatch calls (Sub-plan 4, sits in the same adjacency cluster as `pillageQueue`/`winnerDrawQueue`'s reset/restore — already a `dispatch` call, stays exactly as-is); `activeQueueEntry`/`dequeueOne` themselves (only imported, never modified); the `localPlayerId: null` hardcode at `progressCardOverLimitPlayerIds`'s own `activeQueueEntry` read site (`App.tsx:3792`, `activeQueueEntry(progressCardOverLimitPlayerIds, (id) => id, null)`) — a documented pre-existing gap from an earlier sub-plan, not this migration's job to fix, and it's a READ site anyway (unaffected by the alias pattern); every other READ site for any of these 7 fields (all preserved via the alias pattern in constraint 3 above).

---

## Data Model — `PendingQueuesState`'s 7 Fields, Verified This Session

Full call-site inventory (28 sites total across 6 setters' worth of distinct fields — `discardPlayerIds`/`scienceFreeResourcePlayerIds`/`goldFieldResourcePlayerIds`/`pillageQueue`/`winnerDrawQueue`/`progressCardOverLimitPlayerIds`/`revealedTileIds` each grepped exhaustively in `App.tsx` this session — every site below is a confirmed match, not an estimate):

### `discardPlayerIds: number[]` (Task 2) — not in `MatchSnapshot`
- `DISCARD_PLAYERS_SET { playerIds: number[] }` — **ABSOLUTE.** 3 sites, none reads the field's own current value: population in `applyRollResult` (`App.tsx:3577`, `setDiscardPlayerIds(overLimitIds)`, a fresh `players.filter(...)` computation); reset (`App.tsx:6434`, literal `[]`); restore (`App.tsx:6779-6789`, a multi-line recomputation from `normalizedPlayers`/`snapshot.gamePhase`, never from the old queue).
- `DISCARD_PLAYER_REMOVED { playerId: number }` — **RELATIVE.** 1 site: `applyDiscard` (`App.tsx:1335-1336`), the MOST exposed form of the stale-closure bug class (a direct closure read, not even wrapped in a functional updater) — see Global Constraints point 5 above for the exact diff shape, including why `remaining` itself is NOT deleted.

### `scienceFreeResourcePlayerIds: number[]` (Task 2) — not in `MatchSnapshot`; gates `canPerformAction()` (`App.tsx:812-815`, untouched READ site)
- `SCIENCE_FREE_RESOURCE_PLAYERS_ADDED { playerIds: number[] }` — **RELATIVE** (`[...new Set([...state.X, ...action.playerIds])]`, matching the old functional updater's own Set-dedupe exactly). 1 site: `applyRollResult` (`App.tsx:3689-3690`), guarded by `if (eligiblePlayerIds.length > 0)` which stays in `App.tsx` unchanged.
- `SCIENCE_FREE_RESOURCE_PLAYER_REMOVED { playerId: number }` — **RELATIVE.** 1 site: `applyScienceFreeResourcePick` (`App.tsx:1372`).
- `SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED` (no payload, always `[]`) — 2 sites: reset (`App.tsx:6437`), restore (`App.tsx:6768`, dropped unconditionally — never persisted, per its own comment).

### `goldFieldResourcePlayerIds: number[]` (Task 2) — not in `MatchSnapshot`; gates `canPerformAction()` (`App.tsx:816-819`, untouched READ site); identical shape to science EXCEPT never deduped (a city on Gold Field owes 2 independent picks)
- `GOLD_FIELD_RESOURCE_PLAYERS_ADDED { playerIds: number[] }` — **RELATIVE** (`[...state.X, ...action.playerIds]`, plain concat — NOT Set-deduped, matching the field's real duplicate-allowed semantics). 1 site: `applyRollResult` (`App.tsx:3656-3657`), guarded by `if (goldFieldPicks.length > 0)`, unchanged.
- `GOLD_FIELD_RESOURCE_PLAYER_REMOVED { playerId: number }` — **RELATIVE.** 1 site: `applyGoldFieldResourcePick` (`App.tsx:1385`).
- `GOLD_FIELD_RESOURCE_PLAYERS_CLEARED` (no payload) — 2 sites: reset (`App.tsx:6438`), restore (`App.tsx:6771`, same unconditional-drop treatment as science).

### `pillageQueue: BarbarianPillageTarget[]` (Task 3) — element type `{ playerId: number; eligibleCityVertexIds: string[] }` from `src/game/knights.ts:245-248`; not in `MatchSnapshot`
- `PILLAGE_QUEUE_SET { targets: BarbarianPillageTarget[] }` — **ABSOLUTE.** 3 sites: population in `applyBarbarianAttackResult` (`App.tsx:3310`, `setPillageQueue(result.pillageTargets)`, a plain overwrite from the attack-result argument); reset (`App.tsx:6525`); restore (`App.tsx:6726`, always cleared, never restored — not persisted).
- `PILLAGE_QUEUE_ENTRY_REMOVED { playerId: number }` — **RELATIVE**, using the custom `(t) => t.playerId` accessor since the element is an object, not a bare id. 1 site: `applyPillage` (`App.tsx:1423`).
- **Adjacency risk (both reset and restore sites):** `setPillageQueue([])` sits directly next to `resolvedPillageVertexIdsRef.current.clear()` (a `useRef`, out of scope) and `dispatch({ type: 'BARBARIAN_ATTACK_SET', result: null })` (already-migrated `progress` slice state, already a `dispatch` call, out of scope). Convert ONLY the `setPillageQueue`/`setWinnerDrawQueue` lines at each site — see Task 3.

### `winnerDrawQueue: number[]` (Task 3) — player ids, tied winners only; not in `MatchSnapshot`
- `WINNER_DRAW_QUEUE_SET { playerIds: number[] }` — **ABSOLUTE.** 3 sites: population in `applyBarbarianAttackResult` (`App.tsx:3318`, same function as `pillageQueue`'s population, different branch — the tied-winners-with-progress-cards-on branch); reset (`App.tsx:6527`); restore (`App.tsx:6728`, same adjacency cluster and always-cleared treatment as `pillageQueue`).
- `WINNER_DRAW_QUEUE_ENTRY_REMOVED { playerId: number }` — **RELATIVE. 2 sites, both use this SAME action:** `applyBarbarianWinnerDraw` (`App.tsx:1444`); AND a separate direct dequeue inside the winner-draw timeout `useEffect`'s empty-deck edge case (`App.tsx:3937`), which bypasses `applyBarbarianWinnerDraw` entirely for that one branch.

### `progressCardOverLimitPlayerIds: number[]` (Task 4) — the ONE queue with a genuine snapshot-restored value; the ONE queue whose `activeQueueEntry` read site (`App.tsx:3792`) hardcodes `localPlayerId: null` (pre-existing gap, out of scope, unaffected read site)
- `PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED { playerIds: number[] }` — **RELATIVE** (same Set-dedupe as science). 1 site: `applyProgressCardDraws` (`App.tsx:1507-1510`), guarded by `if (overLimitIds.length === 0) return` (`App.tsx:1506`, a deliberate "don't restart the hand-limit timeout for a no-op" optimization per its own comment), which stays unchanged.
- `PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED { playerId: number }` — **RELATIVE.** 1 site: `applyProgressDiscard` (`App.tsx:1363`).
- `PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET { playerIds: number[] }` — **ABSOLUTE**, used ONLY for reset/restore (never mid-game): reset (`App.tsx:6427`, literal `[]`); restore (`App.tsx:6747`, `snapshot.progressCardOverLimitPlayerIds ?? []` — a REAL restored value, the `?? []` fallback must be preserved exactly).
- `MatchSnapshot` round-trip: **Yes, optional** — `progressCardOverLimitPlayerIds?: number[]` at `src/multiplayer/matchSnapshot.ts:118`.

### `revealedTileIds: Set<string>` (Task 4) — the one non-array field
Pure-helper verification, confirmed this session by reading `src/game/hiddenTiles.ts:27-36`: `revealTilesForVertex(revealedTileIds: ReadonlySet<string>, vertexId: string, vertexTileIds: Map<string, string[]>): Set<string>` does `const touchedTiles = vertexTileIds.get(vertexId) ?? []`, then returns a new Set with those tiles added to a copy of the input. `touchedTiles` depends ONLY on `vertexId` and the static board-graph `vertexTileIds` Map — NOT on the current `revealedTileIds` contents. `graph.vertexTileIds` is confirmed to be a real `Map<string, string[]>` (`src/data/boardGraph.ts:26`), called with `.get()` at the live call site (`App.tsx:963`) exactly as the helper's own signature implies.
- `TILES_REVEALED { tileIds: string[] }` — **RELATIVE in effect** (the reducer unions against live state: `new Set([...state.revealedTileIds, ...action.tileIds])`), though the payload itself (`graph.vertexTileIds.get(vertexId) ?? []`) is safe to precompute at the dispatch site since it has zero dependency on the current `revealedTileIds` value. 1 site: `applySettlementPlacement` (`App.tsx:963`).
- `REVEALED_TILES_SET { tileIds: string[] }` — **ABSOLUTE**, whole-Set replace (`new Set(action.tileIds)` in the reducer; payload stays a plain array since action payloads should stay plain-data-shaped). 2 sites: reset (`App.tsx:6421`); restore (`App.tsx:6553`, `snapshot.revealedTileIds ?? []`).
- `MatchSnapshot` round-trip: **Yes, optional** — `revealedTileIds?: string[]` at `src/multiplayer/matchSnapshot.ts:34` (serialized via `Array.from(revealedTileIds)` at the autosave effect — not touched by this migration, the alias keeps that site compiling and behaving identically).

---

## File Structure

- **Create** `catan-3d/src/game/reducers/pendingQueues.ts` — new `PendingQueuesState`/`initialPendingQueuesState`/`PendingQueuesAction`/`reducePendingQueues`.
- **Create** `catan-3d/src/game/reducers/pendingQueues.test.ts` — full coverage matching `progress.test.ts`'s conventions, all 17 action types.
- **Modify** `catan-3d/src/game/gameState.ts` — wire `pendingQueues` into `GameState`/`initialGameState`/`GameAction`/`reduceGame`.
- **Modify** `catan-3d/src/game/gameState.test.ts` — add 1 routing test, required by this sub-plan's own process constraint (Sub-plan 3's, 4's, AND 5's own final reviews each independently found this exact gap — see Task 1).
- **Modify** `catan-3d/src/App.tsx` — migrate all 7 fields' `useState` declarations and every mid-game/reset/restore call site onto the reducer; remove the now-unused `dequeueOne`, `revealTilesForVertex`, and `type BarbarianPillageTarget` imports.
- **Not touched:** `catan-3d/src/game/pendingQueue.ts` (the pre-existing pure-helper file — see the Naming note above), `catan-3d/src/multiplayer/matchSnapshot.ts` (its `MatchSnapshot` interface already carries `progressCardOverLimitPlayerIds?`/`revealedTileIds?` — unchanged), `catan-3d/src/components/hud/GameHud.tsx` (its prop types already match — the alias pattern keeps every prop-passing call site a bare, still-valid identifier), `catan-3d/src/game/knights.ts`/`src/game/hiddenTiles.ts` (only their already-exported `BarbarianPillageTarget`/`revealTilesForVertex` are referenced, and `revealTilesForVertex`'s own file is untouched — only its `App.tsx` import site changes).

---

### Task 1: Create `pendingQueues.ts`/`pendingQueues.test.ts`, wire `gameState.ts` + `gameState.test.ts`

**Files:**
- Create: `catan-3d/src/game/reducers/pendingQueues.ts`
- Create: `catan-3d/src/game/reducers/pendingQueues.test.ts`
- Modify: `catan-3d/src/game/gameState.ts`
- Modify: `catan-3d/src/game/gameState.test.ts`

**Interfaces:**
- Consumes: existing `GameState`/`GameAction`/`reduceGame`/`initialGameState` (`gameState.ts`); `dequeueOne` from `../pendingQueue` (confirmed signature: `dequeueOne<T>(queue: T[], getPlayerId: (entry: T) => number, playerId: number): T[]`, `src/game/pendingQueue.ts:30-33`); `type BarbarianPillageTarget` from `../knights` (confirmed at `src/game/knights.ts:245-248`, same relative path `progress.ts` already uses for `BarbarianAttackResult`).
- Produces: `PendingQueuesState { discardPlayerIds: number[]; scienceFreeResourcePlayerIds: number[]; goldFieldResourcePlayerIds: number[]; pillageQueue: BarbarianPillageTarget[]; winnerDrawQueue: number[]; progressCardOverLimitPlayerIds: number[]; revealedTileIds: Set<string> }`, `initialPendingQueuesState`, `PendingQueuesAction` (17 members — see below), `reducePendingQueues(state, action, fullState)`; `GameState.pendingQueues: PendingQueuesState`; `GameAction` includes `PendingQueuesAction`.

This task is pure reducer-slice construction — nothing in `App.tsx` reads `gameState.pendingQueues.*` yet (Tasks 2/3/4 wire those reads). Zero `App.tsx` changes in this task; the new action union is brand new with zero existing callers, so there is no cross-task compile-safety gap to bridge with a placeholder.

- [ ] **Step 1: Write failing tests for `pendingQueues.ts`**

Create `catan-3d/src/game/reducers/pendingQueues.test.ts`, matching `progress.test.ts`'s exact conventions (plain `describe`/`it`, `reducePendingQueues(state, action, initialGameState)`, `toEqual`/`toBe` reference-identity checks, plus the sibling "action not owned by this reducer" block every existing reducer test file has). One `describe` block per action (17), plus dedicated cases for dequeue ordering, Set-dedupe, duplicate-preservation, the custom pillage accessor, and union-vs-replace on `revealedTileIds`:

```ts
import { describe, expect, it } from 'vitest'
import { reducePendingQueues, initialPendingQueuesState } from './pendingQueues'
import { initialGameState } from '../gameState'
import type { BarbarianPillageTarget } from '../knights'

describe('reducePendingQueues — DISCARD_PLAYERS_SET', () => {
  it('replaces discardPlayerIds with the given array', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'DISCARD_PLAYERS_SET', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result).toEqual({ ...initialPendingQueuesState, discardPlayerIds: [1, 2] })
  })

  it('replaces even when the field already has entries (overwrite, not merge)', () => {
    const dirty = { ...initialPendingQueuesState, discardPlayerIds: [9] }
    const result = reducePendingQueues(dirty, { type: 'DISCARD_PLAYERS_SET', playerIds: [1, 2] }, initialGameState)
    expect(result.discardPlayerIds).toEqual([1, 2])
  })
})

describe('reducePendingQueues — DISCARD_PLAYER_REMOVED', () => {
  it('removes only the matching id, preserves order of the rest', () => {
    const dirty = { ...initialPendingQueuesState, discardPlayerIds: [1, 2, 3] }
    const result = reducePendingQueues(dirty, { type: 'DISCARD_PLAYER_REMOVED', playerId: 2 }, initialGameState)
    expect(result.discardPlayerIds).toEqual([1, 3])
  })

  it('returns the same array reference when the id is not present', () => {
    const dirty = { ...initialPendingQueuesState, discardPlayerIds: [1, 3] }
    const result = reducePendingQueues(dirty, { type: 'DISCARD_PLAYER_REMOVED', playerId: 2 }, initialGameState)
    expect(result.discardPlayerIds).toBe(dirty.discardPlayerIds)
  })
})

describe('reducePendingQueues — SCIENCE_FREE_RESOURCE_PLAYERS_ADDED', () => {
  it('adds new ids to an empty queue', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'SCIENCE_FREE_RESOURCE_PLAYERS_ADDED', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result.scienceFreeResourcePlayerIds).toEqual([1, 2])
  })

  it('dedupes against an already-present id rather than adding a second copy', () => {
    const dirty = { ...initialPendingQueuesState, scienceFreeResourcePlayerIds: [1] }
    const result = reducePendingQueues(
      dirty,
      { type: 'SCIENCE_FREE_RESOURCE_PLAYERS_ADDED', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result.scienceFreeResourcePlayerIds).toEqual([1, 2])
  })
})

describe('reducePendingQueues — SCIENCE_FREE_RESOURCE_PLAYER_REMOVED', () => {
  it('removes only the matching id', () => {
    const dirty = { ...initialPendingQueuesState, scienceFreeResourcePlayerIds: [1, 2] }
    const result = reducePendingQueues(
      dirty,
      { type: 'SCIENCE_FREE_RESOURCE_PLAYER_REMOVED', playerId: 1 },
      initialGameState,
    )
    expect(result.scienceFreeResourcePlayerIds).toEqual([2])
  })
})

describe('reducePendingQueues — SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED', () => {
  it('clears the queue to empty', () => {
    const dirty = { ...initialPendingQueuesState, scienceFreeResourcePlayerIds: [1, 2] }
    const result = reducePendingQueues(dirty, { type: 'SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED' }, initialGameState)
    expect(result.scienceFreeResourcePlayerIds).toEqual([])
  })
})

describe('reducePendingQueues — GOLD_FIELD_RESOURCE_PLAYERS_ADDED', () => {
  it('adds new ids to an empty queue', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'GOLD_FIELD_RESOURCE_PLAYERS_ADDED', playerIds: [1] },
      initialGameState,
    )
    expect(result.goldFieldResourcePlayerIds).toEqual([1])
  })

  it('preserves duplicates — unlike science, the same player id can appear twice (2 Gold Field picks)', () => {
    const dirty = { ...initialPendingQueuesState, goldFieldResourcePlayerIds: [1] }
    const result = reducePendingQueues(
      dirty,
      { type: 'GOLD_FIELD_RESOURCE_PLAYERS_ADDED', playerIds: [1] },
      initialGameState,
    )
    expect(result.goldFieldResourcePlayerIds).toEqual([1, 1])
  })
})

describe('reducePendingQueues — GOLD_FIELD_RESOURCE_PLAYER_REMOVED', () => {
  it('removes only ONE matching entry, leaving a second duplicate in place', () => {
    const dirty = { ...initialPendingQueuesState, goldFieldResourcePlayerIds: [1, 1, 2] }
    const result = reducePendingQueues(
      dirty,
      { type: 'GOLD_FIELD_RESOURCE_PLAYER_REMOVED', playerId: 1 },
      initialGameState,
    )
    expect(result.goldFieldResourcePlayerIds).toEqual([1, 2])
  })
})

describe('reducePendingQueues — GOLD_FIELD_RESOURCE_PLAYERS_CLEARED', () => {
  it('clears the queue to empty', () => {
    const dirty = { ...initialPendingQueuesState, goldFieldResourcePlayerIds: [1, 1] }
    const result = reducePendingQueues(dirty, { type: 'GOLD_FIELD_RESOURCE_PLAYERS_CLEARED' }, initialGameState)
    expect(result.goldFieldResourcePlayerIds).toEqual([])
  })
})

describe('reducePendingQueues — PILLAGE_QUEUE_SET', () => {
  const targets: BarbarianPillageTarget[] = [{ playerId: 1, eligibleCityVertexIds: ['V1', 'V2'] }]

  it('replaces pillageQueue with the given targets', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'PILLAGE_QUEUE_SET', targets },
      initialGameState,
    )
    expect(result.pillageQueue).toEqual(targets)
  })
})

describe('reducePendingQueues — PILLAGE_QUEUE_ENTRY_REMOVED', () => {
  it('removes the entry matching playerId via the custom (t) => t.playerId accessor', () => {
    const dirty = {
      ...initialPendingQueuesState,
      pillageQueue: [
        { playerId: 1, eligibleCityVertexIds: ['V1'] },
        { playerId: 2, eligibleCityVertexIds: ['V2'] },
      ] as BarbarianPillageTarget[],
    }
    const result = reducePendingQueues(dirty, { type: 'PILLAGE_QUEUE_ENTRY_REMOVED', playerId: 1 }, initialGameState)
    expect(result.pillageQueue).toEqual([{ playerId: 2, eligibleCityVertexIds: ['V2'] }])
  })
})

describe('reducePendingQueues — WINNER_DRAW_QUEUE_SET', () => {
  it('replaces winnerDrawQueue with the given player ids', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'WINNER_DRAW_QUEUE_SET', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result.winnerDrawQueue).toEqual([1, 2])
  })
})

describe('reducePendingQueues — WINNER_DRAW_QUEUE_ENTRY_REMOVED', () => {
  it('removes only the matching id', () => {
    const dirty = { ...initialPendingQueuesState, winnerDrawQueue: [1, 2] }
    const result = reducePendingQueues(
      dirty,
      { type: 'WINNER_DRAW_QUEUE_ENTRY_REMOVED', playerId: 1 },
      initialGameState,
    )
    expect(result.winnerDrawQueue).toEqual([2])
  })
})

describe('reducePendingQueues — PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED', () => {
  it('adds new ids to an empty queue', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED', playerIds: [1] },
      initialGameState,
    )
    expect(result.progressCardOverLimitPlayerIds).toEqual([1])
  })

  it('dedupes against an already-present id', () => {
    const dirty = { ...initialPendingQueuesState, progressCardOverLimitPlayerIds: [1] }
    const result = reducePendingQueues(
      dirty,
      { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result.progressCardOverLimitPlayerIds).toEqual([1, 2])
  })
})

describe('reducePendingQueues — PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED', () => {
  it('removes only the matching id', () => {
    const dirty = { ...initialPendingQueuesState, progressCardOverLimitPlayerIds: [1, 2] }
    const result = reducePendingQueues(
      dirty,
      { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED', playerId: 1 },
      initialGameState,
    )
    expect(result.progressCardOverLimitPlayerIds).toEqual([2])
  })
})

describe('reducePendingQueues — PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET', () => {
  it('replaces progressCardOverLimitPlayerIds with the given array (reset/restore only)', () => {
    const dirty = { ...initialPendingQueuesState, progressCardOverLimitPlayerIds: [9] }
    const result = reducePendingQueues(
      dirty,
      { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result.progressCardOverLimitPlayerIds).toEqual([1, 2])
  })
})

describe('reducePendingQueues — TILES_REVEALED', () => {
  it('unions new tile ids into revealedTileIds rather than replacing it', () => {
    const dirty = { ...initialPendingQueuesState, revealedTileIds: new Set(['A1']) }
    const result = reducePendingQueues(dirty, { type: 'TILES_REVEALED', tileIds: ['B2', 'C3'] }, initialGameState)
    expect(result.revealedTileIds).toEqual(new Set(['A1', 'B2', 'C3']))
  })
})

describe('reducePendingQueues — REVEALED_TILES_SET', () => {
  it('replaces revealedTileIds rather than unioning', () => {
    const dirty = { ...initialPendingQueuesState, revealedTileIds: new Set(['A1', 'B2']) }
    const result = reducePendingQueues(dirty, { type: 'REVEALED_TILES_SET', tileIds: ['C3'] }, initialGameState)
    expect(result.revealedTileIds).toEqual(new Set(['C3']))
  })
})

describe('reducePendingQueues — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'RESET_BOARD', robberTileId: 'D1' },
      initialGameState,
    )
    expect(result).toBe(initialPendingQueuesState)
  })
})
```

- [ ] **Step 2: Run the test file to verify it fails**

Run (from `catan-3d/`): `npx vitest run src/game/reducers/pendingQueues.test.ts`
Expected: FAIL — `./pendingQueues` doesn't exist yet (`Cannot find module './pendingQueues'` or equivalent).

- [ ] **Step 3: Implement `pendingQueues.ts`**

Create `catan-3d/src/game/reducers/pendingQueues.ts`:

```ts
import type { GameAction, GameState } from '../gameState'
import { dequeueOne } from '../pendingQueue'
import type { BarbarianPillageTarget } from '../knights'

export interface PendingQueuesState {
  discardPlayerIds: number[]
  scienceFreeResourcePlayerIds: number[]
  goldFieldResourcePlayerIds: number[]
  pillageQueue: BarbarianPillageTarget[]
  winnerDrawQueue: number[]
  progressCardOverLimitPlayerIds: number[]
  revealedTileIds: Set<string>
}

export const initialPendingQueuesState: PendingQueuesState = {
  discardPlayerIds: [],
  scienceFreeResourcePlayerIds: [],
  goldFieldResourcePlayerIds: [],
  pillageQueue: [],
  winnerDrawQueue: [],
  progressCardOverLimitPlayerIds: [],
  revealedTileIds: new Set(),
}

export type PendingQueuesAction =
  | { type: 'DISCARD_PLAYERS_SET'; playerIds: number[] }
  | { type: 'DISCARD_PLAYER_REMOVED'; playerId: number }
  | { type: 'SCIENCE_FREE_RESOURCE_PLAYERS_ADDED'; playerIds: number[] }
  | { type: 'SCIENCE_FREE_RESOURCE_PLAYER_REMOVED'; playerId: number }
  | { type: 'SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED' }
  | { type: 'GOLD_FIELD_RESOURCE_PLAYERS_ADDED'; playerIds: number[] }
  | { type: 'GOLD_FIELD_RESOURCE_PLAYER_REMOVED'; playerId: number }
  | { type: 'GOLD_FIELD_RESOURCE_PLAYERS_CLEARED' }
  | { type: 'PILLAGE_QUEUE_SET'; targets: BarbarianPillageTarget[] }
  | { type: 'PILLAGE_QUEUE_ENTRY_REMOVED'; playerId: number }
  | { type: 'WINNER_DRAW_QUEUE_SET'; playerIds: number[] }
  | { type: 'WINNER_DRAW_QUEUE_ENTRY_REMOVED'; playerId: number }
  | { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED'; playerIds: number[] }
  | { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED'; playerId: number }
  | { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET'; playerIds: number[] }
  | { type: 'TILES_REVEALED'; tileIds: string[] }
  | { type: 'REVEALED_TILES_SET'; tileIds: string[] }

export function reducePendingQueues(state: PendingQueuesState, action: GameAction, _fullState: GameState): PendingQueuesState {
  switch (action.type) {
    case 'DISCARD_PLAYERS_SET':
      return { ...state, discardPlayerIds: action.playerIds }
    case 'DISCARD_PLAYER_REMOVED':
      return { ...state, discardPlayerIds: dequeueOne(state.discardPlayerIds, (id) => id, action.playerId) }
    case 'SCIENCE_FREE_RESOURCE_PLAYERS_ADDED':
      return { ...state, scienceFreeResourcePlayerIds: [...new Set([...state.scienceFreeResourcePlayerIds, ...action.playerIds])] }
    case 'SCIENCE_FREE_RESOURCE_PLAYER_REMOVED':
      return { ...state, scienceFreeResourcePlayerIds: dequeueOne(state.scienceFreeResourcePlayerIds, (id) => id, action.playerId) }
    case 'SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED':
      return { ...state, scienceFreeResourcePlayerIds: [] }
    case 'GOLD_FIELD_RESOURCE_PLAYERS_ADDED':
      return { ...state, goldFieldResourcePlayerIds: [...state.goldFieldResourcePlayerIds, ...action.playerIds] }
    case 'GOLD_FIELD_RESOURCE_PLAYER_REMOVED':
      return { ...state, goldFieldResourcePlayerIds: dequeueOne(state.goldFieldResourcePlayerIds, (id) => id, action.playerId) }
    case 'GOLD_FIELD_RESOURCE_PLAYERS_CLEARED':
      return { ...state, goldFieldResourcePlayerIds: [] }
    case 'PILLAGE_QUEUE_SET':
      return { ...state, pillageQueue: action.targets }
    case 'PILLAGE_QUEUE_ENTRY_REMOVED':
      return { ...state, pillageQueue: dequeueOne(state.pillageQueue, (t) => t.playerId, action.playerId) }
    case 'WINNER_DRAW_QUEUE_SET':
      return { ...state, winnerDrawQueue: action.playerIds }
    case 'WINNER_DRAW_QUEUE_ENTRY_REMOVED':
      return { ...state, winnerDrawQueue: dequeueOne(state.winnerDrawQueue, (id) => id, action.playerId) }
    case 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED':
      return { ...state, progressCardOverLimitPlayerIds: [...new Set([...state.progressCardOverLimitPlayerIds, ...action.playerIds])] }
    case 'PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED':
      return { ...state, progressCardOverLimitPlayerIds: dequeueOne(state.progressCardOverLimitPlayerIds, (id) => id, action.playerId) }
    case 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET':
      return { ...state, progressCardOverLimitPlayerIds: action.playerIds }
    case 'TILES_REVEALED':
      return { ...state, revealedTileIds: new Set([...state.revealedTileIds, ...action.tileIds]) }
    case 'REVEALED_TILES_SET':
      return { ...state, revealedTileIds: new Set(action.tileIds) }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full GameAction
      // union (every slice's actions), not just PendingQueuesAction, so most
      // of that union — including every board-only/players-only/turn-only/
      // progress-only/decks-only/trophies-only action — is legitimately
      // unhandled here. reducePendingQueues only owns the 17 dedicated cases
      // above.
      return state
  }
}
```

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run src/game/reducers/pendingQueues.test.ts`
Expected: PASS (17 `describe` blocks, ~20 tests).

- [ ] **Step 5: Wire `pendingQueues` into `gameState.ts`**

Read `catan-3d/src/game/gameState.ts` first (confirm nothing has drifted from what's quoted here — it currently composes `board`/`players`/`turn`/`progress`/`decks`/`trophies`). Replace its full contents:

```ts
import { reduceBoard, initialBoardState, type BoardState, type BoardAction } from './reducers/board'
import { reducePlayers, type PlayersAction } from './reducers/players'
import { reduceTurn, initialTurnState, type TurnState, type TurnAction } from './reducers/turn'
import { reduceProgress, initialProgressState, type ProgressState, type ProgressAction } from './reducers/progress'
import { reduceDecks, initialDecksState, type DecksState, type DecksAction } from './reducers/decks'
import { reduceTrophies, initialTrophiesState, type TrophiesState, type TrophiesAction } from './reducers/trophies'
import { reducePendingQueues, initialPendingQueuesState, type PendingQueuesState, type PendingQueuesAction } from './reducers/pendingQueues'
import { createInitialPlayers, type Player } from './types'

export interface GameState {
  board: BoardState
  players: Player[]
  turn: TurnState
  progress: ProgressState
  decks: DecksState
  trophies: TrophiesState
  pendingQueues: PendingQueuesState
}

export const initialGameState: GameState = {
  board: initialBoardState,
  // Matches the default the old `useState(() => createInitialPlayers(3))`
  // used to seed with, before a real game (resetGame) replaces it.
  players: createInitialPlayers(3),
  turn: initialTurnState,
  progress: initialProgressState,
  decks: initialDecksState,
  trophies: initialTrophiesState,
  pendingQueues: initialPendingQueuesState,
}

export type GameAction = BoardAction | PlayersAction | TurnAction | ProgressAction | DecksAction | TrophiesAction | PendingQueuesAction

export function reduceGame(state: GameState, action: GameAction): GameState {
  return {
    board: reduceBoard(state.board, action, state),
    players: reducePlayers(state.players, action, state),
    turn: reduceTurn(state.turn, action, state),
    progress: reduceProgress(state.progress, action, state),
    decks: reduceDecks(state.decks, action, state),
    trophies: reduceTrophies(state.trophies, action, state),
    pendingQueues: reducePendingQueues(state.pendingQueues, action, state),
  }
}
```

- [ ] **Step 6: Add the required `gameState.test.ts` routing test**

This step exists because Sub-plan 3's, 4's, AND 5's own final whole-branch reviews each independently found the same gap: a newly-added slice's own `reduceGame` composition line shipped with zero direct routing-level test coverage in `game/gameState.test.ts`, even though the new reducer file itself was exhaustively tested in isolation — a real, silent, type-safe regression risk (a regression to `pendingQueues: state.pendingQueues` would pass every other test). This must not happen a fourth time.

Read `catan-3d/src/game/gameState.test.ts` first (confirm nothing has drifted — it currently has one routing test per existing slice, e.g. `'routes a trophies action through reduceTrophies'`, each asserting the routed slice updated AND an unrelated slice — `result.board` — kept its reference). Insert 1 new test, matching that exact style, right before the existing `'does not mutate the input state'` test at the end:

Find:
```ts
  it('routes a trophies action through reduceTrophies', () => {
    const result = reduceGame(initialGameState, { type: 'LONGEST_ROAD_HOLDER_SET', playerId: 2 })
    expect(result.trophies.longestRoadHolderId).toBe(2)
    expect(result.board).toBe(initialGameState.board)
  })

  it('does not mutate the input state', () => {
```

Replace:
```ts
  it('routes a trophies action through reduceTrophies', () => {
    const result = reduceGame(initialGameState, { type: 'LONGEST_ROAD_HOLDER_SET', playerId: 2 })
    expect(result.trophies.longestRoadHolderId).toBe(2)
    expect(result.board).toBe(initialGameState.board)
  })

  it('routes a pendingQueues action through reducePendingQueues', () => {
    const result = reduceGame(initialGameState, { type: 'DISCARD_PLAYERS_SET', playerIds: [1, 2] })
    expect(result.pendingQueues.discardPlayerIds).toEqual([1, 2])
    expect(result.board).toBe(initialGameState.board)
  })

  it('does not mutate the input state', () => {
```

- [ ] **Step 7: Run the full reducer test suite**

Run: `npx vitest run src/game`
Expected: PASS — `pendingQueues.test.ts`, `gameState.test.ts`, and every other pre-existing `src/game/**/*.test.ts` all green.

- [ ] **Step 8: Typecheck**

Run: `npx tsc -p tsconfig.app.json`
Expected: clean, no errors. (Nothing in `App.tsx` references `gameState.pendingQueues` yet, and no pre-existing action's payload was widened, so there is nothing for this task to break.)

- [ ] **Step 9: Build**

Run (from `catan-3d/`): `npm run build`
Expected: succeeds.

- [ ] **Step 10: Commit**

```bash
git add src/game/reducers/pendingQueues.ts src/game/reducers/pendingQueues.test.ts src/game/gameState.ts src/game/gameState.test.ts
git commit -m "feat: add PendingQueuesState reducer slice"
```

---

### Task 2: Migrate `discardPlayerIds` + `scienceFreeResourcePlayerIds` + `goldFieldResourcePlayerIds`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `PendingQueuesState.discardPlayerIds`/`scienceFreeResourcePlayerIds`/`goldFieldResourcePlayerIds`; `DISCARD_PLAYERS_SET`/`DISCARD_PLAYER_REMOVED`/`SCIENCE_FREE_RESOURCE_PLAYERS_ADDED`/`SCIENCE_FREE_RESOURCE_PLAYER_REMOVED`/`SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED`/`GOLD_FIELD_RESOURCE_PLAYERS_ADDED`/`GOLD_FIELD_RESOURCE_PLAYER_REMOVED`/`GOLD_FIELD_RESOURCE_PLAYERS_CLEARED` (all from Task 1).
- Produces: `gameState.pendingQueues.discardPlayerIds`/`scienceFreeResourcePlayerIds`/`goldFieldResourcePlayerIds` as the live source of truth in `App.tsx` — local `useState` for these 3 fields fully removed. `dequeueOne` remains imported (still used by `pillageQueue`/`winnerDrawQueue`/`progressCardOverLimitPlayerIds`'s own dequeue sites — Tasks 3/4 — do NOT touch the `game/pendingQueue` import line in this task).

`App.tsx` has no dedicated test file (confirmed precedent — same deviation rationale the spec's own "Deviation, Sub-plan 1" note gives). This task's verification is `npx tsc -p tsconfig.app.json` + the full existing Vitest suite (which already covers Task 1's new reducer cases) + `npm run build`.

- [ ] **Step 1: `discardPlayerIds` declaration**

Read `App.tsx:515-520` first to confirm nothing has drifted.

Find:
```tsx
  const [discardPlayerIds, setDiscardPlayerIds] = useState<number[]>([])
```

Replace:
```tsx
  const discardPlayerIds = gameState.pendingQueues.discardPlayerIds
```

- [ ] **Step 2: `scienceFreeResourcePlayerIds` declaration**

Read `App.tsx:531-539` first.

Find:
```tsx
  const [scienceFreeResourcePlayerIds, setScienceFreeResourcePlayerIds] = useState<number[]>([])
```

Replace:
```tsx
  const scienceFreeResourcePlayerIds = gameState.pendingQueues.scienceFreeResourcePlayerIds
```

- [ ] **Step 3: `goldFieldResourcePlayerIds` declaration**

Read `App.tsx:540-548` first.

Find:
```tsx
  const [goldFieldResourcePlayerIds, setGoldFieldResourcePlayerIds] = useState<number[]>([])
```

Replace:
```tsx
  const goldFieldResourcePlayerIds = gameState.pendingQueues.goldFieldResourcePlayerIds
```

- [ ] **Step 4: `applyDiscard` — dequeue on confirmed discard**

Read `App.tsx:1333-1351` first. **This is the one site with a real deviation from a same-session shorthand claim that "both lines are deleted" — see Global Constraints point 5.** `remaining` is read again on the very next line (`debugLog`) and again several lines down (`if (remaining.length === 0)`, gating the phase-transition dispatch) — it stays as a pure local computation. ONLY the `setDiscardPlayerIds(remaining)` state-mutation line converts.

Find:
```tsx
  const applyDiscard = (playerId: number, counts: Partial<Record<ResourceType | CommodityType, number>>) => {
    dispatch({ type: 'DISCARD_CONFIRMED', playerId, counts })
    const remaining = dequeueOne(discardPlayerIds, (id) => id, playerId)
    setDiscardPlayerIds(remaining)
    debugLog('applyDiscard', { playerId, counts, discardPlayerIdsBefore: discardPlayerIds, remaining })
```

Replace:
```tsx
  const applyDiscard = (playerId: number, counts: Partial<Record<ResourceType | CommodityType, number>>) => {
    dispatch({ type: 'DISCARD_CONFIRMED', playerId, counts })
    const remaining = dequeueOne(discardPlayerIds, (id) => id, playerId)
    dispatch({ type: 'DISCARD_PLAYER_REMOVED', playerId })
    debugLog('applyDiscard', { playerId, counts, discardPlayerIdsBefore: discardPlayerIds, remaining })
```

- [ ] **Step 5: `applyScienceFreeResourcePick` — dequeue**

Read `App.tsx:1370-1373` first. Unlike `applyDiscard`, this function's dequeue line is its LAST statement — no trailing read to preserve.

Find:
```tsx
  const applyScienceFreeResourcePick = (playerId: number, resource: ResourceType) => {
    dispatch({ type: 'SCIENCE_FREE_RESOURCE_PICKED', playerId, resource })
    setScienceFreeResourcePlayerIds((prev) => dequeueOne(prev, (id) => id, playerId))
  }
```

Replace:
```tsx
  const applyScienceFreeResourcePick = (playerId: number, resource: ResourceType) => {
    dispatch({ type: 'SCIENCE_FREE_RESOURCE_PICKED', playerId, resource })
    dispatch({ type: 'SCIENCE_FREE_RESOURCE_PLAYER_REMOVED', playerId })
  }
```

- [ ] **Step 6: `applyGoldFieldResourcePick` — dequeue**

Read `App.tsx:1383-1386` first. Same shape as Step 5 — the dequeue line is the function's last statement.

Find:
```tsx
  const applyGoldFieldResourcePick = (playerId: number, resource: ResourceType) => {
    dispatch({ type: 'GOLD_FIELD_RESOURCE_PICKED', playerId, resource })
    setGoldFieldResourcePlayerIds((prev) => dequeueOne(prev, (id) => id, playerId))
  }
```

Replace:
```tsx
  const applyGoldFieldResourcePick = (playerId: number, resource: ResourceType) => {
    dispatch({ type: 'GOLD_FIELD_RESOURCE_PICKED', playerId, resource })
    dispatch({ type: 'GOLD_FIELD_RESOURCE_PLAYER_REMOVED', playerId })
  }
```

- [ ] **Step 7: `applyRollResult` — discard population on a 7**

Read `App.tsx:3576-3580` first.

Find:
```tsx
        if (overLimitIds.length > 0) {
          setDiscardPlayerIds(overLimitIds)
          setDiscardSelection([])
```

Replace:
```tsx
        if (overLimitIds.length > 0) {
          dispatch({ type: 'DISCARD_PLAYERS_SET', playerIds: overLimitIds })
          setDiscardSelection([])
```

- [ ] **Step 8: `applyRollResult` — Gold Field population**

Read `App.tsx:3656-3657` first.

Find:
```tsx
    if (goldFieldPicks.length > 0) {
      setGoldFieldResourcePlayerIds((prev) => [...prev, ...goldFieldPicks.map((pick) => pick.playerId)])
```

Replace:
```tsx
    if (goldFieldPicks.length > 0) {
      dispatch({ type: 'GOLD_FIELD_RESOURCE_PLAYERS_ADDED', playerIds: goldFieldPicks.map((pick) => pick.playerId) })
```

- [ ] **Step 9: `applyRollResult` — Science free-resource population**

Read `App.tsx:3689-3691` first.

Find:
```tsx
      if (eligiblePlayerIds.length > 0) {
        setScienceFreeResourcePlayerIds((prev) => [...new Set([...prev, ...eligiblePlayerIds])])
      }
```

Replace:
```tsx
      if (eligiblePlayerIds.length > 0) {
        dispatch({ type: 'SCIENCE_FREE_RESOURCE_PLAYERS_ADDED', playerIds: eligiblePlayerIds })
      }
```

- [ ] **Step 10: `resetGame` — clear all 3 queues**

Read `App.tsx:6434-6438` first.

Find:
```tsx
    setDiscardPlayerIds([])
    setDiscardSelection([])
    setProgressDiscardSelection([])
    setScienceFreeResourcePlayerIds([])
    setGoldFieldResourcePlayerIds([])
```

Replace:
```tsx
    dispatch({ type: 'DISCARD_PLAYERS_SET', playerIds: [] })
    setDiscardSelection([])
    setProgressDiscardSelection([])
    dispatch({ type: 'SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED' })
    dispatch({ type: 'GOLD_FIELD_RESOURCE_PLAYERS_CLEARED' })
```

- [ ] **Step 11: `restoreFromSnapshot` — clear Science/Gold Field (never persisted, dropped unconditionally)**

Read `App.tsx:6762-6771` first.

Find:
```tsx
    setProgressDiscardSelection([])
    // Unlike discardPlayerIds (recomputed below from restored resource
    // counts), Science level 3's queue isn't derivable after the fact — it
    // depends on THIS PARTICULAR roll's production, not any persistent
    // condition of current state. A pending free-resource pick from before
    // a disconnect is simply dropped on reconnect rather than reconstructed.
    setScienceFreeResourcePlayerIds([])
    // Same treatment as scienceFreeResourcePlayerIds above — not persisted,
    // not derivable from restored state, simply dropped on reconnect.
    setGoldFieldResourcePlayerIds([])
```

Replace:
```tsx
    setProgressDiscardSelection([])
    // Unlike discardPlayerIds (recomputed below from restored resource
    // counts), Science level 3's queue isn't derivable after the fact — it
    // depends on THIS PARTICULAR roll's production, not any persistent
    // condition of current state. A pending free-resource pick from before
    // a disconnect is simply dropped on reconnect rather than reconstructed.
    dispatch({ type: 'SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED' })
    // Same treatment as scienceFreeResourcePlayerIds above — not persisted,
    // not derivable from restored state, simply dropped on reconnect.
    dispatch({ type: 'GOLD_FIELD_RESOURCE_PLAYERS_CLEARED' })
```

- [ ] **Step 12: `restoreFromSnapshot` — recompute `discardPlayerIds`**

Read `App.tsx:6772-6789` first.

Find:
```tsx
    const restoredRules = snapshot.gameRules ?? DEFAULT_GAME_RULES
    setDiscardPlayerIds(
      snapshot.gamePhase === 'discard'
        ? normalizedPlayers
            .filter(
              (p) =>
                discardHandSize(p.resources, p.commodities, restoredRules.citiesAndKnightsCommodities) >
                discardThreshold(restoredRules.citiesAndKnightsKnights ? p.cityWalls.length : 0),
            )
            .map((p) => p.id)
        : [],
    )
```

Replace:
```tsx
    const restoredRules = snapshot.gameRules ?? DEFAULT_GAME_RULES
    dispatch({
      type: 'DISCARD_PLAYERS_SET',
      playerIds:
        snapshot.gamePhase === 'discard'
          ? normalizedPlayers
              .filter(
                (p) =>
                  discardHandSize(p.resources, p.commodities, restoredRules.citiesAndKnightsCommodities) >
                  discardThreshold(restoredRules.citiesAndKnightsKnights ? p.cityWalls.length : 0),
              )
              .map((p) => p.id)
          : [],
    })
```

- [ ] **Step 13: Typecheck**

Run: `npx tsc -p tsconfig.app.json`
Expected: clean, no errors.

- [ ] **Step 14: Run the full test suite**

Run: `npm test`
Expected: PASS — no regressions in any pre-existing test file.

- [ ] **Step 15: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 16: Commit**

```bash
git add src/App.tsx
git commit -m "feat: migrate discardPlayerIds/scienceFreeResourcePlayerIds/goldFieldResourcePlayerIds to PendingQueuesState"
```

---

### Task 3: Migrate `pillageQueue` + `winnerDrawQueue`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `PendingQueuesState.pillageQueue`/`winnerDrawQueue`; `PILLAGE_QUEUE_SET`/`PILLAGE_QUEUE_ENTRY_REMOVED`/`WINNER_DRAW_QUEUE_SET`/`WINNER_DRAW_QUEUE_ENTRY_REMOVED` (all from Task 1).
- Produces: `gameState.pendingQueues.pillageQueue`/`winnerDrawQueue` as the live source of truth in `App.tsx` — local `useState` for these 2 fields fully removed. `type BarbarianPillageTarget` import removed (its only remaining `App.tsx` usage was the `pillageQueue` `useState` type annotation this task deletes). `dequeueOne` remains imported (still used by `progressCardOverLimitPlayerIds`'s dequeue site — Task 4 — do NOT touch the `game/pendingQueue` import line in this task).

Same verification approach as Task 2: `npx tsc -p tsconfig.app.json` + the full existing Vitest suite + `npm run build`.

- [ ] **Step 1: `pillageQueue`/`winnerDrawQueue` declarations**

Read `App.tsx:587-594` first.

Find:
```tsx
  const activeBarbarianAttack = gameState.progress.activeBarbarianAttack
  const [pillageQueue, setPillageQueue] = useState<BarbarianPillageTarget[]>([])
  const [winnerDrawQueue, setWinnerDrawQueue] = useState<number[]>([]) // player ids, tied winners only
```

Replace:
```tsx
  const activeBarbarianAttack = gameState.progress.activeBarbarianAttack
  const pillageQueue = gameState.pendingQueues.pillageQueue
  const winnerDrawQueue = gameState.pendingQueues.winnerDrawQueue // player ids, tied winners only
```

- [ ] **Step 2: Remove the now-unused `BarbarianPillageTarget` type import**

Read `App.tsx:106-121` first. Confirm via grep (`grep -n "BarbarianPillageTarget" src/App.tsx`) that Step 1 left zero remaining references before deleting this — `noUnusedLocals: true` fails the build otherwise.

Find:
```tsx
import {
  canActivateKnight,
  canBuildCityWall,
  canPromoteKnight,
  canRecruitKnight,
  knightDisplaceTargets,
  knightMoveTargets,
  nextKnightStrength,
  reachableOpponentKnights,
  recruitableVertices,
  resolveBarbarianAttack,
  selectSmithingPromotions,
  BARBARIAN_TRACK_LENGTH,
  type BarbarianAttackResult,
  type BarbarianPillageTarget,
} from './game/knights'
```

Replace:
```tsx
import {
  canActivateKnight,
  canBuildCityWall,
  canPromoteKnight,
  canRecruitKnight,
  knightDisplaceTargets,
  knightMoveTargets,
  nextKnightStrength,
  reachableOpponentKnights,
  recruitableVertices,
  resolveBarbarianAttack,
  selectSmithingPromotions,
  BARBARIAN_TRACK_LENGTH,
  type BarbarianAttackResult,
} from './game/knights'
```

- [ ] **Step 3: `applyPillage` — dequeue**

Read `App.tsx:1404-1424` first. This is the function's last statement before its closing brace — no trailing read to preserve.

Find:
```tsx
    setPillageQueue((prev) => dequeueOne(prev, (t) => t.playerId, playerId))
```

Replace:
```tsx
    dispatch({ type: 'PILLAGE_QUEUE_ENTRY_REMOVED', playerId })
```

- [ ] **Step 4: `applyBarbarianWinnerDraw` — dequeue**

Read `App.tsx:1439-1445` first.

Find:
```tsx
  const applyBarbarianWinnerDraw = (playerId: number, card: ProgressCardType) => {
    dispatch({ type: 'PROGRESS_CARDS_DRAWN', draws: [{ playerId, card }] })
    // Filtered by playerId, not sliced off the front — same reasoning as
    // applyPillage above: online, tied winners resolve independently in
    // whatever order they each act, not queue order.
    setWinnerDrawQueue((prev) => dequeueOne(prev, (id) => id, playerId))
  }
```

Replace:
```tsx
  const applyBarbarianWinnerDraw = (playerId: number, card: ProgressCardType) => {
    dispatch({ type: 'PROGRESS_CARDS_DRAWN', draws: [{ playerId, card }] })
    // Filtered by playerId, not sliced off the front — same reasoning as
    // applyPillage above: online, tied winners resolve independently in
    // whatever order they each act, not queue order.
    dispatch({ type: 'WINNER_DRAW_QUEUE_ENTRY_REMOVED', playerId })
  }
```

- [ ] **Step 5: `applyBarbarianAttackResult` — population**

Read `App.tsx:3308-3319` first.

Find:
```tsx
  const applyBarbarianAttackResult = (result: BarbarianAttackResult) => {
    dispatch({ type: 'BARBARIAN_ATTACK_SET', result })
    setPillageQueue(result.pillageTargets)
    if (result.defendersWin) {
      const soleWinner = result.winners.find((w) => !w.tied)
      if (soleWinner) {
        dispatch({ type: 'DEFENDER_OF_CATAN_AWARDED', playerId: soleWinner.playerId })
        const winnerPlayer = playerById.get(soleWinner.playerId)
        if (winnerPlayer) inform(`${winnerPlayer.name} is the Defender of Catan! +1 VP.`)
      } else if (gameRules.citiesAndKnightsProgressCards) {
        setWinnerDrawQueue(result.winners.map((w) => w.playerId))
      }
```

Replace:
```tsx
  const applyBarbarianAttackResult = (result: BarbarianAttackResult) => {
    dispatch({ type: 'BARBARIAN_ATTACK_SET', result })
    dispatch({ type: 'PILLAGE_QUEUE_SET', targets: result.pillageTargets })
    if (result.defendersWin) {
      const soleWinner = result.winners.find((w) => !w.tied)
      if (soleWinner) {
        dispatch({ type: 'DEFENDER_OF_CATAN_AWARDED', playerId: soleWinner.playerId })
        const winnerPlayer = playerById.get(soleWinner.playerId)
        if (winnerPlayer) inform(`${winnerPlayer.name} is the Defender of Catan! +1 VP.`)
      } else if (gameRules.citiesAndKnightsProgressCards) {
        dispatch({ type: 'WINNER_DRAW_QUEUE_SET', playerIds: result.winners.map((w) => w.playerId) })
      }
```

- [ ] **Step 6: Winner-draw timeout `useEffect` — empty-deck edge-case dequeue**

Read `App.tsx:3929-3952` first. This is the SECOND, separate call site for `WINNER_DRAW_QUEUE_ENTRY_REMOVED` (the first was Step 4's `applyBarbarianWinnerDraw`) — it bypasses that function entirely when every progress-card deck is empty. Only the loop-internal `setWinnerDrawQueue` line converts; the surrounding loop structure (matching Sub-plan 5's own binding constraint on preserving this timeout effect's loop shape) is untouched.

Find:
```tsx
      const decks = { ...progressCardDecks }
      for (const playerId of winnerDrawQueue) {
        const track = IMPROVEMENT_TRACK_ORDER.find((t) => decks[t].length > 0)
        if (!track) {
          setWinnerDrawQueue((prev) => dequeueOne(prev, (id) => id, playerId))
          continue
        }
```

Replace:
```tsx
      const decks = { ...progressCardDecks }
      for (const playerId of winnerDrawQueue) {
        const track = IMPROVEMENT_TRACK_ORDER.find((t) => decks[t].length > 0)
        if (!track) {
          dispatch({ type: 'WINNER_DRAW_QUEUE_ENTRY_REMOVED', playerId })
          continue
        }
```

- [ ] **Step 7: `resetGame` — barbarian-attack adjacency cluster**

Read `App.tsx:6519-6528` first. **Adjacency risk:** `setPillageQueue([])`/`setWinnerDrawQueue([])` sit directly between `dispatch({ type: 'BARBARIAN_ATTACK_SET', result: null })` (already-migrated Sub-plan 4 state — already a `dispatch` call, unrelated to this task, stays exactly as-is) and `resolvedPillageVertexIdsRef.current.clear()` (a `useRef`, not reducer state, out of scope). Convert ONLY the two `setPillageQueue`/`setWinnerDrawQueue` lines.

Find:
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
    dispatch({ type: 'GAME_PHASE_SET', phase: 'setup' })
```

Replace:
```tsx
    // Cities & Knights barbarian attack (Task 5) — same "always reset on a
    // fresh game" treatment as robberActive/barbarianTrackPosition above: a
    // leftover attack result or pending pillage/draw queue from a PREVIOUS
    // match would otherwise pop the attack modal (or strand a queue entry
    // no current player can ever clear) the instant the new game starts.
    dispatch({ type: 'BARBARIAN_ATTACK_SET', result: null })
    dispatch({ type: 'PILLAGE_QUEUE_SET', targets: [] })
    resolvedPillageVertexIdsRef.current.clear()
    dispatch({ type: 'WINNER_DRAW_QUEUE_SET', playerIds: [] })
    dispatch({ type: 'GAME_PHASE_SET', phase: 'setup' })
```

- [ ] **Step 8: `restoreFromSnapshot` — the SAME adjacency cluster, a second site**

Read `App.tsx:6717-6735` first. Identical 4-line shape to Step 7 (same `BARBARIAN_ATTACK_SET`/`resolvedPillageVertexIdsRef` neighbors, same "out of scope, don't touch" treatment), at a different function — the surrounding comment text (below) is what distinguishes this site from Step 7's, so match on the full block including comments to avoid editing the wrong occurrence.

Find:
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
    // Cities & Knights Intrigue/Treason — same "always reset on restore"
```

Replace:
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
    dispatch({ type: 'PILLAGE_QUEUE_SET', targets: [] })
    resolvedPillageVertexIdsRef.current.clear()
    dispatch({ type: 'WINNER_DRAW_QUEUE_SET', playerIds: [] })
    // Cities & Knights Intrigue/Treason — same "always reset on restore"
```

- [ ] **Step 9: Typecheck**

Run: `npx tsc -p tsconfig.app.json`
Expected: clean, no errors.

- [ ] **Step 10: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 11: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 12: Commit**

```bash
git add src/App.tsx
git commit -m "feat: migrate pillageQueue/winnerDrawQueue to PendingQueuesState"
```

---

### Task 4: Migrate `progressCardOverLimitPlayerIds` + `revealedTileIds`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `PendingQueuesState.progressCardOverLimitPlayerIds`/`revealedTileIds`; `PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED`/`PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED`/`PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET`/`TILES_REVEALED`/`REVEALED_TILES_SET` (all from Task 1).
- Produces: `gameState.pendingQueues.progressCardOverLimitPlayerIds`/`revealedTileIds` as the live source of truth in `App.tsx` — local `useState` for these 2 fields fully removed. This is the LAST task draining both `dequeueOne` (progressCardOverLimitPlayerIds's dequeue was its final remaining `App.tsx` usage) and `revealTilesForVertex` (its only usage) to zero references — both imports are cleaned up in this task's final steps.

Same verification approach as Tasks 2/3: `npx tsc -p tsconfig.app.json` + the full existing Vitest suite + `npm run build`.

- [ ] **Step 1: `revealedTileIds` declaration**

Read `App.tsx:333-338` first.

Find:
```tsx
  const [revealedTileIds, setRevealedTileIds] = useState<Set<string>>(new Set())
```

Replace:
```tsx
  const revealedTileIds = gameState.pendingQueues.revealedTileIds
```

- [ ] **Step 2: `progressCardOverLimitPlayerIds` declaration**

Read `App.tsx:380-386` first.

Find:
```tsx
  const [progressCardOverLimitPlayerIds, setProgressCardOverLimitPlayerIds] = useState<number[]>([])
```

Replace:
```tsx
  const progressCardOverLimitPlayerIds = gameState.pendingQueues.progressCardOverLimitPlayerIds
```

- [ ] **Step 3: `applyProgressDiscard` — dequeue**

Read `App.tsx:1361-1364` first. This is the function's last statement before its closing brace.

Find:
```tsx
  const applyProgressDiscard = (playerId: number, indices: number[]) => {
    dispatch({ type: 'PROGRESS_DISCARD_CONFIRMED', playerId, indices })
    setProgressCardOverLimitPlayerIds((prev) => dequeueOne(prev, (id) => id, playerId))
  }
```

Replace:
```tsx
  const applyProgressDiscard = (playerId: number, indices: number[]) => {
    dispatch({ type: 'PROGRESS_DISCARD_CONFIRMED', playerId, indices })
    dispatch({ type: 'PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED', playerId })
  }
```

- [ ] **Step 4: `applyProgressCardDraws` — population**

Read `App.tsx:1469-1511` first (the full function — `overLimitIds`'s computation and the `if (overLimitIds.length === 0) return` guard both stay unchanged; only the trailing `setProgressCardOverLimitPlayerIds` block converts).

Find:
```tsx
    debugLog('applyProgressCardDraws', { draws, overLimitIdsBefore: progressCardOverLimitPlayerIds, overLimitIds })
    // Nobody over the limit is now the COMMON case, not the exception, so
    // keep the previous array's identity in that case — the hand-limit
    // timeout effect below keys on this state's identity, and handing it a
    // fresh (still empty) array every roll would restart that timer for no
    // reason.
    if (overLimitIds.length === 0) return
    setProgressCardOverLimitPlayerIds((prev) => {
      const next = [...new Set([...prev, ...overLimitIds])]
      return next
    })
  }
```

Replace:
```tsx
    debugLog('applyProgressCardDraws', { draws, overLimitIdsBefore: progressCardOverLimitPlayerIds, overLimitIds })
    // Nobody over the limit is now the COMMON case, not the exception, so
    // keep the previous array's identity in that case — the hand-limit
    // timeout effect below keys on this state's identity, and handing it a
    // fresh (still empty) array every roll would restart that timer for no
    // reason.
    if (overLimitIds.length === 0) return
    dispatch({ type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED', playerIds: overLimitIds })
  }
```

- [ ] **Step 5: `applySettlementPlacement` — `TILES_REVEALED`**

Read `App.tsx:961-963` first. `graph.vertexTileIds` is confirmed a `Map<string, string[]>` (`src/data/boardGraph.ts:26`) — `.get(vertexId) ?? []` at the dispatch site reproduces exactly what `revealTilesForVertex` computed internally as `touchedTiles`, with zero dependency on the current `revealedTileIds` value (verified this session by reading `src/game/hiddenTiles.ts:27-36` — see Data Model section above).

Find:
```tsx
  const applySettlementPlacement = (vertexId: string, playerId: number, isSetup: boolean, isDeciding: boolean) => {
    dispatchGameAction({ type: 'BUILD_SETTLEMENT', vertexId, playerId, isSetup }, isDeciding)
    setRevealedTileIds((prev) => revealTilesForVertex(prev, vertexId, graph.vertexTileIds))
```

Replace:
```tsx
  const applySettlementPlacement = (vertexId: string, playerId: number, isSetup: boolean, isDeciding: boolean) => {
    dispatchGameAction({ type: 'BUILD_SETTLEMENT', vertexId, playerId, isSetup }, isDeciding)
    const tileIds = graph.vertexTileIds.get(vertexId) ?? []
    dispatch({ type: 'TILES_REVEALED', tileIds })
```

- [ ] **Step 6: `resetGame` — clear `revealedTileIds` and `progressCardOverLimitPlayerIds`**

Read `App.tsx:6419-6427` first (two separate lines, several dispatches apart — both included here for anchoring context; only the `setRevealedTileIds`/`setProgressCardOverLimitPlayerIds` lines change).

Find:
```tsx
    dispatch({ type: 'RESET_BOARD', robberTileId: (desertTile ?? freshTiles[0]).id })
    setRevealedTileIds(new Set())
    setBanner(null)
    dispatch({ type: 'DEV_DECK_SET', deck: shuffle(buildDevCardDeck(effectiveRules.victoryPointTarget)) })
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'science', deck: buildProgressCardDeck('science') })
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'trade', deck: buildProgressCardDeck('trade') })
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'politics', deck: buildProgressCardDeck('politics') })
    setProgressCardOverLimitPlayerIds([])
```

Replace:
```tsx
    dispatch({ type: 'RESET_BOARD', robberTileId: (desertTile ?? freshTiles[0]).id })
    dispatch({ type: 'REVEALED_TILES_SET', tileIds: [] })
    setBanner(null)
    dispatch({ type: 'DEV_DECK_SET', deck: shuffle(buildDevCardDeck(effectiveRules.victoryPointTarget)) })
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'science', deck: buildProgressCardDeck('science') })
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'trade', deck: buildProgressCardDeck('trade') })
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'politics', deck: buildProgressCardDeck('politics') })
    dispatch({ type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET', playerIds: [] })
```

- [ ] **Step 7: `restoreFromSnapshot` — `revealedTileIds`**

Read `App.tsx:6550-6553` first.

Find:
```tsx
    setGameRules(snapshot.gameRules ?? DEFAULT_GAME_RULES)
    setRevealedTileIds(new Set(snapshot.revealedTileIds ?? []))
```

Replace:
```tsx
    setGameRules(snapshot.gameRules ?? DEFAULT_GAME_RULES)
    dispatch({ type: 'REVEALED_TILES_SET', tileIds: snapshot.revealedTileIds ?? [] })
```

- [ ] **Step 8: `restoreFromSnapshot` — `progressCardOverLimitPlayerIds` (the one genuine restored value)**

Read `App.tsx:6739-6747` first. The `?? []` fallback must be preserved exactly — this is the one queue among all 7 where it matters (the other 5 array-typed queues are unconditionally cleared on restore, never restored from the snapshot at all).

Find:
```tsx
    // Progress-card hand-limit queue — unlike discardPlayerIds (recomputed
    // below from restored resource counts) this genuinely IS a persisted
    // MatchSnapshot field, so it's restored directly rather than re-derived.
    // `?? []` covers any snapshot saved before this feature existed.
    // progressDiscardSelection is local UI state, same "always reset on
    // restore" treatment as discardSelection just above — a stale set of
    // indices could otherwise point at the wrong cards in a freshly
    // restored progressCards array.
    setProgressCardOverLimitPlayerIds(snapshot.progressCardOverLimitPlayerIds ?? [])
```

Replace:
```tsx
    // Progress-card hand-limit queue — unlike discardPlayerIds (recomputed
    // below from restored resource counts) this genuinely IS a persisted
    // MatchSnapshot field, so it's restored directly rather than re-derived.
    // `?? []` covers any snapshot saved before this feature existed.
    // progressDiscardSelection is local UI state, same "always reset on
    // restore" treatment as discardSelection just above — a stale set of
    // indices could otherwise point at the wrong cards in a freshly
    // restored progressCards array.
    dispatch({ type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET', playerIds: snapshot.progressCardOverLimitPlayerIds ?? [] })
```

- [ ] **Step 9: Remove the now-unused `revealTilesForVertex` import**

Read `App.tsx:39` first. Confirm via grep (`grep -n "revealTilesForVertex" src/App.tsx`) that Step 5 left zero remaining references before deleting this line entirely.

Find:
```tsx
import { revealTilesForVertex } from './game/hiddenTiles'
```

Replace: (delete this line entirely — no replacement)

- [ ] **Step 10: Remove the now-unused `dequeueOne` import**

Read `App.tsx:105` first. Confirm via grep (`grep -n "dequeueOne" src/App.tsx`) that Steps 3–6 of Task 2, Steps 3–4/6 of Task 3, and Step 3 of this task together left zero remaining `dequeueOne` references before this edit — `activeQueueEntry` still has 6 unrelated READ-site usages and MUST stay.

Find:
```tsx
import { activeQueueEntry, dequeueOne } from './game/pendingQueue'
```

Replace:
```tsx
import { activeQueueEntry } from './game/pendingQueue'
```

- [ ] **Step 11: Typecheck**

Run: `npx tsc -p tsconfig.app.json`
Expected: clean, no errors. (This is the step that would catch a missed `dequeueOne`/`revealTilesForVertex` reference as an unused-import failure, or a stray one as an undefined-symbol failure.)

- [ ] **Step 12: Run the full test suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 13: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 14: Commit**

```bash
git add src/App.tsx
git commit -m "feat: migrate progressCardOverLimitPlayerIds/revealedTileIds to PendingQueuesState"
```

---

## Self-Review Notes

Performed against this plan before finalizing (see the accompanying report for the full write-up):

- **Spec coverage:** all 7 fields (`discardPlayerIds`, `scienceFreeResourcePlayerIds`, `goldFieldResourcePlayerIds`, `pillageQueue`, `winnerDrawQueue`, `progressCardOverLimitPlayerIds`, `revealedTileIds`) have a task; all 28 call sites this session's grep found are covered by name/line across Tasks 2–4; `gameState.ts`/`gameState.test.ts` wiring is Task 1 Steps 5–6; both `pillageQueue`/`winnerDrawQueue` reset+restore adjacency-risk sites are called out explicitly in Task 3 Steps 7–8, each naming its two out-of-scope neighbors.
- **Import paths verified against real exports, not assumed:** `BarbarianPillageTarget` at `src/game/knights.ts:245-248`, imported via `../knights` from `src/game/reducers/`; `dequeueOne`/`activeQueueEntry` at `src/game/pendingQueue.ts:19-33`, imported via `../pendingQueue`; `graph.vertexTileIds` confirmed a real `Map<string, string[]>` at `src/data/boardGraph.ts:26`.
- **Placeholder scan:** no "TBD"/"similar to Task N"/unshown code — every Find/Replace block above is the actual current text read from `App.tsx` this session, or (Task 1) fully-specified new-file content.
- **Type/signature consistency:** all 17 action shapes in Task 1's `PendingQueuesAction` union match their dispatch-site payloads across Tasks 2–4 exactly (field names, array-vs-Set, the custom `(t) => t.playerId` accessor for `pillageQueue` only).
- **Relative-vs-absolute classification re-verified against live code, action by action (all 17):** all 6 `_REMOVED`/`_POPPED`-shaped dequeue actions (`DISCARD_PLAYER_REMOVED`, `SCIENCE_FREE_RESOURCE_PLAYER_REMOVED`, `GOLD_FIELD_RESOURCE_PLAYER_REMOVED`, `PILLAGE_QUEUE_ENTRY_REMOVED`, `WINNER_DRAW_QUEUE_ENTRY_REMOVED`, `PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED`) confirmed RELATIVE — every one of their old call sites used `dequeueOne` off either a functional updater (`setX((prev) => dequeueOne(prev, ...))`) or, for `discardPlayerIds`, a still-more-exposed direct closure read (`dequeueOne(discardPlayerIds, ...)`) — never a value safe to snapshot once and discard. The 4 `_ADDED`-shaped population actions with a Set-merge or duplicate-preserving concat (`SCIENCE_FREE_RESOURCE_PLAYERS_ADDED`, `GOLD_FIELD_RESOURCE_PLAYERS_ADDED`, `PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED`, plus `TILES_REVEALED`'s Set-union) confirmed RELATIVE — each old call site read `prev`/the current Set inside its own functional updater. The 6 remaining actions (`DISCARD_PLAYERS_SET`, `PILLAGE_QUEUE_SET`, `WINNER_DRAW_QUEUE_SET`, `PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET`, `REVEALED_TILES_SET`, plus the 2 no-payload `_CLEARED` actions counted as one shape) confirmed ABSOLUTE — every one of their old call sites either passed a literal (`[]`/`new Set()`), a value computed fresh from unrelated inputs (`players.filter(...)`, `result.pillageTargets`, `result.winners.map(...)`), or a value read from `snapshot.*` — never from the field's own prior contents. **One genuine deviation found and resolved during this verification, not a classification error:** `applyDiscard`'s `const remaining = dequeueOne(discardPlayerIds, (id) => id, playerId)` line is NOT deletable alongside its `setDiscardPlayerIds(remaining)` counterpart, because `remaining` is read twice more afterward (a `debugLog` call, then an `if (remaining.length === 0)` phase-transition gate) — resolved by keeping that line as a pure local read and converting only the state-mutation call, per Global Constraints point 5 and Task 2 Step 4. No other of the 17 actions' call sites had a comparable trailing read (individually checked: all 5 other dequeue sites and all 4 relative-add sites end their function/block immediately after the old setState call).
