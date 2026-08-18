# CodeRabbit Findings Fix Report — PR #16 (Knights & City Walls)

Branch: `cities-knights-knights-city-walls`. All 9 findings triaged and approved by the human were fixed directly on this branch (no worktree, no branch switch).

## 1. CRITICAL — Knight starting supply blocked basic→strong promotion forever

- `catan-3d/src/game/types.ts` (~line 122-136): `KNIGHT_STARTING_SUPPLY` changed from `{ basic: 2, strong: 0, mighty: 0 }` to `{ basic: 2, strong: 2, mighty: 2 }`. Rewrote the comment above it to state all 6 tokens (2 of each strength) are available from turn 1, and that recruiting-restricted-to-basic is a separate rule already enforced by `canRecruitKnight` (which only reads/writes `knightSupply.basic`), not something the starting-supply record should also gate.
- `docs/superpowers/specs/2026-08-17-cities-knights-knights-city-walls-design.md` (the `Player.knightSupply` bullet, ~line 98-101): updated the stated starting value to `{ basic: 2, strong: 2, mighty: 2 }` and reworded to match.
- `catan-3d/src/game/types.test.ts` (line 313): asserts `player.knightSupply` equals the `KNIGHT_STARTING_SUPPLY` constant directly, so it auto-updated with no edit needed.
- `catan-3d/src/game/knights.test.ts`: every test that exercises promotion overrides `player.knightSupply` with its own explicit literal after `createInitialPlayers(...)` (e.g. `{ basic: 1, strong: 1, mighty: 1 }`) — none hardcode or depend on the old `{basic:2,strong:0,mighty:0}` starting shape, so no changes were needed there.

## 2. CRITICAL — Treason free placement reused the paid Recruit broadcast (desync)

- `catan-3d/src/multiplayer/useRoomChannel.ts` (~line 347-365): added `isFree: boolean` to `KnightRecruitedPayload`, mirroring `CityWallBuiltPayload.isFree`'s precedent, with a comment explaining why a paid Recruit and Treason's free placement can't share the receiver's unconditional deduct/decrement-basic behavior.
- `catan-3d/src/App.tsx` `onKnightRecruited` receive handler (~line 1782-1800): now branches on `payload.isFree` for the resource deduction (`p.resources` unchanged when free, `deductCost(...)` when paid), and decrements `knightSupply[payload.knight.strength]` instead of hardcoding `.basic`. Since paid Recruit always places a `basic` knight, this single expression is correct for both paths — no separate branch needed for the supply bucket.
- `catan-3d/src/App.tsx` `handleKnightVertexSelect` (~line 4605-4632 Treason branch, ~line 4633-4672 paid Recruit branch): both broadcast call sites updated — Treason's placement now sends `isFree: true`, the paid Recruit path sends `isFree: false`.
- Checked the LOCAL resolution side for the same hardcoded-`.basic` assumption: the Treason branch already correctly decremented `knightSupply[available]` (the actual strength placed) locally; the paid Recruit branch already correctly decremented `.basic` locally (paid recruits are always basic). Neither needed a local-side fix — only the broadcast/receive path had the bug.

## 3. MAJOR — `pendingIntrigueDisplace`/`pendingTreasonPlacement` never reset

- `catan-3d/src/App.tsx` `resetGame` (~line 5846-5859, right after the existing `setChasingRobberKnightId(null)`): added `setPendingIntrigueDisplace(null)` and `setPendingTreasonPlacement(null)`.
- `catan-3d/src/App.tsx` `restoreFromSnapshot` (~line 5982-5995, right after the existing `setPendingDiplomacyRemoval(null)`): added the same two resets.

## 4. MAJOR — `KnightsPanel`'s turn-gate wrongly required Progress Cards on

- `catan-3d/src/components/hud/GameHud.tsx` (~line 664-687): added a new `canPlayKnightActions` predicate that mirrors `canPlayProgressCards`'s exact condition chain (`gamePhase === 'playing' && !isRolling && gameActive && !tradeBlocked && !pickerBlocked && isMyTurn && viewer.id === currentPlayer.id`) but WITHOUT the `citiesAndKnightsProgressCards` requirement.
- `catan-3d/src/components/hud/GameHud.tsx` (~line 803): `KnightsPanel`'s `isMyTurn` prop now receives `canPlayKnightActions` instead of `canPlayProgressCards`.

## 5. MAJOR — `Date.now()`-based knight IDs (new lint violations + collision risk)

- `catan-3d/src/App.tsx` (~line 589-599, near the other pending-knight state): added `knightIdCounterRef = useRef(0)` and a `nextKnightId(playerId)` helper exactly as specified.
- Replaced both call sites: the Treason placement branch (~line 4618) and the paid Recruit branch (~line 4647), both previously `` `knight-${playerId}-${Date.now()}` ``, now call `nextKnightId(playerId)`.
- Verified via grep: zero remaining `` `knight-${playerId}-${Date.now()}` `` occurrences in `src/`.

## 6. MAJOR — `resolveFreeCityWall` duplicated `canBuildCityWall`'s validation

- `catan-3d/src/App.tsx` `resolveFreeCityWall` (~line 4982-5001): replaced the inline ownership/type/no-existing-wall/board-cap checks (including the literal `3`) with a direct call to `canBuildCityWall({ ...player, resources: { ...player.resources, brick: 999 } }, vertexId, settlements, totalWallsOnBoard)` — the same throwaway-resource-override-clone trick `playEngineering`'s `hasEligibleCity` check and `GameHud.tsx`'s `canBuildWallAt` already use. The now-unused local `building` lookup was removed along with the duplicated checks.

## 7. MINOR — 7-roll banner text hardcoded "7 cards"

- `catan-3d/src/App.tsx` (~line 3041, the `inform(...)` call inside the `total === 7` branch): changed `'Rolled 7 — players over 7 cards must discard half.'` to `'Rolled 7 — players over their card limit must discard half.'`. The underlying comparison already used `playerDiscardThreshold(p)` and was untouched — only the banner copy changed.

## 8. MINOR — Wall building not gated on `hasRolledThisTurn`

- `catan-3d/src/components/hud/GameHud.tsx` `canBuildWallAt` (~line 626-638): added `hasRolledThisTurn` to the condition chain, matching `canBuyImprovement`'s shape immediately below it.

## 9. MINOR — Recruit button shown on strong/mighty empty slots

- `catan-3d/src/components/hud/KnightsPanel.tsx` (~line 49-59): the Recruit button's render guard changed from `!slot.knight` to `!slot.knight && slot.strength === 'basic'`, with a short comment explaining why (Recruit always produces a basic knight; showing it on an empty strong/mighty slot — now genuinely reachable after fix #1 — would be misleading).

## Verification

Run from `catan-3d/`:

```
npx tsc -b
```
Clean, no output, exit 0.

```
npx eslint .
```
```
✖ 4 problems (4 errors, 0 warnings)
```
All 4 are the pre-existing `react-hooks/purity` `Math.random()` errors (App.tsx:3378 and :3386 robber-steal victim/resource selection, :5748 restart starting-player index, :6137 reconnect board-reseed) — none of the 2 `Date.now()` knight-id errors remain.

```
npx vitest run
```
```
Test Files  10 passed (10)
     Tests  184 passed (184)
```
184/184 passing — no test needed updating for fix #1 beyond what `KNIGHT_STARTING_SUPPLY` reference auto-picked-up (see finding #1 notes above).

## Concerns / deviations

- None of the 9 fixes required deviating from the prescribed approach. Fix #1's test-suite check turned up no test hardcoding the old `{basic:2,strong:0,mighty:0}` shape outside the `KNIGHT_STARTING_SUPPLY` constant reference itself, so no test edits were needed there (the report above documents that this was checked, not skipped).
- The `docs/superpowers/plans/2026-08-17-cities-knights-knights-city-walls.md` plan file (present locally, untracked) also contains the same old `KNIGHT_STARTING_SUPPLY` text via grep, but the task scoped the doc fix specifically to the `specs/...-design.md` file, so the plan file was left untouched.
- Not committed/pushed yet per instructions — a single commit covering all 9 fixes is queued next, no push.
