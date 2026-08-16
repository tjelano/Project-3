# Cities & Knights — Progress Cards (Phase B) — Design Spec

## Summary

The second of the 5-phase Cities & Knights/Seafarers plan (Phase A —
Commodities & City Improvements — shipped). Phase B adds Progress Cards:
players draw special-ability cards from 3 decks (Science/Trade/Politics,
25 unique types across 54 physical cards) via a new **event die**, rolled
alongside the existing 2 production dice every turn. All rules below are
sourced directly from the official Cities & Knights rulebook (CN3087,
catan.com) — the event die/draw-trigger mechanic via a dedicated research
pass this session (rendered pages 6, 8, and the City Improvement board
component as images, not text extraction, matching this project's
established practice after an earlier text-extraction error on this same
rulebook); the 25 cards' names/effects/counts from an earlier session's
research, already captured in
`docs/superpowers/specs/references/cities-knights-progress-cards.md`.

Every subsystem across all 5 phases is its own independent house rule.
This spec's piece is `citiesAndKnightsProgressCards: boolean`, default
`false`. Checked, verified against `HouseRulesDropdown.tsx`: **no
existing checkbox in that panel disables/gates on another one today** —
the only existing cross-rule behavior is `citiesAndKnightsCommodities`'s
one-time VP-target pre-fill side effect, not a general dependency
pattern. Rather than inventing new UI-disabling machinery for a case that
doesn't need it, this rule stays a plain, independent checkbox: if turned
on while `citiesAndKnightsCommodities` is off, the draw trigger's own
`cityImprovements[track] >= 1` check is never true (no track ever
advances without commodities), so the feature is naturally inert —
harmless-but-pointless, not broken, the same "provably inert when its
dependency is off" bar every Phase A feature already had to clear. No
data-layer or UI-layer enforcement needed.

## Global Constraints

(Carried forward from Phase A's spec, still binding)

- **Placeholder assets first.** Every new visual element ships with
  placeholder art before dedicated art is commissioned. Real card art for
  all 25 progress cards already exists (`Catan cards/04..28`, user-supplied,
  processed the same way Phase A's 3 commodity cards were — background
  removed, cropped, resized to 432×578) — so cards themselves need no
  placeholder step. The event die DOES: it ships as a simple 2D HUD icon,
  not a new 3D physics die (explicit user decision this session — see
  "Event Die" below).
- **Gated asset preloading.** New assets (the 25 card textures) preload
  only when `citiesAndKnightsProgressCards` is on.
- **Multiplayer sync** for all new state follows the existing pattern:
  round-trip through `MatchSnapshot` as optional fields; broadcast/apply
  split the same way every other structural mutation in `App.tsx` works.
- **House rules stay independently toggleable.**

## The Event Die & Draw Trigger

Sourced from CN3087 p.6 and p.8, confirmed by rendering both pages plus
the City Improvement board component (p.3) as images at 600 DPI — the
per-level draw-range icons are pure graphics with no extractable text.

**The die.** Standard 6-sided die: 3 ship faces (barbarian track —
Phase C, out of scope here) + 1 science face + 1 trade face + 1 politics
face.

**When it's rolled.** Every turn, together with the 2 production dice, as
one 3-dice roll. Event die effects resolve **before** production — this
changes this codebase's existing roll sequencing (`rollDice` →
`applyRollResult`), which currently only ever handles the 2 production
dice.

**The "red die."** One specific physical die's value is used for the
draw check — not the sum, not "whichever is higher." This codebase's
existing `DiceRollTarget` (`components/Dice3D.tsx`) already tracks
`d1`/`d2` independently (used today only for the doubles check, both dice
otherwise visually identical); Phase B fixes `d1` as "the red die" in
logic. Verified: **the 2 existing dice have no color distinction today**
— giving one of them a distinct red material/texture is new 3D work this
plan needs to account for, not a relabeling of something that already
exists.

**Eligibility, exact rule (p.6, verbatim):** *"If the event die shows one
of the city improvement icons, each player checks to see if they draw a
progress card. First, see if the number on the red die is part of the
range shown next to your cube on the city improvement track matching the
event die. If it is, draw the topmost card from the progress card stack
matching the event die. Cards are drawn in turn order (starting with the
current player and continuing clockwise around the table)."*

Confirmed range table, read directly off the City Improvement board
component:

| Level | Red-die range that triggers a draw |
|---|---|
| 0 (Basic City) | never — no range printed |
| 1 | 1–2 |
| 2 | 1–3 |
| 3 | 1–4 |
| 4 | 1–5 |
| 5 | 1–6 (always draws) |

Pattern: **level N (1–5) draws on red-die 1 through N+1.** Every eligible
player draws independently — not just the current turn-holder, and not
gated on currently owning a city (p.8: losing your last city doesn't
un-advance your improvement cubes). Exactly 1 card per eligible player
per roll, always from exactly 1 deck (the die can't show 2 disciplines at
once).

**Non-progress-card faces:** ship faces advance the barbarian track —
Phase C, not touched by this spec beyond leaving room for it.

## Data Model

New types in `game/types.ts`, mirroring the existing `DevCardType`
pattern but kept **fully separate from it** — "Road Building" is a
progress card AND an existing base-game dev card with the same effect but
a different acquisition path; merging the two types would corrupt that
existing semantics (flagged as a risk in the earlier research pass).

```ts
export type ProgressCardType =
  | 'alchemy' | 'crane' | 'engineering' | 'invention' | 'irrigation'
  | 'medicine' | 'mining' | 'progressRoadBuilding' | 'smithing' | 'printing'
  | 'commercialHarbor' | 'guildDues' | 'merchant' | 'merchantFleet'
  | 'resourceMonopoly' | 'tradeMonopoly'
  | 'diplomacy' | 'encouragement' | 'espionage' | 'intrigue' | 'sabotage'
  | 'taxation' | 'treason' | 'constitution' | 'wedding'
```

(`progressRoadBuilding`, not `roadBuilding` — avoids the exact name
collision called out above.)

- `player.progressCards: ProgressCardType[]` — mirrors `player.devCards`
  exactly. VP cards (`printing`, `constitution`) live in this same array
  (mirroring how `victoryPoint` already sits inside `devCards`) but are
  excluded from the 4-card hand limit and can't be discarded/stolen.
  Exact precedent to match: `game/types.ts`'s `DEV_CARD_PLAY_LABELS` is a
  `Partial<Record<DevCardType, string>>` that deliberately omits
  `victoryPoint` ("held silently for score — there's no 'play' action for
  them, so they have no entry here") — the equivalent
  `PROGRESS_CARD_PLAY_LABELS` should omit `printing`/`constitution` the
  same way.
- `progressCardDecks: Record<ImprovementTrack, ProgressCardType[]>` at
  App level — 3 independent shuffled draw piles, each client shuffles its
  own copy unseeded, same trust model as the existing `devDeck`: a draw
  event broadcasts the exact card(s) drawn, every other client just pops
  the same count off its own local pile to keep `remaining.length`
  correct (contents are never shown to anyone, so per-client order
  desync doesn't matter).
- Deck composition, exact counts from the reference doc: Science 18
  cards/10 types, Trade 18/6, Politics 18/9 — 54 total.
- `GameRules.citiesAndKnightsProgressCards: boolean`, default `false`.

## Turn-Flow Integration

`rollDice`'s existing 2-die roll gains a 3rd result (the event die face,
1 of {ship, science, trade, politics} — weighted 3:1:1:1, since it's a
uniform 6-sided die). Resolution order, inserted into the existing
roll-settle flow (`applyRollResult` or a new step immediately before it):

1. Roll all 3 dice together (1 event die + 2 production, `d1` = red die).
2. If event die = ship: no progress-card action (Phase C hook point, not
   implemented this phase).
3. If event die = a discipline: for each player in turn order starting
   with the current roller, check `cityImprovements[track] >= 1 &&
   d1 <= cityImprovements[track] + 1`. Each eligible player draws 1 card
   from that deck (if the deck isn't empty — official rules don't cover
   an empty deck; treat as a no-op draw, logged, not blocking).
4. Existing production resolution proceeds unchanged (including the
   7-roll discard flow, which is independent of the event die).

The roller's client is authoritative for this resolution (same pattern as
production math) and broadcasts one event carrying every card actually
drawn this roll (`{track, draws: {playerId, card}[]}`), trusted-applied by
every other client exactly like `onDevCardBought`.

## Hand Limit & Discard UI

4-card limit on non-VP progress cards (p.10, exact quote: *"There is a
hand limit of 4 progress cards..."*). Simplification from the official
"may wait until end of your own Action phase" nuance: this spec enforces
the limit **immediately after a draw resolves**, reusing the existing
discard-selection interaction shape (pick cards to discard, confirm) but
scoped to the new progress-card panel instead of the resource hand. This
is a deliberate scope cut, flagged for the plan/review process rather than
silently decided.

## UI

- **Event die**: a small 2D icon next to the existing dice display,
  showing the rolled face (ship/science/trade/politics). No 3D model or
  physics — explicit choice this session, consistent with placeholder-
  first policy given the existing dice already require custom 3D
  geometry/textures this project isn't taking on for a 4th, differently-
  faced die yet.
- **Progress card panel**: a new, separate HUD panel (not joining the
  existing `PlayerHand3D` resource/commodity/dev-card fan) — explicit
  choice this session, since progress cards need per-card Play buttons
  (several with player-targeting sub-UI) and a distinct 4-card limit
  indicator that would blur with the resource fan's existing 7-card
  logic if merged. Uses the real card art already in `Catan cards/`.
  Deck-remaining counts shown per discipline (mirrors `devDeckCount`).

## Card Effects — Categorized

All 25 cards, accounted for exactly once (checked against the reference
doc's full list — an earlier draft of this section silently dropped 2
cards, corrected here): **19 self-contained** (no knight/barbarian
dependency) split into 5 reusable shapes rather than 19 bespoke flows,
plus **6 documented no-ops**.

**Auto/self-resolve** (no other player involved): Alchemy (preset
production dice pre-roll — special timing, playable only before rolling,
not from the general hand), Crane (next city-improvement purchase costs 1
less, 1 use), Irrigation (2 wheat per field hex adjacent to your
buildings), Mining (2 ore per mountain hex adjacent), Medicine (settlement
→ city for 1 wheat + 2 ore instead of normal cost), Invention (swap 2
board number tokens, excluding 2/6/8/12), Printing (VP, auto-play on
draw), Constitution (VP, auto-play on draw).

**Bank-trade modifier** (temporary rate change for the rest of the
current turn, no other player involved): Merchant Fleet (name 1 resource
or commodity, make any number of 2:1 trades with the bank for that type
for the rest of this turn).

**All-players-respond** (broadcast to every player, same shape as the
existing base-game Monopoly dev card and the existing discard-queue
pattern): Resource Monopoly, Trade Monopoly, Sabotage, Wedding.

**Single-target** (player picks 1 other player, resolves a response):
Commercial Harbor, Guild Dues, Espionage, Diplomacy (targets a road, not
strictly a player, but shares the "pick one thing, resolve" shape).

**New board piece** (Merchant): a movable piece placed on a land hex,
grants the controller 2:1 trade on that hex's resource while held, worth
1 VP while controlled. Structurally similar to the Robber (single
board-level entity, ownership state, VP hook into `getScoreBreakdown`
mirroring the Metropolis VP precedent from Phase A) — large enough to be
its own group of plan tasks.

`progressRoadBuilding` reuses the existing dev-card road-building UI/logic
if directly compatible (2 free roads); confirm during planning.

Tally: Auto/self-resolve 8 (Alchemy, Crane, Irrigation, Mining, Medicine,
Invention, Printing, Constitution) + Bank-trade modifier 1 (Merchant
Fleet) + All-players-respond 4 + Single-target 4 (incl. Diplomacy) +
Merchant 1 + progressRoadBuilding 1 = **19 self-contained**, matching the
header count above.

**Out of scope this phase — documented no-ops** (need knight pieces or
the barbarian track, neither of which exist yet — exactly 6 cards, not
the "~8" estimated earlier in conversation before this section was
actually enumerated): Engineering (city wall), Smithing (promote knight),
Encouragement (activate knights), Intrigue (displace knight), Treason
(remove/place knight), Taxation (requires the robber to be "active,"
which only happens after the first barbarian attack). These 6 cards
remain drawable (full official deck odds, per this session's explicit
choice) but their Play action shows a "not yet implemented" message and
returns the card to the player's hand unchanged, matching the existing
Politics-level-3 no-op precedent from Phase A.

19 + 6 = 25, matching the full card count.

## Scoring

`ScoreBreakdown` gains a `progressCardVP: number` field (count of
`printing`/`constitution` entries in `player.progressCards`), following
the exact pattern Phase A used for `metropolis`. `getScoreBreakdown` /
`getPlayerScore` / `getPublicScore` all thread it through, same as before.

## Multiplayer Sync

- `progressCardDecks` (3 arrays) and `player.progressCards` round-trip
  through `MatchSnapshot` as new optional fields, normalized on restore
  with an empty-array fallback — matching the exact fix this session's
  final review already had to make for `Player.commodities`/
  `cityImprovements` (Critical 1), so Phase B's plan must not repeat that
  gap for these new fields.
- Progress-card draws, plays, and the event-die roll result all follow
  the established broadcast/trusted-apply split — no new trust model
  needed, only new payload shapes.

## Out of Scope for v1 (this spec)

- The 8 knight-dependent card effects' real implementation — Phase C.
- City walls, barbarian ship/attack resolution, knight pieces themselves
  — Phase C.
- The official "may discard down to 4 by end of your own Action phase"
  timing nuance — simplified to immediate enforcement on draw (see "Hand
  Limit" above).
- A full 3D physics event die — placeholder 2D icon for now.
- Reshuffle-on-empty-deck handling beyond a no-op (official rules don't
  specify this; revisit if it becomes a real issue in play).
