# Sub-plan 6: Final Cutover

Migrates the last two `LEGACY_SET_PLAYERS` call sites in bucket 6 of the players-slice reducer migration (parent spec: `docs/superpowers/specs/2026-08-19-game-state-reducer-players-slice-design.md`) — `resetGame` and `restoreFromSnapshot` — onto typed `PlayersAction` variants, then deletes `LEGACY_SET_PLAYERS` from `PlayersAction` entirely. Sub-plans 1-5 are merged to main. This is the last sub-plan in the project.

## Why this differs in shape from every prior sub-plan

Every other sub-plan migrated **per-player** writes (`players.map((p) => p.id === action.playerId ? {...} : p)`). Both functions here are **whole-array replacements** — the spec's own bucket-6 description calls this out explicitly, mirroring board's existing `RESET_BOARD`/`RESTORE_BOARD` precedent (`game/reducers/board.ts:21-22`, `:52-59`) rather than the per-player-map family every other sub-plan used. Verified directly:

- `resetGame` (`App.tsx:5795-5921` as of this commit) currently does `dispatch({ type: 'LEGACY_SET_PLAYERS', updater: () => createInitialPlayers(count, resolvedNames, isFreshSubmission ? colorTokens : undefined, effectiveRules.victoryPointTarget) })` — the updater ignores its `prev` argument entirely and returns a fresh array. `createInitialPlayers` (`game/types.ts:486-517`) is a pure function of its four arguments — no `Math.random()`/`Date.now()`/other impurity — so it's safe to call from inside a reducer case, exactly the same shape as `RESET_BOARD` returning a fixed fresh object.
- `restoreFromSnapshot` (`App.tsx:6038-6100` as of this commit) already computes `normalizedPlayers` (a `.map()` over `snapshot.players` backfilling pre-Cities&Knights-era snapshot fields) BEFORE dispatch, then does `dispatch({ type: 'LEGACY_SET_PLAYERS', updater: () => normalizedPlayers })` — already the correct "compute outside, thread onto payload" shape, no restructuring needed. `normalizedPlayers` is also read again later in the same function (`unresolvedMetropolisClaimTrack(normalizedPlayers, ...)` at line ~6141) — it must stay as a local variable, not be removed.

## Completion signal

Once both functions are migrated, `LEGACY_SET_PLAYERS` has zero remaining callers anywhere in the codebase (verified: `grep -rn LEGACY_SET_PLAYERS catan-3d/src` currently returns exactly 4 files — `players.ts` itself, `players.test.ts`, `board.test.ts`, and `App.tsx`'s two call sites — all four are this plan's scope to close). Task 2 deletes the type entirely — **that deletion, not a `useState` removal (already gone since sub-plan 1), is this whole 6-sub-plan project's actual completion signal.**

## Global Constraints

Same as every prior sub-plan:
- Reducer cases are pure appliers — no `Math.random()`, `inform()`/`warn()`/`playSfx()`, `Date.now()`, no reads of `useState` values outside `GameState`.
- Each task touches ONLY the players-side write in each function — every other `useState` setter in `resetGame`/`restoreFromSnapshot` (board shape, game rules, tiles, robber, dev deck, progress card decks, online info, current player index, and — in `restoreFromSnapshot` — the full remaining ~20 setters restoring board/knights/barbarian/metropolis/merchant state) stays exactly where it is. These two functions are large; do not touch anything beyond the one dispatch line each task names.
- `createInitialPlayers` and its imports (`game/types.ts`) are not modified — only called from the new reducer case, exactly as `App.tsx` already calls it today.

## Task 1: Migrate `resetGame` + `restoreFromSnapshot` to `RESET_PLAYERS` + `RESTORE_PLAYERS`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Test: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `PlayersAction` gains `{ type: 'RESET_PLAYERS'; count: number; names: string[]; colorTokens?: PlayerColorToken[]; victoryPointTarget: number }` and `{ type: 'RESTORE_PLAYERS'; players: Player[] }`.

This is a batched dispatch (both functions are simple, independent, well-specified single-dispatch-line swaps in different functions of the same file) — implement both in one pass, one commit.

**`resetGame`'s current dispatch** (verified by direct read, `App.tsx:5884-5889` — re-confirm exact lines with `grep -n "const resetGame"` since they may have shifted):
```tsx
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: () => createInitialPlayers(
    count,
    resolvedNames,
    isFreshSubmission ? colorTokens : undefined,
    effectiveRules.victoryPointTarget,
  ) })
```
`count` is the function's own first parameter. `resolvedNames` is computed a few lines earlier (`const resolvedNames = names ?? playerNames`). `isFreshSubmission ? colorTokens : undefined` is already the exact pre-dispatch-computed value the payload needs — no new computation required, just reference the existing local. `effectiveRules.victoryPointTarget` likewise already computed (`const effectiveRules = ...` a few lines earlier).

**`restoreFromSnapshot`'s current dispatch** (verified by direct read, `App.tsx:6072-6091` — re-confirm exact lines with `grep -n "const restoreFromSnapshot"`):
```tsx
const normalizedPlayers = snapshot.players.map((p) => ({
    ...p,
    commodities: p.commodities ?? emptyCommodities(),
    cityImprovements: p.cityImprovements ?? emptyCityImprovements(),
    progressCards: p.progressCards ?? [],
    knightPieces: p.knightPieces ?? [],
    knightSupply: p.knightSupply ?? { ...KNIGHT_STARTING_SUPPLY },
    cityWalls: p.cityWalls ?? [],
    defenderOfCatanCount: p.defenderOfCatanCount ?? 0,
  }))
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: () => normalizedPlayers })
```
**Do not remove or alter `normalizedPlayers`'s declaration or its backfill logic** — only the `dispatch(...)` line changes. `normalizedPlayers` is read again later in this same function (`unresolvedMetropolisClaimTrack(normalizedPlayers, ...)`) — confirm this second usage still compiles unchanged after your edit.

`createInitialPlayers`'s exact signature (`game/types.ts:486-493`, do not modify): `createInitialPlayers(playerCount: number, names?: string[], colorTokens?: PlayerColorToken[], victoryPointTarget: number = WINNING_SCORE): Player[]`.

- [ ] **Step 1: Write the failing tests**

```ts
describe('reducePlayers — RESET_PLAYERS', () => {
  it('builds a fresh players array of the given count, ignoring the current players entirely', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, knightsPlayed: 9 }))
    const result = reducePlayers(players, { type: 'RESET_PLAYERS', count: 3, names: ['A', 'B', 'C'], victoryPointTarget: 12 }, initialGameState)
    expect(result).toHaveLength(3)
    expect(result.map((p) => p.name)).toEqual(['A', 'B', 'C'])
    expect(result.every((p) => p.knightsPlayed === 0)).toBe(true)
  })

  it('matches a direct createInitialPlayers call with the same arguments', () => {
    const players = createInitialPlayers(1)
    const result = reducePlayers(players, { type: 'RESET_PLAYERS', count: 4, names: ['P1', 'P2', 'P3', 'P4'], colorTokens: ['player-2', 'player-4', 'player-1', 'player-3'], victoryPointTarget: 10 }, initialGameState)
    expect(result).toEqual(createInitialPlayers(4, ['P1', 'P2', 'P3', 'P4'], ['player-2', 'player-4', 'player-1', 'player-3'], 10))
  })
})

describe('reducePlayers — RESTORE_PLAYERS', () => {
  it('replaces the players array with the action payload verbatim', () => {
    const current = createInitialPlayers(2)
    const restored = createInitialPlayers(3).map((p) => ({ ...p, name: `Restored ${p.id}` }))
    const result = reducePlayers(current, { type: 'RESTORE_PLAYERS', players: restored }, initialGameState)
    expect(result).toBe(restored)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**
- [ ] **Step 3: Add the action types and reducer cases**

```ts
| { type: 'RESET_PLAYERS'; count: number; names: string[]; colorTokens?: PlayerColorToken[]; victoryPointTarget: number }
| { type: 'RESTORE_PLAYERS'; players: Player[] }
```
```ts
case 'RESET_PLAYERS':
  return createInitialPlayers(action.count, action.names, action.colorTokens, action.victoryPointTarget)
case 'RESTORE_PLAYERS':
  return action.players
```
Add imports to `players.ts`: `createInitialPlayers`, `type PlayerColorToken` from `'../types'` (confirm the exact existing import lines with `grep -n "^import" catan-3d/src/game/reducers/players.ts` and extend them rather than adding new lines — the file already imports several symbols from `'../types'` across two lines, a type-only line and a value line; `createInitialPlayers` is a value, `PlayerColorToken` is a type).

- [ ] **Step 4: Run tests to verify they pass**
- [ ] **Step 5: Update the call sites**

`resetGame` — confirm the current line with `grep -n "const resetGame"`. Replace the `dispatch({ type: 'LEGACY_SET_PLAYERS', ... })` block with:
```tsx
dispatch({ type: 'RESET_PLAYERS', count, names: resolvedNames, colorTokens: isFreshSubmission ? colorTokens : undefined, victoryPointTarget: effectiveRules.victoryPointTarget })
```
`restoreFromSnapshot` — confirm the current line with `grep -n "const restoreFromSnapshot"`. Replace only the `dispatch({ type: 'LEGACY_SET_PLAYERS', updater: () => normalizedPlayers })` line with:
```tsx
dispatch({ type: 'RESTORE_PLAYERS', players: normalizedPlayers })
```
Leave the `normalizedPlayers` declaration/backfill block above it, and every line after it in both functions, untouched.

- [ ] **Step 6: Typecheck, lint, full test suite** — run all three of `npx tsc -b`, `npx eslint src`, `npx vitest run` and confirm genuinely clean output for all three (not just the test suite — this project has a documented incident where a dead import and a type mismatch slipped through because only `vitest run` was checked).
- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/App.tsx
git commit -m "feat: migrate resetGame and restoreFromSnapshot to RESET_PLAYERS/RESTORE_PLAYERS"
```

---

## Task 2: Delete `LEGACY_SET_PLAYERS`

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts`
- Modify: `catan-3d/src/game/reducers/players.test.ts`
- Modify: `catan-3d/src/game/reducers/board.test.ts`

This is the project's completion signal. Before starting, confirm the precondition: `grep -rn "LEGACY_SET_PLAYERS" catan-3d/src` must show ONLY the four locations named below (the type declaration + reducer case in `players.ts`, the describe block in `players.test.ts`, and the two test usages in `board.test.ts`) — if `App.tsx` (or anywhere else) still has a match, Task 1 did not land cleanly; stop and report BLOCKED rather than deleting the type out from under a live caller.

**`players.ts`** — remove exactly two things, nothing else in the file:
- The union member (currently `game/reducers/players.ts:14`, verify with `grep -n "LEGACY_SET_PLAYERS"`): the `| { type: 'LEGACY_SET_PLAYERS'; updater: (players: Player[]) => Player[] }` line, including its preceding 5-line comment block explaining its purpose.
- The reducer case (currently `players.ts:68-69`): the `case 'LEGACY_SET_PLAYERS': return action.updater(players)` two-line block.

**`players.test.ts`** — remove the entire `describe('reducePlayers — LEGACY_SET_PLAYERS', ...)` block (currently lines 6-23, verify with `grep -n "LEGACY_SET_PLAYERS"`) — both its `it(...)` tests, in full.

**`board.test.ts`** — two tests use `{ type: 'LEGACY_SET_PLAYERS', updater: (p) => p }` purely as an example of "a players-only action this board-focused test doesn't own" (proving `reduceBoard`/`describeBoardAction` correctly ignore an action outside their domain — not testing `LEGACY_SET_PLAYERS` itself). Once the type is deleted, these two usages no longer compile. Replace BOTH occurrences with `{ type: 'RESET_PLAYERS', count: 1, names: ['P1'], victoryPointTarget: 10 }` (a real, stable, still-existing players-only action from Task 1 — any valid `PlayersAction` variant satisfies the test's actual intent, this one is picked for having no optional-field ambiguity):
- (currently `board.test.ts:169`, inside `it('returns the same state reference unchanged', ...)`)
- (currently `board.test.ts:220`, inside `it('an action not owned by this reducer returns no banner or sound', ...)`)

Verify both tests still pass with the substitute action and still exercise the same behavior they did before (an action `reduceBoard`/`describeBoardAction` don't recognize, falling through to their own default cases) — do not change either test's actual assertions, only the action literal.

- [ ] **Step 1: Confirm the precondition** — `grep -rn "LEGACY_SET_PLAYERS" catan-3d/src` shows only the 4 locations named above (2 in `players.ts`, 1 describe block in `players.test.ts`, 2 usages in `board.test.ts`). If anything else matches, STOP and report BLOCKED.
- [ ] **Step 2: Make the four deletions/substitutions described above.**
- [ ] **Step 3: Confirm zero remaining matches** — `grep -rn "LEGACY_SET_PLAYERS" catan-3d/src` must now return nothing at all.
- [ ] **Step 4: Typecheck, lint, full test suite** — all three of `npx tsc -b`, `npx eslint src`, `npx vitest run` must be genuinely clean.
- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/game/reducers/board.test.ts
git commit -m "feat: delete LEGACY_SET_PLAYERS — players-slice reducer migration complete"
```

---

## Task 3: Final verification

- [ ] **Step 1:** `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run` — must be clean.
- [ ] **Step 2: Confirm the project-wide completion signal.** `grep -rn "LEGACY_SET_PLAYERS" catan-3d/src` returns zero matches — the entire players-slice reducer migration project (6 sub-plans) is now complete: every `players`-state write in `catan-3d` goes through a typed, tested `PlayersAction` variant, and the temporary bridge introduced in sub-plan 1 no longer exists anywhere in the codebase.
- [ ] **Step 3:** Boot smoke test — start the dev server, confirm it serves HTTP 200 with no console errors, then stop it (no browser automation available in this environment for a full interactive playtest — same limitation every prior sub-plan in this project has recorded). Given this task touches `resetGame`/`restoreFromSnapshot` (new-game and reconnect flows), if the user is available to manually playtest starting a new game and/or reconnecting to a saved match before merge, that would be higher-value coverage than the previous sub-plans' smoke tests — flag this to the user rather than assuming the smoke test alone is sufficient for this particular sub-plan.

No commit for this task (verification only) — proceed straight to the final whole-branch review once Steps 1 and 2 are both clean.
