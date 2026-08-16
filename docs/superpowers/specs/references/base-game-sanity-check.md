# Base CATAN — Sanity Check vs. `catan-3d/src/game/types.ts`

Sourced from the official 2025 rulebooks **CN3081** ("CATAN – The Game",
12 pages, v6.250401) and **CN3082** ("CATAN – 5–6 Player Expansion", 4
pages, v6.250401), both downloaded from catan.com. Per the task
prioritization, this app already implements base Catan correctly (built
and tested over many prior sessions), so this is a skim-and-flag pass
against `catan-3d/src/game/types.ts`, not a rules transcription. No code
was modified — every item below is a note for manual review.

## Confirmed matches (no action needed)

- **Longest Road → 2 VP at 5+ continuous roads.** CN3081 p.8, verbatim:
  "The first player to have 5 continuous roads in play receives this
  tile... The Longest Route tile is worth 2 VPs." Matches
  `LONGEST_ROAD_MIN_LENGTH = 5` and `LONGEST_ROAD_VP = 2` exactly.
- **Largest Army → 2 VP at 3+ played Knights.** CN3081 p.9, verbatim:
  "The first player to have 3 Knight cards in play receives this tile...
  worth 2 VPs." Matches `LARGEST_ARMY_MIN_KNIGHTS = 3` and
  `LARGEST_ARMY_VP = 2` exactly.
- **Win at 10 VP.** CN3081 p.10: "If you have 10 or more VPs at any point
  during your turn, the game ends immediately and you are the winner!"
  Matches `WINNING_SCORE = 10`.
- **Port ratios.** CN3081 p.7: 3:1 generic ports, 2:1 resource-specific
  ports, and a 4:1 default bank rate for players with no relevant port
  ("GENERAL TRADE WITH THE SUPPLY (4:1)"). This exactly matches
  `App.tsx`'s `getPortRate` (`catan-3d/src/App.tsx:1091-1100`):
  returns `2` for an owned matching-resource port, else `3` if any 3:1
  port is owned, else `4`.
- **Production amounts.** CN3081 p.6: 1 resource card per settlement, 2
  per city, on a matching hex roll. Matches `App.tsx`'s production loop
  (`amount = building.type === 'city' ? 2 : 1`).
- **Discard-on-7 threshold.** CN3081 p.6: "Each player who has more than 7
  resource cards must choose half (rounded down)... and return them to
  the supply." Matches `App.tsx`'s `discardRequiredCount =
  Math.floor(totalResourceCount(...) / 2)`, gated on the same "more than
  7" condition.
- **Setup placement order (Variable Setup).** CN3081 p.11: Round 1 goes
  in seating order starting with the first player; Round 2 starts with
  the **last** player and proceeds in **reverse** order. This is exactly
  the classic snake draft that `buildSetupOrder()`
  (`catan-3d/src/game/types.ts:257-260`) produces: ascending indices from
  `startIndex`, then that same list reversed.
- **Per-player piece counts are constant regardless of table size.**
  CN3081 p.2 (base box): 5 settlements, 4 cities, 15 roads per color.
  CN3082 p.1 (5–6 expansion): "10 settlements (5x each color)," "8 cities
  (4x each color)," "30 roads (15x each color)" for the 2 added colors —
  same per-player counts, not scaled up for a bigger table. Matches
  `STARTING_SETTLEMENTS = 5`, `STARTING_CITIES = 4`,
  `STARTING_ROADS = 15`.
- **Building costs** are only ever shown as icon grids in both PDFs'
  extracted text (never as plain numbers), so this pass could not
  re-derive them character-by-character from the rulebook text — but
  nothing in either PDF suggests the 2025 edition changed the
  longstanding standard costs already encoded as `SETTLEMENT_COST`
  (1 lumber/1 brick/1 wool/1 grain), `ROAD_COST` (1 lumber/1 brick),
  `CITY_COST` (3 ore/2 grain), `DEV_CARD_COST` (1 ore/1 grain/1 wool).
  Treat as very likely correct; a quick visual double-check of the
  player-aid icon grid (CN3081 p.3) would make this airtight but wasn't
  needed to spot a discrepancy in this pass.

## Gaps worth reviewing

1. **No finite resource bank.** CN3081 p.2 lists exactly 95 resource
   cards (19 per type), and p.6 has an explicit shortage rule: "If there
   are not enough resource cards in the supply to fulfill everyone's
   production, then no one receives any of that resource. However, if
   only one player is affected, give that player as many of those
   resource cards as remain in the supply." A grep of `catan-3d/src` for
   any resource-supply cap turned up nothing — the app appears to treat
   the bank as unlimited. This is a common, deliberate simplification in
   digital Catan implementations (it avoids a whole class of edge-case
   rulings), so it's flagged here as a known deviation to confirm is
   intentional, not a bug.

2. **5–6 player development card deck doesn't match the official
   addition.** CN3082 p.1 lists the 5–6 expansion's dev card contents as
   exactly **9 cards**: 6 Knight, 1 Monopoly, 1 Invention (Year of
   Plenty), 1 Road Building — **no additional Victory Point cards**. Added
   to the base 25-card deck (14 Knight/5 VP/2 Road Building/2 Year of
   Plenty/2 Monopoly), the official 5–6 player deck is 34 cards total:
   20 Knight, 5 VP, 3 Road Building, 3 Year of Plenty, 3 Monopoly.
   `buildDevCardDeck()` (`catan-3d/src/game/types.ts:182-191`) only takes
   a `victoryPointTarget` parameter and scales every card type by the
   same `victoryPointScale()` ratio — it has no player-count input at
   all. Since the player-count selector in `GameSetupMenu.tsx` already
   goes up to 6 (`LAYOUT.playerCount` has 6 boxes, and `PLAYER_COLORS`/
   `DEFAULT_COLOR_TOKENS` in `types.ts` already support `player-5`/
   `player-6`), **this means any 5–6 player game today draws from the
   same proportionally-scaled deck as a 2–4 player game**, not the
   official fixed +9 mix — worth deciding whether to special-case
   `buildDevCardDeck` on player count, or treat the current
   scale-by-VP-target behavior as an accepted simplification.

3. **CN3082's "Fixed Setup" has a 5-player-specific rule** ("In a
   5-player game, one color is not used... place the settlements of that
   color on the board without roads") that only applies to the official
   pre-printed fixed map layout. Since this app already uses a custom
   board-shape editor rather than the official fixed maps, this rule is
   almost certainly moot — flagged only in case a future "official fixed
   layout" option is ever added.

## Not checked in this pass (out of scope per task prioritization)

Exact hex/number-disc counts and distributions for the 5–6 player board
(CN3082 p.1: 11 additional terrain hexes, 28 number discs, 4 sea frame
pieces) weren't cross-checked against the board-generation code, since
this app's custom board-shape tooling already deviates intentionally from
the official fixed hex counts and isn't trying to reproduce the stock
5–6 layout exactly.
