# App.tsx Reducer Refactor — Sub-plan 7: `pendingTrade` + `freeRoadsRemaining`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the 2 fields deferred from Sub-plan 6 — `freeRoadsRemaining` (into the EXISTING `TurnState`, as a 10th field) and `pendingTrade` (into a brand-new `TradeState`/`trade.ts` slice) — out of `App.tsx` `useState` and into the reducer, via 5 new action types across 22 call sites.

**Architecture:** `GameState = { board; players; turn; progress; decks; trophies; pendingQueues }`, composed via `src/game/gameState.ts`'s `reduceGame`, which runs every sub-reducer against every dispatched action unconditionally (each slice ignores actions it doesn't own via its switch's `default` case). This sub-plan does two different things at once: it **extends** an existing slice (`turn.ts` gains `freeRoadsRemaining`, including one more field on its already-existing `TURN_ADVANCED` case) and **adds** one more slice the identical way `progress.ts`/`decks.ts`/`trophies.ts`/`pendingQueues.ts` were added (own file, own `initialState`, own action union, one more line in `reduceGame`). `GameState` becomes `{ board; players; turn; progress; decks; trophies; pendingQueues; trade }`.

**Tech Stack:** React 19 + TypeScript, `useReducer`, Vitest for reducer unit tests, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-apptsx-reducer-refactor-design.md` — this plan's own concrete field-by-field design (verified against the live code this session) supersedes that spec's loose sketch of a single 9-field `PendingState`. That sketch's Sequencing item 6 was split into two sub-plans with the user's approval: Sub-plan 6 shipped the 7-field uniform half (`pendingQueues.ts`), and **this plan covers ONLY the 2 bespoke fields it explicitly deferred.** Research this session found the spec's own "put both in `PendingState`" grouping to be wrong on the merits for `freeRoadsRemaining`: it is a turn-scoped counter with the exact same "reset at `TURN_ADVANCED`" semantics as `TurnState`'s existing `devCardPlayedThisTurn`/`hasRolledThisTurn`/`consecutiveDoublesThisTurn`, so it joins `TurnState` rather than founding a queue-shaped home it has nothing in common with. `pendingTrade` is genuinely unrelated to both (a proposed-but-unresolved player-to-player offer, deliberately NOT turn-scoped) and gets its own file. The spec's original 7th sub-plan (GameHud prop restructuring) is pushed to 8th, as Sub-plan 6's own plan already recorded.

**Naming note:** `src/game/reducers/trade.ts` is a NEW file. Do not confuse it with the pre-existing `src/game/reducers/trophies.ts` (adjacent alphabetically in the same directory), nor with any of `App.tsx`'s many trade-named *functions* (`applyTradeResolution`, `resolveTradeAsHost`, `resolvePlayerTrade`, `proposePlayerTrade`, `tradeCommodity`, `bankTrade`) — none of which move, and none of which this file's reducer replaces. The reducer owns exactly one field's storage; every one of those functions keeps its existing body apart from the one setState line it converts.

---

## Global Constraints

- **Trusted-apply pattern (`CONVENTIONS.md` §1) is unchanged and non-negotiable.** One client decides a non-deterministic value, broadcasts it, every client — including the decider — applies the exact same decided result via a shared function, never re-deriving it. This sub-plan moves *where* 2 decided values live (reducer instead of `useState`), never *how* they get decided.
- **Composition pattern extends, doesn't change.** `GameState`/`GameAction` currently compose as `{ board; players; turn; progress; decks; trophies; pendingQueues }` / `BoardAction | PlayersAction | TurnAction | ProgressAction | DecksAction | TrophiesAction | PendingQueuesAction`, with `reduceGame` running every sub-reducer against every action unconditionally. This sub-plan adds `trade: TradeState` as one more line in that same composition (own file, own action union member, one more `reduceGame` line — no new composition mechanism), and adds 3 members to the EXISTING `TurnAction` union plus one field to `TurnState`. No new composition mechanism either way.
- **`catan-3d/tsconfig.json` is solution-style (`"files": []`) — bare `npx tsc --noEmit` checks 0 files and is vacuous. Every task's typecheck gate MUST be `npx tsc -p tsconfig.app.json` (run from `catan-3d/`).**
- **`noUnusedLocals: true` in `tsconfig.app.json`** — sequence import deletions (e.g. if `setFreeRoadsRemaining`'s own `useState` import line becomes unused only after the LAST call site converts) so no intermediate task's commit leaves a dangling unused import. **Verified this session, no such deletion is actually triggered by this sub-plan:** `useState` stays imported (dozens of other cells still use it); the `import type { PendingTrade } from './components/hud/TradeOfferPrompt'` line at `App.tsx:25` stays (3 surviving non-setState usages — the `applyTradeResolution(trade: PendingTrade)` parameter at `App.tsx:1312`, the `const trade: PendingTrade = {...}` annotation at `App.tsx:4411`, and the `resolveTradeAsHost(trade: PendingTrade)` parameter at `App.tsx:4429` — none of which this migration touches). Each App.tsx task still ends with a grep to confirm zero surviving references to the setter it removed, and a `npx tsc -p tsconfig.app.json` run that would fail on either a dangling import or a stray reference.
- **Apply the relative-vs-absolute classification rule per action exactly as recorded in the Data Model below — do not re-derive it from scratch, but DO independently confirm each classification against the live file before converting** (this project's standing "verify, don't trust" discipline; every Find/Replace step below opens with the exact line range to read first). Rationale for why this rule is binding at all: Sub-plan 5's final whole-branch review found a REAL correctness bug from converting a batch-safe functional `setState` updater into an ABSOLUTE dispatch computed off a closed-over alias, reintroducing a stale-closure race. **The binding rule:** whenever the OLD code's `setX((prev) => someFn(prev))` (or any setState call reading the CURRENT value of the field being mutated) is converted, the replacement MUST be a RELATIVE action — the reducer computes the new value from `state.X` itself, never from a value the dispatch site computed off a component-closure read of that same field. An ABSOLUTE "set to value X" action is only safe when the OLD code's setState call did NOT read the field's own current value. `freeRoadsRemaining` has 5 relative sites and 3 absolute ones; `pendingTrade` has 13 sites and **every one is absolute** (no `(prev) => …` form exists anywhere for it — confirmed by grepping all 13). Do not "simplify" any relative action back to absolute even if a single call site looks safe in isolation.
- **Every read call site (not just write/setState sites) for both fields reads through a single alias declaration** — `const freeRoadsRemaining = gameState.turn.freeRoadsRemaining`, `const pendingTrade = gameState.trade.pendingTrade` — declared exactly where the old `useState` line sat, matching the exact pattern every prior sub-plan in this project used (`const currentPlayerIndex = gameState.turn.currentPlayerIndex` at `App.tsx:329`, `const gamePhase = gameState.turn.gamePhase` at `App.tsx:486`, `const revealedTileIds = gameState.pendingQueues.revealedTileIds` at `App.tsx:336`, …). Leave ALL downstream bare-identifier reads completely unchanged (`if (pendingTrade) { … }`, `!pendingTrade &&`, `freeRoadsRemaining > 0`, `pendingTrade={pendingTrade}` as a GameHud prop, the autosave-snapshot object literal, and **every `useEffect` dependency-array entry** — see the next constraint). Only the declaration and the setState calls change.
- **Dependency-array entries stay as the BARE alias — do NOT rewrite them to `gameState.turn.freeRoadsRemaining` / `gameState.trade.pendingTrade`.** Verified against the live file this session, because an earlier research note claimed the opposite: in the autosave `useEffect`'s dependency array (`App.tsx:6924-6966`, which carries no `eslint-disable`, so `react-hooks/exhaustive-deps` genuinely enforces its contents), every already-migrated field that HAS an alias appears as the bare alias — `revealedTileIds` (6932), `totalRollsThisGame` (6933), `currentPlayerIndex` (6943), `gamePhase` (6946), `barbarianTrackPosition` (6959), `devCardPlayedThisTurn` (6961), `hasRolledThisTurn` (6963). The `gameState.board.*` member-expression entries sitting alongside them (6938-6945) are the fields that have NO alias and are therefore read as member expressions inside the effect body. `exhaustive-deps` resolves the identifier actually referenced in the effect body, not the alias's initializer, so the bare alias is both correct and required. **Net effect: zero dependency-array edits in this sub-plan** — `freeRoadsRemaining` at 6962 and the `[pendingTrade, onlineInfo]`/`[pendingTrade]` arrays at 4534/4542 all keep compiling and behaving identically once their alias exists. `npx eslint src/App.tsx` (clean on the current branch, confirmed this session) is a per-task gate below precisely so a wrong call here fails loudly rather than silently.
- **Referential-identity check (the one real behavioral risk in this sub-plan, verified safe):** `pendingTrade` currently gates a 
`setTimeout`-based trade-expiry effect keyed on `[pendingTrade, onlineInfo]` (`App.tsx:4524-4534`). After migration, `gameState.trade.pendingTrade` keeps `useState`-equivalent identity semantics: `reduceTrade` returns the SAME `TradeState` object reference (`default: return state`) for every action it doesn't own, so `reduceGame`'s per-dispatch new `GameState` wrapper does NOT give `state.trade.pendingTrade` a new identity, and the expiry timer does not restart on unrelated dispatches. Identity changes only on `PENDING_TRADE_SET`/`PENDING_TRADE_CLEARED` — exactly when `setPendingTrade` changed it before. The same reasoning covers the double-click-guard reset effect at `App.tsx:4540-4542`.
- **`npm run build` (not just `tsc`/`eslint`/`vitest`) is required before any task is reported done** — this project's own history has a real case (Board Foundation, Seafarers sub-plan 1) of a broken Vite asset import that only `npm run build` caught.
- **No `App.tsx` behavior change of any kind — pure mechanical migration, same as every previous sub-plan.** Two live asymmetries were found this session that look like bugs and MUST be preserved verbatim rather than "fixed" here: (a) the dev-card Road Building path OVERWRITES the counter to a literal `2` (`App.tsx:1195`) while the progress-card Road Building path ADDS `2` (`App.tsx:5018`) — two different semantics for the same-named mechanic; (b) `applyRoadBuildingPlay`'s absolute set can therefore discard an already-pending free road. Preserve both exactly. If either is a real bug it is a separate, non-refactor change.
- **Explicitly out of scope, do not touch:** every other `useState` cell in `App.tsx`; `isResolvingTradeRef` (a `useRef` sitting directly between the two fields' own declarations at `App.tsx:387-393` — see Task 2/3 Step 1 each); `setWinner`/`setBanner`/`setDevCardPicker` (genuinely local `useState` neighbors at both bulk-reset sites); `src/multiplayer/matchSnapshot.ts` (its `MatchSnapshot` interface already carries `freeRoadsRemaining: number` at line 105 and validates it at line 211 — unchanged; `pendingTrade` is deliberately not a snapshot field at all); `src/components/hud/TradeOfferPrompt.tsx` and `src/components/hud/GameHud.tsx` (the alias pattern keeps both prop-passing sites bare, still-valid identifiers); `CONVENTIONS.md` (checked this session — it documents the trusted-apply shape, which this sub-plan does not change, and does not enumerate reducer slices, so there is nothing to sync).

---

## Data Model — the 2 Fields, Verified This Session

Full call-site inventory: 22 sites (9 for `freeRoadsRemaining`, 13 for `pendingTrade`), each grepped exhaustively in `App.tsx` this session. Every line number below is a confirmed match, not an estimate.

### `freeRoadsRemaining: number` → joins the EXISTING `TurnState` (Task 2) — IS a required `MatchSnapshot` field (`matchSnapshot.ts:105`, `freeRoadsRemaining: number`)

Semantics: "how many free roads/ships the current player can still place this turn," fed by the Road Building dev card, the Road Building progress card, and one road-revocation refund path (Diplomacy removing your OWN road buys you a free rebuild — `App.tsx:2976-2979`'s own comment is explicit that this is the SAME counter, "not a second, parallel free-road concept"). Turn-scoped: `applyTurnAdvance` zeroes it. That is precisely `TurnState`'s existing `devCardPlayedThisTurn`/`hasRolledThisTurn`/`consecutiveDoublesThisTurn` semantics, which is why it belongs in `turn.ts` and not in a new file.

- `FREE_ROADS_SET { count: number }` — **ABSOLUTE.** 3 sites, none reads the field's own current value: `applyRoadBuildingPlay` (`App.tsx:1195`, literal `2`, the dev-card path); `resetGame` (`App.tsx:6426`, literal `0`); `restoreFromSnapshot` (`App.tsx:6664`, `snapshot.freeRoadsRemaining` — a REAL restored value, and a REQUIRED (non-optional) snapshot field, so no `?? 0` fallback exists today and none must be added).
- `FREE_ROADS_DECREMENTED` (no payload) — **RELATIVE**, reducer computes `Math.max(0, state.freeRoadsRemaining - 1)`. 2 sites, both old `setFreeRoadsRemaining((prev) => Math.max(0, prev - 1))`: `applyRoadPlacement` (`App.tsx:981`, guarded by `if (isFreeRoad)`) and `applyShipPlacement` (`App.tsx:1006`, guarded by `if (isFreeShip)`). Both guards stay in `App.tsx` unchanged — the reducer never learns about them.
- `FREE_ROADS_INCREMENTED { amount: number }` — **RELATIVE**, reducer computes `state.freeRoadsRemaining + action.amount`. 3 sites, all old `setFreeRoadsRemaining((prev) => prev + N)`: the `onProgressCardPlayed` broadcast receiver's `progressRoadBuilding` branch (`App.tsx:1895`, `amount: 2`); `applyDiplomacyRemoval`'s own-road refund (`App.tsx:2979`, `amount: 1`, guarded by `if (ownerId === playerId)` which stays unchanged); `playProgressRoadBuilding`, the local-actor sibling of the 1895 receiver (`App.tsx:5018`, `amount: 2`).
- **`TURN_ADVANCED` gains `freeRoadsRemaining: 0` in its existing returned object** — and `App.tsx:876`'s `setFreeRoadsRemaining(0)` is then **DELETED outright, not converted.** Verified live: `applyTurnAdvance` (`App.tsx:863-914`) calls `setFreeRoadsRemaining(0)` at 876 and dispatches `{ type: 'TURN_ADVANCED', nextPlayerIndex: nextIndex }` at 914 inside the SAME function body, so once `reduceTurn`'s `TURN_ADVANCED` case zeroes the field, line 876 is pure redundancy. This is exactly Sub-plan 4's own precedent for `knightsPromotedThisTurn` ("reuse of the pre-existing `TURN_ADVANCED` action … via pure deletion at the 1 site it's dispatched from"), and that sub-plan left an explanatory comment at the deletion point (`App.tsx:904-913`) which Task 2 Step 3 mirrors. **This is the only site in the whole sub-plan that deletes rather than converts** — the sole reason a fresh reviewer might reasonably question a diff line here.
- Untouched READ sites (kept working by the alias, listed so a reviewer can confirm nothing was missed): `App.tsx:3080` (`const isFreeRoad = !isSetup && freeRoadsRemaining > 0`), `App.tsx:3134` (`const isFreeShip = !isSetup && freeRoadsRemaining > 0`), `App.tsx:6918` (autosave snapshot object literal), `App.tsx:6962` (that same effect's dependency array — bare alias, see Global Constraints).

### `pendingTrade: PendingTrade | null` → a NEW `TradeState`/`trade.ts` slice (Task 3) — NOT a `MatchSnapshot` field at all

Semantics: a proposed-but-unresolved player-to-player trade offer. Not turn-scoped (an offer legitimately outlives its own turn boundary until accepted, declined, host-rejected, or expired by the 
timeout effect), and never round-tripped through the snapshot — `restoreFromSnapshot` only ever clears it to `null`. No existing reducer file owns anything trade-related, hence a new file rather than an extension. Type source verified: `PendingTrade` is DEFINED in `src/components/hud/TradeOfferPrompt.tsx:6-11`; `App.tsx:25` imports it directly from there (`import type { PendingTrade } from './components/hud/TradeOfferPrompt'`), NOT through `GameHud.tsx`'s own re-export (`GameHud.tsx:34` re-imports it for its own prop type). `trade.ts` therefore uses the same canonical source via `import type { PendingTrade } from '../../components/hud/TradeOfferPrompt'`. It is a **type-only** import, erased at compile time, so no React component module is pulled into the reducer's runtime graph and no import cycle exists (`TradeOfferPrompt.tsx` imports only from `game/types`, which imports no reducer). Moving the type into `game/types.ts` would be a strictly larger diff across 3 files for no compile-time or runtime benefit — deliberately not done.

- `PENDING_TRADE_SET { trade: PendingTrade }` — **ABSOLUTE.** 2 sites: the `onTradeOffered` broadcast receiver (`App.tsx:1753`, `setPendingTrade(payload)` — `payload` is typed `TradePayload` (`useRoomChannel.ts:240-245`), structurally identical to `PendingTrade` (same 4 fields, same types), so it assigns to `trade: PendingTrade` with no cast); `proposePlayerTrade`, the local-actor sibling (`App.tsx:4412`, `setPendingTrade(trade)` where `trade` is the freshly-built `const trade: PendingTrade` from line 4411).
- `PENDING_TRADE_CLEARED` (no payload, always `null`) — **ABSOLUTE.** 11 sites: `onTradeResolved` (1764); `onTradeCancelled` (1767); `resolveTradeAsHost`'s missing-player bail (4433), its resources-changed bail (4438), and its success path (4444); `resolvePlayerTrade`'s decline branch (4462), its local-pass-and-play resources-changed bail (4488), and its local-pass-and-play success path (4493); the expiry-timeout effect (4528); `resetGame` (6425); `restoreFromSnapshot` (6667).
- **No `TURN_ADVANCED` case in `reduceTrade`** — deliberate, and asserted by a test in Task 1 so a future reader can't mistake the omission for an oversight. A pending offer surviving a turn pass is existing, intended behavior (the expiry timeout, not the turn boundary, is what bounds its lifetime).
- Untouched READ sites (kept working by the alias): `canPerformAction`'s table-wide gate (`App.tsx:789`); `canPlayDevCards` (`App.tsx:2452`); `resolvePlayerTrade`'s own guard and its 6 field reads (`App.tsx:4450`, 4460, 4479-4485, 4492, 4502, 4508); the expiry effect's guard (`App.tsx:4525`); both effects' dependency arrays (`App.tsx:4534`, `4542`); the GameHud prop (`App.tsx:7315`). Plus two pure comments that merely mention the field by name (`App.tsx:391`, `4201`, `4453`, `4506`, `4519`, `4536`, `6691`) — comments are not edited by this sub-plan except at the two sites where Task 2/3 explicitly replaces or adds one.

### Adjacency check at the two bulk-reset sites — no entangled neighbors

Verified this session by reading both regions in full. `resetGame` (`App.tsx:6414-6438`): the lines around `setPendingTrade(null)` (6425) / `setFreeRoadsRemaining(0)` (6426) are `setWinner(null)` (6424, genuinely local `useState`, out of scope), `setDevCardPicker(null)` (6427, same), and already-migrated `dispatch(...)` calls above and below. `restoreFromSnapshot` (`App.tsx:6662-6668`): `setFreeRoadsRemaining(snapshot.freeRoadsRemaining)` (6664) sits between two already-migrated `dispatch(...)` calls (6663 `DEV_CARD_PLAYED_THIS_TURN_SET`, 6665 `HAS_ROLLED_THIS_TURN_SET`), and `setPendingTrade(null)` (6667) sits between `setBanner(null)` (6666) and `setDevCardPicker(null)` (6668), both local. **No ref-clearing or barbarian-attack-style clustering like earlier sub-plans hit — these are simple sequential 1:1 conversions.** The one mechanical hazard is that the two fields' reset lines are ADJACENT at 6425/6426, and Tasks 2 and 3 each edit one of them: every Find block at these sites below is therefore anchored on a line the OTHER task does not touch (`setDevCardPicker`/`setWinner` at `resetGame`; `HAS_ROLLED_THIS_TURN_SET`/`setBanner` at `restoreFromSnapshot`), so the two tasks cannot collide regardless of ordering.

---

## File Structure

- **Modify** `catan-3d/src/game/reducers/turn.ts` — add `freeRoadsRemaining: number` to `TurnState`/`initialTurnState`, 3 members to `TurnAction`, 3 cases + one more field on the existing `TURN_ADVANCED` case, and update the `default:` comment's case count.
- **Modify** `catan-3d/src/game/reducers/turn.test.ts` — 3 new `describe` blocks, plus extend the existing `TURN_ADVANCED` test to actually exercise the new reset.
- **Create** `catan-3d/src/game/reducers/trade.ts` — new `TradeState`/`initialTradeState`/`TradeAction`/`reduceTrade`.
- **Create** `catan-3d/src/game/reducers/trade.test.ts` — full coverage matching `turn.test.ts`/`trophies.test.ts` conventions.
- **Modify** `catan-3d/src/game/gameState.ts` — wire `trade` into `GameState`/`initialGameState`/`GameAction`/`reduceGame`.
- **Modify** `catan-3d/src/game/gameState.test.ts` — add 1 routing test (`'routes a trade action through reduceTrade'`), this project's standing requirement since Sub-plan 5's process lesson (Sub-plans 3, 4 AND 5 each had their final review independently find this exact gap). Baked into Task 1, deliberately not deferred to a fix wave.
- **Modify** `catan-3d/src/App.tsx` — Task 2 migrates `freeRoadsRemaining`'s 9 sites; Task 3 migrates `pendingTrade`'s 13.
- **Not touched:** `catan-3d/src/multiplayer/matchSnapshot.ts`, `catan-3d/src/multiplayer/useRoomChannel.ts`, `catan-3d/src/components/hud/TradeOfferPrompt.tsx`, `catan-3d/src/components/hud/GameHud.tsx`, `CONVENTIONS.md`, every other file in the repo.

---

### Task 1: Extend `turn.ts`, create `trade.ts`, wire `gameState.ts` + `gameState.test.ts`

**Files:**
- Modify: `catan-3d/src/game/reducers/turn.ts`
- Modify: `catan-3d/src/game/reducers/turn.test.ts`
- Create: `catan-3d/src/game/reducers/trade.ts`
- Create: `catan-3d/src/game/reducers/trade.test.ts`
- Modify: `catan-3d/src/game/gameState.ts`
- Modify: `catan-3d/src/game/gameState.test.ts`

**Interfaces:**
- Consumes: existing `GameState`/`GameAction`/`reduceGame`/`initialGameState` (`src/game/gameState.ts`); existing `TurnState`/`initialTurnState`/`TurnAction`/`reduceTurn` (`src/game/reducers/turn.ts`); `type PendingTrade` from `../../components/hud/TradeOfferPrompt` (confirmed definition at `src/components/hud/TradeOfferPrompt.tsx:6-11`: `{ fromPlayerId: number; toPlayerId: number; offerResource: ResourceType; wantResource: ResourceType }`).
- Produces: `TurnState.freeRoadsRemaining: number` and 3 new `TurnAction` members — `{ type: 'FREE_ROADS_SET'; count: number }`, `{ type: 'FREE_ROADS_DECREMENTED' }`, `{ type: 'FREE_ROADS_INCREMENTED'; amount: number }`; `TradeState { pendingTrade: PendingTrade | null }`, `initialTradeState`, `TradeAction` = `{ type: 'PENDING_TRADE_SET'; trade: PendingTrade } | { type: 'PENDING_TRADE_CLEARED' }`, `reduceTrade(state: TradeState, action: GameAction, _fullState: GameState): TradeState`; `GameState.trade: TradeState`; `GameAction` includes `TradeAction`.

This task is pure reducer-slice work — nothing in `App.tsx` reads `gameState.trade.*` or `gameState.turn.freeRoadsRemaining` yet (Tasks 2 and 3 wire those reads). **Zero `App.tsx` changes in this task**, mirroring Sub-plan 6's own Task 1. Both new action families are brand new with zero existing callers, so there is no cross-task compile-safety gap to bridge.

- [ ] **Step 1: Write the failing tests for `trade.ts`**

Create `catan-3d/src/game/reducers/trade.test.ts`, matching `turn.test.ts`/`trophies.test.ts`'s exact conventions (plain `describe`/`it`, `reduceTrade(state, action, initialGameState)`, `toEqual`/`toBe` reference-identity checks, plus the sibling "action not owned by this reducer" block every existing reducer test file has):

```ts
import { describe, expect, it } from 'vitest'
import { reduceTrade, initialTradeState } from './trade'
import { initialGameState } from '../gameState'
import type { PendingTrade } from '../../components/hud/TradeOfferPrompt'

const OFFER: PendingTrade = { fromPlayerId: 1, toPlayerId: 2, offerResource: 'brick', wantResource: 'grain' }

describe('reduceTrade — PENDING_TRADE_SET', () => {
  it('stores the offered trade, leaves every other field untouched', () => {
    const result = reduceTrade(initialTradeState, { type: 'PENDING_TRADE_SET', trade: OFFER }, initialGameState)
    expect(result).toEqual({ ...initialTradeState, pendingTrade: OFFER })
  })

  it('replaces an already-pending offer rather than merging with it', () => {
    const dirty = { ...initialTradeState, pendingTrade: OFFER }
    const next: PendingTrade = { fromPlayerId: 3, toPlayerId: 1, offerResource: 'ore', wantResource: 'wool' }
    const result = reduceTrade(dirty, { type: 'PENDING_TRADE_SET', trade: next }, initialGameState)
    expect(result.pendingTrade).toBe(next)
  })
})

describe('reduceTrade — PENDING_TRADE_CLEARED', () => {
  it('clears pendingTrade to null', () => {
    const dirty = { ...initialTradeState, pendingTrade: OFFER }
    const result = reduceTrade(dirty, { type: 'PENDING_TRADE_CLEARED' }, initialGameState)
    expect(result).toEqual({ ...initialTradeState, pendingTrade: null })
  })

  it('is a no-op shape-wise when nothing was pending', () => {
    const result = reduceTrade(initialTradeState, { type: 'PENDING_TRADE_CLEARED' }, initialGameState)
    expect(result.pendingTrade).toBeNull()
  })
})

describe('reduceTrade — TURN_ADVANCED', () => {
  it('leaves a pending offer alone — a trade offer is deliberately NOT turn-scoped', () => {
    const dirty = { ...initialTradeState, pendingTrade: OFFER }
    const result = reduceTrade(dirty, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 }, initialGameState)
    expect(result).toBe(dirty)
  })
})

describe('reduceTrade — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reduceTrade(initialTradeState, { type: 'RESET_BOARD', robberTileId: 'D1' }, initialGameState)
    expect(result).toBe(initialTradeState)
  })
})
```

- [ ] **Step 2: Write the failing tests for `turn.ts`'s 3 new actions**

Read `catan-3d/src/game/reducers/turn.test.ts:96-131` first.

Append these 3 `describe` blocks to `turn.test.ts` immediately AFTER the existing `CONSECUTIVE_DOUBLES_SET` block (line 101) and BEFORE the existing `TURN_ADVANCED` block (line 103), keeping the file's action-order-matches-the-reducer convention:

```ts
describe('reduceTurn — FREE_ROADS_SET', () => {
  it('sets freeRoadsRemaining to the given count, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'FREE_ROADS_SET', count: 2 }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, freeRoadsRemaining: 2 })
  })

  it('overwrites an existing count rather than adding to it (the dev-card Road Building path)', () => {
    const dirty = { ...initialTurnState, freeRoadsRemaining: 1 }
    const result = reduceTurn(dirty, { type: 'FREE_ROADS_SET', count: 2 }, initialGameState)
    expect(result.freeRoadsRemaining).toBe(2)
  })
})

describe('reduceTurn — FREE_ROADS_DECREMENTED', () => {
  it('decrements by 1, leaves every other field untouched', () => {
    const dirty = { ...initialTurnState, freeRoadsRemaining: 2 }
    const result = reduceTurn(dirty, { type: 'FREE_ROADS_DECREMENTED' }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, freeRoadsRemaining: 1 })
  })

  it('clamps at 0 instead of going negative', () => {
    const result = reduceTurn(initialTurnState, { type: 'FREE_ROADS_DECREMENTED' }, initialGameState)
    expect(result.freeRoadsRemaining).toBe(0)
  })
})

describe('reduceTurn — FREE_ROADS_INCREMENTED', () => {
  it('adds the given amount to the current count', () => {
    const dirty = { ...initialTurnState, freeRoadsRemaining: 1 }
    const result = reduceTurn(dirty, { type: 'FREE_ROADS_INCREMENTED', amount: 2 }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, freeRoadsRemaining: 3 })
  })

  it('compounds across two dispatches instead of overwriting (the progress-card + Diplomacy paths)', () => {
    const once = reduceTurn(initialTurnState, { type: 'FREE_ROADS_INCREMENTED', amount: 2 }, initialGameState)
    const twice = reduceTurn(once, { type: 'FREE_ROADS_INCREMENTED', amount: 1 }, initialGameState)
    expect(twice.freeRoadsRemaining).toBe(3)
  })
})
```

- [ ] **Step 3: Extend the existing `TURN_ADVANCED` test to cover the new reset**

Read `catan-3d/src/game/reducers/turn.test.ts:103-123` first. The existing assertion spreads `dirty`, so adding `freeRoadsRemaining: 0` to the reducer would pass vacuously against a `dirty` whose count is already 0 — this edit makes it a real test.

Find:
```ts
describe('reduceTurn — TURN_ADVANCED', () => {
  it('sets currentPlayerIndex and resets hasRolledThisTurn/devCardPlayedThisTurn/consecutiveDoublesThisTurn in one dispatch, leaves setup fields untouched', () => {
    const dirty = {
      ...initialTurnState,
      currentPlayerIndex: 0,
      hasRolledThisTurn: true,
      devCardPlayedThisTurn: true,
      consecutiveDoublesThisTurn: 2,
      setupStepIndex: 3,
      totalRollsThisGame: 5,
    }
    const result = reduceTurn(dirty, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 }, initialGameState)
    expect(result).toEqual({
      ...dirty,
      currentPlayerIndex: 1,
      hasRolledThisTurn: false,
      devCardPlayedThisTurn: false,
      consecutiveDoublesThisTurn: 0,
    })
  })
})
```

Replace:
```ts
describe('reduceTurn — TURN_ADVANCED', () => {
  it('sets currentPlayerIndex and resets hasRolledThisTurn/devCardPlayedThisTurn/consecutiveDoublesThisTurn/freeRoadsRemaining in one dispatch, leaves setup fields untouched', () => {
    const dirty = {
      ...initialTurnState,
      currentPlayerIndex: 0,
      hasRolledThisTurn: true,
      devCardPlayedThisTurn: true,
      consecutiveDoublesThisTurn: 2,
      freeRoadsRemaining: 2,
      setupStepIndex: 3,
      totalRollsThisGame: 5,
    }
    const result = reduceTurn(dirty, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 }, initialGameState)
    expect(result).toEqual({
      ...dirty,
      currentPlayerIndex: 1,
      hasRolledThisTurn: false,
      devCardPlayedThisTurn: false,
      consecutiveDoublesThisTurn: 0,
      freeRoadsRemaining: 0,
    })
  })
})
```

- [ ] **Step 4: Write the failing routing test in `gameState.test.ts`**

Read `catan-3d/src/game/gameState.test.ts:82-87` first.

Insert this `it` block immediately after the existing `'routes a pendingQueues action through reducePendingQueues'` block (which ends at line 86) and before the `'does not mutate the input state'` block:

```ts
  it('routes a trade action through reduceTrade', () => {
    const result = reduceGame(initialGameState, {
      type: 'PENDING_TRADE_SET',
      trade: { fromPlayerId: 1, toPlayerId: 2, offerResource: 'brick', wantResource: 'grain' },
    })
    expect(result.trade.pendingTrade).toEqual({
      fromPlayerId: 1,
      toPlayerId: 2,
      offerResource: 'brick',
      wantResource: 'grain',
    })
    expect(result.board).toBe(initialGameState.board)
  })
```

- [ ] **Step 5: Run the tests to verify they fail**

Run (from `catan-3d/`): `npx vitest run src/game`
Expected: FAIL — `trade.test.ts` cannot resolve `./trade` (module not found); `turn.test.ts`'s 3 new blocks and the extended `TURN_ADVANCED` block fail on `freeRoadsRemaining` being absent/unhandled; `gameState.test.ts`'s new block fails on `result.trade` being undefined.

- [ ] **Step 6: Create `trade.ts`**

Create `catan-3d/src/game/reducers/trade.ts` with exactly this content (shape copied from `progress.ts`, this project's smallest existing slice — no JSDoc, `_fullState` unused-param naming, the same `default:` explanatory-comment style):

```ts
import type { GameAction, GameState } from '../gameState'
import type { PendingTrade } from '../../components/hud/TradeOfferPrompt'

export interface TradeState {
  pendingTrade: PendingTrade | null
}

export const initialTradeState: TradeState = {
  pendingTrade: null,
}

export type TradeAction =
  | { type: 'PENDING_TRADE_SET'; trade: PendingTrade }
  | { type: 'PENDING_TRADE_CLEARED' }

export function reduceTrade(state: TradeState, action: GameAction, _fullState: GameState): TradeState {
  switch (action.type) {
    case 'PENDING_TRADE_SET':
      return { ...state, pendingTrade: action.trade }
    case 'PENDING_TRADE_CLEARED':
      return { ...state, pendingTrade: null }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full
      // GameAction union (every slice's actions), not just TradeAction, so
      // most of that union — including every board-only and players-only
      // action — is legitimately unhandled here. reduceTrade only owns the 2
      // dedicated cases above. Deliberately NO TURN_ADVANCED case, unlike
      // every other slice: a pending offer is not turn-scoped. It outlives
      // the offerer's own turn until it's accepted, declined, rejected by
      // the host, or expired by App.tsx's own timeout effect — the turn
      // boundary is not what bounds its lifetime. Contrast
      // freeRoadsRemaining in turn.ts, which IS turn-scoped and does reset
      // there.
      return state
  }
}
```

- [ ] **Step 7: Extend `turn.ts`**

Read `catan-3d/src/game/reducers/turn.ts` in full first (86 lines).

Find:
```ts
  totalRollsThisGame: number
  consecutiveDoublesThisTurn: number
}
```

Replace:
```ts
  totalRollsThisGame: number
  consecutiveDoublesThisTurn: number
  freeRoadsRemaining: number
}
```

Find:
```ts
  totalRollsThisGame: 0,
  consecutiveDoublesThisTurn: 0,
}
```

Replace:
```ts
  totalRollsThisGame: 0,
  consecutiveDoublesThisTurn: 0,
  freeRoadsRemaining: 0,
}
```

Find:
```ts
  | { type: 'CONSECUTIVE_DOUBLES_SET'; count: number }
```

Replace:
```ts
  | { type: 'CONSECUTIVE_DOUBLES_SET'; count: number }
  | { type: 'FREE_ROADS_SET'; count: number }
  | { type: 'FREE_ROADS_DECREMENTED' }
  | { type: 'FREE_ROADS_INCREMENTED'; amount: number }
```

Find:
```ts
    case 'CONSECUTIVE_DOUBLES_SET':
      return { ...state, consecutiveDoublesThisTurn: action.count }
    case 'TURN_ADVANCED':
      return {
        ...state,
        currentPlayerIndex: action.nextPlayerIndex,
        hasRolledThisTurn: false,
        devCardPlayedThisTurn: false,
        consecutiveDoublesThisTurn: 0,
      }
```

Replace:
```ts
    case 'CONSECUTIVE_DOUBLES_SET':
      return { ...state, consecutiveDoublesThisTurn: action.count }
    case 'FREE_ROADS_SET':
      return { ...state, freeRoadsRemaining: action.count }
    case 'FREE_ROADS_DECREMENTED':
      // Clamped, matching the old setFreeRoadsRemaining((prev) =>
      // Math.max(0, prev - 1)) exactly: a road/ship placement that somehow
      // ran with the counter already at 0 must not drive it negative, since
      // every gate downstream is a `freeRoadsRemaining > 0` truth test.
      return { ...state, freeRoadsRemaining: Math.max(0, state.freeRoadsRemaining - 1) }
    case 'FREE_ROADS_INCREMENTED':
      return { ...state, freeRoadsRemaining: state.freeRoadsRemaining + action.amount }
    case 'TURN_ADVANCED':
      return {
        ...state,
        currentPlayerIndex: action.nextPlayerIndex,
        hasRolledThisTurn: false,
        devCardPlayedThisTurn: false,
        consecutiveDoublesThisTurn: 0,
        freeRoadsRemaining: 0,
      }
```

Find:
```ts
      // most of that union — including every board-only and players-only
      // action — is legitimately unhandled here. reduceTurn only owns the 11
      // dedicated cases above, plus TURN_ADVANCED (declared as a
```

Replace:
```ts
      // most of that union — including every board-only and players-only
      // action — is legitimately unhandled here. reduceTurn only owns the 14
      // dedicated cases above, plus TURN_ADVANCED (declared as a
```

- [ ] **Step 8: Wire `trade` into `gameState.ts`**

Read `catan-3d/src/game/gameState.ts` in full first (44 lines).

Find:
```ts
import { reducePendingQueues, initialPendingQueuesState, type PendingQueuesState, type PendingQueuesAction } from './reducers/pendingQueues'
```

Replace:
```ts
import { reducePendingQueues, initialPendingQueuesState, type PendingQueuesState, type PendingQueuesAction } from './reducers/pendingQueues'
import { reduceTrade, initialTradeState, type TradeState, type TradeAction } from './reducers/trade'
```

Find:
```ts
  pendingQueues: PendingQueuesState
}
```

Replace:
```ts
  pendingQueues: PendingQueuesState
  trade: TradeState
}
```

Find:
```ts
  pendingQueues: initialPendingQueuesState,
}
```

Replace:
```ts
  pendingQueues: initialPendingQueuesState,
  trade: initialTradeState,
}
```

Find:
```ts
export type GameAction = BoardAction | PlayersAction | TurnAction | ProgressAction | DecksAction | TrophiesAction | PendingQueuesAction
```

Replace:
```ts
export type GameAction = BoardAction | PlayersAction | TurnAction | ProgressAction | DecksAction | TrophiesAction | PendingQueuesAction | TradeAction
```

Find:
```ts
    pendingQueues: reducePendingQueues(state.pendingQueues, action, state),
  }
```

Replace:
```ts
    pendingQueues: reducePendingQueues(state.pendingQueues, action, state),
    trade: reduceTrade(state.trade, action, state),
  }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run (from `catan-3d/`): `npx vitest run src/game`
Expected: PASS — all `trade.test.ts`, `turn.test.ts`, and `gameState.test.ts` blocks green.

- [ ] **Step 10: Typecheck**

Run (from `catan-3d/`): `npx tsc -p tsconfig.app.json`
Expected: clean, no errors. (This is what would catch a `TurnState` object literal somewhere else in the codebase now missing `freeRoadsRemaining` — verified this session that `initialTurnState` and `gameState.ts:25` are the only two constructions, so it should be clean, but do not skip the check.)

- [ ] **Step 11: Run the full test suite**

Run (from `catan-3d/`): `npm test`
Expected: PASS.

- [ ] **Step 12: Build**

Run (from `catan-3d/`): `npm run build`
Expected: succeeds.

- [ ] **Step 13: Commit**

```bash
git add catan-3d/src/game/reducers/trade.ts catan-3d/src/game/reducers/trade.test.ts catan-3d/src/game/reducers/turn.ts catan-3d/src/game/reducers/turn.test.ts catan-3d/src/game/gameState.ts catan-3d/src/game/gameState.test.ts
git commit -m "feat: add TradeState slice and freeRoadsRemaining to TurnState"
```

---

### Task 2: Migrate `freeRoadsRemaining`'s 9 `App.tsx` call sites

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `TurnState.freeRoadsRemaining`; `FREE_ROADS_SET { count: number }`, `FREE_ROADS_DECREMENTED`, `FREE_ROADS_INCREMENTED { amount: number }`, and `TURN_ADVANCED`'s widened reset (all from Task 1).
- Produces: `gameState.turn.freeRoadsRemaining` as the live source of truth in `App.tsx` — the local `useState` cell for this field fully removed. No import is drained by this task (`useState` still has dozens of other callers).

`App.tsx` has no dedicated test file (confirmed precedent — same deviation rationale the spec's own "Deviation, Sub-plan 1" note gives). This task's verification is `npx tsc -p tsconfig.app.json` + `npx eslint src/App.tsx` + the full existing Vitest suite (which already covers Task 1's reducer cases) + `npm run build`.

Every new action dispatches via bare `dispatch(...)`, never `dispatchGameAction` — no banner/sfx/broadcast side effect is added anywhere by this migration. It relocates storage only.

- [ ] **Step 1: Replace the `useState` declaration with the alias**

Read `App.tsx:386-400` first to confirm nothing has drifted. Note the neighbours: `isResolvingTradeRef` (a `useRef`, line 393) sits directly above and `alchemyPreset` (a genuinely local `useState`, line 400) directly below — neither is touched.

Find:
```tsx
  const [freeRoadsRemaining, setFreeRoadsRemaining] = useState(0)
```

Replace:
```tsx
  const freeRoadsRemaining = gameState.turn.freeRoadsRemaining
```

- [ ] **Step 2: Verify the classification before converting anything**

Run: `grep -n "setFreeRoadsRemaining" src/App.tsx`
Expected: exactly 8 remaining hits — lines ~876, 981, 1006, 1195, 1895, 2979, 5018, 6426, 6664 minus the declaration just removed (so 8 setter calls). Confirm each one's shape against the Data Model table above before editing it: 2 are `(prev) => Math.max(0, prev - 1)` (relative-decrement), 3 are `(prev) => prev + N` (relative-increment), 2 are literal-argument absolute sets, 1 is a `snapshot.*` absolute set, and 1 (line 876) is the redundant turn-advance reset being deleted. If any site's actual shape disagrees with the table, STOP and report the discrepancy rather than converting it.

- [ ] **Step 3: `applyTurnAdvance` — DELETE the now-redundant reset**

Read `App.tsx:863-914` first, especially the `dispatch({ type: 'TURN_ADVANCED', nextPlayerIndex: nextIndex })` at line 914 that makes line 876 redundant, and the `knightsPromotedThisTurn` comment at 904-913 that this step's replacement comment mirrors.

**This is a DELETION, not a conversion** — the only one in the sub-plan. Do not replace `setFreeRoadsRemaining(0)` with `dispatch({ type: 'FREE_ROADS_SET', count: 0 })`; `TURN_ADVANCED`'s own widened case already does it on the very same dispatch, and a second dispatch would be redundant noise. Leave the explanatory comment so a future reader can see where the reset went (exactly the precedent Sub-plan 4 set for `knightsPromotedThisTurn`).

Find:
```tsx
    setFreeRoadsRemaining(0)
    // Cities & Knights Merchant Fleet — "for the rest of this turn," so any
    // active rate expires the instant the turn actually passes, regardless
    // of who it passes to.
    setMerchantFleetRate(null)
```

Replace:
```tsx
    // Road Building's free-road/ship counter is "for this turn only" — now
    // cleared by reduceTurn's own TURN_ADVANCED case
    // (game/reducers/turn.ts) on the SAME dispatch below, exactly like
    // knightsPromotedThisTurn's reset described further down, so both the
    // local end-turn action and the remote TURN_PASSED receiver apply the
    // identical reset. The explicit setFreeRoadsRemaining(0) that used to
    // sit here was pure redundancy once the reducer owned the field.
    // Cities & Knights Merchant Fleet — "for the rest of this turn," so any
    // active rate expires the instant the turn actually passes, regardless
    // of who it passes to.
    setMerchantFleetRate(null)
```

- [ ] **Step 4: `applyRoadPlacement` — free-road spend**

Read `App.tsx:979-982` first.

Find:
```tsx
    dispatchGameAction({ type: 'BUILD_ROAD', edgeId, playerId, isSetup, isFreeRoad }, isDeciding)
    if (isFreeRoad) setFreeRoadsRemaining((prev) => Math.max(0, prev - 1))
```

Replace:
```tsx
    dispatchGameAction({ type: 'BUILD_ROAD', edgeId, playerId, isSetup, isFreeRoad }, isDeciding)
    if (isFreeRoad) dispatch({ type: 'FREE_ROADS_DECREMENTED' })
```

- [ ] **Step 5: `applyShipPlacement` — free-ship spend**

Read `App.tsx:1004-1007` first. Same shape as Step 4, different guard variable.

Find:
```tsx
    dispatchGameAction({ type: 'BUILD_SHIP', edgeId, playerId, isSetup, isFreeShip }, isDeciding)
    if (isFreeShip) setFreeRoadsRemaining((prev) => Math.max(0, prev - 1))
```

Replace:
```tsx
    dispatchGameAction({ type: 'BUILD_SHIP', edgeId, playerId, isSetup, isFreeShip }, isDeciding)
    if (isFreeShip) dispatch({ type: 'FREE_ROADS_DECREMENTED' })
```

- [ ] **Step 6: `applyRoadBuildingPlay` — the dev-card path (ABSOLUTE, deliberately unlike its progress-card sibling)**

Read `App.tsx:1193-1198` first. This site OVERWRITES to a literal 2; the progress-card sibling in Step 9 ADDS 2. That asymmetry is live behavior and must be preserved verbatim — do not unify them.

Find:
```tsx
  const applyRoadBuildingPlay = (playerId: number) => {
    spendDevCard(playerId, 'roadBuilding')
    setFreeRoadsRemaining(2)
```

Replace:
```tsx
  const applyRoadBuildingPlay = (playerId: number) => {
    spendDevCard(playerId, 'roadBuilding')
    dispatch({ type: 'FREE_ROADS_SET', count: 2 })
```

- [ ] **Step 7: `onProgressCardPlayed` — the broadcast receiver's `progressRoadBuilding` branch**

Read `App.tsx:1891-1896` first.

Find:
```tsx
      else if (payload.card === 'progressRoadBuilding') setFreeRoadsRemaining((prev) => prev + 2)
```

Replace:
```tsx
      else if (payload.card === 'progressRoadBuilding') dispatch({ type: 'FREE_ROADS_INCREMENTED', amount: 2 })
```

- [ ] **Step 8: `applyDiplomacyRemoval` — own-road refund**

Read `App.tsx:2966-2988` first. The three-line comment above the setter explains the shared-counter design and stays exactly as-is.

Find:
```tsx
    if (ownerId === playerId) setFreeRoadsRemaining((prev) => prev + 1)
```

Replace:
```tsx
    if (ownerId === playerId) dispatch({ type: 'FREE_ROADS_INCREMENTED', amount: 1 })
```

- [ ] **Step 9: `playProgressRoadBuilding` — the local-actor sibling of Step 7**

Read `App.tsx:5009-5021` first.

Find:
```tsx
    dispatch({ type: 'PROGRESS_CARD_SPENT', playerId: player.id, card: 'progressRoadBuilding' })
    setFreeRoadsRemaining((prev) => prev + 2)
```

Replace:
```tsx
    dispatch({ type: 'PROGRESS_CARD_SPENT', playerId: player.id, card: 'progressRoadBuilding' })
    dispatch({ type: 'FREE_ROADS_INCREMENTED', amount: 2 })
```

- [ ] **Step 10: `resetGame` — full-game reset**

Read `App.tsx:6420-6432` first. `setPendingTrade(null)` sits on the line directly ABOVE this one and is Task 3's job — this Find block is anchored on `setDevCardPicker(null)` BELOW it precisely so the two tasks cannot collide. Do not touch `setPendingTrade`, `setWinner`, or `setDevCardPicker` here.

Find:
```tsx
    setFreeRoadsRemaining(0)
    setDevCardPicker(null)
```

Replace:
```tsx
    dispatch({ type: 'FREE_ROADS_SET', count: 0 })
    setDevCardPicker(null)
```

- [ ] **Step 11: `restoreFromSnapshot` — restore from the match snapshot**

Read `App.tsx:6658-6668` first. `freeRoadsRemaining` is a REQUIRED (non-optional) `MatchSnapshot` field (`src/multiplayer/matchSnapshot.ts:105`, validated at line 211), so there is no `?? 0` fallback today and none must be added — that would be a behavior change, not a migration. This Find block is anchored on the already-migrated `HAS_ROLLED_THIS_TURN_SET` line below it.

Find:
```tsx
    setFreeRoadsRemaining(snapshot.freeRoadsRemaining)
    dispatch({ type: 'HAS_ROLLED_THIS_TURN_SET', rolled: snapshot.hasRolledThisTurn })
```

Replace:
```tsx
    dispatch({ type: 'FREE_ROADS_SET', count: snapshot.freeRoadsRemaining })
    dispatch({ type: 'HAS_ROLLED_THIS_TURN_SET', rolled: snapshot.hasRolledThisTurn })
```

- [ ] **Step 12: Confirm the setter is fully gone and the reads are untouched**

Run: `grep -n "setFreeRoadsRemaining" src/App.tsx`
Expected: no output (zero matches).

Run: `grep -n "freeRoadsRemaining" src/App.tsx`
Expected: exactly 6 hits — the alias declaration (~line 394), the two `> 0` gate reads (~3080, ~3134), the autosave snapshot object literal (~6918), that effect's dependency-array entry (~6962), and `snapshot.freeRoadsRemaining` inside Step 11's dispatch (~6664). **The dependency-array entry must still be the bare `freeRoadsRemaining`, NOT `gameState.turn.freeRoadsRemaining`** — see Global Constraints; `devCardPlayedThisTurn`/`hasRolledThisTurn` two lines above and below it are the live precedent.

- [ ] **Step 13: Typecheck**

Run (from `catan-3d/`): `npx tsc -p tsconfig.app.json`
Expected: clean, no errors.

- [ ] **Step 14: Lint**

Run (from `catan-3d/`): `npx eslint src/App.tsx`
Expected: no output (clean — this is the confirmed baseline on this branch). Any `react-hooks/exhaustive-deps` warning here means Step 12's dependency-array check was resolved the wrong way; fix it by restoring the bare alias, not by adding an `eslint-disable`.

- [ ] **Step 15: Run the full test suite**

Run (from `catan-3d/`): `npm test`
Expected: PASS.

- [ ] **Step 16: Build**

Run (from `catan-3d/`): `npm run build`
Expected: succeeds.

- [ ] **Step 17: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate freeRoadsRemaining to TurnState"
```

---

### Task 3: Migrate `pendingTrade`'s 13 `App.tsx` call sites

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `TradeState.pendingTrade`; `PENDING_TRADE_SET { trade: PendingTrade }` and `PENDING_TRADE_CLEARED` (both from Task 1).
- Produces: `gameState.trade.pendingTrade` as the live source of truth in `App.tsx` — the local `useState` cell for this field fully removed. The `import type { PendingTrade } from './components/hud/TradeOfferPrompt'` line at `App.tsx:25` STAYS (3 surviving non-setState usages, listed in Global Constraints) — do not delete it.

Same verification stack as Task 2 (`tsc -p tsconfig.app.json` + `eslint src/App.tsx` + `npm test` + `npm run build`), and the same bare-`dispatch(...)` rule: no banner/sfx/broadcast side effect is added anywhere. Every one of this field's 13 sites is ABSOLUTE — none reads `prev` — so there is no relative action to design here at all.

- [ ] **Step 1: Replace the `useState` declaration with the alias**

Read `App.tsx:385-394` first. Note the neighbours: `setWinner`'s cell (385) directly above and `isResolvingTradeRef` (a `useRef` whose 5-line comment references `pendingTrade` by name, 387-393) directly below — neither is touched, and that comment stays valid verbatim because the alias keeps the identifier.

Find:
```tsx
  const [pendingTrade, setPendingTrade] = useState<PendingTrade | null>(null)
```

Replace:
```tsx
  const pendingTrade = gameState.trade.pendingTrade
```

- [ ] **Step 2: Verify the classification before converting anything**

Run: `grep -n "setPendingTrade" src/App.tsx`
Expected: exactly 12 remaining setter calls — lines ~1753, 1764, 1767, 4412, 4433, 4438, 4444, 4462, 4488, 4493, 4528, 6425, 6667 minus the declaration just removed. Confirm none of them uses a `(prev) => …` functional-updater form (the whole field is absolute; a single `(prev)` hit would invalidate this task's design). 2 sites pass a trade object (1753, 4412); the other 11 pass `null`. If anything disagrees, STOP and report rather than converting.

Note: a handful of `setPendingTrade` mentions inside COMMENTS (e.g. `App.tsx:4453`) will also match this grep. Comments are not converted — leave them exactly as written; they are accurate historical rationale about the double-click race, and the shape they describe (a state update that isn't visible to a second synchronous call) is equally true of a `dispatch`.

- [ ] **Step 3: `onTradeOffered` — the broadcast receiver**

Read `App.tsx:1752-1755` first. `payload` is typed `TradePayload` (`useRoomChannel.ts:240-245`) — structurally identical to `PendingTrade`, so it assigns to `trade:` with no cast.

Find:
```tsx
    onTradeOffered: (payload) => {
      setPendingTrade(payload)
      playSfx('tradeRequest')
    },
```

Replace:
```tsx
    onTradeOffered: (payload) => {
      dispatch({ type: 'PENDING_TRADE_SET', trade: payload })
      playSfx('tradeRequest')
    },
```

- [ ] **Step 4: `onTradeResolved` + `onTradeCancelled` — the two clearing receivers**

Read `App.tsx:1762-1769` first. Both convert in one edit — they are adjacent and this combined block is unique in the file.

Find:
```tsx
    onTradeResolved: (payload) => {
      applyTradeResolution(payload)
      setPendingTrade(null)
    },
    onTradeCancelled: (payload) => {
      setPendingTrade(null)
      inform(payload.reason)
    },
```

Replace:
```tsx
    onTradeResolved: (payload) => {
      applyTradeResolution(payload)
      dispatch({ type: 'PENDING_TRADE_CLEARED' })
    },
    onTradeCancelled: (payload) => {
      dispatch({ type: 'PENDING_TRADE_CLEARED' })
      inform(payload.reason)
    },
```

- [ ] **Step 5: `proposePlayerTrade` — the local actor's offer**

Read `App.tsx:4406-4419` first. `trade` is the freshly-built `const trade: PendingTrade` on the line above; `broadcastTradeOffered(trade)` a few lines below keeps using that same local const, unchanged.

Find:
```tsx
    const trade: PendingTrade = { fromPlayerId: fromPlayer.id, toPlayerId, offerResource, wantResource }
    setPendingTrade(trade)
    playSfx('tradeRequest')
```

Replace:
```tsx
    const trade: PendingTrade = { fromPlayerId: fromPlayer.id, toPlayerId, offerResource, wantResource }
    dispatch({ type: 'PENDING_TRADE_SET', trade })
    playSfx('tradeRequest')
```

- [ ] **Step 6: `resolveTradeAsHost` — all 3 clears in one function**

Read `App.tsx:4429-4446` first. All three `setPendingTrade(null)` calls in this function convert in a single edit; taking them individually would produce non-unique Find blocks.

Find:
```tsx
  const resolveTradeAsHost = (trade: PendingTrade) => {
    const fromPlayer = playerById.get(trade.fromPlayerId)
    const toPlayer = playerById.get(trade.toPlayerId)
    if (!fromPlayer || !toPlayer) {
      setPendingTrade(null)
      return
    }
    if (toPlayer.resources[trade.wantResource] < 1 || fromPlayer.resources[trade.offerResource] < 1) {
      const reason = `The trade between ${fromPlayer.name} and ${toPlayer.name} fell through — resources changed.`
      setPendingTrade(null)
      inform(reason)
      broadcastTradeCancelled({ reason })
      return
    }
    applyTradeResolution(trade)
    setPendingTrade(null)
    broadcastTradeResolved(trade)
  }
```

Replace:
```tsx
  const resolveTradeAsHost = (trade: PendingTrade) => {
    const fromPlayer = playerById.get(trade.fromPlayerId)
    const toPlayer = playerById.get(trade.toPlayerId)
    if (!fromPlayer || !toPlayer) {
      dispatch({ type: 'PENDING_TRADE_CLEARED' })
      return
    }
    if (toPlayer.resources[trade.wantResource] < 1 || fromPlayer.resources[trade.offerResource] < 1) {
      const reason = `The trade between ${fromPlayer.name} and ${toPlayer.name} fell through — resources changed.`
      dispatch({ type: 'PENDING_TRADE_CLEARED' })
      inform(reason)
      broadcastTradeCancelled({ reason })
      return
    }
    applyTradeResolution(trade)
    dispatch({ type: 'PENDING_TRADE_CLEARED' })
    broadcastTradeResolved(trade)
  }
```

- [ ] **Step 7: `resolvePlayerTrade` — the decline branch**

Read `App.tsx:4459-4466` first.

Find:
```tsx
      const toPlayer = playerById.get(pendingTrade.toPlayerId)
      const reason = `${toPlayer?.name ?? 'The player'} declined the trade.`
      setPendingTrade(null)
      inform(reason)
```

Replace:
```tsx
      const toPlayer = playerById.get(pendingTrade.toPlayerId)
      const reason = `${toPlayer?.name ?? 'The player'} declined the trade.`
      dispatch({ type: 'PENDING_TRADE_CLEARED' })
      inform(reason)
```

- [ ] **Step 8: `resolvePlayerTrade` — the local Pass & Play branch's 2 clears**

Read `App.tsx:4481-4494` first. Both clears in this branch convert in one edit; the surrounding reads of `pendingTrade` (`pendingTrade.wantResource`, `pendingTrade.offerResource`, `applyTradeResolution(pendingTrade)`) all stay exactly as-is — the alias keeps them valid.

Find:
```tsx
        const reason = `The trade between ${fromPlayer?.name ?? 'a player'} and ${toPlayer?.name ?? 'a player'} fell through — resources changed.`
        setPendingTrade(null)
        inform(reason)
        return
      }
      applyTradeResolution(pendingTrade)
      setPendingTrade(null)
      return
```

Replace:
```tsx
        const reason = `The trade between ${fromPlayer?.name ?? 'a player'} and ${toPlayer?.name ?? 'a player'} fell through — resources changed.`
        dispatch({ type: 'PENDING_TRADE_CLEARED' })
        inform(reason)
        return
      }
      applyTradeResolution(pendingTrade)
      dispatch({ type: 'PENDING_TRADE_CLEARED' })
      return
```

- [ ] **Step 9: The expiry-timeout effect**

Read `App.tsx:4512-4534` first, including the long comment above the effect (which stays verbatim) and the `eslint-disable-next-line react-hooks/exhaustive-deps` at 4533. **Do NOT change the dependency array** — `[pendingTrade, onlineInfo]` stays exactly as written (bare alias; see Global Constraints, and note the referential-identity check that guarantees this timer still restarts on exactly the same transitions as before).

Find:
```tsx
      const reason = 'The trade offer expired with no response.'
      setPendingTrade(null)
      inform(reason)
```

Replace:
```tsx
      const reason = 'The trade offer expired with no response.'
      dispatch({ type: 'PENDING_TRADE_CLEARED' })
      inform(reason)
```

- [ ] **Step 10: `resetGame` — full-game reset**

Read `App.tsx:6422-6428` first. Task 2 already converted the `setFreeRoadsRemaining(0)` line directly BELOW this one into `dispatch({ type: 'FREE_ROADS_SET', count: 0 })`; this Find block is anchored on `setWinner(null)` ABOVE it so the two tasks cannot collide. Do not touch `setWinner`.

Find:
```tsx
    setWinner(null)
    setPendingTrade(null)
```

Replace:
```tsx
    setWinner(null)
    dispatch({ type: 'PENDING_TRADE_CLEARED' })
```

- [ ] **Step 11: `restoreFromSnapshot` — always cleared, never restored**

Read `App.tsx:6664-6670` first. `pendingTrade` is deliberately NOT a `MatchSnapshot` field — it is unconditionally dropped on restore, and the comment a few lines below (`App.tsx:6690-6693`, "same 'always reset on restore' treatment devCardPicker/pendingTrade just above get") documents exactly that and stays verbatim. This Find block is anchored on `setBanner(null)` above.

Find:
```tsx
    setBanner(null)
    setPendingTrade(null)
    setDevCardPicker(null)
```

Replace:
```tsx
    setBanner(null)
    dispatch({ type: 'PENDING_TRADE_CLEARED' })
    setDevCardPicker(null)
```

- [ ] **Step 12: Confirm the setter is fully gone and the reads are untouched**

Run: `grep -n "setPendingTrade" src/App.tsx`
Expected: exactly 1 hit — the historical comment at `App.tsx:~4453` ("…before the first call's `setPendingTrade(null)` had actually re-rendered…"). Zero code hits. If a code hit remains, a Find block failed to apply.

Run: `grep -n "pendingTrade" src/App.tsx`
Expected: the alias declaration plus all the READ sites listed in the Data Model, unchanged — including `}, [pendingTrade, onlineInfo])` at ~4534 and `}, [pendingTrade])` at ~4542, **both still bare aliases, NOT `gameState.trade.pendingTrade`**, and `pendingTrade={pendingTrade}` at ~7315.

- [ ] **Step 13: Typecheck**

Run (from `catan-3d/`): `npx tsc -p tsconfig.app.json`
Expected: clean, no errors. (This is what would catch the `import type { PendingTrade }` line at `App.tsx:25` having been wrongly deleted, or a `TradePayload`-to-`PendingTrade` structural mismatch at Step 3.)

- [ ] **Step 14: Lint**

Run (from `catan-3d/`): `npx eslint src/App.tsx`
Expected: no output (clean). Any `react-hooks/exhaustive-deps` warning on the effect at ~4542 means Step 12's dependency-array check was resolved the wrong way; fix it by restoring the bare alias, not by adding an `eslint-disable`.

- [ ] **Step 15: Run the full test suite**

Run (from `catan-3d/`): `npm test`
Expected: PASS.

- [ ] **Step 16: Build**

Run (from `catan-3d/`): `npm run build`
Expected: succeeds.

- [ ] **Step 17: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate pendingTrade to a TradeState reducer slice"
```

---

## Self-Review Notes

Performed against this plan before finalizing:

- **Spec coverage:** both fields the spec's Sequencing item 6 deferred into this sub-plan (`pendingTrade`, `freeRoadsRemaining`) have a task; all 22 call sites this session's exhaustive greps found are covered by line number across Tasks 2–3 (9 + 13); `gameState.ts`/`gameState.test.ts` wiring is Task 1 Steps 4/8; the `turn.ts`-vs-new-file placement decision is argued in the Spec paragraph of the header and again in the Data Model. The spec's item 7 (GameHud prop restructuring) is correctly out of scope and remains the next sub-plan.
- **Placeholder scan:** no "TBD"/"similar to Task N"/unshown code — every Find/Replace block above is the actual current text read from the live files this session, or (Task 1 Step 6) fully-specified new-file content.
- **Type/signature consistency:** all 5 new action shapes in Task 1 match their dispatch-site payloads across Tasks 2–3 exactly — `FREE_ROADS_SET { count }` (3 sites, all pass `count`), `FREE_ROADS_DECREMENTED` (2 sites, no payload), `FREE_ROADS_INCREMENTED { amount }` (3 sites, all pass `amount`), `PENDING_TRADE_SET { trade }` (2 sites, both pass `trade`), `PENDING_TRADE_CLEARED` (11 sites, no payload). `reduceTrade`'s signature matches `reduceProgress`/`reduceTurn` exactly (`(state, action: GameAction, _fullState: GameState)`). `TradeState`'s field name (`pendingTrade`) matches the `App.tsx` alias and the `GameHud` prop name.
- **Relative-vs-absolute re-verified against live code, action by action (all 5):** `FREE_ROADS_DECREMENTED` and `FREE_ROADS_INCREMENTED` confirmed RELATIVE — all 5 of their old call sites used a functional updater reading `prev` (`App.tsx:981`, `1006`, `1895`, `2979`, `5018`), so the reducer computes from `state.freeRoadsRemaining` and never from a dispatch-site closure read. `FREE_ROADS_SET` confirmed ABSOLUTE at all 3 sites — a literal `2` (1195), a literal `0` (6426), and `snapshot.freeRoadsRemaining` (6664), none reading the field's own prior value. Both `PENDING_TRADE_*` actions confirmed ABSOLUTE across all 13 sites — grepping every one found zero `(prev) => …` forms for this field anywhere in `App.tsx`.
- **One correction to the briefing this plan deliberately makes, verified live:** the incoming research note asserted that the autosave effect's dependency-array entry for `freeRoadsRemaining` (`App.tsx:6962`) must become `gameState.turn.freeRoadsRemaining`. Reading that array in full shows the opposite is the established convention and the one `react-hooks/exhaustive-deps` actually enforces: every already-migrated field that HAS an alias appears bare (`revealedTileIds`, `totalRollsThisGame`, `currentPlayerIndex`, `gamePhase`, `barbarianTrackPosition`, `devCardPlayedThisTurn`, `hasRolledThisTurn`), and only the alias-less fields appear as `gameState.board.*` member expressions. The effect carries no `eslint-disable`, and `npx eslint src/App.tsx` is clean on this branch, so the bare-alias form is verified-correct rather than merely assumed. Net: zero dependency-array edits, and both App.tsx tasks carry an explicit lint gate so a wrong call fails loudly.
- **Two live asymmetries confirmed pre-existing and deliberately preserved, not fixed:** the dev-card Road Building path overwrites the counter to `2` while the progress-card path adds `2` (Task 2 Steps 6 and 9 each name the other); and `applyRoadBuildingPlay`'s absolute set can therefore discard an already-pending free road. Both predate this sub-plan and are outside a pure-refactor's scope, matching this project's established precedent of preserving rather than silently patching pre-existing gaps.
- **Task decomposition rationale:** 3 tasks rather than the 2 the briefing steered toward. Task 1 is the whole reducer layer (both slices' work, zero `App.tsx` changes, mirroring Sub-plan 6's Task 1). Tasks 2 and 3 split the `App.tsx` work by FIELD rather than shipping 22 edits to a 7,500-line file as one reviewable unit, because the two fields are genuinely independent review units: different slices, different action families, different classification profiles (5 relative + 3 absolute + 1 deletion vs. 13 uniformly absolute), and one contains the sub-plan's only deletion-rather-than-conversion step. A reviewer can meaningfully reject either without touching the other, which is the writing-plans split test. The adjacency at `resetGame` (6425/6426) and `restoreFromSnapshot` (6664/6667) is the one place the two tasks come close; every Find block at those four lines is anchored on a line the other task does not touch, and each anchoring is called out inline.
