# Cities & Knights — Barbarian Track & Attacks (Phase C2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Cities & Knights barbarian track, its HUD, attack resolution (pillage/VP/progress-card outcomes), robber activation, the Defender of Catan VP, and a full Taxation implementation, gated behind a new `citiesAndKnightsBarbarians` house rule that hard-requires `citiesAndKnightsKnights`.

**Architecture:** A new pure-logic attack-resolution function in `game/knights.ts` (no React), a new HUD track component, a new attack-resolution modal that reuses this project's established multi-player sequential-queue pattern (`progressCardOverLimitPlayerIds`'s exact shape) for both the losing side's per-player pillage choice and the winning side's tied-draw choice, a new board-overlay Layer component for the pillage target picker (mirroring `KnightLayer`/`RobberLayer`/`MerchantLayer`), and a Taxation implementation distinct from the existing single-victim robber-steal.

**Tech Stack:** React + TypeScript, react-three-fiber/drei (3D board), Vitest (tests), Supabase Realtime (multiplayer broadcast), Supabase (match snapshot persistence).

## Global Constraints

(Copied verbatim from the design spec — every task's requirements implicitly include these.)

- **Placeholder assets first.** No 3D barbarian ship model — the ship exists only as a HUD track marker icon. No new 3D board geometry this phase except the pillage-target picker overlay (which reuses the existing vertex-hitbox pattern, no new geometry either).
- **Multiplayer sync** follows the existing pattern: round-trip through `MatchSnapshot` as optional fields, `?? <default>` normalization in `restoreFromSnapshot`, broadcast/apply split matching every other structural mutation. This project has hit the "forgot the reset case" bug at least 4 times — treat as a standing checklist item every task.
- **House rules stay independently toggleable, with one explicit exception:** `citiesAndKnightsBarbarians` hard-requires `citiesAndKnightsKnights` — enforced in the UI (checkbox disabled unless Knights is on; auto-unchecked if Knights gets turned off while Barbarians is on). Every other flag stays fully independent.
- **Turn-ownership / resolution-authority convention.** Non-deterministic resolution (attack outcome, since it involves per-player choices) is computed and broadcast by the ROLLING player's own client — the same authority model this codebase already uses for progress-card draws (`resolveEventDieDraws`'s call site: "roller-only... this client's own local... order decides... broadcast separately"). Every new handler acting on turn state still gets an `isMyTurn`-equivalent guard.
- **Costs/values confirmed against CN3087 (6th edition, catan.com)**, cross-referenced against the actual rulebook's own component art for the barbarian track's length (7 positions) where web sources disagreed.

---

## File Structure

| File | Responsibility |
|---|---|
| `catan-3d/src/game/types.ts` | Modify — new types/constants/fields (Task 1) |
| `catan-3d/src/game/knights.ts` | Modify — attack resolution pure logic (Task 2) |
| `catan-3d/src/game/knights.test.ts` | Modify — tests for the above |
| `catan-3d/src/App.tsx` | Modify — all handler wiring (Tasks 3, 4, 5, 6, 7, 10) |
| `catan-3d/src/multiplayer/useRoomChannel.ts` | Modify — broadcast payload types/senders (Tasks 4, 5) |
| `catan-3d/src/multiplayer/matchSnapshot.ts` | Modify — new snapshot fields (Task 12) |
| `catan-3d/src/components/hud/BarbarianTrackPanel.tsx` | Create — track HUD (Task 8) |
| `catan-3d/src/components/hud/BarbarianAttackModal.tsx` | Create — attack modal + sequencing (Task 5) |
| `catan-3d/src/components/PillageLayer.tsx` | Create — board overlay for city-pillage picker (Task 6) |
| `catan-3d/src/components/hud/VictoryBanner.tsx`, `RankingsPanel.tsx` | Modify — Defender of Catan column (Task 9) |
| `catan-3d/src/components/hud/HouseRulesDropdown.tsx` | Modify — new checkbox with hard dependency (Task 11) |

---

### Task 1: Data Model & Constants

**Files:**
- Modify: `catan-3d/src/game/types.ts`
- Test: `catan-3d/src/game/types.test.ts`

**Interfaces:**
- Produces: `GameRules.citiesAndKnightsBarbarians`, `Player.defenderOfCatanCount`, `ScoreBreakdown.defenderOfCatanVP`, updated `getScoreBreakdown`/`getPlayerScore`/`getPublicScore` signatures (new final parameter `defenderOfCatanCount: number` per player, threaded the same way `merchantHolderId` was threaded in Phase B).

- [ ] **Step 1: Write the failing test**

Add to `catan-3d/src/game/types.test.ts`:

```ts
describe('createInitialPlayers — defenderOfCatanCount', () => {
  it('starts every player at 0 Defender of Catan tokens', () => {
    const players = createInitialPlayers(3)
    for (const player of players) {
      expect(player.defenderOfCatanCount).toBe(0)
    }
  })
})

describe('getScoreBreakdown — defenderOfCatanVP', () => {
  it('counts defenderOfCatanCount as public VP, unmodified', () => {
    const [player] = createInitialPlayers(1)
    player.defenderOfCatanCount = 2
    const breakdown = getScoreBreakdown(player, {}, null, null, { science: null, trade: null, politics: null }, null)
    expect(breakdown.defenderOfCatanVP).toBe(2)
    expect(breakdown.total).toBeGreaterThanOrEqual(2)
    const publicScore = getPublicScore(player, {}, null, null, { science: null, trade: null, politics: null }, null)
    expect(publicScore).toBeGreaterThanOrEqual(2) // NOT subtracted, unlike hidden dev-card VP
  })
})
```

(Add `getPublicScore` to the existing `from './types'` import if not already imported.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/types.test.ts`
Expected: FAIL — `defenderOfCatanCount` doesn't exist, `defenderOfCatanVP` doesn't exist.

- [ ] **Step 3: Add the `GameRules` field**

In `catan-3d/src/game/types.ts`, add to the `GameRules` interface (after `citiesAndKnightsKnights`):

```ts
  // Cities & Knights barbarian track & attacks: unlike every other C&K
  // flag, this one hard-requires citiesAndKnightsKnights — without
  // knights, defender strength is always 0, so every attack would be an
  // unwinnable auto-pillage with no possible defense. Enforced in
  // HouseRulesDropdown.tsx's UI (Task 11), not just documented here. See
  // docs/superpowers/specs/2026-08-18-cities-knights-barbarian-attacks-design.md.
  citiesAndKnightsBarbarians: boolean
```

And in `DEFAULT_GAME_RULES`, add:

```ts
  citiesAndKnightsBarbarians: false,
```

- [ ] **Step 4: Add the `Player` field**

Add to the `Player` interface (after `cityWalls`):

```ts
  // Cumulative, non-transferable Defender of Catan VP count — unlike
  // longestRoadHolderId/largestArmyHolderId (single current holder, can
  // change hands), a token once awarded is never taken back and multiple
  // players can hold one or more. Unlimited (no cap at the physical
  // component count of 6 — confirmed with the user).
  defenderOfCatanCount: number
```

Add `defenderOfCatanCount: 0,` to `createInitialPlayers`'s returned object, alongside the other starting-zero fields.

- [ ] **Step 5: Thread `defenderOfCatanCount` through scoring**

In `catan-3d/src/game/types.ts`, modify `ScoreBreakdown` (add `defenderOfCatanVP: number` field), and `getScoreBreakdown`/`getPlayerScore`/`getPublicScore`. This is the same signature-threading this project has now done 3 times (Metropolis in Phase A, Merchant in Phase B) — the value comes directly from `player.defenderOfCatanCount`, no new parameter needed (unlike `merchantHolderId`, which needed a parameter because Merchant control isn't stored per-player; `defenderOfCatanCount` IS a `Player` field already, so no new function parameter is needed at all):

```ts
export function getScoreBreakdown(
  player: Player,
  settlements: Record<string, Building>,
  longestRoadHolderId: number | null,
  largestArmyHolderId: number | null,
  metropolisHolders: MetropolisHolders,
  merchantHolderId: number | null,
): ScoreBreakdown {
  // ...existing body unchanged until the return...
  return {
    settlements: settlementCount,
    cities: cityCount,
    victoryPointCards,
    longestRoad,
    largestArmy,
    metropolis,
    progressCardVP,
    merchantVP,
    defenderOfCatanVP: player.defenderOfCatanCount,
    total:
      settlementCount + cityCount * 2 + victoryPointCards + longestRoad + largestArmy + metropolis + progressCardVP + merchantVP + player.defenderOfCatanCount,
  }
}
```

`getPlayerScore` and `getPublicScore` need NO signature change (they already just call `getScoreBreakdown` and read `.total`) — `getPublicScore` must NOT subtract `defenderOfCatanVP` (it's face-up/public, same as `progressCardVP`, unlike `victoryPointCards`).

Find every OTHER call site of `getScoreBreakdown`/`getPlayerScore`/`getPublicScore` (grep for these 3 names across `catan-3d/src`) — since none of them need a NEW parameter this time (the value is read directly off the `player` argument they already pass), no call site should need changes. Confirm this by running the typecheck in Step 8 — if any call site DOES break, investigate why before assuming it's expected.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/types.test.ts`
Expected: PASS

- [ ] **Step 7: Typecheck**

Run: `cd catan-3d && npx tsc -b`
Expected: Errors at any `GameRules`/`Player` object literal missing the 2 new required fields (test fixtures). Fix each with `citiesAndKnightsBarbarians: false` / `defenderOfCatanCount: 0`. Do NOT make these fields optional.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/types.ts catan-3d/src/game/types.test.ts
git commit -m "feat: add barbarian house rule and Defender of Catan VP data model"
```

---

### Task 2: Attack Resolution Pure Logic

**Files:**
- Modify: `catan-3d/src/game/knights.ts`
- Modify: `catan-3d/src/game/knights.test.ts`

**Interfaces:**
- Consumes: `Player`, `Building`, `KNIGHT_STRENGTH_VALUE` (from `./types`).
- Produces: `BARBARIAN_TRACK_LENGTH` (constant, `7`), `resolveBarbarianAttack(players, settlements): BarbarianAttackResult`.

- [ ] **Step 1: Write the failing tests**

Add to `catan-3d/src/game/knights.test.ts`:

```ts
import { resolveBarbarianAttack, BARBARIAN_TRACK_LENGTH } from './knights'
import type { Building, KnightPiece, Player } from './types'

function playerWithCities(id: number, cityVertexIds: string[], activeKnights: KnightPiece[] = []): Player {
  const [p] = createInitialPlayers(1)
  return { ...p, id, knightPieces: activeKnights }
}

function settlementsFor(entries: { vertexId: string; ownerId: number; type: 'city' | 'settlement' }[]): Record<string, Building> {
  return Object.fromEntries(entries.map((e) => [e.vertexId, { ownerId: e.ownerId, type: e.type }]))
}

describe('BARBARIAN_TRACK_LENGTH', () => {
  it('is 7, per CN3087\'s own component art', () => {
    expect(BARBARIAN_TRACK_LENGTH).toBe(7)
  })
})

describe('resolveBarbarianAttack', () => {
  it('barbarians win when strictly stronger; weakest non-immune contributor is pillaged', () => {
    const p1 = playerWithCities(1, [], [{ id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'X' }]) // strength 1
    const p2 = playerWithCities(2, [], []) // strength 0 — weakest, has 0 active knights
    const settlements = settlementsFor([
      { vertexId: 'A', ownerId: 1, type: 'city' },
      { vertexId: 'B', ownerId: 2, type: 'city' },
      { vertexId: 'C', ownerId: 2, type: 'city' },
    ])
    const result = resolveBarbarianAttack([p1, p2], settlements)
    expect(result.barbarianStrength).toBe(3)
    expect(result.defenderStrength).toBe(1)
    expect(result.defendersWin).toBe(false)
    expect(result.pillageTargets).toEqual([{ playerId: 2, eligibleCityVertexIds: ['B', 'C'] }])
    expect(result.winners).toEqual([])
  })

  it('defenders win on a tie; single highest contributor gets the VP', () => {
    const p1 = playerWithCities(1, [], [{ id: 'k1', ownerId: 1, strength: 'mighty', active: true, vertexId: 'X' }]) // 3
    const p2 = playerWithCities(2, [], [{ id: 'k2', ownerId: 2, strength: 'basic', active: true, vertexId: 'Y' }]) // 1
    const settlements = settlementsFor([{ vertexId: 'A', ownerId: 1, type: 'city' }, { vertexId: 'B', ownerId: 1, type: 'city' }, { vertexId: 'C', ownerId: 1, type: 'city' }, { vertexId: 'D', ownerId: 1, type: 'city' }]) // 4 cities === 4 defense? no, defense is 3+1=4, barbarian=4, tie -> defenders win
    const result = resolveBarbarianAttack([p1, p2], settlements)
    expect(result.barbarianStrength).toBe(4)
    expect(result.defenderStrength).toBe(4)
    expect(result.defendersWin).toBe(true)
    expect(result.pillageTargets).toEqual([])
    expect(result.winners).toEqual([{ playerId: 1, tied: false }])
  })

  it('a tie for highest contributor awards no VP — both are marked tied, each draws a card instead', () => {
    const p1 = playerWithCities(1, [], [{ id: 'k1', ownerId: 1, strength: 'strong', active: true, vertexId: 'X' }]) // 2
    const p2 = playerWithCities(2, [], [{ id: 'k2', ownerId: 2, strength: 'strong', active: true, vertexId: 'Y' }]) // 2
    const settlements = settlementsFor([{ vertexId: 'A', ownerId: 1, type: 'city' }]) // barbarian strength 1, defense 4, defenders win easily
    const result = resolveBarbarianAttack([p1, p2], settlements)
    expect(result.defendersWin).toBe(true)
    expect(result.winners).toEqual(
      expect.arrayContaining([
        { playerId: 1, tied: true },
        { playerId: 2, tied: true },
      ]),
    )
  })

  it('inactive knights do not count toward defender strength', () => {
    const p1 = playerWithCities(1, [], [{ id: 'k1', ownerId: 1, strength: 'mighty', active: false, vertexId: 'X' }])
    const settlements = settlementsFor([{ vertexId: 'A', ownerId: 1, type: 'city' }])
    const result = resolveBarbarianAttack([p1], settlements)
    expect(result.defenderStrength).toBe(0)
    expect(result.barbarianStrength).toBe(1)
    expect(result.defendersWin).toBe(false)
  })

  it('a player with 0 active knights automatically counts as lowest, even with cities', () => {
    const p1 = playerWithCities(1, [], [{ id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'X' }])
    const p2 = playerWithCities(2, [], []) // 0 active knights
    const settlements = settlementsFor([
      { vertexId: 'A', ownerId: 1, type: 'city' },
      { vertexId: 'B', ownerId: 2, type: 'city' },
    ])
    const result = resolveBarbarianAttack([p1, p2], settlements)
    expect(result.pillageTargets).toEqual([{ playerId: 2, eligibleCityVertexIds: ['B'] }])
  })

  it('skips a metropolis-only or cityless player when they are the lowest tier, cascading to the next tier', () => {
    // p1: metropolis only, 0 active knights (would be "lowest" but immune).
    // p2: 1 basic active knight (strength 1) — the next-lowest, non-immune, gets pillaged.
    // p3: 1 mighty active knight (strength 3) — strongest defender.
    const p1 = playerWithCities(1, [], [])
    const p2 = playerWithCities(2, [], [{ id: 'k2', ownerId: 2, strength: 'basic', active: true, vertexId: 'Y' }])
    const p3 = playerWithCities(3, [], [{ id: 'k3', ownerId: 3, strength: 'mighty', active: true, vertexId: 'Z' }])
    const settlements = settlementsFor([
      // p1's city has a metropolis marker via a 4th param — since Building
      // doesn't carry metropolis info directly in this module's signature,
      // model metropolis-immunity via metropolisVertexIds instead (see
      // Step 3's exact signature) — this test passes an empty
      // metropolisVertexIds set deliberately and instead gives p1 ZERO
      // cities to exercise the "cityless is also immune" path, since
      // that's simpler to construct than a metropolis fixture and the
      // rule text treats both cases identically ("no cities, or only
      // metropolises").
      { vertexId: 'B', ownerId: 2, type: 'city' },
      { vertexId: 'C', ownerId: 3, type: 'city' },
    ])
    const result = resolveBarbarianAttack([p1, p2, p3], settlements)
    // p1 has 0 cities (immune, skipped even though "lowest" at 0 active knights).
    // p2 is next-lowest among the REMAINING (non-immune) players and is pillaged.
    expect(result.pillageTargets).toEqual([{ playerId: 2, eligibleCityVertexIds: ['B'] }])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/knights.test.ts`
Expected: FAIL — `resolveBarbarianAttack`/`BARBARIAN_TRACK_LENGTH` don't exist.

- [ ] **Step 3: Write the implementation**

Add to `catan-3d/src/game/knights.ts`:

```ts
// CN3087's barbarian track has 7 positions (confirmed against the
// rulebook's own component art, page 3 — web sources disagreed between
// 7 and 8, likely an edition difference). Position 0 is the start;
// reaching position 6 (the 7th position) triggers an attack.
export const BARBARIAN_TRACK_LENGTH = 7

export interface BarbarianPillageTarget {
  playerId: number
  eligibleCityVertexIds: string[]
}

export interface BarbarianAttackWinner {
  playerId: number
  // true when tied for highest — a tied winner draws a progress card
  // instead of receiving the Defender of Catan VP (only a SOLE highest
  // contributor gets the VP).
  tied: boolean
}

export interface BarbarianAttackResult {
  barbarianStrength: number
  defenderStrength: number
  defendersWin: boolean
  // Empty when defenders win.
  pillageTargets: BarbarianPillageTarget[]
  // Empty when barbarians win.
  winners: BarbarianAttackWinner[]
}

// CN3087 pp.11: barbarian strength = total cities (incl. metropolises) on
// the board; defender strength = sum of ACTIVE knight strengths, all
// players. Ties favor defenders.
export function resolveBarbarianAttack(
  players: Player[],
  settlements: Record<string, Building>,
): BarbarianAttackResult {
  const barbarianStrength = Object.values(settlements).filter((b) => b.type === 'city').length

  const activeKnightStrengthByPlayer = new Map<number, number>()
  for (const player of players) {
    const strength = player.knightPieces
      .filter((k) => k.active)
      .reduce((sum, k) => sum + KNIGHT_STRENGTH_VALUE[k.strength], 0)
    activeKnightStrengthByPlayer.set(player.id, strength)
  }
  const defenderStrength = [...activeKnightStrengthByPlayer.values()].reduce((a, b) => a + b, 0)

  const defendersWin = defenderStrength >= barbarianStrength

  if (defendersWin) {
    const maxStrength = Math.max(...activeKnightStrengthByPlayer.values())
    const topContributors = players.filter((p) => activeKnightStrengthByPlayer.get(p.id) === maxStrength)
    const tied = topContributors.length > 1
    return {
      barbarianStrength,
      defenderStrength,
      defendersWin: true,
      pillageTargets: [],
      winners: topContributors.map((p) => ({ playerId: p.id, tied })),
    }
  }

  // Cities owned per player, in a stable vertex-id order (for a
  // deterministic eligible-target list — the actual CHOICE of which one
  // to pillage is the player's own, per the design's UI section).
  const citiesByPlayer = new Map<number, string[]>()
  for (const [vertexId, building] of Object.entries(settlements)) {
    if (building.type !== 'city') continue
    const list = citiesByPlayer.get(building.ownerId)
    if (list) list.push(vertexId)
    else citiesByPlayer.set(building.ownerId, [vertexId])
  }
  for (const list of citiesByPlayer.values()) list.sort()

  // Immune: no cities at all, since a metropolis-only player already has
  // no PILLAGEABLE city either way — this module has no metropolis
  // concept of its own (that lives in cityImprovements.ts / App.tsx's
  // metropolisVertexIds), so "immune" here is simply "no city in
  // citiesByPlayer for this player id" — App.tsx's own metropolis
  // bookkeeping must exclude metropolis vertices from `settlements`
  // entries counted as pillageable before calling this function, OR
  // (simpler, decide during implementation) this function is extended
  // with an explicit metropolisVertexIds param it filters out of
  // citiesByPlayer before use. Confirm the exact call-site shape against
  // App.tsx's real metropolisVertexIds structure before wiring Task 4.
  const strengthTiers = [...new Set([...activeKnightStrengthByPlayer.values()])].sort((a, b) => a - b)

  let pillageTargets: BarbarianPillageTarget[] = []
  for (const tierValue of strengthTiers) {
    const tierPlayerIds = players
      .filter((p) => activeKnightStrengthByPlayer.get(p.id) === tierValue)
      .map((p) => p.id)
    const nonImmune = tierPlayerIds.filter((id) => (citiesByPlayer.get(id)?.length ?? 0) > 0)
    if (nonImmune.length === 0) continue // whole tier immune, move to next tier up
    pillageTargets = nonImmune.map((playerId) => ({
      playerId,
      eligibleCityVertexIds: citiesByPlayer.get(playerId)!,
    }))
    break
  }

  return {
    barbarianStrength,
    defenderStrength,
    defendersWin: false,
    pillageTargets,
    winners: [],
  }
}
```

Note the explicit comment flagging the metropolis-immunity gap this function alone cannot resolve (it only knows about `Building`/`settlements`, not App.tsx's separate `metropolisVertexIds` bookkeeping) — Task 4's wiring must account for this. Do not silently guess at App.tsx's metropolis representation here; the comment is deliberately explicit so Task 4's implementer investigates the real shape before wiring this function's `settlements` argument.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/knights.test.ts`
Expected: PASS. Note the last test ("skips a metropolis-only or cityless player") deliberately uses a CITYLESS player rather than a metropolis fixture, per the reasoning in that test's own comment — this is intentional test-writing pragmatism, not an oversight; a metropolis-specific integration test belongs in Task 4 once the real metropolis wiring is decided.

- [ ] **Step 5: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/game/knights.ts src/game/knights.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/knights.ts catan-3d/src/game/knights.test.ts
git commit -m "feat: add barbarian attack resolution logic"
```

---

### Task 3: Robber Activation Gate

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Produces: `robberActive: boolean` state (starts `false`), wraps the existing 7-roll robber-move-and-steal path.

- [ ] **Step 1: Add the state**

Near the other Cities & Knights App-level state declarations, add:

```tsx
// Cities & Knights robber activation — starts inert (robber behaves as
// base-game: always movable on a rolled 7). Permanently flips true the
// first time a barbarian attack resolves (Task 4), regardless of
// outcome. Until then, a 7 still forces discard but the robber never
// moves and nothing is stolen — CN3087 p.7: "The robber does not
// activate until after it has been placed on the desert following the
// first barbarian attack."
const [robberActive, setRobberActive] = useState(false)
```

- [ ] **Step 2: Find and wrap the existing 7-roll robber trigger**

Run: `cd catan-3d && grep -n "setGamePhase('moveRobber')" src/App.tsx` to find every place a rolled 7 currently arms the robber-move UI (there are several call sites from the existing discard/7-roll flow — from this project's own prior research, at minimum the direct-roll branch and the discard-queue-empty branch).

For EACH of these call sites that are reached via a rolled 7 (not the Chase-Away-the-Robber entry point from Phase C1, which has its own separate `armChaseRobber` guard already and must NOT be touched by this task), wrap the transition to `'moveRobber'` so that when `citiesAndKnightsBarbarians` is on AND `robberActive` is false, the phase instead goes straight back to `'playing'` (or whatever the pre-7-roll phase was) with no robber move — matching "the robber does not move, and you may not steal a card from another player" while still processing the discard step normally. The discard step itself is unaffected — only the robber-move arming is gated. Read each call site's surrounding context before editing, since the exact right point to insert this check depends on whether discard is still pending at that point (find where discard resolution and robber-arming are sequenced, and insert the `robberActive` gate immediately before the specific `setGamePhase('moveRobber')` line, not earlier).

Structure the check as:

```tsx
if (!gameRules.citiesAndKnightsBarbarians || robberActive) {
  setGamePhase('moveRobber')
} else {
  setGamePhase('playing') // or whatever phase was active before the 7 — confirm from context
}
```

If `citiesAndKnightsBarbarians` is off entirely, this must be a complete no-op (robber behaves exactly as it does today) — the `!gameRules.citiesAndKnightsBarbarians ||` half of the condition guarantees this.

- [ ] **Step 3: Verify Taxation and Chase-Away-the-Robber are unaffected by this task**

Do NOT touch `armChaseRobber` (Phase C1) or Taxation's stub (Task 10 of THIS plan) in this task — both have their own separate guards and are out of scope here. Confirm via `grep -n "armChaseRobber\|playTaxation" src/App.tsx` that neither function was touched by your edit.

- [ ] **Step 4: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx`
Expected: clean. `robberActive` will be unused by anything except this task's own read until Task 4 (which sets it to `true`) — that's expected at this point in the plan.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: gate robber movement behind first-barbarian-attack activation"
```

---

### Task 4: Barbarian Ship Advance & Attack Trigger Hookup

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `resolveBarbarianAttack`, `BARBARIAN_TRACK_LENGTH` (from `./game/knights`); `robberActive` state (Task 3).
- Produces: `barbarianTrackPosition: number` state, the `'ship'` event-die face's real behavior, `BarbarianAttackResolvedPayload` broadcast.

- [ ] **Step 1: Add state**

```tsx
// Cities & Knights barbarian ship position on its 7-space track (0-6).
// Advances on each 'ship' event-die face; resets to 0 after every attack.
const [barbarianTrackPosition, setBarbarianTrackPosition] = useState(0)
```

- [ ] **Step 2: Find and extend the event-die resolution block**

Run: `cd catan-3d && grep -n "eventDie !== 'ship'" src/App.tsx` to find the existing progress-card-draw block (currently the ONLY place that branches on the event die's result). Immediately adjacent to it (same enclosing function, before `applyRollResult(total, isDouble, rollerId)` is called — confirm this ordering from the surrounding code, since the design spec requires the barbarian check to resolve before production), add a NEW sibling block:

```tsx
// Cities & Knights barbarian ship — the OTHER 3 event-die faces (a
// 'ship' roll advances the barbarian ship 1 space closer to attacking).
// This was a documented no-op through Phase B and Phase C1
// ("this plan doesn't implement Knights & Barbarians") — this is where
// it becomes real. Gated the same explicit way the progress-card block
// above is: NOT naturally inert when the rule is off, since without this
// guard a 'ship' roll would silently advance shared board state
// (barbarianTrackPosition) even in a game that never opted into this
// house rule.
if (gameRules.citiesAndKnightsBarbarians && eventDie === 'ship') {
  const nextPosition = barbarianTrackPosition + 1
  if (nextPosition >= BARBARIAN_TRACK_LENGTH - 1) {
    // Reached the final position — resolve the attack NOW, roller-only
    // (same authority model as the progress-card draw above: this
    // client's own computation is trusted and broadcast, not
    // independently re-derived by receivers).
    const attackResult = resolveBarbarianAttack(players, settlements)
    const isFirstActivation = !robberActive
    setBarbarianTrackPosition(0)
    if (isFirstActivation) {
      setRobberActive(true)
      // CN3087 p.7: the robber does not activate until after the first
      // barbarian attack — a one-time state transition, announced the
      // same way this project already announces others (e.g. Chase Away
      // the Robber's arm/resolve banners).
      inform('The barbarians have landed — the robber is now active.')
    }
    applyBarbarianAttackResult(attackResult) // Task 5 defines this
    if (onlineInfo) broadcastBarbarianAttackResolved({ result: attackResult, robberActivated: isFirstActivation })
  } else {
    setBarbarianTrackPosition(nextPosition)
    if (onlineInfo) broadcastBarbarianShipAdvanced({ position: nextPosition })
  }
}
```

Note: `applyBarbarianAttackResult` is a function Task 5 will define (the attack-modal sequencing entry point) — for THIS task, stub it as a no-op placeholder:

```tsx
// Task 5 replaces this with the real attack-modal sequencing entry point.
const applyBarbarianAttackResult = (result: BarbarianAttackResult) => {
  console.log('[Catan] Barbarian attack resolved (Task 5 will handle this):', result)
}
```

Place this stub near the other App-level function declarations, before the event-die block that calls it.

- [ ] **Step 3: Broadcast payloads and receive handlers**

In `catan-3d/src/multiplayer/useRoomChannel.ts`, add:

```ts
export interface BarbarianShipAdvancedPayload {
  position: number
}

export interface BarbarianAttackResolvedPayload {
  result: BarbarianAttackResult
  robberActivated: boolean
}
```

(Import `BarbarianAttackResult` from `../game/knights` alongside this file's other game-logic type imports.) Add senders `broadcastBarbarianShipAdvanced`/`broadcastBarbarianAttackResolved` mirroring this file's existing sender pattern (e.g. `broadcastKnightRecruited`), and the corresponding receive-handler entries.

In `App.tsx`, add receive handlers:

```tsx
onBarbarianShipAdvanced: (payload) => {
  setBarbarianTrackPosition(payload.position)
},
onBarbarianAttackResolved: (payload) => {
  setBarbarianTrackPosition(0)
  if (payload.robberActivated) {
    setRobberActive(true)
    inform('The barbarians have landed — the robber is now active.')
  }
  applyBarbarianAttackResult(payload.result)
},
```

- [ ] **Step 4: Reset**

In `resetGame`, add `setBarbarianTrackPosition(0)` and `setRobberActive(false)` alongside the other Cities & Knights resets.

- [ ] **Step 5: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/multiplayer/useRoomChannel.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: wire up the barbarian ship advancing and triggering an attack"
```

---

### Task 5: Attack Modal & Multi-Player Sequencing

**Files:**
- Create: `catan-3d/src/components/hud/BarbarianAttackModal.tsx`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `BarbarianAttackResult`, `BarbarianPillageTarget`, `BarbarianAttackWinner` (from `./game/knights`).
- Produces: replaces Task 4's `applyBarbarianAttackResult` stub with the real sequencing entry point; `pillageQueue: BarbarianPillageTarget[]` and `winnerDrawQueue: number[]` state, mirroring `progressCardOverLimitPlayerIds`'s exact front-of-queue resolution shape.

This is the first UI task for this phase — it establishes the modal shell and sequencing state that Tasks 6-7 build on.

- [ ] **Step 1: Add sequencing state**

```tsx
// Cities & Knights barbarian attack — the CURRENT result being walked
// through (for the modal's headline/strength-comparison display), plus
// two front-of-queue resolution queues, same shape as
// progressCardOverLimitPlayerIds: process queue[0], the resolve handler
// removes it and moves to the next.
const [activeBarbarianAttack, setActiveBarbarianAttack] = useState<BarbarianAttackResult | null>(null)
const [pillageQueue, setPillageQueue] = useState<BarbarianPillageTarget[]>([])
const [winnerDrawQueue, setWinnerDrawQueue] = useState<number[]>([]) // player ids, tied winners only
```

- [ ] **Step 2: Replace Task 4's stub**

Replace the `applyBarbarianAttackResult` stub from Task 4 with:

```tsx
const applyBarbarianAttackResult = (result: BarbarianAttackResult) => {
  setActiveBarbarianAttack(result)
  setPillageQueue(result.pillageTargets)
  if (result.defendersWin) {
    const soleWinner = result.winners.find((w) => !w.tied)
    if (soleWinner) {
      setPlayers((prev) =>
        prev.map((p) => (p.id === soleWinner.playerId ? { ...p, defenderOfCatanCount: p.defenderOfCatanCount + 1 } : p)),
      )
      const winnerPlayer = playerById.get(soleWinner.playerId)
      if (winnerPlayer) inform(`${winnerPlayer.name} is the Defender of Catan! +1 VP.`)
    } else {
      setWinnerDrawQueue(result.winners.map((w) => w.playerId))
    }
  }
  // Every knight on the board becomes inactive, regardless of
  // participation — CN3087 p.11: unconditional, not scoped to only the
  // knights that were actually counted.
  setPlayers((prev) => prev.map((p) => ({ ...p, knightPieces: p.knightPieces.map((k) => ({ ...k, active: false })) })))
}
```

Note: the `setPlayers` call awarding the sole winner's VP and the `setPlayers` call deactivating every knight are 2 SEPARATE calls — React batches them into one re-render, but keep them separate rather than merged into one combined updater, since the deactivation applies unconditionally (both win and lose cases) while the VP award is conditional — merging them would require re-deriving the conditional inside a single updater closure, adding complexity for no benefit.

- [ ] **Step 3: Create the modal shell**

Create `catan-3d/src/components/hud/BarbarianAttackModal.tsx`:

```tsx
import type { BarbarianAttackResult } from '../../game/knights'
import type { Player } from '../../game/types'

export interface BarbarianAttackModalProps {
  result: BarbarianAttackResult
  players: Player[]
  // Non-null while a pillage or draw choice is still pending — the modal
  // shrinks to a small banner in that state (Tasks 6-7 render the actual
  // picker UI as siblings, not inside this component, since one is a
  // board overlay and the other is a deck-choice widget with very
  // different layout needs).
  pendingChoiceLabel: string | null
}

export function BarbarianAttackModal({ result, players, pendingChoiceLabel }: BarbarianAttackModalProps) {
  const outcomeText = result.defendersWin
    ? result.winners.some((w) => w.tied)
      ? 'The knights held — but no single defender stood out. Tied contributors each draw a progress card.'
      : `The knights held! ${players.find((p) => p.id === result.winners[0]?.playerId)?.name ?? 'A player'} is the Defender of Catan.`
    : 'The barbarians are victorious. Catan will be pillaged.'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-2xl border border-glass-border bg-glass p-6 text-center shadow-[0_8px_30px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <h2 className="font-display text-xl text-white">Barbarian Attack!</h2>
        <p className="mt-2 font-body text-sm text-white/70">
          Barbarian strength {result.barbarianStrength} vs. Defender strength {result.defenderStrength}
        </p>
        <p className="mt-4 font-body text-white">{outcomeText}</p>
        {pendingChoiceLabel && (
          <p className="mt-4 font-body text-[11px] uppercase tracking-[0.15em] text-gold">{pendingChoiceLabel}</p>
        )}
      </div>
    </div>
  )
}
```

Check `catan-3d/src/index.css` or an existing modal component (e.g. `TradeOfferPrompt.tsx`) for the actual `font-display`/`font-body`/`text-gold`/`glass-border`/`bg-glass` class names this project uses — match them exactly rather than inventing new ones; the snippet above uses this project's established naming convention as best-known, confirm and correct against a real existing modal component before finalizing.

- [ ] **Step 4: Wire the modal into `App.tsx`'s render**

Render `<BarbarianAttackModal>` when `activeBarbarianAttack != null`, computing `pendingChoiceLabel` from whether `pillageQueue.length > 0` (Task 6's job) or `winnerDrawQueue.length > 0` (Task 7's job) — for THIS task, since neither queue-resolution UI exists yet, just pass `pendingChoiceLabel={null}` and add a temporary "Continue" button that clears `activeBarbarianAttack`/`pillageQueue`/`winnerDrawQueue` entirely (Tasks 6-7 will replace this temporary dismiss button with real per-item resolution). Mark this temporary button clearly:

```tsx
{/* TEMPORARY — Task 6/7 replace this with real pillage/draw resolution UI */}
<button onClick={() => { setActiveBarbarianAttack(null); setPillageQueue([]); setWinnerDrawQueue([]) }}>
  Continue (temporary)
</button>
```

- [ ] **Step 5: Reset**

In `resetGame`, add `setActiveBarbarianAttack(null)`, `setPillageQueue([])`, `setWinnerDrawQueue([])`.

- [ ] **Step 6: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/components/hud/BarbarianAttackModal.tsx`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/hud/BarbarianAttackModal.tsx
git commit -m "feat: add the barbarian attack modal shell and sequencing queues"
```

---

### Task 6: Pillage Target Board Picker

**Files:**
- Create: `catan-3d/src/components/PillageLayer.tsx`
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/components/hud/BarbarianAttackModal.tsx`

**Interfaces:**
- Consumes: `pillageQueue` (Task 5).
- Produces: `handlePillageTargetSelect(vertexId)`, `PillageLayer` component.

- [ ] **Step 1: Create `PillageLayer.tsx`**

Mirror `catan-3d/src/components/KnightLayer.tsx`'s `VertexTarget` sub-component exactly (plain sphere-geometry vertex hitboxes, not `RobberLayer`'s terrain-conforming tile ones, since this targets vertices/cities, not hexes):

```tsx
import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { TILE_HEIGHT, STRUCTURE_ELEVATION } from '../data/hexBoard'
import type { BoardVertex } from '../data/boardGraph'

const PILLAGE_TARGET_COLOR = '#d64545' // same "this is a threat" red RobberLayer uses — reduces a city, a real threat

export interface PillageLayerProps {
  eligibleVertexIds: string[]
  vertexById: Map<string, BoardVertex>
  onSelectVertex: (vertexId: string) => void
}

function PillageTarget({ vertex, onSelect }: { vertex: BoardVertex; onSelect: () => void }) {
  const [hovered, setHovered] = useState(false)
  return (
    <group position={[vertex.x, TILE_HEIGHT / 2 + STRUCTURE_ELEVATION, vertex.z]}>
      <mesh
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(false)
        }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          onSelect()
        }}
      >
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh visible={hovered}>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial color={PILLAGE_TARGET_COLOR} emissive={PILLAGE_TARGET_COLOR} emissiveIntensity={0.8} transparent opacity={0.55} />
      </mesh>
    </group>
  )
}

export function PillageLayer({ eligibleVertexIds, vertexById, onSelectVertex }: PillageLayerProps) {
  return (
    <group>
      {eligibleVertexIds.map((vertexId) => {
        const vertex = vertexById.get(vertexId)
        if (!vertex) return null
        return <PillageTarget key={vertexId} vertex={vertex} onSelect={() => onSelectVertex(vertexId)} />
      })}
    </group>
  )
}
```

- [ ] **Step 2: Add the resolve handler in `App.tsx`**

```tsx
const handlePillageTargetSelect = (vertexId: string) => {
  const current = pillageQueue[0]
  if (!current) return
  if (!current.eligibleCityVertexIds.includes(vertexId)) {
    warn('Not a valid pillage target.')
    return
  }
  const owner = playerById.get(current.playerId)
  setSettlements((prev) => ({ ...prev, [vertexId]: { ownerId: current.playerId, type: 'settlement' } }))
  setPlayers((prev) =>
    prev.map((p) => (p.id === current.playerId ? { ...p, cityWalls: p.cityWalls.filter((v) => v !== vertexId) } : p)),
  )
  if (owner) inform(`${owner.name}'s city was pillaged and reduced to a settlement.`)
  setPillageQueue((prev) => prev.slice(1))
  if (onlineInfo) broadcastPillageResolved({ vertexId, playerId: current.playerId })
}
```

Add `PillageResolvedPayload { vertexId: string; playerId: number }`, sender `broadcastPillageResolved`, and a trusted-apply receive handler `onPillageResolved` mirroring the local resolution's `settlements`/`cityWalls` mutation (NOT the `pillageQueue` mutation — receivers don't have their own copy of that queue to advance, since `pillageQueue` state is not itself synced; each client independently derives its OWN queue from the SAME `BarbarianAttackResolvedPayload` it already received in Task 4, so receivers advance their own local queue the same way `handlePillageTargetSelect` does, just triggered by the broadcast instead of a local click). Structure `onPillageResolved` to call the SAME state-mutation logic `handlePillageTargetSelect` uses (extract a shared `applyPillage(vertexId, playerId)` helper both call) rather than duplicating the `setSettlements`/`setPlayers` calls.

Auto-skip the picker when `current.eligibleCityVertexIds.length === 1` — add this check where `pillageQueue` transitions to a new front-of-queue item (e.g. in a `useEffect` watching `pillageQueue[0]`, or inline where the queue is first populated in `applyBarbarianAttackResult`): if there's exactly one eligible vertex, call `handlePillageTargetSelect` immediately rather than waiting for a click.

- [ ] **Step 3: Wire `PillageLayer` into the render, replace the modal's temporary button**

In `App.tsx`'s JSX, add `<PillageLayer>` as a Canvas sibling (matching `KnightLayer`'s render pattern), rendering only when `pillageQueue.length > 0`:

```tsx
{pillageQueue.length > 0 && (
  <PillageLayer
    eligibleVertexIds={pillageQueue[0].eligibleCityVertexIds}
    vertexById={graph.vertexById}
    onSelectVertex={handlePillageTargetSelect}
  />
)}
```

Update `BarbarianAttackModal`'s `pendingChoiceLabel` computation at its call site to read `pillageQueue.length > 0 ? \`Choose which city to pillage — ${playerById.get(pillageQueue[0].playerId)?.name ?? ''}\` : null` (falling through to Task 7's winner-draw label once that exists). Remove the "Continue (temporary)" button's pillage-related behavior — it should now only fire once BOTH `pillageQueue` and `winnerDrawQueue` are empty (Task 7 adds the second half); for this task alone, gate the temporary button on `pillageQueue.length === 0`.

- [ ] **Step 4: Reset**

No new reset needed — `pillageQueue` is already reset in Task 5's `resetGame` addition.

- [ ] **Step 5: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/components/PillageLayer.tsx src/components/hud/BarbarianAttackModal.tsx`

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/PillageLayer.tsx src/components/hud/BarbarianAttackModal.tsx
git commit -m "feat: wire up the barbarian pillage target picker"
```

---

### Task 7: Tied-Winner Progress Card Deck Picker

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/components/hud/BarbarianAttackModal.tsx`

**Interfaces:**
- Consumes: `winnerDrawQueue` (Task 5); `buildProgressCardDeck`-adjacent deck-draw mechanics already established in `game/progressCards.ts`.

- [ ] **Step 1: Add the resolve handler**

```tsx
const handleBarbarianWinnerDraw = (track: ImprovementTrack) => {
  const playerId = winnerDrawQueue[0]
  if (playerId == null) return
  const deck = progressCardDecks[track]
  const [card, ...rest] = deck
  if (!card) {
    warn('That deck is empty.')
    return
  }
  setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, progressCards: [...p.progressCards, card] } : p)))
  setProgressCardDecks((prev) => ({ ...prev, [track]: rest }))
  const player = playerById.get(playerId)
  if (player) inform(`${player.name} drew a ${PROGRESS_CARD_LABELS[card]} progress card for tying as Defender of Catan.`)
  setWinnerDrawQueue((prev) => prev.slice(1))
  if (onlineInfo) broadcastBarbarianWinnerDrawResolved({ playerId, track, card })
}
```

Add `BarbarianWinnerDrawResolvedPayload { playerId: number; track: ImprovementTrack; card: ProgressCardType }`, sender `broadcastBarbarianWinnerDrawResolved`, and a trusted-apply receive handler mirroring the local mutation (apply the SAME card/track the acting client already resolved — do not re-derive, since deck order is per-client-local/unseeded, same trust model `resolveEventDieDraws`'s own broadcast already establishes elsewhere).

- [ ] **Step 2: Add the picker UI**

Extend `BarbarianAttackModal.tsx`'s props with `winnerDrawActive: boolean` and `onDrawFromTrack: (track: ImprovementTrack) => void`. When `winnerDrawActive`, render 3 buttons (Science/Trade/Politics) instead of the strength-comparison body:

```tsx
{winnerDrawActive && (
  <div className="mt-4 flex justify-center gap-2">
    {IMPROVEMENT_TRACK_ORDER.map((track) => (
      <button
        key={track}
        type="button"
        onClick={() => onDrawFromTrack(track)}
        className="rounded-full border border-glass-border bg-white/5 px-4 py-2 font-body text-sm text-white/80 hover:border-gold/50 hover:text-gold"
      >
        {IMPROVEMENT_TRACK_LABELS[track]}
      </button>
    ))}
  </div>
)}
```

Import `IMPROVEMENT_TRACK_ORDER`, `IMPROVEMENT_TRACK_LABELS` from `../../game/types`.

- [ ] **Step 3: Wire it into `App.tsx`'s render, finish removing the temporary button**

Pass `winnerDrawActive={winnerDrawQueue.length > 0}` and `onDrawFromTrack={handleBarbarianWinnerDraw}` to `<BarbarianAttackModal>`. Update `pendingChoiceLabel` to also cover the winner-draw case: `winnerDrawQueue.length > 0 ? \`${playerById.get(winnerDrawQueue[0])?.name ?? ''} — choose a deck to draw from\` : (pillageQueue.length > 0 ? ... : null)`.

Remove the "Continue (temporary)" button entirely — replace it with a real "Close" button that only renders (and is only clickable) once BOTH `pillageQueue.length === 0 && winnerDrawQueue.length === 0`, at which point it clears `activeBarbarianAttack`.

- [ ] **Step 4: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/components/hud/BarbarianAttackModal.tsx`

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/hud/BarbarianAttackModal.tsx
git commit -m "feat: wire up the tied-winner progress card deck picker"
```

---

### Task 8: Barbarian Track HUD

**Files:**
- Create: `catan-3d/src/components/hud/BarbarianTrackPanel.tsx`
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/components/hud/GameHud.tsx`

**Interfaces:**
- Consumes: `barbarianTrackPosition` (Task 4), `BARBARIAN_TRACK_LENGTH` (Task 2), `resolveBarbarianAttack` (for the live strength preview — called with a NULL/no-op-safe signature on every render, not stored).

- [ ] **Step 1: Create the component**

```tsx
import { BARBARIAN_TRACK_LENGTH, resolveBarbarianAttack } from '../../game/knights'
import type { Building, Player } from '../../game/types'

export interface BarbarianTrackPanelProps {
  position: number // 0 to BARBARIAN_TRACK_LENGTH - 1
  players: Player[]
  settlements: Record<string, Building>
}

export function BarbarianTrackPanel({ position, players, settlements }: BarbarianTrackPanelProps) {
  // Reuses Task 2's resolveBarbarianAttack for the live strength preview
  // rather than re-deriving the same strength math here — the modal
  // (Task 5) and this HUD must never be able to disagree on these two
  // numbers. Called fresh on every render, purely for its two strength
  // totals; its pillage/winner fields are unused here (no attack is
  // actually happening yet).
  const { barbarianStrength, defenderStrength } = resolveBarbarianAttack(players, settlements)
  const eventsUntilAttack = BARBARIAN_TRACK_LENGTH - 1 - position

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1 rounded-2xl border border-glass-border bg-glass px-4 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex gap-1">
        {Array.from({ length: BARBARIAN_TRACK_LENGTH }, (_, i) => {
          const state = i < position ? 'passed' : i === position ? 'current' : 'upcoming'
          const color = state === 'passed' ? '#3fae5a' : state === 'current' ? '#f2c14e' : '#8a4545'
          return (
            <div
              key={i}
              className="flex h-8 w-8 items-center justify-center rounded-md font-body text-xs text-white"
              style={{ backgroundColor: color }}
            >
              {state === 'current' ? '\u{1F6E5}' : i + 1}
            </div>
          )
        })}
      </div>
      <span className="font-body text-[11px] text-white/70">
        Barbarian Strength: {barbarianStrength} · Defenders: {defenderStrength}
      </span>
      <span className="font-body text-[11px] text-white/50">Next attack in {eventsUntilAttack} events</span>
    </div>
  )
}
```

Check an existing HUD component (`ProgressCardsPanel.tsx`/`KnightsPanel.tsx`) for this project's real glass-panel class names before finalizing — the snippet above uses the same convention already confirmed in Task 5's modal, cross-check both agree.

- [ ] **Step 2: Wire it into `GameHud.tsx`/`App.tsx`**

Add `barbarianTrackPosition: number` to `GameHudProps`, thread it from `App.tsx`'s `<GameHud>` call site. Render `<BarbarianTrackPanel>` near the top of `GameHud`'s layout (per the reference mockups reviewed this session, top-center), only when `gameRules.citiesAndKnightsBarbarians` is true:

```tsx
{citiesAndKnightsBarbarians && (
  <BarbarianTrackPanel position={barbarianTrackPosition} players={players} settlements={settlements} />
)}
```

Add `citiesAndKnightsBarbarians: boolean` to `GameHudProps`, threaded from `gameRules.citiesAndKnightsBarbarians` at the `App.tsx` call site (matching how `citiesAndKnightsKnights` is already threaded).

- [ ] **Step 3: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/components/hud/BarbarianTrackPanel.tsx src/components/hud/GameHud.tsx src/App.tsx`

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/components/hud/BarbarianTrackPanel.tsx catan-3d/src/components/hud/GameHud.tsx catan-3d/src/App.tsx
git commit -m "feat: add the barbarian track HUD"
```

---

### Task 9: Defender of Catan Trophy Display

**Files:**
- Modify: `catan-3d/src/components/hud/VictoryBanner.tsx`
- Modify: `catan-3d/src/components/hud/RankingsPanel.tsx`

**Interfaces:**
- Consumes: `player.defenderOfCatanCount` (Task 1).

- [ ] **Step 1: Add a column to `VictoryBanner.tsx`**

`VictoryBanner.tsx` already renders a "Met" (Metropolis) and "Mrch" (Merchant) column, each reading a value out of the `getScoreBreakdown(...)` call already made per player (confirmed: `score: getScoreBreakdown(player, settlements, longestRoadHolderId, largestArmyHolderId, metropolisHolders, merchantHolderId)`). Add a new column reading `score.defenderOfCatanVP`, following the exact same pattern as the existing "Met"/"Mrch" columns (same header cell shape, same per-row cell, labeled e.g. `<span title="Defender of Catan">DoC</span>`). Read the file first to match its exact column-rendering structure (grid template, header row, per-player row) rather than guessing — this file was already read once during this plan's own research and confirmed to have a consistent per-column pattern; follow it exactly, adding one more column of the same shape.

- [ ] **Step 2: Add the same column to `RankingsPanel.tsx`**

Check whether `RankingsPanel.tsx` independently renders a Metropolis/Merchant-style column (Phase C1's own history notes both `VictoryBanner.tsx` AND `RankingsPanel.tsx` threaded `merchantHolderId` through together) — if so, mirror the same addition there. If `RankingsPanel.tsx` doesn't show a comparable per-category breakdown (e.g. if it only shows total score), skip this file and note in the report why no change was needed there.

- [ ] **Step 3: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/components/hud/VictoryBanner.tsx src/components/hud/RankingsPanel.tsx`

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/components/hud/VictoryBanner.tsx catan-3d/src/components/hud/RankingsPanel.tsx
git commit -m "feat: display Defender of Catan VP count in the scoreboard"
```

---

### Task 10: Taxation — Full Implementation

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `robberActive` (Task 3); the existing robber tile-picker UI (`RobberLayer`, `gamePhase === 'moveRobber'`).

Taxation is fully stubbed today ("not yet implemented," per Phase B). It is distinct from BOTH the base-game single-victim robber-steal AND Phase C1's Chase-Away-the-Robber (which reuses that same single-victim flow) — Taxation steals 1 random card from EVERY player with a building on the new hex, not just one.

- [ ] **Step 1: Find Taxation's current stub**

Run: `cd catan-3d && grep -n "taxation" src/App.tsx` to find the current no-op handler.

- [ ] **Step 2: Add the arm handler**

```tsx
const armTaxation = () => {
  if (!canPlayProgressCardNow()) return
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  if (!robberActive) {
    warn('Taxation can only be played after the first barbarian attack.')
    return
  }
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('taxation')) {
    warn('No Taxation card to play.')
    return
  }
  setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'taxation') } : p)))
  setPendingTaxation(player.id)
  setGamePhase('moveRobber')
  inform(`${player.name} played Taxation — choose a hex for the robber.`)
}
```

Add `const [pendingTaxation, setPendingTaxation] = useState<number | null>(null)` state near the other Cities & Knights pending state.

- [ ] **Step 3: Extend the robber tile-resolve path**

Find `moveRobber`'s body (the function `RobberLayer`'s tile click calls). Taxation needs DIFFERENT resolution logic than `moveRobber`'s own single-victim steal — do not modify `moveRobber` itself. Instead, add a leading branch (mirroring how Phase C1's Chase-Away-the-Robber added its OWN tail logic without disturbing the base path) that checks `pendingTaxation` FIRST and, if set, resolves via a new dedicated function instead of falling through to `moveRobber`'s normal body:

```tsx
const moveRobber = (tileId: string) => {
  if (winner) return
  if (gamePhase !== 'moveRobber') return
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  if (pendingTaxation != null) {
    resolveTaxation(tileId)
    return
  }
  // ...existing body unchanged below this point...
```

Add `resolveTaxation`:

```tsx
const resolveTaxation = (tileId: string) => {
  const playerId = pendingTaxation
  if (playerId == null) return
  if (tileId === robberTileId) {
    warn('The Robber must move to a new hex!')
    return
  }
  setRobberTileId(tileId)
  playSfx('robber')
  const vertexIds = graph.tileVertexIds.get(tileId) ?? []
  const victimIds = new Set<number>()
  for (const vertexId of vertexIds) {
    const building = settlements[vertexId]
    if (building) victimIds.add(building.ownerId)
  }
  const steals: { victimId: number; resource: ResourceType | null }[] = []
  setPlayers((prev) => {
    let next = prev
    for (const victimId of victimIds) {
      const victim = next.find((p) => p.id === victimId)
      if (!victim) continue
      const heldResources: ResourceType[] = []
      for (const resource of RESOURCE_ORDER) {
        for (let i = 0; i < victim.resources[resource]; i++) heldResources.push(resource)
      }
      if (heldResources.length === 0) {
        steals.push({ victimId, resource: null })
        continue
      }
      const stolenResource = heldResources[Math.floor(Math.random() * heldResources.length)]
      steals.push({ victimId, resource: stolenResource })
      next = next.map((p) => (p.id === victimId ? { ...p, resources: { ...p.resources, [stolenResource]: p.resources[stolenResource] - 1 } } : p))
    }
    return next
  })
  const tile = tileById.get(tileId)
  const actor = playerById.get(playerId)
  if (tile && actor) inform(`${actor.name} played Taxation on ${BIOME_LABELS[tile.biome]}.`)
  setPendingTaxation(null)
  setGamePhase('playing')
  if (onlineInfo) broadcastTaxationResolved({ playerId, tileId, steals })
}
```

Note: unlike `applyRobberMove`, this reads `player.resources[resource]` and derives `heldResources` inside the `setPlayers` updater to correctly steal from EACH victim's independently-current hand (not a stale pre-update snapshot) — this is intentionally different from copying `applyRobberMove`'s shape verbatim, since that function only ever handles one victim and doesn't need this care.

Add `TaxationResolvedPayload { playerId: number; tileId: string; steals: { victimId: number; resource: ResourceType | null }[] }`, sender `broadcastTaxationResolved`, and a trusted-apply receive handler applying the SAME `steals` array (validate each `resource` against `RESOURCE_ORDER` before using it as an object key, matching `applyRobberMove`'s own existing validation pattern for exactly this reason).

- [ ] **Step 4: Reset**

Add `setPendingTaxation(null)` to `resetGame` and `restoreFromSnapshot`.

- [ ] **Step 5: Wire into `ProgressCardsPanel`**

Remove Taxation from whatever "not yet implemented" list currently gates it; add `taxation: armTaxation` to `playHandlers`.

- [ ] **Step 6: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx`

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: unstub Taxation progress card"
```

---

### Task 11: House Rules Checkbox with Hard Dependency

**Files:**
- Modify: `catan-3d/src/components/hud/HouseRulesDropdown.tsx`

**Interfaces:**
- Consumes: `GameRules.citiesAndKnightsBarbarians` (Task 1).

This is the ONE house rule in the whole project with a hard cross-rule dependency — every other entry in `CHECKBOX_RULES` is fully independent.

- [ ] **Step 1: Add the checkbox entry**

Extend `CHECKBOX_RULES`'s union type and array (after `citiesAndKnightsKnights`):

```tsx
{ key: 'citiesAndKnightsBarbarians', label: 'Barbarian attacks' },
```

- [ ] **Step 2: Add the hard-dependency enforcement**

Read `RuleRow`'s current props (`label`, `checked`, `onToggle`, `showDivider`, and whatever else it declares) and its render body. Add a `disabled?: boolean` prop if one doesn't already exist, rendering the row visually greyed (reduced opacity, `pointer-events-none` or a disabled `onClick`) when true.

In the render loop that maps over `CHECKBOX_RULES`, compute for the `citiesAndKnightsBarbarians` row specifically: `disabled={rule.key === 'citiesAndKnightsBarbarians' && !rules.citiesAndKnightsKnights}`.

In `setRule` (the generic `<K extends keyof GameRules>(key: K, value: GameRules[K]) => void`), add a special case mirroring the existing Commodities-rule side-effect precedent already in this function: when `key === 'citiesAndKnightsKnights'` and `value === false`, ALSO force `citiesAndKnightsBarbarians` to `false` in the same update (auto-uncheck Barbarians if Knights gets turned off while Barbarians is on) — do not leave the game rules in a state where `citiesAndKnightsBarbarians` is true but `citiesAndKnightsKnights` is false, even transiently.

- [ ] **Step 3: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/components/hud/HouseRulesDropdown.tsx`

- [ ] **Step 4: Manual verification**

Dev server: open House Rules, confirm Barbarian attacks starts disabled (Knights defaults off), enabling Knights enables Barbarians' checkbox, disabling Knights again while Barbarians is checked auto-unchecks Barbarians too.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/components/hud/HouseRulesDropdown.tsx
git commit -m "feat: add Barbarian Attacks house rule, hard-dependent on Knights"
```

---

### Task 12: Multiplayer Snapshot Round-Trip

**Files:**
- Modify: `catan-3d/src/multiplayer/matchSnapshot.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `barbarianTrackPosition`, `robberActive` (Task 4/3, App-level state); `Player.defenderOfCatanCount` (Task 1, already part of wholesale `Player[]` serialization).

- [ ] **Step 1: Add top-level snapshot fields**

In `catan-3d/src/multiplayer/matchSnapshot.ts`'s `MatchSnapshot` interface, add (near `merchantTileId`/`merchantHolderId`, same optional-field treatment):

```ts
  barbarianTrackPosition?: number
  robberActive?: boolean
```

- [ ] **Step 2: Restore normalization**

In `App.tsx`'s `restoreFromSnapshot`:

```tsx
setBarbarianTrackPosition(snapshot.barbarianTrackPosition ?? 0)
setRobberActive(snapshot.robberActive ?? false)
```

Add `defenderOfCatanCount: p.defenderOfCatanCount ?? 0,` to the existing `normalizedPlayers` mapping, alongside `knightPieces`/`knightSupply`/`cityWalls`'s own fallbacks from Phase C1's Task 16.

- [ ] **Step 3: Save**

Find where the existing snapshot object literal is constructed (the `useEffect` that calls `saveMatchSnapshot`) and add `barbarianTrackPosition` and `robberActive` to it, alongside the other App-level fields already saved there (e.g. `merchantTileId`).

- [ ] **Step 4: Typecheck**

Run: `cd catan-3d && npx tsc -b`
Expected: clean.

- [ ] **Step 5: Manual verification**

Dev server: start an online game with Barbarians on, advance the track a few event-die ship rolls, refresh (triggers restore), confirm the track position and `robberActive` state survive the reload.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/multiplayer/matchSnapshot.ts catan-3d/src/App.tsx
git commit -m "feat: round-trip barbarian track state through match snapshots"
```

---

## After All Tasks

Once every task above is complete and individually reviewed, this plan's execution skill (subagent-driven-development) runs ONE final whole-branch review, ONE fix wave for its findings, and ONE scoped re-review, per that skill's own process — do not re-derive that process here.
