# Game State Reducer — Players Slice, Sub-plan 3: Barbarians + Knights — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every barbarian-attack, taxation, and Cities & Knights "knight" function off the `LEGACY_SET_PLAYERS` bridge onto real, typed `PlayersAction` cases: `applyBarbarianAttackResult`, `resolveTaxation`, `armTaxation`, `handleKnightVertexSelect`, `handleKnightSelect`, `activateKnight`, `promoteKnight`, `playSmithing`, `playEncouragement`, `playTreason`, and `moveRobber`'s carried-over chase-robber-knight-deactivation call.

**Architecture:** Same shape as sub-plans 1-2: one `reducePlayers` case per action, tested directly with Vitest. Two different call-site patterns appear here:
- **Already-shared functions** (`applyBarbarianAttackResult`, and every `handleKnightVertexSelect`/`handleKnightSelect` branch): the sender-side function is already the single trusted-apply helper called by both the local decider and the network receiver (receivers just forward to it, e.g. `onBarbarianAttackResolved: (payload) => { ...; applyBarbarianAttackResult(payload.result) }`) — these need only their own `LEGACY_SET_PLAYERS` call(s) swapped for a real dispatch, nothing else changes.
- **Independently-duplicated pairs** (every knight-event receiver in `useRoomChannel`'s handlers object, plus taxation): today there is no shared JS function between sender and receiver at all — each side independently hand-writes the identical object-shape transform in its own `LEGACY_SET_PLAYERS` updater. For the 9 simple one-shot knight events (recruit, move, displace, intrigue, activate, promote, smithing, encouragement, chase-deactivation, treason), the fix is: write ONE `reducePlayers` case per event, then have BOTH the sender function and the receiver handler dispatch that SAME action — the duplication collapses because there is now exactly one implementation of the math (in the reducer), even though there remain two call sites (one per code path, as is true for every other action in this file). No new shared App.tsx-level helper is needed for these nine, since neither side has extra side effects that need sharing beyond the dispatch itself. **Taxation is the one exception**: `resolveTaxation` and `onTaxationResolved` share a large block of *identical* residual side effects (`setRobberTileId`, `playSfx('robber')`, `inform(...)`, `setPendingTaxation(null)`, `setGamePhase('playing')`) in addition to the players-math — this sub-plan extracts a shared `applyTaxationResolved(...)` function for taxation specifically, mirroring the `applyBankTrade` precedent from sub-plan 2's Task 7.

**Tech Stack:** TypeScript, React (`useReducer`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-game-state-reducer-players-slice-design.md` (bucket 3 of the migration roadmap, `~line 79`) and its parent `docs/superpowers/specs/2026-08-19-game-state-reducer-design.md`.

## Global Constraints

- **Reducers are pure appliers, always.** No `Math.random()`, no `inform()`/`warn()`/`playSfx()`, no `Date.now()`. `reducePlayers` cases only compute the next `Player[]`.
- **This sub-plan touches ONLY the players-side write in each function**, plus (for taxation only) the residual side effects that get folded into the new shared `applyTaxationResolved`. Every other side effect (`setState` calls for local UI/turn-scoped state like `pendingKnightRecruit`, `armedKnightAction`, `chasingRobberKnightId`, `knightsPromotedThisTurn`, `barbarianTrackPosition`, `robberActive`, `activeBarbarianAttack`, `pillageQueue`, `winnerDrawQueue`; every `warn()`/guard; every `broadcastX()` call) stays exactly as-is, at its existing call site. None of these local-state fields are part of `GameState` (`GameState` is exactly `{ board: BoardState; players: Player[] }` — no `KnightsState`/`BarbariansState` slice exists), and none of them become part of it in this sub-plan.
- **`playTreason` is added to this sub-plan's scope by ruling, not by the spec's bucket-3 prose.** The design spec's function list for this bucket does not name `playTreason`, but it explicitly lists `onTreasonRemoved` under "Receiver duplicates to delete" — deleting a receiver's duplicate requires its sender counterpart to dispatch the same real action (otherwise the sender stays on the bridge while the receiver dispatches a new action type, breaking multiplayer sync between an old-pattern sender and a new-pattern receiver). `playTreason`'s full current body was independently verified in this worktree (see Task 12) before writing this plan — the omission from the prose list is treated as a spec drafting gap, not a signal to skip it.
- **Verified inventory** (confirmed by reading the live worktree, not just the spec text): `onBarbarianAttackResolved` already forwards cleanly to `applyBarbarianAttackResult`. Every one of the ten knight/taxation receiver handlers (`onKnightRecruited`, `onKnightActivated`, `onKnightPromoted`, `onKnightMoved`, `onKnightDisplaced`, `onKnightDeactivatedAfterChase`, `onSmithingPlayed`, `onEncouragementPlayed`, `onIntrigueResolved`, `onTreasonRemoved`, `onTaxationResolved`) independently re-implements the same object-shape transform its sender-side counterpart performs — these are genuine duplicates (unlike sub-plan 2's `onRobberMoved`/`onPillageResolved`/etc., which were already one-line forwards). `onProgressCardPlayed`'s `'taxation'` branch is also a genuine (if smaller) duplicate of `armTaxation`'s dispatch.
- Re-confirm every line number below with `grep -n` before editing — earlier tasks in this plan shift later line numbers, and this file has been touched by two prior sub-plans already.
- **No existing `PlayersAction`/`BoardAction` variant covers any of the 12 actions this sub-plan introduces** — unlike sub-plan 2's `PILLAGE_CITY` (which already existed from the board slice and only needed a `reducePlayers` case added), every action type in this sub-plan is created from scratch.

---

### Task 1: Migrate `applyBarbarianAttackResult` to `DEFENDER_OF_CATAN_AWARDED` + `ALL_KNIGHTS_DEACTIVATED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'DEFENDER_OF_CATAN_AWARDED'; playerId: number }` and `{ type: 'ALL_KNIGHTS_DEACTIVATED' }` (no payload — applies to every player unconditionally).

Current `applyBarbarianAttackResult` body (verified in the live worktree, `App.tsx:3178-3206`):
```tsx
const applyBarbarianAttackResult = (result: BarbarianAttackResult) => {
  setActiveBarbarianAttack(result)
  setPillageQueue(result.pillageTargets)
  if (result.defendersWin) {
    const soleWinner = result.winners.find((w) => !w.tied)
    if (soleWinner) {
      dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
        prev.map((p) => (p.id === soleWinner.playerId ? { ...p, defenderOfCatanCount: p.defenderOfCatanCount + 1 } : p)) })
      const winnerPlayer = playerById.get(soleWinner.playerId)
      if (winnerPlayer) inform(`${winnerPlayer.name} is the Defender of Catan! +1 VP.`)
    } else if (gameRules.citiesAndKnightsProgressCards) {
      setWinnerDrawQueue(result.winners.map((w) => w.playerId))
    }
    // ... (unrelated comment, unchanged)
  }
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => ({ ...p, knightPieces: p.knightPieces.map((k) => ({ ...k, active: false })) })) })
}
```
This function is already the single shared trusted-apply helper — `onBarbarianAttackResolved` (`App.tsx:1492-1499`) already calls it directly (`applyBarbarianAttackResult(payload.result)`), so no receiver-side change is needed in this task.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — DEFENDER_OF_CATAN_AWARDED', () => {
  it('increments defenderOfCatanCount for the named player only', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'DEFENDER_OF_CATAN_AWARDED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.defenderOfCatanCount).toBe(players[0].defenderOfCatanCount + 1)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — ALL_KNIGHTS_DEACTIVATED', () => {
  it('sets active to false on every knight for every player', () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      knightPieces: [{ id: `k${i}`, ownerId: p.id, strength: 'basic' as const, active: true, vertexId: `V${i}` }],
    }))
    const result = reducePlayers(players, { type: 'ALL_KNIGHTS_DEACTIVATED' }, initialGameState)
    expect(result[0].knightPieces[0].active).toBe(false)
    expect(result[1].knightPieces[0].active).toBe(false)
  })

  it('leaves a player with no knights unchanged', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'ALL_KNIGHTS_DEACTIVATED' }, initialGameState)
    expect(result[0].knightPieces).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action types and reducer cases**

Add to `PlayersAction` in `players.ts`:
```ts
| { type: 'DEFENDER_OF_CATAN_AWARDED'; playerId: number }
| { type: 'ALL_KNIGHTS_DEACTIVATED' }
```
Add to the `switch`:
```ts
case 'DEFENDER_OF_CATAN_AWARDED':
  return players.map((p) => (p.id === action.playerId ? { ...p, defenderOfCatanCount: p.defenderOfCatanCount + 1 } : p))
case 'ALL_KNIGHTS_DEACTIVATED':
  return players.map((p) => ({ ...p, knightPieces: p.knightPieces.map((k) => ({ ...k, active: false })) }))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `applyBarbarianAttackResult`'s two call sites**

Confirm current lines with `grep -n "const applyBarbarianAttackResult" src/App.tsx`. Replace:
```tsx
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
  prev.map((p) => (p.id === soleWinner.playerId ? { ...p, defenderOfCatanCount: p.defenderOfCatanCount + 1 } : p)) })
```
with:
```tsx
dispatch({ type: 'DEFENDER_OF_CATAN_AWARDED', playerId: soleWinner.playerId })
```
and replace:
```tsx
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => ({ ...p, knightPieces: p.knightPieces.map((k) => ({ ...k, active: false })) })) })
```
with:
```tsx
dispatch({ type: 'ALL_KNIGHTS_DEACTIVATED' })
```
Leave `setActiveBarbarianAttack`, `setPillageQueue`, the `inform(...)` call, and `setWinnerDrawQueue` untouched.

- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyBarbarianAttackResult to DEFENDER_OF_CATAN_AWARDED and ALL_KNIGHTS_DEACTIVATED"
```

---

### Task 2: Migrate taxation (`armTaxation`, `resolveTaxation`, `onTaxationResolved`, `onProgressCardPlayed`'s taxation branch) to `TAXATION_ARMED` + `TAXATION_RESOLVED`, via a shared `applyTaxationResolved`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'TAXATION_ARMED'; playerId: number }` and `{ type: 'TAXATION_RESOLVED'; playerId: number; tileId: string; steals: { victimId: number; item: StolenItem | null }[] }` (field names match `TaxationResolvedPayload`, `catan-3d/src/multiplayer/useRoomChannel.ts:574-578`, exactly). Also produces a new local function `applyTaxationResolved(playerId: number, tileId: string, steals: { victimId: number; item: StolenItem | null }[], isDeciding: boolean): void` in `App.tsx`.

This is the one taxation-shaped duplicate in this sub-plan (mirrors sub-plan 2's `bankTrade`/`applyBankTrade` restructuring): `resolveTaxation` and `onTaxationResolved` each independently perform the identical players-math AND an identical block of residual side effects (`setRobberTileId`, `playSfx('robber')`, `inform`, `setPendingTaxation(null)`, `setGamePhase('playing')`). `onTaxationResolved` additionally validates each `steal.item` against `RESOURCE_ORDER`/`COMMODITY_ORDER` before applying it (a malformed network payload guard) — `resolveTaxation`'s own locally-computed `steals` never needs this, since it built the array itself from trusted local state. Fold that validation into `applyTaxationResolved` itself (filtering the `steals` array before dispatch) so it runs uniformly and the reducer case can trust every item it receives — this matches the codebase's "validation stays outside the reducer, at the pre-dispatch boundary" convention.

Current `armTaxation` (verified, `App.tsx:5981-6007`):
```tsx
const armTaxation = () => {
  if (!canPlayProgressCardNow()) return
  if (!isMyTurn) { warn("It's not your turn."); return }
  if (gameRules.citiesAndKnightsBarbarians && !robberActive) {
    warn('Taxation can only be played after the first barbarian attack.')
    return
  }
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('taxation')) { warn('No Taxation card to play.'); return }
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'taxation') } : p)) })
  setPendingTaxation(player.id)
  setGamePhase('moveRobber')
  inform(`${player.name} played Taxation — choose a hex for the robber.`)
  if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'taxation' })
}
```

Current `resolveTaxation` (verified, `App.tsx:3817-3883`):
```tsx
const resolveTaxation = (tileId: string) => {
  const playerId = pendingTaxation
  if (playerId == null) return
  if (tileId === robberTileId) { warn('The Robber must move to a new hex!'); return }
  setRobberTileId(tileId)
  playSfx('robber')
  const vertexIds = graph.tileVertexIds.get(tileId) ?? []
  const victimIds = new Set<number>()
  for (const vertexId of vertexIds) {
    const building = gameState.board.settlements[vertexId]
    if (building && building.ownerId !== playerId) victimIds.add(building.ownerId)
  }
  const steals: { victimId: number; item: StolenItem | null }[] = []
  for (const victimId of victimIds) {
    const victim = players.find((p) => p.id === victimId)
    if (!victim) continue
    const heldItems = heldItemsFor(victim)
    if (heldItems.length === 0) { steals.push({ victimId, item: null }); continue }
    steals.push({ victimId, item: pickRandom(heldItems) })
  }
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      const steal = steals.find((s) => s.victimId === p.id)
      if (steal?.item) {
        const item = steal.item
        return (COMMODITY_ORDER as string[]).includes(item)
          ? { ...p, commodities: { ...p.commodities, [item]: p.commodities[item as CommodityType] - 1 } }
          : { ...p, resources: { ...p.resources, [item]: p.resources[item as ResourceType] - 1 } }
      }
      if (p.id === playerId) {
        const resources = { ...p.resources }
        const commodities = { ...p.commodities }
        for (const s of steals) {
          if (!s.item) continue
          if ((COMMODITY_ORDER as string[]).includes(s.item)) {
            const commodity = s.item as CommodityType
            commodities[commodity] += 1
          } else {
            const resource = s.item as ResourceType
            resources[resource] += 1
          }
        }
        return { ...p, resources, commodities }
      }
      return p
    }) })
  const tile = tileById.get(tileId)
  const actor = playerById.get(playerId)
  if (tile && actor) inform(`${actor.name} played Taxation on ${BIOME_LABELS[tile.biome]}.`)
  setPendingTaxation(null)
  setGamePhase('playing')
  if (onlineInfo) broadcastTaxationResolved({ playerId, tileId, steals })
}
```

Current `onTaxationResolved` (verified, `App.tsx:2201-2248`):
```tsx
onTaxationResolved: (payload) => {
  setRobberTileId(payload.tileId)
  playSfx('robber')
  const isValidItem = (item: StolenItem): boolean =>
    (RESOURCE_ORDER as string[]).includes(item) || (COMMODITY_ORDER as string[]).includes(item)
  const gained = payload.steals.filter(
    (s): s is { victimId: number; item: StolenItem } => s.item != null && isValidItem(s.item),
  )
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      const steal = payload.steals.find((s) => s.victimId === p.id)
      if (steal && steal.item != null) {
        if (!isValidItem(steal.item)) {
          console.error('[Catan] Ignoring taxation-resolved payload with an invalid stolen item:', steal.item)
          return p
        }
        const item = steal.item
        return (COMMODITY_ORDER as string[]).includes(item)
          ? { ...p, commodities: { ...p.commodities, [item]: p.commodities[item as CommodityType] - 1 } }
          : { ...p, resources: { ...p.resources, [item]: p.resources[item as ResourceType] - 1 } }
      }
      if (p.id === payload.playerId) {
        const resources = { ...p.resources }
        const commodities = { ...p.commodities }
        for (const s of gained) {
          if ((COMMODITY_ORDER as string[]).includes(s.item)) {
            const commodity = s.item as CommodityType
            commodities[commodity] += 1
          } else {
            const resource = s.item as ResourceType
            resources[resource] += 1
          }
        }
        return { ...p, resources, commodities }
      }
      return p
    }) })
  const tile = tileById.get(payload.tileId)
  const actor = playerById.get(payload.playerId)
  if (tile && actor) inform(`${actor.name} played Taxation on ${BIOME_LABELS[tile.biome]}.`)
  setPendingTaxation(null)
  setGamePhase('playing')
},
```

Current `onProgressCardPlayed`'s `'taxation'` branch (verified, `App.tsx:1796-1805`):
```tsx
} else if (payload.card === 'taxation') {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => (p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'taxation') } : p)) })
}
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — TAXATION_ARMED', () => {
  it('removes one taxation card from the named player only', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['taxation'] as const }))
    const result = reducePlayers(players, { type: 'TAXATION_ARMED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual([])
    expect(result.find((p) => p.id === players[1].id)!.progressCards).toEqual(['taxation'])
  })
})

describe('reducePlayers — TAXATION_RESOLVED', () => {
  it('deducts each victim\'s stolen item and credits the actor', () => {
    const players = createInitialPlayers(3).map((p, i) => ({
      ...p,
      resources: i === 1 ? { lumber: 2, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'TAXATION_RESOLVED', playerId: players[0].id, tileId: 'T1', steals: [{ victimId: players[1].id, item: 'lumber' }] },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[1].id)!.resources.lumber).toBe(1)
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(1)
  })

  it('skips a victim with nothing to steal (item: null)', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'TAXATION_RESOLVED', playerId: players[0].id, tileId: 'T1', steals: [{ victimId: players[1].id, item: null }] },
      initialGameState,
    )
    expect(result).toEqual(players)
  })

  it('credits multiple stolen items of mixed resource/commodity types to the actor', () => {
    const players = createInitialPlayers(3).map((p, i) => ({
      ...p,
      resources: i === 1 ? { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
      commodities: i === 2 ? { paper: 1, cloth: 0, coin: 0 } : { paper: 0, cloth: 0, coin: 0 },
    }))
    const result = reducePlayers(
      players,
      {
        type: 'TAXATION_RESOLVED',
        playerId: players[0].id,
        tileId: 'T1',
        steals: [
          { victimId: players[1].id, item: 'lumber' },
          { victimId: players[2].id, item: 'paper' },
        ],
      },
      initialGameState,
    )
    const actor = result.find((p) => p.id === players[0].id)!
    expect(actor.resources.lumber).toBe(1)
    expect(actor.commodities.paper).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action types and reducer cases**

Add to `PlayersAction`:
```ts
| { type: 'TAXATION_ARMED'; playerId: number }
| { type: 'TAXATION_RESOLVED'; playerId: number; tileId: string; steals: { victimId: number; item: StolenItem | null }[] }
```
`StolenItem` should already be imported in `players.ts` from Task 1 of sub-plan 2 — confirm before adding a duplicate import. Add to the `switch`:
```ts
case 'TAXATION_ARMED':
  return players.map((p) => (p.id === action.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'taxation') } : p))
case 'TAXATION_RESOLVED':
  return players.map((p) => {
    const steal = action.steals.find((s) => s.victimId === p.id)
    if (steal?.item) {
      const item = steal.item
      return (COMMODITY_ORDER as string[]).includes(item)
        ? { ...p, commodities: { ...p.commodities, [item]: p.commodities[item as CommodityType] - 1 } }
        : { ...p, resources: { ...p.resources, [item]: p.resources[item as ResourceType] - 1 } }
    }
    if (p.id === action.playerId) {
      const resources = { ...p.resources }
      const commodities = { ...p.commodities }
      for (const s of action.steals) {
        if (!s.item) continue
        if ((COMMODITY_ORDER as string[]).includes(s.item)) {
          const commodity = s.item as CommodityType
          commodities[commodity] += 1
        } else {
          const resource = s.item as ResourceType
          resources[resource] += 1
        }
      }
      return { ...p, resources, commodities }
    }
    return p
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Introduce the shared `applyTaxationResolved` function**

Confirm the current line with `grep -n "const resolveTaxation = " src/App.tsx`. Immediately above `resolveTaxation`, add:
```tsx
// Trusted state mutation for a resolved Taxation steal — shared by the
// local actor (resolveTaxation, below, which also broadcasts) and
// receiving clients (onTaxationResolved). Validates each stolen item
// against RESOURCE_ORDER/COMMODITY_ORDER before dispatch, same reasoning
// applyRobberMove's own safeStolenItem guard gives — an invalid entry only
// drops THAT ONE victim's steal rather than the whole payload.
const applyTaxationResolved = (playerId: number, tileId: string, steals: { victimId: number; item: StolenItem | null }[], isDeciding: boolean) => {
  setRobberTileId(tileId)
  playSfx('robber')
  const isValidItem = (item: StolenItem): boolean =>
    (RESOURCE_ORDER as string[]).includes(item) || (COMMODITY_ORDER as string[]).includes(item)
  const safeSteals = steals.map((s) => {
    if (s.item != null && !isValidItem(s.item)) {
      console.error('[Catan] Ignoring taxation-resolved payload with an invalid stolen item:', s.item)
      return { victimId: s.victimId, item: null }
    }
    return s
  })
  dispatch({ type: 'TAXATION_RESOLVED', playerId, tileId, steals: safeSteals })
  const tile = tileById.get(tileId)
  const actor = playerById.get(playerId)
  if (tile && actor) inform(`${actor.name} played Taxation on ${BIOME_LABELS[tile.biome]}.`)
  setPendingTaxation(null)
  setGamePhase('playing')
  if (isDeciding && onlineInfo) broadcastTaxationResolved({ playerId, tileId, steals: safeSteals })
}
```

- [ ] **Step 6: Replace `resolveTaxation`'s tail with a call to `applyTaxationResolved`**

Replace everything from the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block through the end of the function (the `dispatch`, `inform`, `setPendingTaxation(null)`, `setGamePhase('playing')`, and `broadcastTaxationResolved` call) with:
```tsx
applyTaxationResolved(playerId, tileId, steals, true)
```
Leave the early guards and the `victimIds`/`steals`-building loops above it untouched — `setRobberTileId`/`playSfx('robber')` now run twice in a row (once here, once inside `applyTaxationResolved`) only if you fail to remove them from `resolveTaxation`'s own body; since `applyTaxationResolved` performs them, **remove `resolveTaxation`'s own `setRobberTileId(tileId)` and `playSfx('robber')` lines** (originally right after the early guards) so they run exactly once.

- [ ] **Step 7: Replace `onTaxationResolved`'s body with a call to `applyTaxationResolved`**

Confirm the current line with `grep -n "onTaxationResolved:" src/App.tsx`. Replace the entire handler body with:
```tsx
onTaxationResolved: (payload) => {
  applyTaxationResolved(payload.playerId, payload.tileId, payload.steals, false)
},
```

- [ ] **Step 8: Update `armTaxation`'s call site**

Confirm the current line with `grep -n "const armTaxation = " src/App.tsx`. Replace:
```tsx
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'taxation') } : p)) })
```
with:
```tsx
dispatch({ type: 'TAXATION_ARMED', playerId: player.id })
```

- [ ] **Step 9: Update `onProgressCardPlayed`'s `'taxation'` branch**

Confirm the current line with `grep -n "payload.card === 'taxation'" src/App.tsx`. Replace:
```tsx
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
  prev.map((p) => (p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'taxation') } : p)) })
```
with:
```tsx
dispatch({ type: 'TAXATION_ARMED', playerId: payload.playerId })
```

- [ ] **Step 10: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 11: Manual verification**

Dev server, 2-client online test if possible: play Taxation, choose a hex with multiple victims (mixed resource/commodity holdings, including a victim with an empty hand), confirm both clients show identical resource/commodity counts for actor and every victim, and the correct banner.

- [ ] **Step 12: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate taxation to TAXATION_ARMED/TAXATION_RESOLVED via a shared applyTaxationResolved, deleting the duplicated receiver logic"
```

---

### Task 3: Migrate Knight Recruit (`handleKnightVertexSelect`'s Treason-placement and Recruit branches, `onKnightRecruited`) to `KNIGHT_RECRUITED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'KNIGHT_RECRUITED'; knight: KnightPiece; isFree: boolean }` (field names match `KnightRecruitedPayload`, `catan-3d/src/multiplayer/useRoomChannel.ts:412-425`, exactly). `KnightPiece` (`{ id: string; ownerId: number; strength: KnightStrength; active: boolean; vertexId: string }`) is defined in `catan-3d/src/game/types.ts:114-120` — import it as a type into `players.ts`.

`handleKnightVertexSelect` has 3 independent branches (Treason placement, ordinary Recruit, Move) gated by different pending-state checks — this task covers the first two, which both broadcast via `broadcastKnightRecruited` and share the exact object shape `onKnightRecruited` already applies uniformly (gated only by `isFree`). Task 4 covers the third (Move) branch separately.

Current Treason-placement branch (verified, `App.tsx:5161-5206`, relevant excerpt):
```tsx
if (pendingTreasonPlacement) {
  const { playerId, maxStrength, active } = pendingTreasonPlacement
  const player = playerById.get(playerId)!
  const targets = recruitableVertices(playerId, graph, gameState.board.roads, gameState.board.settlements, knightPiecesByVertex)
  if (!targets.has(vertexId)) { warn('Not a valid placement.'); return }
  const available = treasonPlacementStrengthOptions(maxStrength).find((s) => player.knightSupply[s] > 0)
  if (!available) { setPendingTreasonPlacement(null); return }
  const newKnight: KnightPiece = { id: nextKnightId(playerId), ownerId: playerId, strength: available, active, vertexId }
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id !== playerId
        ? p
        : { ...p, knightSupply: { ...p.knightSupply, [available]: p.knightSupply[available] - 1 }, knightPieces: [...p.knightPieces, newKnight] },
    ) })
  setPendingTreasonPlacement(null)
  if (onlineInfo) broadcastKnightRecruited({ knight: newKnight, isFree: true })
  return
}
```

Current Recruit branch (verified, `App.tsx:5207-5241`):
```tsx
if (pendingKnightRecruit != null) {
  const playerId = pendingKnightRecruit
  const player = playerById.get(playerId)
  if (!player || !canRecruitKnight(player)) { warn('Cannot recruit a knight right now.'); setPendingKnightRecruit(null); return }
  const targets = recruitableVertices(playerId, graph, gameState.board.roads, gameState.board.settlements, knightPiecesByVertex)
  if (!targets.has(vertexId)) { warn('Not a valid knight placement.'); return }
  const newKnight: KnightPiece = { id: nextKnightId(playerId), ownerId: playerId, strength: 'basic', active: false, vertexId }
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id === playerId
        ? { ...p, resources: deductCost(p.resources, KNIGHT_RECRUIT_COST), knightSupply: { ...p.knightSupply, basic: p.knightSupply.basic - 1 }, knightPieces: [...p.knightPieces, newKnight] }
        : p,
    ) })
  setPendingKnightRecruit(null)
  if (onlineInfo) broadcastKnightRecruited({ knight: newKnight, isFree: false })
  return
}
```

Current `onKnightRecruited` (verified, `App.tsx:1967-1982`):
```tsx
onKnightRecruited: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id === payload.knight.ownerId
        ? {
            ...p,
            resources: payload.isFree ? p.resources : deductCost(p.resources, KNIGHT_RECRUIT_COST),
            knightSupply: { ...p.knightSupply, [payload.knight.strength]: p.knightSupply[payload.knight.strength] - 1 },
            knightPieces: [...p.knightPieces, payload.knight],
          }
        : p,
    ) })
},
```
Note: the receiver's shape (`resources` deducted only when `!isFree`, `knightSupply[knight.strength]` decremented always) already correctly unifies BOTH sender branches — the Treason branch never touches `resources` (matches `isFree: true`), the Recruit branch always deducts `KNIGHT_RECRUIT_COST` (matches `isFree: false`).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — KNIGHT_RECRUITED', () => {
  it('adds the knight and decrements its strength tier in supply, deducting resources when not free', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 1, grain: 0, ore: 1 } }))
    const knight = { id: 'k1', ownerId: players[0].id, strength: 'basic' as const, active: false, vertexId: 'V1' }
    const result = reducePlayers(players, { type: 'KNIGHT_RECRUITED', knight, isFree: false }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })
    expect(player.knightSupply.basic).toBe(players[0].knightSupply.basic - 1)
    expect(player.knightPieces).toEqual([knight])
  })

  it('adds the knight and decrements supply without deducting resources when free', () => {
    const players = createInitialPlayers(2)
    const knight = { id: 'k1', ownerId: players[0].id, strength: 'strong' as const, active: true, vertexId: 'V1' }
    const result = reducePlayers(players, { type: 'KNIGHT_RECRUITED', knight, isFree: true }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual(players[0].resources)
    expect(player.knightSupply.strong).toBe(players[0].knightSupply.strong - 1)
    expect(player.knightPieces).toEqual([knight])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const knight = { id: 'k1', ownerId: players[0].id, strength: 'basic' as const, active: false, vertexId: 'V1' }
    const result = reducePlayers(players, { type: 'KNIGHT_RECRUITED', knight, isFree: false }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add `import type { KnightPiece, KnightStrength } from '../types'` (or add to the existing type-only import) to `players.ts`. Add to `PlayersAction`:
```ts
| { type: 'KNIGHT_RECRUITED'; knight: KnightPiece; isFree: boolean }
```
Add `import { KNIGHT_RECRUIT_COST } from '../types'` (value import) if not already present. Add to the `switch`:
```ts
case 'KNIGHT_RECRUITED':
  return players.map((p) =>
    p.id === action.knight.ownerId
      ? {
          ...p,
          resources: action.isFree ? p.resources : deductCost(p.resources, KNIGHT_RECRUIT_COST),
          knightSupply: { ...p.knightSupply, [action.knight.strength]: p.knightSupply[action.knight.strength] - 1 },
          knightPieces: [...p.knightPieces, action.knight],
        }
      : p,
  )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the Treason-placement branch's call site**

Confirm the current line with `grep -n "pendingTreasonPlacement) {" src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'KNIGHT_RECRUITED', knight: newKnight, isFree: true })
```

- [ ] **Step 6: Update the Recruit branch's call site**

Confirm the current line with `grep -n "pendingKnightRecruit != null) {" src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'KNIGHT_RECRUITED', knight: newKnight, isFree: false })
```

- [ ] **Step 7: Update `onKnightRecruited`'s call site**

Confirm the current line with `grep -n "onKnightRecruited:" src/App.tsx`. Replace its body with:
```tsx
onKnightRecruited: (payload) => {
  dispatch({ type: 'KNIGHT_RECRUITED', knight: payload.knight, isFree: payload.isFree })
},
```

- [ ] **Step 8: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate knight recruit (ordinary + Treason placement) to KNIGHT_RECRUITED"
```

---

### Task 4: Migrate Knight Move (`handleKnightVertexSelect`'s Move branch, `onKnightMoved`) to `KNIGHT_MOVED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'KNIGHT_MOVED'; playerId: number; knightId: string; vertexId: string }` (matches `KnightMovedPayload`, `useRoomChannel.ts:448-452`).

Current Move branch (verified, `App.tsx:5249-5277`, relevant excerpt):
```tsx
if (armedKnightAction?.mode === 'move') {
  const { knightId } = armedKnightAction
  const player = players[currentPlayerIndex]
  const knight = player.knightPieces.find((k) => k.id === knightId)
  if (!knight || !knight.active) { setArmedKnightAction(null); return }
  const targets = knightMoveTargets(knight, graph, gameState.board.roads, gameState.board.settlements, knightPiecesByVertex)
  if (!targets.has(vertexId)) { warn('Not a valid move.'); return }
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id !== player.id
        ? p
        : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, vertexId, active: false } : k)) },
    ) })
  setArmedKnightAction(null)
  if (onlineInfo) broadcastKnightMoved({ playerId: player.id, knightId, vertexId })
  return
}
```

Current `onKnightMoved` (verified, `App.tsx:2022-2029`):
```tsx
onKnightMoved: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id !== payload.playerId
        ? p
        : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, vertexId: payload.vertexId, active: false } : k)) },
    ) })
},
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — KNIGHT_MOVED', () => {
  it('moves the named knight and deactivates it', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_MOVED', playerId: players[0].id, knightId: 'k1', vertexId: 'V2' }, initialGameState)
    const knight = result.find((p) => p.id === players[0].id)!.knightPieces[0]
    expect(knight.vertexId).toBe('V2')
    expect(knight.active).toBe(false)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_MOVED', playerId: players[0].id, knightId: 'k1', vertexId: 'V2' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add to `PlayersAction`:
```ts
| { type: 'KNIGHT_MOVED'; playerId: number; knightId: string; vertexId: string }
```
Add to the `switch`:
```ts
case 'KNIGHT_MOVED':
  return players.map((p) =>
    p.id !== action.playerId
      ? p
      : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === action.knightId ? { ...k, vertexId: action.vertexId, active: false } : k)) },
  )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the Move branch's call site**

Confirm the current line with `grep -n "armedKnightAction?.mode === 'move'" src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'KNIGHT_MOVED', playerId: player.id, knightId, vertexId })
```

- [ ] **Step 6: Update `onKnightMoved`'s call site**

Confirm the current line with `grep -n "onKnightMoved:" src/App.tsx`. Replace its body with:
```tsx
onKnightMoved: (payload) => {
  dispatch({ type: 'KNIGHT_MOVED', playerId: payload.playerId, knightId: payload.knightId, vertexId: payload.vertexId })
},
```

- [ ] **Step 7: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate knight move to KNIGHT_MOVED"
```

---

### Task 5: Migrate Knight Displace (`handleKnightSelect`'s ordinary Displace branch, `onKnightDisplaced`) to `KNIGHT_DISPLACED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'KNIGHT_DISPLACED'; moverId: number; knightId: string; displacedOwnerId: number; targetKnightId: string; newMoverVertexId: string; displacedVertexId: string | null }` (matches `KnightDisplacedPayload`, `useRoomChannel.ts:463-470`).

`handleKnightSelect` has 2 branches (Intrigue, ordinary Displace). This task covers ordinary Displace; Task 6 covers Intrigue.

Current Displace branch (verified, `App.tsx:5328-5386`, relevant excerpt):
```tsx
if (armedKnightAction?.mode !== 'displace') return
const { knightId } = armedKnightAction
const player = players[currentPlayerIndex]
const mover = player.knightPieces.find((k) => k.id === knightId)
if (!mover || !mover.active) { setArmedKnightAction(null); return }
const targets = knightDisplaceTargets(mover, graph, gameState.board.roads, gameState.board.settlements, knightPiecesByVertex)
const target = targets.find((k) => k.id === targetKnightId)
if (!target) { warn('Not a valid displace target.'); return }
const targetOwner = playerById.get(target.ownerId)!
const forcedTargets = [...knightMoveTargets(target, graph, gameState.board.roads, gameState.board.settlements, knightPiecesByVertex)].sort()
const displacedVertexId = forcedTargets[0] ?? null

dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
  prev.map((p) => {
    if (p.id === player.id) {
      return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, vertexId: target.vertexId, active: false } : k)) }
    }
    if (p.id === targetOwner.id) {
      if (displacedVertexId) {
        return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === target.id ? { ...k, vertexId: displacedVertexId } : k)) }
      }
      return { ...p, knightPieces: p.knightPieces.filter((k) => k.id !== target.id), knightSupply: { ...p.knightSupply, [target.strength]: p.knightSupply[target.strength] + 1 } }
    }
    return p
  }) })
setArmedKnightAction(null)
if (onlineInfo) {
  broadcastKnightDisplaced({ moverId: player.id, knightId, displacedOwnerId: targetOwner.id, targetKnightId, newMoverVertexId: target.vertexId, displacedVertexId })
}
```

Current `onKnightDisplaced` (verified, `App.tsx:2037-2066`):
```tsx
onKnightDisplaced: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id === payload.moverId) {
        return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, vertexId: payload.newMoverVertexId, active: false } : k)) }
      }
      if (p.id === payload.displacedOwnerId) {
        if (payload.displacedVertexId) {
          return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === payload.targetKnightId ? { ...k, vertexId: payload.displacedVertexId! } : k)) }
        }
        const removed = p.knightPieces.find((k) => k.id === payload.targetKnightId)
        return { ...p, knightPieces: p.knightPieces.filter((k) => k.id !== payload.targetKnightId), knightSupply: removed ? { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 } : p.knightSupply }
      }
      return p
    }) })
},
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — KNIGHT_DISPLACED', () => {
  it('moves the mover to the new vertex (deactivated) and relocates the displaced knight when a vertex is available', () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      knightPieces: [{ id: i === 0 ? 'mover' : 'target', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(
      players,
      { type: 'KNIGHT_DISPLACED', moverId: players[0].id, knightId: 'mover', displacedOwnerId: players[1].id, targetKnightId: 'target', newMoverVertexId: 'V1', displacedVertexId: 'V2' },
      initialGameState,
    )
    const mover = result.find((p) => p.id === players[0].id)!.knightPieces[0]
    const target = result.find((p) => p.id === players[1].id)!.knightPieces[0]
    expect(mover.vertexId).toBe('V1')
    expect(mover.active).toBe(false)
    expect(target.vertexId).toBe('V2')
  })

  it('removes the displaced knight to supply when displacedVertexId is null', () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      knightPieces: [{ id: i === 0 ? 'mover' : 'target', ownerId: p.id, strength: 'strong' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(
      players,
      { type: 'KNIGHT_DISPLACED', moverId: players[0].id, knightId: 'mover', displacedOwnerId: players[1].id, targetKnightId: 'target', newMoverVertexId: 'V1', displacedVertexId: null },
      initialGameState,
    )
    const targetOwner = result.find((p) => p.id === players[1].id)!
    expect(targetOwner.knightPieces).toEqual([])
    expect(targetOwner.knightSupply.strong).toBe(players[1].knightSupply.strong + 1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add to `PlayersAction`:
```ts
| { type: 'KNIGHT_DISPLACED'; moverId: number; knightId: string; displacedOwnerId: number; targetKnightId: string; newMoverVertexId: string; displacedVertexId: string | null }
```
Add to the `switch`:
```ts
case 'KNIGHT_DISPLACED':
  return players.map((p) => {
    if (p.id === action.moverId) {
      return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === action.knightId ? { ...k, vertexId: action.newMoverVertexId, active: false } : k)) }
    }
    if (p.id === action.displacedOwnerId) {
      if (action.displacedVertexId) {
        return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === action.targetKnightId ? { ...k, vertexId: action.displacedVertexId! } : k)) }
      }
      const removed = p.knightPieces.find((k) => k.id === action.targetKnightId)
      return {
        ...p,
        knightPieces: p.knightPieces.filter((k) => k.id !== action.targetKnightId),
        knightSupply: removed ? { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 } : p.knightSupply,
      }
    }
    return p
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the Displace branch's call site**

Confirm the current line with `grep -n "armedKnightAction?.mode !== 'displace'" src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'KNIGHT_DISPLACED', moverId: player.id, knightId, displacedOwnerId: targetOwner.id, targetKnightId, newMoverVertexId: target.vertexId, displacedVertexId })
```

- [ ] **Step 6: Update `onKnightDisplaced`'s call site**

Confirm the current line with `grep -n "onKnightDisplaced:" src/App.tsx`. Replace its body with:
```tsx
onKnightDisplaced: (payload) => {
  dispatch({ type: 'KNIGHT_DISPLACED', moverId: payload.moverId, knightId: payload.knightId, displacedOwnerId: payload.displacedOwnerId, targetKnightId: payload.targetKnightId, newMoverVertexId: payload.newMoverVertexId, displacedVertexId: payload.displacedVertexId })
},
```

- [ ] **Step 7: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate knight displace to KNIGHT_DISPLACED"
```

---

### Task 6: Migrate Intrigue (`handleKnightSelect`'s Intrigue branch, `onIntrigueResolved`) to `INTRIGUE_RESOLVED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'INTRIGUE_RESOLVED'; displacedOwnerId: number; targetKnightId: string; displacedVertexId: string | null }` (matches `IntrigueResolvedPayload`, `useRoomChannel.ts:536-540`). Note this action does NOT remove the `'intrigue'` progress card — that removal happens separately via `onProgressCardPlayed`'s own `'intrigue'` branch, out of scope for this task (not one of this sub-plan's listed functions).

Current Intrigue branch (verified, `App.tsx:5296-5327`, relevant excerpt):
```tsx
if (pendingIntrigueDisplace != null) {
  const playerId = pendingIntrigueDisplace
  const targets = intrigueDisplaceTargets(playerId)
  const target = targets.find((k) => k.id === targetKnightId)
  if (!target) { warn('Not a valid target.'); return }
  const forcedTargets = [...knightMoveTargets(target, graph, gameState.board.roads, gameState.board.settlements, knightPiecesByVertex)].sort()
  const displacedVertexId = forcedTargets[0] ?? null
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id !== target.ownerId) return p
      if (displacedVertexId) {
        return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === target.id ? { ...k, vertexId: displacedVertexId } : k)) }
      }
      return { ...p, knightPieces: p.knightPieces.filter((k) => k.id !== target.id), knightSupply: { ...p.knightSupply, [target.strength]: p.knightSupply[target.strength] + 1 } }
    }) })
  setPendingIntrigueDisplace(null)
  if (onlineInfo) broadcastIntrigueResolved({ displacedOwnerId: target.ownerId, targetKnightId, displacedVertexId })
  return
}
```

Current `onIntrigueResolved` (verified, `App.tsx:2148-2167`):
```tsx
onIntrigueResolved: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id !== payload.displacedOwnerId) return p
      if (payload.displacedVertexId) {
        return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === payload.targetKnightId ? { ...k, vertexId: payload.displacedVertexId! } : k)) }
      }
      const removed = p.knightPieces.find((k) => k.id === payload.targetKnightId)
      return { ...p, knightPieces: p.knightPieces.filter((k) => k.id !== payload.targetKnightId), knightSupply: removed ? { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 } : p.knightSupply }
    }) })
},
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — INTRIGUE_RESOLVED', () => {
  it('relocates the displaced knight when a vertex is available', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'target', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(
      players,
      { type: 'INTRIGUE_RESOLVED', displacedOwnerId: players[0].id, targetKnightId: 'target', displacedVertexId: 'V2' },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.knightPieces[0].vertexId).toBe('V2')
  })

  it('removes the displaced knight to supply when displacedVertexId is null', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'target', ownerId: p.id, strength: 'mighty' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(
      players,
      { type: 'INTRIGUE_RESOLVED', displacedOwnerId: players[0].id, targetKnightId: 'target', displacedVertexId: null },
      initialGameState,
    )
    const owner = result.find((p) => p.id === players[0].id)!
    expect(owner.knightPieces).toEqual([])
    expect(owner.knightSupply.mighty).toBe(players[0].knightSupply.mighty + 1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'target', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(
      players,
      { type: 'INTRIGUE_RESOLVED', displacedOwnerId: players[0].id, targetKnightId: 'target', displacedVertexId: 'V2' },
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

Add to `PlayersAction`:
```ts
| { type: 'INTRIGUE_RESOLVED'; displacedOwnerId: number; targetKnightId: string; displacedVertexId: string | null }
```
Add to the `switch`:
```ts
case 'INTRIGUE_RESOLVED':
  return players.map((p) => {
    if (p.id !== action.displacedOwnerId) return p
    if (action.displacedVertexId) {
      return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === action.targetKnightId ? { ...k, vertexId: action.displacedVertexId! } : k)) }
    }
    const removed = p.knightPieces.find((k) => k.id === action.targetKnightId)
    return {
      ...p,
      knightPieces: p.knightPieces.filter((k) => k.id !== action.targetKnightId),
      knightSupply: removed ? { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 } : p.knightSupply,
    }
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update the Intrigue branch's call site**

Confirm the current line with `grep -n "pendingIntrigueDisplace != null" src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'INTRIGUE_RESOLVED', displacedOwnerId: target.ownerId, targetKnightId, displacedVertexId })
```

- [ ] **Step 6: Update `onIntrigueResolved`'s call site**

Confirm the current line with `grep -n "onIntrigueResolved:" src/App.tsx`. Replace its body with:
```tsx
onIntrigueResolved: (payload) => {
  dispatch({ type: 'INTRIGUE_RESOLVED', displacedOwnerId: payload.displacedOwnerId, targetKnightId: payload.targetKnightId, displacedVertexId: payload.displacedVertexId })
},
```

- [ ] **Step 7: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate Intrigue's knight displacement to INTRIGUE_RESOLVED"
```

---

### Task 7: Migrate `activateKnight`/`onKnightActivated` to `KNIGHT_ACTIVATED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'KNIGHT_ACTIVATED'; playerId: number; knightId: string }` (matches `KnightActivatedPayload`, `useRoomChannel.ts:432-435`).

Current `activateKnight` (verified, `App.tsx:5392-5414`):
```tsx
const activateKnight = (knightId: string) => {
  if (!isMyTurn) { warn("It's not your turn."); return }
  const player = players[currentPlayerIndex]
  const knight = player.knightPieces.find((k) => k.id === knightId)
  if (!knight || !canActivateKnight(player, knight)) { warn('Cannot activate that knight.'); return }
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id !== player.id
        ? p
        : { ...p, resources: deductCost(p.resources, KNIGHT_ACTIVATE_COST), knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, active: true } : k)) },
    ) })
  if (onlineInfo) broadcastKnightActivated({ playerId: player.id, knightId })
}
```

Current `onKnightActivated` (verified, `App.tsx:1987-1998`):
```tsx
onKnightActivated: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id !== payload.playerId
        ? p
        : { ...p, resources: deductCost(p.resources, KNIGHT_ACTIVATE_COST), knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, active: true } : k)) },
    ) })
},
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — KNIGHT_ACTIVATED', () => {
  it('deducts KNIGHT_ACTIVATE_COST and activates the named knight', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      resources: { lumber: 0, brick: 0, wool: 0, grain: 1, ore: 0 },
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: false, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_ACTIVATED', playerId: players[0].id, knightId: 'k1' }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.grain).toBe(0)
    expect(player.knightPieces[0].active).toBe(true)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: false, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_ACTIVATED', playerId: players[0].id, knightId: 'k1' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add `KNIGHT_ACTIVATE_COST` to `players.ts`'s value import from `'../types'` if not already present. Add to `PlayersAction`:
```ts
| { type: 'KNIGHT_ACTIVATED'; playerId: number; knightId: string }
```
Add to the `switch`:
```ts
case 'KNIGHT_ACTIVATED':
  return players.map((p) =>
    p.id !== action.playerId
      ? p
      : { ...p, resources: deductCost(p.resources, KNIGHT_ACTIVATE_COST), knightPieces: p.knightPieces.map((k) => (k.id === action.knightId ? { ...k, active: true } : k)) },
  )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `activateKnight`'s call site**

Confirm the current line with `grep -n "const activateKnight = " src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'KNIGHT_ACTIVATED', playerId: player.id, knightId })
```

- [ ] **Step 6: Update `onKnightActivated`'s call site**

Confirm the current line with `grep -n "onKnightActivated:" src/App.tsx`. Replace its body with:
```tsx
onKnightActivated: (payload) => {
  dispatch({ type: 'KNIGHT_ACTIVATED', playerId: payload.playerId, knightId: payload.knightId })
},
```

- [ ] **Step 7: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate activateKnight to KNIGHT_ACTIVATED"
```

---

### Task 8: Migrate `promoteKnight`/`onKnightPromoted` to `KNIGHT_PROMOTED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'KNIGHT_PROMOTED'; playerId: number; knightId: string; newStrength: KnightStrength }` (matches `KnightPromotedPayload`, `useRoomChannel.ts:437-441`).

Current `promoteKnight` (verified, `App.tsx:5421-5454`):
```tsx
const promoteKnight = (knightId: string) => {
  if (!isMyTurn) { warn("It's not your turn."); return }
  const player = players[currentPlayerIndex]
  const knight = player.knightPieces.find((k) => k.id === knightId)
  if (!knight) { warn('Cannot promote that knight.'); return }
  if (knightsPromotedThisTurn.has(knightId)) { warn('That knight was already promoted this turn.'); return }
  if (!canPromoteKnight(player, knight)) { warn('Cannot promote that knight.'); return }
  const next = nextKnightStrength(knight.strength)!
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id !== player.id
        ? p
        : {
            ...p,
            resources: deductCost(p.resources, KNIGHT_PROMOTE_COST),
            knightSupply: { ...p.knightSupply, [knight.strength]: p.knightSupply[knight.strength] + 1, [next]: p.knightSupply[next] - 1 },
            knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, strength: next } : k)),
          },
    ) })
  setKnightsPromotedThisTurn((prev) => new Set(prev).add(knightId))
  if (onlineInfo) broadcastKnightPromoted({ playerId: player.id, knightId, newStrength: next })
}
```

Current `onKnightPromoted` (verified, `App.tsx:1999-2017`):
```tsx
onKnightPromoted: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id !== payload.playerId) return p
      const knight = p.knightPieces.find((k) => k.id === payload.knightId)
      if (!knight) return p
      return {
        ...p,
        resources: deductCost(p.resources, KNIGHT_PROMOTE_COST),
        knightSupply: { ...p.knightSupply, [knight.strength]: p.knightSupply[knight.strength] + 1, [payload.newStrength]: p.knightSupply[payload.newStrength] - 1 },
        knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, strength: payload.newStrength } : k)),
      }
    }) })
  setKnightsPromotedThisTurn((prev) => new Set(prev).add(payload.knightId))
},
```
Note `onKnightPromoted` re-derives the knight's OLD strength via `p.knightPieces.find(...)` (payload only carries `newStrength`) — carry this lookup into the reducer case exactly as shown (the reducer already has access to `p.knightPieces` directly, no `fullState` needed).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — KNIGHT_PROMOTED', () => {
  it('deducts KNIGHT_PROMOTE_COST, swaps supply buckets, and updates the knight\'s strength', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      resources: { lumber: 0, brick: 0, wool: 1, grain: 0, ore: 1 },
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_PROMOTED', playerId: players[0].id, knightId: 'k1', newStrength: 'strong' }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })
    expect(player.knightSupply.basic).toBe(players[0].knightSupply.basic + 1)
    expect(player.knightSupply.strong).toBe(players[0].knightSupply.strong - 1)
    expect(player.knightPieces[0].strength).toBe('strong')
  })

  it('is a no-op when the knight is not found', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'KNIGHT_PROMOTED', playerId: players[0].id, knightId: 'missing', newStrength: 'strong' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!).toEqual(players[0])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add `KNIGHT_PROMOTE_COST` to `players.ts`'s value import from `'../types'` if not already present. Add to `PlayersAction`:
```ts
| { type: 'KNIGHT_PROMOTED'; playerId: number; knightId: string; newStrength: KnightStrength }
```
Add to the `switch`:
```ts
case 'KNIGHT_PROMOTED':
  return players.map((p) => {
    if (p.id !== action.playerId) return p
    const knight = p.knightPieces.find((k) => k.id === action.knightId)
    if (!knight) return p
    return {
      ...p,
      resources: deductCost(p.resources, KNIGHT_PROMOTE_COST),
      knightSupply: { ...p.knightSupply, [knight.strength]: p.knightSupply[knight.strength] + 1, [action.newStrength]: p.knightSupply[action.newStrength] - 1 },
      knightPieces: p.knightPieces.map((k) => (k.id === action.knightId ? { ...k, strength: action.newStrength } : k)),
    }
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `promoteKnight`'s call site**

Confirm the current line with `grep -n "const promoteKnight = " src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'KNIGHT_PROMOTED', playerId: player.id, knightId, newStrength: next })
```
Leave `setKnightsPromotedThisTurn(...)` and `broadcastKnightPromoted(...)` untouched.

- [ ] **Step 6: Update `onKnightPromoted`'s call site**

Confirm the current line with `grep -n "onKnightPromoted:" src/App.tsx`. Replace its body with:
```tsx
onKnightPromoted: (payload) => {
  dispatch({ type: 'KNIGHT_PROMOTED', playerId: payload.playerId, knightId: payload.knightId, newStrength: payload.newStrength })
  setKnightsPromotedThisTurn((prev) => new Set(prev).add(payload.knightId))
},
```

- [ ] **Step 7: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate promoteKnight to KNIGHT_PROMOTED"
```

---

### Task 9: Migrate `playSmithing`/`onSmithingPlayed` to `SMITHING_PLAYED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `nextKnightStrength(strength: KnightStrength): KnightStrength | null` from `catan-3d/src/game/knights.ts:19` — import it into `players.ts` from `'../knights'`.
- Produces: `PlayersAction` gains `{ type: 'SMITHING_PLAYED'; playerId: number; knightIds: string[] }` (matches `SmithingPlayedPayload`, `useRoomChannel.ts:513-516`).

Current `playSmithing` (verified, `App.tsx:5581-5626`):
```tsx
const playSmithing = () => {
  if (!canPlayProgressCardNow()) return
  if (!isMyTurn) { warn("It's not your turn."); return }
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('smithing')) { warn('No Smithing card to play.'); return }
  const toPromote = selectSmithingPromotions(
    { ...player, resources: { ...player.resources, wool: 999, ore: 999 } },
    knightsPromotedThisTurn,
  )
  if (toPromote.length === 0) { warn('No knights eligible to promote.'); return }
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id !== player.id) return p
      let supply = { ...p.knightSupply }
      const knightPieces = p.knightPieces.map((k) => {
        const promoting = toPromote.find((t) => t.id === k.id)
        if (!promoting) return k
        const next = nextKnightStrength(k.strength)!
        supply = { ...supply, [k.strength]: supply[k.strength] + 1, [next]: supply[next] - 1 }
        return { ...k, strength: next }
      })
      return { ...p, progressCards: removeOne(p.progressCards, 'smithing'), knightSupply: supply, knightPieces }
    }) })
  setKnightsPromotedThisTurn((prev) => {
    const next = new Set(prev)
    for (const k of toPromote) next.add(k.id)
    return next
  })
  inform(`${player.name} played Smithing — promoted ${toPromote.length} knight(s).`)
  if (onlineInfo) broadcastSmithingPlayed({ playerId: player.id, knightIds: toPromote.map((k) => k.id) })
}
```

Current `onSmithingPlayed` (verified, `App.tsx:2111-2130`):
```tsx
onSmithingPlayed: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id !== payload.playerId) return p
      let supply = { ...p.knightSupply }
      const knightPieces = p.knightPieces.map((k) => {
        if (!payload.knightIds.includes(k.id)) return k
        const next = nextKnightStrength(k.strength)
        if (!next) return k
        supply = { ...supply, [k.strength]: supply[k.strength] + 1, [next]: supply[next] - 1 }
        return { ...k, strength: next }
      })
      return { ...p, progressCards: removeOne(p.progressCards, 'smithing'), knightSupply: supply, knightPieces }
    }) })
  setKnightsPromotedThisTurn((prev) => {
    const next = new Set(prev)
    for (const knightId of payload.knightIds) next.add(knightId)
    return next
  })
},
```
Note the two updaters differ slightly (`payload.knightIds.includes(k.id)` membership test vs. `toPromote.find((t) => t.id === k.id)`) but compute the identical result — use the receiver's `.includes(k.id)` shape in the reducer case since the action carries `knightIds: string[]`, matching the payload shape exactly.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — SMITHING_PLAYED', () => {
  it('promotes every listed knight one tier and removes one smithing card', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      progressCards: ['smithing'] as const,
      knightPieces: [
        { id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' },
        { id: 'k2', ownerId: p.id, strength: 'strong' as const, active: true, vertexId: 'V2' },
      ],
    }))
    const result = reducePlayers(players, { type: 'SMITHING_PLAYED', playerId: players[0].id, knightIds: ['k1', 'k2'] }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.progressCards).toEqual([])
    expect(player.knightPieces.find((k) => k.id === 'k1')!.strength).toBe('strong')
    expect(player.knightPieces.find((k) => k.id === 'k2')!.strength).toBe('mighty')
  })

  it('leaves a mighty knight unchanged (no further tier to promote to)', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      progressCards: ['smithing'] as const,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'mighty' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'SMITHING_PLAYED', playerId: players[0].id, knightIds: ['k1'] }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.knightPieces[0].strength).toBe('mighty')
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['smithing'] as const }))
    const result = reducePlayers(players, { type: 'SMITHING_PLAYED', playerId: players[0].id, knightIds: [] }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add `import { nextKnightStrength } from '../knights'` to `players.ts`. Add to `PlayersAction`:
```ts
| { type: 'SMITHING_PLAYED'; playerId: number; knightIds: string[] }
```
Add to the `switch`:
```ts
case 'SMITHING_PLAYED':
  return players.map((p) => {
    if (p.id !== action.playerId) return p
    let supply = { ...p.knightSupply }
    const knightPieces = p.knightPieces.map((k) => {
      if (!action.knightIds.includes(k.id)) return k
      const next = nextKnightStrength(k.strength)
      if (!next) return k
      supply = { ...supply, [k.strength]: supply[k.strength] + 1, [next]: supply[next] - 1 }
      return { ...k, strength: next }
    })
    return { ...p, progressCards: removeOne(p.progressCards, 'smithing'), knightSupply: supply, knightPieces }
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `playSmithing`'s call site**

Confirm the current line with `grep -n "const playSmithing = " src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'SMITHING_PLAYED', playerId: player.id, knightIds: toPromote.map((k) => k.id) })
```
Leave `selectSmithingPromotions(...)`, the `toPromote.length === 0` guard, `setKnightsPromotedThisTurn(...)`, `inform(...)`, and `broadcastSmithingPlayed(...)` untouched.

- [ ] **Step 6: Update `onSmithingPlayed`'s call site**

Confirm the current line with `grep -n "onSmithingPlayed:" src/App.tsx`. Replace its body with:
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

- [ ] **Step 7: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate playSmithing to SMITHING_PLAYED"
```

---

### Task 10: Migrate `playEncouragement`/`onEncouragementPlayed` to `ENCOURAGEMENT_PLAYED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'ENCOURAGEMENT_PLAYED'; playerId: number }` (matches `EncouragementPlayedPayload`, `useRoomChannel.ts:523-525`).

Current `playEncouragement` (verified, `App.tsx:5633-5662`):
```tsx
const playEncouragement = () => {
  if (!canPlayProgressCardNow()) return
  if (!isMyTurn) { warn("It's not your turn."); return }
  if (!gameRules.citiesAndKnightsKnights) { warn('Enable the Knights & City Walls house rule to play this card.'); return }
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('encouragement')) { warn('No Encouragement card to play.'); return }
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id !== player.id
        ? p
        : { ...p, progressCards: removeOne(p.progressCards, 'encouragement'), knightPieces: p.knightPieces.map((k) => ({ ...k, active: true })) },
    ) })
  inform(`${player.name} played Encouragement — all knights activated.`)
  if (onlineInfo) broadcastEncouragementPlayed({ playerId: player.id })
}
```

Current `onEncouragementPlayed` (verified, `App.tsx:2134-2141`):
```tsx
onEncouragementPlayed: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id !== payload.playerId
        ? p
        : { ...p, progressCards: removeOne(p.progressCards, 'encouragement'), knightPieces: p.knightPieces.map((k) => ({ ...k, active: true })) },
    ) })
},
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — ENCOURAGEMENT_PLAYED', () => {
  it('removes one encouragement card and activates every knight for the named player', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      progressCards: ['encouragement'] as const,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: false, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'ENCOURAGEMENT_PLAYED', playerId: players[0].id }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.progressCards).toEqual([])
    expect(player.knightPieces[0].active).toBe(true)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['encouragement'] as const }))
    const result = reducePlayers(players, { type: 'ENCOURAGEMENT_PLAYED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add to `PlayersAction`:
```ts
| { type: 'ENCOURAGEMENT_PLAYED'; playerId: number }
```
Add to the `switch`:
```ts
case 'ENCOURAGEMENT_PLAYED':
  return players.map((p) =>
    p.id !== action.playerId
      ? p
      : { ...p, progressCards: removeOne(p.progressCards, 'encouragement'), knightPieces: p.knightPieces.map((k) => ({ ...k, active: true })) },
  )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `playEncouragement`'s call site**

Confirm the current line with `grep -n "const playEncouragement = " src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'ENCOURAGEMENT_PLAYED', playerId: player.id })
```

- [ ] **Step 6: Update `onEncouragementPlayed`'s call site**

Confirm the current line with `grep -n "onEncouragementPlayed:" src/App.tsx`. Replace its body with:
```tsx
onEncouragementPlayed: (payload) => {
  dispatch({ type: 'ENCOURAGEMENT_PLAYED', playerId: payload.playerId })
},
```

- [ ] **Step 7: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate playEncouragement to ENCOURAGEMENT_PLAYED"
```

---

### Task 11: Migrate `moveRobber`'s chase-robber-knight-deactivation tail and `onKnightDeactivatedAfterChase` to `KNIGHT_DEACTIVATED_AFTER_CHASE`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'KNIGHT_DEACTIVATED_AFTER_CHASE'; playerId: number; knightId: string }` (matches `KnightDeactivatedAfterChasePayload`, `useRoomChannel.ts:481-484`).

This is the last piece of `moveRobber` deliberately left unmigrated by sub-plan 2. Everything else in `moveRobber` (the Taxation leading branch, `applyRobberMove(...)`, `broadcastRobberMoved(...)`) is already real dispatch/broadcast calls — only its final `if (chasingRobberKnightId) { ... }` block still uses `LEGACY_SET_PLAYERS`.

Current block (verified, `App.tsx:3973-3981`, inside `moveRobber`):
```tsx
if (chasingRobberKnightId) {
  const chaserId = chasingRobberKnightId
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id !== thief.id ? p : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === chaserId ? { ...k, active: false } : k)) },
    ) })
  setChasingRobberKnightId(null)
  if (onlineInfo) broadcastKnightDeactivatedAfterChase({ playerId: thief.id, knightId: chaserId })
}
```

Current `onKnightDeactivatedAfterChase` (verified, `App.tsx:2071-2078`):
```tsx
onKnightDeactivatedAfterChase: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id !== payload.playerId
        ? p
        : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, active: false } : k)) },
    ) })
},
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — KNIGHT_DEACTIVATED_AFTER_CHASE', () => {
  it('deactivates the named knight for the named player', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_DEACTIVATED_AFTER_CHASE', playerId: players[0].id, knightId: 'k1' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.knightPieces[0].active).toBe(false)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_DEACTIVATED_AFTER_CHASE', playerId: players[0].id, knightId: 'k1' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the action type and reducer case**

Add to `PlayersAction`:
```ts
| { type: 'KNIGHT_DEACTIVATED_AFTER_CHASE'; playerId: number; knightId: string }
```
Add to the `switch`:
```ts
case 'KNIGHT_DEACTIVATED_AFTER_CHASE':
  return players.map((p) =>
    p.id !== action.playerId
      ? p
      : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === action.knightId ? { ...k, active: false } : k)) },
  )
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `moveRobber`'s call site**

Confirm the current line with `grep -n "if (chasingRobberKnightId)" src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'KNIGHT_DEACTIVATED_AFTER_CHASE', playerId: thief.id, knightId: chaserId })
```

- [ ] **Step 6: Update `onKnightDeactivatedAfterChase`'s call site**

Confirm the current line with `grep -n "onKnightDeactivatedAfterChase:" src/App.tsx`. Replace its body with:
```tsx
onKnightDeactivatedAfterChase: (payload) => {
  dispatch({ type: 'KNIGHT_DEACTIVATED_AFTER_CHASE', playerId: payload.playerId, knightId: payload.knightId })
},
```

- [ ] **Step 7: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate moveRobber's chase-robber-knight-deactivation tail to KNIGHT_DEACTIVATED_AFTER_CHASE"
```

---

### Task 12: Migrate `playTreason`/`onTreasonRemoved` to `TREASON_KNIGHT_REMOVED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'TREASON_KNIGHT_REMOVED'; actingPlayerId: number; targetPlayerId: number; removedKnight: KnightPiece }` (matches `TreasonRemovedPayload`, `useRoomChannel.ts:551-555`).

See this plan's Global Constraints for why `playTreason` is in scope despite not being named in the spec's bucket-3 prose list.

Current `playTreason` (verified in this worktree, `App.tsx:6101-6185`, elided to the relevant parts — the guard chain and knight-selection logic above the dispatch stay completely untouched):
```tsx
const playTreason = (targetPlayerId: number) => {
  // ...guards (canPlayProgressCardNow, isMyTurn, progressCards.includes('treason'),
  // pendingKnightRecruit/armedKnightAction, pendingTreasonPlacement) unchanged...
  const target = playerById.get(targetPlayerId)
  if (!target || target.knightPieces.length === 0) { warn('That player has no knights to remove.'); return }
  const removed = [...target.knightPieces].sort(
    (a, b) => KNIGHT_STRENGTH_VALUE[a.strength] - KNIGHT_STRENGTH_VALUE[b.strength] || a.id.localeCompare(b.id),
  )[0]
  const eligiblePlacementVertices = recruitableVertices(player.id, graph, gameState.board.roads, gameState.board.settlements, knightPiecesByVertex)
  const canPlace = eligiblePlacementVertices.size > 0 && treasonPlacementStrengthOptions(removed.strength).some((s) => player.knightSupply[s] > 0)
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id === player.id) return { ...p, progressCards: removeOne(p.progressCards, 'treason') }
      if (p.id === targetPlayerId) {
        return { ...p, knightPieces: p.knightPieces.filter((k) => k.id !== removed.id), knightSupply: { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 } }
      }
      return p
    }) })
  inform(`${player.name} played Treason on ${target.name} — removed their ${removed.strength} knight.`)
  if (onlineInfo) broadcastTreasonRemoved({ actingPlayerId: player.id, targetPlayerId, removedKnight: removed })
  if (canPlace) {
    setPendingTreasonPlacement({ playerId: player.id, maxStrength: removed.strength, active: removed.active })
  }
}
```

Current `onTreasonRemoved` (verified, `App.tsx:2176-2189`):
```tsx
onTreasonRemoved: (payload) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id === payload.actingPlayerId) return { ...p, progressCards: removeOne(p.progressCards, 'treason') }
      if (p.id === payload.targetPlayerId) {
        return { ...p, knightPieces: p.knightPieces.filter((k) => k.id !== payload.removedKnight.id), knightSupply: { ...p.knightSupply, [payload.removedKnight.strength]: p.knightSupply[payload.removedKnight.strength] + 1 } }
      }
      return p
    }) })
},
```

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — TREASON_KNIGHT_REMOVED', () => {
  it("removes the treason card from the acting player and the named knight from the target, returning it to their supply", () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? ['treason'] as const : [],
      knightPieces: i === 1 ? [{ id: 'k1', ownerId: p.id, strength: 'strong' as const, active: true, vertexId: 'V1' }] : [],
    }))
    const knight = players[1].knightPieces[0]
    const result = reducePlayers(
      players,
      { type: 'TREASON_KNIGHT_REMOVED', actingPlayerId: players[0].id, targetPlayerId: players[1].id, removedKnight: knight },
      initialGameState,
    )
    const actor = result.find((p) => p.id === players[0].id)!
    const target = result.find((p) => p.id === players[1].id)!
    expect(actor.progressCards).toEqual([])
    expect(target.knightPieces).toEqual([])
    expect(target.knightSupply.strong).toBe(players[1].knightSupply.strong + 1)
  })

  it('leaves a third player untouched', () => {
    const players = createInitialPlayers(3).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? ['treason'] as const : [],
      knightPieces: i === 1 ? [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }] : [],
    }))
    const knight = players[1].knightPieces[0]
    const result = reducePlayers(
      players,
      { type: 'TREASON_KNIGHT_REMOVED', actingPlayerId: players[0].id, targetPlayerId: players[1].id, removedKnight: knight },
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
| { type: 'TREASON_KNIGHT_REMOVED'; actingPlayerId: number; targetPlayerId: number; removedKnight: KnightPiece }
```
Add to the `switch`:
```ts
case 'TREASON_KNIGHT_REMOVED':
  return players.map((p) => {
    if (p.id === action.actingPlayerId) return { ...p, progressCards: removeOne(p.progressCards, 'treason') }
    if (p.id === action.targetPlayerId) {
      return {
        ...p,
        knightPieces: p.knightPieces.filter((k) => k.id !== action.removedKnight.id),
        knightSupply: { ...p.knightSupply, [action.removedKnight.strength]: p.knightSupply[action.removedKnight.strength] + 1 },
      }
    }
    return p
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS.

- [ ] **Step 5: Update `playTreason`'s call site**

Confirm the current line with `grep -n "const playTreason = " src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'TREASON_KNIGHT_REMOVED', actingPlayerId: player.id, targetPlayerId, removedKnight: removed })
```
Leave everything else (the guard chain, `removed`/`canPlace` computation, `inform`, `broadcastTreasonRemoved`, `setPendingTreasonPlacement`) untouched.

- [ ] **Step 6: Update `onTreasonRemoved`'s call site**

Confirm the current line with `grep -n "onTreasonRemoved:" src/App.tsx`. Replace its body with:
```tsx
onTreasonRemoved: (payload) => {
  dispatch({ type: 'TREASON_KNIGHT_REMOVED', actingPlayerId: payload.actingPlayerId, targetPlayerId: payload.targetPlayerId, removedKnight: payload.removedKnight })
},
```

- [ ] **Step 7: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate playTreason to TREASON_KNIGHT_REMOVED"
```

---

### Task 13: Final verification for this sub-plan

**Files:** none (verification only)

- [ ] **Step 1: Full automated suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: all clean.

- [ ] **Step 2: Confirm the bridge's scope**

Run: `grep -c "LEGACY_SET_PLAYERS" catan-3d/src/App.tsx`
Expected: fewer than sub-plan 2's final count by the number of distinct `LEGACY_SET_PLAYERS` call sites this sub-plan actually removed — 14 sender-side sites (Task 1: 2, Task 2: 3 across `armTaxation`/`resolveTaxation`/`onProgressCardPlayed`'s taxation branch, Task 3: 2, Task 4: 1, Task 5: 1, Task 6: 1, Task 7: 1, Task 8: 1, Task 9: 1, Task 10: 1, Task 11: 1, Task 12: 1 — recount from each task's own diff) plus 10 receiver-side sites (`onKnightRecruited`, `onKnightActivated`, `onKnightPromoted`, `onKnightMoved`, `onKnightDisplaced`, `onKnightDeactivatedAfterChase`, `onSmithingPlayed`, `onEncouragementPlayed`, `onIntrigueResolved`, `onTreasonRemoved`) plus 1 more (`onTaxationResolved`). Do not trust this arithmetic — per sub-plan 2's own Task 8 experience, the plan's own count can be wrong; the grep is ground truth. If the number doesn't match your own recount of the 12 tasks' commits, reconcile and ledger the discrepancy before proceeding, same as sub-plan 2 Task 8 did.

- [ ] **Step 3: Manual end-to-end play session**

Dev server, Cities & Knights house rules on: play through a barbarian attack (both a sole-defender-wins and a barbarians-win outcome if feasible), Taxation, recruiting a knight, moving a knight, activating a knight, promoting a knight (including via Smithing), displacing an opponent's knight, playing Encouragement, playing Intrigue, playing Treason (including the follow-up free placement), and triggering a robber move that chases away an active knight. Confirm every one behaves identically to before this sub-plan.
