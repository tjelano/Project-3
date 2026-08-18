# Cities & Knights — Knights & City Walls (Phase C1) — Design Spec

## Summary

The third of the 5-phase Cities & Knights/Seafarers plan to ship (Phase A —
Commodities & City Improvements, Phase B — Progress Cards — both shipped).
The original plan's Phase 2, "Knights & Barbarians," is large enough to
split into two specs of its own: this one covers knight pieces, their
actions, and city walls — everything that's independently playable without
the barbarian attack existing yet. A second spec (Phase C2, not yet
written) will cover the barbarian track, the 3D ship, attack resolution,
robber activation, and the "Defender of Catan" VP tokens — it depends on
this spec's knight pieces existing to have anything to compare strength
against.

All rules below are sourced directly from the official Cities & Knights
rulebook (CN3087, catan.com, 6th edition — confirmed the same edition
already used for Phase A/B by cross-checking card names and the Progress
Card draw wording, which match verbatim). Text extraction was used for
prose rules; build costs are icon-only in this edition's layout, so pages
8–9 were rendered as images at 300 DPI and read directly — the same
practice this project adopted after an earlier text-extraction error on
this same rulebook.

This spec's piece is `citiesAndKnightsKnights: boolean`, default `false`.
Every subsystem across all 5 phases remains its own independent house
rule. This flag is only meaningful alongside `citiesAndKnightsProgressCards`
(Smithing/Encouragement/Intrigue/Treason/Engineering are progress cards
that act on knights/walls) — turning it on alone lets players recruit and
move knights with no progress-card interaction, which is harmless, not
broken, matching the "provably inert when its dependency is off" bar
established in Phase A/B. No UI-disabling machinery is added for this;
it's a plain independent checkbox, same as every other C&K rule.

## Global Constraints

(Carried forward from Phase A/B's specs, still binding)

- **Placeholder assets first.** Knight tokens ship as simple placeholder
  3D geometry (a small cone/pawn shape, scaled by strength, colored by
  owner, per this session's explicit choice), standing on the intersection.
  City walls ship as a simple low ring/base placeholder around the city's
  existing mesh. Real art can replace both later without changing any
  game logic.
- **Gated asset preloading.** Any new geometry/textures preload only when
  `citiesAndKnightsKnights` is on.
- **Multiplayer sync** for all new state follows the existing pattern:
  round-trip through `MatchSnapshot` as optional fields; broadcast/apply
  split the same way every other structural mutation in `App.tsx` works —
  local actor computes and broadcasts, receivers apply after validating.
- **House rules stay independently toggleable**, set before the game
  starts, not changed mid-game — matching every existing `GameRules` flag.
- **Turn-ownership guard convention.** Every new handler that acts on
  `players[currentPlayerIndex]` gets both an `isMyTurn` check and the
  panel-level UI gate, even where the UI already blocks it — this project
  hit a real multiplayer exploit in Phase B (Task 7) from skipping this,
  and a second layer of the same gap post-merge (GameHud's
  `canPlayProgressCards`). Every knight/wall action in this plan needs
  both layers from the start, not bolted on after a review catches it.

## Naming — Avoiding Collisions

`game/types.ts` already has `DevCardType: 'knight'` (the base game's
Knight/Soldier development card) and `Player.knightsPlayed: number` (that
card's play count, driving the existing `largestArmy` trophy). Cities &
Knights' knight **pieces** are a completely different concept — same
"Road Building" collision problem Phase B solved for
`progressRoadBuilding`. New types/fields here are named to avoid any
overlap: `KnightPiece`, `Player.knightPieces`, `Player.knightSupply`.
`largestArmy`/`knightsPlayed` are untouched by this spec — they're a
pre-existing base-game mechanic that keeps working independently (note:
official C&K rules retire the base dev-card deck entirely, which this
codebase does not currently enforce when `citiesAndKnightsProgressCards`
is on — a pre-existing gap from Phase B, out of scope here, worth a
separate look someday but not bundled into this plan).

## Data Model

```ts
export type KnightStrength = 'basic' | 'strong' | 'mighty'

export const KNIGHT_STRENGTH_VALUE: Record<KnightStrength, number> = {
  basic: 1,
  strong: 2,
  mighty: 3,
}

export interface KnightPiece {
  id: string
  ownerId: number
  strength: KnightStrength
  active: boolean
  vertexId: string
}
```

- `Player.knightPieces: KnightPiece[]` — on-board knights only.
- `Player.knightSupply: Record<KnightStrength, number>` — starts
  `{ basic: 2, strong: 2, mighty: 2 }` (all 6 physical tokens available from
  turn 1, 2 per strength, mirrors the `settlementsRemaining`/
  `citiesRemaining` supply-cap pattern already on `Player`). Recruiting
  consumes 1 `basic` from supply — recruiting is restricted to basic
  strength by a separate rule, not by the starting supply record itself.
  Promoting moves 1 unit from the source strength's bucket to the next
  strength's bucket (basic→strong always allowed if supply has a `strong`
  available; strong→mighty additionally requires the promoting player's
  own Politics track to be at level 3+). If a displaced knight has nowhere
  to go, it's removed from the board and returned to its owner's supply at
  its own strength.
- `Player.cityWalls: string[]` — vertex IDs of the player's walled cities.
  Capped at 1 per city (checked against the vertex) and **3 board-wide
  across all players** — a shared, contested resource, not a per-player
  supply (confirmed from the rulebook image: "you may have a maximum of 3
  city walls built at the same time," no per-player qualifier).
- `GameRules.citiesAndKnightsKnights: boolean`, default `false`.

Costs (confirmed via rendered rulebook page images, not text extraction,
since this edition shows them as icons only):

| Action | Cost |
|---|---|
| Recruit a knight (always places as basic, inactive) | 1 wool + 1 ore |
| Activate a knight | 1 grain |
| Promote a knight (basic→strong or strong→mighty) | 1 wool + 1 ore |
| Build a city wall | 2 brick |

## Board UI — Placement & Knight Actions

New `KnightLayer.tsx`, following the established self-contained overlay
pattern (`RobberLayer.tsx`, `TileSwapLayer.tsx`, `MerchantLayer.tsx`) —
does not modify `BoardInteractions.tsx`'s existing settlement/road vertex
hitboxes, keeping this new, higher-risk feature isolated from
already-shipped building placement.

**Knights HUD panel** (new, alongside `ProgressCardsPanel`/
`CityImprovementsPanel`): lists the viewer's 6 knight slots grouped by
strength. Each slot shows one of:
- Not yet recruited — grayed, "Recruit" button enabled if a `basic` slot
  remains in supply and the cost is affordable.
- On-board, inactive — shows which intersection, "Activate" button.
- On-board, active — "Promote" / "Move" / "Displace" / "Chase Robber"
  buttons (each only enabled when the specific action is currently legal
  for that knight — e.g. "Chase Robber" only if adjacent to the robber's
  hex, "Promote" only if a next-strength slot remains in supply and, for
  strong→mighty, Politics 3+).

Selecting an action arms `KnightLayer` to highlight legal 3D-board
targets — the actual placement/target choice happens on the board, not in
the HUD:

1. **Recruit** → highlights empty intersections connected to the viewer's
   own roads (no Distance Rule check, unlike settlements).
2. **Move** → highlights empty intersections reachable along the viewer's
   own continuous routes. Reuses `game/trophies.ts`'s existing route
   adjacency traversal, extended so movement can pass through
   intersections holding the mover's own pieces but not another player's.
3. **Displace** → highlights opponent knights that are both weaker and
   reachable the same way. Clicking one auto-resolves: the displaced
   knight moves to any of ITS owner's other connected empty intersections
   (implementation picks one deterministically — no extra prompt, since
   the rules place no choice constraint on which one) or is removed to
   supply if none exist. The active/inactive status of the displaced
   knight is unchanged.
4. **Chase Robber** → reuses the *existing* `RobberLayer` tile-picker +
   steal flow verbatim, just triggered from this new entry point instead
   of a rolled 7.
5. **City walls** — no new board-picking mode. A "Build Wall" button
   appears contextually on the viewer's own eligible cities (next to the
   existing settlement→city upgrade affordance), since the target is
   already implied by context.

Every handler here is guarded with both `isMyTurn` and the panel-level UI
gate, per the Global Constraints above.

## Longest Route Interaction

- `game/trophies.ts`'s longest-route calculation must treat every
  intersection occupied by *any* knight (active or inactive, any owner) as
  a route-blocker, the same way it already stops at settlements/cities.
  This is a real behavior change to an existing, already-tested function —
  the highest-risk single edit in this plan. New test cases are required
  for "a knight breaks a road that would otherwise be/extend the longest
  route," in addition to the existing suite passing unchanged for boards
  with no knights.
- `BoardInteractions.tsx`'s road-building vertex/edge hitboxes gain one
  new check: a road cannot be built through a vertex occupied by
  *another* player's knight. Building through your own knight is
  unaffected — a knight never blocks its own owner.

## Hand Limit (City Walls)

The existing discard-on-7 threshold (`game/discard.ts`, per Phase B's
discard-pipeline work) changes from a flat `7` to
`7 + 2 × (that player's own cityWalls.length)` when
`citiesAndKnightsKnights` is on. Each wall is independent per player (a
player's hand limit only counts their own walls, not the shared 3-wall
board pool).

## Progress Card Unstubs (5 of the 6 stubbed in Phase B)

Engineering, Smithing, Encouragement, Intrigue, and Treason move from
"not yet implemented" no-ops to real implementations, reusing the
mechanics above:

- **Engineering** — build 1 city wall at no cost (skips the 2-brick cost,
  still subject to the 1-per-city and 3-board-wide caps).
- **Smithing** — promote up to 2 of the player's own knights, each for
  free (skips the wool+ore cost; still subject to supply caps and the
  strong→mighty Politics-3 gate; still "once per knight per turn," see
  below).
- **Encouragement** — activate all of the player's own inactive knights
  at no cost.
- **Intrigue** — take the Displace action without using one of the
  player's own knights as the mover; the displaced knight must be on an
  intersection connected to at least one of the player's own routes.
  **No strength restriction** — unlike an ordinary Displace action (which
  requires the mover to be strictly stronger than the target), Intrigue can
  displace an opponent's knight of ANY strength, including a mighty one
  (confirmed via two independent rulebook sources against CN3087: "You may
  displace an opponent's knight... connected to at least one of your
  routes" — no mention of relative strength at all). Task 14's own
  implementation initially modeled this as a virtual mover with
  `strength: 'mighty'` reusing the ordinary Displace helper's own
  strictly-weaker-than filter, on the theory that the top strength would
  let every target through — that's wrong: the filter excludes any target
  AT LEAST AS STRONG as the mover (`>=`, not `>`), so a virtual 'mighty'
  mover still wrongly excludes an opposing knight that is ALSO mighty (a
  tie). The fix (Task 14 review round) factored the shared
  reachability/ownership check out of `knightDisplaceTargets` into its own
  `reachableOpponentKnights` (`game/knights.ts`), with no strength filter
  at all, and Intrigue calls that directly instead of constructing a
  virtual mover of any strength.
- **Treason** — target another player, who must remove one of their
  knights (their choice of which); the acting player may then place one
  of their own knights of the same strength-or-lower and matching
  active/inactive status, following normal placement rules (and may place
  a mighty knight even without Politics 3 if the removed knight was
  mighty).

Taxation stays stubbed this phase — it requires the robber to be
"active," which only happens after the first barbarian attack (Phase C2).

**Once-per-turn promotion tracking:** the rulebook's "a knight may only be
promoted once per turn" means per knight *instance*, not one promotion
action per turn total — Smithing explicitly promotes 2 different knights
in one play. Implementation tracks a `promotedThisTurn: Set<knightId>`
(or equivalent), cleared at turn start, not a single boolean.

## Scoring

No changes. Knights and city walls are both worth 0 VP directly (confirmed
from the rulebook: "0 VP" printed next to both on the reference card).

## Multiplayer Sync

- `Player.knightPieces`, `Player.knightSupply`, and `Player.cityWalls`
  round-trip through `MatchSnapshot` as new optional fields, normalized on
  restore with sensible empty/starting-value fallbacks — matching the
  exact fix Phase B's final review had to make for `Player.commodities`/
  `cityImprovements` (a Critical finding there), so this plan must not
  repeat that gap.
- Knight recruit/activate/promote/move/displace and city wall builds all
  follow the established broadcast/trusted-apply split: local actor
  computes and broadcasts the resulting state change; receivers validate
  before applying (matching the payload-validation hardening added in
  Phase B's Important 2 finding, e.g. bounding indices/quantities rather
  than trusting the payload blindly).
- `resetGame`/`restoreFromSnapshot` must reset/restore all new per-player
  state — this project has hit the "forgot the reset case" bug class at
  least 3 times across Phase A and B; explicitly checking this is now a
  standing requirement, not a one-off catch.

## Out of Scope for This Spec (Phase C2 territory)

- The barbarian track, the 3D barbarian ship, and attack resolution.
- Robber activation gating. Officially the robber should sit inert until
  the first barbarian attack; that gate doesn't exist in this codebase yet
  and is tied to the barbarian attack mechanic itself (Phase C2's job to
  add). Until then the robber keeps behaving as it does today — movable
  on any 7, same as the base game. This phase's "Chase Away the Robber"
  knight action reuses that same always-active robber; once Phase C2 adds
  the gate, this action's behavior becomes correctly conditional
  automatically, no rework needed here.
- The Taxation progress card (needs robber activation).
- "Defender of Catan" VP tokens.
- Seafarers' knight-on-ships rules (knights moving across sea hexes) —
  not applicable, Seafarers itself isn't implemented yet (Phase 4/5 of
  the original plan).
- The pre-existing gap where base-game Development Cards remain
  purchasable alongside Progress Cards (official C&K rules retire them
  entirely) — noted above, not fixed here.
