# Game State Reducer — Design Spec

## Summary

Extract a canonical `GameState`/`GameAction`/`reduceGame` reducer out of `catan-3d/src/App.tsx`'s current ~78 `useState` calls (~7,300 lines). This is sub-project #1 of a 5-finding architecture audit (2026-08-18, "thermonuclear skill"): the audit's own recommended first step was narrower than its full finding list — "create `src/game/gameState.ts` containing only `GameState`, `GameAction`, and `reduceGame` before adding the next rule" — and this spec scopes to exactly that, deliberately deferring the audit's other findings (network-protocol unification in `useRoomChannel.ts`, `GameHud.tsx`'s 96-prop boundary, persistence/snapshot restructuring, bundle splitting) as separate future projects that this reducer makes easier, not harder, to do later.

A companion ponytail-audit (2026-08-19) found the codebase otherwise lean — 3 small findings, already fixed (`shuffle` deduplication, an inlined single-caller hook) — so this spec is not compensating for general sprawl, just the one specific, already-diagnosed problem: one file owns game engine, UI controller, network adapter, and persistence layer simultaneously.

`CONVENTIONS.md` (repo root) documents 3 patterns this codebase already established the hard way: the trusted-apply broadcast pattern, the online-parallel/local-sequential gating pattern, and the module-scope-impure-helper convention. This design doesn't replace any of them — it gives the first and third a structural home instead of a convention someone has to remember.

**Out of scope for this spec**, explicitly: network-protocol unification (`useRoomChannel.ts`'s ~48 broadcast wrappers), `GameHud.tsx`'s prop-drilling cleanup, persistence/snapshot restructuring, JS bundle splitting, and the full from-scratch UI rebuild the user has flagged as a separate, far-future project. Each becomes easier once this lands; none is required to land it.

## Global Constraints

- **Migration is incremental, slice by slice** — not a big-bang rewrite. `reduceGame` and remaining `useState` calls coexist in `App.tsx` throughout the migration; the app stays fully working after every single slice, not just at the end.
- **Reducers are pure appliers, always.** No `Math.random()`, no `inform()`/`warn()`/`playSfx()`, no reading `Date.now()` — nothing a sub-reducer case does may vary between two calls with the same `(state, action)` input. This isn't new: it's `CONVENTIONS.md`'s module-scope-helper convention, now enforced structurally instead of remembered.
- **Any single-client "authority" decision happens in the action creator, before dispatch — never inside a reducer.** This covers two categories: genuine randomness (dice rolls, resource/commodity steals) and deterministic-but-must-not-independently-diverge results (`resolveBarbarianAttack` has no randomness in it, but every client computing it independently the instant their own local state happens to reach the trigger condition is exactly the risk the existing roller-only-authority convention exists to prevent). Both categories: computed once by the deciding client, carried as data in the dispatched action, never recomputed by a receiver.
- **Cross-domain writes are the norm, not the edge case.** Confirmed by reading the real mutation functions (`applyPillage`, `applyRobberMove`, `applyBarbarianAttackResult`, and by extension most of the ~38 `applyX`/`resolveX` functions in `App.tsx` today): nearly every action that changes board or subsystem state also touches something on `Player` (resources, cityWalls, knightPieces, progressCards, defenderOfCatanCount). The design must handle this as the common case, not a special one.
- **Validation stays outside the reducer, at the pre-dispatch boundary** — the same place `CONVENTIONS.md`'s trusted-apply pattern already puts it (a local click handler's guard, a receive handler's payload check). By the time an action reaches `dispatch`, it's already trusted; sub-reducer cases apply unconditionally.

## Data Model

### `GameState` — composed of domain slices

Sub-reducers live under `catan-3d/src/game/reducers/`, one file per domain, mirroring this codebase's existing file split (`game/knights.ts`, `game/progressCards.ts` already separate concerns this way):

```ts
interface GameState {
  turn: TurnState           // gamePhase, setupStage/setupStepIndex, currentPlayerIndex,
                             // lastRoll, hasRolledThisTurn, winner, totalRollsThisGame,
                             // consecutiveDoublesThisTurn
  board: BoardState         // tiles, settlements, roads, robberTileId, robberActive
  players: Player[]         // the players array itself, longestRoadHolderId, largestArmyHolderId
  knights: KnightsState      // pendingKnightRecruit, armedKnightAction, knightsPromotedThisTurn,
                             // chasingRobberKnightId, pendingFreeCityWall
  barbarians: BarbariansState // barbarianTrackPosition, activeBarbarianAttack, pillageQueue,
                              // winnerDrawQueue, pendingTaxation
  progressCards: ProgressCardsState // progressCardDecks, progressCardOverLimitPlayerIds,
                                     // discardPlayerIds/Selection, scienceFreeResourcePlayerIds,
                                     // alchemyPreset, craneDiscountPlayerId, pendingMedicineUse,
                                     // pendingInventionSwap, merchantFleetRate, pendingGuildDues,
                                     // pendingEspionage, pendingDiplomacyRemoval,
                                     // pendingIntrigueDisplace, pendingTreasonPlacement
  cityImprovements: CityImprovementsState // metropolisHolders, metropolisVertexIds, pendingMetropolisClaim
  merchant: MerchantState    // merchantTileId, merchantHolderId, pendingMerchantPlacement
  rules: GameRules
}
```

Exact per-slice field lists are finalized during implementation planning, not this spec — the grouping above is the real result of reading every `useState` declaration in `App.tsx` (confirmed count: ~78), not a guess.

**Explicitly NOT in `GameState`** — stays as plain `useState` in `App.tsx`, unmigrated: `onlineInfo` (this client's own connection identity), `playerCount`/`playerNames` (pre-game setup-screen input), `isFreeCamActive`/`canvasInstance`/`boardInstance` (rendering/remount mechanics), `diceDisplayMode`/`diceRoll`/`physicsRoll`/`isRolling` (this client's own dice-animation targets, derived from but distinct from the real roll value), `remoteHover` (transient cursor-preview data), `banner`/`eventLog`/`chatMessages` (this client's own activity feed — see Side Effects below for how these still get populated).

### `GameAction` — one discriminated union

Built from what the ~38 existing `applyX`/`resolveX` trusted-mutation functions already take as arguments — this isn't inventing new data shapes, it's naming what already exists:

```ts
type GameAction =
  | { type: 'PILLAGE_CITY'; vertexId: string; playerId: number }
  | { type: 'TAXATION_RESOLVED'; playerId: number; tileId: string; steals: TaxationSteal[] }
  | { type: 'ROBBER_MOVED'; tileId: string; thiefId: number; victimId: number | null; stolenItem: StolenItem | null }
  | { type: 'BARBARIAN_ATTACK_RESOLVED'; result: BarbarianAttackResult }
  // ... one variant per migrated mutation function, added incrementally per slice
```

## Composition Mechanism

`reduceGame(state, action)` composes the sub-reducers. Each sub-reducer signature is `(sliceState, action, fullState) => sliceState` — free to *read* any other slice via `fullState` (needed for cases like `applyPillage` validating against `board.settlements` before `players` writes), but only ever writes its own slice's return value.

Most actions are independently handled by 2+ sub-reducers at once — this is the normal case, not a special one (see Global Constraints). `PILLAGE_CITY` gets a case in `reduceBoard` (downgrade the settlement) and a case in `reducePlayers` (supply counters, city walls) — two single-slice writers reacting to the same action, standard `combineReducers` shape. Neither needs the other's freshly-computed output; each works from the action's own payload plus its own slice's prior state.

```ts
function reduceGame(state: GameState, action: GameAction): GameState {
  return {
    turn: reduceTurn(state.turn, action, state),
    board: reduceBoard(state.board, action, state),
    players: reducePlayers(state.players, action, state),
    knights: reduceKnights(state.knights, action, state),
    barbarians: reduceBarbarians(state.barbarians, action, state),
    progressCards: reduceProgressCards(state.progressCards, action, state),
    cityImprovements: reduceCityImprovements(state.cityImprovements, action, state),
    merchant: reduceMerchant(state.merchant, action, state),
    rules: reduceRules(state.rules, action, state), // same shape as every other slice —
                                                      // just usually one action type (SET_RULES)
                                                      // replacing the whole object at once
  }
}
```

## Side Effects (banner text, sound) — kept out of the reducer

Every one of the ~38 real mutation functions today calls `inform()`/`warn()` (which call `setBanner`/`logEvent` — `useState` setters on *other* hooks) and often `playSfx()` — confirmed by grep: 80 call sites across `App.tsx`. None of this can live inside a pure reducer case.

**Resolution:** one `dispatchGameAction(action)` wrapper in `App.tsx` (not per-slice), called both by the deciding client and by every receive handler after validation:

```ts
function dispatchGameAction(action: GameAction, isDeciding: boolean) {
  dispatch(action)
  if (isDeciding && onlineInfo) broadcastAction(action)
  describeAction(action, playerById) // fires inform/warn/playSfx; reads current
                                      // name/label lookups, never mutates GameState
}
```

`describeAction` is colocated with each sub-reducer (e.g. `describePillageAction` exported alongside `reduceBoard`) — a pure function from `(action, playerById)` to the banner text/sound to fire, called on *every* client that processes the action (matching today's existing behavior, where `inform()` already fires identically on the actor's and every receiver's client — a pillage needs to show up on both screens, and already does).

## React Integration & Migration Order

`App.tsx` gets one `const [gameState, dispatch] = useReducer(reduceGame, initialGameState)`, coexisting with whatever hasn't migrated yet. One slice migration = write the sub-reducer + its action types + `describeAction` cases, replace that slice's `useState` calls with `gameState.<slice>` reads, replace `setX` calls with `dispatchGameAction({ type: '...' })`, delete the dead `useState` declarations, update any derived/selector values (e.g. `activePillageTarget`) to read from the new state shape.

**Migration order is not free**, given cross-domain writes are the norm: because so many real actions write to `players` specifically, migrating `players` *late* means every other slice's migration is stuck in a hybrid state — dispatching for its own domain but still calling the old `setPlayers` directly for the player-side effect — until `players` also migrates. **`players` should migrate early** (after `board`, since some player-domain actions need to read board state), not "whenever convenient." Exact ordering for the remaining slices is an implementation-planning decision, not this spec's.

## Multiplayer Integration

Today's trusted-apply triple (local mutation function call + broadcast call + receive handler that validates then calls the same function) collapses into one shape: the action creator decides the action (including any randomness or attack-resolution the roller-only-authority constraint requires), calls `dispatchGameAction(action, true)` locally, which also broadcasts it. The receive handler validates the action against current local state (the same checks it does today), then calls `dispatchGameAction(action, false)` — the same call shape, `isDeciding: false` so it doesn't re-broadcast.

`useRoomChannel.ts`'s ~48 broadcast wrapper pairs are untouched by this project — each migrated slice still gets its own `broadcastX`/`onX` pair, now calling `dispatchGameAction` instead of the old trusted-apply function. Collapsing those wrapper pairs into "broadcast the action directly, dispatch on receipt" is the deferred network-protocol-unification project; this spec makes that a mechanical follow-up once every slice is migrated, not a redesign.

## Testing

Reducers are pure functions — every migrated sub-reducer becomes directly unit-testable with Vitest, no React rendering, no mocking `useState`, matching how `game/knights.ts`'s `resolveBarbarianAttack` is already tested today. This is a concrete, immediate benefit of each slice's migration, not a separate testing project: a slice migration's own task should include tests for its sub-reducer's cases, the same TDD discipline this project already applies to pure game-logic functions.

## Out of Scope

- Network-protocol unification (`useRoomChannel.ts`'s ~48 broadcast wrappers → one typed `GameEvent` union) — audit finding #2, deferred, made easier by this spec, not required by it.
- `GameHud.tsx`'s 96-prop boundary cleanup — audit finding #3, deferred; a smaller `GameState` object makes deriving a focused HUD view-model easier later, but that derivation isn't part of this spec.
- Persistence/snapshot restructuring (`MatchSnapshot` serialization currently hand-copies individual fields in parallel with live state) — audit finding #4, deferred. Once `GameState` exists, snapshot save/restore naturally simplifies toward "serialize/restore one object," but that restructuring is its own project.
- JS bundle splitting (4.15MB unsplit) — audit finding #5, unrelated to state management, deferred.
- The full from-scratch UI rebuild using the `impeccable` skill and proper UI kits — user-flagged, explicitly far-future, not started until raised explicitly.
