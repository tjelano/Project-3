# App.tsx Reducer Refactor — Finishing the Players-Slice Migration

## Summary

An architecture audit (2026-08-18) found `App.tsx` acting as game engine + UI controller + network adapter + persistence layer simultaneously, and ruled it "not approved for further feature growth" until the remaining ad-hoc state is centralized into the same `GameState`/`GameAction`/`reduceGame` structure the players-slice migration already gave `settlements`/`roads`/`ships`/`resources`/`devCards`/etc. The user's own stated intent was to do this refactor *before* the Seafarers expansion; Seafarers shipped anyway (across sessions) and grew `App.tsx` further — it's now 7,513 lines with 76 `useState` cells (up from 6,416/~72), `multiplayer/useRoomChannel.ts` is 1,529 lines, and `components/hud/GameHud.tsx`'s prop interface has grown past the original audit's own "96-prop" figure.

**Goal:** every piece of state that must be identical across clients moves into the reducer, following the exact trusted-apply discipline already proven on the players slice. Genuinely local, per-client state (camera, chat, dice-roll animation display, connection identity) stays as `useState`. A `/ponytail-audit` was run against `App.tsx`/`useRoomChannel.ts`/`GameHud.tsx` specifically to feed this design; its findings (verified against the actual code, not taken at face value) are folded in below.

## Global Constraints

- **Trusted-apply pattern (`CONVENTIONS.md` §1) is unchanged and non-negotiable.** One client decides a non-deterministic value, broadcasts it, every client — including the decider — applies the exact same decided result via a shared function, never re-deriving it. This refactor moves *where* that decided value lives (reducer instead of `useState`), never *how* it gets decided.
- **Composition pattern extends, doesn't change.** `GameState`/`GameAction` currently compose as `{ board: BoardState; players: Player[] }` / `BoardAction | PlayersAction`, with `reduceGame` running every sub-reducer against every action unconditionally (each ignores actions it doesn't own via its own switch's default case) — confirmed by reading `game/gameState.ts` directly. New slices follow this exact shape: own file, own action union member, one more line in `reduceGame`. No new composition mechanism.
- **The classification rule (below) is the binding test for "does this state move."** Don't blanket-migrate a whole category just because it looks similar to something that qualifies.
- **The broadcast-layer collapse (Sub-plan 1) must not regress compile-time type safety.** Every event's payload type must still be checked against its handler's parameter type by `tsc` — a fully generic, stringly-typed dispatch table is explicitly rejected for this reason (see Actions section).
- **`npm run build` (not just `tsc`/`eslint`/`vitest`) is required before any task is reported done** — this project's own history has a real case (Board Foundation, Seafarers sub-plan 1) of a broken Vite asset import that only `npm run build` caught.
- **Bare `npx tsc --noEmit` checks zero files on this project — do not use it as a task's typecheck command.** `catan-3d/tsconfig.json` is solution-style (`"files": []` + project references), so `tsc --noEmit` exits 0 unconditionally without checking anything. Found during Sub-plan 1's final review: every per-task "tsc clean" claim in that sub-plan's ledger was vacuous, saved only by the `npm run build` requirement above (which runs the real `tsc -b`) already catching what mattered. Every future sub-plan's tasks must use `npx tsc -p tsconfig.app.json` (or rely solely on `npm run build`) as the real per-task typecheck gate.

## Classification Rule

A piece of state moves into the reducer if it meets **either**:

1. **It's written from both the local actor's own dispatch path and a broadcast-receiver block** — the strongest possible signal, since it means the app is *already* hand-syncing this state across clients (manually, via matched `useState` setters in both places), and the reducer replaces that hand-rolled duplication with the trusted-apply pattern the rest of the codebase already trusts.
2. **Divergence would produce an observably wrong or inconsistent game** even if it isn't literally broadcast today — e.g., a turn-flow flag that gates what actions are legal.

It does **not** move if:
- It's a **pure derivation** of already-synced state, computed identically on every client every render (no stored decision to synchronize at all).
- It's genuinely **per-client** (connection identity, camera, which cosmetic dice model to render) — a value that is *expected* to differ between clients.
- It's **deterministically regenerated** from a shared seed rather than transmitted (the board's own `tiles` array, built from `buildHexBoard(roomCode)` — already correctly excluded from the snapshot/reducer for this exact reason).
- It's a **pure rendering mechanism**, not game data (`boardInstance`, a React remount-key counter with no game meaning).

**Verified worked examples**, found by applying this rule against the actual code rather than assuming:

- `winner` looked like an obvious reducer candidate (must match across clients) but turned out to be a pure `useMemo`-shaped derivation of `players`, `settlements`, and the trophy-holder ids — all either already reducer-tracked or already migrating. Once its own inputs land in the reducer, `winner` needs no stored state anywhere, reducer or otherwise.
- `freeRoadsRemaining` and `revealedTileIds` were confirmed via rule 1: both are set only inside the shared trusted-apply functions (`applyRoadPlacement`/`applyShipPlacement`, `applySettlementPlacement`) called identically by the local actor and every broadcast receiver, and both already round-trip through the match snapshot manually.
- A batch check of 9 more candidates (`robberActive`, `barbarianTrackPosition`, `merchantTileId`/`merchantHolderId`, `devDeck`, `progressCardDecks`, `longestRoadHolderId`, `metropolisHolders`, `pendingTrade`, `knightsPromotedThisTurn`) confirmed the same dual-write-plus-snapshot pattern for every one.
- The ~18 "armed special action" states (Guild Dues, Espionage, Treason, etc.) looked like they should migrate alongside the queues, but spot-checking 3 (`pendingGuildDues`, `pendingEspionage`, `pendingTreasonPlacement`) found **no broadcast receiver for the arm step at all** — only their eventual resolution is broadcast (and that resolution already dispatches through the reducer today). The "armed, waiting for a target click" state is genuinely local to the acting player's own screen. Most of these should stay `useState`; each gets checked against the rule individually as its sub-plan reaches it, not blanket-migrated.

## Ponytail-Audit Findings (verified, feeding this design)

1. **5 near-identical pending-player-queue mechanisms** (`discardPlayerIds`, `scienceFreeResourcePlayerIds`, `goldFieldResourcePlayerIds`, `pillageQueue`, `winnerDrawQueue`) share the same online/local-split "active id" derivation shape (online: is-local-player-in-queue; local pass-and-play: front-of-queue) and the same resolve-removes-one-entry shape — but their *resolution payloads* are genuinely different (`applyDiscard(playerId, counts: {...})`, `applyPillage(vertexId, playerId, ...)`, `handleBarbarianWinnerDraw(track)`, single-resource picks for Science/Gold) and `pillageQueue`'s element type is an object, not a bare player id like the other 4. A 6th (`progressCardOverLimitPlayerIds`) is a simpler variant with no online split at all. **Correction from the original audit pass:** this is not "one generic reducer action for all 6" — it's a shared *waiting-room* helper (active-id derivation + single-entry dequeue) that each mechanic's own distinct resolution action plugs into.
2. **54 of 57 `broadcastX` functions** in `useRoomChannel.ts` are the identical one-liner `void channelRef.current?.send({type:'broadcast', event:'NAME', payload})`, differing only in the event string and payload type. Exhaustively checked (every `broadcastX`/`channel.on` body in the file, not a sample) — 3 real exceptions: `broadcastGameStarted` takes multiple named arguments instead of one payload object (matches `onGameStarted`'s own exception below); `broadcastDiceRolled` and `broadcastDiscardConfirmed` both keep a `.then((result) => debugLog(...))` wrapper for a specific stuck-screen bug hunt (`broadcastDiscardConfirmed`'s own comment: "See broadcastDiceRolled above — same reasoning, same bug hunt"). An earlier pass of this design only caught `broadcastDiceRolled`'s debugLog exception and missed `broadcastDiscardConfirmed`'s identical one — worth naming both explicitly here so Sub-plan 1's implementer doesn't silently collapse the second one and drop its debug logging.
3. **55 of 57 `channel.on<T>(...)` subscriptions** are the identical shape: register an event, forward its payload to `handlersRef.current.onX?.(payload)`. Also exhaustively checked — exactly one exception, `onGameStarted`, which calls its handler with multiple destructured arguments instead of a single payload object (matching `broadcastGameStarted`'s own exception above) — excluded from the generalization by design, not an oversight.
4. **`GameHudProps` is a flat 100+-entry interface** with no internal grouping — every new picker/queue mechanic added 2+ top-level props rather than fitting into any existing structure.

## Data Model — New/Extended Reducer Slices

Board pieces join `BoardState` (consistent with `robberTileId`/`pirateTileId`/`ships`/`roads`/`settlements` already living there):
```ts
export interface BoardState {
  // ...existing fields
  robberActive: boolean        // NEW — barbarian-track activation gate
  merchantTileId: string | null   // NEW
  merchantHolderId: number | null // NEW
}
```

New slices, each its own file under `game/reducers/`, own tests, own action-union member — exact field boundaries between adjacent slices (e.g. whether `knightsPromotedThisTurn` belongs with per-turn `TurnState` resets or with barbarian-progress `ProgressState`) are confirmed when that slice's own sub-plan is planned, not locked here:

- **`TurnState`** — `currentPlayerIndex`, `gamePhase`, `setupStepIndex`/`setupStage`/`setupSettlementVertexId`, `hasRolledThisTurn`, `devCardPlayedThisTurn`, `totalRollsThisGame`, `consecutiveDoublesThisTurn`.
- **`ProgressState`** (Cities & Knights) — `barbarianTrackPosition`, `activeBarbarianAttack`, `knightsPromotedThisTurn`.
- **`DecksState`** — `devDeck`, `progressCardDecks`.
- **`TrophiesState`** — `longestRoadHolderId`, `largestArmyHolderId`, `metropolisHolders`, `metropolisVertexIds`.
- **`PendingState`** — the queue-mechanics helper's home: the 6 queues, `pendingTrade`, `freeRoadsRemaining`, `revealedTileIds`.

`GameAction` extends to `BoardAction | PlayersAction | TurnAction | ProgressAction | DecksAction | TrophiesAction | PendingAction`, each added one at a time as its sub-plan lands — never all five in one dispatch.

## Actions

### Broadcast dispatcher (`useRoomChannel.ts`)

Keep all 57 named `broadcastX`/57 typed `channel.on<T>` call sites — collapsing to a fully generic `broadcast(event: string, payload: unknown)` would touch ~100+ call sites across `App.tsx` for no correctness benefit and would lose per-event compile-time payload verification. Instead, collapse each *body*:

```ts
function send<T>(event: string, payload: T) {
  void channelRef.current?.send({ type: 'broadcast', event, payload })
}
// broadcastGameStarted keeps its existing multi-argument signature (not
// a single payload) — not touched by this collapse.
// broadcastDiceRolled and broadcastDiscardConfirmed BOTH keep their
// existing .then((result) => debugLog(...)) wrapper — two exceptions,
// not one; don't collapse either into send().
const broadcastDiceRolled = (payload: DiceRolledPayload) => {
  void channelRef.current?.send({ type: 'broadcast', event: 'DICE_ROLLED', payload }).then((result) => debugLog(...))
}
const broadcastDiscardConfirmed = (payload: DiscardConfirmedPayload) => {
  void channelRef.current?.send({ type: 'broadcast', event: 'DISCARD_CONFIRMED', payload }).then((result) => debugLog(...))
}
const broadcastTurnPassed = (payload: TurnPassedPayload) => send('TURN_PASSED', payload)
// ...53 more one-liners
```

```ts
function forwardTo<T>(handlerKey: keyof RoomChannelHandlers) {
  return ({ payload }: { payload: T }) => {
    ;(handlersRef.current[handlerKey] as ((p: T) => void) | undefined)?.(payload)
  }
}
channel.on<DiceRolledPayload>('broadcast', { event: 'DICE_ROLLED' }, forwardTo('onDiceRolled'))
// ...55 more one-liners; onGameStarted keeps its existing bespoke subscription
```

Cuts ~220 lines of duplicated boilerplate to near-zero, zero loss of type safety, zero change to any `App.tsx` call site.

### Queue-mechanics helper (new, likely `game/pendingQueue.ts` or a hook)

```ts
function activeQueueEntry<T>(queue: T[], getPlayerId: (entry: T) => number, onlineInfo: OnlineInfo | null): T | null {
  if (onlineInfo) return queue.find((entry) => getPlayerId(entry) === onlineInfo.localPlayerId) ?? null
  return queue[0] ?? null
}
function dequeueOne<T>(queue: T[], getPlayerId: (entry: T) => number, playerId: number): T[] {
  const index = queue.findIndex((entry) => getPlayerId(entry) === playerId)
  return index === -1 ? queue : [...queue.slice(0, index), ...queue.slice(index + 1)]
}
```

Each of the 6 mechanics keeps its own reducer action, resolve function, and broadcast payload — only the waiting-room bookkeeping (who's active on this screen, remove-one-matching-entry) becomes shared.

### GameHud props (final sub-plan only)

Group related props into cohesive objects once the final state shape is known (e.g. one `pickerState` object instead of `devCardPicker`/`scienceFreeResourceActive`/`goldFieldResourceActive`/`onResolve*` as separate top-level props). Exact grouping decided against the actual final prop list, not pre-designed now.

## Sequencing

Infra first, then feature buckets — every later sub-plan gets to use the clean broadcast/queue pattern instead of hand-rolling it, so nothing built early gets rewritten later:

1. **Broadcast dispatcher** — `useRoomChannel.ts` only, zero behavior change, mechanical and low-risk.
2. **Queue-mechanics helper** — migrate the 6 queues onto it, each keeping its own reducer action.
3. **Turn/phase flow bucket** — `TurnState`.
4. **C&K board-piece bucket** — `BoardState` additions + `ProgressState`.
5. **Decks & trophies bucket** — `DecksState`, `TrophiesState`.
6. **Remaining `PendingState` items** — `pendingTrade`, `freeRoadsRemaining`, `revealedTileIds`.
7. **GameHud prop restructuring** — last, once the final shape is known.

Each ships as its own worktree + PR, `superpowers:writing-plans` → `superpowers:subagent-driven-development`, matching the players-slice migration and Seafarers precedent exactly. The ~18 ambiguous armed-action states are audited against the classification rule as whichever bucket's sub-plan encounters them, not pre-assigned here — most are expected to stay `useState` based on the 3 already checked.

## Testing

Same approach as every prior reducer slice in this codebase: direct Vitest unit tests on the pure reducer cases, no React rendering needed, no mocks. The broadcast-dispatcher and queue-helper sub-plans are infrastructure with no new game logic — their own tests focus on the helpers' generic behavior (a small number of unit tests per helper), not on re-testing existing per-mechanic logic that isn't changing. Each state-migration sub-plan follows the established pattern: `describe` blocks per new action, per-literal `as const` casts, isolation tests via `toEqual`/reference identity.

## Out of Scope

- The ~18 armed-action states confirmed local by the classification rule stay `useState` — not touched by this project.
- `tiles`, `boardInstance`, camera/canvas state, chat, dice-roll animation display, `onlineInfo` — all confirmed genuinely local/derived/regenerated, not touched.
- No new gameplay features. This is a pure architecture migration; behavior must be unchanged end to end.
- The separately-queued multiplayer-sync-testing-harness project and the far-future UI rebuild are explicitly not part of this project (see `project_multiplayer_sync_testing_harness.md`/`project_ui_rebuild_future.md`).
