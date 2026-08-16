# Cities & Knights — Commodities & City Improvements (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cities adjacent to forest/pasture/mountains hexes produce a
commodity alongside their resource when the `citiesAndKnightsCommodities`
house rule is on; players spend commodities climbing 3 city improvement
tracks (Science/Trade/Politics), unlocking a passive ability at level 3
and Metropolis control at level 4/5.

**Architecture:** Pure game-rules logic (cost math, purchase resolution,
Metropolis-holder resolution) lives in new `game/` modules with vitest
coverage, mirroring the existing `game/hiddenTiles.ts` and
`game/trophies.ts` pattern. `App.tsx` wires that logic into the existing
production loop, build-action pipeline, and multiplayer broadcast pattern.
A new `CityImprovementsPanel` HUD component surfaces the tracks; a new
`CommodityIcon` component (inline SVG, mirroring `ResourceIcon`) needs no
new image assets.

**Tech Stack:** React + TypeScript, React Three Fiber, Supabase Realtime
(multiplayer), Vitest.

## Global Constraints

(Copied verbatim from `docs/superpowers/specs/2026-08-15-cities-knights-commodities-design.md`)

- **Placeholder assets first.** Every new visual element ships with
  placeholder art (reused/tinted existing assets, simple icons) before any
  dedicated art is commissioned.
- **Gated asset preloading.** Any new expansion asset preloads only when
  its own house-rule flag is turned on in setup — never a blanket
  module-scope preload. (Phase A adds no new 3D models, so this constraint
  has nothing to bind here — noted for later phases.)
- **Multiplayer sync** for all new state follows the existing pattern:
  round-trip through `MatchSnapshot` as optional fields, broadcast/apply
  split the same way settlements/roads already work.
- **House rules stay independently toggleable** with a sensible default.
- `citiesAndKnightsCommodities: boolean`, default `false`. When turned on
  during setup and `victoryPointTarget` is still at its untouched default
  (`WINNING_SCORE`, 10), pre-fill it to 13.
- Commodity production: Forest→paper, Pasture→cloth, Mountains→coin (cities
  only; settlements unaffected; fields/hills/desert unchanged from base
  game).
- Improvement level cost: level *N* costs *N* matching commodities (1..5).
- Track names, in level order (index 0 = level 1): Science = School,
  Library, Aqueduct, Theater, University. Trade = Market, Trading House,
  Merchant Guild, Bank, Great Exchange. Politics = Town Hall, Embassy,
  Fortress, Courthouse, High Assembly.
- Level 3 abilities: Science — free resource of choice when a roll grants
  no production (not on a 7). Trade — trade 2 identical commodities for
  any 1 other commodity/resource, any time. Politics — promote strong
  knights to mighty (no-op until Phase B).
- Metropolis: level 4 = first-to-reach gets temporary control; level 5 =
  first-to-reach gets permanent control (always outranks a level-4-only
  holder, even if that's a different player). Worth 2 VP on top of the
  city's own 2 VP. Requires a spare city to place it on.

---

### Task 1: Data model — commodities, improvement tracks, Metropolis holder state

**Files:**
- Modify: `catan-3d/src/game/types.ts`
- Test: `catan-3d/src/game/types.test.ts`

**Interfaces:**
- Produces: `CommodityType`, `Commodities`, `ImprovementTrack`,
  `CityImprovements`, `COMMODITY_ORDER`, `COMMODITY_LABELS`,
  `COMMODITY_COLORS`, `COMMODITY_FOR_BIOME`, `COMMODITY_FOR_TRACK`,
  `IMPROVEMENT_TRACK_ORDER`, `IMPROVEMENT_TRACK_LABELS`,
  `IMPROVEMENT_TRACK_NAMES`, `emptyCommodities()`, `emptyCityImprovements()`,
  `Player.commodities`, `Player.cityImprovements`,
  `GameRules.citiesAndKnightsCommodities`, `MetropolisHolders`,
  `getScoreBreakdown`'s new `metropolisHolders` parameter and
  `metropolis` field on `ScoreBreakdown`. All later tasks depend on these
  exact names.

- [ ] **Step 1: Add the commodity and improvement-track types + constants**

Add directly below the existing `RESOURCE_COLORS` block
(`catan-3d/src/game/types.ts:85-91`):

```ts
export type CommodityType = 'paper' | 'cloth' | 'coin'

export type Commodities = Record<CommodityType, number>

export const COMMODITY_ORDER: CommodityType[] = ['paper', 'cloth', 'coin']

export const COMMODITY_LABELS: Record<CommodityType, string> = {
  paper: 'Paper',
  cloth: 'Cloth',
  coin: 'Coin',
}

// Same reasoning as RESOURCE_COLORS: kept as plain hex, not a CSS custom
// property, because Three.js materials can't read those.
export const COMMODITY_COLORS: Record<CommodityType, string> = {
  paper: '#dcd3b0',
  cloth: '#7fae60',
  coin: '#c9a227',
}

// Only 3 of the 5 resource-producing biomes yield a commodity when a city
// collects from them — fields/hills cities just get double the plain
// resource instead (unchanged base-game behavior, see App.tsx's
// production loop). Confirmed against the official Cities & Knights
// rulebook (CN3087) — see the design spec for the full citation.
export const COMMODITY_FOR_BIOME: Partial<Record<Biome, CommodityType>> = {
  forest: 'paper',
  pasture: 'cloth',
  mountains: 'coin',
}

export type ImprovementTrack = 'science' | 'trade' | 'politics'

export type CityImprovements = Record<ImprovementTrack, number> // 0-5 each

export const IMPROVEMENT_TRACK_ORDER: ImprovementTrack[] = ['science', 'trade', 'politics']

export const IMPROVEMENT_TRACK_LABELS: Record<ImprovementTrack, string> = {
  science: 'Science',
  trade: 'Trade',
  politics: 'Politics',
}

// Which commodity spends on which track's improvements.
export const COMMODITY_FOR_TRACK: Record<ImprovementTrack, CommodityType> = {
  science: 'paper',
  trade: 'cloth',
  politics: 'coin',
}

// The building name at each level, confirmed against the physical City
// Improvement board component — index 0 is level 1 (level 0 is the
// unbuilt "Basic City" starting state, which has no name of its own).
export const IMPROVEMENT_TRACK_NAMES: Record<ImprovementTrack, string[]> = {
  science: ['School', 'Library', 'Aqueduct', 'Theater', 'University'],
  trade: ['Market', 'Trading House', 'Merchant Guild', 'Bank', 'Great Exchange'],
  politics: ['Town Hall', 'Embassy', 'Fortress', 'Courthouse', 'High Assembly'],
}
```

- [ ] **Step 2: Add `emptyCommodities`/`emptyCityImprovements` helpers**

Add next to the existing `emptyResources()` (`catan-3d/src/game/types.ts:211-213`):

```ts
export function emptyCommodities(): Commodities {
  return { paper: 0, cloth: 0, coin: 0 }
}

export function emptyCityImprovements(): CityImprovements {
  return { science: 0, trade: 0, politics: 0 }
}
```

- [ ] **Step 3: Add fields to `Player` and `GameRules`, wire into defaults**

In the `Player` interface (`catan-3d/src/game/types.ts:11-24`), add after
`resources: Resources`:

```ts
  commodities: Commodities
  cityImprovements: CityImprovements
```

In `GameRules` (`catan-3d/src/game/types.ts:134-156`), add after
`hiddenTiles`:

```ts
  // Cities adjacent to forest/pasture/mountains hexes also produce a
  // commodity; players spend commodities climbing 3 city improvement
  // tracks. See docs/superpowers/specs/2026-08-15-cities-knights-commodities-design.md.
  citiesAndKnightsCommodities: boolean
```

In `DEFAULT_GAME_RULES` (`catan-3d/src/game/types.ts:158-166`), add
`citiesAndKnightsCommodities: false`.

In `createInitialPlayers` (`catan-3d/src/game/types.ts:224-249`), add to
the returned object:

```ts
    commodities: emptyCommodities(),
    cityImprovements: emptyCityImprovements(),
```

- [ ] **Step 4: Extend `getScoreBreakdown`/`getPlayerScore`/`getPublicScore` with Metropolis VP**

Metropolis control is NOT stored on `Player` — it's a single contested
slot per track, same shape as this file's own `longestRoadHolderId`/
`largestArmyHolderId` pattern (App-level state, not a Player field). This
step only adds the *type* for that state and threads it through the score
functions; the state itself is created in Task 6.

Add near `ScoreBreakdown` (`catan-3d/src/game/types.ts:262-269`):

```ts
export type MetropolisHolders = Record<ImprovementTrack, number | null>
```

Update `ScoreBreakdown` to add `metropolis: number`.

Update `getScoreBreakdown` (`catan-3d/src/game/types.ts:277-301`) to take
a new parameter and compute the field:

```ts
export function getScoreBreakdown(
  player: Player,
  settlements: Record<string, Building>,
  longestRoadHolderId: number | null,
  largestArmyHolderId: number | null,
  metropolisHolders: MetropolisHolders,
): ScoreBreakdown {
  // ...existing settlementCount/cityCount/victoryPointCards/longestRoad/largestArmy logic unchanged...
  const metropolis = IMPROVEMENT_TRACK_ORDER.filter((track) => metropolisHolders[track] === player.id).length * 2
  return {
    settlements: settlementCount,
    cities: cityCount,
    victoryPointCards,
    longestRoad,
    largestArmy,
    metropolis,
    total: settlementCount + cityCount * 2 + victoryPointCards + longestRoad + largestArmy + metropolis,
  }
}
```

Update `getPlayerScore` and `getPublicScore`
(`catan-3d/src/game/types.ts:303-326`) to accept and forward the same
`metropolisHolders` parameter to `getScoreBreakdown`. **This changes the
signature of 3 exported functions used throughout `App.tsx` — every call
site needs the new argument added in Task 6, not this task.** Task 6 is
responsible for updating every call site; until then the project will not
typecheck, which is expected and resolved within the same
implementer/reviewer loop as Task 6 (do not attempt to make Task 1
typecheck in isolation by inventing a default value — pass the real
`metropolisHolders` state through, added in Task 6).

- [ ] **Step 5: Write tests**

In `catan-3d/src/game/types.test.ts`, add (matching the file's existing
style — check the top of the file for its import/describe conventions
before adding):

```ts
describe('emptyCommodities', () => {
  it('returns all three commodities at zero', () => {
    expect(emptyCommodities()).toEqual({ paper: 0, cloth: 0, coin: 0 })
  })
})

describe('getScoreBreakdown metropolis VP', () => {
  it('adds 2 VP per track the player holds the Metropolis for', () => {
    const player = { ...basePlayer, id: 1 }
    const holders: MetropolisHolders = { science: 1, trade: 1, politics: 2 }
    const breakdown = getScoreBreakdown(player, {}, null, null, holders)
    expect(breakdown.metropolis).toBe(4) // science + trade, not politics
  })

  it('gives 0 metropolis VP when the player holds none', () => {
    const player = { ...basePlayer, id: 1 }
    const holders: MetropolisHolders = { science: null, trade: null, politics: null }
    const breakdown = getScoreBreakdown(player, {}, null, null, holders)
    expect(breakdown.metropolis).toBe(0)
  })
})
```

(`basePlayer` — build a minimal valid `Player` fixture matching whatever
pattern the existing tests in this file already use for constructing a
test player; don't invent a second fixture style.)

- [ ] **Step 6: Run tests, confirm the two new ones pass (others will fail to compile until Task 6 — that's expected, see Step 4)**

Run: `cd catan-3d && npx vitest run src/game/types.test.ts`

Expected: the file will NOT compile cleanly yet, because
`getScoreBreakdown`'s call sites elsewhere in the test file (if any use
the old 4-arg signature) and in `App.tsx` don't pass `metropolisHolders`.
If `types.test.ts` itself has other tests calling `getScoreBreakdown`,
update those call sites' arguments in THIS step (they're in the same
file you're already editing) — pass `{ science: null, trade: null,
politics: null }` for existing tests that don't care about Metropolis.
`App.tsx`'s call sites are Task 6's responsibility, not this one.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/types.ts catan-3d/src/game/types.test.ts
git commit -m "feat: add commodity and city improvement types to the game model"
```

---

### Task 2: Pure city-improvement purchase logic

**Files:**
- Create: `catan-3d/src/game/cityImprovements.ts`
- Test: `catan-3d/src/game/cityImprovements.test.ts`

**Interfaces:**
- Consumes: `CommodityType`, `Commodities`, `ImprovementTrack`,
  `CityImprovements`, `COMMODITY_FOR_TRACK` (Task 1).
- Produces: `improvementLevelCost(level)`, `canAffordImprovement(...)`,
  `buyImprovementLevel(...)`, `metropolisHolderAfterPurchase(...)` — Task 6
  calls all four of these.

- [ ] **Step 1: Write the failing tests**

Create `catan-3d/src/game/cityImprovements.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  improvementLevelCost,
  canAffordImprovement,
  buyImprovementLevel,
  metropolisHolderAfterPurchase,
} from './cityImprovements'
import { emptyCommodities } from './types'

describe('improvementLevelCost', () => {
  it('costs N commodities to reach level N', () => {
    expect(improvementLevelCost(1)).toBe(1)
    expect(improvementLevelCost(2)).toBe(2)
    expect(improvementLevelCost(5)).toBe(5)
  })
})

describe('canAffordImprovement', () => {
  it('is true when the player has enough of the matching commodity for the next level', () => {
    const commodities = { ...emptyCommodities(), paper: 2 }
    expect(canAffordImprovement(commodities, 'science', 1)).toBe(true) // level 1->2 costs 2
  })

  it('is false when short on the matching commodity', () => {
    const commodities = { ...emptyCommodities(), paper: 1 }
    expect(canAffordImprovement(commodities, 'science', 1)).toBe(false) // needs 2
  })

  it('is false at max level (5)', () => {
    const commodities = { ...emptyCommodities(), paper: 99 }
    expect(canAffordImprovement(commodities, 'science', 5)).toBe(false)
  })

  it('checks the correct commodity per track', () => {
    const commodities = { ...emptyCommodities(), cloth: 1 }
    expect(canAffordImprovement(commodities, 'trade', 0)).toBe(true) // level 0->1 costs 1 cloth
    expect(canAffordImprovement(commodities, 'science', 0)).toBe(false) // has no paper
  })
})

describe('buyImprovementLevel', () => {
  it('deducts the cost and increments the level', () => {
    const commodities = { ...emptyCommodities(), coin: 3 }
    const cityImprovements = { science: 0, trade: 0, politics: 2 }
    const result = buyImprovementLevel(commodities, cityImprovements, 'politics')
    expect(result.commodities.coin).toBe(0) // 3 - 3 (level 2->3 costs 3)
    expect(result.cityImprovements.politics).toBe(3)
  })

  it('does not mutate the inputs', () => {
    const commodities = { ...emptyCommodities(), paper: 1 }
    const cityImprovements = { science: 0, trade: 0, politics: 0 }
    buyImprovementLevel(commodities, cityImprovements, 'science')
    expect(commodities.paper).toBe(1)
    expect(cityImprovements.science).toBe(0)
  })

  it('leaves other tracks and other commodities untouched', () => {
    const commodities = { paper: 1, cloth: 5, coin: 5 }
    const cityImprovements = { science: 0, trade: 2, politics: 4 }
    const result = buyImprovementLevel(commodities, cityImprovements, 'science')
    expect(result.commodities).toEqual({ paper: 0, cloth: 5, coin: 5 })
    expect(result.cityImprovements).toEqual({ science: 1, trade: 2, politics: 4 })
  })
})

describe('metropolisHolderAfterPurchase', () => {
  it('a first-ever level-4 purchase claims the (previously unclaimed) metropolis', () => {
    expect(metropolisHolderAfterPurchase(null, 0, /* buyerId */ 3, /* newLevel */ 4)).toBe(3)
  })

  it('a purchase below level 4 never changes the holder', () => {
    expect(metropolisHolderAfterPurchase(null, 0, 3, 3)).toBe(null)
    expect(metropolisHolderAfterPurchase(1, 4, 3, 3)).toBe(1)
  })

  it('a second player reaching level 4 does NOT displace the existing level-4 holder', () => {
    expect(metropolisHolderAfterPurchase(1, 4, /* buyerId */ 2, /* newLevel */ 4)).toBe(1)
  })

  it('a different player reaching level 5 takes over from a level-4-only holder', () => {
    expect(metropolisHolderAfterPurchase(1, 4, /* buyerId */ 2, /* newLevel */ 5)).toBe(2)
  })

  it('the existing level-4 holder reaching level 5 themselves keeps control (now permanent)', () => {
    expect(metropolisHolderAfterPurchase(1, 4, /* buyerId */ 1, /* newLevel */ 5)).toBe(1)
  })

  it('a second player reaching level 5 does NOT displace an existing level-5 holder', () => {
    expect(metropolisHolderAfterPurchase(1, 5, /* buyerId */ 2, /* newLevel */ 5)).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/cityImprovements.test.ts`
Expected: FAIL with "Cannot find module './cityImprovements'"

- [ ] **Step 3: Implement**

Create `catan-3d/src/game/cityImprovements.ts`:

```ts
import { COMMODITY_FOR_TRACK, type Commodities, type CityImprovements, type ImprovementTrack } from './types'

// Cost to move from level N-1 to level N is N matching commodities —
// confirmed against the physical City Improvement board component (see
// the design spec). Levels run 1-5; level 0 ("Basic City") is free/start.
export function improvementLevelCost(level: number): number {
  return level
}

const MAX_IMPROVEMENT_LEVEL = 5

export function canAffordImprovement(
  commodities: Commodities,
  track: ImprovementTrack,
  currentLevel: number,
): boolean {
  if (currentLevel >= MAX_IMPROVEMENT_LEVEL) return false
  const cost = improvementLevelCost(currentLevel + 1)
  return commodities[COMMODITY_FOR_TRACK[track]] >= cost
}

export function buyImprovementLevel(
  commodities: Commodities,
  cityImprovements: CityImprovements,
  track: ImprovementTrack,
): { commodities: Commodities; cityImprovements: CityImprovements } {
  const currentLevel = cityImprovements[track]
  const cost = improvementLevelCost(currentLevel + 1)
  const commodity = COMMODITY_FOR_TRACK[track]
  return {
    commodities: { ...commodities, [commodity]: commodities[commodity] - cost },
    cityImprovements: { ...cityImprovements, [track]: currentLevel + 1 },
  }
}

// Call immediately after `buyerId` reaches `newLevel` on `track`. Returns
// the metropolis holder for that track AFTER this purchase (unchanged if
// the purchase didn't trigger a control change).
//
// Deliberately NOT "current highest level always wins" (that's
// pickTrophyHolder's rule for Longest Road/Largest Army, game/trophies.ts)
// — official Cities & Knights is arrival-order-based: the first player to
// reach level 4 keeps temporary control even once someone else ALSO
// reaches level 4, and only a level-5 arrival (permanent control) can
// take it from them.
export function metropolisHolderAfterPurchase(
  currentHolderId: number | null,
  currentHolderLevel: number,
  buyerId: number,
  newLevel: number,
): number | null {
  if (newLevel < 4) return currentHolderId
  if (currentHolderId == null) return buyerId
  if (buyerId === currentHolderId) return currentHolderId
  if (newLevel >= 5 && currentHolderLevel < 5) return buyerId
  return currentHolderId
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/cityImprovements.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/game/cityImprovements.ts catan-3d/src/game/cityImprovements.test.ts
git commit -m "feat: add pure city improvement purchase and metropolis-resolution logic"
```

---

### Task 3: Commodity production hook + combined discard threshold

**Files:**
- Modify: `catan-3d/src/App.tsx:1464-1491` (production loop in `applyRollResult`)
- Modify: `catan-3d/src/components/hud/ResourcePanel.tsx`

**Interfaces:**
- Consumes: `COMMODITY_FOR_BIOME`, `Commodities` (Task 1).
- Produces: nothing new consumed by later tasks — this is a leaf
  behavior change.

- [ ] **Step 1: Extend the production loop**

In `App.tsx`, the current loop (lines 1464-1491):

```ts
    setPlayers((prev) => {
      const next = prev.map((p) => ({ ...p, resources: { ...p.resources } }))
      const byId = new Map(next.map((p) => [p.id, p]))

      for (const tile of tiles) {
        if (tile.number !== total) continue
        if (tile.id === robberTileId) continue // blocked by the Robber

        const resource = BIOME_TO_RESOURCE[tile.biome]
        if (!resource) continue

        const vertexIds = graph.tileVertexIds.get(tile.id) ?? []
        for (const vertexId of vertexIds) {
          const building = settlements[vertexId]
          if (!building) continue
          const owner = byId.get(building.ownerId)
          if (!owner) continue

          const amount = building.type === 'city' ? 2 : 1
          owner.resources[resource] += amount
          if (building.type === 'city') {
            messages.push(`${owner.name} city yields ${amount} ${RESOURCE_LABELS[resource]}!`)
          }
        }
      }

      return next
    })
```

Change to (new lines marked):

```ts
    setPlayers((prev) => {
      const next = prev.map((p) => ({ ...p, resources: { ...p.resources }, commodities: { ...p.commodities } })) // CHANGED
      const byId = new Map(next.map((p) => [p.id, p]))

      for (const tile of tiles) {
        if (tile.number !== total) continue
        if (tile.id === robberTileId) continue // blocked by the Robber

        const resource = BIOME_TO_RESOURCE[tile.biome]
        if (!resource) continue

        const commodity = COMMODITY_FOR_BIOME[tile.biome] // NEW

        const vertexIds = graph.tileVertexIds.get(tile.id) ?? []
        for (const vertexId of vertexIds) {
          const building = settlements[vertexId]
          if (!building) continue
          const owner = byId.get(building.ownerId)
          if (!owner) continue

          // NEW: a city on a commodity-producing hex gets 1 resource + 1
          // commodity instead of 2 resource, when the house rule is on.
          // Settlements and fields/hills/desert production are untouched.
          if (building.type === 'city' && gameRules.citiesAndKnightsCommodities && commodity) {
            owner.resources[resource] += 1
            owner.commodities[commodity] += 1
            messages.push(
              `${owner.name} city yields 1 ${RESOURCE_LABELS[resource]} + 1 ${COMMODITY_LABELS[commodity]}!`,
            )
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
    })
```

Add `COMMODITY_FOR_BIOME` and `COMMODITY_LABELS` to the existing
`import { ... } from './game/types'` line at the top of `App.tsx`.

- [ ] **Step 2: Fix the discard-on-7 threshold to include commodities**

Official Cities & Knights counts resource AND commodity cards together
against the 7-card discard threshold ("Each player who has more than 7
cards in hand (resource cards + commodity cards)..." — CN3087). Find the
discard-check logic (search `App.tsx` for `totalResourceCount` — it's used
both in the 7-roll discard trigger and in `ResourcePanel`'s "over 7"
indicator). Every call site that currently computes hand size as
`totalResourceCount(player.resources)` needs to add
`totalResourceCount`-equivalent for commodities when
`gameRules.citiesAndKnightsCommodities` is on. Add a small helper next to
`totalResourceCount` in `game/types.ts`:

```ts
export function totalCommodityCount(commodities: Commodities): number {
  return COMMODITY_ORDER.reduce((sum, commodity) => sum + commodities[commodity], 0)
}
```

Then at each `totalResourceCount(player.resources)` call site relevant to
the discard threshold (the 7-roll `overLimitIds` check, `toggleDiscardSelection`'s
`required` calculation, `confirmDiscard`'s `required` calculation, and
`ResourcePanel`'s `atDiscardRisk`/`handSize`), change to:

```ts
const handSize =
  totalResourceCount(player.resources) +
  (gameRules.citiesAndKnightsCommodities ? totalCommodityCount(player.commodities) : 0)
```

`ResourcePanel` doesn't currently receive `gameRules` — add a
`countsCommodities: boolean` prop (simpler than passing the whole
`GameRules` object into a display component) and a `commodities: Commodities`
prop, computed by its caller in `GameHud.tsx` the same way `resources` is
already passed down.

- [ ] **Step 3: Manual verification (no automated test — App.tsx integration behavior is verified live in this codebase, matching every other production-loop change this session)**

Run: `cd catan-3d && npm run dev`

1. Start a local game, open House Rules, turn on the Commodities & City
   Improvements toggle (added in Task 8 — if Task 8 isn't done yet, set
   `citiesAndKnightsCommodities: true` directly in `DEFAULT_GAME_RULES`
   temporarily to test, then revert).
2. Build a city on a forest, pasture, and mountains hex (one each).
3. Roll each of their numbers in turn (or use whatever dev/debug roll
   override this codebase has, if any — otherwise play until each comes
   up).
4. Confirm: the city grants 1 lumber + 1 paper (forest), 1 wool + 1 cloth
   (pasture), 1 ore + 1 coin (mountains) — not 2 of the plain resource.
5. Build a city on a fields or hills hex, roll its number, confirm it
   still grants 2 grain/2 brick as before (unchanged).
6. Accumulate commodities until hand size > 7, roll a 7, confirm the
   discard requirement counts commodities too.

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `cd catan-3d && npx tsc -b && npx vitest run`
Expected: clean (Task 1's `types.test.ts` additions still pending
`metropolisHolders` wiring from Task 6 — if Task 6 isn't done yet, this is
expected to still fail here; re-run after Task 6).

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/game/types.ts catan-3d/src/components/hud/ResourcePanel.tsx catan-3d/src/components/hud/GameHud.tsx
git commit -m "feat: produce commodities from cities and count them toward the discard threshold"
```

---

### Task 4: Science level-3 free-resource queue

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/components/hud/GameHud.tsx`

**Interfaces:**
- Consumes: `DevCardResourcePicker` (existing, `components/hud/DevCardResourcePicker.tsx`
  — unmodified, reused as-is with `pickCount={1}`).
- Produces: nothing consumed by later tasks.

**Design note carried from planning (not in the original spec, found
while checking the existing dev-card-picker wiring):** the existing
`devCardPicker: DevCardPickerMode | null` state (`App.tsx:259`) is scoped
to "the current turn's player picking for their own dev-card play" —
`resolveDevCardPicker` always resolves against `players[currentPlayerIndex]`
(`App.tsx:2031-2047`), and the picker "is pure local UI state, never
broadcast, so this modal never opens on another client" by design. Science
level 3's ability can trigger for ANY player who got zero production on a
roll — not just whoever's turn it is, and possibly for multiple players
from the same roll. This needs the SAME queue pattern already used for the
discard flow (`discardPlayerIds`/`activeDiscarderId`/`isMyDiscardTurn`,
`App.tsx:283,933-952`), not the single-current-player `devCardPicker`
pattern. The two queues never overlap in practice: discard only triggers
on a 7, Science-3's free resource explicitly excludes a 7 (see
`applyRollResult`'s production loop, Task 3).

- [ ] **Step 1: Add the queue state**

Near `discardPlayerIds` (`App.tsx:283`), add:

```ts
const [scienceFreeResourcePlayerIds, setScienceFreeResourcePlayerIds] = useState<number[]>([])
```

- [ ] **Step 2: Populate the queue after production, in `applyRollResult`**

Right after the `setPlayers(...)` block from Task 3 (still inside
`applyRollResult`, after production resolves and before the function
returns `doublesCount`), add:

```ts
  // Science level 3: a player who received nothing this roll gets 1 free
  // resource of their choice — never on a 7 (a 7 doesn't produce at all,
  // and separately triggers discard, not this).
  if (gameRules.citiesAndKnightsCommodities && total !== 7) {
    const producedTileIds = tiles.filter((t) => t.number === total && t.id !== robberTileId).map((t) => t.id)
    const producingVertexIds = new Set(producedTileIds.flatMap((id) => graph.tileVertexIds.get(id) ?? []))
    const playersWithProduction = new Set(
      [...producingVertexIds].map((vertexId) => settlements[vertexId]?.ownerId).filter((id): id is number => id != null),
    )
    const eligiblePlayerIds = players
      .filter((p) => p.cityImprovements.science >= 3 && !playersWithProduction.has(p.id))
      .map((p) => p.id)
    if (eligiblePlayerIds.length > 0) {
      // Merge, not replace: a player already queued from an earlier
      // unresolved roll must not be silently dropped just because a LATER
      // roll's eligible set doesn't happen to include them again (e.g. they
      // did receive production this time, or simply weren't picked up in
      // this particular filter pass). Reachable in online play whenever a
      // qualifying player doesn't resolve their pick before the next
      // qualifying roll happens to someone else.
      setScienceFreeResourcePlayerIds((prev) => [...new Set([...prev, ...eligiblePlayerIds])])
    }
  }
```

This reads `players`/`settlements`/`graph` from the enclosing closure,
same as the rest of `applyRollResult` already does — no new parameters
needed.

- [ ] **Step 3: Derive the active picker player, mirroring `activeDiscarderId`**

Near `activeDiscarderId` (`App.tsx:947-952`), add:

```ts
const activeScienceFreeResourcePlayerId = onlineInfo
  ? scienceFreeResourcePlayerIds.includes(onlineInfo.localPlayerId)
    ? onlineInfo.localPlayerId
    : null
  : (scienceFreeResourcePlayerIds[0] ?? null)
```

- [ ] **Step 4: Resolve a pick**

Add a resolver function near `resolveDevCardPicker` (`App.tsx:2031`):

```ts
const resolveScienceFreeResource = (resource: ResourceType) => {
  const playerId = activeScienceFreeResourcePlayerId
  if (playerId == null) return
  setPlayers((prev) =>
    prev.map((p) => (p.id === playerId ? { ...p, resources: { ...p.resources, [resource]: p.resources[resource] + 1 } } : p)),
  )
  setScienceFreeResourcePlayerIds((prev) => prev.filter((id) => id !== playerId))
  if (onlineInfo) broadcastScienceFreeResourcePicked({ playerId, resource })
}
```

`broadcastScienceFreeResourcePicked` is added to `useRoomChannel.ts` in
this task — same shape as `broadcastPlentyPlayed` (search for it in
`multiplayer/useRoomChannel.ts` for the exact pattern to copy: a
`ScienceFreeResourcePickedPayload { playerId: number; resource: ResourceType }`
interface, an `onScienceFreeResourcePicked` hook option, and the
broadcast/apply pair). On receipt, the other clients apply the same
resource grant and remove that player from their own local
`scienceFreeResourcePlayerIds` copy — this needs an
`applyScienceFreeResourcePick(playerId, resource)` trusted-apply function
that both the local resolver above AND the broadcast receiver call, same
split pattern as `applyDiscard`/`applySettlementPlacement` elsewhere in
this file.

- [ ] **Step 5: Wire the picker into `GameHud.tsx`**

`GameHud` needs 2 new props: `scienceFreeResourceActive: boolean` (from
`App.tsx`: `activeScienceFreeResourcePlayerId != null`) and
`onResolveScienceFreeResource: (resource: ResourceType) => void`. Render
a second `DevCardResourcePicker` instance (or generalize the existing
render site to pick which mode's copy to show — this repo's existing
`DEV_CARD_PICKER_COPY` map pattern, `GameHud.tsx:20-23`, is the model to
follow: add a case for this new picker rather than hardcoding a second
copy of the JSX block) with `title="Free Resource"`,
`subtitle="Science level 3: choose 1 resource."`, `pickCount={1}`,
`onComplete={(picks) => onResolveScienceFreeResource(picks[0])}`. This
modal and the existing `devCardPicker` modal are mutually exclusive in
practice (a player can't be playing a dev card AND resolving a science
pick in the same instant — the science queue only opens after a roll
resolves, and dev cards are played during the Action phase, not
mid-production) but guard the render with `!devCardPicker &&` anyway for
safety, matching how other modals in this file already guard against
stacking.

- [ ] **Step 6: Manual verification**

Run: `cd catan-3d && npm run dev`

1. With `citiesAndKnightsCommodities` on, get a player to Science level 3
   (set `cityImprovements.science` to 3 directly via a temporary console
   override if Task 5's purchase UI isn't done yet).
2. Roll a number that hex doesn't touch that player's buildings.
3. Confirm the free-resource picker opens for that player (and, in local
   pass-and-play with 2+ qualifying players, opens for each in sequence).
4. Confirm it does NOT open on a roll of 7.
5. In online mode with 2 browser tabs: confirm the picker only opens on
   the qualifying player's OWN tab, not everyone's.

- [ ] **Step 7: Run typecheck/lint/tests**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/hud/GameHud.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: grant Science level 3's free-resource bonus via a per-player queue"
```

---

### Task 5: Commodity icon + City Improvements panel + purchase flow

**Files:**
- Create: `catan-3d/src/components/hud/CommodityIcon.tsx`
- Create: `catan-3d/src/components/hud/CityImprovementsPanel.tsx`
- Modify: `catan-3d/src/components/hud/GameHud.tsx`
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `improvementLevelCost`, `canAffordImprovement`,
  `buyImprovementLevel` (Task 2); `COMMODITY_ORDER`, `COMMODITY_LABELS`,
  `COMMODITY_COLORS`, `IMPROVEMENT_TRACK_ORDER`,
  `IMPROVEMENT_TRACK_LABELS`, `IMPROVEMENT_TRACK_NAMES` (Task 1).
- Produces: `CityImprovementsPanel` (rendered by `GameHud`), a
  `buyCityImprovement: (track: ImprovementTrack) => void` handler in
  `App.tsx` that Task 6 extends with Metropolis resolution.

- [ ] **Step 1: `CommodityIcon` — placeholder, no new image assets**

Create `catan-3d/src/components/hud/CommodityIcon.tsx`, mirroring
`ResourceIcon.tsx`'s exact structure (inline SVG, `fill="currentColor"`,
exhaustiveness-checked switch):

```tsx
import type { CommodityType } from '../../game/types'

// Placeholder geometry, not final art — per this expansion's asset policy
// (docs/superpowers/specs/2026-08-15-cities-knights-commodities-design.md),
// every visual ships as a placeholder before real art is commissioned.
// Mirrors ResourceIcon.tsx's inline-SVG, zero-new-asset approach exactly.
export function CommodityIcon({ commodity, className }: { commodity: CommodityType; className?: string }) {
  switch (commodity) {
    case 'paper':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <rect x="7" y="7" width="10" height="1.5" fill="#0b1a2b" />
          <rect x="7" y="11" width="10" height="1.5" fill="#0b1a2b" />
          <rect x="7" y="15" width="6" height="1.5" fill="#0b1a2b" />
        </svg>
      )
    case 'cloth':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M4 6 Q8 3, 12 6 T20 6 V18 Q16 21, 12 18 T4 18 Z" />
        </svg>
      )
    case 'coin':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.5" fill="#0b1a2b" />
        </svg>
      )
    default: {
      const unhandled: never = commodity
      console.error('[Catan] No icon for commodity type:', unhandled)
      return null
    }
  }
}
```

Before hardcoding `#0b1a2b` for the punched-out inner shape, check
`catan-3d/src/index.css`/`tailwind.config` for whatever this codebase's
actual dark-background token value is (e.g. `--color-board-navy`) and use
that literal hex instead, for consistency with `RESOURCE_COLORS`'s own
"kept as plain hex, mirrors the CSS token" comment convention — the exact
value isn't load-bearing, matching the token is.

- [ ] **Step 2: `CityImprovementsPanel`**

Create `catan-3d/src/components/hud/CityImprovementsPanel.tsx`:

```tsx
import {
  COMMODITY_FOR_TRACK,
  IMPROVEMENT_TRACK_LABELS,
  IMPROVEMENT_TRACK_NAMES,
  IMPROVEMENT_TRACK_ORDER,
  type Commodities,
  type CityImprovements,
  type ImprovementTrack,
} from '../../game/types'
import { canAffordImprovement, improvementLevelCost } from '../../game/cityImprovements'
import { CommodityIcon } from './CommodityIcon'

interface CityImprovementsPanelProps {
  commodities: Commodities
  cityImprovements: CityImprovements
  canBuy: boolean // false when it's not this player's turn/action phase, mirrors other build buttons
  onBuy: (track: ImprovementTrack) => void
}

export function CityImprovementsPanel({ commodities, cityImprovements, canBuy, onBuy }: CityImprovementsPanelProps) {
  return (
    <div className="pointer-events-auto flex w-56 flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <span className="font-body text-[10px] tracking-[0.2em] text-white/60 uppercase">City Improvements</span>
      {IMPROVEMENT_TRACK_ORDER.map((track) => {
        const level = cityImprovements[track]
        const nextName = level < 5 ? IMPROVEMENT_TRACK_NAMES[track][level] : null
        const cost = level < 5 ? improvementLevelCost(level + 1) : null
        const affordable = canBuy && level < 5 && canAffordImprovement(commodities, track, level)
        return (
          <div key={track} className="flex flex-col gap-1 rounded-xl border border-glass-border bg-white/5 p-2">
            <div className="flex items-center justify-between">
              <span className="font-body text-xs text-white/80">{IMPROVEMENT_TRACK_LABELS[track]}</span>
              <span className="font-data text-xs tabular-nums text-gold/80">Lv {level}</span>
            </div>
            {nextName && (
              <button
                type="button"
                disabled={!affordable}
                onClick={() => onBuy(track)}
                className="flex items-center justify-between rounded-full border border-glass-border bg-white/5 px-2.5 py-1 font-body text-[10px] text-white/70 uppercase transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
              >
                <span>{nextName}</span>
                <span className="flex items-center gap-1 font-data text-[10px] text-white/50">
                  {cost}
                  <CommodityIcon commodity={COMMODITY_FOR_TRACK[track]} className="h-3 w-3" />
                </span>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

Metropolis eligibility/claiming is deliberately NOT in this component yet
— Task 6 reconciles how a level-4/5 purchase interacts with "requires a
spare city," and may need to extend this component's props at that point.
Don't invent a `metropolisEligibleTracks`/`onClaimMetropolis` prop pair
here; Task 6 owns that decision.

- [ ] **Step 3: Wire into `GameHud.tsx` and `App.tsx`**

`GameHud` needs new props: `citiesAndKnightsCommodities: boolean` (gate
rendering the whole panel — don't show it when the house rule is off),
`commodities`, `cityImprovements`, `canBuyImprovement: boolean`
(mirroring the existing `canBuyDevCard` derivation pattern —
`App.tsx:971`'s `canInteract`-style checks), `onBuyImprovement`.
Exact placement within `GameHud`'s existing layout (which corner/panel
group it sits in relative to `ResourcePanel`/`BuildingCostsPanel`) is an
implementation-time call — confirm live in the browser once rendered
before finalizing, same as every other HUD placement decision this
session; don't guess-and-lock a position now.

In `App.tsx`, add the purchase handler:

```ts
const buyCityImprovement = (track: ImprovementTrack) => {
  const player = players[currentPlayerIndex]
  if (!canInteract()) return
  // Same "roll before you build/buy" gate every other action in this file
  // already has (buildSettlementRaw, buildRoad, buyDevCard, bankTrade) —
  // without it, leftover commodities from a prior turn let a player buy an
  // improvement the instant their turn starts, before rolling.
  if (!hasRolledThisTurn) {
    warn('Roll the dice before buying a city improvement.')
    return
  }
  if (!canAffordImprovement(player.commodities, track, player.cityImprovements[track])) return

  const { commodities, cityImprovements } = buyImprovementLevel(player.commodities, player.cityImprovements, track)
  setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, commodities, cityImprovements } : p)))
  if (onlineInfo) broadcastCityImprovementPurchased({ playerId: player.id, track, newLevel: cityImprovements[track] })
}
```

`broadcastCityImprovementPurchased` — new function in
`useRoomChannel.ts`, same pattern as `broadcastCityBuilt`
(`multiplayer/useRoomChannel.ts:606-607`): a
`CityImprovementPurchasedPayload { playerId: number; track: ImprovementTrack; newLevel: number }`
interface, `onCityImprovementPurchased` hook option, `channel.on(...)`
receiver wired the same way `CITY_BUILT` is. The receiving client applies
the same `commodities`/`cityImprovements` update via a shared
`applyCityImprovementPurchase(playerId, track)` trusted-apply function
(recomputing the cost locally from `improvementLevelCost` rather than
trusting a cost value over the wire — same trust model as every other
trusted-apply function in this file, which recompute effects from
canonical inputs rather than accepting pre-computed deltas from the
network).

- [ ] **Step 4: Manual verification**

Run: `cd catan-3d && npm run dev`

1. Turn on the house rule, give a player some commodities (via the
   production flow from Task 3, or a temporary console override).
2. Confirm the panel appears (only when the house rule is on) and shows
   correct levels/costs/next-building-names.
3. Buy a level, confirm commodities deduct and the level increments.
4. Confirm the buy button disables when unaffordable or when it's not
   your turn.
5. Online: buy on one tab, confirm the other tab's panel updates.

- [ ] **Step 5: Run typecheck/lint/tests**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/components/hud/CommodityIcon.tsx catan-3d/src/components/hud/CityImprovementsPanel.tsx catan-3d/src/components/hud/GameHud.tsx catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: add the City Improvements panel and purchase flow"
```

---

### Task 6: Metropolis holder state, spare-city gate, and multiplayer sync

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/matchSnapshot.ts`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`
- Modify: `catan-3d/src/components/hud/CityImprovementsPanel.tsx`
- Modify: `catan-3d/src/game/types.ts` (finishes Task 1 Step 4's deferred
  call-site updates)

**Interfaces:**
- Consumes: `metropolisHolderAfterPurchase` (Task 2), `MetropolisHolders`
  (Task 1), `buyCityImprovement` (Task 5).
- Produces: `metropolisHolders: Record<ImprovementTrack, number | null>`
  state and `metropolisVertexIds: Record<ImprovementTrack, string | null>`
  state — Task 7 (visual) reads both.

**Design note carried from planning:** official rules place a Metropolis
"on one of your cities" (CN3087 p.8) — control is per-player, but the
*marker* belongs on one specific city. A player with multiple cities needs
to choose which one, at the moment they cross into level 4/5, and needs at
least one city not already carrying a different track's Metropolis (a
single city CAN hold more than one Metropolis simultaneously per the
official rules — "you may control multiple metropolises... each one must
be placed on a different one of YOUR CITIES," i.e. the constraint is
one-Metropolis-per-city-per-player's-own-set, not one-Metropolis-total-per-city
board-wide — re-read the spec's exact wording before assuming either way
if this feels ambiguous during implementation, and resolve conservatively
toward what CN3087 literally says rather than guessing). This task adds
BOTH the holder-by-player state AND a vertex-level placement state, and a
selection step, rather than assuming a player's city choice is
unambiguous.

- [ ] **Step 1: Add `metropolisHolders` and `metropolisVertexIds` state**

Near `longestRoadHolderId`/`largestArmyHolderId` (`App.tsx:260-261`):

```ts
const [metropolisHolders, setMetropolisHolders] = useState<MetropolisHolders>({ science: null, trade: null, politics: null })
const [metropolisVertexIds, setMetropolisVertexIds] = useState<Record<ImprovementTrack, string | null>>({
  science: null,
  trade: null,
  politics: null,
})
const [pendingMetropolisTrack, setPendingMetropolisTrack] = useState<ImprovementTrack | null>(null)
```

- [ ] **Step 2: Update every `getScoreBreakdown`/`getPlayerScore`/`getPublicScore` call site**

Search `App.tsx` for all 3 function names (per Task 1 Step 4's note, this
was deferred here). Add `metropolisHolders` as the final argument to
every call. There are at least 3 call sites already identified from this
plan's own research (`App.tsx:1050`, `App.tsx:1626`, plus wherever the
post-game scoreboard computes final scores) — search to find all of them,
don't assume this list is exhaustive.

- [ ] **Step 3: Gate the purchase on a spare city, and enter Metropolis-selection mode instead of resolving automatically**

Extend `buyCityImprovement` (Task 5). When the purchase would cross into
level 4 (`cityImprovements[track] === 3` before buying) or level 5
(`=== 4` before buying), first check the player has an eligible city
(one of their own city vertices where `metropolisVertexIds[track] !==`
that vertex — i.e. not already flying this exact track's marker; per the
design note above, a city already holding a DIFFERENT track's Metropolis
is still eligible). If no eligible city exists, block the purchase (same
`warn(...)` pattern used elsewhere in `App.tsx` for a blocked action) —
this is the "may not purchase the level 4/5 improvement without a spare
city" rule from the spec, enforced at spend time, not after.

If eligible, complete the commodity spend and level-up exactly as Task 5
already does, THEN:

```ts
  const newLevel = cityImprovements[track]
  if (newLevel === 4 || newLevel === 5) {
    setPendingMetropolisTrack(track)
    // Selection is resolved by clicking one of the player's own eligible
    // cities — see Step 4. metropolisHolders/metropolisVertexIds don't
    // update until that click resolves.
  }
```

Reflect in `CityImprovementsPanel` (Task 5's component): add a
`pendingMetropolisTrack: ImprovementTrack | null` prop, and when a track
matches it, show "Select a city on the board" instead of (or alongside)
its normal row — the player needs a visible cue that a click is expected.

- [ ] **Step 4: Resolve the city selection via the existing city-upgrade click path**

`buildSettlementRaw` (`App.tsx:1139` onward) already handles "click one of
your own existing buildings" for the settlement→city upgrade case. Add an
early branch at the TOP of this function (before its existing
`canInteract()`/setup checks, since Metropolis selection isn't gated by
"has this player rolled yet" the way building is):

```ts
  if (pendingMetropolisTrack) {
    const track = pendingMetropolisTrack
    const building = settlements[vertexId]
    const player = players[currentPlayerIndex]
    if (!building || building.type !== 'city' || building.ownerId !== player.id) {
      warn('Choose one of your own cities for the Metropolis.')
      return
    }
    if (metropolisVertexIds[track] === vertexId) {
      warn('That city already holds this Metropolis.')
      return
    }
    setMetropolisVertexIds((prev) => ({ ...prev, [track]: vertexId }))
    const currentHolderId = metropolisHolders[track]
    const currentHolderLevel = currentHolderId != null ? (players.find((p) => p.id === currentHolderId)?.cityImprovements[track] ?? 0) : 0
    const nextHolderId = metropolisHolderAfterPurchase(currentHolderId, currentHolderLevel, player.id, player.cityImprovements[track])
    setMetropolisHolders((prev) => ({ ...prev, [track]: nextHolderId }))
    setPendingMetropolisTrack(null)
    if (onlineInfo) broadcastMetropolisClaimed({ track, playerId: nextHolderId!, vertexId })
    return
  }
```

This reuses the exact existing click pipeline (`VertexSlot`'s `onBuild` →
`buildSettlementRaw`) rather than adding a parallel click-target overlay
system — no changes needed to `BoardInteractions.tsx`/`VertexSlot` for
this task.

- [ ] **Step 5: `MatchSnapshot` round-trip**

In `matchSnapshot.ts`, add (near `longestRoadHolderId`):

```ts
metropolisHolders?: MetropolisHolders
metropolisVertexIds?: Record<ImprovementTrack, string | null>
```

In `App.tsx`'s snapshot-save effect (`App.tsx:2351-2388`), add
`metropolisHolders, metropolisVertexIds,` to the object literal and to
that `useEffect`'s dependency array (`pendingMetropolisTrack` is
deliberately NOT persisted — same reasoning as other local-only
in-progress UI state in this file, e.g. `isMovingRobber`; a reconnect
mid-selection just re-prompts on the next eligible purchase instead of
trying to resume an interrupted click). In `restoreFromSnapshot`, add:

```ts
setMetropolisHolders(snapshot.metropolisHolders ?? { science: null, trade: null, politics: null })
setMetropolisVertexIds(snapshot.metropolisVertexIds ?? { science: null, trade: null, politics: null })
```

- [ ] **Step 6: Broadcast + trusted-apply**

Add to `useRoomChannel.ts`:
`MetropolisClaimedPayload { track: ImprovementTrack; playerId: number; vertexId: string }`,
`onMetropolisClaimed` hook option, `broadcastMetropolisClaimed`, receiver
wiring — same pattern as `broadcastCityBuilt`. On receipt, the other
clients call
`setMetropolisVertexIds((prev) => ({ ...prev, [payload.track]: payload.vertexId }))`
and
`setMetropolisHolders((prev) => ({ ...prev, [payload.track]: payload.playerId }))`
directly (trusting the purchasing client's resolution — same trust model
`broadcastTrophyUpdated` already uses for trophy state, since resolving
this correctly depends on knowing every player's current level at the
exact moment of purchase, which only the purchasing client's local state
is guaranteed fresh for at that instant).

**Known, accepted race condition (not fixed in this task):** if two
players on separate clients both cross into level 4 on the SAME track
within the same tiny window — before either's broadcast has propagated —
each resolves `metropolisHolderAfterPurchase` against its own stale local
`metropolisHolders` (both see `null`), so both locally claim it and
broadcast. Because this codebase's multiplayer model is peer broadcast +
trusted-apply with no server-side arbitration (unlike a hypothetical
authoritative backend), the two clients could end up applying those two
broadcasts in different orders and disagree about the final holder. This
is consistent with the existing risk profile of other simultaneous local
actions in this codebase (e.g. two players clicking the same vertex at
once), which this project has not built conflict resolution for either —
treat as an accepted, rare edge case for Phase A rather than a blocker.
If it needs hardening later, the cheap option is routing Metropolis
resolution through `isEffectiveHost` (already used for `MatchSnapshot`
saves) instead of resolving on whichever client happens to cross the
threshold first.

- [ ] **Step 7: Proactively disable the buy button when no spare city exists**

`CityImprovementsPanel`'s `affordable` check (Task 5) only tests
`canAffordImprovement` (commodity cost) — extend it so a purchase that
would cross into level 4 or 5 also requires an eligible city, computed the
same way Step 3's block does, so the button is visibly disabled BEFORE a
click rather than only rejecting after. Pass the player's own city vertex
IDs (derivable from `settlements` — filter to `ownerId === player.id &&
type === 'city'`) and `metropolisVertexIds` into `CityImprovementsPanel`
as new props, and compute `hasSpareCity = ownCityVertexIds.some((id) =>
metropolisVertexIds[track] !== id)` alongside the existing affordability
check for tracks at level 3 or 4.

- [ ] **Step 8: Manual verification**

Run: `cd catan-3d && npm run dev`

1. Get a player to level 4 on a track with only 1 city, confirm the
   purchase completes and prompts for city selection, and clicking that
   city assigns the Metropolis (VP total increases by 2 immediately).
2. Get a player to level 4 with ZERO cities, confirm the purchase itself
   is blocked with a warning (not silently allowed then stuck unable to
   select).
3. Get a SECOND player to level 4 on the SAME track, confirm the first
   player keeps the Metropolis (not displaced).
4. Get the second player to level 5, confirm they now take over —
   including re-prompting THEM for which of their cities gets the marker
   (a fresh `metropolisVertexIds` entry, not silently inheriting the
   first player's old vertex).
5. Online: confirm both tabs agree on holder AND vertex after a change.
6. Reconnect/reload: confirm both survive a snapshot restore.
7. Confirm the buy button is already disabled (not just rejected on
   click) once a player's cities are all already flying that track's
   Metropolis.

- [ ] **Step 9: Run typecheck/lint/tests — this is the point the full suite should be clean**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`

- [ ] **Step 10: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/game/types.ts catan-3d/src/multiplayer/matchSnapshot.ts catan-3d/src/multiplayer/useRoomChannel.ts catan-3d/src/components/hud/CityImprovementsPanel.tsx
git commit -m "feat: resolve, place, and sync Metropolis control across the table"
```

---

### Task 7: Metropolis placeholder visual

**Files:**
- Modify: `catan-3d/src/components/GamePieces.tsx`
- Modify: `catan-3d/src/components/BoardInteractions.tsx`

**Interfaces:**
- Consumes: `metropolisVertexIds` (Task 6).
- Produces: nothing consumed by later tasks (leaf, visual-only).

- [ ] **Step 1: Extend `CityModel` with a placeholder Metropolis marker**

This codebase's cities are pre-textured per-color GLBs with "no runtime
tinting step" (`GamePieces.tsx:29`'s own comment) — so the placeholder
differentiator can't be a material tint without fighting that established
constraint. Use scale-up + a small added marker shape instead, in
`GamePieces.tsx` (`CityMesh`/`CityModel`, lines 104-115):

```tsx
const METROPOLIS_SCALE_MULTIPLIER = 1.3
const METROPOLIS_MARKER_COLOR = '#f4c430' // gold, matches this UI's existing gold accent elsewhere

function CityMesh({ colorToken, isMetropolis }: { colorToken: PlayerColorToken; isMetropolis: boolean }) {
  const instance = useClonedModel(CITY_URLS[colorToken])
  const scale = isMetropolis ? CITY_SCALE * METROPOLIS_SCALE_MULTIPLIER : CITY_SCALE
  return (
    <group>
      <primitive object={instance} position={[0, CITY_HALF_HEIGHT, 0]} scale={scale} />
      {isMetropolis && (
        // Placeholder marker — a simple floating gold cone, not final art.
        // Swap for real Metropolis geometry in a later pass per this
        // expansion's placeholder-first policy.
        <mesh position={[0, CITY_HALF_HEIGHT * 2 + 0.15, 0]} rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[0.08, 0.18, 4]} />
          <meshStandardMaterial color={METROPOLIS_MARKER_COLOR} emissive={METROPOLIS_MARKER_COLOR} emissiveIntensity={0.4} />
        </mesh>
      )}
    </group>
  )
}

export function CityModel({ colorToken, isMetropolis = false }: { colorToken: PlayerColorToken; isMetropolis?: boolean }) {
  return (
    <ModelErrorBoundary label="city model">
      <CityMesh colorToken={colorToken} isMetropolis={isMetropolis} />
    </ModelErrorBoundary>
  )
}
```

- [ ] **Step 2: Thread `isMetropolis` from `BoardInteractions.tsx` down to `CityModel`**

`VertexSlot` (`BoardInteractions.tsx:73-177`) renders `CityModel` at line
119. Add an `isMetropolis: boolean` prop to `VertexSlot` itself, computed
by whichever component renders the list of `VertexSlot`s (search for
where `VertexSlot`'s existing props like `building`/`ownerColorToken` are
populated — likely from `App.tsx` or a board-level component that already
has `metropolisVertexIds` in scope by this point) as:

```ts
const isMetropolis = IMPROVEMENT_TRACK_ORDER.some((track) => metropolisVertexIds[track] === vertex.id)
```

This is a direct vertex-ID lookup against Task 6's `metropolisVertexIds`
state — no ambiguity about which of a player's cities, since that's
exactly what Task 6's selection step already pinned down.

- [ ] **Step 3: Manual verification**

1. Claim a Metropolis (via Task 6's selection flow).
2. Confirm the correct SPECIFIC city (not just "a city owned by that
   player") shows the scaled-up model + gold marker.
3. Confirm a player's other, non-Metropolis cities render normally.

- [ ] **Step 4: Run typecheck/lint/tests**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/components/GamePieces.tsx catan-3d/src/components/BoardInteractions.tsx
git commit -m "feat: render a placeholder visual for Metropolis cities"
```

---

### Task 8: House Rules setup toggle + VP-target pre-fill

**Files:**
- Modify: `catan-3d/src/components/hud/HouseRulesDropdown.tsx`

**Interfaces:**
- Consumes: `GameRules.citiesAndKnightsCommodities` (Task 1).
- Produces: nothing consumed by later tasks (leaf, UI-only).

- [ ] **Step 1: Add the toggle row**

`HouseRulesDropdown.tsx`'s `CHECKBOX_RULES` array (lines 13-19) is exactly
the right shape for this rule (a plain boolean, unlike `hiddenTiles`'
4-way selector) — add an entry:

```ts
{ key: 'citiesAndKnightsCommodities', label: 'Commodities & city improvements' },
```

This automatically renders via the existing `RuleRow`/grid mapping — no
new component needed, matching the file's own comment at lines 10-12
about a 6th checkbox rule dropping "straight into that last cell."

- [ ] **Step 2: VP-target pre-fill on toggle-on**

The checkbox's `onToggle` currently calls `setRule(rule.key, checked)`
generically (`HouseRulesDropdown.tsx:143`). This one rule needs an extra
side effect. Either special-case it in the `onToggle` callback passed to
this specific row, or (cleaner, avoids per-row special-casing in the
generic map) handle it in `setRule` itself:

```ts
const setRule = <K extends keyof GameRules>(key: K, value: GameRules[K]) => {
  if (key === 'citiesAndKnightsCommodities' && value === true && rules.victoryPointTarget === WINNING_SCORE) {
    onChange({ ...rules, citiesAndKnightsCommodities: true, victoryPointTarget: 13 })
    return
  }
  onChange({ ...rules, [key]: value })
}
```

Import `WINNING_SCORE` from `../../game/types` alongside the existing
`GameRules` import. This only pre-fills when the target is still at its
untouched default — a player who already customized `victoryPointTarget`
before toggling this on keeps their own value, per the spec.

- [ ] **Step 3: Manual verification**

Run: `cd catan-3d && npm run dev`

1. Open House Rules, confirm the new row appears, spacing/dividers match
   the other 5 rows (same live-screenshot verification this panel got
   during the Hidden Tiles work).
2. Toggle it on with VP target still at 10, confirm it jumps to 13.
3. Manually set VP target to something else, then toggle the rule off and
   back on, confirm it does NOT get overwritten a second time.

- [ ] **Step 4: Run typecheck/lint/tests**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/components/hud/HouseRulesDropdown.tsx
git commit -m "feat: add the Commodities & City Improvements house rule toggle"
```

---

### Task 9: Trade level 3 — 2:1 commodity trading

**Files:**
- Modify: `catan-3d/src/components/hud/TradeModal.tsx`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `Commodities`, `CommodityType`, `COMMODITY_ORDER`,
  `COMMODITY_LABELS` (Task 1), `CommodityIcon` (Task 5).
- Produces: nothing consumed by later tasks (leaf).

**Found during self-review — this ability has no task anywhere else in
this plan.** The spec's Trade level 3 ability ("trade 2 identical
commodities for any 1 other commodity or resource") applies to ALL 3
commodities once unlocked, not just Trade's own commodity (cloth) — per
the official rulebook text ("Trade: You may trade commodities 2:1 for
resources or other commodities," CN3087 p.8) reaching level 3 on the
Trade track specifically is what unlocks it, but the ability itself
covers any commodity a player holds.

- [ ] **Step 1: Add a `commodities` trade mode to `TradeModal`**

`TradeModal`'s existing `TradeMode = 'bank' | 'player'`
(`TradeModal.tsx:19`) only handles resource-for-resource trades at
port-derived rates. Add a third mode, `'commodity'`, gated on a new prop
`canTradeCommodities: boolean` (true when `player.cityImprovements.trade
>= 3`) — only show the mode-switch button for it when that's true, same
conditional-rendering pattern the whole `citiesAndKnightsCommodities`
house rule already uses elsewhere in this plan.

Extend the props:

```ts
interface TradeModalProps {
  resources: Resources
  rates: Record<ResourceType, number>
  onTrade: (give: ResourceType, receive: ResourceType) => void
  otherPlayers: Player[]
  onProposeTrade: (toPlayerId: number, offerResource: ResourceType, wantResource: ResourceType) => void
  onClose: () => void
  isMyTurn: boolean
  // NEW:
  commodities: Commodities
  canTradeCommodities: boolean
  onTradeCommodity: (give: CommodityType, receive: ResourceType | CommodityType) => void
}
```

Add a `'commodity'` tab (alongside the existing Bank/Player tabs, only
rendered when `canTradeCommodities`) whose body mirrors the existing
'bank' mode's give/receive picker UI, but:
- "Give" options are `COMMODITY_ORDER` (using the new `CommodityIcon`
  from Task 5 instead of `ResourceIcon`), each requiring the player hold
  at least 2 of it (fixed 2:1 rate, no port/rate lookup needed — this
  ability's rate is always exactly 2:1, unlike bank trades which vary by
  port).
- "Receive" options are BOTH `RESOURCE_ORDER` and `COMMODITY_ORDER`
  combined (the rulebook allows trading a commodity for either a resource
  or a different commodity) — render both icon sets in the receive
  picker, visually grouped or separated by a small label so it's clear
  they're two different card types.
- Confirm button calls `onTradeCommodity(give, receive)`, gated on
  `commodities[give] >= 2` and `give !== receive`.

- [ ] **Step 2: Wire the handler in `App.tsx`**

```ts
const tradeCommodity = (give: CommodityType, receive: ResourceType | CommodityType) => {
  if (!canPerformAction()) return
  if (gamePhase !== 'playing' || !hasRolledThisTurn || !isMyTurn) return
  const player = players[currentPlayerIndex]
  if (player.cityImprovements.trade < 3) return
  if (player.commodities[give] < 2) return
  if (give === receive) return

  setPlayers((prev) =>
    prev.map((p) => {
      if (p.id !== player.id) return p
      const commodities = { ...p.commodities, [give]: p.commodities[give] - 2 }
      const isCommodityReceive = (COMMODITY_ORDER as string[]).includes(receive)
      if (isCommodityReceive) {
        const receiveCommodity = receive as CommodityType
        return { ...p, commodities: { ...commodities, [receiveCommodity]: commodities[receiveCommodity] + 1 } }
      }
      const receiveResource = receive as ResourceType
      return { ...p, commodities, resources: { ...p.resources, [receiveResource]: p.resources[receiveResource] + 1 } }
    }),
  )
  if (onlineInfo) broadcastCommodityTraded({ playerId: player.id, give, receive })
}
```

`broadcastCommodityTraded` — new function in `useRoomChannel.ts`, same
pattern as `broadcastCityBuilt`: a
`CommodityTradedPayload { playerId: number; give: CommodityType; receive: ResourceType | CommodityType }`
interface, `onCommodityTraded` hook option, receiver applies the same
mutation via a shared `applyCommodityTrade(playerId, give, receive)`
trusted-apply function (same split as every other action in this plan).

Wire `commodities={player.commodities}`,
`canTradeCommodities={player.cityImprovements.trade >= 3}`,
`onTradeCommodity={tradeCommodity}` into the existing `<TradeModal ...>`
render site (`App.tsx:2564` area, alongside the existing `onTrade={bankTrade}`).

- [ ] **Step 3: Manual verification**

Run: `cd catan-3d && npm run dev`

1. Get a player to Trade level 3, give them 2+ of a commodity.
2. Open Trade, confirm the commodity trade tab appears (and does NOT
   appear for a player below Trade level 3).
3. Trade 2 commodities for a resource, confirm 2:1 deduction and correct
   resource gained.
4. Trade 2 commodities for a DIFFERENT commodity, confirm that works too.
5. Confirm it's blocked outside your own turn / before rolling, matching
   every other trade action's gating.

- [ ] **Step 4: Run typecheck/lint/tests**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/components/hud/TradeModal.tsx catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: add Trade level 3's 2:1 commodity trading ability"
```

---

### Task 10: Commodity cards in the hand + discard selection

**Files:**
- Modify: `catan-3d/src/components/PlayerHand3D.tsx`
- Modify: `catan-3d/src/App.tsx` (wherever `<PlayerHand3D>` is rendered, and `buildCardSlots`'s caller if the count needs to be sourced from `player.commodities`)
- Placeholder art already created (not this task's job): `catan-3d/src/assets/cards/Paper_commodity.png`, `Cloth_commodity.png`, `Coin_commodity.png` — 432×578 RGBA, content fills nearly the entire rounded-rect canvas (verified alpha bbox `(0,0,432,578)` on all 3, i.e. essentially no transparent margin).

**Found during Task 3's review, not in the original spec:** Task 3 made the
discard-required-count commodity-aware, but the actual card-picker
(`PlayerHand3D`) only ever builds selectable cards from `Resources` — a
commodity-heavy over-limit player has no way to select enough cards to
satisfy the requirement, and the auto-discard timeout (which also only
pulls from `Resources`) can leave them permanently stuck over the limit.
This task closes that gap.

**Interfaces:**
- Consumes: `Commodities`, `CommodityType`, `COMMODITY_ORDER` (Task 1).
- Produces: nothing consumed by later tasks (leaf).

- [ ] **Step 1: Verify the placeholder art's actual crop needs before writing any code**

Run the same check this plan's own controller already ran (don't trust
the existing `CARD_ART_CROP_X`/`CARD_ART_CROP_Y`/`CARD_ART_OFFSET_X`/
`CARD_ART_OFFSET_Y` constants' documented comment — it claims ~47-48px
margins on resource art, but direct measurement of the actual shipped
files during planning found near-zero margins on every card checked,
e.g. `Brick_resource.png`'s alpha bbox is `(0,0,427,573)` on a 432×578
canvas, not offset by ~47px). Confirm this yourself:

```python
from PIL import Image
img = Image.open('catan-3d/src/assets/cards/Brick_resource.png')
print(img.split()[-1].getbbox(), img.size)
```

If the existing crop constants don't actually match the resource art's
real margins (they don't, per the above), do NOT apply
`CARD_ART_CROP_X`/`CARD_ART_CROP_Y`/offsets to the 3 new commodity
textures — the new placeholder files already have content filling the
full canvas (verified bbox `(0,0,432,578)`), so they need a plain 1:1 UV
mapping (repeat `(1,1)`, offset `(0,0)`), not the resource-art-specific
crop. Whether to also fix the existing crop application for resource
cards is OUT OF SCOPE for this task — leave `CARD_ART_CROP_X` etc. and
their application to resource/dev cards exactly as they are; only give
the 3 new commodity textures their own (no-op) treatment.

- [ ] **Step 2: Extend `CardKey` and `CARD_ART`**

In `PlayerHand3D.tsx`:

```ts
import paperArt from '../assets/cards/Paper_commodity.png'
import clothArt from '../assets/cards/Cloth_commodity.png'
import coinArt from '../assets/cards/Coin_commodity.png'
import { COMMODITY_ORDER, type CommodityType, type Commodities } from '../game/types'
```

Change `type CardKey = ResourceType | DevCardType` to
`type CardKey = ResourceType | DevCardType | CommodityType`, and add to
`CARD_ART`:

```ts
paper: paperArt,
cloth: clothArt,
coin: coinArt,
```

`loadCardTexture`'s crop/offset application (currently unconditional on
every call) needs to skip the crop for these 3 specifically — the
simplest correct fix per Step 1's finding: give `loadCardTexture` a
second parameter, `applyLegacyCrop: boolean`, defaulting to `true` at
existing call sites (so resource/dev cards keep their current behavior
byte-for-byte unchanged) and pass `false` for the 3 new commodity
textures specifically. Do not change the crop behavior for any existing
card type.

- [ ] **Step 3: Extend `buildCardSlots` to include commodities**

Currently (verify against the live file, this plan's earlier read may be
stale after Tasks 3/4/5/9's edits):

```ts
function buildCardSlots(resources: Resources, devCards: DevCardType[]): CardSlot[] {
  const out: CardSlot[] = []
  for (const resource of RESOURCE_ORDER) {
    for (let i = 0; i < resources[resource]; i++) out.push({ id: `${resource}-${i}`, key: resource })
  }
  for (const dev of DEV_CARD_ORDER) {
    const count = devCards.filter((card) => card === dev).length
    for (let i = 0; i < count; i++) out.push({ id: `${dev}-${i}`, key: dev })
  }
  return out
}
```

Add a `commodities: Commodities` parameter and a loop over
`COMMODITY_ORDER` inserted BETWEEN the resource loop and the dev-card
loop (matching the file's own stated ordering principle: "Resources
first in fixed order, then development cards, so a hand doesn't reshuffle
as counts change" — commodities slot into that same stable-order
convention, resources → commodities → dev cards):

```ts
function buildCardSlots(resources: Resources, commodities: Commodities, devCards: DevCardType[]): CardSlot[] {
  const out: CardSlot[] = []
  for (const resource of RESOURCE_ORDER) {
    for (let i = 0; i < resources[resource]; i++) out.push({ id: `${resource}-${i}`, key: resource })
  }
  for (const commodity of COMMODITY_ORDER) {
    for (let i = 0; i < commodities[commodity]; i++) out.push({ id: `${commodity}-${i}`, key: commodity })
  }
  for (const dev of DEV_CARD_ORDER) {
    const count = devCards.filter((card) => card === dev).length
    for (let i = 0; i < count; i++) out.push({ id: `${dev}-${i}`, key: dev })
  }
  return out
}
```

- [ ] **Step 4: Extend `PlayerHand3D`'s props and discard-selection gate**

Add `commodities: Commodities` to `PlayerHand3DProps` (the inline props
type at the `PlayerHand3D` function signature). Update the
`buildCardSlots` call to pass it through.

Find the discard-selection gate (search for `isResourceCard` in this
file — it currently reads
`const isResourceCard = (RESOURCE_ORDER as readonly CardKey[]).includes(card.key)`
and is used as `onToggleSelect={discardActive && isResourceCard ? ... : undefined}`).
Extend it to also allow commodity cards:

```ts
const isDiscardableCard =
  (RESOURCE_ORDER as readonly CardKey[]).includes(card.key) ||
  (COMMODITY_ORDER as readonly CardKey[]).includes(card.key)
```

and use `isDiscardableCard` in place of `isResourceCard` at the
`onToggleSelect` site. Dev cards remain never-discardable (unchanged).

- [ ] **Step 5: Wire `commodities` through from `App.tsx`**

Find where `<PlayerHand3D>` is rendered in `App.tsx` (it receives
`resources={...}` from the local/viewing player already) and add
`commodities={viewer.commodities}` (or whatever the existing variable
name is for "the player whose hand this is" — match the exact identifier
already used for the adjacent `resources` prop, don't introduce a new
one).

- [ ] **Step 6: Fix the auto-discard timeout to also draw from commodities**

Find the disconnected-player auto-discard timeout logic in `App.tsx`
(same area Task 3 touched for its `required` calculation — search for
`autoDiscardCounts` or the timeout effect that force-discards on a
player's behalf). It currently builds its forced discard selection only
from `Resources`. Extend it so that once a player's resource cards are
exhausted, it continues pulling from `Commodities` (same "pick cards
until the required count is met" logic, just not stopping at resources
alone) — this is the fix that actually prevents a commodity-heavy
disconnected player from getting stuck: previously the timeout could
empty their resources and still leave them over the limit forever.

- [ ] **Step 7: Manual verification**

Run: `cd catan-3d && npm run dev`

1. With the house rule on, get a player to a mix of resources and
   commodities totaling over 7 (e.g. 3 resources + 5 commodities = 8).
2. Roll a 7 (or trigger discard some other way this codebase supports for
   testing).
3. Confirm the hand shows the 3 placeholder commodity cards as physical,
   selectable cards alongside the resource cards.
4. Select a mix of resource AND commodity cards to satisfy the discard
   requirement, confirm it completes correctly.
5. Confirm dev cards remain non-selectable during discard (unchanged
   behavior).
6. If practical to test: let the auto-discard timeout fire on a
   commodity-heavy hand with too few resources, confirm it doesn't get
   stuck (pulls from commodities once resources run out).

- [ ] **Step 8: Run typecheck/lint/tests**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`

- [ ] **Step 9: Commit**

```bash
git add catan-3d/src/components/PlayerHand3D.tsx catan-3d/src/App.tsx catan-3d/src/assets/cards/Paper_commodity.png catan-3d/src/assets/cards/Cloth_commodity.png catan-3d/src/assets/cards/Coin_commodity.png
git commit -m "feat: add commodity cards to the hand and make them discardable"
```
