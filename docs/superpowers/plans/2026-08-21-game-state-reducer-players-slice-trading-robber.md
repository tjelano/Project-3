# Game State Reducer — Players Slice, Sub-plan 2: Trading + Robber/Pillage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate 7 functions off the `LEGACY_SET_PLAYERS` bridge (introduced in sub-plan 1) onto real, typed `PlayersAction` cases: `applyRobberMove`, `applyPillage`, `applyTradeResolution`, `applyDiscard`, `applyCommodityTrade`, `applyCommercialHarborEffect`, and `bankTrade`/`onBankTrade`.

**Architecture:** Each function gets one new case added to `reducePlayers` (`catan-3d/src/game/reducers/players.ts`), tested directly with Vitest (pure function, no React). Each function's own `LEGACY_SET_PLAYERS` dispatch is then replaced with the new typed action — this is what "migrating a function" means per the parent spec. `bankTrade`/`onBankTrade` additionally get restructured: today `bankTrade` bundles guards + mutation + broadcast in one function while `onBankTrade` duplicates the same resource math inline — this sub-plan splits out a shared `applyBankTrade` trusted-apply function so both call sites use identical code, eliminating the duplicate (the design spec's own "Receiver duplicates to delete: `onBankTrade`" line).

**Tech Stack:** TypeScript, React (`useReducer`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-game-state-reducer-players-slice-design.md` (bucket 2 of the migration roadmap, `~line 78`) and its parent `docs/superpowers/specs/2026-08-19-game-state-reducer-design.md`.

## Global Constraints

- **Reducers are pure appliers, always.** No `Math.random()`, no `inform()`/`warn()`/`playSfx()`, no `Date.now()`. `reducePlayers` cases only compute the next `Player[]`.
- **This sub-plan touches ONLY the players-side write inside each function.** Every other side effect already in these functions (`setRobberTileId`, `setGamePhase`, `setPillageQueue`, `setDiscardPlayerIds`, `inform()`, `playSfx()`, `broadcastX()` calls, all validation/guard code) stays exactly as-is. Do not restructure anything beyond what each task explicitly describes.
- **`applyTradeResolution`'s callers are GOLDFROZEN** (`useRoomChannel.ts`'s 4-event P2P trade pattern: `onTradeAcceptRequest`/`resolveTradeAsHost`/`onTradeResolved`/`onTradeCancelled`). Task 3 changes only `applyTradeResolution`'s own body — never touch the surrounding trade-negotiation flow.
- **Verified inventory** (confirmed by reading the live worktree, not the plan text): `onRobberMoved`, `onPillageResolved`, `onTradeResolved`, `onDiscardConfirmed`, `onCommodityTraded`, `onCommercialHarborPlayed` are all already one-line forwards to their shared `applyX` function (e.g. `onDiscardConfirmed: (payload) => applyDiscard(payload.playerId, payload.counts)`) — no duplicated logic to delete for those 6. Only `onBankTrade` duplicates real logic (Task 7).
- Re-confirm every line number below with `grep -n` before editing — earlier tasks in this plan shift later line numbers.

---

### Task 1: Migrate `applyRobberMove` to `ROBBER_MOVED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `StolenItem` type (`../types`, already `ResourceType | CommodityType`).
- Produces: `PlayersAction` gains `{ type: 'ROBBER_MOVED'; tileId: string; thiefId: number; victimId: number | null; stolenItem: StolenItem | null }`. `tileId` is carried on the action but unused by `reducePlayers` (board-domain, out of scope for this sub-plan) — kept so the action shape matches `applyRobberMove`'s existing call signature exactly, for a 1:1 mechanical swap at the call site.

Current `applyRobberMove` body (verified in the live worktree, `App.tsx:967-1026`) computes `safeStolenItem` (a validated, possibly-null version of `stolenItem`), then dispatches:
```tsx
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
  prev.map((p) => {
    if (p.id === victimId) {
      return isCommodity
        ? { ...p, commodities: { ...p.commodities, [safeStolenItem]: p.commodities[safeStolenItem as CommodityType] - 1 } }
        : { ...p, resources: { ...p.resources, [safeStolenItem]: p.resources[safeStolenItem as ResourceType] - 1 } }
    }
    if (p.id === thiefId) {
      return isCommodity
        ? { ...p, commodities: { ...p.commodities, [safeStolenItem]: p.commodities[safeStolenItem as CommodityType] + 1 } }
        : { ...p, resources: { ...p.resources, [safeStolenItem]: p.resources[safeStolenItem as ResourceType] + 1 } }
    }
    return p
  }) })
```
This only runs inside the `if (victimId != null && safeStolenItem != null)` branch — when there's nothing to steal, no players-side write happens at all.

- [ ] **Step 1: Write the failing tests**

Add to `players.test.ts`:
```ts
describe('reducePlayers — ROBBER_MOVED', () => {
  it('moves a resource from victim to thief', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 3, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'ROBBER_MOVED', tileId: 'T1', thiefId: players[1].id, victimId: players[0].id, stolenItem: 'lumber' },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(2)
    expect(result.find((p) => p.id === players[1].id)!.resources.lumber).toBe(4)
  })

  it('moves a commodity from victim to thief', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, commodities: { paper: 2, cloth: 0, coin: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'ROBBER_MOVED', tileId: 'T1', thiefId: players[1].id, victimId: players[0].id, stolenItem: 'paper' },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.commodities.paper).toBe(1)
    expect(result.find((p) => p.id === players[1].id)!.commodities.paper).toBe(1)
  })

  it('does nothing when stolenItem is null', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'ROBBER_MOVED', tileId: 'T1', thiefId: players[1].id, victimId: players[0].id, stolenItem: null },
      initialGameState,
    )
    expect(result).toEqual(players)
  })

  it('does nothing when victimId is null', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'ROBBER_MOVED', tileId: 'T1', thiefId: players[1].id, victimId: null, stolenItem: 'lumber' },
      initialGameState,
    )
    expect(result).toEqual(players)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL — `ROBBER_MOVED` is not a valid `PlayersAction` type yet.

- [ ] **Step 3: Add the action type and reducer case**

In `players.ts`, add `StolenItem` and `CommodityType` to the type-only import from `'../types'`, and add to `PlayersAction`:
```ts
| { type: 'ROBBER_MOVED'; tileId: string; thiefId: number; victimId: number | null; stolenItem: StolenItem | null }
```
Add to the `switch` in `reducePlayers`, importing `COMMODITY_ORDER` from `'../types'` alongside the existing named imports:
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

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `applyRobberMove`'s call site**

Confirm the current line with `grep -n "const applyRobberMove" src/App.tsx`. Replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block shown above with:
```tsx
dispatch({ type: 'ROBBER_MOVED', tileId, thiefId, victimId, stolenItem: safeStolenItem })
```
Leave every other line in `applyRobberMove` (the `safeStolenItem` computation, `setRobberTileId`, `playSfx`, `stealNote`/`inform`, `setGamePhase`) untouched.

- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean, all tests passing (211 pre-existing + 4 new... exact count depends on how many tasks in this plan have already landed — compare against the count before this task).

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyRobberMove to ROBBER_MOVED"
```

---

### Task 2: Migrate `applyPillage`'s players-side write onto the existing `PILLAGE_CITY` action

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `PILLAGE_CITY` (`{ type: 'PILLAGE_CITY'; vertexId: string; playerId: number }`) — already exists in `BoardAction` (`catan-3d/src/game/reducers/board.ts:19`), already dispatched by `applyPillage` via `dispatchGameAction({ type: 'PILLAGE_CITY', vertexId, playerId }, isDeciding)`. `reducePlayers` currently has no case for it, so that dispatch is presently a players-side no-op.
- Produces: nothing new — `PlayersAction` is unchanged this task. This mirrors sub-plan 1 Tasks 5-7 exactly: the action already exists, this task only adds the missing `reducePlayers` case.

Current `applyPillage` (verified, `App.tsx:1282-1324`) already calls `dispatchGameAction({ type: 'PILLAGE_CITY', vertexId, playerId }, isDeciding)`, then separately:
```tsx
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
  prev.map((p) =>
    p.id === playerId
      ? {
          ...p,
          cityWalls: p.cityWalls.filter((v) => v !== vertexId),
          citiesRemaining: p.citiesRemaining + 1,
          settlementsRemaining: Math.max(0, p.settlementsRemaining - 1),
        }
      : p,
  ) })
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — PILLAGE_CITY', () => {
  it('removes the vertex from cityWalls, returns a city to supply, takes a settlement out', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, cityWalls: ['V1', 'V2'] }))
    const before = players[0]
    const result = reducePlayers(players, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.cityWalls).toEqual(['V2'])
    expect(player.citiesRemaining).toBe(before.citiesRemaining + 1)
    expect(player.settlementsRemaining).toBe(Math.max(0, before.settlementsRemaining - 1))
  })

  it('clamps settlementsRemaining at 0', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, settlementsRemaining: 0 }))
    const result = reducePlayers(players, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.settlementsRemaining).toBe(0)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL — the current `PILLAGE_CITY` case (if any) doesn't touch `players`; `reducePlayers` falls through to `default` and returns the input array unchanged.

- [ ] **Step 3: Add the reducer case**

Add to the `switch` in `reducePlayers`:
```ts
case 'PILLAGE_CITY':
  return players.map((p) =>
    p.id === action.playerId
      ? {
          ...p,
          cityWalls: p.cityWalls.filter((v) => v !== action.vertexId),
          citiesRemaining: p.citiesRemaining + 1,
          settlementsRemaining: Math.max(0, p.settlementsRemaining - 1),
        }
      : p,
  )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Delete `applyPillage`'s now-redundant `LEGACY_SET_PLAYERS` dispatch**

Confirm the current line with `grep -n "const applyPillage" src/App.tsx`. Delete the entire `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block shown above — the existing `dispatchGameAction({ type: 'PILLAGE_CITY', ... }, isDeciding)` call already triggers this new `reducePlayers` case, since `reduceGame` composes every sub-reducer on every dispatched action. Leave the ownership guard, the same-tick dedupe guard, and `setPillageQueue` untouched.

- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyPillage's players-side write onto the existing PILLAGE_CITY action"
```

---

### Task 3: Migrate `applyTradeResolution` to `TRADE_RESOLVED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'TRADE_RESOLVED'; fromPlayerId: number; toPlayerId: number; offerResource: ResourceType; wantResource: ResourceType }` — field names match `PendingTrade` (`catan-3d/src/components/hud/TradeOfferPrompt.tsx:6-11`) exactly, since `applyTradeResolution` already destructures a `PendingTrade` into these 4 fields.

**GOLDFREEZE reminder:** `applyTradeResolution`'s callers (`onTradeAcceptRequest`, `resolveTradeAsHost`, `onTradeResolved`, `onTradeCancelled` in the 4-event P2P trade pattern) are off-limits. This task only changes `applyTradeResolution`'s own body.

Current body (verified, `App.tsx:1170-1203`):
```tsx
const applyTradeResolution = (trade: PendingTrade) => {
  const { fromPlayerId, toPlayerId, offerResource, wantResource } = trade
  const fromPlayer = playerById.get(fromPlayerId)
  const toPlayer = playerById.get(toPlayerId)
  if (!fromPlayer || !toPlayer) return

  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id === fromPlayerId) {
        return { ...p, resources: { ...p.resources, [offerResource]: p.resources[offerResource] - 1, [wantResource]: p.resources[wantResource] + 1 } }
      }
      if (p.id === toPlayerId) {
        return { ...p, resources: { ...p.resources, [wantResource]: p.resources[wantResource] - 1, [offerResource]: p.resources[offerResource] + 1 } }
      }
      return p
    }) })
  inform(`${fromPlayer.name} traded 1 ${RESOURCE_LABELS[offerResource]} for 1 ${RESOURCE_LABELS[wantResource]} with ${toPlayer.name}!`)
}
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — TRADE_RESOLVED', () => {
  it('swaps 1 offerResource for 1 wantResource between the two traders', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 2, brick: 2, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'TRADE_RESOLVED', fromPlayerId: players[0].id, toPlayerId: players[1].id, offerResource: 'lumber', wantResource: 'brick' },
      initialGameState,
    )
    const from = result.find((p) => p.id === players[0].id)!
    const to = result.find((p) => p.id === players[1].id)!
    expect(from.resources.lumber).toBe(1)
    expect(from.resources.brick).toBe(3)
    expect(to.resources.lumber).toBe(3)
    expect(to.resources.brick).toBe(1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(3)
    const result = reducePlayers(
      players,
      { type: 'TRADE_RESOLVED', fromPlayerId: players[0].id, toPlayerId: players[1].id, offerResource: 'lumber', wantResource: 'brick' },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[2].id)!).toEqual(players[2])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add to `PlayersAction`:
```ts
| { type: 'TRADE_RESOLVED'; fromPlayerId: number; toPlayerId: number; offerResource: ResourceType; wantResource: ResourceType }
```
Add to the `switch`:
```ts
case 'TRADE_RESOLVED':
  return players.map((p) => {
    if (p.id === action.fromPlayerId) {
      return { ...p, resources: { ...p.resources, [action.offerResource]: p.resources[action.offerResource] - 1, [action.wantResource]: p.resources[action.wantResource] + 1 } }
    }
    if (p.id === action.toPlayerId) {
      return { ...p, resources: { ...p.resources, [action.wantResource]: p.resources[action.wantResource] - 1, [action.offerResource]: p.resources[action.offerResource] + 1 } }
    }
    return p
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `applyTradeResolution`'s call site**

Confirm the current line with `grep -n "const applyTradeResolution" src/App.tsx`. Replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'TRADE_RESOLVED', fromPlayerId, toPlayerId, offerResource, wantResource })
```
Leave the `fromPlayer`/`toPlayer` lookups, the early-return guard, and `inform(...)` untouched.

- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyTradeResolution to TRADE_RESOLVED"
```

---

### Task 4: Migrate `applyDiscard` to `DISCARD_CONFIRMED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `applyDiscardCounts(resources, commodities, counts)` from `catan-3d/src/game/discard.ts` (already used inline by `applyDiscard` today; import it into `players.ts` from `'../discard'`).
- Produces: `PlayersAction` gains `{ type: 'DISCARD_CONFIRMED'; playerId: number; counts: Partial<Record<ResourceType | CommodityType, number>> }`.

Current body (verified, `App.tsx:1213-1235`):
```tsx
const applyDiscard = (playerId: number, counts: Partial<Record<ResourceType | CommodityType, number>>) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id !== playerId) return p
      const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, counts)
      return { ...p, resources, commodities }
    }) })
  const remaining = discardPlayerIds.filter((id) => id !== playerId)
  setDiscardPlayerIds(remaining)
  debugLog('applyDiscard', { playerId, counts, discardPlayerIdsBefore: discardPlayerIds, remaining })
  if (remaining.length === 0) {
    if (!gameRules.citiesAndKnightsBarbarians || robberActive) {
      setGamePhase('moveRobber')
    } else {
      setGamePhase('playing')
    }
  }
}
```
Only the `dispatch` line changes — `setDiscardPlayerIds`, `debugLog`, and the `gamePhase` transition all stay in `App.tsx`, untouched.

- [ ] **Step 1: Write the failing test**

```ts
describe('reducePlayers — DISCARD_CONFIRMED', () => {
  it('subtracts the given resource/commodity counts from the named player', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      resources: { lumber: 4, brick: 0, wool: 0, grain: 0, ore: 0 },
      commodities: { paper: 2, cloth: 0, coin: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'DISCARD_CONFIRMED', playerId: players[0].id, counts: { lumber: 2, paper: 1 } },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.lumber).toBe(2)
    expect(player.commodities.paper).toBe(1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'DISCARD_CONFIRMED', playerId: players[0].id, counts: {} }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add `import { applyDiscardCounts } from '../discard'` to `players.ts`. Add to `PlayersAction`:
```ts
| { type: 'DISCARD_CONFIRMED'; playerId: number; counts: Partial<Record<ResourceType | CommodityType, number>> }
```
Add to the `switch`:
```ts
case 'DISCARD_CONFIRMED':
  return players.map((p) => {
    if (p.id !== action.playerId) return p
    const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, action.counts)
    return { ...p, resources, commodities }
  })
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `applyDiscard`'s call site**

Confirm the current line with `grep -n "const applyDiscard = " src/App.tsx`. Replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'DISCARD_CONFIRMED', playerId, counts })
```

- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyDiscard to DISCARD_CONFIRMED"
```

---

### Task 5: Migrate `applyCommodityTrade` to `COMMODITY_TRADED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'COMMODITY_TRADED'; playerId: number; give: CommodityType; receive: ResourceType | CommodityType }`.

Current body (verified, `App.tsx:1430-1442`):
```tsx
const applyCommodityTrade = (playerId: number, give: CommodityType, receive: ResourceType | CommodityType) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id !== playerId) return p
      const commodities = { ...p.commodities, [give]: p.commodities[give] - 2 }
      if ((COMMODITY_ORDER as string[]).includes(receive)) {
        const receiveCommodity = receive as CommodityType
        return { ...p, commodities: { ...commodities, [receiveCommodity]: commodities[receiveCommodity] + 1 } }
      }
      const receiveResource = receive as ResourceType
      return { ...p, commodities, resources: { ...p.resources, [receiveResource]: p.resources[receiveResource] + 1 } }
    }) })
}
```
Rate is hardcoded at 2 (Trade level 3's fixed 2:1 rate, not port-derived) — carry that through unchanged.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — COMMODITY_TRADED', () => {
  it('deducts 2 of give, adds 1 to receive when receive is a commodity', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, commodities: { paper: 3, cloth: 0, coin: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'COMMODITY_TRADED', playerId: players[0].id, give: 'paper', receive: 'cloth' },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.commodities.paper).toBe(1)
    expect(player.commodities.cloth).toBe(1)
  })

  it('deducts 2 of give, adds 1 to receive when receive is a resource', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      commodities: { paper: 3, cloth: 0, coin: 0 },
      resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'COMMODITY_TRADED', playerId: players[0].id, give: 'paper', receive: 'ore' },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.commodities.paper).toBe(1)
    expect(player.resources.ore).toBe(1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, commodities: { paper: 3, cloth: 0, coin: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'COMMODITY_TRADED', playerId: players[0].id, give: 'paper', receive: 'cloth' },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add `CommodityType` to `players.ts`'s type-only import from `'../types'` (if not already added in an earlier task). Add to `PlayersAction`:
```ts
| { type: 'COMMODITY_TRADED'; playerId: number; give: CommodityType; receive: ResourceType | CommodityType }
```
Add to the `switch`:
```ts
case 'COMMODITY_TRADED':
  return players.map((p) => {
    if (p.id !== action.playerId) return p
    const commodities = { ...p.commodities, [action.give]: p.commodities[action.give] - 2 }
    if ((COMMODITY_ORDER as string[]).includes(action.receive)) {
      const receiveCommodity = action.receive as CommodityType
      return { ...p, commodities: { ...commodities, [receiveCommodity]: commodities[receiveCommodity] + 1 } }
    }
    const receiveResource = action.receive as ResourceType
    return { ...p, commodities, resources: { ...p.resources, [receiveResource]: p.resources[receiveResource] + 1 } }
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `applyCommodityTrade`'s call site**

Confirm the current line with `grep -n "const applyCommodityTrade" src/App.tsx`. Replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'COMMODITY_TRADED', playerId, give, receive })
```

- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyCommodityTrade to COMMODITY_TRADED"
```

---

### Task 6: Migrate `applyCommercialHarborEffect` to `COMMERCIAL_HARBOR_PLAYED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `removeOne<T>(items: T[], value: T): T[]` from `catan-3d/src/game/types.ts:459` (already used inline today; import it into `players.ts`).
- Produces: `PlayersAction` gains `{ type: 'COMMERCIAL_HARBOR_PLAYED'; announcerId: number; resource: ResourceType; otherIdsInOrder: number[] }`.

Current body (verified, `App.tsx:2999-3033`):
```tsx
const applyCommercialHarborEffect = (announcerId: number, resource: ResourceType, otherIdsInOrder: number[]) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => {
    let next = prev.map((p) =>
      p.id === announcerId ? { ...p, progressCards: removeOne(p.progressCards, 'commercialHarbor') } : p,
    )
    for (const targetId of otherIdsInOrder) {
      const announcer = next.find((p) => p.id === announcerId)!
      if (announcer.resources[resource] <= 0) break
      const target = next.find((p) => p.id === targetId)!
      const heldCommodities = COMMODITY_ORDER.filter((c) => target.commodities[c] > 0).sort(
        (a, b) => target.commodities[b] - target.commodities[a],
      )
      if (heldCommodities.length === 0) continue
      const commodity = heldCommodities[0]
      next = next.map((p) => {
        if (p.id === announcerId) {
          return { ...p, resources: { ...p.resources, [resource]: p.resources[resource] - 1 }, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] + 1 } }
        }
        if (p.id === targetId) {
          return { ...p, resources: { ...p.resources, [resource]: p.resources[resource] + 1 }, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] - 1 } }
        }
        return p
      })
    }
    return next
  } })
}
```
This is a loop, not a single `.map()` — copy the logic verbatim into the reducer case, just renaming the outer variable from `prev`/inline closure params to reading off `action`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — COMMERCIAL_HARBOR_PLAYED', () => {
  it("removes one commercialHarbor card from the announcer's hand", () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['commercialHarbor'] }))
    const result = reducePlayers(
      players,
      { type: 'COMMERCIAL_HARBOR_PLAYED', announcerId: players[0].id, resource: 'lumber', otherIdsInOrder: [] },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual([])
  })

  it("trades 1 resource for the target's most-held commodity, once per target, until the announcer runs out", () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? ['commercialHarbor'] : [],
      resources: i === 0 ? { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
      commodities: i === 1 ? { paper: 0, cloth: 3, coin: 1 } : { paper: 0, cloth: 0, coin: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'COMMERCIAL_HARBOR_PLAYED', announcerId: players[0].id, resource: 'lumber', otherIdsInOrder: [players[1].id] },
      initialGameState,
    )
    const announcer = result.find((p) => p.id === players[0].id)!
    const target = result.find((p) => p.id === players[1].id)!
    expect(announcer.resources.lumber).toBe(0)
    expect(announcer.commodities.cloth).toBe(1)
    expect(target.resources.lumber).toBe(1)
    expect(target.commodities.cloth).toBe(2)
  })

  it('skips a target holding no commodities', () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? ['commercialHarbor'] : [],
      resources: i === 0 ? { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'COMMERCIAL_HARBOR_PLAYED', announcerId: players[0].id, resource: 'lumber', otherIdsInOrder: [players[1].id] },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add `import { removeOne } from '../types'` (or add `removeOne` to the existing `'../types'` import) to `players.ts`. Add to `PlayersAction`:
```ts
| { type: 'COMMERCIAL_HARBOR_PLAYED'; announcerId: number; resource: ResourceType; otherIdsInOrder: number[] }
```
Add to the `switch`:
```ts
case 'COMMERCIAL_HARBOR_PLAYED': {
  let next = players.map((p) =>
    p.id === action.announcerId ? { ...p, progressCards: removeOne(p.progressCards, 'commercialHarbor') } : p,
  )
  for (const targetId of action.otherIdsInOrder) {
    const announcer = next.find((p) => p.id === action.announcerId)!
    if (announcer.resources[action.resource] <= 0) break
    const target = next.find((p) => p.id === targetId)!
    const heldCommodities = COMMODITY_ORDER.filter((c) => target.commodities[c] > 0).sort(
      (a, b) => target.commodities[b] - target.commodities[a],
    )
    if (heldCommodities.length === 0) continue
    const commodity = heldCommodities[0]
    next = next.map((p) => {
      if (p.id === action.announcerId) {
        return { ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] - 1 }, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] + 1 } }
      }
      if (p.id === targetId) {
        return { ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] + 1 }, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] - 1 } }
      }
      return p
    })
  }
  return next
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `applyCommercialHarborEffect`'s call site**

Confirm the current line with `grep -n "const applyCommercialHarborEffect" src/App.tsx`. Replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'COMMERCIAL_HARBOR_PLAYED', announcerId, resource, otherIdsInOrder })
```

- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyCommercialHarborEffect to COMMERCIAL_HARBOR_PLAYED"
```

---

### Task 7: Migrate `bankTrade`/`onBankTrade` to `BANK_TRADE`, delete the duplicated receiver logic

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'BANK_TRADE'; playerId: number; give: ResourceType; receive: ResourceType; rate: number }` (field names match `BankTradePayload`, `catan-3d/src/multiplayer/useRoomChannel.ts:314-320`, exactly). Also produces a new local function `applyBankTrade(playerId: number, give: ResourceType, receive: ResourceType, rate: number, isDeciding: boolean): void` in `App.tsx` — the shared trusted-apply function `bankTrade` and `onBankTrade` both now call.

This is the one function in this sub-plan that isn't already split into a guard-wrapper + shared trusted-apply pair. Today `bankTrade` (the local, guarded action) and `onBankTrade` (the network receiver) each independently compute the same resource delta. This task splits them the same way sub-plan 1 split `buildSettlementRaw`/`applySettlementPlacement`.

Current `bankTrade` (verified, `App.tsx:4202-4248`) — guards, then:
```tsx
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
  prev.map((p, index) =>
    index === currentPlayerIndex
      ? { ...p, resources: { ...p.resources, [give]: p.resources[give] - rate, [receive]: p.resources[receive] + 1 } }
      : p,
  ) })
inform(`${player.name} traded ${rate} ${RESOURCE_LABELS[give]} for 1 ${RESOURCE_LABELS[receive]}.`)
if (onlineInfo) broadcastBankTrade({ playerId: player.id, give, receive, rate })
```

Current `onBankTrade` (verified, `App.tsx:1925-1947`):
```tsx
onBankTrade: (payload) => {
  if (!RESOURCE_ORDER.includes(payload.give) || !RESOURCE_ORDER.includes(payload.receive) || !Number.isFinite(payload.rate)) {
    console.error('[Catan] Ignoring malformed bank-trade payload:', payload)
    return
  }
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id === payload.playerId
        ? { ...p, resources: { ...p.resources, [payload.give]: p.resources[payload.give] - payload.rate, [payload.receive]: p.resources[payload.receive] + 1 } }
        : p,
    ) })
},
```

- [ ] **Step 1: Write the failing test**

```ts
describe('reducePlayers — BANK_TRADE', () => {
  it('deducts rate*give, adds 1 receive, for the named player only', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 4, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'BANK_TRADE', playerId: players[0].id, give: 'lumber', receive: 'brick', rate: 4 },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.lumber).toBe(0)
    expect(player.resources.brick).toBe(1)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add to `PlayersAction`:
```ts
| { type: 'BANK_TRADE'; playerId: number; give: ResourceType; receive: ResourceType; rate: number }
```
Add to the `switch`:
```ts
case 'BANK_TRADE':
  return players.map((p) =>
    p.id === action.playerId
      ? { ...p, resources: { ...p.resources, [action.give]: p.resources[action.give] - action.rate, [action.receive]: p.resources[action.receive] + 1 } }
      : p,
  )
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Introduce the shared `applyBankTrade` function**

Confirm the current line with `grep -n "const bankTrade = " src/App.tsx`. Immediately above `bankTrade`, add:
```tsx
// Trusted state mutation for a bank trade — shared by the local actor
// (bankTrade, below, which also broadcasts) and receiving clients
// (onBankTrade), same trusted-apply split as applyDiscard/applyPillage/etc.
const applyBankTrade = (playerId: number, give: ResourceType, receive: ResourceType, rate: number, isDeciding: boolean) => {
  dispatch({ type: 'BANK_TRADE', playerId, give, receive, rate })
  const player = playerById.get(playerId)
  if (player) inform(`${player.name} traded ${rate} ${RESOURCE_LABELS[give]} for 1 ${RESOURCE_LABELS[receive]}.`)
  if (isDeciding && onlineInfo) broadcastBankTrade({ playerId, give, receive, rate })
}
```

- [ ] **Step 6: Replace `bankTrade`'s tail with a call to `applyBankTrade`**

Replace the `dispatch(...)` / `inform(...)` / `if (onlineInfo) broadcastBankTrade(...)` block shown above (the end of `bankTrade`, after all its guards and the `rate`/`player` computation) with:
```tsx
applyBankTrade(player.id, give, receive, rate, true)
```
Leave every guard above it (`canPerformAction`, `gamePhase`, `hasRolledThisTurn`, `isMyTurn`, `give === receive`, the resource-availability check) and the `rate`/`player` lookups untouched.

- [ ] **Step 7: Replace `onBankTrade`'s body with a call to `applyBankTrade`**

Confirm the current line with `grep -n "onBankTrade:" src/App.tsx`. Replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block inside `onBankTrade` with:
```tsx
applyBankTrade(payload.playerId, payload.give, payload.receive, payload.rate, false)
```
Leave the existing payload-validation guard (`RESOURCE_ORDER.includes`/`Number.isFinite` check + `console.error`) above it untouched — it still runs before `applyBankTrade` is ever called.

- [ ] **Step 8: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 9: Manual verification**

Dev server, 2-client online test if possible: make a bank trade as the deciding client, confirm the receiving client's copy of the trader's resources updates identically (both `give` deducted at the correct port rate and `receive` incremented by 1), and the correct banner text appears on both clients.

- [ ] **Step 10: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate bankTrade/onBankTrade to BANK_TRADE via a shared applyBankTrade, deleting the duplicated receiver logic"
```

---

### Task 8: Final verification for this sub-plan

**Files:** none (verification only)

- [ ] **Step 1: Full automated suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: all clean.

- [ ] **Step 2: Confirm the bridge shrank by exactly 7**

Run: `grep -c "LEGACY_SET_PLAYERS" catan-3d/src/App.tsx`
Expected: 7 fewer than the count recorded at the end of sub-plan 1 (Task 8) — the 7 dispatch sites this sub-plan converted (`applyRobberMove`, `applyPillage`, `applyTradeResolution`, `applyDiscard`, `applyCommodityTrade`, `applyCommercialHarborEffect`, and the two `bankTrade`/`onBankTrade` sites collapsed into one `applyBankTrade` — net 7 removed since `onBankTrade`'s own `LEGACY_SET_PLAYERS` call is also gone, not just `bankTrade`'s). If the number doesn't match, grep for `LEGACY_SET_PLAYERS` and account for the discrepancy before proceeding — this grep is the ground truth, not the arithmetic above.

- [ ] **Step 3: Manual end-to-end play session**

Dev server: play one local Pass & Play game exercising every function this sub-plan touched: roll a 7 and move the robber onto an occupied tile (steal), pillage a city during a barbarian attack (Cities & Knights on), make a player-to-player trade, discard when over the 7-card limit, make a 2:1 commodity trade (Trade level 3), play Commercial Harbor (Trade level 4), and make a bank trade. Confirm every one behaves identically to before this sub-plan.
