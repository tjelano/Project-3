# Cities & Knights — Progress Cards Reference

Sourced from CN3087 pp.13-16, confirmed by rendering the pages as images
(not text extraction — the flattened text jumbled these enough that an
earlier pass in this project undercounted the deck at 20 cards; the real
count, read directly off the pages, is 25 unique cards across 3 unevenly
sized decks, all totaling 54 physical cards as the component list already
said). For Phase B (Progress Cards) — not needed for Phase A.

Each deck's total (18 cards) is drawn from a different number of unique
card types — decks are NOT an even 6/6/6 split.

## Science (10 unique types, 18 cards)

| Card | Qty | Effect |
|---|---|---|
| Alchemy | 2 | Play at the start of the Roll Dice phase, before rolling. Set the production dice to the result you want, then roll and resolve the event die as normal. |
| Crane | 2 | Build 1 city improvement for 1 commodity less than normal. Only 1 Crane per improvement; can reduce a level-1 improvement to free. |
| Engineering | 1 | Build 1 city wall at no cost. |
| Invention | 2 | Swap 2 number discs of your choice (except 2, 6, 8, or 12). No building needs to be adjacent to either disc. The robber does not move with a swapped disc. |
| Irrigation | 2 | Take 2 wheat cards for each field hex adjacent to at least one of your buildings. Take as many as remain if the supply runs short. |
| Medicine | 2 | Upgrade one settlement to a city for 1 wheat + 2 ore (instead of the normal city cost). Only 1 Medicine per settlement upgraded this way. |
| Mining | 2 | Take 2 ore cards for each mountain hex adjacent to at least one of your buildings. |
| Road Building | 2 | Build 2 roads at no cost. |
| Smithing | 2 | Take the "Promote a Knight" action on up to 2 of your knights at no cost. A knight may only be promoted once per turn (this doesn't bypass that). |
| Victory Point: Printing | 1 | Play immediately into your player area, even off-turn. Worth 1 VP. |

## Trade (6 unique types, 18 cards)

| Card | Qty | Effect |
|---|---|---|
| Commercial Harbor | 2 | Offer each other player one of your resource cards; they must give you 1 commodity card of their choice in exchange (or you take your card back if they have none). One offer per player, any time during your turn. |
| Guild Dues | 2 | Look at the hand of a player with more VPs than you. Take any 2 cards of your choice (resource and/or commodity) from them. |
| Merchant | 6 | Take control of the merchant piece; place it on any land hex next to one of your buildings. While controlled, trade that hex's resource (not commodity) at 2:1. Control is worth 1 VP. |
| Merchant Fleet | 2 | Name 1 resource or commodity. For the rest of this turn, make any number of 2:1 trades with the supply using that type. |
| Resource Monopoly | 4 | Announce one resource type. Each player must give you 2 of that resource if they have them (or their last one if they only have 1). |
| Trade Monopoly | 2 | Announce one commodity type. Each player must give you 1 of that commodity if they have it. |

## Politics (9 unique types, 18 cards)

| Card | Qty | Effect |
|---|---|---|
| Diplomacy | 2 | Remove an "open" road (open = an end not next to your own road/building, and not part of a continuous route between two of your buildings/knights). Removing your own lets you immediately build 1 free road; removing an opponent's returns it to their supply. |
| Encouragement | 2 | Activate all your knights at no cost. |
| Espionage | 3 | Look at another player's hand of progress cards; you may take 1 and add it to your hand. VP cards can't be taken this way. |
| Intrigue | 2 | Take the "Displace a Knight" action without using one of your own knights. The displaced knight must start on an intersection connected to at least one of your routes. |
| Sabotage | 2 | Each player with as many or more VPs than you must discard half their resource and/or commodity cards (rounded down). |
| Taxation | 2 | Move the robber to a new hex; steal 1 random resource/commodity card from each player with a building there (only 1 card even if they have multiple buildings on the hex). Progress cards can't be stolen. Only playable after the first barbarian attack (once the robber is on the board). |
| Treason | 2 | Choose another player — they must remove one of their knights. You may then place one of your own knights of the same strength or lower, matching the removed knight's active/inactive status. They must remove a knight even if you can't place one; if they remove a mighty knight, you may place a mighty knight even without having built that level of improvement. |
| Victory Point: Constitution | 1 | Play immediately, even off-turn. Worth 1 VP. |
| Wedding | 2 | Each player with more VPs than you must give you 2 resource and/or commodity cards of their choice (or as many as they have, if fewer than 2). |

## Notes for Phase B implementation

- 2 unique names are shared with base-game dev cards but behave
  differently here: this deck's "Road Building" and the base game's
  existing `roadBuilding` dev card type do the same thing (2 free roads) —
  worth checking whether Phase B reuses the existing `DevCardType` value
  or needs its own, since C&K's version lives in a different deck
  (Science) with a different draw mechanism (event die + city improvement
  level, not a purchased dev card).
- Card art needed: 25 unique illustrations (this project's asset policy —
  see the Phase A spec's Global Constraints — ships with placeholders
  first regardless).
- No separate card-back art needed per deck — this codebase already
  renders every hidden/opponent card type with one shared generic back
  texture (`PlayerHand3D.tsx`'s `backArt`), not the physical game's
  per-deck backs.
