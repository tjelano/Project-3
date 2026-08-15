# Cities & Knights 5–6 Player Expansion — Rules Reference

Sourced from the official 2025 rulebook **CN3088** ("CATAN – Cities &
Knights 5–6 Player Expansion", a genuinely short 4-page pamphlet,
v6.250401), downloaded from catan.com. This is a small extension booklet,
not a full rulebook — it explicitly defers to the core Cities & Knights
rulebook (CN3087, already processed for Phase A) and the base CATAN 5–6
rulebook (CN3082, covered in `base-game-sanity-check.md`) for everything
it doesn't itself override. Page numbers below are 1-indexed physical
pages (footer "N of 3" — the pamphlet's own 3-page body, page 4 is just
credits).

## Headline finding: no new gameplay mechanic, only component scaling + the shared paired-player turn

This pamphlet does not introduce any 5–6-specific change to the barbarian
attack, the barbarian ship's movement, the attack-strength threshold, or
any City Improvement rule. Searching the extracted text for "barbarian"
turns up exactly one hit, inside the standard turn-overview player aid
("Roll the barbarian ship/resolve attack") — worded identically to how
CN3087 already describes it. There is no second barbarian ship, no
player-count-scaled attack strength, and no extra knight ability. Every
addition here is either (a) more physical copies of existing C&K
components for the 2 new player colors, or (b) the paired-player turn
structure already established by base CATAN 5–6 (CN3082) and Seafarers
5–6 (CN3084) — restated here because C&K 5–6 layers the same paired-turn
shell on top of C&K's own 4-phase turn instead of the simpler 2-phase
Catan/3-phase Seafarers turn.

## Components added (p.2, confirmed)

- **12 knights**: 4 basic, 4 strong, 4 mighty — "2x each color," i.e. 2 of
  each level for each of the 2 new player colors (6 knights per new
  player total, split 2/2/2 across levels — same per-player knight
  allotment implied for the original 4 colors in base C&K).
- **6 city walls** (3 per new color).
- **2 city improvement boards** (1 per new player) and **6 city
  improvement cubes** (3 per new player — one per track: Science/Trade/
  Politics).
- **18 commodity cards**: 6 paper, 6 cloth, 6 coin (for the 2 new players'
  hands).
- **2 VP tokens**.
- **2 paired player markers with plastic bases** (the physical "who is
  player 1/2 this turn" markers).
- **2 player aids** (1 per new player), reprinting the same City
  Improvement track costs/abilities already documented in Phase A's spec
  (Science 3 free-resource, Trade 3 2-for-1 commodity trade, Politics 3
  knight promotion) — no new ability text found, confirms Phase A's
  table is complete.

## Turn structure (p.3, confirmed verbatim)

"A turn consists of four phases" (vs. 3 for base Catan/Seafarers, since
C&K itself already has a Roll Dice phase separate from Production):
- **Player 1:** 1. Roll Dice Phase → 2. Production Phase → 3. Action Phase
  — i.e. exactly a normal C&K turn.
- **Player 2:** 4. Action Phase only, with the same restriction as every
  other 5–6 pairing: **may not trade with other players** (bank/port
  trades still allowed).

Paired-player role assignment is identical to base CATAN 5–6 and
Seafarers 5–6: for both 5 and 6 players, "the first player is player 1"
and "the third player to the left of the first player is player 2." Dice
and both player markers pass one seat left once player 2's Action Phase
ends (if the game hasn't already ended).

**Win condition unchanged:** "Player 1 takes their turn exactly as they
would in a game of Cities & Knights, including winning the game by
reaching **13 VPs**." This is an exact, independent confirmation of the
13-VP default that Phase A's spec already prescribes for
`citiesAndKnightsCommodities` (Phase A: "pre-fill it to 13 instead of
10"). If Player 1 wins mid-turn, Player 2's Action Phase never happens,
game ends immediately. If Player 2 reaches 13 VP during their own Action
Phase, same immediate-end behavior.

## Setup changes (p.3, confirmed verbatim)

"Complete the setup as described in the Cities & Knights rulebook with
the following changes: Create the board as described in CATAN 5–6, being
sure to use the sea frame from Cities & Knights that shows the barbarian
track." Also: "Add the 18 commodity cards to the cards from Cities &
Knights," and player-1/player-2 marker assignment happens alongside
normal first-player selection.

Component note (p.2): playing C&K 5–6 requires returning the *base*
Catan number discs to the box in favor of the CATAN 5–6 discs, and
returning "sea frame 1-6, the development cards, and the Largest Army
tile from CATAN" to the box — i.e., C&K brings its own development-card
deck and Largest Army tile (already true of base C&K, restated here since
this pamphlet assumes you're combining boxes).

## Interaction with Seafarers not covered here

This pamphlet is scoped strictly to "Cities & Knights + CATAN 5–6." It
never mentions Seafarers or Seafarers 5–6 anywhere in its 4 pages — there
is no official guidance in this source on running all three expansions
(Seafarers + Cities & Knights + 5–6 players) simultaneously. If a future
phase needs that combination, treat it as an unofficial extrapolation
(paired-player shell + Seafarers' 3-phase turn + C&K's roll/production
split, all stacked) rather than something directly sourced from a
rulebook — none of the 5 PDFs in this batch document the triple
combination.

## Net takeaway for the phase plan

Nothing here changes anything about how Phase A (Commodities & City
Improvements) or the planned Phase B (Knights & Barbarians) should work
for a 2–4 player game — this pamphlet only matters once/if the app adds a
5th or 6th player to a Cities & Knights game, and even then the only real
work is: (1) reuse whatever paired-player-turn shell base CATAN 5–6 ends
up implemented with, extended to insert a Roll Dice phase before
Production for player 1; (2) scale knight/city-wall/city-improvement/
commodity component pools for 2 more players; (3) keep the barbarian
attack math exactly as Phase B will already define it — nothing here
requires it to change with player count.
