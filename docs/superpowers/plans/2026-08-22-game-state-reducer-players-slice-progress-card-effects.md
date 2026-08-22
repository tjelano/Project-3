# Game State Reducer — Players Slice, Sub-plan 4b: Progress Card Effect Resolution — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the 16 remaining progress/dev-card **effect** functions off `LEGACY_SET_PLAYERS` onto real, typed `PlayersAction` variants. This is the second and final half of the parent spec's bucket 4 ("Progress cards") — sub-plan 4a (merged, commit `a0cf195`) covered the "spend the card" half; this plan covers the actual game effects (resource grants, seizures, discards, draws, takes).

**Architecture:** Unlike 4a, these 16 functions are NOT structurally identical to each other — each has its own distinct effect (a resource grant, a seizure formula, a discard, a draw, a take). Each gets its own `PlayersAction` variant and reducer case, following the exact same one-task-per-function pattern sub-plans 2 and 3 used. Two pairs are close enough in shape (differing only in which resource/field they touch) to batch into one dispatch each, per the SDD skill's "batch small same-shape work" guidance: **Irrigation+Mining** (both: add `hexCount*2` of one resource, remove one card) and **Crane+Medicine** (both: remove one card, set one local-only "pending X" flag, no resource change). Every other function gets its own task.

Several of these functions' receivers currently call the spend step (`spendDevCard`/`dispatch({ type: 'PROGRESS_CARD_SPENT', ... })`, both already real actions after sub-plan 4a) immediately before calling the effect function — this plan's tasks touch **only** the effect call, never the now-already-migrated spend call beside it.

**Tech Stack:** TypeScript, React (`useReducer`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-game-state-reducer-players-slice-design.md` (bucket 4) and its parent `docs/superpowers/specs/2026-08-19-game-state-reducer-design.md`. This plan's own scoping was verified against the live worktree via direct reads of all 16 functions and their receivers (continuing the same research already done for sub-plan 4a — the bodies of these 16 functions are byte-identical to what that research found, since 4a's diff never touched any of them, confirmed by `git log -p` review before writing this plan).

## Global Constraints

- **Reducers are pure appliers, always.** No `Math.random()`, no `inform()`/`warn()`/`playSfx()`, no `Date.now()`. `reducePlayers` cases only compute the next `Player[]`.
- **This sub-plan touches ONLY the players-side write in each function.** Every other side effect (guards, `setState` calls, `broadcastX()` calls, `inform()`, the already-migrated `spendDevCard`/`PROGRESS_CARD_SPENT` call beside some of these) stays exactly as-is, at its existing call site.
- **`applyDiplomacyRemoval` also dispatches a board action** (`dispatchGameAction({ type: 'REMOVE_ROAD', edgeId }, false)`, already migrated by the board slice) immediately before its own players-side write. Leave that dispatch untouched — only the trailing `LEGACY_SET_PLAYERS` block in this function changes.
- **`playersMeetingVpThreshold` can never run inside the reducer.** Verified directly (`App.tsx:5400-5414`): it calls `getPlayerScore` with `longestRoadHolderId`, `largestArmyHolderId`, `metropolisHolders`, `merchantHolderId` — none of which are part of `GameState` (`GameState` is exactly `{ board: BoardState; players: Player[] }` per the parent spec's Data Model section; these four stay on their own `useState`, explicitly out of scope for this whole migration project). `applySabotageEffect`/`applyWeddingEffect` currently call `playersMeetingVpThreshold(announcerId, comparison)` themselves, in `App.tsx`, before their `LEGACY_SET_PLAYERS` dispatch — **this call stays exactly where it is, in `App.tsx`, unmoved.** What changes: the resulting affected-player-ID list must be threaded onto the new action's payload (`affected: number[]`, the mapped `.id`s of `playersMeetingVpThreshold`'s return value) so the reducer case can test `action.affected.includes(p.id)` instead of needing to recompute eligibility itself. This is the same "pre-dispatch eligibility check, value rides on the payload" pattern the parent spec's own design already establishes (e.g. `COMMERCIAL_HARBOR_PLAYED`'s `otherIdsInOrder`) — not a new pattern, just this plan's first use of it.
- **`applyGuildDuesTake`/`applyEspionageTake` have TWO call sites each** — the local actor's confirm step (`confirmGuildDues`/`confirmEspionage`) and the dedicated receiver (`onGuildDuesTaken`/`onEspionageTaken`, which validates the payload then calls the same function directly, not a duplicate). Migrating the shared function closes both transitively — do not touch `confirmGuildDues`/`confirmEspionage`/`onGuildDuesTaken`/`onEspionageTaken` themselves.
- **Re-confirm every line number below with `grep -n` before editing** — this file has been touched by four prior sub-plans already, and line numbers shift with every commit.
- **No existing `PlayersAction` variant covers any of the actions this sub-plan introduces** — all are created from scratch.

---

### Task 1: Migrate `applyIrrigationEffect` and `applyMiningEffect` (batched)

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'IRRIGATION_PLAYED'; playerId: number; hexCount: number }` and `{ type: 'MINING_PLAYED'; playerId: number; hexCount: number }`.

Current `applyIrrigationEffect` (verified, `App.tsx:4540-4552`):
```tsx
const applyIrrigationEffect = (playerId: number) => {
  const hexCount = irrigationHexCount(playerId)
  const amount = hexCount * 2
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id === playerId
        ? { ...p, resources: { ...p.resources, grain: p.resources.grain + amount }, progressCards: removeOne(p.progressCards, 'irrigation') }
        : p,
    ) })
  const player = playerById.get(playerId)
  if (player) inform(`${player.name} played Irrigation — +${amount} grain.`)
}
```
Current `applyMiningEffect` (verified, `App.tsx:4581-4593`) is the identical shape with `mountains`/`ore`/`'mining'` in place of `wheat-hexes`/`grain`/`'irrigation'`. Both receive `hexCount` already computed by an existing helper (`irrigationHexCount(playerId)`/`miningHexCount(playerId)`) — that computation stays in `App.tsx`, outside the reducer; only the resulting `hexCount` rides on the action.

Both receivers: `onProgressCardPlayed`'s `'irrigation'`/`'mining'` branches call `applyIrrigationEffect(payload.playerId)`/`applyMiningEffect(payload.playerId)` directly (no separate bridge — the shared function IS the receiver's own call, since both effects are deterministic from public board state).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — IRRIGATION_PLAYED', () => {
  it('adds hexCount*2 grain and removes one irrigation card', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }, progressCards: ['irrigation' as const] }))
    const result = reducePlayers(players, { type: 'IRRIGATION_PLAYED', playerId: players[0].id, hexCount: 3 }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.grain).toBe(6)
    expect(player.progressCards).toEqual([])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['irrigation' as const] }))
    const result = reducePlayers(players, { type: 'IRRIGATION_PLAYED', playerId: players[0].id, hexCount: 1 }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — MINING_PLAYED', () => {
  it('adds hexCount*2 ore and removes one mining card', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }, progressCards: ['mining' as const] }))
    const result = reducePlayers(players, { type: 'MINING_PLAYED', playerId: players[0].id, hexCount: 2 }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.ore).toBe(4)
    expect(player.progressCards).toEqual([])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['mining' as const] }))
    const result = reducePlayers(players, { type: 'MINING_PLAYED', playerId: players[0].id, hexCount: 1 }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`

- [ ] **Step 3: Add both action types and reducer cases**

Add to `PlayersAction`:
```ts
| { type: 'IRRIGATION_PLAYED'; playerId: number; hexCount: number }
| { type: 'MINING_PLAYED'; playerId: number; hexCount: number }
```
Add to the `switch`:
```ts
case 'IRRIGATION_PLAYED':
  return players.map((p) =>
    p.id === action.playerId
      ? { ...p, resources: { ...p.resources, grain: p.resources.grain + action.hexCount * 2 }, progressCards: removeOne(p.progressCards, 'irrigation') }
      : p,
  )
case 'MINING_PLAYED':
  return players.map((p) =>
    p.id === action.playerId
      ? { ...p, resources: { ...p.resources, ore: p.resources.ore + action.hexCount * 2 }, progressCards: removeOne(p.progressCards, 'mining') }
      : p,
  )
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update both call sites**

Confirm current lines with `grep -n "const applyIrrigationEffect\|const applyMiningEffect"`. Replace `applyIrrigationEffect`'s `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'IRRIGATION_PLAYED', playerId, hexCount })
```
Replace `applyMiningEffect`'s equivalent block with:
```tsx
dispatch({ type: 'MINING_PLAYED', playerId, hexCount })
```
Leave the `hexCount`/`amount` computation, `playerById.get`/`inform` calls, and everything else in both functions untouched. Do not touch either receiver branch (they already call these functions directly).

- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyIrrigationEffect and applyMiningEffect to IRRIGATION_PLAYED/MINING_PLAYED"
```

---

### Task 2: Migrate `applyCraneEffect` and `applyMedicineEffect` (batched)

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'CRANE_PLAYED'; playerId: number }` and `{ type: 'MEDICINE_PLAYED'; playerId: number }`.

Current `applyCraneEffect` (verified, `App.tsx:4622-4629`):
```tsx
const applyCraneEffect = (playerId: number) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => (p.id === playerId ? { ...p, progressCards: removeOne(p.progressCards, 'crane') } : p)) })
  setCraneDiscountPlayerId(playerId)
}
```
Current `applyMedicineEffect` (verified, `App.tsx:4657-4664`) is the identical shape, `removeOne(p.progressCards, 'medicine')` and `setPendingMedicineUse(playerId)` in place of Crane's card/setter. Both receivers (`onProgressCardPlayed`'s `'crane'`/`'medicine'` branches) call these functions directly, same as Irrigation/Mining.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — CRANE_PLAYED', () => {
  it('removes one crane card', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['crane' as const] }))
    const result = reducePlayers(players, { type: 'CRANE_PLAYED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual([])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['crane' as const] }))
    const result = reducePlayers(players, { type: 'CRANE_PLAYED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — MEDICINE_PLAYED', () => {
  it('removes one medicine card', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['medicine' as const] }))
    const result = reducePlayers(players, { type: 'MEDICINE_PLAYED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual([])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['medicine' as const] }))
    const result = reducePlayers(players, { type: 'MEDICINE_PLAYED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add both action types and reducer cases**

```ts
| { type: 'CRANE_PLAYED'; playerId: number }
| { type: 'MEDICINE_PLAYED'; playerId: number }
```
```ts
case 'CRANE_PLAYED':
  return players.map((p) => (p.id === action.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'crane') } : p))
case 'MEDICINE_PLAYED':
  return players.map((p) => (p.id === action.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'medicine') } : p))
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update both call sites**

Confirm current lines with `grep -n "const applyCraneEffect\|const applyMedicineEffect"`. Replace each function's `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block:
```tsx
dispatch({ type: 'CRANE_PLAYED', playerId })
```
```tsx
dispatch({ type: 'MEDICINE_PLAYED', playerId })
```
Leave `setCraneDiscountPlayerId(playerId)`/`setPendingMedicineUse(playerId)` untouched. Do not touch either receiver branch.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyCraneEffect and applyMedicineEffect to CRANE_PLAYED/MEDICINE_PLAYED"
```

---

### Task 3: Migrate `applyYearOfPlentyEffect` to `YEAR_OF_PLENTY_PLAYED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'YEAR_OF_PLENTY_PLAYED'; playerId: number; picks: ResourceType[] }`.

Current `applyYearOfPlentyEffect` (verified, `App.tsx:1044-1055`):
```tsx
const applyYearOfPlentyEffect = (playerId: number, picks: ResourceType[]) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id !== playerId) return p
      const resources = { ...p.resources }
      for (const resource of picks) resources[resource] += 1
      return { ...p, resources }
    }) })
  const player = playerById.get(playerId)
  if (player) inform(`${player.name} played Year of Plenty.`)
}
```
Two call sites: `resolveDevCardPicker` (local actor, after the picker resolves) and `onPlentyPlayed` (receiver — already calls `spendDevCard(payload.playerId, 'yearOfPlenty')` first, migrated in sub-plan 4a; do not touch that line). Both call `applyYearOfPlentyEffect(payload.playerId, payload.picks)`/`applyYearOfPlentyEffect(player.id, picks)` directly — neither has its own separate bridge for the effect itself.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — YEAR_OF_PLENTY_PLAYED', () => {
  it('adds 1 of each picked resource, allowing duplicates', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(players, { type: 'YEAR_OF_PLENTY_PLAYED', playerId: players[0].id, picks: ['lumber', 'lumber'] }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(2)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'YEAR_OF_PLENTY_PLAYED', playerId: players[0].id, picks: ['ore'] }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
| { type: 'YEAR_OF_PLENTY_PLAYED'; playerId: number; picks: ResourceType[] }
```
```ts
case 'YEAR_OF_PLENTY_PLAYED':
  return players.map((p) => {
    if (p.id !== action.playerId) return p
    const resources = { ...p.resources }
    for (const resource of action.picks) resources[resource] += 1
    return { ...p, resources }
  })
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyYearOfPlentyEffect"`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'YEAR_OF_PLENTY_PLAYED', playerId, picks })
```
Leave `playerById.get`/`inform` untouched. Do not touch `resolveDevCardPicker` or `onPlentyPlayed` themselves — both already just call this function.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyYearOfPlentyEffect to YEAR_OF_PLENTY_PLAYED"
```

---

### Task 4: Migrate `applyMonopolyEffect` to `MONOPOLY_PLAYED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'MONOPOLY_PLAYED'; playerId: number; resource: ResourceType }`.

Current `applyMonopolyEffect` (verified, `App.tsx:1057-1084`):
```tsx
const applyMonopolyEffect = (playerId: number, resource: ResourceType) => {
  let seized = 0
  const victimNotes: string[] = []
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => {
    const next = prev.map((p) => ({ ...p, resources: { ...p.resources } }))
    const byId = new Map(next.map((p) => [p.id, p]))
    const currentEntry = byId.get(playerId)
    if (!currentEntry) return prev
    for (const p of next) {
      if (p.id === playerId) continue
      const amount = p.resources[resource]
      if (amount <= 0) continue
      victimNotes.push(`${amount} from ${p.name}`)
      seized += amount
      p.resources[resource] = 0
      currentEntry.resources[resource] += amount
    }
    return next
  } })
  const player = playerById.get(playerId)
  if (player) inform(`${player.name} played Monopoly — took all ${RESOURCE_LABELS[resource]}: ${victimNotes.join(', ') || 'nobody had any'} (${seized} total).`)
}
```
Note: `seized`/`victimNotes` are mutated INSIDE the updater closure in the current code — this is a pre-existing pattern deviation from the "compute outside the updater" convention CONVENTIONS.md §3 documents (flagged during sub-plan 4b's own research, not something to silently "fix" here — see Global Constraints; this task's job is a faithful behavior-preserving migration, not a correctness fix). Once migrated into the reducer, `seized`/`victimNotes` can no longer be computed the same way (the reducer has no closure to mutate for the `inform()` message) — compute them in `App.tsx` BEFORE dispatch instead, from the current (pre-mutation) `players` array, and pass nothing extra to the action (the reducer recomputes the same seizure independently — it's a pure function of `players`/`resource`, so there's no duplication-of-truth risk, just duplicated arithmetic, which is fine and matches how other seizure effects in this codebase already work).

Two call sites: `resolveDevCardPicker` (local actor) and `onMonopolyPlayed` (receiver — already calls `spendDevCard(payload.playerId, 'monopoly')` first, migrated in 4a; do not touch that line).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — MONOPOLY_PLAYED', () => {
  it('takes all of a resource from every other player', () => {
    const players = createInitialPlayers(3).map((p, i) => ({ ...p, resources: { lumber: i === 0 ? 0 : 3, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(players, { type: 'MONOPOLY_PLAYED', playerId: players[0].id, resource: 'lumber' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(6)
    expect(result.find((p) => p.id === players[1].id)!.resources.lumber).toBe(0)
    expect(result.find((p) => p.id === players[2].id)!.resources.lumber).toBe(0)
  })

  it('is a no-op when no other player holds the resource', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(players, { type: 'MONOPOLY_PLAYED', playerId: players[0].id, resource: 'lumber' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
| { type: 'MONOPOLY_PLAYED'; playerId: number; resource: ResourceType }
```
```ts
case 'MONOPOLY_PLAYED': {
  const next = players.map((p) => ({ ...p, resources: { ...p.resources } }))
  const byId = new Map(next.map((p) => [p.id, p]))
  const currentEntry = byId.get(action.playerId)
  if (!currentEntry) return players
  for (const p of next) {
    if (p.id === action.playerId) continue
    const amount = p.resources[action.resource]
    if (amount <= 0) continue
    p.resources[action.resource] = 0
    currentEntry.resources[action.resource] += amount
  }
  return next
}
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyMonopolyEffect"`. Replace the entire function body's `dispatch(...)` call with:
```tsx
dispatch({ type: 'MONOPOLY_PLAYED', playerId, resource })
```
The `seized`/`victimNotes` computation for the `inform()` message now needs to happen BEFORE this dispatch, reading the CURRENT (pre-dispatch) `players` array — replicate the same loop shown above (reading `players.find`/plain iteration instead of the updater's `prev`/`next`) to compute `seized`/`victimNotes`, then dispatch, then `inform(...)` using those values. This is a genuine restructure of this one function's body (not just a 1-line swap) since the message text depends on values the reducer no longer exposes back to the caller — keep it to exactly this, do not change the message text or any other behavior.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyMonopolyEffect to MONOPOLY_PLAYED"
```

---

### Task 5: Migrate `applyResourceMonopolyProgressEffect` to `RESOURCE_MONOPOLY_PLAYED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'RESOURCE_MONOPOLY_PLAYED'; playerId: number; resource: ResourceType }`.

Current `applyResourceMonopolyProgressEffect` (verified, `App.tsx:1095-1118`):
```tsx
const applyResourceMonopolyProgressEffect = (playerId: number, resource: ResourceType) => {
  let collected = 0
  const victimNotes: string[] = []
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => {
    const next = prev.map((p) => {
      if (p.id === playerId || p.resources[resource] <= 0) return p
      const take = Math.min(2, p.resources[resource])
      victimNotes.push(`${take} from ${p.name}`)
      collected += take
      return { ...p, resources: { ...p.resources, [resource]: p.resources[resource] - take } }
    })
    return next.map((p) =>
      p.id === playerId ? { ...p, resources: { ...p.resources, [resource]: p.resources[resource] + collected } } : p,
    )
  } })
  const player = playerById.get(playerId)
  if (player) inform(`${player.name} played Resource Monopoly — took ${RESOURCE_LABELS[resource]}: ${victimNotes.join(', ') || 'nobody had any'} (${collected} total).`)
}
```
Same `victimNotes`/`collected`-computed-inside-updater pattern as Task 4's Monopoly — same resolution: compute a local copy before dispatch for the `inform()` message, dispatch the action, the reducer independently recomputes the same seizure.

Two call sites: `resolveDevCardPicker` and `onResourceMonopolyPlayed` (receiver — already dispatches `PROGRESS_CARD_SPENT` for the spend, migrated in 4a; do not touch that line, only the trailing `applyResourceMonopolyProgressEffect(...)` call stays as a direct call, unchanged at the call site).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — RESOURCE_MONOPOLY_PLAYED', () => {
  it('takes up to 2 of a resource from each other player, capped at their holdings', () => {
    const players = createInitialPlayers(3).map((p, i) => ({ ...p, resources: { lumber: i === 1 ? 5 : i === 2 ? 1 : 0, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(players, { type: 'RESOURCE_MONOPOLY_PLAYED', playerId: players[0].id, resource: 'lumber' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(3)
    expect(result.find((p) => p.id === players[1].id)!.resources.lumber).toBe(3)
    expect(result.find((p) => p.id === players[2].id)!.resources.lumber).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
| { type: 'RESOURCE_MONOPOLY_PLAYED'; playerId: number; resource: ResourceType }
```
```ts
case 'RESOURCE_MONOPOLY_PLAYED': {
  let collected = 0
  const next = players.map((p) => {
    if (p.id === action.playerId || p.resources[action.resource] <= 0) return p
    const take = Math.min(2, p.resources[action.resource])
    collected += take
    return { ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] - take } }
  })
  return next.map((p) =>
    p.id === action.playerId ? { ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] + collected } } : p,
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyResourceMonopolyProgressEffect"`. Same restructure as Task 4: compute `collected`/`victimNotes` before dispatch (from the current `players`), dispatch `{ type: 'RESOURCE_MONOPOLY_PLAYED', playerId, resource }`, then `inform(...)` with the pre-computed values.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyResourceMonopolyProgressEffect to RESOURCE_MONOPOLY_PLAYED"
```

---

### Task 6: Migrate `applyTradeMonopolyEffect` to `TRADE_MONOPOLY_PLAYED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'TRADE_MONOPOLY_PLAYED'; playerId: number; commodity: CommodityType }`.

Current `applyTradeMonopolyEffect` (verified, `App.tsx:1128-1150`) is the commodity-flavored twin of Task 5's Resource Monopoly: takes exactly 1 (not up to 2) of `commodity` from each other player who holds any, credits the total to the actor. Same `collected`/`victimNotes`-inside-updater pattern; same resolution.
```tsx
const applyTradeMonopolyEffect = (playerId: number, commodity: CommodityType) => {
  let collected = 0
  const victimNotes: string[] = []
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => {
    const next = prev.map((p) => {
      if (p.id === playerId || p.commodities[commodity] <= 0) return p
      victimNotes.push(`1 from ${p.name}`)
      collected += 1
      return { ...p, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] - 1 } }
    })
    return next.map((p) =>
      p.id === playerId ? { ...p, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] + collected } } : p,
    )
  } })
  const player = playerById.get(playerId)
  if (player) inform(`${player.name} played Trade Monopoly — took ${COMMODITY_LABELS[commodity]}: ${victimNotes.join(', ') || 'nobody had any'} (${collected} total).`)
}
```
Two call sites: `resolveDevCardCommodityPicker` and `onTradeMonopolyPlayed` (receiver — spend already migrated in 4a).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — TRADE_MONOPOLY_PLAYED', () => {
  it('takes 1 of a commodity from each other player who holds any', () => {
    const players = createInitialPlayers(3).map((p, i) => ({ ...p, commodities: { paper: i === 1 ? 2 : i === 2 ? 0 : 0, cloth: 0, coin: 0 } }))
    const result = reducePlayers(players, { type: 'TRADE_MONOPOLY_PLAYED', playerId: players[0].id, commodity: 'paper' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.commodities.paper).toBe(1)
    expect(result.find((p) => p.id === players[1].id)!.commodities.paper).toBe(1)
    expect(result.find((p) => p.id === players[2].id)!.commodities.paper).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
| { type: 'TRADE_MONOPOLY_PLAYED'; playerId: number; commodity: CommodityType }
```
```ts
case 'TRADE_MONOPOLY_PLAYED': {
  let collected = 0
  const next = players.map((p) => {
    if (p.id === action.playerId || p.commodities[action.commodity] <= 0) return p
    collected += 1
    return { ...p, commodities: { ...p.commodities, [action.commodity]: p.commodities[action.commodity] - 1 } }
  })
  return next.map((p) =>
    p.id === action.playerId ? { ...p, commodities: { ...p.commodities, [action.commodity]: p.commodities[action.commodity] + collected } } : p,
  )
}
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyTradeMonopolyEffect"`. Same restructure as Tasks 4/5: compute `collected`/`victimNotes` before dispatch, dispatch `{ type: 'TRADE_MONOPOLY_PLAYED', playerId, commodity }`, then `inform(...)`.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyTradeMonopolyEffect to TRADE_MONOPOLY_PLAYED"
```

---

### Task 7: Migrate `applyProgressDiscard` to `PROGRESS_DISCARD_CONFIRMED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'PROGRESS_DISCARD_CONFIRMED'; playerId: number; indices: number[] }`.

Current `applyProgressDiscard` (verified, `App.tsx:1203-1212`):
```tsx
const applyProgressDiscard = (playerId: number, indices: number[]) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id !== playerId) return p
      const next = [...p.progressCards]
      for (const index of [...indices].sort((a, b) => b - a)) next.splice(index, 1)
      return { ...p, progressCards: next }
    }) })
  setProgressCardOverLimitPlayerIds((prev) => prev.filter((id) => id !== playerId))
}
```
Single receiver, `onProgressDiscardConfirmed`, already a genuine one-line forward (validates `indices` shape/bounds against the LOCAL client's own already-synced hand, then calls `applyProgressDiscard(payload.playerId, indices)` directly) — do not touch it.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — PROGRESS_DISCARD_CONFIRMED', () => {
  it('removes the cards at the given indices, high-to-low so indices stay valid mid-splice', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['alchemy' as const, 'wedding' as const, 'sabotage' as const] }))
    const result = reducePlayers(players, { type: 'PROGRESS_DISCARD_CONFIRMED', playerId: players[0].id, indices: [0, 2] }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual(['wedding'])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['alchemy' as const] }))
    const result = reducePlayers(players, { type: 'PROGRESS_DISCARD_CONFIRMED', playerId: players[0].id, indices: [] }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
| { type: 'PROGRESS_DISCARD_CONFIRMED'; playerId: number; indices: number[] }
```
```ts
case 'PROGRESS_DISCARD_CONFIRMED':
  return players.map((p) => {
    if (p.id !== action.playerId) return p
    const next = [...p.progressCards]
    for (const index of [...action.indices].sort((a, b) => b - a)) next.splice(index, 1)
    return { ...p, progressCards: next }
  })
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyProgressDiscard"`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'PROGRESS_DISCARD_CONFIRMED', playerId, indices })
```
Leave `setProgressCardOverLimitPlayerIds(...)` untouched.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyProgressDiscard to PROGRESS_DISCARD_CONFIRMED"
```

---

### Task 8: Migrate `applyScienceFreeResourcePick` to `SCIENCE_FREE_RESOURCE_PICKED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'SCIENCE_FREE_RESOURCE_PICKED'; playerId: number; resource: ResourceType }`.

Current `applyScienceFreeResourcePick` (verified, `App.tsx:1218-1222`):
```tsx
const applyScienceFreeResourcePick = (playerId: number, resource: ResourceType) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => (p.id === playerId ? { ...p, resources: { ...p.resources, [resource]: p.resources[resource] + 1 } } : p)) })
  setScienceFreeResourcePlayerIds((prev) => prev.filter((id) => id !== playerId))
}
```
Two call sites: `resolveScienceFreeResource` (local actor) and `onScienceFreeResourcePicked` (receiver, already a genuine one-line forward after its own validation) — do not touch either caller.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — SCIENCE_FREE_RESOURCE_PICKED', () => {
  it('adds 1 of the picked resource', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(players, { type: 'SCIENCE_FREE_RESOURCE_PICKED', playerId: players[0].id, resource: 'ore' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.resources.ore).toBe(1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'SCIENCE_FREE_RESOURCE_PICKED', playerId: players[0].id, resource: 'ore' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
| { type: 'SCIENCE_FREE_RESOURCE_PICKED'; playerId: number; resource: ResourceType }
```
```ts
case 'SCIENCE_FREE_RESOURCE_PICKED':
  return players.map((p) => (p.id === action.playerId ? { ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] + 1 } } : p))
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyScienceFreeResourcePick"`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'SCIENCE_FREE_RESOURCE_PICKED', playerId, resource })
```
Leave `setScienceFreeResourcePlayerIds(...)` untouched.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyScienceFreeResourcePick to SCIENCE_FREE_RESOURCE_PICKED"
```

---

### Task 9: Migrate `applyProgressCardDraws` to `PROGRESS_CARDS_DRAWN`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'PROGRESS_CARDS_DRAWN'; draws: { playerId: number; card: ProgressCardType }[] }`.

Current `applyProgressCardDraws` (verified, `App.tsx:1310-1356`, relevant excerpt):
```tsx
const applyProgressCardDraws = (draws: { playerId: number; card: ProgressCardType }[]) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      const drawn = draws.filter((d) => d.playerId === p.id).map((d) => d.card)
      return drawn.length === 0 ? p : { ...p, progressCards: [...p.progressCards, ...drawn] }
    }) })
  // ... hand-limit bookkeeping (overLimitIds computed outside the updater,
  // setProgressCardOverLimitPlayerIds merge) and debugLog — UNCHANGED, stays in App.tsx
}
```
Two call sites: the event-die roll resolution (local actor) and `onProgressCardsDrawn` (receiver, validates track/draws shape then calls `applyProgressCardDraws(payload.draws)` directly, followed by its own `setProgressCardDecks` slice — untouched, that's deck bookkeeping unrelated to players state).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — PROGRESS_CARDS_DRAWN', () => {
  it('appends each drawn card to the matching player', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: [] }))
    const result = reducePlayers(
      players,
      { type: 'PROGRESS_CARDS_DRAWN', draws: [{ playerId: players[0].id, card: 'alchemy' }, { playerId: players[1].id, card: 'crane' }] },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual(['alchemy'])
    expect(result.find((p) => p.id === players[1].id)!.progressCards).toEqual(['crane'])
  })

  it('leaves a player with no matching draw untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'PROGRESS_CARDS_DRAWN', draws: [{ playerId: players[0].id, card: 'alchemy' }] }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
| { type: 'PROGRESS_CARDS_DRAWN'; draws: { playerId: number; card: ProgressCardType }[] }
```
```ts
case 'PROGRESS_CARDS_DRAWN':
  return players.map((p) => {
    const drawn = action.draws.filter((d) => d.playerId === p.id).map((d) => d.card)
    return drawn.length === 0 ? p : { ...p, progressCards: [...p.progressCards, ...drawn] }
  })
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyProgressCardDraws"`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'PROGRESS_CARDS_DRAWN', draws })
```
Leave the hand-limit bookkeeping (`overLimitIds` computation, `setProgressCardOverLimitPlayerIds`, `debugLog`) completely untouched.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyProgressCardDraws to PROGRESS_CARDS_DRAWN"
```

---

### Task 10: Migrate `applyDiplomacyRemoval` to `DIPLOMACY_PLAYED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'DIPLOMACY_PLAYED'; playerId: number; ownerId: number }`.

Current `applyDiplomacyRemoval` (verified, `App.tsx:2781-2813`, relevant excerpt):
```tsx
const applyDiplomacyRemoval = (playerId: number, edgeId: string, ownerId: number, isDeciding: boolean) => {
  dispatchGameAction({ type: 'REMOVE_ROAD', edgeId }, false)
  // ^ ALREADY a real board-slice action — untouched, this task doesn't touch it
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id === playerId) return { ...p, progressCards: removeOne(p.progressCards, 'diplomacy') }
      if (p.id === ownerId && ownerId !== playerId) return { ...p, roadsRemaining: p.roadsRemaining + 1 }
      return p
    }) })
  // setFreeRoadsRemaining bump, inform(), broadcastDiplomacyPlayed(isDeciding && onlineInfo) — UNCHANGED
}
```
Two call sites: `playDiplomacy` (local actor, `applyDiplomacyRemoval(player.id, edgeId, ownerId, true)`) and `onDiplomacyPlayed` (receiver, validates `ownerId` against this client's own board state, then `applyDiplomacyRemoval(payload.playerId, payload.edgeId, payload.ownerId, false)` — one-line forward, do not touch).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — DIPLOMACY_PLAYED', () => {
  it('removes one diplomacy card from the player and credits a road to the road owner', () => {
    const players = createInitialPlayers(2).map((p, i) => ({ ...p, progressCards: i === 0 ? ['diplomacy' as const] : [], roadsRemaining: 10 }))
    const result = reducePlayers(players, { type: 'DIPLOMACY_PLAYED', playerId: players[0].id, ownerId: players[1].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual([])
    expect(result.find((p) => p.id === players[1].id)!.roadsRemaining).toBe(11)
  })

  it('does not double-credit when the player removes their own road', () => {
    const players = createInitialPlayers(2).map((p, i) => ({ ...p, progressCards: i === 0 ? ['diplomacy' as const] : [], roadsRemaining: 10 }))
    const result = reducePlayers(players, { type: 'DIPLOMACY_PLAYED', playerId: players[0].id, ownerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.roadsRemaining).toBe(10)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
| { type: 'DIPLOMACY_PLAYED'; playerId: number; ownerId: number }
```
```ts
case 'DIPLOMACY_PLAYED':
  return players.map((p) => {
    if (p.id === action.playerId) return { ...p, progressCards: removeOne(p.progressCards, 'diplomacy') }
    if (p.id === action.ownerId && action.ownerId !== action.playerId) return { ...p, roadsRemaining: p.roadsRemaining + 1 }
    return p
  })
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyDiplomacyRemoval"`. Replace ONLY the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'DIPLOMACY_PLAYED', playerId, ownerId })
```
Leave the preceding `dispatchGameAction({ type: 'REMOVE_ROAD', edgeId }, false)` call and everything after (`setFreeRoadsRemaining`, `inform`, `broadcastDiplomacyPlayed`) untouched.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyDiplomacyRemoval to DIPLOMACY_PLAYED"
```

---

### Task 11: Migrate `applySabotageEffect` to `SABOTAGE_PLAYED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'SABOTAGE_PLAYED'; announcerId: number; affected: number[]; countsCommodities: boolean }`. `affected` is the mapped `.id`s of `playersMeetingVpThreshold(announcerId, 'gte')`'s return value. `countsCommodities` is `gameRules.citiesAndKnightsCommodities` — a second value from outside `GameState` this function needs (see below), also computed in `App.tsx` at dispatch time. Both ride on the payload for the same reason: neither is derivable inside the reducer.

Current `applySabotageEffect` (verified by direct read, `App.tsx:5439-5453`, re-confirm exact line with `grep -n` since it may have shifted):
```tsx
const applySabotageEffect = (announcerId: number) => {
  const announcer = playerById.get(announcerId)
  if (!announcer) return
  const affected = playersMeetingVpThreshold(announcerId, 'gte')
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id === announcerId) return { ...p, progressCards: removeOne(p.progressCards, 'sabotage') }
      if (!affected.some((a) => a.id === p.id)) return p
      const handSize = discardHandSize(p.resources, p.commodities, gameRules.citiesAndKnightsCommodities)
      const counts = autoDiscardCounts(p.resources, p.commodities, Math.floor(handSize / 2))
      const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, counts)
      return { ...p, resources, commodities }
    }) })
  inform(`${announcer.name} played Sabotage — ${affected.length} player(s) discarded half their hand.`)
}
```
Note the per-player `discardHandSize`/`autoDiscardCounts`/`applyDiscardCounts` calls happen INSIDE the updater (unlike Task 12's Wedding, which pre-computes everything outside its updater into a `Map` before dispatch — these are genuinely different shapes despite both computing per-player auto-discards, so do not assume Task 12's structure applies here). `discardHandSize` needs a THIRD argument, `countsCommodities: boolean` (verified: `game/discard.ts:25-31`, `discardHandSize(resources, commodities, countsCommodities)` — folds commodities into the hand-size count only when the C&K commodities house rule is on) — `gameRules` is its own `useState` in `App.tsx`, not part of `GameState`, so this boolean must ride on the action payload the same way `affected` does. `discardHandSize`, `autoDiscardCounts`, `applyDiscardCounts` themselves are pure functions of a single player's `resources`/`commodities`(+this boolean) — these DO port into the reducer cleanly; only `playersMeetingVpThreshold` and `gameRules` themselves stay in `App.tsx`, per Global Constraints. Confirm `discardHandSize`/`autoDiscardCounts` are importable into `players.ts` (from `../discard`, alongside the already-imported `applyDiscardCounts`) before writing the reducer case.

Two call sites: `playSabotage` (local actor — confirm its body with `grep -n "const playSabotage"`; it should already have both `affected` and access to `gameRules` in scope, since it calls `applySabotageEffect` from within the same component) and `onProgressCardPlayed`'s `'sabotage'` branch (receiver, currently `applySabotageEffect(payload.playerId)` with no further arguments at all — this call site MUST change: `applySabotageEffect` currently computes its own `affected`/reads `gameRules` internally, which stays true for the ACTOR path, but since `affected`/`countsCommodities` now both need to reach the dispatch, and the receiver calls the SAME shared `applySabotageEffect` function, the cleanest fix is to leave `applySabotageEffect`'s signature as just `(announcerId: number)` and have it keep computing `affected`/reading `gameRules.citiesAndKnightsCommodities` itself, on whichever client calls it — same as it already does today, just also passing both values into the new dispatch instead of relying on `players`/board state after the fact. Re-verify this reasoning holds — `gameRules` is available in every client's `App.tsx` component scope identically, and `playersMeetingVpThreshold` is deterministic from public state — before implementing; if it does not hold for some reason you discover, report BLOCKED with what you found rather than guessing).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — SABOTAGE_PLAYED', () => {
  it('removes one sabotage card from the announcer and auto-discards half the hand of every named affected player', () => {
    const players = createInitialPlayers(3).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? ['sabotage' as const] : [],
      resources: i === 1 ? { lumber: 4, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'SABOTAGE_PLAYED', announcerId: players[0].id, affected: [players[1].id], countsCommodities: false },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual([])
    expect(result.find((p) => p.id === players[1].id)!.resources.lumber).toBeLessThan(4)
  })

  it('leaves a player not in the affected list untouched', () => {
    const players = createInitialPlayers(2).map((p, i) => ({ ...p, progressCards: i === 0 ? ['sabotage' as const] : [] }))
    const result = reducePlayers(players, { type: 'SABOTAGE_PLAYED', announcerId: players[0].id, affected: [], countsCommodities: false }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

Add `{ type: 'SABOTAGE_PLAYED'; announcerId: number; affected: number[]; countsCommodities: boolean }` to `PlayersAction`. Reducer case:
```ts
case 'SABOTAGE_PLAYED':
  return players.map((p) => {
    if (p.id === action.announcerId) return { ...p, progressCards: removeOne(p.progressCards, 'sabotage') }
    if (!action.affected.includes(p.id)) return p
    const handSize = discardHandSize(p.resources, p.commodities, action.countsCommodities)
    const counts = autoDiscardCounts(p.resources, p.commodities, Math.floor(handSize / 2))
    const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, counts)
    return { ...p, resources, commodities }
  })
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applySabotageEffect"`. Replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'SABOTAGE_PLAYED', announcerId, affected: affected.map((p) => p.id), countsCommodities: gameRules.citiesAndKnightsCommodities })
```
(`affected` and `gameRules` are both already in scope in this function — `affected` as an existing local variable, `gameRules` as component state.) Leave `announcer`/`inform` untouched. Do not touch `playSabotage` or `onProgressCardPlayed`'s `'sabotage'` branch — both already just call `applySabotageEffect(announcerId)`/`applySabotageEffect(payload.playerId)` with no other arguments, and that stays true after this change.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applySabotageEffect to SABOTAGE_PLAYED"
```

---

### Task 12: Migrate `applyWeddingEffect` to `WEDDING_PLAYED`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'WEDDING_PLAYED'; announcerId: number; perPlayerCounts: { playerId: number; counts: Partial<Record<ResourceType | CommodityType, number>> }[]; takenTotals: Partial<Record<ResourceType | CommodityType, number>> }`. `perPlayerCounts` is a plain array (converted from the current code's `Map<number, ...>`, since a `Map` isn't a shape this codebase's other action payloads use) of one entry per affected player.

Current `applyWeddingEffect` (verified by direct read, `App.tsx:5481-5515`, re-confirm exact line with `grep -n` since it may have shifted):
```tsx
const applyWeddingEffect = (announcerId: number) => {
  const announcer = playerById.get(announcerId)
  if (!announcer) return
  const affected = playersMeetingVpThreshold(announcerId, 'gt')
  const perPlayerCounts = new Map<number, Partial<Record<ResourceType | CommodityType, number>>>()
  const takenTotals: Partial<Record<ResourceType | CommodityType, number>> = {}
  let totalTaken = 0
  for (const p of affected) {
    const handSize = discardHandSize(p.resources, p.commodities, gameRules.citiesAndKnightsCommodities)
    const counts = autoDiscardCounts(p.resources, p.commodities, Math.min(2, handSize))
    perPlayerCounts.set(p.id, counts)
    for (const [type, count] of Object.entries(counts)) {
      const key = type as ResourceType | CommodityType
      takenTotals[key] = (takenTotals[key] ?? 0) + (count as number)
      totalTaken += count as number
    }
  }
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id === announcerId) {
        const resources = { ...p.resources }
        const commodities = { ...p.commodities }
        for (const [type, count] of Object.entries(takenTotals)) {
          if (RESOURCE_ORDER.includes(type as ResourceType)) resources[type as ResourceType] += count as number
          else commodities[type as CommodityType] += count as number
        }
        return { ...p, resources, commodities, progressCards: removeOne(p.progressCards, 'wedding') }
      }
      const counts = perPlayerCounts.get(p.id)
      if (!counts) return p
      const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, counts)
      return { ...p, resources, commodities }
    }) })
  inform(`${announcer.name} played Wedding — received ${totalTaken} card${totalTaken === 1 ? '' : 's'} from ${affected.length} player(s).`)
}
```
`affected`/`perPlayerCounts`/`takenTotals`/`totalTaken` are ALL computed OUTSIDE the updater already (StrictMode-safety, matching CONVENTIONS.md §3, the exact bug class documented there) — this whole pre-computation block (including its own `playersMeetingVpThreshold(announcerId, 'gt')` call, which per Global Constraints can never move into the reducer) stays in `App.tsx`, unmoved. Only the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` call moves, taking `perPlayerCounts` (converted to an array: `Array.from(perPlayerCounts, ([playerId, counts]) => ({ playerId, counts }))`) and `takenTotals` as action fields. `totalTaken`/`affected.length` stay local, used only by the `inform()` call after dispatch — untouched.

Two call sites: `playWedding` (local actor — re-confirm its body computes/calls `applyWeddingEffect` the same way with `grep -n "const playWedding"`) and `onProgressCardPlayed`'s `'wedding'` branch (receiver, currently `applyWeddingEffect(payload.playerId)` with no further arguments — the entire pre-computation block above runs INSIDE `applyWeddingEffect` today, not in the caller, unlike Task 11's Sabotage where `affected` was computed by the caller. This means, unlike Sabotage, `applyWeddingEffect`'s signature does NOT need to change and the receiver branch does NOT need fixing — the whole pre-computation (including the `playersMeetingVpThreshold` call) already runs once per invocation, on whichever client calls it, exactly where it already is. Verify this distinction against Sabotage by direct read before assuming Wedding needs the same receiver fix Task 11's Sabotage needed — they are NOT the same shape, despite being described as "mirroring" each other structurally in this plan's Architecture section).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — WEDDING_PLAYED', () => {
  it("credits the announcer with takenTotals, removes one wedding card, and debits each affected player by their own counts entry", () => {
    const players = createInitialPlayers(3).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? ['wedding' as const] : [],
      resources: i === 0 ? { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 2, brick: 0, wool: 0, grain: 0, ore: 0 },
    }))
    const result = reducePlayers(
      players,
      {
        type: 'WEDDING_PLAYED',
        announcerId: players[0].id,
        perPlayerCounts: [{ playerId: players[1].id, counts: { lumber: 1 } }],
        takenTotals: { lumber: 1 },
      },
      initialGameState,
    )
    const announcer = result.find((p) => p.id === players[0].id)!
    const affected = result.find((p) => p.id === players[1].id)!
    expect(announcer.progressCards).toEqual([])
    expect(announcer.resources.lumber).toBe(1)
    expect(affected.resources.lumber).toBe(1)
  })

  it('leaves a player with no perPlayerCounts entry untouched', () => {
    const players = createInitialPlayers(2).map((p, i) => ({ ...p, progressCards: i === 0 ? ['wedding' as const] : [] }))
    const result = reducePlayers(players, { type: 'WEDDING_PLAYED', announcerId: players[0].id, perPlayerCounts: [], takenTotals: {} }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

Add `{ type: 'WEDDING_PLAYED'; announcerId: number; perPlayerCounts: { playerId: number; counts: Partial<Record<ResourceType | CommodityType, number>> }[]; takenTotals: Partial<Record<ResourceType | CommodityType, number>> }` to `PlayersAction`. Reducer case:
```ts
case 'WEDDING_PLAYED': {
  const countsByPlayerId = new Map(action.perPlayerCounts.map((entry) => [entry.playerId, entry.counts]))
  return players.map((p) => {
    if (p.id === action.announcerId) {
      const resources = { ...p.resources }
      const commodities = { ...p.commodities }
      for (const [type, count] of Object.entries(action.takenTotals)) {
        if (RESOURCE_ORDER.includes(type as ResourceType)) resources[type as ResourceType] += count as number
        else commodities[type as CommodityType] += count as number
      }
      return { ...p, resources, commodities, progressCards: removeOne(p.progressCards, 'wedding') }
    }
    const counts = countsByPlayerId.get(p.id)
    if (!counts) return p
    const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, counts)
    return { ...p, resources, commodities }
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyWeddingEffect"`. Replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({
  type: 'WEDDING_PLAYED',
  announcerId,
  perPlayerCounts: Array.from(perPlayerCounts, ([playerId, counts]) => ({ playerId, counts })),
  takenTotals,
})
```
Leave the entire pre-computation block (`affected`, `perPlayerCounts`, `takenTotals`, `totalTaken` and their loop) and the trailing `inform(...)` completely untouched — only the `dispatch` call itself changes. Do not touch `playWedding` or `onProgressCardPlayed`'s `'wedding'` branch — both already just call this function with only `announcerId`.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyWeddingEffect to WEDDING_PLAYED"
```

---

### Task 13: Migrate `applyGuildDuesTake` to `GUILD_DUES_TAKEN`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'GUILD_DUES_TAKEN'; takerId: number; targetId: number; picks: (ResourceType | CommodityType)[] }`.

Current `applyGuildDuesTake` (verified by direct read, `App.tsx:5543-5566`, re-confirm exact line with `grep -n` since it may have shifted):
```tsx
const applyGuildDuesTake = (takerId: number, targetId: number, picks: (ResourceType | CommodityType)[]) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) => {
      if (p.id === targetId) {
        let resources = { ...p.resources }
        let commodities = { ...p.commodities }
        for (const pick of picks) {
          if ((RESOURCE_ORDER as readonly string[]).includes(pick)) resources = { ...resources, [pick]: Math.max(0, resources[pick as ResourceType] - 1) }
          else commodities = { ...commodities, [pick]: Math.max(0, commodities[pick as CommodityType] - 1) }
        }
        return { ...p, resources, commodities }
      }
      if (p.id === takerId) {
        let resources = { ...p.resources }
        let commodities = { ...p.commodities }
        for (const pick of picks) {
          if ((RESOURCE_ORDER as readonly string[]).includes(pick)) resources = { ...resources, [pick]: resources[pick as ResourceType] + 1 }
          else commodities = { ...commodities, [pick]: commodities[pick as CommodityType] + 1 }
        }
        return { ...p, resources, commodities }
      }
      return p
    }) })
}
```
This function does NOT remove the `'guildDues'` card itself — that's `playGuildDues`'s own `PROGRESS_CARD_SPENT` dispatch (`App.tsx:5584`, `dispatch({ type: 'PROGRESS_CARD_SPENT', playerId: player.id, card: 'guildDues' })`), already migrated in sub-plan 4a, a separate call site entirely, untouched by this task.

Two call sites: `confirmGuildDues` (local actor, after the picker resolves) and `onGuildDuesTaken` (receiver, validates `picks` types/target-holdings then calls `applyGuildDuesTake(payload.takerId, payload.targetId, payload.picks)` directly — do not touch).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — GUILD_DUES_TAKEN', () => {
  it('transfers each picked item from target to taker, clamped at 0', () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      resources: i === 0 ? { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 },
      commodities: i === 0 ? { paper: 0, cloth: 0, coin: 0 } : { paper: 1, cloth: 0, coin: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'GUILD_DUES_TAKEN', takerId: players[0].id, targetId: players[1].id, picks: ['lumber', 'paper'] },
      initialGameState,
    )
    const taker = result.find((p) => p.id === players[0].id)!
    const target = result.find((p) => p.id === players[1].id)!
    expect(taker.resources.lumber).toBe(1)
    expect(taker.commodities.paper).toBe(1)
    expect(target.resources.lumber).toBe(0)
    expect(target.commodities.paper).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
case 'GUILD_DUES_TAKEN':
  return players.map((p) => {
    if (p.id === action.targetId) {
      let resources = { ...p.resources }
      let commodities = { ...p.commodities }
      for (const pick of action.picks) {
        if ((RESOURCE_ORDER as readonly string[]).includes(pick)) resources = { ...resources, [pick]: Math.max(0, resources[pick as ResourceType] - 1) }
        else commodities = { ...commodities, [pick]: Math.max(0, commodities[pick as CommodityType] - 1) }
      }
      return { ...p, resources, commodities }
    }
    if (p.id === action.takerId) {
      let resources = { ...p.resources }
      let commodities = { ...p.commodities }
      for (const pick of action.picks) {
        if ((RESOURCE_ORDER as readonly string[]).includes(pick)) resources = { ...resources, [pick]: resources[pick as ResourceType] + 1 }
        else commodities = { ...commodities, [pick]: commodities[pick as CommodityType] + 1 }
      }
      return { ...p, resources, commodities }
    }
    return p
  })
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyGuildDuesTake"`. Replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'GUILD_DUES_TAKEN', takerId, targetId, picks })
```
Do not touch `confirmGuildDues` or `onGuildDuesTaken` — both already just call this function.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyGuildDuesTake to GUILD_DUES_TAKEN"
```

---

### Task 14: Migrate `applyEspionageTake` to `ESPIONAGE_TAKEN`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'ESPIONAGE_TAKEN'; takerId: number; targetId: number; cardIndex: number }`.

Current `applyEspionageTake` (verified by direct read, `App.tsx:5625-5643`, re-confirm exact line with `grep -n` since it may have shifted):
```tsx
const applyEspionageTake = (takerId: number, targetId: number, cardIndex: number) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => {
    const target = prev.find((p) => p.id === targetId)
    const card = target?.progressCards[cardIndex]
    // VP cards can't be taken — re-verified here (the receiver), not just
    // picker-side, since a receiving client must never trust that an
    // incoming index was already screened by the sender's own UI.
    if (!card || PROGRESS_CARD_VP_TYPES.has(card)) return prev
    return prev.map((p) => {
      if (p.id === targetId) {
        const next = [...p.progressCards]
        next.splice(cardIndex, 1)
        return { ...p, progressCards: next }
      }
      if (p.id === takerId) return { ...p, progressCards: [...p.progressCards, card] }
      return p
    })
  } })
}
```
Re-derives the actual card from `target.progressCards[cardIndex]` rather than trusting any card-identity field on the action — this index-based re-derivation, and the VP-card bail, are exactly the pattern to preserve (the comment above the bail explains why: a receiving client must never trust that an incoming index was already screened by the sender's own UI). `PROGRESS_CARD_VP_TYPES` (a `Set<ProgressCardType>`) needs importing into `players.ts` if not already present. Does NOT remove the `'espionage'` card from the taker — that's `playEspionage`'s own already-migrated `PROGRESS_CARD_SPENT` dispatch.

Two call sites: `confirmEspionage` (local actor) and `onEspionageTaken` (receiver, a bare one-line forward, `(payload) => applyEspionageTake(payload.takerId, payload.targetId, payload.cardIndex)` — trust lives entirely inside this function's own re-derivation/bail logic).

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — ESPIONAGE_TAKEN', () => {
  it('moves the card at the given index from target to taker', () => {
    const players = createInitialPlayers(2).map((p, i) => ({ ...p, progressCards: i === 1 ? ['crane' as const, 'alchemy' as const] : [] }))
    const result = reducePlayers(players, { type: 'ESPIONAGE_TAKEN', takerId: players[0].id, targetId: players[1].id, cardIndex: 0 }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual(['crane'])
    expect(result.find((p) => p.id === players[1].id)!.progressCards).toEqual(['alchemy'])
  })

  it('is a no-op when the index is out of range', () => {
    const players = createInitialPlayers(2).map((p, i) => ({ ...p, progressCards: i === 1 ? ['crane' as const] : [] }))
    const result = reducePlayers(players, { type: 'ESPIONAGE_TAKEN', takerId: players[0].id, targetId: players[1].id, cardIndex: 5 }, initialGameState)
    expect(result).toEqual(players)
  })

  it('is a no-op when the card at that index is a VP card', () => {
    // Use a real entry from PROGRESS_CARD_VP_TYPES for the fixture, confirmed by direct read of that Set's contents.
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
case 'ESPIONAGE_TAKEN': {
  const target = players.find((p) => p.id === action.targetId)
  const card = target?.progressCards[action.cardIndex]
  if (!card || PROGRESS_CARD_VP_TYPES.has(card)) return players
  return players.map((p) => {
    if (p.id === action.targetId) {
      const next = [...p.progressCards]
      next.splice(action.cardIndex, 1)
      return { ...p, progressCards: next }
    }
    if (p.id === action.takerId) return { ...p, progressCards: [...p.progressCards, card] }
    return p
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call site**

Confirm the current line with `grep -n "const applyEspionageTake"`. Replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'ESPIONAGE_TAKEN', takerId, targetId, cardIndex })
```
Do not touch `confirmEspionage` or `onEspionageTaken`.

- [ ] **Step 6: Typecheck, lint, full test suite**
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate applyEspionageTake to ESPIONAGE_TAKEN"
```

---

### Task 15: Final verification for this sub-plan

**Files:** none (verification only)

- [ ] **Step 1: Full automated suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: all clean.

- [ ] **Step 2: Confirm the bridge shrank correctly**

Run: `grep -c "LEGACY_SET_PLAYERS" catan-3d/src/App.tsx`. This plan migrates 16 functions across 14 tasks (2 batched pairs + 12 singles) — expect a reduction in the neighborhood of 16 from this sub-plan's starting count, but per sub-plan 4a's own final-review finding, **do not trust plan arithmetic over a fresh survey**: also run `grep -n "LEGACY_SET_PLAYERS" catan-3d/src/App.tsx` and manually confirm every remaining hit belongs to a function genuinely out of scope for buckets 4a/4b (sub-plan 5's territory: `applyCityImprovementPurchase`, `buyCityImprovement`, `buildCityWall`, `resolveFreeCityWall`, `playMerchantFleet`'s OWN non-spend internals if any remain, `applyTurnAdvance`, `buyDevCard`, `spendDevCard` is already gone, `applyRollResult`) — not another missed same-shape sibling.

- [ ] **Step 3: Manual spot-check**

Dev server (or a boot smoke-test if no interactive browser tooling is available in your environment — note this limitation explicitly rather than skip silently): play at least one card from each family this sub-plan touched — a fused-effect card (Irrigation or Mining), a picker-resolved card (Year of Plenty, Monopoly, or Resource/Trade Monopoly), Diplomacy, Sabotage or Wedding, and Guild Dues or Espionage — confirm each behaves identically to before this sub-plan.
