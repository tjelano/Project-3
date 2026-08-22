# Game State Reducer — Players Slice, Sub-plan 4a: Progress Card Spend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every "spend a card" `LEGACY_SET_PLAYERS` write off the bridge — both dev-card spends (`spendDevCard`, shared by 4 callers) and progress-card spends (12 near-identical call sites across 7 `playX` actor functions, 3 `onProgressCardPlayed` receiver branches, and 2 dedicated receivers) — onto two new typed actions.

**Architecture:** Unlike prior sub-plans, this one does not map new actions 1:1 onto existing per-function names. All 16 call sites this plan covers do the exact same players-side write shape (`prev.map(p => p.id === playerId ? { ...p, <hand array>: removeOne(p.<hand array>, <card>) } : p)`, plus a `knightsPlayed` bump for the dev-card 'knight' case) — the difference between call sites is only which card is named and which client (actor vs. receiver) is calling. Two new actions capture this generically: `DEV_CARD_SPENT { playerId, devCardType }` and `PROGRESS_CARD_SPENT { playerId, card }`. Every call site becomes a 1:1 swap from its own inline `LEGACY_SET_PLAYERS` dispatch to one of these two, with zero change to guards, broadcasts, or any other side effect.

This is deliberately **not** a full migration of every progress-card function in the parent spec's bucket 4 ("Progress cards", ~21 functions). It covers only the "spend the card" half. The other half — the actual game effects (Year of Plenty, Monopoly, Irrigation, Sabotage, etc., 16 functions) — is sub-plan 4b, written and executed separately once this lands (its receivers depend on `PROGRESS_CARD_SPENT`/`DEV_CARD_SPENT` already existing, since several of them currently do their own inline spend before calling the effect function).

**Tech Stack:** TypeScript, React (`useReducer`), Vitest.

**Spec:** `docs/superpowers/specs/2026-08-19-game-state-reducer-players-slice-design.md` (bucket 4, `~line 80`) and its parent `docs/superpowers/specs/2026-08-19-game-state-reducer-design.md`. Bucket 4's own prose anticipated splitting into two plans ("card-spend-only effects vs. card-effect-resolution effects") without settling the split until this sub-plan was actually scoped — this plan is that split, decided by direct research against the live worktree (two parallel Explore-agent surveys plus a direct read of `onProgressCardPlayed`), not assumed from the spec's one-line summary.

## Global Constraints

- **Reducers are pure appliers, always.** No `Math.random()`, no `inform()`/`warn()`/`playSfx()`, no `Date.now()`. `reducePlayers` cases only compute the next `Player[]`.
- **This sub-plan touches ONLY the players-side write at each call site.** Every other side effect already in these functions (guards, `setState` calls, `broadcastX()` calls, `inform()`) stays exactly as-is, at its existing call site. Do not restructure anything beyond what each task explicitly describes.
- **`DEV_CARD_SPENT`'s single call site (inside `spendDevCard`) closes 4 functions transitively** — `applyKnightPlay`, `applyRoadBuildingPlay`, `playYearOfPlenty`, `playMonopoly` all call `spendDevCard(...)`, and 2 receivers (`onPlentyPlayed`, `onMonopolyPlayed`) call it too. None of those 6 callers change in this plan — only `spendDevCard`'s own body changes. Do not touch any of the 6 callers.
- **`PROGRESS_CARD_SPENT` has 12 distinct call sites, all in `App.tsx`, all the same one-line shape.** Per the SDD skill's "batch small same-shape work" guidance, this is ONE dispatch to ONE implementer, not 12 separate tasks — the diff is reviewed as one unit.
- **Re-confirm every line number below with `grep -n` before editing** — this file has been touched by three prior sub-plans already, and line numbers shift with every commit.
- **No existing `PlayersAction` variant covers either action this sub-plan introduces** — both `DEV_CARD_SPENT` and `PROGRESS_CARD_SPENT` are created from scratch.
- **`playAlchemy`'s own `PROGRESS_CARD_SPENT` dispatch never gets broadcast** — verified in research: `playAlchemy` has no receive-handler and explicitly does not call any `broadcastX`, because `alchemyPreset` (the actual effect) is deliberately local-only (only matters on the roller's own client). This is pre-existing behavior, not something this task changes or should "fix" — the dispatch still needs to happen locally (so this client's own hand updates), it just never reaches other clients via this path, same as before.

---

### Task 1: Add `PROGRESS_CARD_SPENT` and migrate its 12 call sites

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'PROGRESS_CARD_SPENT'; playerId: number; card: ProgressCardType }`. Import `ProgressCardType` as a type into `players.ts` from `'../types'` (alongside the existing type-only import).

**Reducer case to add:**
```ts
case 'PROGRESS_CARD_SPENT':
  return players.map((p) =>
    p.id === action.playerId ? { ...p, progressCards: removeOne(p.progressCards, action.card) } : p,
  )
```

**Tests to add** (`players.test.ts`):
```ts
describe('reducePlayers — PROGRESS_CARD_SPENT', () => {
  it('removes one instance of the named card from the player', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['alchemy' as const, 'alchemy' as const] }))
    const result = reducePlayers(players, { type: 'PROGRESS_CARD_SPENT', playerId: players[0].id, card: 'alchemy' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual(['alchemy'])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['invention' as const] }))
    const result = reducePlayers(players, { type: 'PROGRESS_CARD_SPENT', playerId: players[0].id, card: 'invention' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```
Run `cd catan-3d && npx vitest run src/game/reducers/players.test.ts` to confirm FAIL before adding the case, then PASS after.

**Call sites to migrate — verify every one with `grep -n` first, since these are approximate (gathered by research, not re-confirmed at plan-write time for every single line):**

1. `playResourceMonopoly` — its own `dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'resourceMonopoly') } : p)) })` becomes `dispatch({ type: 'PROGRESS_CARD_SPENT', playerId: player.id, card: 'resourceMonopoly' })`.
2. `playTradeMonopoly` — same shape, `card: 'tradeMonopoly'`.
3. `playAlchemy` — same shape, `card: 'alchemy'`. (See Global Constraints note: this dispatch still happens, it just never gets broadcast — leave the missing broadcast as-is, do not add one.)
4. `playProgressRoadBuilding` — same shape, `card: 'progressRoadBuilding'`. Leave the immediately-following `setFreeRoadsRemaining((prev) => prev + 2)` untouched.
5. `playInvention` — same shape, `card: 'invention'`. Leave `setPendingInventionSwap(...)` untouched.
6. `playGuildDues` — same shape, `card: 'guildDues'`. Leave `setPendingGuildDues(...)` untouched.
7. `playEspionage` — same shape, `card: 'espionage'`. Leave `setPendingEspionage(...)` untouched.
8. `onProgressCardPlayed`'s `'invention'` branch — replace its own `dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => (p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'invention') } : p)) })` with `dispatch({ type: 'PROGRESS_CARD_SPENT', playerId: payload.playerId, card: 'invention' })`.
9. `onProgressCardPlayed`'s shared `'guildDues' || 'espionage'` branch — replace `dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => (p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, payload.card) } : p)) })` with `dispatch({ type: 'PROGRESS_CARD_SPENT', playerId: payload.playerId, card: payload.card })` — note `card` here is `payload.card`, not a literal, since this branch handles both cards.
10. `onProgressCardPlayed`'s `'intrigue'` branch — replace `dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => (p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'intrigue') } : p)) })` with `dispatch({ type: 'PROGRESS_CARD_SPENT', playerId: payload.playerId, card: 'intrigue' })`.
11. `onResourceMonopolyPlayed` — replace its own `dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => (p.id === payload.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'resourceMonopoly') } : p)) })` with `dispatch({ type: 'PROGRESS_CARD_SPENT', playerId: payload.playerId, card: 'resourceMonopoly' })`. Leave the `RESOURCE_ORDER.includes` validation guard and the subsequent `applyResourceMonopolyProgressEffect(...)` call untouched.
12. `onTradeMonopolyPlayed` — same shape, `card: 'tradeMonopoly'`. Leave the `COMMODITY_ORDER.includes` guard and `applyTradeMonopolyEffect(...)` call untouched.

- [ ] **Step 1: Write the failing tests** (above)
- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case** (above)
- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Migrate all 12 call sites** (above) — re-`grep -n` each function name first; do not touch any code in these functions beyond the one dispatch line each.
- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate all 12 progress-card-spend call sites to PROGRESS_CARD_SPENT"
```

---

### Task 2: Add `DEV_CARD_SPENT` and migrate `spendDevCard`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'DEV_CARD_SPENT'; playerId: number; devCardType: DevCardType }`. Import `DevCardType` as a type into `players.ts` from `'../types'`.

Current `spendDevCard` (verified in this worktree, `App.tsx:4394-4406`):
```tsx
const spendDevCard = (playerId: number, type: DevCardType) => {
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) =>
    prev.map((p) =>
      p.id === playerId
        ? {
            ...p,
            devCards: removeOne(p.devCards, type),
            knightsPlayed: type === 'knight' ? p.knightsPlayed + 1 : p.knightsPlayed,
          }
        : p,
    ) })
  setDevCardPlayedThisTurn(true)
}
```
`spendDevCard` has exactly 4 direct callers (`applyKnightPlay(playerId)` → `spendDevCard(playerId, 'knight')`, `applyRoadBuildingPlay` → `'roadBuilding'`, `playYearOfPlenty` → `'yearOfPlenty'`, `playMonopoly` → `'monopoly'`) plus 2 receivers that call it directly (`onPlentyPlayed`, `onMonopolyPlayed`, both `spendDevCard(payload.playerId, '<type>')` immediately before calling their `applyX` effect). None of these 6 callers change in this task — only `spendDevCard`'s own body does.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — DEV_CARD_SPENT', () => {
  it('removes one instance of the named dev card and bumps knightsPlayed only for knight', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, devCards: ['knight' as const, 'knight' as const], knightsPlayed: 1 }))
    const result = reducePlayers(players, { type: 'DEV_CARD_SPENT', playerId: players[0].id, devCardType: 'knight' }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.devCards).toEqual(['knight'])
    expect(player.knightsPlayed).toBe(2)
  })

  it('does not bump knightsPlayed for a non-knight dev card', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, devCards: ['monopoly' as const], knightsPlayed: 0 }))
    const result = reducePlayers(players, { type: 'DEV_CARD_SPENT', playerId: players[0].id, devCardType: 'monopoly' }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.devCards).toEqual([])
    expect(player.knightsPlayed).toBe(0)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, devCards: ['roadBuilding' as const] }))
    const result = reducePlayers(players, { type: 'DEV_CARD_SPENT', playerId: players[0].id, devCardType: 'roadBuilding' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action type and reducer case**

```ts
case 'DEV_CARD_SPENT':
  return players.map((p) =>
    p.id === action.playerId
      ? { ...p, devCards: removeOne(p.devCards, action.devCardType), knightsPlayed: action.devCardType === 'knight' ? p.knightsPlayed + 1 : p.knightsPlayed }
      : p,
  )
```

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update `spendDevCard`'s call site**

Confirm the current line with `grep -n "const spendDevCard = " src/App.tsx`. Replace its `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'DEV_CARD_SPENT', playerId, devCardType: type })
```
Leave `setDevCardPlayedThisTurn(true)` untouched. Do not touch any of `spendDevCard`'s 6 callers.

- [ ] **Step 6: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate spendDevCard to DEV_CARD_SPENT"
```

---

### Task 3: Final verification for this sub-plan

**Files:** none (verification only)

- [ ] **Step 1: Full automated suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: all clean.

- [ ] **Step 2: Confirm the bridge shrank by 13**

Run: `grep -c "LEGACY_SET_PLAYERS" catan-3d/src/App.tsx`
Expected: 13 fewer than this sub-plan's starting count (12 `PROGRESS_CARD_SPENT` sites + 1 `DEV_CARD_SPENT` site — `spendDevCard`'s single dispatch, not its 6 callers, which never had their own bridge calls). If the number doesn't match, grep for `LEGACY_SET_PLAYERS` and account for the discrepancy before proceeding — this grep is ground truth, not the arithmetic above (same lesson sub-plans 2 and 3 both hit at this exact step).

- [ ] **Step 3: Manual spot-check**

Dev server: play any progress or dev card that this sub-plan touched (e.g. Monopoly, Resource Monopoly, Alchemy, Guild Dues) and confirm the card visibly disappears from your hand exactly as before. This sub-plan does not change any card's actual EFFECT (that's sub-plan 4b) — only that the card leaves your hand — so this is a light check, not a full playtest.
