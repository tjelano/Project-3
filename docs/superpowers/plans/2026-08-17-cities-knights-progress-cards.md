# Cities & Knights — Progress Cards (Phase B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players draw progress cards from 3 decks (Science/Trade/Politics,
25 unique types) via a new event die rolled alongside the 2 production
dice; cards go into a 4-card-limit hand with per-card Play effects.

**Architecture:** Pure deck/draw-eligibility logic lives in a new
`game/progressCards.ts` (mirrors `game/cityImprovements.ts`'s pattern).
`App.tsx` wires that logic into the existing roll-resolution flow, adds
one App-level state/handler pair per card-effect shape (reusing the
`playMonopoly`/`resolveDevCardPicker`/`applyMonopolyEffect` and
`playRoadBuilding`/`freeRoadsRemaining` patterns exactly where they fit),
and adds a new sibling board-interaction layer (`MerchantLayer.tsx`,
copied from the existing single-purpose `RobberLayer.tsx`) for the
Merchant piece. A new `ProgressCardsPanel` HUD component (separate from
`PlayerHand3D`) surfaces the hand using the real card art already in
`Catan cards/`.

**Tech Stack:** React + TypeScript, React Three Fiber, Supabase Realtime
(multiplayer), Vitest.

## Global Constraints

(Copied verbatim from
`docs/superpowers/specs/2026-08-16-cities-knights-progress-cards-design.md`)

- **Placeholder assets first** for anything without real art yet — but
  all 25 card illustrations already exist (`Catan cards/04..28`,
  processed identically to Phase A's 3 commodity cards: background
  removed, cropped, resized to 432×578), so cards need no placeholder
  step. The event die itself IS a placeholder: a 2D HUD icon, not a new
  3D physics die.
- **Gated asset preloading**: the 25 card textures preload only when
  `citiesAndKnightsProgressCards` is on.
- **Multiplayer sync** for all new state: round-trip through
  `MatchSnapshot` as optional fields, normalized on restore with a
  fallback (empty array / default) — this plan must NOT repeat Phase A's
  Critical-1 gap (required fields left unnormalized on snapshot restore).
- **House rules stay independently toggleable.**
  `citiesAndKnightsProgressCards: boolean`, default `false`, no
  UI-level gating on `citiesAndKnightsCommodities` (verified: no existing
  dependent-checkbox pattern in `HouseRulesDropdown.tsx` to reuse; the
  feature is naturally inert without commodities since no
  `cityImprovements[track]` ever exceeds 0).
- Event die: 6 faces, 3 ship (Phase C, no-op here) + 1 science + 1 trade
  + 1 politics. Rolled with the 2 production dice every turn, resolved
  BEFORE production.
- Draw eligibility: player's `cityImprovements[track] >= 1` AND the red
  die (`d1`, fixed identity) `<= cityImprovements[track] + 1`. Draws
  resolve in turn order starting with the current roller.
- Progress card hand limit: 4 non-VP cards, enforced immediately after a
  draw resolves (not the official "end of Action phase" nuance —
  documented scope cut from the spec).
- 6 knight-dependent cards (Engineering, Smithing, Encouragement,
  Intrigue, Treason, Taxation) are documented no-ops this phase — still
  drawable (real deck odds), Play shows "not yet implemented."
- `ProgressCardType` is a wholly separate type from `DevCardType` — do
  not merge "Road Building" progress card into the existing `roadBuilding`
  dev card type. Use `progressRoadBuilding`.

## Reused Patterns (verified against current code, exact citations)

Later tasks cite these by name — verified via direct code inspection
before this plan was written, not assumed:

- **Announce-a-value-and-collect-from-everyone**: `playMonopoly` →
  `resolveDevCardPicker` → `applyMonopolyEffect` (`App.tsx:2433-2438`,
  `2451-2467`, `643-670`) + `DevCardResourcePicker`
  (`components/hud/DevCardResourcePicker.tsx`) + `PickerMode` union in
  `GameHud.tsx:36` (`DevCardPickerMode | 'scienceFreeResource'`, widened
  again here) + `DEV_CARD_PICKER_COPY` record + broadcast/receive pair in
  `useRoomChannel.ts` (`MonopolyPlayedPayload`, `App.tsx:867-869`).
- **N-free-placements counter**: `freeRoadsRemaining` state
  (`App.tsx:256`) + `applyRoadBuildingPlay` (`App.tsx:613-618`, sets the
  counter) + the `isFreeRoad` branch inside `buildRoadRaw`
  (`App.tsx:1447-1499`) that skips cost/roll checks — board UI
  (`BoardInteractions.tsx`) needs zero changes since it has no cost
  awareness at all.
- **Tile-picker board layer**: `RobberLayer.tsx` (a `tiles.map` of
  per-tile invisible hitbox meshes + `onSelect` callback + a boolean gate
  prop, rendered as a sibling to `BoardInteractions` inside the same
  `<Canvas>`, `App.tsx:2980-2990`) — copy this shape, not parametrize it
  (verified `RobberLayer` hardcodes robber-specific props).
- **Player-target picker UI**: `TradeModal.tsx`'s `otherPlayers.map(...)`
  button row (`TradeModal.tsx:160-184`) — directly reusable UI shape,
  extract to a shared component.
- **Vertex click routing for a special mode**: the `pendingMetropolisClaim`
  branch at the top of `buildSettlementRaw` (`App.tsx:1325-1366`) — checks
  the special mode FIRST, `warn()`s and returns on an ineligible click,
  same `onBuild(vertexId)` entry point every other vertex click already
  uses. No per-vertex highlight prop exists in `BoardInteractions.tsx`
  today (confirmed) — ineligible clicks get a toast, not a disabled
  cursor, matching this codebase's existing Metropolis-claim UX.
- **Nothing existing for "view another player's exact hand and take
  cards from it"** (confirmed absent — robber-steal is random/no-UI, no
  client ever renders a non-local player's hand contents) — tasks needing
  this build it fresh, using the `TradeModal` player-picker pattern above
  for the "pick a player" half.

---

### Task 1: Data model — progress card types, decks, hand, scoring

**Files:**
- Modify: `catan-3d/src/game/types.ts`
- Test: `catan-3d/src/game/types.test.ts`

**Interfaces:**
- Produces: `ProgressCardType`, `PROGRESS_CARD_ORDER`, `PROGRESS_CARD_LABELS`,
  `PROGRESS_CARD_TRACK`, `PROGRESS_CARD_VP_TYPES`,
  `PROGRESS_CARD_DECK_COMPOSITION`, `player.progressCards`,
  `GameRules.citiesAndKnightsProgressCards`, `ScoreBreakdown.progressCardVP`,
  `getScoreBreakdown`'s unchanged signature (no new parameter — computed
  from `player.progressCards` alone, already in scope). All later tasks
  depend on these exact names.

- [ ] **Step 1: Add `ProgressCardType` and lookup tables**

Add directly below the existing `DevCardType` block
(`catan-3d/src/game/types.ts:9`):

```ts
// Deliberately separate from DevCardType — "Road Building" exists as both
// a base-game dev card (roadBuilding) and a Cities & Knights progress
// card with the identical effect but a different acquisition path
// (purchased vs. drawn via the event die). Merging them would corrupt
// devCardsBoughtThisTurn/spendDevCard's existing semantics. Hence
// progressRoadBuilding, not roadBuilding.
export type ProgressCardType =
  | 'alchemy' | 'crane' | 'engineering' | 'invention' | 'irrigation'
  | 'medicine' | 'mining' | 'progressRoadBuilding' | 'smithing' | 'printing'
  | 'commercialHarbor' | 'guildDues' | 'merchant' | 'merchantFleet'
  | 'resourceMonopoly' | 'tradeMonopoly'
  | 'diplomacy' | 'encouragement' | 'espionage' | 'intrigue' | 'sabotage'
  | 'taxation' | 'treason' | 'constitution' | 'wedding'

export const PROGRESS_CARD_ORDER: ProgressCardType[] = [
  'alchemy', 'crane', 'engineering', 'invention', 'irrigation',
  'medicine', 'mining', 'progressRoadBuilding', 'smithing', 'printing',
  'commercialHarbor', 'guildDues', 'merchant', 'merchantFleet',
  'resourceMonopoly', 'tradeMonopoly',
  'diplomacy', 'encouragement', 'espionage', 'intrigue', 'sabotage',
  'taxation', 'treason', 'constitution', 'wedding',
]

export const PROGRESS_CARD_LABELS: Record<ProgressCardType, string> = {
  alchemy: 'Alchemy', crane: 'Crane', engineering: 'Engineering',
  invention: 'Invention', irrigation: 'Irrigation', medicine: 'Medicine',
  mining: 'Mining', progressRoadBuilding: 'Road Building', smithing: 'Smithing',
  printing: 'Printing',
  commercialHarbor: 'Commercial Harbor', guildDues: 'Guild Dues',
  merchant: 'Merchant', merchantFleet: 'Merchant Fleet',
  resourceMonopoly: 'Resource Monopoly', tradeMonopoly: 'Trade Monopoly',
  diplomacy: 'Diplomacy', encouragement: 'Encouragement', espionage: 'Espionage',
  intrigue: 'Intrigue', sabotage: 'Sabotage', taxation: 'Taxation',
  treason: 'Treason', constitution: 'Constitution', wedding: 'Wedding',
}

// Which of the 3 decks each card belongs to — drives which deck a Play
// draws from and which HUD section lists it.
export const PROGRESS_CARD_TRACK: Record<ProgressCardType, ImprovementTrack> = {
  alchemy: 'science', crane: 'science', engineering: 'science',
  invention: 'science', irrigation: 'science', medicine: 'science',
  mining: 'science', progressRoadBuilding: 'science', smithing: 'science',
  printing: 'science',
  commercialHarbor: 'trade', guildDues: 'trade', merchant: 'trade',
  merchantFleet: 'trade', resourceMonopoly: 'trade', tradeMonopoly: 'trade',
  diplomacy: 'politics', encouragement: 'politics', espionage: 'politics',
  intrigue: 'politics', sabotage: 'politics', taxation: 'politics',
  treason: 'politics', constitution: 'politics', wedding: 'politics',
}

// Printing (science) and Constitution (politics) — played immediately
// into a player's public area on draw, worth 1 VP each. UNLIKE the base
// game's hidden victoryPoint dev card, these are NOT secret: CN3087's own
// text is "play immediately into your player area" (not "hand"), so they
// stay OUT of the 4-card hand limit, can't be discarded/stolen/targeted
// by Espionage, and (see getPublicScore below) are never subtracted from
// the live public score the way hidden dev-card VP is.
export const PROGRESS_CARD_VP_TYPES: ReadonlySet<ProgressCardType> = new Set(['printing', 'constitution'])

// Exact physical deck composition, CN3087 pp.13-16 (also
// docs/superpowers/specs/references/cities-knights-progress-cards.md).
// Each of the 3 decks totals 18 physical cards. Deliberately NOT scaled
// by victoryPointTarget the way buildDevCardDeck is — the official
// rulebook gives no guidance on scaling these for a longer game, and
// only 2 of the 25 types are VP cards (1 copy each), so scaling isn't
// the load-bearing "race to N points" lever it is for the base dev deck.
export const PROGRESS_CARD_DECK_COMPOSITION: Record<ImprovementTrack, Partial<Record<ProgressCardType, number>>> = {
  science: {
    alchemy: 2, crane: 2, engineering: 1, invention: 2, irrigation: 2,
    medicine: 2, mining: 2, progressRoadBuilding: 2, smithing: 2, printing: 1,
  },
  trade: {
    commercialHarbor: 2, guildDues: 2, merchant: 6, merchantFleet: 2,
    resourceMonopoly: 4, tradeMonopoly: 2,
  },
  politics: {
    diplomacy: 2, encouragement: 2, espionage: 3, intrigue: 2, sabotage: 2,
    taxation: 2, treason: 2, constitution: 1, wedding: 2,
  },
}
```

- [ ] **Step 2: Add `progressCards` to `Player`, `citiesAndKnightsProgressCards` to `GameRules`**

In the `Player` interface (`catan-3d/src/game/types.ts:11-26`), add after
`cityImprovements: CityImprovements`:

```ts
  progressCards: ProgressCardType[]
```

In `GameRules` (`catan-3d/src/game/types.ts:195-221`), add after
`citiesAndKnightsCommodities`:

```ts
  // Draw progress cards via a 3rd "event" die rolled alongside the 2
  // production dice. See
  // docs/superpowers/specs/2026-08-16-cities-knights-progress-cards-design.md.
  // Naturally inert without citiesAndKnightsCommodities also on (no
  // cityImprovements track ever exceeds 0, so the draw check never
  // passes) — no UI-level dependency enforced, verified no existing
  // pattern for that in HouseRulesDropdown.tsx to reuse.
  citiesAndKnightsProgressCards: boolean
```

In `DEFAULT_GAME_RULES` (`catan-3d/src/game/types.ts:223-232`), add
`citiesAndKnightsProgressCards: false`.

In `createInitialPlayers`'s returned object (`catan-3d/src/game/types.ts:311-324`), add:

```ts
    progressCards: [],
```

- [ ] **Step 3: Extend `ScoreBreakdown`/`getScoreBreakdown` with progress-card VP**

Update `ScoreBreakdown` (`catan-3d/src/game/types.ts:340-348`) to add
`progressCardVP: number`.

Update `getScoreBreakdown` (`catan-3d/src/game/types.ts:360-387`) — no new
parameter needed, `player` is already in scope:

```ts
  const victoryPointCards = player.devCards.filter((card) => card === 'victoryPoint').length
  const progressCardVP = player.progressCards.filter((card) => PROGRESS_CARD_VP_TYPES.has(card)).length // NEW
  const longestRoad = player.id === longestRoadHolderId ? LONGEST_ROAD_VP : 0
  const largestArmy = player.id === largestArmyHolderId ? LARGEST_ARMY_VP : 0
  const metropolis = IMPROVEMENT_TRACK_ORDER.filter((track) => metropolisHolders[track] === player.id).length * 2
  return {
    settlements: settlementCount,
    cities: cityCount,
    victoryPointCards,
    longestRoad,
    largestArmy,
    metropolis,
    progressCardVP, // NEW
    total: settlementCount + cityCount * 2 + victoryPointCards + longestRoad + largestArmy + metropolis + progressCardVP, // CHANGED
  }
```

**Do NOT touch `getPublicScore`'s subtraction** (`catan-3d/src/game/types.ts:405-414`,
`score.total - score.victoryPointCards`) — that subtraction exists ONLY
because base-game VP dev cards are hidden until the winning turn.
Printing/Constitution are explicitly NOT hidden (see the
`PROGRESS_CARD_VP_TYPES` comment above), so `progressCardVP` must stay
folded into the public score automatically via `score.total` — leaving
`getPublicScore` unchanged is correct, not an oversight. Add a test
proving this (Step 4).

- [ ] **Step 4: Write tests**

In `catan-3d/src/game/types.test.ts`, matching the file's existing style:

```ts
describe('progress card deck composition', () => {
  it('each deck sums to exactly 18 physical cards', () => {
    for (const track of IMPROVEMENT_TRACK_ORDER) {
      const total = Object.values(PROGRESS_CARD_DECK_COMPOSITION[track]).reduce((sum, qty) => sum + (qty ?? 0), 0)
      expect(total).toBe(18)
    }
  })

  it('every ProgressCardType appears in exactly one deck', () => {
    const seen = new Set<ProgressCardType>()
    for (const track of IMPROVEMENT_TRACK_ORDER) {
      for (const type of Object.keys(PROGRESS_CARD_DECK_COMPOSITION[track]) as ProgressCardType[]) {
        expect(seen.has(type)).toBe(false)
        expect(PROGRESS_CARD_TRACK[type]).toBe(track)
        seen.add(type)
      }
    }
    expect(seen.size).toBe(PROGRESS_CARD_ORDER.length)
  })
})

describe('getScoreBreakdown progress card VP', () => {
  it('counts printing and constitution as 1 VP each, other cards as 0', () => {
    const player = { ...basePlayer, id: 1, progressCards: ['printing', 'constitution', 'crane'] as ProgressCardType[] }
    const breakdown = getScoreBreakdown(player, {}, null, null, { science: null, trade: null, politics: null })
    expect(breakdown.progressCardVP).toBe(2)
  })
})

describe('getPublicScore does not hide progress card VP', () => {
  it('includes progressCardVP in the public score, unlike hidden devCard VP', () => {
    const player = {
      ...basePlayer, id: 1,
      devCards: ['victoryPoint'] as DevCardType[],
      progressCards: ['printing'] as ProgressCardType[],
    }
    const holders = { science: null, trade: null, politics: null }
    const publicScore = getPublicScore(player, {}, null, null, holders)
    const trueScore = getPlayerScore(player, {}, null, null, holders)
    expect(trueScore - publicScore).toBe(1) // only the hidden devCard VP is subtracted, not printing
  })
})
```

(`basePlayer` — same minimal `Player` fixture pattern the file's existing
tests already use, extended with `progressCards: []`.)

- [ ] **Step 5: Run tests**

Run: `cd catan-3d && npx vitest run src/game/types.test.ts`
Expected: PASS, all cases.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/types.ts catan-3d/src/game/types.test.ts
git commit -m "feat: add progress card types, deck composition, and VP scoring to the game model"
```

---

### Task 2: Pure deck-shuffle, draw-eligibility, and hand-limit logic

**Files:**
- Create: `catan-3d/src/game/progressCards.ts`
- Test: `catan-3d/src/game/progressCards.test.ts`

**Interfaces:**
- Consumes: `ProgressCardType`, `ImprovementTrack`, `IMPROVEMENT_TRACK_ORDER`,
  `PROGRESS_CARD_DECK_COMPOSITION`, `PROGRESS_CARD_VP_TYPES`, `shuffle`
  (Task 1 / existing `game/types.ts`).
- Produces: `buildProgressCardDeck(track)`, `isEligibleToDraw(level, redDie)`,
  `resolveEventDieDraws(...)`, `progressCardHandExcess(hand)` — Task 3 and
  Task 6 call these.

- [ ] **Step 1: Write the failing tests**

Create `catan-3d/src/game/progressCards.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  buildProgressCardDeck,
  isEligibleToDraw,
  resolveEventDieDraws,
  progressCardHandExcess,
} from './progressCards'
import type { ImprovementTrack, ProgressCardType } from './types'

describe('buildProgressCardDeck', () => {
  it('builds exactly 18 cards per track, matching PROGRESS_CARD_DECK_COMPOSITION', () => {
    for (const track of ['science', 'trade', 'politics'] as ImprovementTrack[]) {
      expect(buildProgressCardDeck(track)).toHaveLength(18)
    }
  })

  it('science deck contains exactly 2 alchemy and exactly 1 engineering', () => {
    const deck = buildProgressCardDeck('science')
    expect(deck.filter((c) => c === 'alchemy')).toHaveLength(2)
    expect(deck.filter((c) => c === 'engineering')).toHaveLength(1)
  })
})

describe('isEligibleToDraw', () => {
  it('level 0 never draws, regardless of red die', () => {
    for (let redDie = 1; redDie <= 6; redDie++) expect(isEligibleToDraw(0, redDie)).toBe(false)
  })

  it('level 1 draws on red die 1-2, not 3+', () => {
    expect(isEligibleToDraw(1, 1)).toBe(true)
    expect(isEligibleToDraw(1, 2)).toBe(true)
    expect(isEligibleToDraw(1, 3)).toBe(false)
  })

  it('level 5 always draws (red die 1-6)', () => {
    for (let redDie = 1; redDie <= 6; redDie++) expect(isEligibleToDraw(5, redDie)).toBe(true)
  })

  it('matches the exact rulebook worked example: level 2 draws on 1, 2, or 3', () => {
    expect(isEligibleToDraw(2, 1)).toBe(true)
    expect(isEligibleToDraw(2, 3)).toBe(true)
    expect(isEligibleToDraw(2, 4)).toBe(false)
  })
})

describe('resolveEventDieDraws', () => {
  it('draws exactly 1 card per eligible player, in the given turn order, none for ineligible players', () => {
    const players = [
      { id: 1, cityImprovements: { science: 2, trade: 0, politics: 0 } },
      { id: 2, cityImprovements: { science: 0, trade: 0, politics: 0 } }, // level 0, never eligible
      { id: 3, cityImprovements: { science: 5, trade: 0, politics: 0 } },
    ]
    const deck: ProgressCardType[] = ['alchemy', 'crane', 'engineering']
    const result = resolveEventDieDraws(players, 'science', /* redDie */ 1, deck, /* turnOrderIds */ [3, 1, 2])
    expect(result.draws).toEqual([
      { playerId: 3, card: 'alchemy' },
      { playerId: 1, card: 'crane' },
    ])
    expect(result.remainingDeck).toEqual(['engineering'])
  })

  it('stops drawing (no-op, not a crash) once the deck is empty', () => {
    const players = [{ id: 1, cityImprovements: { science: 5, trade: 0, politics: 0 } }]
    const result = resolveEventDieDraws(players, 'science', 1, [], [1])
    expect(result.draws).toEqual([])
    expect(result.remainingDeck).toEqual([])
  })
})

describe('progressCardHandExcess', () => {
  it('is 0 at or under the 4-card limit', () => {
    expect(progressCardHandExcess(['alchemy', 'crane', 'engineering', 'invention'])).toBe(0)
  })

  it('counts only non-VP cards toward the limit', () => {
    // 4 non-VP + 2 VP = 6 total, but VP cards never count
    expect(progressCardHandExcess(['alchemy', 'crane', 'engineering', 'invention', 'printing', 'constitution'])).toBe(0)
  })

  it('is the amount over 4 for non-VP cards only', () => {
    expect(progressCardHandExcess(['alchemy', 'crane', 'engineering', 'invention', 'irrigation', 'printing'])).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/progressCards.test.ts`
Expected: FAIL with "Cannot find module './progressCards'"

- [ ] **Step 3: Implement**

Create `catan-3d/src/game/progressCards.ts`:

```ts
import {
  PROGRESS_CARD_DECK_COMPOSITION,
  PROGRESS_CARD_VP_TYPES,
  shuffle,
  type ImprovementTrack,
  type ProgressCardType,
} from './types'

// One full shuffled deck for a track, exact composition per
// PROGRESS_CARD_DECK_COMPOSITION (18 cards, every track).
export function buildProgressCardDeck(track: ImprovementTrack): ProgressCardType[] {
  const deck: ProgressCardType[] = []
  const composition = PROGRESS_CARD_DECK_COMPOSITION[track]
  for (const type of Object.keys(composition) as ProgressCardType[]) {
    const qty = composition[type] ?? 0
    for (let i = 0; i < qty; i++) deck.push(type)
  }
  return shuffle(deck)
}

// CN3087 p.6/p.8: level N (1-5) draws on red-die 1 through N+1. Level 0
// never draws (no range printed on the City Improvement board).
export function isEligibleToDraw(level: number, redDie: number): boolean {
  if (level < 1) return false
  return redDie <= level + 1
}

export interface ProgressCardDrawResolution {
  draws: { playerId: number; card: ProgressCardType }[]
  remainingDeck: ProgressCardType[]
}

// Resolves one event-die roll's worth of draws for a single track. Callers
// pass players in FULL turn order starting at the current roller (CN3087
// p.6: "in turn order, starting with the current player and continuing
// clockwise") — this function does not reorder its input, it trusts the
// caller's order and just filters + draws.
export function resolveEventDieDraws(
  players: { id: number; cityImprovements: Record<ImprovementTrack, number> }[],
  track: ImprovementTrack,
  redDie: number,
  deck: ProgressCardType[],
  turnOrderIds: number[],
): ProgressCardDrawResolution {
  const byId = new Map(players.map((p) => [p.id, p]))
  let remainingDeck = deck
  const draws: { playerId: number; card: ProgressCardType }[] = []
  for (const playerId of turnOrderIds) {
    const player = byId.get(playerId)
    if (!player) continue
    if (!isEligibleToDraw(player.cityImprovements[track], redDie)) continue
    if (remainingDeck.length === 0) continue // deck exhausted — no-op, not an error
    const [card, ...rest] = remainingDeck
    draws.push({ playerId, card })
    remainingDeck = rest
  }
  return { draws, remainingDeck }
}

// CN3087 p.10: 4-card hand limit, VP cards excluded (they're never held in
// hand — see PROGRESS_CARD_VP_TYPES in types.ts). Returns how many cards
// over the limit the hand currently is (0 if at or under).
export function progressCardHandExcess(progressCards: ProgressCardType[]): number {
  const nonVpCount = progressCards.filter((card) => !PROGRESS_CARD_VP_TYPES.has(card)).length
  return Math.max(0, nonVpCount - 4)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/progressCards.test.ts`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/game/progressCards.ts catan-3d/src/game/progressCards.test.ts
git commit -m "feat: add pure progress card deck, draw-eligibility, and hand-limit logic"
```

---

### Task 3: Event die roll + progress card draw resolution wired into the turn loop

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/components/Dice3D.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `buildProgressCardDeck`, `resolveEventDieDraws`,
  `progressCardHandExcess` (Task 2); `ProgressCardType`, `ImprovementTrack`,
  `IMPROVEMENT_TRACK_ORDER` (Task 1).
- Produces: `progressCardDecks` state, `applyProgressCardDraws(...)`,
  `progressCardOverLimitPlayerIds` state (queue, consumed by Task 6) —
  Task 6/9-16 all read from the hand this task populates.

**Exact current control flow this task modifies (verified, not assumed):**
`rollDice` (`App.tsx:1545-1564`) only ever starts the ROLLER's own real
physics simulation (`setPhysicsRoll`). The physics settle callback,
`handlePhysicsSettled` (`App.tsx:1570-1613`), is the ONLY place that
computes a genuinely NEW roll — it broadcasts `DiceRolledPayload` then
calls `applyRollResult`, which runs identically on the roller's client
AND on every other client (via `handleDiceSettled`, `App.tsx:1784+`,
triggered when a MIRRORED `Dice3D` animation — not physics — finishes
after receiving `onDiceRolled`). `applyRollResult` itself must NOT gain
progress-card side effects: it's the shared deterministic bookkeeping
path, but WHICH card each eligible player draws depends on the roller's
own local (unseeded) deck order — same trust boundary as the existing
`devDeck`/`onDevCardBought` pattern (`useRoomChannel.ts:126-136`), which
only the roller's client can resolve. Card draws therefore live in
`handlePhysicsSettled` (roller-only), broadcast separately from
`DICE_ROLLED`.

- [ ] **Step 1: Add the event die to `DiceRollTarget` and state**

In `catan-3d/src/components/Dice3D.tsx`, extend `DiceRollTarget`
(`Dice3D.tsx:88-92`):

```ts
export interface DiceRollTarget {
  d1: number
  d2: number
  eventDie: EventDieFace // NEW
  rollId: number
}

export type EventDieFace = 'ship' | 'science' | 'trade' | 'politics' // NEW
```

In `App.tsx`, add new state next to `devDeck` (`App.tsx:246`):

```ts
const [progressCardDecks, setProgressCardDecks] = useState<Record<ImprovementTrack, ProgressCardType[]>>(() => ({
  science: buildProgressCardDeck('science'),
  trade: buildProgressCardDeck('trade'),
  politics: buildProgressCardDeck('politics'),
}))
// Queue of players currently over the 4-card progress-card hand limit,
// same per-player-queue shape as discardPlayerIds/scienceFreeResourcePlayerIds
// (App.tsx:319, 328) — deterministic (computed from each client's own
// now-updated players state inside applyProgressCardDraws below), so no
// broadcast is needed to populate it; every client reaches the same queue
// independently from the same trusted-applied hand contents.
const [progressCardOverLimitPlayerIds, setProgressCardOverLimitPlayerIds] = useState<number[]>([])
```

- [ ] **Step 2: Roll the event die and thread it through the existing dice broadcast**

In `handlePhysicsSettled` (`App.tsx:1570-1613`), immediately after
`const isDouble = d1 === d2` and BEFORE the `noSevensFirstTwoRolls`
early-return block (rolling the event die is unconditional — even a
voided/rerolled 7 still had a real event die face, but since that whole
roll is discarded and rerolled, roll the event die fresh each attempt,
inside this same function, not hoisted above it):

```ts
const EVENT_DIE_FACES: EventDieFace[] = ['ship', 'ship', 'ship', 'science', 'trade', 'politics']
const eventDie = EVENT_DIE_FACES[Math.floor(Math.random() * 6)]
```

Update the `broadcastDiceRolled` call to carry it:

```ts
if (onlineInfo) {
  broadcastDiceRolled({ dice: [d1, d2], eventDie, total, playerId: rollerId }) // CHANGED
}
```

Update `DiceRolledPayload` (`useRoomChannel.ts:59-63`):

```ts
export interface DiceRolledPayload {
  dice: [number, number]
  eventDie: EventDieFace // NEW
  total: number
  playerId: number
}
```

Update `onDiceRolled`'s receiver (`App.tsx:847-850`) and
`beginDiceAnimation` (`App.tsx:451+`) to thread `eventDie` through to the
`diceRoll` state (`DiceRollTarget`) the same way `d1`/`d2` already do —
`beginDiceAnimation(d1, d2, eventDie, playerId)`, storing it in
`setDiceRoll({ d1, d2, eventDie, rollId })`. Also update
`setPhysicsRoll`'s call site and the `PhysicsDice3D`/`Dice3D` JSX
(`App.tsx:2992-2996`) — `PhysicsDice3D`'s own settle callback
(`handlePhysicsSettled`) generates `eventDie` itself (Step 2 above, it
doesn't come FROM `PhysicsDice3D`, which only simulates `d1`/`d2` physics);
`Dice3D`'s mirrored path reads it from the already-broadcast
`diceRoll.eventDie`.

- [ ] **Step 3: Resolve progress card draws (roller-only, after broadcasting the roll)**

Add a new trusted-apply function next to `applyDiscard`/
`applyCityImprovementPurchase` (`App.tsx:720-759` area):

```ts
// Trusted state mutation for a batch of progress-card draws from one
// event-die trigger — shared by the local roller (handlePhysicsSettled,
// below, which also broadcasts) and receiving clients
// (onProgressCardsDrawn). Deck-count bookkeeping is intentionally NOT
// done here — the roller sets its own progressCardDecks[track] to the
// exact remainder its local resolveEventDieDraws computed, while a
// receiver just needs to pop the same COUNT off its own independently-
// shuffled local copy (see the devDeck/onDevCardBought precedent this
// mirrors, useRoomChannel.ts:126-136) — those are different operations
// on the same state, so each caller does its own deck update after
// calling this for the hand-only mutation.
const applyProgressCardDraws = (draws: { playerId: number; card: ProgressCardType }[]) => {
  if (draws.length === 0) return
  setPlayers((prev) =>
    prev.map((p) => {
      const drawn = draws.filter((d) => d.playerId === p.id).map((d) => d.card)
      return drawn.length === 0 ? p : { ...p, progressCards: [...p.progressCards, ...drawn] }
    }),
  )
  // Deterministic — every client (roller and receivers alike) computes
  // this from its own just-updated hand, no broadcast needed. Merges
  // rather than overwrites, same reasoning as Task 4's plan-doc-corrected
  // scienceFreeResourcePlayerIds queue: a second draw before the first
  // discard resolves must not silently drop the earlier over-limit player.
  const overLimitIds = draws
    .map((d) => d.playerId)
    .filter((id, i, arr) => arr.indexOf(id) === i) // de-dupe multiple draws to the same player
  setProgressCardOverLimitPlayerIds((prev) => {
    const next = [...new Set([...prev, ...overLimitIds])]
    return next
  })
}
```

(Note: the excess-vs-not check for which players ACTUALLY need to be
queued happens in Task 6, which reads `progressCardHandExcess` against
the post-draw hand — this function queues every player who drew
anything, deliberately over-inclusive; Task 6's consumer filters.)

In `handlePhysicsSettled`, after `broadcastDiceRolled(...)` and before
`applyRollResult(...)`:

```ts
if (eventDie !== 'ship') {
  const track = eventDie // 'science' | 'trade' | 'politics'
  const turnOrderIds = [
    ...players.slice(currentPlayerIndex).map((p) => p.id),
    ...players.slice(0, currentPlayerIndex).map((p) => p.id),
  ]
  const result = resolveEventDieDraws(players, track, d1, progressCardDecks[track], turnOrderIds)
  if (result.draws.length > 0) {
    applyProgressCardDraws(result.draws)
    setProgressCardDecks((prev) => ({ ...prev, [track]: result.remainingDeck }))
    for (const { playerId, card } of result.draws) {
      const p = playerById.get(playerId)
      if (p) inform(`${p.name} drew a ${PROGRESS_CARD_LABELS[card]} progress card.`)
    }
    if (onlineInfo) broadcastProgressCardsDrawn({ track, draws: result.draws })
  }
}
```

- [ ] **Step 4: Multiplayer payload + receiver**

Add to `useRoomChannel.ts`, following the exact shape of
`DevCardBoughtPayload`/`broadcastDevCardBought`/`onDevCardBought`:

```ts
export interface ProgressCardsDrawnPayload {
  track: ImprovementTrack
  draws: { playerId: number; card: ProgressCardType }[]
}
```

```ts
const broadcastProgressCardsDrawn = (payload: ProgressCardsDrawnPayload) => {
  void channelRef.current?.send({ type: 'broadcast', event: 'PROGRESS_CARDS_DRAWN', payload })
}
```

```ts
channel.on<ProgressCardsDrawnPayload>('broadcast', { event: 'PROGRESS_CARDS_DRAWN' }, ({ payload }) => {
  handlersRef.current.onProgressCardsDrawn?.(payload)
})
```

Add `onProgressCardsDrawn?: (payload: ProgressCardsDrawnPayload) => void`
to the handlers interface and `broadcastProgressCardsDrawn` to the
returned actions object (mirror `broadcastDevCardBought`'s two
registration points exactly).

In `App.tsx`'s `useRoomChannel({...})` handlers object, add:

```ts
onProgressCardsDrawn: (payload) => {
  // Broadcast-sourced — same validation shape as onCityImprovementPurchased:
  // payload.track goes straight into progressCardDecks[track] indexing, so
  // a bogus value must be rejected before use.
  if (!IMPROVEMENT_TRACK_ORDER.includes(payload.track)) {
    console.error('[Catan] Ignoring malformed progress-card-draw payload:', payload)
    return
  }
  applyProgressCardDraws(payload.draws)
  // Pop the SAME COUNT off this client's own local deck copy — contents
  // never shown to anyone, so which specific cards remain doesn't need to
  // match the roller's; only the remaining length does.
  setProgressCardDecks((prev) => ({
    ...prev,
    [payload.track]: prev[payload.track].slice(payload.draws.length),
  }))
},
```

- [ ] **Step 5: Run the full test suite and typecheck**

Run: `cd catan-3d && npx tsc -b && npx vitest run`
Expected: clean. (`progressCardOverLimitPlayerIds` is unused by any UI
yet — Task 6 consumes it — so it may show as an unused-variable lint
warning until then; acceptable mid-plan, matching Task 1's precedent in
the Phase A plan for a deliberately-incomplete intermediate state.)

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/Dice3D.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: roll an event die alongside production dice and resolve progress card draws"
```

---

### Task 4: Event die 2D HUD icon

**Files:**
- Create: `catan-3d/src/components/hud/EventDieIndicator.tsx`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `EventDieFace`, `diceRoll` (Task 3).
- Produces: nothing consumed by later tasks — leaf UI.

- [ ] **Step 1: Create the indicator**

Create `catan-3d/src/components/hud/EventDieIndicator.tsx`:

```tsx
import type { EventDieFace } from '../Dice3D'

const EVENT_DIE_ICON: Record<EventDieFace, string> = {
  ship: '⛵',
  science: '🧪',
  trade: '⚖️',
  politics: '🤝',
}

const EVENT_DIE_LABEL: Record<EventDieFace, string> = {
  ship: 'Ship — barbarians advance',
  science: 'Science — progress card draw',
  trade: 'Trade — progress card draw',
  politics: 'Politics — progress card draw',
}

// Placeholder 2D treatment, deliberately not a 3rd physics die (see the
// Phase B design spec's Global Constraints) — the existing 2 dice already
// require custom 3D geometry/textures this project isn't taking on for a
// differently-faced 3rd die yet.
export function EventDieIndicator({ face }: { face: EventDieFace | null }) {
  if (!face) return null
  return (
    <div
      className="pointer-events-none flex items-center gap-1.5 rounded-full border border-glass-border bg-glass px-3 py-1 text-sm text-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-xl"
      title={EVENT_DIE_LABEL[face]}
    >
      <span aria-hidden="true">{EVENT_DIE_ICON[face]}</span>
      <span className="font-body text-[10px] tracking-[0.15em] text-white/60 uppercase">{face}</span>
    </div>
  )
}
```

- [ ] **Step 2: Wire it into `App.tsx`**

Render next to the existing dice display (`App.tsx:2992-2996` area),
reading the current roll's event die:

```tsx
<EventDieIndicator face={diceRoll?.eventDie ?? null} />
```

Import `EventDieIndicator` from `./components/hud/EventDieIndicator`.
Note this reads `diceRoll` (the MIRRORED-roll state, already holds
`eventDie` after Task 3), which is `null` between rolls and set by both
`handlePhysicsSettled` and `beginDiceAnimation` — same lifetime as the
existing `lastRoll` display, so no new state needed.

- [ ] **Step 3: Typecheck**

Run: `cd catan-3d && npx tsc -b`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/components/hud/EventDieIndicator.tsx catan-3d/src/App.tsx
git commit -m "feat: show the rolled event die face as a HUD indicator"
```

---

### Task 5: Progress card art processing + hand panel UI

**Files:**
- Create: `catan-3d/src/assets/cards/{Alchemy,Crane,Engineering,Invention,Irrigation,Medicine,Mining,RoadBuilding,Smithing,Printing,CommercialHarbor,GuildDues,Merchant,MerchantFleet,ResourceMonopoly,TradeMonopoly,Diplomacy,Encouragement,Espionage,Intrigue,Sabotage,Taxation,Treason,Constitution,Wedding}_progress.png`
  (25 files)
- Create: `catan-3d/src/components/hud/ProgressCardsPanel.tsx`
- Modify: `catan-3d/src/components/hud/GameHud.tsx`

**Interfaces:**
- Consumes: `ProgressCardType`, `PROGRESS_CARD_ORDER`, `PROGRESS_CARD_LABELS`,
  `PROGRESS_CARD_TRACK`, `PROGRESS_CARD_VP_TYPES` (Task 1);
  `progressCardHandExcess` (Task 2); `progressCardDecks` (Task 3).
- Produces: `ProgressCardsPanel` component — Task 6 extends its props for
  the discard-selection mode; Tasks 8-16 each add one entry to its
  `onPlay` dispatch.

- [ ] **Step 1: Process the 25 card images**

Reuse the exact background-removal script from Phase A's 3 commodity
cards (Python/PIL: sample background color from image corners, per-pixel
Euclidean color-distance thresholding — full-transparent below ~12,
full-opaque above ~40, feathered between — crop to alpha bbox with
padding, resize to 432×578). Source files are in `Catan cards/04..28`
(filenames like `05_-_Crane_202608160331.jpeg`, numeric prefixes and
timestamp suffixes to be stripped, `(Alt)` tags ignored — they're just
this project's own file-naming noise from generation, not part of the
card). Map each source file to its `ProgressCardType`'s clean output name
per `PROGRESS_CARD_LABELS`, output to
`catan-3d/src/assets/cards/<Name>_progress.png`. Verify all 25 processed
images visually (or via a quick script checking non-trivial alpha-channel
coverage) before proceeding — a botched background-removal pass on any
one of the 25 should be caught here, not discovered later as a visibly
broken card in the panel.

- [ ] **Step 2: Build the panel**

Create `catan-3d/src/components/hud/ProgressCardsPanel.tsx`:

```tsx
import { PROGRESS_CARD_LABELS, PROGRESS_CARD_VP_TYPES, type ProgressCardType } from '../../game/types'

// Card art: catan-3d/src/assets/cards/<Name>_progress.png, one per
// ProgressCardType, keyed by the same PascalCase name PROGRESS_CARD_LABELS
// stores (spaces stripped) — see Step 1's processing pass.
const PROGRESS_CARD_ART: Record<ProgressCardType, string> = {
  alchemy: new URL('../../assets/cards/Alchemy_progress.png', import.meta.url).href,
  crane: new URL('../../assets/cards/Crane_progress.png', import.meta.url).href,
  engineering: new URL('../../assets/cards/Engineering_progress.png', import.meta.url).href,
  invention: new URL('../../assets/cards/Invention_progress.png', import.meta.url).href,
  irrigation: new URL('../../assets/cards/Irrigation_progress.png', import.meta.url).href,
  medicine: new URL('../../assets/cards/Medicine_progress.png', import.meta.url).href,
  mining: new URL('../../assets/cards/Mining_progress.png', import.meta.url).href,
  progressRoadBuilding: new URL('../../assets/cards/RoadBuilding_progress.png', import.meta.url).href,
  smithing: new URL('../../assets/cards/Smithing_progress.png', import.meta.url).href,
  printing: new URL('../../assets/cards/Printing_progress.png', import.meta.url).href,
  commercialHarbor: new URL('../../assets/cards/CommercialHarbor_progress.png', import.meta.url).href,
  guildDues: new URL('../../assets/cards/GuildDues_progress.png', import.meta.url).href,
  merchant: new URL('../../assets/cards/Merchant_progress.png', import.meta.url).href,
  merchantFleet: new URL('../../assets/cards/MerchantFleet_progress.png', import.meta.url).href,
  resourceMonopoly: new URL('../../assets/cards/ResourceMonopoly_progress.png', import.meta.url).href,
  tradeMonopoly: new URL('../../assets/cards/TradeMonopoly_progress.png', import.meta.url).href,
  diplomacy: new URL('../../assets/cards/Diplomacy_progress.png', import.meta.url).href,
  encouragement: new URL('../../assets/cards/Encouragement_progress.png', import.meta.url).href,
  espionage: new URL('../../assets/cards/Espionage_progress.png', import.meta.url).href,
  intrigue: new URL('../../assets/cards/Intrigue_progress.png', import.meta.url).href,
  sabotage: new URL('../../assets/cards/Sabotage_progress.png', import.meta.url).href,
  taxation: new URL('../../assets/cards/Taxation_progress.png', import.meta.url).href,
  treason: new URL('../../assets/cards/Treason_progress.png', import.meta.url).href,
  constitution: new URL('../../assets/cards/Constitution_progress.png', import.meta.url).href,
  wedding: new URL('../../assets/cards/Wedding_progress.png', import.meta.url).href,
}

// Cards with no Play handler wired yet (the 6 knight-dependent no-ops,
// Tasks 8-16 fill in the rest) show this instead of a working button.
// Deliberately a Partial — VP cards (printing/constitution) get NO entry
// at all here, same "no play action, held silently for score" precedent
// as DEV_CARD_PLAY_LABELS omitting victoryPoint (game/types.ts).
export type ProgressCardPlayHandlers = Partial<Record<ProgressCardType, () => void>>

export interface ProgressCardsPanelProps {
  progressCards: ProgressCardType[]
  deckCounts: Record<'science' | 'trade' | 'politics', number>
  playHandlers: ProgressCardPlayHandlers
  discardActive?: boolean
  discardSelection?: ProgressCardType[]
  onToggleDiscard?: (card: ProgressCardType, index: number) => void
}

export function ProgressCardsPanel({
  progressCards, deckCounts, playHandlers, discardActive, discardSelection, onToggleDiscard,
}: ProgressCardsPanelProps) {
  if (progressCards.length === 0) return null
  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <span className="font-body text-[10px] tracking-[0.2em] text-white/60 uppercase">Progress Cards</span>
        <span className="font-body text-[10px] text-white/40">
          Sci {deckCounts.science} · Trd {deckCounts.trade} · Pol {deckCounts.politics}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {progressCards.map((card, index) => {
          const isVp = PROGRESS_CARD_VP_TYPES.has(card)
          const selected = discardSelection?.includes(card) // see Task 6 note below on index-vs-value selection
          return (
            <button
              key={`${card}-${index}`}
              type="button"
              disabled={isVp || (!discardActive && !playHandlers[card])}
              onClick={() => (discardActive ? onToggleDiscard?.(card, index) : playHandlers[card]?.())}
              className={`relative overflow-hidden rounded-lg border transition ${
                selected ? 'border-red-400 ring-2 ring-red-400/60' : 'border-white/20'
              } ${isVp ? 'opacity-70' : 'hover:border-white/50'}`}
              title={PROGRESS_CARD_LABELS[card]}
            >
              <img src={PROGRESS_CARD_ART[card]} alt={PROGRESS_CARD_LABELS[card]} className="aspect-[432/578] w-full object-cover" />
              {isVp && (
                <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[9px] text-yellow-300">+1 VP</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire into `GameHud.tsx`**

In the `top-20 left-4` stack (`GameHud.tsx:322-349`, alongside
`RankingsPanel`/`CityImprovementsPanel`), add after
`CityImprovementsPanel`, gated the same way:

```tsx
{citiesAndKnightsProgressCards && (
  <ProgressCardsPanel
    progressCards={viewer.progressCards}
    deckCounts={progressCardDeckCounts}
    playHandlers={progressCardPlayHandlers}
  />
)}
```

`viewer.progressCards` — derived the same way `viewer.commodities` already
is (internally from the existing `viewer` object, not a new top-level
prop — matches Phase A's independently-verified-correct deviation).
`progressCardDeckCounts: { science: number; trade: number; politics: number }`
and `progressCardPlayHandlers: ProgressCardPlayHandlers` — new
`GameHudProps` fields, threaded from `App.tsx` as
`{ science: progressCardDecks.science.length, trade: ..., politics: ... }`
and an object literal Tasks 8-16 each add one key to.
`citiesAndKnightsProgressCards` — derived from `gameRules` the same way
`citiesAndKnightsCommodities` already is in this file.

- [ ] **Step 4: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint .`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/assets/cards/*_progress.png catan-3d/src/components/hud/ProgressCardsPanel.tsx catan-3d/src/components/hud/GameHud.tsx
git commit -m "feat: add the progress card hand panel with real card art"
```

---

### Task 6: Progress-card hand-limit (4-card) discard flow

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/components/hud/GameHud.tsx`
- Modify: `catan-3d/src/components/hud/ProgressCardsPanel.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`
- Modify: `catan-3d/src/multiplayer/matchSnapshot.ts`

**Interfaces:**
- Consumes: `progressCardOverLimitPlayerIds` (Task 3),
  `progressCardHandExcess` (Task 2), `ProgressCardsPanel` (Task 5).
- Produces: nothing new consumed by later tasks — closes the draw loop
  Task 3 opened.

Progress cards are NOT fungible the way resources are — a hand can hold 2
copies of the same type (`crane: 2` in the deck composition, etc.), so
selection must identify a specific ARRAY INDEX into `player.progressCards`,
not just a type. `discardSelection`'s existing `string[]` of
`` `${resource}-${i}` `` composite ids (App.tsx:319,
`toggleDiscardSelection`, `App.tsx:1797-1808`) solves the exact same
fungibility problem for resources — mirror that shape here rather than
inventing index-tracking from scratch, but keep the state genuinely
separate (verified in the earlier research pass: `discardHandSize`/
`toggleDiscardSelection`/`confirmDiscard` are hardcoded to
`Resources`+`Commodities` and would need a parallel copy, not a
parametrization).

- [ ] **Step 1: State and toggle/confirm functions**

In `App.tsx`, next to `discardSelection` (`App.tsx:319`):

```ts
// Indices into the OVER-LIMIT player's progressCards array, not card
// identities — mirrors discardSelection's own composite-id approach to
// the same "which specific instance of a possibly-duplicated card"
// problem, just index-based since progress cards have no natural id
// string the way resources do.
const [progressDiscardSelection, setProgressDiscardSelection] = useState<number[]>([])
```

Next to `toggleDiscardSelection`/`confirmDiscard`
(`App.tsx:1797-1840` area):

```ts
const activeProgressDiscarderId = progressCardOverLimitPlayerIds[0] ?? null

const toggleProgressDiscardSelection = (index: number) => {
  if (activeProgressDiscarderId == null) return
  const player = playerById.get(activeProgressDiscarderId)
  if (!player) return
  const required = progressCardHandExcess(player.progressCards)
  setProgressDiscardSelection((prev) => {
    if (prev.includes(index)) return prev.filter((i) => i !== index)
    if (prev.length >= required) return prev
    return [...prev, index]
  })
}

const confirmProgressDiscard = () => {
  if (activeProgressDiscarderId == null) return
  const player = playerById.get(activeProgressDiscarderId)
  if (!player) return
  const required = progressCardHandExcess(player.progressCards)
  if (progressDiscardSelection.length !== required) {
    warn(`Choose exactly ${required} progress card${required === 1 ? '' : 's'} to discard.`)
    return
  }
  applyProgressDiscard(activeProgressDiscarderId, progressDiscardSelection)
  setProgressDiscardSelection([])
  inform(`${player.name} discarded ${required} progress card${required === 1 ? '' : 's'} (hand limit).`)
  if (onlineInfo) broadcastProgressDiscardConfirmed({ playerId: activeProgressDiscarderId, indices: progressDiscardSelection })
}
```

Trusted-apply function, next to `applyDiscard` (`App.tsx:720-732`):

```ts
// Trusted state mutation for one player's progress-card hand-limit
// discard — shared by the local actor (confirmProgressDiscard, above,
// which also broadcasts) and receiving clients (onProgressDiscardConfirmed).
// indices are into the player's progressCards array on the CONFIRMING
// client — every other client must already have the identical array
// (this only ever runs after applyProgressCardDraws already synced every
// client's copy of that player's hand), so sorting descending and
// splicing is safe: it can't skip/misalign entries.
const applyProgressDiscard = (playerId: number, indices: number[]) => {
  setPlayers((prev) =>
    prev.map((p) => {
      if (p.id !== playerId) return p
      const next = [...p.progressCards]
      for (const index of [...indices].sort((a, b) => b - a)) next.splice(index, 1)
      return { ...p, progressCards: next }
    }),
  )
  setProgressCardOverLimitPlayerIds((prev) => prev.filter((id) => id !== playerId))
}
```

- [ ] **Step 2: Broadcast payload + receiver**

`useRoomChannel.ts`, mirroring `DiscardConfirmedPayload`:

```ts
export interface ProgressDiscardConfirmedPayload {
  playerId: number
  indices: number[]
}
```

```ts
const broadcastProgressDiscardConfirmed = (payload: ProgressDiscardConfirmedPayload) => {
  void channelRef.current?.send({ type: 'broadcast', event: 'PROGRESS_DISCARD_CONFIRMED', payload })
}
```

```ts
channel.on<ProgressDiscardConfirmedPayload>('broadcast', { event: 'PROGRESS_DISCARD_CONFIRMED' }, ({ payload }) => {
  handlersRef.current.onProgressDiscardConfirmed?.(payload)
})
```

In `App.tsx`'s handlers object:

```ts
onProgressDiscardConfirmed: (payload) => applyProgressDiscard(payload.playerId, payload.indices),
```

- [ ] **Step 3: Auto-resolve timeout for a player who doesn't respond**

Mirror the existing `DISCARD_TIMEOUT_MS` `useEffect` (`App.tsx:1840-1857`)
with a parallel effect keyed on `progressCardOverLimitPlayerIds` instead
of `validDiscardPlayerIds` — greedily discard from the START of the
array (index 0 upward) rather than reusing `autoDiscardCounts` (that
function is resource/commodity-typed, not applicable here; this
fallback doesn't need "spread the loss" sophistication, arbitrary order
is fine for an unresponsive player):

```ts
useEffect(() => {
  if (progressCardOverLimitPlayerIds.length === 0 || !isEffectiveHost) return
  const timer = setTimeout(() => {
    for (const playerId of progressCardOverLimitPlayerIds) {
      const player = playerById.get(playerId)
      if (!player) continue
      const required = progressCardHandExcess(player.progressCards)
      const indices = Array.from({ length: required }, (_, i) => i)
      applyProgressDiscard(playerId, indices)
      inform(`${player.name}'s progress card discard timed out — ${required} discarded automatically.`)
      if (onlineInfo) broadcastProgressDiscardConfirmed({ playerId, indices })
    }
  }, DISCARD_TIMEOUT_MS)
  return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- same reasoning as the resource-discard timeout effect above (App.tsx:1856): playerById/onlineInfo/inform/applyProgressDiscard/broadcastProgressDiscardConfirmed read fresh via closure.
}, [progressCardOverLimitPlayerIds, isEffectiveHost])
```

- [ ] **Step 4: Wire the discard UI into `ProgressCardsPanel`**

`ProgressCardsPanel` (Task 5) already accepts `discardActive`/
`discardSelection`/`onToggleDiscard` props — change `discardSelection`'s
type from `ProgressCardType[]` to `number[]` (index-based, matching this
task's model, not Task 5's placeholder type) and `onToggleDiscard`'s
signature to `(index: number) => void`. Update the `selected` check
(`ProgressCardsPanel.tsx`) to `discardSelection?.includes(index)`.

In `GameHud.tsx`, thread:

```tsx
<ProgressCardsPanel
  progressCards={viewer.progressCards}
  deckCounts={progressCardDeckCounts}
  playHandlers={progressCardPlayHandlers}
  discardActive={isMyProgressDiscardTurn}
  discardSelection={progressDiscardSelection}
  onToggleDiscard={onToggleProgressDiscard}
/>
```

`isMyProgressDiscardTurn` — `activeProgressDiscarderId === viewer.id`
(mirrors `isMyDiscardTurn`'s existing derivation). Add a small confirm
button/count indicator next to the panel (reuse `DiscardPanel`'s
`requiredCount`/`selectedCount`/`onConfirm` shape as a second instance,
or extend `DiscardPanel` with a `variant` prop — implementer's call,
either is consistent with existing patterns).

- [ ] **Step 5: `MatchSnapshot` normalization**

In `matchSnapshot.ts`, add `progressCardOverLimitPlayerIds?: number[]` to
`MatchSnapshot` (this is transient turn-flow state, same category as
`discardPlayerIds` — check how THAT field is already normalized on
restore in `App.tsx`'s `restoreFromSnapshot` and mirror it exactly,
including the `?? []` fallback — do not repeat Phase A's Critical-1 gap
of a required-but-unnormalized field).

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/hud/GameHud.tsx catan-3d/src/components/hud/ProgressCardsPanel.tsx catan-3d/src/multiplayer/useRoomChannel.ts catan-3d/src/multiplayer/matchSnapshot.ts
git commit -m "feat: enforce the 4-card progress card hand limit with a discard-selection flow"
```

---

### Task 7: Auto-resolve cards batch 1 — Alchemy, Irrigation, Mining

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/components/hud/ProgressCardsPanel.tsx` (or its
  `playHandlers` wiring in `GameHud.tsx` — Alchemy specifically, see Step 1)
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `graph.vertexTileIds` (existing `data/boardGraph.ts`),
  `player.progressCards`, `removeOne` (existing `game/types.ts`).
- Produces: 3 entries in `progressCardPlayHandlers` (Task 5).

**Card text, verbatim from the reference doc:**
- Alchemy: "Play at the start of the Roll Dice phase, before rolling. Set
  the production dice to the result you want, then roll and resolve the
  event die as normal."
- Irrigation: "Take 2 wheat cards for each field hex adjacent to at least
  one of your buildings. Take as many as remain if the supply runs
  short." (Wheat = this codebase's `grain` `ResourceType`.)
- Mining: "Take 2 ore cards for each mountain hex adjacent to at least
  one of your buildings."

- [ ] **Step 1: Alchemy — special pre-roll timing, not the general Play button**

Verified: this codebase's dice are real physics (`PhysicsDice3D`, always
used for the roller's own roll — `diceDisplayMode` is only ever
`'physics'` or `'remote'`, `App.tsx:239`, `2992-2996`), so "preset the
production dice result" cannot mean presetting a physics outcome without
building an entirely new predetermined-physics mode. Simplification for
this phase: Alchemy overrides the GAME-LOGIC total only, not the visual
dice — physics tumbles normally, but the number `applyRollResult`/
`broadcastDiceRolled` actually use is the player's chosen 2 values
instead of `d1`/`d2` from physics. Flag this to the plan/review process
as a deliberate visual/logic mismatch, not silently decided.

Add state next to `freeRoadsRemaining` (`App.tsx:256`):

```ts
const [alchemyPreset, setAlchemyPreset] = useState<[number, number] | null>(null)
```

Play handler (only enabled when `!hasRolledThisTurn`, mirroring every
other pre-roll-only action's gate):

```ts
const playAlchemy = (d1: number, d2: number) => {
  if (hasRolledThisTurn) { warn('Alchemy can only be played before rolling.'); return }
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('alchemy')) return
  setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'alchemy') } : p)))
  setAlchemyPreset([d1, d2])
  inform(`${player.name} played Alchemy — the next roll's production dice are fixed.`)
}
```

In `handlePhysicsSettled` (`App.tsx:1570-1613`), override `d1`/`d2` for
the GAME-LOGIC path only, right after they're received from the physics
callback:

```ts
const handlePhysicsSettled = (physicsD1: number, physicsD2: number) => {
  const [d1, d2] = alchemyPreset ?? [physicsD1, physicsD2] // NEW — physics visuals still show physicsD1/physicsD2
  if (alchemyPreset) setAlchemyPreset(null)
  const total = d1 + d2
  // ...rest unchanged, using d1/d2 (not physicsD1/physicsD2) from here down
```

No broadcast payload change needed — `alchemyPreset` only matters on the
roller's own client (it decides the values BEFORE calling
`broadcastDiceRolled`, so every other client already receives the final,
overridden `dice`/`total`).

UI: a small "Set dice" 2-number picker, gated on `player.progressCards.includes('alchemy') && !hasRolledThisTurn`,
rendered near the Roll Dice button rather than through the general
`playHandlers` dispatch (`ProgressCardsPanel`'s generic "click card, call
handler" shape doesn't fit a card needing 2 numeric inputs before it
resolves) — implementer's call on exact placement, but it must NOT be
reachable via a plain click-to-play the way every other card is, since
that would skip the number picker entirely.

- [ ] **Step 2: Irrigation and Mining — pure board-adjacency, no picker**

Add both trusted-apply-shaped handlers next to the other card-effect
functions in `App.tsx`:

```ts
// Shared by Irrigation (fields->grain) and Mining (mountains->ore) —
// same "count unique adjacent hexes of one biome across all my
// buildings" shape, just a different biome/resource pair.
const countAdjacentBiomeHexes = (playerId: number, biome: Biome): number => {
  const ownedVertexIds = Object.entries(settlements)
    .filter(([, b]) => b.ownerId === playerId)
    .map(([vertexId]) => vertexId)
  const tileIds = new Set<string>()
  for (const vertexId of ownedVertexIds) {
    for (const tileId of graph.vertexTileIds.get(vertexId) ?? []) tileIds.add(tileId)
  }
  let count = 0
  for (const tileId of tileIds) {
    const tile = tiles.find((t) => t.id === tileId)
    if (tile?.biome === biome) count += 1
  }
  return count
}

const playIrrigation = () => {
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('irrigation')) return
  const hexCount = countAdjacentBiomeHexes(player.id, 'fields')
  const amount = hexCount * 2
  setPlayers((prev) =>
    prev.map((p) =>
      p.id === player.id
        ? { ...p, resources: { ...p.resources, grain: p.resources.grain + amount }, progressCards: removeOne(p.progressCards, 'irrigation') }
        : p,
    ),
  )
  inform(`${player.name} played Irrigation — gained ${amount} Grain (${hexCount} field hexes).`)
  if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'irrigation' })
}
// playMining mirrors playIrrigation exactly: biome 'mountains', resource 'ore', card 'mining'.
```

- [ ] **Step 3: Generic simple-card broadcast**

Cards like Irrigation/Mining have no announced value or target — the
receiving client just needs to know WHICH card was played by WHOM to
re-run the identical deterministic effect locally (both clients compute
the SAME `hexCount` from the same public board state, so unlike progress
card DRAWS, no card-identity trust issue exists here — but the
"which card was removed from hand" side still needs telling, since two
clients' local `progressCards` array order could differ if a player
holds 2+ of the same type... they can't diverge in ORDER since draws are
already trusted-applied identically, so `removeOne` is safe to run
independently on every client). Add one shared, generic payload for
every "no-target, no-picker, self-only effect" card in this plan
(Irrigation, Mining, and later Merchant Fleet reuse this same shape):

```ts
export interface ProgressCardPlayedPayload {
  playerId: number
  card: ProgressCardType
}
```

```ts
const broadcastProgressCardPlayed = (payload: ProgressCardPlayedPayload) => {
  void channelRef.current?.send({ type: 'broadcast', event: 'PROGRESS_CARD_PLAYED', payload })
}
```

```ts
channel.on<ProgressCardPlayedPayload>('broadcast', { event: 'PROGRESS_CARD_PLAYED' }, ({ payload }) => {
  handlersRef.current.onProgressCardPlayed?.(payload)
})
```

In `App.tsx`'s handlers:

```ts
onProgressCardPlayed: (payload) => {
  if (!PROGRESS_CARD_ORDER.includes(payload.card)) {
    console.error('[Catan] Ignoring malformed progress-card-played payload:', payload)
    return
  }
  // Re-run the SAME effect the local player would have — every one of
  // these dispatches is deterministic from public state, only the
  // "who/which card" needs telling. New cases added here as later tasks
  // wire in Merchant Fleet, Resource Monopoly, etc.
  if (payload.card === 'irrigation') applyIrrigationEffect(payload.playerId)
  else if (payload.card === 'mining') applyMiningEffect(payload.playerId)
},
```

(Refactor `playIrrigation`/`playMining`'s body into `applyIrrigationEffect(playerId)`/
`applyMiningEffect(playerId)` — the local play handler spends the card +
calls the effect + broadcasts; the receiver only calls the effect, never
re-spends since the draw/hand state is already independently correct on
each client and the CARD REMOVAL is the one part that must also be
deterministic-safe — verified: since `removeOne` removes by value, not
position, and every client's `progressCards` array has the SAME
multiset contents post-draw, i.e. same count of `'irrigation'` entries
even if list order differs, so independent `removeOne` calls converge to
equivalent hands.)

- [ ] **Step 4: Wire into `progressCardPlayHandlers`**

In `GameHud.tsx`'s `progressCardPlayHandlers` object literal (Task 5),
add `irrigation: playIrrigation, mining: playMining` (Alchemy excluded —
its own UI per Step 1, not the generic dispatch).

- [ ] **Step 5: Run tests and typecheck**

Run: `cd catan-3d && npx tsc -b && npx vitest run`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/hud/ProgressCardsPanel.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: implement Alchemy, Irrigation, and Mining progress cards"
```

---

### Task 8: Crane, Medicine, Invention, Merchant Fleet

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Create: `catan-3d/src/components/TileSwapLayer.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Card text, verbatim:**
- Crane: "Build 1 city improvement for 1 commodity less than normal.
  Only 1 Crane per improvement; can reduce a level-1 improvement to
  free."
- Medicine: "Upgrade one settlement to a city for 1 wheat + 2 ore
  (instead of the normal city cost). Only 1 Medicine per settlement
  upgraded this way."
- Invention: "Swap 2 number discs of your choice (except 2, 6, 8, or
  12)... The robber does not move with a swapped disc."
- Merchant Fleet: "Name 1 resource or commodity. For the rest of this
  turn, make any number of 2:1 trades with the supply using that type."

- [ ] **Step 1: Crane — 1-time discount flag, refund after normal purchase**

Deliberately does NOT modify `cityImprovements.ts`'s pure
`canAffordImprovement`/`buyImprovementLevel` (Phase A functions, other
call sites depend on their exact signatures) — implemented as a
pay-full-then-refund-1 wrapper in `App.tsx` instead, scoped entirely to
this task:

```ts
const [craneDiscountPlayerId, setCraneDiscountPlayerId] = useState<number | null>(null)

const playCrane = () => {
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('crane')) return
  setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'crane') } : p)))
  setCraneDiscountPlayerId(player.id)
  inform(`${player.name} played Crane — next city improvement purchase costs 1 less.`)
}
```

In `buyCityImprovement` (`App.tsx:2295+`, per the earlier
`canAffordImprovement`/`buyCityImprovement` citation from Task 3's
research), the affordability check must ALSO account for the discount —
verified this is a real edge case: `canAffordImprovement`'s FULL-cost
check would wrongly block a player who can only afford the DISCOUNTED
price:

```ts
const hasCraneDiscount = craneDiscountPlayerId === player.id
const cost = improvementLevelCost(player.cityImprovements[track] + 1)
const affordable = hasCraneDiscount
  ? player.commodities[COMMODITY_FOR_TRACK[track]] >= Math.max(0, cost - 1)
  : canAffordImprovement(player.commodities, track, player.cityImprovements[track])
if (!affordable) { warn('Not enough commodities for that improvement.'); return }
```

After the normal `applyCityImprovementPurchase(player.id, track)` call
succeeds, if `hasCraneDiscount`, refund 1 of the matching commodity and
clear the flag:

```ts
if (hasCraneDiscount) {
  setPlayers((prev) =>
    prev.map((p) => (p.id === player.id ? { ...p, commodities: { ...p.commodities, [COMMODITY_FOR_TRACK[track]]: p.commodities[COMMODITY_FOR_TRACK[track]] + 1 } } : p)),
  )
  setCraneDiscountPlayerId(null)
}
```

- [ ] **Step 2: Medicine — discounted city upgrade on the player's own settlement**

State: `pendingMedicineUse: number | null` (a player id), set by a play
handler identical in shape to `playCrane` above (spend the card, no
picker of its own).

Verified in the earlier research pass: settlement→city upgrade already
routes through `buildSettlementRaw`'s existing occupied-vertex branch
(`App.tsx:1390-1410`) via the SAME `onBuild(vertexId)` every vertex click
uses — no new click layer needed, no vertex-highlight machinery exists
today for ANY special mode (Metropolis claiming doesn't have one either),
so an ineligible click just gets `warn()`'d, matching this codebase's
established UX. Insert the Medicine branch INSIDE the existing
`existing.type !== 'city'` upgrade check, before the normal `CITY_COST`
path:

```ts
if (existing.type === 'city') { warn('This is already a City.'); return }
if (player.citiesRemaining <= 0) { warn('You have no cities left to place.'); return }
const usingMedicine = pendingMedicineUse === player.id
if (usingMedicine) {
  if (player.resources.grain < 1 || player.resources.ore < 2) { warn('Not enough resources for Medicine (needs 1 Wheat + 2 Ore).'); return }
} else if (!canAfford(player.resources, CITY_COST)) {
  warn('Not enough resources for a city.')
  return
}
applyCityPlacement(vertexId, player.id, usingMedicine ? { grain: 1, ore: 2 } : undefined) // CHANGED — see below
if (usingMedicine) setPendingMedicineUse(null)
if (onlineInfo) broadcastCityBuilt({ vertexId, playerId: player.id, costOverride: usingMedicine ? { grain: 1, ore: 2 } : undefined })
```

`applyCityPlacement` needs a new optional 3rd parameter (a cost override,
defaulting to the existing `CITY_COST` deduction when absent) —
`CityBuiltPayload` (`useRoomChannel.ts`) gains a matching optional
`costOverride?: Partial<Resources>` field so the receiving client
deducts the SAME (discounted) amount rather than re-deriving it (the
receiver has no local `pendingMedicineUse` state to trust for this,
since Medicine's discount is a one-shot flag on the ACTING client only —
telling the receiver the exact cost avoids needing to broadcast the
Medicine-play event separately just to keep 2 clients in sync on
"why was this city cheaper").

- [ ] **Step 3: Invention — 2-number-token swap picker**

State: `pendingInventionSwap: { playerId: number; firstTileId: string | null } | null`.

Create `catan-3d/src/components/TileSwapLayer.tsx`, copying
`RobberLayer.tsx`'s per-tile-hitbox structure (verified not directly
reusable/parametrizable — robber-specific props are hardcoded) but with
2-click accumulation instead of 1:

```tsx
interface TileSwapLayerProps {
  tiles: HexTileData[]
  active: boolean
  firstTileId: string | null
  onSelectTile: (tileId: string) => void
}
// Renders the same invisible per-tile hitbox mesh RobberTileTarget uses
// (see RobberLayer.tsx for the exact geometry/hover pattern to copy),
// filtered to only tiles whose number is NOT in [2, 6, 8, 12] (the
// excluded "never swappable" numbers CN3087 names) and, on the SECOND
// click, excluding whichever tile was picked first.
```

Wire as a sibling to `RobberLayer`/`BoardInteractions` in the same
`<Canvas>` (`App.tsx:2980-2990` area):

```tsx
<TileSwapLayer
  tiles={tiles}
  active={pendingInventionSwap?.playerId === localPlayer?.id}
  firstTileId={pendingInventionSwap?.firstTileId ?? null}
  onSelectTile={handleInventionTileSelect}
/>
```

```ts
const handleInventionTileSelect = (tileId: string) => {
  if (!pendingInventionSwap) return
  const tile = tiles.find((t) => t.id === tileId)
  if (!tile || [2, 6, 8, 12].includes(tile.number ?? 0)) { warn('That number can\'t be swapped.'); return }
  if (!pendingInventionSwap.firstTileId) {
    setPendingInventionSwap({ ...pendingInventionSwap, firstTileId: tileId })
    return
  }
  if (tileId === pendingInventionSwap.firstTileId) return
  applyInventionSwap(pendingInventionSwap.firstTileId, tileId)
  setPendingInventionSwap(null)
  if (onlineInfo) broadcastInventionSwapped({ tileAId: pendingInventionSwap.firstTileId, tileBId: tileId })
}

// Trusted-apply — swaps two tiles' `.number` fields in the `tiles` array.
// Deterministic given the 2 tile ids, so this is the one card-effect
// function in this plan safely reused VERBATIM by both the local actor
// and the broadcast receiver with no separate payload-shape decision to
// make (no player-specific state involved at all — the board itself is
// the only thing that changes).
const applyInventionSwap = (tileAId: string, tileBId: string) => {
  setTiles((prev) =>
    prev.map((t) => {
      if (t.id === tileAId) return { ...t, number: prev.find((x) => x.id === tileBId)?.number ?? t.number }
      if (t.id === tileBId) return { ...t, number: prev.find((x) => x.id === tileAId)?.number ?? t.number }
      return t
    }),
  )
}
```

`InventionSwappedPayload { tileAId: string; tileBId: string }` +
`broadcastInventionSwapped`/`onInventionSwapped` (→ `applyInventionSwap`),
mirroring every other broadcast pair in this plan.

The play handler (`playInvention`) only sets
`pendingInventionSwap({ playerId, firstTileId: null })` and spends the
card — the actual swap+broadcast happens in `handleInventionTileSelect`
above, once 2 tiles are chosen.

- [ ] **Step 4: Merchant Fleet — temporary 2:1 bank-trade rate**

State: `merchantFleetRate: { playerId: number; type: ResourceType | CommodityType } | null`,
cleared on `endTurn` (add to whatever cleanup list already resets
per-turn flags like `devCardsBoughtThisTurn`).

```ts
const playMerchantFleet = (type: ResourceType | CommodityType) => {
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('merchantFleet')) return
  setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'merchantFleet') } : p)))
  setMerchantFleetRate({ playerId: player.id, type })
  inform(`${player.name} played Merchant Fleet — 2:1 trades with the bank for ${type} this turn.`)
  if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'merchantFleet' }) // announced type stays LOCAL — bank trade UI reads merchantFleetRate directly, no cross-client sync needed since bank trades are already a local-only action (no broadcast today for a normal bank trade's RATE, only its outcome)
}
```

Consumed inside the existing port-rate lookup, `getPortRate(playerId, resource)`
(`App.tsx:1270-1279`, verified directly against current code — NOT the
stale line range an earlier reference doc cited, since this codebase has
shifted since that doc was written; always re-check line numbers against
the live file, not a doc's citation):

```ts
const getPortRate = (playerId: number, resource: ResourceType): number => {
  if (merchantFleetRate?.playerId === playerId && merchantFleetRate.type === resource) return 2 // NEW, checked first — Merchant Fleet's 2:1 is at least as good as any port
  let hasGenericPort = false
  // ...rest unchanged
```

Note `merchantFleetRate.type` is `ResourceType | CommodityType` but
`getPortRate` only takes `ResourceType` — commodity trades use a
separate rate path (Trade level 3's 2:1, already built in Phase A,
`TradeModal.tsx`'s commodity tab) — apply the identical `merchantFleetRate`
check there too for commodity types, so naming one covers both trade
tabs consistently.

- [ ] **Step 5: Wire into `progressCardPlayHandlers` and typecheck**

Add `crane: playCrane, medicine: () => setPendingMedicineUse(player.id)`
(Invention and Merchant Fleet need argument pickers, not plain dispatch —
wire their own small UI, same exception as Alchemy in Task 7).

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/TileSwapLayer.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: implement Crane, Medicine, Invention, and Merchant Fleet progress cards"
```

---

### Task 9: Shared player-target picker component

**Files:**
- Create: `catan-3d/src/components/hud/PlayerTargetPicker.tsx`
- Modify: `catan-3d/src/components/hud/TradeModal.tsx` (adopt the
  extracted component, no behavior change)

**Interfaces:**
- Produces: `PlayerTargetPicker` — Tasks 11-12 (Guild Dues, Espionage,
  Commercial Harbor) each use it.

`TradeModal.tsx`'s `otherPlayers.map(...)` button row
(`TradeModal.tsx:160-184`, verified in the earlier research pass) is a
directly reusable UI shape — extracting it once here avoids 3 near-copies
across Tasks 11-12.

- [ ] **Step 1: Extract the component**

Create `catan-3d/src/components/hud/PlayerTargetPicker.tsx`:

```tsx
import { PLAYER_COLORS, type Player } from '../../game/types'

export interface PlayerTargetPickerProps {
  players: Player[] // already the "other players" list — caller filters out the viewer
  selectedPlayerId: number | null
  onSelect: (playerId: number) => void
}

// Extracted from TradeModal's player-target row (same visual shape:
// colored dot + name, one button per candidate) — now shared by any
// progress card that targets a specific opponent (Guild Dues, Espionage,
// Commercial Harbor).
export function PlayerTargetPicker({ players, selectedPlayerId, onSelect }: PlayerTargetPickerProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {players.map((player) => {
        const selected = selectedPlayerId === player.id
        return (
          <button
            key={player.id}
            type="button"
            onClick={() => onSelect(player.id)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
              selected ? 'border-white/60 bg-white/10 text-white' : 'border-white/20 text-white/70 hover:border-white/40'
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PLAYER_COLORS[player.colorToken] }} />
            {player.name}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Adopt it in `TradeModal.tsx`**

Replace the inline `otherPlayers.map(...)` block
(`TradeModal.tsx:160-184`) with
`<PlayerTargetPicker players={otherPlayers} selectedPlayerId={targetPlayerId} onSelect={setTargetPlayerId} />`.
No behavior change — same props feeding the same existing `targetPlayerId`
state, just deduplicated markup.

- [ ] **Step 3: Typecheck**

Run: `cd catan-3d && npx tsc -b`
Expected: clean, `TradeModal.tsx`'s existing behavior unchanged (verify
by re-reading its diff — this step must be a pure extraction, not a
behavior tweak).

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/components/hud/PlayerTargetPicker.tsx catan-3d/src/components/hud/TradeModal.tsx
git commit -m "refactor: extract TradeModal's player-target picker into a shared component"
```

---

### Task 10: All-players-respond cards — Resource Monopoly, Trade Monopoly, Sabotage, Wedding

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/components/hud/GameHud.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `getPlayerScore` (existing `game/types.ts`), `autoDiscardCounts`
  (existing `game/discard.ts`), `DevCardResourcePicker` (existing
  `components/hud/DevCardResourcePicker.tsx`), `PickerMode` (existing
  `GameHud.tsx:36`, widened here).

**Card text, verbatim:**
- Resource Monopoly: "Announce one resource type. Each player must give
  you 2 of that resource if they have them (or their last one if they
  only have 1)."
- Trade Monopoly: "Announce one commodity type. Each player must give
  you 1 of that commodity if they have it."
- Sabotage: "Each player with as many or more VPs than you must discard
  half their resource and/or commodity cards (rounded down)."
- Wedding: "Each player with more VPs than you must give you 2 resource
  and/or commodity cards of their choice (or as many as they have, if
  fewer than 2)."

Sabotage/Wedding's "rounded down" and "of their choice" leave the exact
selected cards up to the affected player in the physical game — this plan
auto-selects via the existing greedy `autoDiscardCounts` logic (already
used for the resource-discard timeout fallback, `game/discard.ts`) rather
than building a second targeted-player response UI for a card whose
official text doesn't actually require interactive choice from the
GIVING side. Flagged as a deliberate scope cut for the plan/review
process.

- [ ] **Step 1: Resource Monopoly — reuse the existing Monopoly picker verbatim**

`playResourceMonopoly` mirrors `playMonopoly` (`App.tsx:2433-2438`)
exactly, spending `'resourceMonopoly'` instead of the base dev card and
opening the SAME `DevCardResourcePicker` via a widened `PickerMode`:

```ts
const playResourceMonopoly = () => {
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('resourceMonopoly')) return
  setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'resourceMonopoly') } : p)))
  setDevCardPicker('resourceMonopolyProgress' as never) // see note below on widening the type
}
```

`DevCardPickerMode` (`App.tsx:89`) gains `'resourceMonopolyProgress'`;
`resolveDevCardPicker` (`App.tsx:2451-2467`) gains a branch calling the
SAME `applyMonopolyEffect(player.id, resource)` the base dev card already
uses — the effect (steal an announced resource from everyone) is
IDENTICAL, only the card that triggered it differs, so no new effect
function is needed, only a new dispatch branch and a new broadcast event
name (`ResourceMonopolyProgressPlayedPayload`, mirroring
`MonopolyPlayedPayload` exactly) so the event log / receiving clients can
tell which card was played (cosmetic — the resource-steal math itself is
identical either way).

- [ ] **Step 2: Trade Monopoly — new commodity-announce picker**

`DevCardResourcePicker` is hardcoded to `ResourceType` (verified in the
earlier research pass) — Trade Monopoly needs a commodity announcement
instead, so build a sibling component rather than force-fitting:

```tsx
// catan-3d/src/components/hud/DevCardCommodityPicker.tsx
// Same shape as DevCardResourcePicker but over COMMODITY_ORDER/CommodityIcon
// instead of RESOURCE_ORDER/ResourceIcon — kept as a separate component
// rather than generalizing DevCardResourcePicker over both, since that
// component's existing 2 callers (Year of Plenty, Monopoly) have no need
// for the extra type-parameter complexity this would add to working code.
interface DevCardCommodityPickerProps {
  title: string
  subtitle: string
  onComplete: (pick: CommodityType) => void
}
export function DevCardCommodityPicker({ title, subtitle, onComplete }: DevCardCommodityPickerProps) { /* mirrors DevCardResourcePicker's JSX, COMMODITY_ORDER.map + CommodityIcon, pickCount fixed at 1 */ }
```

Effect function, sibling to `applyMonopolyEffect` (`App.tsx:643-670`):

```ts
const applyTradeMonopolyEffect = (playerId: number, commodity: CommodityType) => {
  setPlayers((prev) => {
    let collected = 0
    const next = prev.map((p) => {
      if (p.id === playerId || p.commodities[commodity] <= 0) return p
      collected += 1 // Trade Monopoly takes 1 per player, not all of it (unlike Resource Monopoly's 2)
      return { ...p, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] - 1 } }
    })
    return next.map((p) => (p.id === playerId ? { ...p, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] + collected } } : p))
  })
}
```

Wire `playTradeMonopoly`/a new picker-mode entry/broadcast pair, same
shape as Step 1.

- [ ] **Step 3: Sabotage and Wedding — VP-comparison, auto-selected response**

```ts
// Shared VP-comparison helper — both cards need "every player whose VP
// compares a certain way to the announcer."
const playersMeetingVpThreshold = (announcerId: number, comparison: 'gte' | 'gt'): Player[] => {
  const announcer = playerById.get(announcerId)
  if (!announcer) return []
  const announcerVp = getPlayerScore(announcer, settlements, longestRoadHolderId, largestArmyHolderId, metropolisHolders)
  return players.filter((p) => {
    if (p.id === announcerId) return false
    const vp = getPlayerScore(p, settlements, longestRoadHolderId, largestArmyHolderId, metropolisHolders)
    return comparison === 'gte' ? vp >= announcerVp : vp > announcerVp
  })
}

const playSabotage = () => {
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('sabotage')) return
  const affected = playersMeetingVpThreshold(player.id, 'gte')
  setPlayers((prev) =>
    prev.map((p) => {
      if (!affected.some((a) => a.id === p.id)) return p === player ? { ...p, progressCards: removeOne(p.progressCards, 'sabotage') } : p
      const handSize = discardHandSize(p.resources, p.commodities, gameRules.citiesAndKnightsCommodities)
      const counts = autoDiscardCounts(p.resources, p.commodities, Math.floor(handSize / 2))
      const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, counts)
      return { ...p, resources, commodities, progressCards: p.id === player.id ? removeOne(p.progressCards, 'sabotage') : p.progressCards }
    }),
  )
  inform(`${player.name} played Sabotage — ${affected.length} player(s) discarded half their hand.`)
  if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'sabotage' })
}
// playWedding mirrors playSabotage: comparison 'gt' (strictly more VP, not >=),
// takes min(2, handSize) cards via autoDiscardCounts(..., Math.min(2, handSize))
// per affected player, ADDS them to the announcer instead of discarding to
// the supply (the one real difference from Sabotage's shape — Wedding's
// taken cards must be re-added to the announcer's resources/commodities via
// the same per-type counts autoDiscardCounts already computed).
```

Both effects are fully deterministic from public state (VP comparison)
plus each affected player's OWN hand contents — verified safe to re-run
identically on every client (same reasoning as Task 7's Irrigation/
Mining), so the receiver side of `onProgressCardPlayed` (Task 7's shared
handler) just needs 2 more `else if` branches calling
`applySabotageEffect(playerId)`/`applyWeddingEffect(playerId)` (extract
the body above into named effect functions the same way Task 7 did for
Irrigation/Mining).

- [ ] **Step 4: Wire `PickerMode`, `progressCardPlayHandlers`, run tests**

Widen `PickerMode` (`GameHud.tsx:36`) to include
`'resourceMonopolyProgress' | 'tradeMonopolyProgress'`, add matching
`DEV_CARD_PICKER_COPY` entries. Add `resourceMonopoly`, `tradeMonopoly`,
`sabotage`, `wedding` to `progressCardPlayHandlers`.

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/hud/GameHud.tsx catan-3d/src/components/hud/DevCardCommodityPicker.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: implement Resource Monopoly, Trade Monopoly, Sabotage, and Wedding progress cards"
```

---

### Task 11: Guild Dues and Espionage — view-and-take from a targeted opponent

**Files:**
- Create: `catan-3d/src/components/hud/OpponentHandPicker.tsx`
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `PlayerTargetPicker` (Task 9), `playersMeetingVpThreshold`
  (Task 10).

**Important scope note, verified this session:** "no client ever renders
another player's exact hand" (from the earlier research pass) describes
the UI today, NOT a data-availability gap — `players` state (every
player's `resources`/`commodities`/`progressCards`) is already fully
present on every client (production/scoring require it), only never
rendered for a non-viewer. So "view an opponent's hand" needs a NEW
component reading ALREADY-LOCAL state, not a new sync mechanism — only
the ACT of taking cards (mutating 2 players' hands in a way that must
match across clients) needs the usual trusted-apply broadcast.

**Card text, verbatim:**
- Guild Dues: "Look at the hand of a player with more VPs than you. Take
  any 2 cards of your choice (resource and/or commodity) from them."
- Espionage: "Look at another player's hand of progress cards; you may
  take 1 and add it to your hand. VP cards can't be taken this way."

- [ ] **Step 1: Shared opponent-hand-picker component**

Create `catan-3d/src/components/hud/OpponentHandPicker.tsx`:

```tsx
// Renders a target player's resource+commodity cards (Guild Dues mode)
// or progress cards (Espionage mode, VP types excluded per the card's own
// text) as clickable chips, up to maxPicks. Reads props only — the
// caller (App.tsx) already has full access to the target's state, no
// fetch/broadcast needed to populate this.
export interface OpponentHandPickerProps {
  target: Player
  mode: 'resourcesAndCommodities' | 'progressCards'
  maxPicks: number
  onConfirm: (picks: (ResourceType | CommodityType)[] | number[]) => void // number[] = progressCards indices, mirrors Task 6's index-based selection
  onCancel: () => void
}
export function OpponentHandPicker({ target, mode, maxPicks, onConfirm, onCancel }: OpponentHandPickerProps) {
  /* mode === 'resourcesAndCommodities': render RESOURCE_ORDER + COMMODITY_ORDER
     chips with counts, same visual language as ResourcePanel; clicking
     accumulates up to maxPicks selections (repeats allowed per type, up to
     the target's held count — same shape as toggleDiscardSelection's cap
     logic).
     mode === 'progressCards': render target.progressCards.filter(c =>
     !PROGRESS_CARD_VP_TYPES.has(c)) as index-keyed chips (Espionage: VP
     cards excluded per the card's own text, maxPicks=1). */
}
```

- [ ] **Step 2: Guild Dues**

```ts
const [pendingGuildDues, setPendingGuildDues] = useState<{ targetId: number } | null>(null)

const playGuildDues = () => {
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('guildDues')) return
  const eligibleTargets = playersMeetingVpThreshold(player.id, 'gt')
  if (eligibleTargets.length === 0) { warn('No player currently has more VP than you.'); return }
  setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'guildDues') } : p)))
  setPendingGuildDues({ targetId: eligibleTargets[0].id }) // picker lets the player switch targets among eligibleTargets before confirming, via PlayerTargetPicker
}

// picks: exactly 2 entries from ResourceType | CommodityType, each entry
// present at most as many times as the target actually holds it — the
// picker component enforces this at selection time, this function trusts
// it (same trust boundary as confirmDiscard trusting discardSelection's
// own length invariant).
const applyGuildDuesTake = (takerId: number, targetId: number, picks: (ResourceType | CommodityType)[]) => {
  setPlayers((prev) =>
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
    }),
  )
}
```

`GuildDuesTakenPayload { takerId: number; targetId: number; picks: (ResourceType | CommodityType)[] }`
+ broadcast/receive pair calling `applyGuildDuesTake`, mirroring every
other trusted-apply pair in this plan — validate `picks` against
`RESOURCE_ORDER`/`COMMODITY_ORDER` membership before applying (same
malformed-payload guard as Task 3/6's receivers).

- [ ] **Step 3: Espionage**

Same shape as Guild Dues, simpler (no VP threshold — "another player,"
any of them; `maxPicks` = 1; `mode: 'progressCards'`):

```ts
const applyEspionageTake = (takerId: number, targetId: number, cardIndex: number) => {
  setPlayers((prev) => {
    const target = prev.find((p) => p.id === targetId)
    const card = target?.progressCards[cardIndex]
    if (!card || PROGRESS_CARD_VP_TYPES.has(card)) return prev // VP cards can't be taken — re-verified server-side (receiver), not just picker-side
    return prev.map((p) => {
      if (p.id === targetId) { const next = [...p.progressCards]; next.splice(cardIndex, 1); return { ...p, progressCards: next } }
      if (p.id === takerId) return { ...p, progressCards: [...p.progressCards, card] }
      return p
    })
  })
}
```

`EspionageTakenPayload { takerId: number; targetId: number; cardIndex: number }`.
Note the receiver re-derives `card` from `target.progressCards[cardIndex]`
itself rather than trusting a card identity over the wire — this is safe
AND necessary here (unlike Task 3's draws, which needed the roller's
un-syncable local deck order) because both clients already have the
IDENTICAL `target.progressCards` array by the time this runs (no
randomness involved, just an index into already-synced state) — trusting
the index and re-deriving the card is strictly safer than also trusting
a duplicated `card` field that could disagree with what's actually at
that index on a given client.

- [ ] **Step 4: Wire UI, run tests**

Both cards' `progressCardPlayHandlers` entries open
`OpponentHandPicker`/`PlayerTargetPicker` in sequence (pick target, then
pick cards) — implementer's call on the exact modal flow, following
`TradeModal`'s existing 2-step (target, then offer) pattern for
consistency.

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/components/hud/OpponentHandPicker.tsx catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: implement Guild Dues and Espionage progress cards"
```

---

### Task 12: Commercial Harbor and Diplomacy

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Card text, verbatim, and the scope cuts each needs (flag both to the
plan/review process, not silent decisions):**

- Commercial Harbor: "Offer each other player one of your resource
  cards; they must give you 1 commodity card of their choice in exchange
  (or you take your card back if they have none). One offer per player,
  any time during your turn." The physical card is a per-player
  sequential offer/response; this plan simplifies to: the announcer picks
  ONE resource type, then for each other player (turn order) who holds
  at least 1 commodity, 1 unit of that resource moves announcer→them and
  1 commodity (auto-selected, most-held first — same convention as
  Sabotage/Wedding's auto-pick) moves them→announcer; a player holding no
  commodities is skipped entirely (announcer keeps that unit). Stops
  early if the announcer runs out of the chosen resource.
- Diplomacy: "Remove an 'open' road (open = an end not next to your own
  road/building, and not part of a continuous route between two of your
  buildings/knights)." This plan implements only the DIRECTLY computable
  half of "open" — neither endpoint touches a building — and does NOT
  verify the "not part of a continuous route between two buildings"
  clause against this codebase's road-network traversal (`calculateLongestRoad`,
  `game/trophies.ts`), since that requires reading that file's internal
  graph representation, out of this research pass's scope. **Flag this
  as an unverified simplification for the task reviewer to check** —
  if `calculateLongestRoad` already exposes a reusable "is this edge
  part of a through-route" helper, use it instead of the simplified
  check below.

- [ ] **Step 1: Commercial Harbor**

```ts
const playCommercialHarbor = (resource: ResourceType) => {
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('commercialHarbor')) return
  const turnOrderIds = [...players.slice(currentPlayerIndex).map((p) => p.id), ...players.slice(0, currentPlayerIndex).map((p) => p.id)].filter((id) => id !== player.id)
  applyCommercialHarborEffect(player.id, resource, turnOrderIds)
  if (onlineInfo) broadcastCommercialHarborPlayed({ playerId: player.id, resource, turnOrderIds })
}

const applyCommercialHarborEffect = (announcerId: number, resource: ResourceType, otherIdsInOrder: number[]) => {
  setPlayers((prev) => {
    let next = prev.map((p) => (p.id === announcerId ? { ...p, progressCards: removeOne(p.progressCards, 'commercialHarbor') } : p))
    for (const targetId of otherIdsInOrder) {
      const announcer = next.find((p) => p.id === announcerId)!
      if (announcer.resources[resource] <= 0) break
      const target = next.find((p) => p.id === targetId)!
      const heldCommodities = COMMODITY_ORDER.filter((c) => target.commodities[c] > 0).sort((a, b) => target.commodities[b] - target.commodities[a])
      if (heldCommodities.length === 0) continue
      const commodity = heldCommodities[0]
      next = next.map((p) => {
        if (p.id === announcerId) return { ...p, resources: { ...p.resources, [resource]: p.resources[resource] - 1 }, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] + 1 } }
        if (p.id === targetId) return { ...p, resources: { ...p.resources, [resource]: p.resources[resource] + 1 }, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] - 1 } }
        return p
      })
    }
    return next
  })
}
```

`CommercialHarborPlayedPayload { playerId: number; resource: ResourceType; turnOrderIds: number[] }`
— `turnOrderIds` is carried explicitly (not re-derived from
`currentPlayerIndex` on the receiver) since the announcer's client
computed it at a specific moment; re-deriving it independently on a
receiver risks a different `currentPlayerIndex` if a race with turn
advancement occurs. Receiver calls
`applyCommercialHarborEffect(payload.playerId, payload.resource, payload.turnOrderIds)`
directly — fully deterministic given those 3 values plus already-synced
player state, no additional trust concern beyond the usual malformed-enum
guard (validate `resource` against `RESOURCE_ORDER`).

- [ ] **Step 2: Diplomacy**

```ts
// Simplified "open" check — see the scope note above. edgeId -> its 2
// vertex ids via graph.edgeById; a vertex "touches a building" if
// settlements[vertexId] exists (any owner, not just this player's own —
// the card's definition is about ANY adjacent building, not just the
// road-remover's).
const isOpenRoad = (edgeId: string): boolean => {
  const edge = graph.edgeById.get(edgeId)
  if (!edge) return false
  return !settlements[edge.a] && !settlements[edge.b]
}

const playDiplomacy = (edgeId: string) => {
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('diplomacy')) return
  if (!isOpenRoad(edgeId)) { warn('That road is not open — it touches a building.'); return }
  const ownerId = roads[edgeId]
  if (ownerId == null) { warn('That edge has no road to remove.'); return }
  applyDiplomacyRemoval(player.id, edgeId, ownerId)
  if (onlineInfo) broadcastDiplomacyPlayed({ playerId: player.id, edgeId, ownerId })
}

const applyDiplomacyRemoval = (playerId: number, edgeId: string, ownerId: number) => {
  setRoads((prev) => {
    const next = { ...prev }
    delete next[edgeId]
    return next
  })
  setPlayers((prev) =>
    prev.map((p) => {
      if (p.id === playerId) return { ...p, progressCards: removeOne(p.progressCards, 'diplomacy') }
      if (p.id === ownerId && ownerId !== playerId) return { ...p, roadsRemaining: p.roadsRemaining + 1 } // returned to supply
      return p
    }),
  )
  if (ownerId === playerId) setFreeRoadsRemaining((prev) => prev + 1) // own road removed -> 1 free rebuild, reuses Task's own N-free-placements counter (App.tsx:256)
}
```

`DiplomacyPlayedPayload { playerId: number; edgeId: string; ownerId: number }`.
UI: a road-picker mode analogous to `TileSwapLayer` (Task 8) but over
edges — reuse `BoardInteractions.tsx`'s existing `EdgeSlot` click
plumbing with a special-mode check at the top (same "check special mode
FIRST, `warn()` and return on ineligible" shape the `pendingMetropolisClaim`
branch already establishes), rather than a new sibling `<Canvas>` layer —
edges already have their own click handling, unlike tiles, so no new
hitbox layer is needed here the way `TileSwapLayer` was for Invention.

- [ ] **Step 3: Wire into `progressCardPlayHandlers`, run tests**

Add `commercialHarbor: () => <open the resource-type picker, calling playCommercialHarbor(resource) on confirm>`
and `diplomacy: () => <activate the road-picker mode, calling playDiplomacy(edgeId) on an eligible click>`
to `GameHud.tsx`'s `progressCardPlayHandlers` object (Task 5) — same
pattern as every other picker-needing card in this plan (Alchemy,
Invention, Merchant Fleet).

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: implement Commercial Harbor and Diplomacy progress cards"
```

---

### Task 13: Merchant board piece

**Files:**
- Create: `catan-3d/src/components/MerchantLayer.tsx` (copies
  `RobberLayer.tsx`'s tile-hitbox structure, verified not
  parametrizable — Task 3's Reused Patterns section)
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/game/types.ts` (VP hook)
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`,
  `catan-3d/src/multiplayer/matchSnapshot.ts`

**Card text, verbatim:** "Take control of the merchant piece; place it
on any land hex next to one of your buildings. While controlled, trade
that hex's resource (not commodity) at 2:1. Control is worth 1 VP."

**Placeholder-first note:** the Robber uses a dedicated GLB model
(`robber-figurine-v2.glb`, verified). Per this plan's Global Constraints
(placeholder art before commissioned art), the Merchant piece does NOT
get a new custom model this phase — reuse an existing simple marker
(the same gold-cone-marker approach Phase A's Metropolis used as its
placeholder differentiator, `components/GamePieces.tsx`) recolored
distinctly from both the robber and the Metropolis marker.

- [ ] **Step 1: State**

```ts
const [merchantTileId, setMerchantTileId] = useState<string | null>(null)
const [merchantHolderId, setMerchantHolderId] = useState<number | null>(null)
```

Neither is part of `createInitialPlayers`/`Player` — this is App-level
board state, same category as `robberTileId`, not a per-player field.

- [ ] **Step 2: `MerchantLayer.tsx`**

Copy `RobberLayer.tsx`'s `RobberTileTarget` structure (Step 2 excerpt
above in this plan is the exact shape to mirror) into a new
`MerchantTileTarget`, with 2 differences: (a) filter `tiles` to only
LAND hexes (`tile.biome !== 'desert'`? — verify against this codebase's
actual land/sea distinction once Seafarers/open-sea tiles exist; for
Phase B, every playable tile is land, so this filter is a no-op today,
included for forward-compatibility, not because it does anything yet)
adjacent to at least one of the placing player's buildings
(`graph.vertexTileIds` reverse-lookup, same helper `countAdjacentBiomeHexes`
in Task 7 already uses the pattern of), and (b) a distinct highlight
color (not `ROBBER_HIGHLIGHT_COLOR`).

```ts
const playMerchant = () => {
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('merchant')) return
  setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'merchant') } : p)))
  setPendingMerchantPlacement(player.id) // gates MerchantLayer's `active` prop, same shape as pendingInventionSwap
}

const handleMerchantTileSelect = (tileId: string) => {
  if (pendingMerchantPlacement == null) return
  const playerId = pendingMerchantPlacement
  setMerchantTileId(tileId)
  setMerchantHolderId(playerId)
  setPendingMerchantPlacement(null)
  if (onlineInfo) broadcastMerchantMoved({ tileId, holderId: playerId })
}
```

`MerchantMovedPayload { tileId: string; holderId: number }` +
broadcast/receive, applying `setMerchantTileId`/`setMerchantHolderId`
directly (deterministic, trusted the same way `RobberMovedPayload`
already is for the equivalent robber move).

- [ ] **Step 3: 2:1 trade hook**

In `getPortRate` (`App.tsx:1270-1279`, same insertion point Task 8's
Merchant Fleet check uses — both checks stack, whichever applies):

```ts
const getPortRate = (playerId: number, resource: ResourceType): number => {
  if (merchantFleetRate?.playerId === playerId && merchantFleetRate.type === resource) return 2
  if (merchantHolderId === playerId && merchantTileId && tiles.find((t) => t.id === merchantTileId)?.biome && BIOME_TO_RESOURCE[tiles.find((t) => t.id === merchantTileId)!.biome] === resource) return 2 // NEW
  // ...rest unchanged
```

- [ ] **Step 4: VP hook**

`ScoreBreakdown` gains `merchantVP: number` (0 or 1) — Merchant control
is App-level state (`merchantHolderId`), same category as
`metropolisHolders`, so `getScoreBreakdown` needs one more parameter:

```ts
export function getScoreBreakdown(
  player: Player,
  settlements: Record<string, Building>,
  longestRoadHolderId: number | null,
  largestArmyHolderId: number | null,
  metropolisHolders: MetropolisHolders,
  merchantHolderId: number | null, // NEW
): ScoreBreakdown {
  // ...
  const merchantVP = player.id === merchantHolderId ? 1 : 0 // NEW
  return { /* ...existing fields..., */ merchantVP, total: /* ...existing terms... */ + merchantVP }
}
```

This changes `getScoreBreakdown`/`getPlayerScore`/`getPublicScore`'s
signatures again (3rd time this plan's lineage has done so, after Phase
A's `metropolisHolders` addition) — every call site needs the new
argument. Verified this is NOT App.tsx-only: `VictoryBanner.tsx` and
`RankingsPanel.tsx` both import and call these functions DIRECTLY (not
just via props App.tsx computed), so this step must update call sites in
all 3 files — `grep -rn "getScoreBreakdown\|getPlayerScore\|getPublicScore" catan-3d/src`
to enumerate every call site exhaustively before editing (Phase A's own
plan had to do the same for its `metropolisHolders` addition and flagged
it as "Task N is responsible for updating every call site" — same
discipline applies here, now across 3 files instead of 1).

- [ ] **Step 5: `MatchSnapshot`**

Add `merchantTileId?: string | null` and `merchantHolderId?: number | null`
to `MatchSnapshot`, normalized on restore with `?? null` — same treatment
as `metropolisHolders`/`metropolisVertexIds` already get (Task 16 below
covers the FULL snapshot-normalization pass for this plan's other new
fields; doing Merchant's here since it's the one field genuinely coupled
to this task's own state, not deferring it).

- [ ] **Step 6: Wire into `progressCardPlayHandlers`, run tests**

Add `merchant: playMerchant` to `GameHud.tsx`'s `progressCardPlayHandlers`
object (Task 5) — `playMerchant` only activates `MerchantLayer`'s
placement mode (Step 2 above); the tile click itself resolves via
`handleMerchantTileSelect`, not the generic dispatch.

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/components/MerchantLayer.tsx catan-3d/src/App.tsx catan-3d/src/game/types.ts catan-3d/src/multiplayer/useRoomChannel.ts catan-3d/src/multiplayer/matchSnapshot.ts
git commit -m "feat: implement the Merchant progress card as a movable board piece"
```

---

### Task 14: progressRoadBuilding — reuse the free-roads counter

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `freeRoadsRemaining` state (existing, `App.tsx:256`).

Directly reuses the verified "N-free-placements counter" pattern from
Task 3's Reused Patterns section — `freeRoadsRemaining` and
`buildRoadRaw`'s `isFreeRoad` branch (`App.tsx:1447-1499`) already have
zero awareness of WHICH card granted the free roads, so this card needs
no board-UI change at all, only a play handler:

```ts
const playProgressRoadBuilding = () => {
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('progressRoadBuilding')) return
  setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'progressRoadBuilding') } : p)))
  setFreeRoadsRemaining((prev) => prev + 2)
  inform(`${player.name} played (progress card) Road Building — place 2 free roads.`)
  if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'progressRoadBuilding' })
}
```

Receiver (`onProgressCardPlayed`, Task 7's shared handler) adds one more
branch: `else if (payload.card === 'progressRoadBuilding') setFreeRoadsRemaining((prev) => prev + 2)`.

- [ ] **Step 1: Wire into `progressCardPlayHandlers`, run tests**

Run: `cd catan-3d && npx tsc -b && npx vitest run`
Expected: clean.

- [ ] **Step 2: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: implement the progress-card Road Building card"
```

---

### Task 15: The 6 knight-dependent stub cards + House Rules toggle

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/components/hud/HouseRulesDropdown.tsx`
- Modify: `catan-3d/src/components/hud/ProgressCardsPanel.tsx`

**Interfaces:**
- Consumes: `PROGRESS_CARD_LABELS` (Task 1).

**Cards, and why each is a no-op this phase** (from the design spec):
Engineering (city wall — doesn't exist), Smithing (promote a knight —
no knight pieces), Encouragement (activate knights — no knight pieces),
Intrigue (displace a knight — no knight pieces), Treason (remove/place a
knight — no knight pieces), Taxation (requires the robber to be
"active," which per CN3087 only happens after the first barbarian
attack — no barbarian track).

- [ ] **Step 1: Stub play handler**

```ts
const STUB_PROGRESS_CARDS: ReadonlySet<ProgressCardType> = new Set([
  'engineering', 'smithing', 'encouragement', 'intrigue', 'treason', 'taxation',
])

const playStubProgressCard = (card: ProgressCardType) => {
  warn(`${PROGRESS_CARD_LABELS[card]} isn't implemented yet (needs Knights & Barbarians) — kept in hand.`)
}
```

Wire all 6 into `progressCardPlayHandlers` pointing at
`() => playStubProgressCard(<card>)` — the card is deliberately NOT spent
(no `removeOne` call, no broadcast), matching the design spec's "returns
the card to the player's hand unchanged" requirement and the existing
Politics-level-3 no-op precedent.

- [ ] **Step 2: House Rules toggle**

In `HouseRulesDropdown.tsx`'s `CHECKBOX_RULES` array (verified exact
shape, `HouseRulesDropdown.tsx:13-19`), widen the key union and add:

```ts
{ key: 'citiesAndKnightsProgressCards', label: 'Progress cards' },
```

No pre-fill side effect needed (unlike `citiesAndKnightsCommodities`'s
VP-target bump) — confirmed in the design spec that no dependent-checkbox
pattern exists in this file to extend, and none is needed here either.

- [ ] **Step 3: Run tests, typecheck**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/hud/HouseRulesDropdown.tsx catan-3d/src/components/hud/ProgressCardsPanel.tsx
git commit -m "feat: add the 6 knight-dependent progress card stubs and the house rule toggle"
```

---

### Task 16: Multiplayer snapshot normalization (whole-plan pass)

**Files:**
- Modify: `catan-3d/src/multiplayer/matchSnapshot.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: every new field this plan's earlier tasks added to `Player`/
  App-level state.

This task exists SPECIFICALLY to close the exact gap Phase A's final
review caught as Critical 1 (`restoreFromSnapshot` never normalized 2
new required `Player` fields) — done as its OWN task here, at the end,
rather than trusting each earlier task to remember its own snapshot
wiring in isolation, since Phase A's own history shows that gap survives
individual task reviews and only surfaces in a whole-plan pass.

- [ ] **Step 1: Add every new field to `MatchSnapshot`**

```ts
progressCardDecks?: Record<ImprovementTrack, ProgressCardType[]>
progressCardOverLimitPlayerIds?: number[]
merchantTileId?: string | null
merchantHolderId?: number | null
```

(`player.progressCards` needs NO separate snapshot field — it's already
part of the `players: Player[]` array Task 1 extended; only its
RESTORE-side normalization, Step 2 below, is new.)

- [ ] **Step 2: Normalize on restore**

In `restoreFromSnapshot` (`App.tsx`, the exact function/lines Phase A's
Critical-1 fix touched — locate via
`grep -n "commodities: p.commodities ?? emptyCommodities()" App.tsx`),
add to the SAME `normalizedPlayers` map:

```ts
progressCards: p.progressCards ?? [],
```

And restore the App-level fields with the same `?? fallback` treatment
every other optional `MatchSnapshot` field already gets:

```ts
setProgressCardDecks(snapshot.progressCardDecks ?? {
  science: buildProgressCardDeck('science'),
  trade: buildProgressCardDeck('trade'),
  politics: buildProgressCardDeck('politics'),
})
setProgressCardOverLimitPlayerIds(snapshot.progressCardOverLimitPlayerIds ?? [])
setMerchantTileId(snapshot.merchantTileId ?? null)
setMerchantHolderId(snapshot.merchantHolderId ?? null)
```

- [ ] **Step 3: Verify every downstream reader of `normalizedPlayers` uses the normalized array**

Phase A's Critical 1 was specifically about 2 downstream computations
inside `restoreFromSnapshot` reading the RAW `snapshot.players` instead
of the just-normalized array. Re-check this task's own new field
(`progressCards`) doesn't repeat that mistake — grep for any use of
`snapshot.players` (not `normalizedPlayers`) elsewhere in the function
and confirm none of them need `progressCards`.

- [ ] **Step 4: Run the full test suite and typecheck**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/multiplayer/matchSnapshot.ts catan-3d/src/App.tsx
git commit -m "fix: normalize all new Phase B fields on match-snapshot restore"
```

---

### Task 17: Scoring UI — progress card VP and Merchant VP display

**Files:**
- Modify: `catan-3d/src/components/hud/VictoryBanner.tsx`
- Modify: `catan-3d/src/components/hud/RankingsPanel.tsx`

**Interfaces:**
- Consumes: `ScoreBreakdown.progressCardVP`, `ScoreBreakdown.merchantVP`
  (Tasks 1, 13).

Phase A's final review (Important 2) caught `VictoryBanner` computing
`score.metropolis` but never rendering it — apply that lesson proactively
here rather than repeating it: both new VP sources must be RENDERED
somewhere a player can see the scoreboard add up, not just summed into
`total`.

- [ ] **Step 1: `VictoryBanner`**

Add 2 more columns to the existing scoreboard grid (the one Phase A
already widened once for `Met`, `VictoryBanner.tsx:72,91` per that
plan's own history) — `Prog` (progressCardVP) and `Mrch` (merchantVP),
widening the grid template again and the header/row cell counts to
match, same pattern as Phase A's own Metropolis-column addition.

- [ ] **Step 2: `RankingsPanel`**

Check whether `RankingsPanel` already surfaces Metropolis holder
information (Phase A's final review flagged this as a deferred Minor
finding, "RankingsPanel doesn't surface Metropolis holder as public
info" — NOT fixed in that plan). If still absent, this task does NOT
need to retroactively fix that Phase A gap (out of this plan's scope) —
only ensure `RankingsPanel`'s own score display (if it shows a
breakdown at all, not just a total) doesn't silently omit the 2 new VP
sources the way `VictoryBanner` almost did.

- [ ] **Step 3: Run tests, typecheck, and a live check**

Run: `cd catan-3d && npx tsc -b && npx eslint . && npx vitest run`
Expected: clean. Live-verify (no automated test for pure HUD layout,
matching this whole plan's established convention) that the widened
`VictoryBanner` grid still fits/aligns with 2 more columns — same kind
of visual-only confirmation Phase A's own fix wave left as an accepted,
disclosed residual.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/components/hud/VictoryBanner.tsx catan-3d/src/components/hud/RankingsPanel.tsx
git commit -m "feat: render progress card and Merchant VP in the scoreboard"
```
