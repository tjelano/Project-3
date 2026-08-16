# Seafarers — Rules Reference

Sourced from the official 2025 rulebooks: **CN3083** ("CATAN – Seafarers
Expansion", 20 pages, v6.250401) and **CN3084** ("CATAN – Seafarers 5–6
Player Expansion", 12 pages, v6.250401), both downloaded from catan.com.
Page numbers below are 1-indexed physical page numbers (footer "N of 6" /
"N of 5"), not PDF array indices. This is pure rules research for the
upcoming **Seafarers — Ships & Open Sea** and **Seafarers — Scenario Maps**
phases (phases 4–5 of the Cities & Knights/Seafarers plan) — no application
code was read or changed to produce this document, other than the
cross-checks called out explicitly against CN3087 (the already-processed
Cities & Knights rulebook feeding Phase A).

## Components (CN3083 p.1, confirmed by rendering the page as an image —
the photographed component grid didn't fully survive text extraction)

30 hexes: 19 seas, 2 gold fields, 2 deserts, 1 field, 2 hills, 1 forest,
1 pasture, 2 mountains. 6 sea frame pieces. 10 number discs (2,3,4,5,6,8,
9,10,11,12 — one each, used to add hexes during scenario setup, not the
full 18-disc base-game set). 10 port tokens (5× 3:1, 5× 2:1). 60 ships
(15 per color, 4 colors). 1 pirate. 5 Wonders of Catan tiles. 4 wonder
markers, 4 beachhead markers, 4 "X" markers (1 each color). 5 Great Wall
markers, 2 Great Bridge markers. 94 tokens: 32 VP tokens, 50 cloth tokens,
12 pirate lair tokens. 4 player aids.

## Ships

**Cost: confirmed — 1 lumber + 1 wool.** Verified by rendering CN3083 p.2
as an image and reading the "BUILDING COST:" icon box directly (a ship
icon = a log-bundle icon + a sheep icon), not inferred from text
extraction or prior knowledge. Same cost as a road with wool swapped for
brick.

**Placement rules** (CN3083 p.2, confirmed verbatim):
- Ships are placed on the empty edges of sea hexes.
- Ships and roads may not occupy the same coastal edge.
- A new ship must connect to one of your existing **ships or buildings —
  not roads**. This is a real constraint, not just phrasing: you cannot
  extend a ship chain directly off the end of a road; the road has to
  terminate at a settlement/city first, and the ship then branches from
  that building.
- Like roads, you may not build a ship past an opponent's building.
- You may not place any new ship on an edge of the hex currently occupied
  by the pirate.

**Movement rules** (CN3083 p.2, confirmed verbatim — this is the "exact
movement restrictions" detail):
- You may move exactly 1 ship per turn, during your Action phase.
- You may not move a ship you built this turn.
- You may only move a ship if at least one of its two ends is "open" — an
  end is open when it is *not* adjacent to one of your own ships or
  buildings.
- You may not move a ship that is part of a continuous line of ships
  connecting two of your own buildings, **even if an opponent's building
  interrupts that line partway through**.
- You may not move a ship to or from an edge of the hex the pirate
  currently occupies.
- Mechanically: remove the ship from its current edge and place it on a
  new edge, obeying the normal ship-placement rules above (i.e., the new
  location must also legally connect to one of your ships/buildings).

Player-aid summary printed on the physical ship pieces themselves (CN3083
pp.1, 6; CN3084 p.1): "Ships: Count toward Longest Route · May not be
placed adjacent to the pirate · May not be moved on the turn they are
built."

## Longest Route (renamed from "Longest Road")

CN3083 p.2, confirmed verbatim: "The first player to have 5 continuous
roads and/or ships in play receives the Longest Route tile. If another
player has more continuous roads and/or ships in play, they immediately
receive this tile. The Longest Route tile is worth 2 VPs." Same
threshold (5) and same VP value (2) as base Catan's Longest Road — this is
a rename plus a merge of the two piece types into one count, not a new
threshold. **Critical nuance:** "Roads and ships are only considered part
of the same route if they connect to each other **at one of your
buildings**" — a road ending at open water where a ship begins does NOT
chain them together unless there's a settlement/city sitting at that
junction. This has direct implications for however Longest Road/Route
gets computed once ships exist — the existing graph-walk almost certainly
needs to break the route at any vertex that isn't an owned building, not
just at opponent buildings as today.

## Gold fields (new resource-producing hex, no new resource type)

CN3083 p.2, confirmed verbatim: "Each player with a settlement on a gold
field hex that produces this turn receives 1 resource card of their
choice (brick, wood, wool, wheat, or ore). Similarly, a player receives
**2 resource cards in any combination** for each of their cities on that
hex."

Two things worth flagging precisely:
1. Gold fields produce a **player-chosen base resource**, not a new
   resource type and not a commodity. This cross-checks clean against
   CN3087/Phase A's note that gold fields never produce commodities —
   confirmed independently here from the Seafarers side: gold fields
   aren't wired into the commodity system at all, they're a pure
   "pick any of the 5 base resources" hex.
2. **"In any combination"** for a city is a real, distinct rule from every
   other resource hex in the game: a city on a normal hex always gets 2 of
   the *same* resource (the hex only produces one type), but a city on a
   gold field may take, e.g., 1 brick + 1 ore — two independently-chosen
   resources, not forced to match. Any production-hook implementation
   needs a per-card resource picker for gold-field cities, not a single
   picker applied twice.

Scenario component tables list "2x gold fields" consistently across every
scenario that includes them (all except The Fog Islands' base set and a
couple others where the count still shows 2). Setup notes twice call out
that gold fields should specifically avoid getting red (6/8) discs in
variable setup (CN3083 p.11 "Through The Desert", p.18 "New World" —
"Gold fields should not receive red number discs").

## The pirate

**Trigger** (CN3083 p.2, confirmed verbatim): "When you roll a 7, you may
choose to move the pirate instead of the robber." Also triggered by
playing a Knight development card — CN3083 p.3: "When you play a Knight
card, you must 'Activate the Robber or the Pirate' (see page 2)." So in
base Seafarers (no Cities & Knights), the pirate is activated by the same
two triggers as the robber (a rolled 7, or a played Knight card) — there
is no separate "chase away" action here; that's the C&K knight-unit
mechanic layered on top, which CN3087 already documented (own units can
chase the pirate off a hex the way they chase the robber, and the pirate
can't be blocked by Taxation). This pass didn't find anything in CN3083
that contradicts that CN3087 note — it's consistent: base Seafarers' own
"activate the pirate" step is analogous to activating the robber, and
C&K's knight-based chase-away is described as an additional capability
layered on top of that, not documented here since CN3083 predates/doesn't
assume C&K is in play.

**Movement and effect** (CN3083 p.2, confirmed verbatim): "Move the
pirate to the frame or to a new sea hex. If you move it to a sea hex,
choose one player with a ship on that hex and steal 1 random resource
card from them." Two notable details:
- The pirate can be moved **to the frame** (effectively parked off any
  live sea hex) — a legal "park it somewhere harmless" option that the
  robber doesn't have (the robber must always sit on a land hex).
- Only players with a **ship** are eligible to be robbed by the pirate —
  it never steals based on a building alone, only a ship sitting on the
  hex it lands on.
- Only 1 pirate piece exists total, shared/moved by whoever triggers it —
  it isn't owned by a player.

**What it blocks:** new ships may not be placed on an edge of the pirate's
hex (placement rule above), and ships may not be moved to or from an edge
of the pirate's hex (movement rule above). It has no effect on roads,
settlements, or land-hex production — it only interacts with sea hexes
and ships.

## Development card changes in Seafarers (CN3083 p.3, confirmed verbatim)

Only 2 of the 5 base dev cards change behavior:
- **Road Building:** "You may use the Road Building card to build 2 roads,
  2 ships, or 1 road and 1 ship at no cost" (base game: 2 roads only).
- **Knight:** "When you play a Knight card, you must 'Activate the Robber
  or the Pirate'" (base game: robber only, no choice).
Monopoly, Invention/Year of Plenty, and Victory Point cards are
unchanged.

## Setup changes (CN3083 p.3)

Seafarers reuses "Variable Setup" from base Catan for placing starting
pieces, with one addition: "If you place a starting settlement on the
coast, you may place a ship on an adjacent empty sea edge instead of a
road." I.e., during setup only, a ship is a legal substitute for the
second road-equivalent piece when the settlement touches water.

Frame assembly: the base-Catan frame pieces are flipped so their
coastline/port markings don't show, then combined with the Seafarers
frame pieces per the scenario's map. (Physical-component detail, not
relevant to a digital board.)

## Scenarios (CN3083 pp.3–20; full list confirmed)

The rulebook explicitly separates 4 "basic" scenarios (simpler,
introduce only the core Seafarers additions) from 4 "advanced" scenarios
(each adds its own extra rule), plus one open-ended variant:

**Basic:**
1. **Heading for New Shores** (p.4–5) — a main island plus several small
   islands; starting settlements must go on the main island. First
   settlement built on each small island earns +2 VP (stacks per island).
   Win at 14+ VP.
2. **The Four Islands** (p.6–7; renamed **The Six Islands** in the 5–6
   player variant, CN3084 p.5) — multiple separate islands; each player's
   1–2 starting islands are their "home," the rest are "unexplored." +2 VP
   for the first settlement built on each unexplored island. Win at 13+ VP.
3. **The Fog Islands** (p.8–9) — extra hexes and number discs start
   face-down in stacks; building a ship/road adjacent to an empty hex
   space reveals the top hex (land hexes get a random number disc and
   grant 1 free resource card of the revealed type; sea hexes get nothing
   extra). Win at 12+ VP.
4. **Through the Desert** (p.10–11) — a desert splits the main landmass
   from a small land strip; small islands and the strip are "unexplored,"
   worth +2 VP each on first settlement. Win at 14+ VP.

**Advanced:**
5. **The Forgotten Tribe** (p.12–13) — settlements/robber restricted to
   hexes that actually have a number disc. 8 VP tokens and 4 face-down
   development cards sit on specific edges around the map; building or
   moving a ship onto one claims it. Ports are placed face-up randomly and
   claimed by ship the same way, then relocated next to a coastal
   settlement (staying ≥1 edge from any other port). Win at 13+ VP.
6. **Cloth for Catan** (p.14–15) — 8 "village" hexes on small islands each
   start with 5 cloth tokens; connecting a route (roads+ships, broken at
   non-owned buildings, same as Longest Route) from your building to a
   village claims 1 cloth token immediately, plus 1 more each time that
   village's number is rolled (from its own local supply, topped up from a
   10-token general supply once local runs low). A route that reaches a
   village becomes "closed" — its ships can't be moved, but it can still
   be extended/branched. Each pair of cloth tokens is worth 1 VP (odd one
   out is worth 0). Robber may not enter the 4 small islands; pirate can't
   move until you have at least one trade route to a village, and then may
   steal either a resource card or a cloth token. Ends when either a
   player hits 14+ VP, or 5+ villages run out of cloth tokens (highest-VP
   player wins that way, ties broken by most cloth tokens). Longest Route
   tile isn't used in this scenario at all. 3 starting settlements per
   player (not the usual 2) — first 2 placed without collecting resources,
   third placed in normal turn order collecting starting resources.
7. **The Pirate Islands** (p.16–17) — western "pirate islands" hold 4
   enemy fortresses (3 pirate-lair tokens stacked under a settlement
   piece each; fortresses never produce resources). No robber at all —
   only the pirate, which moves along a fixed path each turn by a number
   of hexes equal to the *lower* die (or either die on a double), attacking
   any player with a building adjacent to where it stops. Attack strength
   = the die value used to move; your defense = your warship count
   (built by revealing a Knight card — or a Victory Point card in 4-player
   games — to flip a ship on its side near your route's start; the
   converted card is removed from the game). Losing an attack costs 1
   random resource card per player plus 1 more per city; a tie does
   nothing; winning nets 1 free resource card. Each player may only build
   one unbranched ship line toward their own beachhead marker/fortress —
   reaching the beachhead unlocks building a settlement there. Attacking a
   fortress at end of Action phase rolls a die for pirate strength: your
   warship count beats it (remove 1 lair token), ties it (remove 1 ship
   nearest the fortress) or loses to it (remove 2 ships nearest the
   fortress). Clearing all 3 lair tokens converts the fortress into your
   own settlement (producing/upgradeable normally). Win by capturing your
   fortress AND holding 10+ VP. Largest Army and Longest Route tiles
   aren't used.
8. **The Wonders of Catan** (p.18–19) — a race to build one of 5 named
   Wonders, each gated behind a distinct prerequisite: **Great Bridge**
   (a building at a Great Bridge marker), **Great Wall** (a building at a
   Great Wall marker), **Grand Theater** (2 cities), **Grand Castle** (1
   city + 6+ VP), **Grand Monument** (1 city at a port + a 5+-segment
   route). Only 1 wonder per player, first to claim a given wonder locks
   out everyone else from it. Building it is 4 identical levels, each
   costing "the same 5 resources" per the rulebook text — **the exact
   resource-type breakdown per level wasn't legible from this pass** (it's
   printed as icons on the physical Wonders tile itself, not reproduced
   elsewhere in the rulebook text); confirm visually against the physical
   tile or a higher-res scan before hard-coding a cost. First settlement on
   a small island is worth +1 VP (not +2, unlike the basic scenarios).
   Win by either finishing your wonder, or holding 10+ VP with a
   higher wonder level than everyone else. No pirate in this scenario.

**Open-ended:**
- **New World** (p.20) — a variant, not a scenario: randomly place all
  hexes/number discs/ports within a frame (with the usual red-disc
  adjacency and gold-field-avoids-red-discs constraints) to generate a
  fresh island layout every game, rather than following a fixed or
  pre-scripted map. This is the natural fit for "Seafarers Scenario Maps"
  as a custom-board-shape feature, since it explicitly has no fixed
  layout to encode — it's closer to this app's existing board-shape
  editor than any of the 8 fixed/pre-scripted scenarios are.

## Seafarers 5–6 Player Expansion (CN3084)

**Paired-player turn structure** (CN3084 p.2, confirmed verbatim — this
is the CATAN 5–6 base mechanic, restated here since it governs how any
5–6 player Seafarers game actually plays):
- Players are grouped into pairs sharing one turn. For 5 players: player 1
  is the first player, player 2 is "the third player to the left of the
  first player." Same rule for 6 players.
- Turn order: Player 1 runs Production Phase then Action Phase exactly as
  a normal turn. Then Player 2 gets **only** an Action Phase, with the
  restriction that Player 2 **may not trade with other players** (may
  still trade with the bank/ports). Dice and player markers then pass one
  seat to the left.
- If Player 1 hits the scenario's win condition during their half of the
  turn, the game ends immediately — Player 2 never gets their Action
  Phase that round. If Player 2 wins during their half, the game ends
  immediately too.
- Dev cards bought while acting as Player 2 may be played later while
  acting as Player 1, and vice versa (same player, same hand — the
  "player 1/2" role is a per-turn hat, not a second player).

**Scenario list is unchanged except The Four Islands → The Six Islands**
(CN3084 p.3) — same 8 scenarios otherwise, plus New World.

**New content unique to 5–6 (not just "more of the same"):**
- **2 new Wonders** for The Wonders of Catan scenario when playing 5–6:
  **Lighthouse** ("Requires a building at one of the lighthouse markers to
  begin") and **Great Library** ("Requires 2 cities to begin") — bringing
  the total to 7 wonder tiles available (5 from base Seafarers + 2 new) in
  a 5–6 player game of that scenario (CN3084 p.11, confirmed).
- **2 Lighthouse markers** as a new placement-prerequisite component,
  parallel to the existing Great Wall/Great Bridge markers.
- **The Pirate Islands** scenario gets extra pirate-lair tokens for the
  extra players: 6 more (18 total vs. 12 in the 4-player version) — and a
  5–6-specific exception (CN3084 p.10): "When the pirate ship is on the
  '!' hex, skip the 'Pirate Attacks' step." In a 5-player game specifically,
  "do not use the purple piece locations."
- Component scaling only, no other new mechanic found: 10 additional
  hexes (7 seas, 2 gold fields, 1 desert), 2 sea frame pieces, 30 ships
  (15 per color × 2 new colors), 2 wonder markers, 2 beachhead markers,
  4 "X" markers, 20 cloth tokens, 16/48 VP tokens depending on scenario,
  6 pirate lair tokens (Pirate Islands only), 1 extra 2:1 port token, 2
  player aids, 2 paired-player markers.

## Things not fully confirmed in this pass

- **Exact per-level resource cost for each Wonder of Catan** — checked
  directly (rendered CN3083 pp.18-19 as images, not just text): the
  breakdown genuinely isn't in this rulebook at all. The rules text only
  says "pay the cost shown at the top of the [Wonder] tile" and "each
  level costs the same 5 resources" — the actual resource-type icons are
  printed solely on the physical Wonder tile component, which this
  rulebook never reproduces as a legible close-up (the following pages are
  the scenario board map and hex/number-disc counts, not tile art). Needs
  the physical tile or a clear photo of it. Only relevant once the
  Scenario Maps phase reaches Wonders of Catan specifically — not blocking
  for the Ships phase.
- **Exact hex-by-hex scenario map layouts** were not transcribed (each
  scenario page has a numeric hex/port/number-disc component table plus a
  board diagram image) — this doc captures the rules and one-line
  descriptions per the task scope, not full board recreations. Revisit
  with page-image rendering per scenario if/when the Scenario Maps phase
  needs to reproduce an official fixed layout exactly.
