# Game State Reducer — Players Slice Design Spec

## Summary

Extract `players: Player[]` out of `catan-3d/src/App.tsx`'s `useState` and into `GameState`, as the second slice of the `GameState`/`GameAction`/`reduceGame` architecture (parent spec: `docs/superpowers/specs/2026-08-19-game-state-reducer-design.md`; first slice, `board`, already merged as PR #18).

This is the slice the parent spec explicitly called out as needing to migrate early (`§React Integration & Migration Order`): almost every real game action writes to `players`, so leaving it on `useState` keeps every future slice migration stuck calling the old `setPlayers` directly for its own player-side effect.

**Confirmed real scope** (verified against `App.tsx`, not estimated): **87 `setPlayers(...)` call sites across 60 top-level functions, plus 18 more inline duplicates inside `useRoomChannel`'s receive handlers** (22 of the 87 total sites). That receiver duplication is real, pre-existing debt, not something this project introduces — and it's the direct cause of at least one shipped bug (the Medicine city-discount broadcast gap found and fixed during the board slice, PR #18 Task 9). Migrating a function's write through `dispatchGameAction` lets its matching receive handler be **deleted**, not migrated — both the deciding client and every receiver now run the exact same reducer code for the exact same action, closing this entire class of drift permanently instead of case-by-case.

Given the size, this is one design covering **six sequential sub-plans**, each its own implementation plan and its own PR, not one big-bang plan. The app keeps working after every sub-plan — the old `players` `useState` isn't deleted until the last one.

## Why not a smaller plan

A smaller plan (migrate a handful of functions, leave `players` on `useState`) was considered and rejected in its naive form: if some writers go through `dispatch` and most still call the old `setPlayers` directly, the `useState` can't be deleted (still the real source of truth for the un-migrated majority) and `gameState.players` would either be dead code or a second, diverging copy.

The resolution isn't a bigger plan, it's a bridge: a single `LEGACY_SET_PLAYERS` action (`{ type: 'LEGACY_SET_PLAYERS', updater: (prev: Player[]) => Player[] }`), dispatched wherever a not-yet-individually-migrated function currently calls `setPlayers(updater)` — mechanically, 1:1, same updater function, just wrapped. This lets `gameState.players` become the sole source of truth and the old `useState` be deleted **immediately, in sub-plan 1**, not deferred to sub-plan 6. Every function keeps working exactly as before (the bridge changes nothing about *when* or *how* players state updates, only *which line of code* triggers it), while the 4 functions sub-plan 1 actually targets get real, typed, testable actions. Later sub-plans shrink the bridge's surface one function at a time by replacing its `LEGACY_SET_PLAYERS` call with a real action — this is what "migrating a function" concretely means from sub-plan 2 onward.

This does NOT reopen the generic-updater objection in the Global Constraints below — that objection is about actions that need to be *broadcast* (a function can't cross the network as JSON). `LEGACY_SET_PLAYERS` is never broadcast; the functions still using it already have working multiplayer parity the old way (the same function runs on both the deciding client and every receiver), which the bridge doesn't touch or need to touch.

One more consequence: `players` is *read* in ~95 places in `App.tsx` beyond the 87 writes (JSX props, `.map`/`.find`, derived values). Renaming every read site is not part of this migration — a read-only `const players = gameState.players` declared right after the `useReducer` call keeps every existing read working unchanged; only write sites (`setPlayers` calls) change.

## Global Constraints

Everything in the parent spec's Global Constraints applies unchanged (reducers are pure appliers; single-client authority decisions happen before dispatch, never inside a reducer; cross-domain writes are the norm; validation stays outside the reducer). This spec adds:

- **One `GameAction` variant per migrated function** — the one deliberate exception is `LEGACY_SET_PLAYERS` (see "Why not a smaller plan" above), a single bridge action for functions not yet individually migrated, never broadcast, never a stand-in for a function's *real* action once that function is actually migrated. A few functions have more than one genuinely distinct effect shape once migrated for real (e.g. `applyBarbarianAttackResult`'s winner-bonus vs. board-wide knight deactivation) — those get one action variant per distinct shape, not one lumped action with optional fields.
- **Migrating a function's `players` write does NOT require migrating that function's other domain state.** A knights function still writing `knightSupply`/`knightPieces` via `useState` alongside a new `dispatchGameAction({ type: 'KNIGHT_RECRUITED', ... })` call is correct, not a hack — `reducePlayers` gets a case for that action today; `reduceKnights` gets its own case whenever the knights slice migrates, per the parent spec's "most actions are independently handled by 2+ sub-reducers" composition model. An action is equally valid handled by exactly one sub-reducer.
- **Sub-reducers adopt the 3-argument signature now**: `(sliceState, action, fullState) => sliceState`, matching the parent spec's original composition design. Board's own cases don't need it and keep ignoring the third parameter — but several `players` cases do (see below), and `reduceGame`'s composition call needs to pass `fullState` uniformly to every sub-reducer either way, so the signature upgrades for all of them together, not just the ones using it yet.
- **Migrating a function through the reducer means deleting its receive-handler duplicate**, when one exists (18 identified below). The receive handler calls `dispatchGameAction(action, false)` instead of hand-repeating the effect. This is a required part of migrating that function, not an optional follow-up — leaving the duplicate in place after the local side migrates re-creates exactly the drift risk this project exists to close.

## Data Model

```ts
interface GameState {
  board: BoardState    // already merged
  players: Player[]    // this spec — bare array, matching the parent spec's
                        // own GameState sketch; no wrapper object for a
                        // single field
}
```

`longestRoadHolderId`/`largestArmyHolderId` (nominally listed under "players" in the parent spec's full data model) stay on `useState`, out of scope here — they're driven by their own trophy-recalculation logic (`game/trophies.ts`), unrelated to any of the 87 `setPlayers` call sites, and migrate whenever that recalculation logic gets its own slice.

## GameAction — composition

`GameAction` becomes a union of per-slice action types, extending the pattern the board slice already established:

```ts
// game/gameState.ts
export type GameAction = BoardAction | PlayersAction
```

`PlayersAction` (new, in `game/reducers/players.ts`) grows one variant per migrated function across the six sub-plans below — not designed exhaustively in this spec (see the parent spec's own precedent: exact per-action field lists are an implementation-planning decision). Four board actions get one field added each, since their `players`-side case needs data the board-only action didn't carry (verified against current code, not speculative — each is a value the deciding client already computes before dispatch today, just not yet threaded onto the action):

| Action | New field | Why |
|---|---|---|
| `BUILD_SETTLEMENT` | `isSetup: boolean` | gates whether cost is deducted |
| `BUILD_CITY` | `costOverride?: Partial<Resources>` | Medicine discount — this also lets `applyCityPlacement` drop its broadcast special-case from board Task 9 and go through `broadcastGameAction`'s generic switch like every other board action |
| `BUILD_ROAD` | `isSetup: boolean`, `isFreeRoad: boolean` | same two reasons, closes board Task 10's broadcast special-case the same way |
| `REMOVE_ROAD` | `playerId: number`, `ownerId: number` | `reducePlayers`'s case needs to know who spent the Diplomacy card and whose road-supply count to credit |

`reduceBoard`'s existing cases ignore these new fields — no behavior change there.

## `fullState` — where it's actually needed

Most "reads other domain state" cases in the real functions (verified via full-codebase survey) turn out to be **pre-dispatch eligibility checks** that already happen before `dispatch` is called today (e.g. `playEngineering`/`playIntrigue` checking `board.settlements` to decide whether the action picker even opens) — those don't need `fullState`, they're already correctly outside the reducer per the parent spec's validation rule, and stay that way.

A smaller set of cases need a **computed value** derived from other state at dispatch time (e.g. `bankTrade`'s port rate from `board.settlements`) — same resolution as `BUILD_CITY`'s `costOverride`: the deciding client computes the value once, before dispatch, and it rides on the action payload. Still no `fullState` read inside the reducer.

One case is different: **`PILLAGE_CITY`'s players-side effect** (citiesRemaining/settlementsRemaining/cityWalls adjustment) needs to know the vertex is still a city owned by this player *at the moment the reducer runs*, to be safely idempotent against a duplicate dispatch — the same race CodeRabbit found in board's post-merge fix (c30c01c), where a `useRef`-based guard was needed specifically because the pre-dispatch check read a stale React-render snapshot. Inside the reducer, reading `fullState.board.settlements` doesn't have that staleness problem — React delivers the reducer its true current state synchronously on every dispatch, which is the actual fix for this whole bug class, not a workaround for it. `reducePlayers`'s `PILLAGE_CITY` case reads `fullState.board.settlements` to no-op the same way `reduceBoard`'s own case already does. (Removing the now-probably-redundant `useRef` guard is a real follow-up opportunity but is out of scope for this spec — confirming it's actually redundant needs its own focused look at every code path that calls `applyPillage`, not a side effect of the players migration.)

## Migration order — six sub-plans

Verified inventory (function, line, domain, receiver-duplicate) is the full-codebase survey result; each sub-plan's own implementation plan re-confirms line numbers at write time since earlier sub-plans shift them.

1. **Building** — `applySettlementPlacement`, `applyCityPlacement`, `applyRoadPlacement` (closes board's own transitional debt), `grantResourcesForVertex`. No receiver duplicates in this group. This sub-plan also does the one-time infrastructure work every other sub-plan depends on: introduces `LEGACY_SET_PLAYERS`, converts every other `setPlayers` call site (all of them, across every bucket below) to the bridge, and deletes the old `useState<Player[]>` — see "Why not a smaller plan" above. Sub-plans 2-6 then each shrink the bridge's surface by replacing their own functions' `LEGACY_SET_PLAYERS` calls with real actions; they don't touch `useState` at all, it's already gone.
2. **Trading + robber/pillage** — `applyTradeResolution`, `bankTrade`, `applyCommodityTrade`, `applyCommercialHarborEffect`, `applyRobberMove`, `applyPillage`, `applyDiscard`. Receiver duplicates to delete: `onBankTrade`. (`moveRobber`'s own chase-robber-knight deactivation call is deliberately left for sub-plan 3 — see Cross-bucket functions below.)
3. **Barbarians + knights** — `applyBarbarianAttackResult`, `resolveTaxation`, `armTaxation`, `handleKnightVertexSelect`, `handleKnightSelect`, `activateKnight`, `promoteKnight`, `playSmithing`, `playEncouragement`, plus `moveRobber`'s chase-robber-knight-deactivation call carried over from sub-plan 2. Receiver duplicates to delete: `onKnightRecruited`, `onKnightActivated`, `onKnightPromoted`, `onKnightMoved`, `onKnightDisplaced`, `onKnightDeactivatedAfterChase`, `onSmithingPlayed`, `onEncouragementPlayed`, `onIntrigueResolved`, `onTreasonRemoved`, `onTaxationResolved`, plus `onProgressCardPlayed`'s `taxation` branch. (Most of this sub-plan's receiver payload, by count.)
4. **Progress cards** — the largest bucket (~21 functions: `applyYearOfPlentyEffect` through `playTreason`, excluding `resolveTaxation`/`armTaxation` which are bucket 3). Splits into two implementation plans on its own merit once scoped for real (card-spend-only effects vs. card-effect-resolution effects is the likely split, decided when this sub-plan is actually planned). Receiver duplicates to delete: `onResourceMonopolyPlayed`, `onTradeMonopolyPlayed`, plus `onProgressCardPlayed`'s `invention`/`guildDues`/`espionage`/`intrigue` branches (its `merchantFleet` branch waits for sub-plan 5 — see below).
5. **City improvements + merchant + turn-misc** — `applyCityImprovementPurchase`, `buyCityImprovement`, `buildCityWall`, `playEngineering`, `resolveFreeCityWall`, `playMerchantFleet`, `playMerchant`, `applyTurnAdvance`, `buyDevCard`, `spendDevCard`, `applyRollResult`. Receiver duplicates to delete: `onCityWallBuilt`, `onCityImprovementPurchased`, `onDevCardBought`, plus `onProgressCardPlayed`'s remaining `merchantFleet` branch (the handler itself — an object property, not a whole function — is only fully deletable once every branch across sub-plans 3-5 is gone).

**Cross-bucket functions:** two functions have `setPlayers` calls that don't fit one bucket. `moveRobber` (robber-pillage in spirit) has a knights-domain call (chase-robber deactivation) deliberately deferred to sub-plan 3, migrated alongside the rest of the knights actions rather than splitting knights logic across two sub-plans. `onProgressCardPlayed` is one receive-handler function with 5 independent branches belonging to 3 different buckets (progress-cards, barbarians, merchant) — each sub-plan migrates only its own branch; the handler function itself isn't deleted until sub-plan 5 removes the last one.

6. **Final cutover** — `resetGame`/`restoreFromSnapshot`'s whole-array replace gets real `RESET_PLAYERS`/`RESTORE_PLAYERS`-shaped actions (mirroring board's `RESET_BOARD`/`RESTORE_BOARD`), replacing their `LEGACY_SET_PLAYERS` calls from sub-plan 1. Once this lands, `LEGACY_SET_PLAYERS` has zero remaining callers and gets deleted from `PlayersAction` entirely — that's this sub-plan's actual completion signal, not a `useState` deletion (already gone since sub-plan 1).

Sub-plans 2-6 are independently orderable relative to each other (no cross-dependencies between e.g. knights and progress cards); the order above just goes smallest/clearest-first. Sub-plan 1 must go first — every other sub-plan depends on the bridge and the reducer infrastructure it introduces.

## Side Effects & Testing

Unchanged from the parent spec: `describeAction`-style pure functions colocated with each sub-reducer, called by the shared `dispatchGameAction`; every migrated case gets a direct Vitest unit test on the pure reducer, no React rendering needed — matching the board slice's own testing approach.

## Out of Scope

Same exclusions as the parent spec (network-protocol unification, `GameHud.tsx` prop-drilling, persistence restructuring, bundle splitting, the far-future full UI rebuild), plus: every other domain's own non-player state (`knightSupply`, `progressCardDecks`, `barbarianTrackPosition`, etc.) — those stay `useState` until that domain's own future slice project, unaffected by this one migrating just the `players`-side half of the functions that touch them.

## Amendment (2026-09-01): the `describeAction`/`dispatchGameAction` spine is dropped, not built

§Side Effects & Testing above committed every migrated `players` case to a `describeAction`-style pure function, colocated with the sub-reducer, called through the shared `dispatchGameAction` so banners/sfx would flow through one place. None of the six sub-plans built it — not a scope violation by any individual sub-plan, but a real gap between this design and what they collectively shipped. Flagged prominently at sub-plan 6's finish and left open as a decision for later.

That decision is now made: **don't build it.** As of 2026-09-01, `App.tsx` has 231 `dispatch({...})` call sites and only 8 route through `dispatchGameAction` — the other 223 each hand-write their own `inform()`/`playSfx()` at the call site, exactly the pattern this spine was meant to replace. The file has grown past 8,000 lines since this spec was written (a full Cities & Knights progress-card/knight-lifecycle/trade build-out landed in the interim), so retrofitting the spine now would mean touching all 223 sites — a refactor larger in scope than the original six-sub-plan migration this spec itself covers, for a DX/consistency nicety rather than a functional gap. The per-call-site `inform()`/`playSfx()` pattern works correctly today and has for the whole life of this project; there is no live bug this spine would fix.

**Decision, not a placeholder**: this is the formal record the parent spec's own design asked for. No future sub-plan should reopen this without a new, separately-scoped design — if a real pain point (not just architectural tidiness) surfaces later, treat it as a fresh proposal against the codebase as it exists then, not a resumption of this one.
