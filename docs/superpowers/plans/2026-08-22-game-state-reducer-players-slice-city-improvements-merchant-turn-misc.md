# Sub-plan 5: City Improvements + Merchant + Turn-Misc

Migrates the remaining `LEGACY_SET_PLAYERS` call sites in bucket 5 of the players-slice reducer migration (parent spec: `docs/superpowers/specs/2026-08-19-game-state-reducer-players-slice-design.md`) onto typed `PlayersAction` variants in `reducePlayers`. Sub-plans 1-4b are merged to main.

## Why this plan differs from the spec's bucket-5 function list

The spec names 11 functions for bucket 5. Direct verification (grepping and reading every one fresh, not trusting old line numbers) found **4 of the 11 are already fully migrated** — `playEngineering`, `playMerchantFleet`, `playMerchant`, `spendDevCard` — as a side effect of sub-plan 4's generic `PROGRESS_CARD_SPENT`/`DEV_CARD_SPENT` actions already covering their "spend one card, no other players-side effect" shape. They need no work here. `onProgressCardPlayed`'s `merchantFleet` branch (the spec's other bucket-5 receiver-duplicate line item) is likewise already `PROGRESS_CARD_SPENT` — also done.

The real remaining scope is **7 functions** (`applyCityImprovementPurchase`, `buyCityImprovement`, `buildCityWall`, `resolveFreeCityWall`, `applyTurnAdvance`, `buyDevCard`, `applyRollResult`) plus one tail item folded in below. This is small enough, and only one function (`applyRollResult`) complex enough, that this stays **one implementation plan** — no a/b split like sub-plan 4 needed.

**Tail item folded into this plan:** `applyBarbarianWinnerDraw` (`App.tsx:1257`) was found during sub-plan 4b's final verification to be a genuine gap in the parent spec's function inventory — never named in any of the 6 buckets (root cause: bucket 4 was described as a source-order range, not an enumeration, and this function's line fell inside that range without being assigned). It reuses `PROGRESS_CARDS_DRAWN` (added in sub-plan 4b) verbatim with a single-element `draws` array, so it costs one small task here rather than a new sub-plan of its own.

## Global Constraints

Same as every prior sub-plan in this project:
- Reducer cases are pure appliers — no `Math.random()`, `inform()`/`warn()`/`playSfx()`, `Date.now()`, no reads of `useState` values that live outside `GameState` (`longestRoadHolderId`, `largestArmyHolderId`, `metropolisHolders`, `merchantHolderId`, `gameRules`, `tiles`, `devDeck`, `progressCardDecks` — none of these are part of `GameState` and none may be read inside a `reducePlayers` case).
- Each task touches ONLY the players-side write in each function — every other side effect (guards, local `useState` setters, `broadcastX()` calls) stays exactly where it is.
- Where a value the reducer needs lives outside `GameState`, it is computed in `App.tsx` before dispatch and threaded onto the action payload — same pattern as sub-plan 4b's `SABOTAGE_PLAYED`/`WEDDING_PLAYED`.
- **Verified, not assumed, for this plan specifically:** `metropolisHolders` is read in `buyCityImprovement` only as a pre-dispatch eligibility check (gates a `warn()`/return), never inside a players-mutating updater — no restructuring needed for it. `gameRules.citiesAndKnightsCommodities` IS read inside `applyRollResult`'s production-distribution updater closure today — this is the one real violation in this plan's scope, fixed by Task 5 below. `tiles` (its own `useState`, not `GameState.board`) and `graph.tileVertexIds` (a `useMemo` off `tiles`) are also read inside that same closure and must move out alongside it, for the same reason.
- **Faithful migration, not a redesign, except where two dispatch sites are confirmed byte-for-byte (or near-verbatim) duplicates of each other** — in that case folding them into one shared action is the correct migration (matches sub-plan 4b's precedent of not "fixing" the pre-existing Monopoly-family `victimNotes` computation location beyond what the migration itself required, while still doing the restructuring the migration genuinely needs). Three folds happen in this plan (Tasks 1, 2, 4) because direct reads confirmed real duplication in each case — see each task's own note.
- **Pre-existing array-index-vs-playerId inconsistency, not this plan's job to fix except where a fold forces it:** `applyTurnAdvance` and `buyDevCard`'s own local-actor call currently match players by array index (`index === nextIndex` / `index === currentPlayerIndex`), not `playerId`, unlike almost every other action in this codebase. `applyTurnAdvance` has no competing receiver-side implementation to reconcile against, so Task 3 preserves index-matching exactly, unchanged. `buyDevCard` DOES have a receiver duplicate (`onDevCardBought`) that already matches by `playerId`, not index — Task 4 must fold these two into one shared action, and a shared action needs one join key, so this fold uses `playerId` (already available as `player.id` in the local actor, and the only key the receiver can offer). This is a forced consequence of the fold, not a stylistic decision — do not extend it to `applyTurnAdvance`, which has no such fold and should stay untouched in this respect.

## Task 1: Migrate `applyCityImprovementPurchase` + `buyCityImprovement`'s Crane refund + `onCityImprovementPurchased`'s Crane refund to `CITY_IMPROVEMENT_PURCHASED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'CITY_IMPROVEMENT_PURCHASED'; playerId: number; track: ImprovementTrack; craneDiscount: boolean }`.

**Why this is a fold, not three separate migrations:** `buyCityImprovement`'s own Crane refund dispatch (`App.tsx:4293-4306`) and `onCityImprovementPurchased`'s Crane refund dispatch (`App.tsx:1652-1665`) are near-verbatim duplicates of each other — both do `commodities[COMMODITY_FOR_TRACK[track]] += 1` for the same player, guarded by the same boolean. `applyCityImprovementPurchase` itself is already a single shared function called by both. Folding all three into one action lets the reducer apply "deduct via `buyImprovementLevel`, then conditionally refund 1" atomically in one dispatch instead of two sequential ones — removes a StrictMode double-invoke exposure the same way sub-plan 4b's Monopoly-family fold did, not an unrelated cleanup.

Current code (verified by direct read, `App.tsx:1272-1279`, `App.tsx:1636-1666`, `App.tsx:4284-4307` — re-confirm exact lines with `grep -n` since they shift):

`applyCityImprovementPurchase` (`App.tsx:1272-1279`):
```tsx
const applyCityImprovementPurchase = (playerId: number, track: ImprovementTrack) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id !== playerId) return p
      const { commodities, cityImprovements } = buyImprovementLevel(p.commodities, p.cityImprovements, track)
      return { ...p, commodities, cityImprovements }
    }) })
}
```

`onCityImprovementPurchased` receiver (`App.tsx:1636-1666`):
```tsx
onCityImprovementPurchased: (payload) => {
  if (!IMPROVEMENT_TRACK_ORDER.includes(payload.track)) {
    console.error('[Catan] Ignoring malformed city-improvement payload:', payload)
    return
  }
  applyCityImprovementPurchase(payload.playerId, payload.track)
  if (payload.craneDiscount) {
    dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
      prev.map((p) =>
        p.id === payload.playerId
          ? { ...p, commodities: { ...p.commodities, [COMMODITY_FOR_TRACK[payload.track]]: p.commodities[COMMODITY_FOR_TRACK[payload.track]] + 1 } }
          : p,
      ) })
  }
},
```

`buyCityImprovement`'s own call + refund (`App.tsx:4284-4307`, everything above/below this excerpt in the function is guards/`inform`/`broadcastCityImprovementPurchased`/`setPendingMetropolisClaim` — untouched):
```tsx
applyCityImprovementPurchase(player.id, track)
if (hasCraneDiscount) {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id === player.id
        ? { ...p, commodities: { ...p.commodities, [COMMODITY_FOR_TRACK[track]]: p.commodities[COMMODITY_FOR_TRACK[track]] + 1 } }
        : p,
    ) })
  setCraneDiscountPlayerId(null)
}
```

`buyImprovementLevel` (`game/cityImprovements.ts:36-56`, already exists, do not modify — it already ceiling-guards at `MAX_IMPROVEMENT_LEVEL`, silently no-oping past it, so the reducer needs no separate validation): `buyImprovementLevel(commodities, cityImprovements, track) => { commodities, cityImprovements }`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — CITY_IMPROVEMENT_PURCHASED', () => {
  it('deducts the improvement cost and raises the track level, no refund when craneDiscount is false', () => {
    const players = createInitialPlayers(1).map((p) => ({ ...p, commodities: { ...p.commodities, trade: 5 } }))
    const before = players[0].commodities.trade
    const result = reducePlayers(players, { type: 'CITY_IMPROVEMENT_PURCHASED', playerId: players[0].id, track: 'trade', craneDiscount: false }, initialGameState)
    const after = result.find((p) => p.id === players[0].id)!
    expect(after.cityImprovements.trade).toBe(players[0].cityImprovements.trade + 1)
    expect(after.commodities.trade).toBe(before - 1)
  })

  it('refunds 1 matching commodity when craneDiscount is true', () => {
    const players = createInitialPlayers(1).map((p) => ({ ...p, commodities: { ...p.commodities, trade: 5 } }))
    const before = players[0].commodities.trade
    const result = reducePlayers(players, { type: 'CITY_IMPROVEMENT_PURCHASED', playerId: players[0].id, track: 'trade', craneDiscount: true }, initialGameState)
    const after = result.find((p) => p.id === players[0].id)!
    expect(after.cityImprovements.trade).toBe(players[0].cityImprovements.trade + 1)
    expect(after.commodities.trade).toBe(before) // full cost deducted, then 1 refunded — net zero at level 1
  })

  it('leaves an untouched player unchanged', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'CITY_IMPROVEMENT_PURCHASED', playerId: players[0].id, track: 'science', craneDiscount: false }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```
(Verify `createInitialPlayers`' default `commodities.trade` value and adjust the exact "before"/"after" numeric expectations if it isn't 0 — the tests above compute `before` from the fixture itself specifically so they don't hardcode an assumption about the starting value; only the level-1 cost of 1 commodity is hardcoded, per `improvementLevelCost(level) = level`.)

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

Add to `PlayersAction`:
```ts
| { type: 'CITY_IMPROVEMENT_PURCHASED'; playerId: number; track: ImprovementTrack; craneDiscount: boolean }
```
Reducer case:
```ts
case 'CITY_IMPROVEMENT_PURCHASED':
  return players.map((p) => {
    if (p.id !== action.playerId) return p
    const { commodities, cityImprovements } = buyImprovementLevel(p.commodities, p.cityImprovements, action.track)
    if (!action.craneDiscount) return { ...p, commodities, cityImprovements }
    const commodity = COMMODITY_FOR_TRACK[action.track]
    return { ...p, commodities: { ...commodities, [commodity]: commodities[commodity] + 1 }, cityImprovements }
  })
```
Add imports to `players.ts`: `buyImprovementLevel` from `'../cityImprovements'`; `COMMODITY_FOR_TRACK`, `type ImprovementTrack` from `'../types'` (confirm the exact existing import lines with `grep -n "^import" catan-3d/src/game/reducers/players.ts` and extend them rather than adding new lines, matching the file's existing style).

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call sites**

`applyCityImprovementPurchase` gains a third parameter and its body becomes one dispatch:
```tsx
const applyCityImprovementPurchase = (playerId: number, track: ImprovementTrack, craneDiscount: boolean) => {
  dispatch({ type: 'CITY_IMPROVEMENT_PURCHASED', playerId, track, craneDiscount })
}
```
`onCityImprovementPurchased` drops its own refund dispatch entirely, becoming:
```tsx
onCityImprovementPurchased: (payload) => {
  if (!IMPROVEMENT_TRACK_ORDER.includes(payload.track)) {
    console.error('[Catan] Ignoring malformed city-improvement payload:', payload)
    return
  }
  applyCityImprovementPurchase(payload.playerId, payload.track, payload.craneDiscount)
},
```
`buyCityImprovement`'s call site (leave every guard/`inform`/`broadcastCityImprovementPurchased`/`setPendingMetropolisClaim` line exactly as-is, only replace this excerpt):
```tsx
applyCityImprovementPurchase(player.id, track, hasCraneDiscount)
if (hasCraneDiscount) setCraneDiscountPlayerId(null)
```

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: fold applyCityImprovementPurchase + Crane refund into CITY_IMPROVEMENT_PURCHASED"
```

---

## Task 2: Migrate `buildCityWall` + `resolveFreeCityWall` + `onCityWallBuilt` to `CITY_WALL_BUILT`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'CITY_WALL_BUILT'; playerId: number; vertexId: string; isFree: boolean }` — same `isFree` field name and meaning as the existing `CityWallBuiltPayload` broadcast shape (`useRoomChannel.ts`) and as `BUILD_ROAD`'s existing `isFreeRoad` field precedent (`game/reducers/board.ts:18`).
- No new shared function needed the way Task 1 needed one — `onCityWallBuilt` (`App.tsx:1971-1982`) is already a single, self-contained `LEGACY_SET_PLAYERS` dispatch matching `payload.isFree ? p.resources : deductCost(...)`, which is exactly what `buildCityWall` and `resolveFreeCityWall` each do for their own `isFree: false`/`isFree: true` case. Introduce one new shared function, `applyCityWallBuilt(playerId, vertexId, isFree)`, called by all three sites.

Current code (verified by direct read, `App.tsx:5163-5181`, `App.tsx:5244-5268`, `App.tsx:1971-1982` — re-confirm exact lines with `grep -n`):

`buildCityWall` (`App.tsx:5163-5181`, only the dispatch changes — every guard above it and the `broadcastCityWallBuilt` call after it stay untouched):
```tsx
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
  prev.map((p) =>
    p.id !== player.id
      ? p
      : { ...p, resources: deductCost(p.resources, CITY_WALL_COST), cityWalls: [...p.cityWalls, vertexId] },
  ) })
if (onlineInfo) broadcastCityWallBuilt({ playerId: player.id, vertexId, isFree: false })
```

`resolveFreeCityWall` (`App.tsx:5244-5268`, only the dispatch changes):
```tsx
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => (p.id !== playerId ? p : { ...p, cityWalls: [...p.cityWalls, vertexId] })) })
setPendingFreeCityWall(null)
...
if (onlineInfo) broadcastCityWallBuilt({ playerId, vertexId, isFree: true })
```

`onCityWallBuilt` receiver (`App.tsx:1971-1982`):
```tsx
onCityWallBuilt: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id !== payload.playerId
        ? p
        : { ...p, resources: payload.isFree ? p.resources : deductCost(p.resources, CITY_WALL_COST), cityWalls: [...p.cityWalls, payload.vertexId] },
    ) })
},
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — CITY_WALL_BUILT', () => {
  it('deducts CITY_WALL_COST and appends the vertex when isFree is false', () => {
    const players = createInitialPlayers(1).map((p) => ({ ...p, resources: { ...p.resources, brick: 5 } }))
    const result = reducePlayers(players, { type: 'CITY_WALL_BUILT', playerId: players[0].id, vertexId: 'v1', isFree: false }, initialGameState)
    const after = result.find((p) => p.id === players[0].id)!
    expect(after.resources.brick).toBe(3) // CITY_WALL_COST = { brick: 2 }
    expect(after.cityWalls).toEqual(['v1'])
  })

  it('appends the vertex with no resource deduction when isFree is true', () => {
    const players = createInitialPlayers(1).map((p) => ({ ...p, resources: { ...p.resources, brick: 5 } }))
    const result = reducePlayers(players, { type: 'CITY_WALL_BUILT', playerId: players[0].id, vertexId: 'v2', isFree: true }, initialGameState)
    const after = result.find((p) => p.id === players[0].id)!
    expect(after.resources.brick).toBe(5)
    expect(after.cityWalls).toEqual(['v2'])
  })

  it('leaves an untouched player unchanged', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'CITY_WALL_BUILT', playerId: players[0].id, vertexId: 'v1', isFree: false }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
| { type: 'CITY_WALL_BUILT'; playerId: number; vertexId: string; isFree: boolean }
```
```ts
case 'CITY_WALL_BUILT':
  return players.map((p) =>
    p.id !== action.playerId
      ? p
      : { ...p, resources: action.isFree ? p.resources : deductCost(p.resources, CITY_WALL_COST), cityWalls: [...p.cityWalls, action.vertexId] },
  )
```
Add `CITY_WALL_COST` to `players.ts`'s existing import from `'../types'` (it's already importing `SETTLEMENT_COST, CITY_COST, ROAD_COST` from the same module — extend that line, confirm with `grep -n "^import" catan-3d/src/game/reducers/players.ts` first).

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call sites**

Add the shared function (place near the other `applyX` shared functions, e.g. right before `buildCityWall`):
```tsx
const applyCityWallBuilt = (playerId: number, vertexId: string, isFree: boolean) => {
  dispatch({ type: 'CITY_WALL_BUILT', playerId, vertexId, isFree })
}
```
`buildCityWall`: replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with `applyCityWallBuilt(player.id, vertexId, false)`.
`resolveFreeCityWall`: replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` line with `applyCityWallBuilt(playerId, vertexId, true)`.
`onCityWallBuilt`: replace its whole body with `applyCityWallBuilt(payload.playerId, payload.vertexId, payload.isFree)`.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: fold buildCityWall/resolveFreeCityWall/onCityWallBuilt into CITY_WALL_BUILT"
```

---

## Task 3: Migrate `applyTurnAdvance` to `TURN_ADVANCED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'TURN_ADVANCED'; nextPlayerIndex: number }`.
- **Preserve the existing array-index matching exactly** — do not change it to `playerId` matching. See this plan's Global Constraints note: this function has no competing receiver-side duplicate to reconcile against, unlike Task 4's fold, so there is no forcing reason to normalize it, and doing so anyway would be an unrequested behavior-shape change, not a faithful migration.

Current code (verified by direct read, `App.tsx:822-889` — only line 872 is the dispatch; re-confirm with `grep -n "const applyTurnAdvance"` since the line may shift):
```tsx
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p, index) => (index === nextIndex ? { ...p, devCardsBoughtThisTurn: [] } : p)) })
```
Everything else in `applyTurnAdvance` (`setCurrentPlayerIndex`, `setFreeRoadsRemaining`, `setDevCardPlayedThisTurn`, `setHasRolledThisTurn`, `setConsecutiveDoublesThisTurn`, `setMerchantFleetRate`, `setPendingKnightRecruit`, `setArmedKnightAction`, `setChasingRobberKnightId`, `setKnightsPromotedThisTurn`, `setRemoteHover`, `playSfx`) is non-players state — untouched. Two call sites, both already calling the shared function unchanged and needing no edits themselves: receiver `onTurnPassed` (`App.tsx:1438`, `applyTurnAdvance(payload.nextPlayerIndex)`) and local actor `endTurn` (`App.tsx:2302-2309`, `applyTurnAdvance(nextIndex)`).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — TURN_ADVANCED', () => {
  it('clears devCardsBoughtThisTurn for the player at nextPlayerIndex only', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, devCardsBoughtThisTurn: ['knight' as const] }))
    const result = reducePlayers(players, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 }, initialGameState)
    expect(result[0].devCardsBoughtThisTurn).toEqual(['knight'])
    expect(result[1].devCardsBoughtThisTurn).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
| { type: 'TURN_ADVANCED'; nextPlayerIndex: number }
```
```ts
case 'TURN_ADVANCED':
  return players.map((p, index) => (index === action.nextPlayerIndex ? { ...p, devCardsBoughtThisTurn: [] } : p))
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyTurnAdvance"`. Replace only the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` line with:
```tsx
dispatch({ type: 'TURN_ADVANCED', nextPlayerIndex: nextIndex })
```
Leave every other line in the function untouched. Do not touch `onTurnPassed` or `endTurn` — both already just call `applyTurnAdvance(...)` with no other change needed.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyTurnAdvance to TURN_ADVANCED"
```

---

## Task 4: Migrate `buyDevCard` + `onDevCardBought` to `DEV_CARD_BOUGHT`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'DEV_CARD_BOUGHT'; playerId: number; card: DevCardType }`.
- **This fold normalizes to `playerId` matching, dropping `buyDevCard`'s current index-based match** — see this plan's Global Constraints note for why: `onDevCardBought` already matches by `p.id === payload.playerId` and has no index concept to offer, so a single shared action folding both sides has no other coherent choice. `player.id` is already in scope in `buyDevCard` (`const player = players[currentPlayerIndex]` is already the first line of the function).

Current code (verified by direct read, `App.tsx:4144-4191`, `App.tsx:1616-1629` — re-confirm exact lines with `grep -n` since they shift):

`buyDevCard`'s dispatch (`App.tsx:4176-4183`, everything above is guards, everything below is `inform`/`broadcastDevCardBought` — untouched):
```tsx
const [card, ...remaining] = devDeck
setDevDeck(remaining)
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
  prev.map((p, index) =>
    index === currentPlayerIndex
      ? { ...p, resources: deductCost(p.resources, DEV_CARD_COST), devCards: [...p.devCards, card], devCardsBoughtThisTurn: [...p.devCardsBoughtThisTurn, card] }
      : p,
  ) })
```

`onDevCardBought` receiver (`App.tsx:1616-1629`):
```tsx
onDevCardBought: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id === payload.playerId
        ? { ...p, resources: deductCost(p.resources, DEV_CARD_COST), devCards: [...p.devCards, payload.card], devCardsBoughtThisTurn: [...p.devCardsBoughtThisTurn, payload.card] }
        : p,
    ) })
  setDevDeck((prev) => prev.slice(1))
},
```
Note both updaters are already structurally identical except the join key — confirms this really is a safe fold, not a behavior change beyond the join-key normalization noted above.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — DEV_CARD_BOUGHT', () => {
  it('deducts DEV_CARD_COST and adds the card to devCards and devCardsBoughtThisTurn', () => {
    const players = createInitialPlayers(1).map((p) => ({ ...p, resources: { ...p.resources, ore: 3, grain: 3, wool: 3 } }))
    const result = reducePlayers(players, { type: 'DEV_CARD_BOUGHT', playerId: players[0].id, card: 'knight' }, initialGameState)
    const after = result.find((p) => p.id === players[0].id)!
    expect(after.resources).toMatchObject({ ore: 2, grain: 2, wool: 2 }) // DEV_CARD_COST = { ore: 1, grain: 1, wool: 1 }
    expect(after.devCards).toEqual(['knight'])
    expect(after.devCardsBoughtThisTurn).toEqual(['knight'])
  })

  it('leaves an untouched player unchanged', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'DEV_CARD_BOUGHT', playerId: players[0].id, card: 'knight' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
| { type: 'DEV_CARD_BOUGHT'; playerId: number; card: DevCardType }
```
```ts
case 'DEV_CARD_BOUGHT':
  return players.map((p) =>
    p.id === action.playerId
      ? { ...p, resources: deductCost(p.resources, DEV_CARD_COST), devCards: [...p.devCards, action.card], devCardsBoughtThisTurn: [...p.devCardsBoughtThisTurn, action.card] }
      : p,
  )
```
Add `DEV_CARD_COST` to `players.ts`'s existing import from `'../types'` (same import line as Task 2's `CITY_WALL_COST` if Task 2 already ran — check `grep -n "^import" catan-3d/src/game/reducers/players.ts` first and extend the existing line rather than duplicating it).

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call sites**

Add a shared function (place near `buyDevCard`):
```tsx
const applyDevCardBought = (playerId: number, card: DevCardType) => {
  dispatch({ type: 'DEV_CARD_BOUGHT', playerId, card })
}
```
`buyDevCard`: replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with `applyDevCardBought(player.id, card)` — `setDevDeck(remaining)` and `const [card, ...remaining] = devDeck` stay exactly where they are, before this call.
`onDevCardBought`: replace its whole body with:
```tsx
onDevCardBought: (payload) => {
  applyDevCardBought(payload.playerId, payload.card)
  setDevDeck((prev) => prev.slice(1))
},
```

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: fold buyDevCard/onDevCardBought into DEV_CARD_BOUGHT"
```

---

## Task 5: Migrate `applyRollResult` to `RESOURCES_PRODUCED` + `DOUBLES_REROLL_HAND_WIPED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'RESOURCES_PRODUCED'; productions: { playerId: number; resource: ResourceType; amount: number; commodity?: CommodityType }[] }` and `{ type: 'DOUBLES_REROLL_HAND_WIPED'; playerId: number }`.
- **This is the one real restructuring task in this plan** (Monopoly-family style, per sub-plan 4b precedent): the production-distribution loop currently runs entirely inside a `LEGACY_SET_PLAYERS` updater closure, mutating a `messages: string[]` array declared in the OUTER function scope as a side effect, and reading `gameRules.citiesAndKnightsCommodities` (a Global-Constraint value that can never be read inside the reducer) from inside that same closure. The fix: move the whole per-tile/per-vertex loop OUTSIDE the dispatch, computing a flat `productions` list and the `messages` array exactly as today (same loop body, same conditions, same message strings), using the already-in-scope `players`/`playerById`/`tiles`/`graph`/`gameState.board.settlements`/`gameRules` — then dispatch the pure `productions` list for the reducer to fold onto players. The `messages.push`/`inform` calls stay exactly where they are relative to each other, just now all running before dispatch rather than some-inside/some-outside.
- The doubles-reroll branch (`gameRules.doublesRerollRule && doublesCount >= 3`) is a separate, trivial single-player mutation — no restructuring needed, just its own action.
- **What does NOT move:** the Science-level-3 free-resource-eligibility block (`App.tsx:3310-3328`, after the production dispatch) already reads the pre-dispatch `players`/`gameState.board.settlements` closure values (React state doesn't reflect a dispatch synchronously within the same render), so it already sees the correct "before this roll's production" snapshot — it needs no change at all, just confirm it still compiles unchanged after the production loop above it is restructured.

Current code (verified by direct read, `App.tsx:3170-3349` in full — re-confirm exact lines with `grep -n "const applyRollResult"` since they shift; only the production-distribution and doubles-wipe blocks below change, everything else in this large function — turn-order guards, the 7-rolled/discard/robber branch, `debugLog`, `setLastRoll`/`setHasRolledThisTurn`/`setTotalRollsThisGame`/`setConsecutiveDoublesThisTurn`, the Science-level-3 block, the final `return doublesCount` — stays exactly as-is):

Production-distribution block, currently `App.tsx:3255-3302`:
```tsx
const robberTile = tileById.get(robberTileId)
const isBlocked = robberTile?.number === total
const messages: string[] = []
if (isBlocked && robberTile) {
  messages.push(`The Robber blocks ${BIOME_LABELS[robberTile.biome]} — no resources from that hex.`)
}

dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => {
  const next = prev.map((p) => ({ ...p, resources: { ...p.resources }, commodities: { ...p.commodities } }))
  const byId = new Map(next.map((p) => [p.id, p]))

  for (const tile of tiles) {
    if (tile.number !== total) continue
    if (tile.id === robberTileId) continue

    const resource = BIOME_TO_RESOURCE[tile.biome]
    if (!resource) continue

    const commodity = COMMODITY_FOR_BIOME[tile.biome]

    const vertexIds = graph.tileVertexIds.get(tile.id) ?? []
    for (const vertexId of vertexIds) {
      const building = gameState.board.settlements[vertexId]
      if (!building) continue
      const owner = byId.get(building.ownerId)
      if (!owner) continue

      if (building.type === 'city' && gameRules.citiesAndKnightsCommodities && commodity) {
        owner.resources[resource] += 1
        owner.commodities[commodity] += 1
        messages.push(`${owner.name} city yields 1 ${RESOURCE_LABELS[resource]} + 1 ${COMMODITY_LABELS[commodity]}!`)
        continue
      }

      const amount = building.type === 'city' ? 2 : 1
      owner.resources[resource] += amount
      if (building.type === 'city') {
        messages.push(`${owner.name} city yields ${amount} ${RESOURCE_LABELS[resource]}!`)
      }
    }
  }

  return next
} })
```

Doubles-wipe block, currently `App.tsx:3342-3346`:
```tsx
if (gameRules.doublesRerollRule && doublesCount >= 3 && roller) {
  debugLog('doubles-reroll hand wipe', { rollerId: roller.id, rollerName: roller.name, doublesCount, isStillRollersTurn })
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => (p.id === roller.id ? { ...p, resources: emptyResources() } : p)) })
  inform(`${roller.name} rolled doubles three times in a row — hand emptied!`)
}
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — RESOURCES_PRODUCED', () => {
  it('applies resource-only production to the named player', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'RESOURCES_PRODUCED', productions: [{ playerId: players[0].id, resource: 'lumber', amount: 2 }] },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(players[0].resources.lumber + 2)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })

  it('applies a resource+commodity production entry together', () => {
    const players = createInitialPlayers(1)
    const result = reducePlayers(
      players,
      { type: 'RESOURCES_PRODUCED', productions: [{ playerId: players[0].id, resource: 'wool', amount: 1, commodity: 'cloth' }] },
      initialGameState,
    )
    const after = result.find((p) => p.id === players[0].id)!
    expect(after.resources.wool).toBe(players[0].resources.wool + 1)
    expect(after.commodities.cloth).toBe(players[0].commodities.cloth + 1)
  })

  it('sums multiple production entries for the same player', () => {
    const players = createInitialPlayers(1)
    const result = reducePlayers(
      players,
      { type: 'RESOURCES_PRODUCED', productions: [
        { playerId: players[0].id, resource: 'grain', amount: 1 },
        { playerId: players[0].id, resource: 'grain', amount: 2 },
      ] },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources.grain).toBe(players[0].resources.grain + 3)
  })
})

describe('reducePlayers — DOUBLES_REROLL_HAND_WIPED', () => {
  it('empties the named player\'s resources and leaves others untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 3, brick: 2, wool: 1, grain: 4, ore: 0 } }))
    const result = reducePlayers(players, { type: 'DOUBLES_REROLL_HAND_WIPED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.resources).toEqual(emptyResources())
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```
(Verify `emptyResources` is importable into the test file the same way `players.ts` itself would need it — check `grep -n "emptyResources"` in both `App.tsx`'s import and `game/types.ts` or wherever it's defined, since the reducer case needs to call it too.)

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action types and reducer cases**

```ts
| { type: 'RESOURCES_PRODUCED'; productions: { playerId: number; resource: ResourceType; amount: number; commodity?: CommodityType }[] }
| { type: 'DOUBLES_REROLL_HAND_WIPED'; playerId: number }
```
```ts
case 'RESOURCES_PRODUCED':
  return players.map((p) => {
    const events = action.productions.filter((e) => e.playerId === p.id)
    if (events.length === 0) return p
    const resources = { ...p.resources }
    const commodities = { ...p.commodities }
    for (const e of events) {
      resources[e.resource] += e.amount
      if (e.commodity) commodities[e.commodity] += 1
    }
    return { ...p, resources, commodities }
  })
case 'DOUBLES_REROLL_HAND_WIPED':
  return players.map((p) => (p.id === action.playerId ? { ...p, resources: emptyResources() } : p))
```
Confirm `emptyResources` is importable into `players.ts` (grep its definition location and existing import style first) and add the import.

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm current line numbers with `grep -n "const applyRollResult"`. Replace the production-distribution block (quoted above) with:
```tsx
const robberTile = tileById.get(robberTileId)
const isBlocked = robberTile?.number === total
const messages: string[] = []
if (isBlocked && robberTile) {
  messages.push(`The Robber blocks ${BIOME_LABELS[robberTile.biome]} — no resources from that hex.`)
}

const productions: { playerId: number; resource: ResourceType; amount: number; commodity?: CommodityType }[] = []
for (const tile of tiles) {
  if (tile.number !== total) continue
  if (tile.id === robberTileId) continue

  const resource = BIOME_TO_RESOURCE[tile.biome]
  if (!resource) continue

  const commodity = COMMODITY_FOR_BIOME[tile.biome]

  const vertexIds = graph.tileVertexIds.get(tile.id) ?? []
  for (const vertexId of vertexIds) {
    const building = gameState.board.settlements[vertexId]
    if (!building) continue
    const owner = playerById.get(building.ownerId)
    if (!owner) continue

    if (building.type === 'city' && gameRules.citiesAndKnightsCommodities && commodity) {
      productions.push({ playerId: owner.id, resource, amount: 1, commodity })
      messages.push(`${owner.name} city yields 1 ${RESOURCE_LABELS[resource]} + 1 ${COMMODITY_LABELS[commodity]}!`)
      continue
    }

    const amount = building.type === 'city' ? 2 : 1
    productions.push({ playerId: owner.id, resource, amount })
    if (building.type === 'city') {
      messages.push(`${owner.name} city yields ${amount} ${RESOURCE_LABELS[resource]}!`)
    }
  }
}

dispatch({ type: 'RESOURCES_PRODUCED', productions })
```
(Note: `byId`/`next` are gone — `playerById` replaces `byId.get(...)`, reading `.id`/`.name` off the existing immutable `Player` object rather than a mutated clone. `messages` construction is otherwise byte-identical, just no longer inside a closure.)

Replace the doubles-wipe block (quoted above) with:
```tsx
if (gameRules.doublesRerollRule && doublesCount >= 3 && roller) {
  debugLog('doubles-reroll hand wipe', { rollerId: roller.id, rollerName: roller.name, doublesCount, isStillRollersTurn })
  dispatch({ type: 'DOUBLES_REROLL_HAND_WIPED', playerId: roller.id })
  inform(`${roller.name} rolled doubles three times in a row — hand emptied!`)
}
```
Leave the Science-level-3 block (`App.tsx:3310-3328`, between these two) and everything else in the function untouched. Both call sites (`App.tsx:3148` local roller path, `App.tsx:3356` receiver mirror path) already call `applyRollResult(...)` unchanged and need no edits.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyRollResult to RESOURCES_PRODUCED + DOUBLES_REROLL_HAND_WIPED"
```

---

## Task 6: Migrate `applyBarbarianWinnerDraw` to reuse `PROGRESS_CARDS_DRAWN`

**Files:**
- Modify: `catan-3d/src/App.tsx`
- No `players.ts`/`players.test.ts` changes — `PROGRESS_CARDS_DRAWN` already exists (added in sub-plan 4b, `players.ts` case at the line handling `action.draws.filter((d) => d.playerId === p.id).map((d) => d.card)`) and is already tested for this exact shape (filter-by-playerId, append-to-progressCards). This task reuses it verbatim with a single-element `draws` array — no new reducer code, so no new reducer test is needed.

**Why this is in scope for sub-plan 5 despite not being in the spec's bucket-5 list:** flagged during sub-plan 4b's final verification as a genuine gap in the parent spec's original function inventory (see this plan's header). Confirmed by two independent reviews (sub-plan 4b's own final whole-branch review, and this plan's research pass) to still exist, still use `LEGACY_SET_PLAYERS`, unchanged shape.

Current code (verified by direct read, `App.tsx:1257-1263` — re-confirm with `grep -n "const applyBarbarianWinnerDraw"` since it may have shifted):
```tsx
const applyBarbarianWinnerDraw = (playerId: number, card: ProgressCardType) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => (p.id === playerId ? { ...p, progressCards: [...p.progressCards, card] } : p)) })
  // Filtered by playerId, not sliced off the front — same reasoning as
  // applyPillage above: online, tied winners resolve independently in
  // whatever order they each act, not queue order.
  setWinnerDrawQueue((prev) => prev.filter((id) => id !== playerId))
}
```

Three call sites, none needing any change themselves — all already call `applyBarbarianWinnerDraw(playerId, card)` unchanged: receiver `onBarbarianWinnerDrawResolved` (`App.tsx:1509-1524`), local actor `handleBarbarianWinnerDraw` (`App.tsx:2208-2222`), and a `useEffect` timeout-sweep (`App.tsx:3556-3577`) that loops `winnerDrawQueue` and calls `applyBarbarianWinnerDraw(playerId, card)` once per still-queued player — confirm this loop still calls the shared function unchanged, not something needing its own per-call dispatch shape change.

- [ ] **Step 1: Confirm the current line** with `grep -n "const applyBarbarianWinnerDraw"`.
- [ ] **Step 2: Replace only the dispatch line**

```tsx
dispatch({ type: 'PROGRESS_CARDS_DRAWN', draws: [{ playerId, card }] })
```
Leave the `setWinnerDrawQueue` line and its comment untouched. Do not touch any of the three call sites — all three already just call `applyBarbarianWinnerDraw(playerId, card)` with no other change needed.

- [ ] **Step 3: Typecheck, lint, full test suite**
- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate applyBarbarianWinnerDraw to reuse PROGRESS_CARDS_DRAWN"
```

---

## Task 7: Final verification

- [ ] **Step 1:** `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run` — must be clean.
- [ ] **Step 2: Shape-based bridge-count audit**, not just a raw count (per sub-plan 4a's own final-review lesson, re-applied every sub-plan since: "a shape count is what proves the plan was complete, a bridge count alone cannot"). `grep -c LEGACY_SET_PLAYERS catan-3d/src/App.tsx` should read **2** (was 14 at the end of sub-plan 4b; this plan migrates 11 spec-named sites + 1 tail item = 12; 14 − 12 = 2). Manually identify the enclosing function for each of the 2 remaining sites and confirm both are `resetGame`/`restoreFromSnapshot` (sub-plan 6's explicitly-scoped territory, per the parent spec's bucket 6) — if either remaining site is NOT one of these two, or if the count isn't exactly 2, stop and report rather than assuming the audit is wrong.
- [ ] **Step 3:** Boot smoke test — start the dev server, confirm it serves HTTP 200 with no console errors, then stop it (no browser automation available in this environment for a full interactive playtest — same limitation every prior sub-plan in this project has recorded).

No commit for this task (verification only) — proceed straight to the final whole-branch review once Step 1 and Step 2 are both clean.
