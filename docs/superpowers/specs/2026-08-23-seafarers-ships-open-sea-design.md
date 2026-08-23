# Seafarers — Ships & Open Sea (Phase 4 of the C&K/Seafarers plan)

## Summary

Adds the core Seafarers mechanics — ships, gold fields, and the pirate — to `catan-3d`, plus one new sea-hex board shape to actually place them on. Rules sourced and verbatim-cited in `docs/superpowers/specs/references/seafarers-rules-reference.md` (CN3083/CN3084), which itself frames this as phase 4 of the combined Cities & Knights/Seafarers plan (phase 5, Scenario Maps, follows separately).

**Status:** this one spec covers the full phase; implementation ships across 4 sequential sub-plans, each its own PR — Board Foundation (biomes, board shape, sea model — no gameplay) → Ships & Longest Route → Robber & Pirate Migration → Gold Fields. A given sub-plan's own plan doc states which slice of this spec it delivers; until all 4 land, sections below describe the target design, not what's necessarily playable yet.

**In scope:** ship building/movement, Longest Route (roads+ships merged), gold-field production, the pirate (trigger/movement/steal, including its interaction with C&K's existing knight chase-away), the 2 Seafarers-modified dev cards (Road Building, Knight), the setup-phase ship substitution, and one new board shape with a sea ring + 2 gold fields.

**Explicitly out of scope (phase 5 or later):** all 8 named scenarios, the Wonders of Catan, the New World random-layout variant, and the Seafarers 5–6 player expansion (CN3084's paired-turn/component-scaling pamphlet).

## Global Constraints

Everything already established by the players-slice migration project applies unchanged: reducers are pure appliers; one client decides a non-deterministic value (a dice roll, a random steal, a player's resource pick) and every client — including the deciding one — applies the same decided result via a shared trusted-apply function, never re-deriving it (`CONVENTIONS.md` §1). New pieces of shared multiplayer state go into the reducer from day one, not `useState` — this phase is also the point where the pre-existing robber (currently `useState`, predating the reducer migration) moves into `BoardState` alongside the new pirate, so both share one foundation instead of building the pirate on a pattern already being phased out.

## Data Model

```ts
export interface BoardState {
  settlements: Record<string, Building>
  roads: Record<string, number>
  ships: Record<string, number>        // NEW — same shape as roads, edge id -> owning player id
  robberTileId: string                 // NEW — migrated out of App.tsx's useState, same non-nullable type (always sits on a hex)
  pirateTileId: string | null          // NEW — null = parked on the frame, the pirate's unique option
}
```

`Player` gains `shipsRemaining: number`, initialized the same way `roadsRemaining` is — both scale with `victoryPointScale`, and `STARTING_ROADS = 15` matches the components list's "15 ships per color" exactly, so `STARTING_SHIPS = 15` needs no new derivation.

`Biome` gains `'sea'` and `'gold'` (currently `'forest' | 'pasture' | 'fields' | 'hills' | 'mountains' | 'desert'`).

## Actions

```ts
// BoardAction additions
| { type: 'BUILD_SHIP'; edgeId: string; playerId: number; isSetup: boolean }
| { type: 'MOVE_SHIP'; fromEdgeId: string; toEdgeId: string; playerId: number }
// ROBBER_MOVED is not new — it already exists as a PlayersAction (handles the steal).
// reduceBoard gains its own case for the same action, writing action.tileId into
// state.robberTileId. This is the "one action, multiple sub-reducers" composition
// pattern the parent spec already established elsewhere — not a new pattern.

// PlayersAction addition
| { type: 'PIRATE_MOVED'; tileId: string | null; thiefId: number; victimId: number | null; stolenItem: StolenItem | null }
// Mirrors ROBBER_MOVED's exact shape. reduceBoard gets the position case (tileId),
// reducePlayers gets the steal case — which reuses ROBBER_MOVED's existing players-side
// case body verbatim (it's already fully generic: a resource/commodity transfer between
// thiefId and victimId keyed by stolenItem, with no robber-specific logic in it at all).
// Worth factoring into one shared helper both cases call, rather than duplicating the body.

| { type: 'GOLD_FIELD_RESOURCE_PICKED'; playerId: number; resource: ResourceType }
// Mirrors the existing SCIENCE_FREE_RESOURCE_PICKED action/case exactly — same resolution
// shape, different trigger.
```

`BUILD_SHIP`/`MOVE_SHIP`'s reducer cases are near-verbatim copies of the existing `BUILD_ROAD`/`REMOVE_ROAD` cases (a second piece type on a second `Record<string, number>` map) — no new reducer pattern.

## Longest Route

`calculateLongestRoad` (`game/trophies.ts`) needs two changes, both scoped entirely to this one function:

1. **A second edge source.** Build one combined `ownedEdgeIds` set from both `roads` and `ships` (filtered by `playerId`), plus an `edgeType: Map<edgeId, 'road' | 'ship'>` lookup.
2. **A type-transition constraint.** Thread the *incoming* edge's type through the DFS recursion. At each vertex, before taking an outgoing edge: if there's an incoming type and it differs from the outgoing edge's type, only allow the transition when `settlements[vertex]?.ownerId === playerId` (a new `hasOwnBuilding` check, independent of the existing opponent-blocking check). The very first edge from any starting vertex has no incoming type, so it's never constrained.

Precedence: the existing opponent-building/knight block (`isBlockedByOpponent`) still stops all further exploration from a vertex entirely, regardless of edge type — unchanged. The new own-building requirement is a *separate*, per-edge check that only fires on a type mismatch — so an empty (no building) vertex now blocks a road↔ship transition even though it never blocked a same-type continuation. This matches CN3083's rule ("roads and ships are only considered part of the same route if they connect... at one of your buildings") precisely.

Backward-compatible by construction: with zero ships owned, every edge's type is uniformly `'road'`, so the type-mismatch branch never fires — existing behavior and the existing test suite are unchanged, the same technique the function already uses for its C&K knight-blocking parameter (default to an empty structure, existing callers see no behavior change).

Ship *movement*'s own restriction ("may not move a ship that is part of a continuous line connecting two of your buildings, even if an opponent's building interrupts it") is a separate, pre-dispatch eligibility check on the move action itself — not something this function needs to handle.

Naming: `LONGEST_ROAD_MIN_LENGTH` may want renaming to match "Longest Route," but that's cosmetic, not a data-model or algorithm change — left to the implementation plan's judgment.

## Robber & pirate

**Robber migration.** `robberTileId` moves from `App.tsx`'s `useState` into `BoardState`. No new action — `ROBBER_MOVED` (already a `PlayersAction`) gains a `reduceBoard` case for the same dispatch.

**Pirate.** New `PIRATE_MOVED` action (see Actions above). Triggered by the same two conditions the robber already has — a rolled 7, or a played Knight card — except Seafarers requires a real choice at that trigger point ("you may choose to move the pirate instead of the robber") where today there is only one path. This is new UI/game-phase surface (a new `gamePhase` value or a picker step), not a reducer concern — left to the implementation plan to shape rather than fixed here.

Movement/effect, confirmed verbatim against CN3083: the pirate can be parked on the frame (`pirateTileId: null`) — a legal "off the board" state the robber never has. It only interacts with sea hexes and ships: new ships can't be placed on, or moved to/from, an edge of the pirate's hex; only a player with a **ship** on the pirate's landing hex is eligible to be robbed (never a building alone).

**Chase Away the Robber (existing C&K mechanic) extends to the pirate.** Confirmed by reading the actual mechanic, not assumed: it is not "move the piece again" — after the normal move resolves (steal happens as usual), an armed knight gets *deactivated* as a side effect (`KNIGHT_DEACTIVATED_AFTER_CHASE`), dispatched alongside the move. The pirate's version reuses this exact dispatch-time check-and-deactivate pattern. One necessary addition: `canChaseRobber`'s current eligibility check only tests adjacency to `robberTileId` — it needs a pirate-adjacency counterpart (a knight next to a sea hex should be able to chase the pirate off it), confirmed against CN3087's own note that C&K's knight chase-away already documents applying to whichever piece is active.

## Gold fields

`BIOME_TO_RESOURCE[tile.biome]` maps each biome to one fixed resource — gold fields don't have one; the resource is player-chosen, and a city picks **2 independently** (not forced to match, confirmed verbatim against CN3083's "any combination" wording). This can't go through the synchronous `RESOURCES_PRODUCED` loop the way every other hex does, since it needs player input mid-resolution.

This codebase already has the identical shape solved: **Science level 3's free-resource pick** (`scienceFreeResourcePlayerIds` + `SCIENCE_FREE_RESOURCE_PICKED`). Gold fields reuse the resolution action directly — `GOLD_FIELD_RESOURCE_PICKED` mirrors `SCIENCE_FREE_RESOURCE_PICKED`'s shape exactly. **The pending-queue shape does not carry over as-is**, though: `scienceFreeResourcePlayerIds` is a plain `number[]` of player IDs, which only works because Science level 3 grants at most one pick per player per roll. Gold fields break that assumption — a single city on one gold field alone needs 2 independent picks, and a player could have multiple producing gold-field buildings in the same roll. The queue needs to allow the same player to appear multiple times (one entry per pending pick, shifted off one at a time), not a simple id-array.

## Dev card changes

**Road Building → also ships.** `playRoadBuilding` spends the card and arms a "place 2 free pieces" mode via `freeRoadsRemaining` — the same counter setup-phase free roads and Diplomacy's free rebuild already share (confirmed: a plain `useState(0)`, exactly one consumption site, `isFreeRoad = !isSetup && freeRoadsRemaining > 0`). Seafarers changes what a free piece can *be* ("2 roads, 2 ships, or 1 of each"), not how many — the cleanest fit is letting a free ship placement consume the same budget a free road already does, no new counter.

**Knight → robber-or-pirate choice.** Same new UI choice point as the pirate's own trigger, above — no additional design surface beyond what's already noted there.

## Setup change

During Variable Setup, a ship can substitute for the second road-equivalent piece when the settlement touches water. Both `BUILD_ROAD` and `BUILD_SHIP` already carry `isSetup: boolean` — the setup-flow eligibility check just needs to allow either piece type when the settlement is coastal; no reducer changes beyond what's already in the Actions section.

## New board shape

Reuses three existing mechanisms — no new ones:

1. Add `'sea'` and `'gold'` to `Biome` (Data Model, above).
2. Add one new `BoardShapeId` (e.g. `'seafarersBasic'`) — a land-hex ring plus a surrounding sea-hex ring, in the same `BoardCell[]` format (`{ col, row }`) every other shape already uses.
3. Pre-pin the sea ring and the 2 gold-field cells via `BIOME_OVERRIDES_BY_SHAPE`, a new `Partial<Record<BoardShapeId, Record<string, Biome>>>` table that `buildHexBoard` applies for built-in shapes — `customBiomeOverrides` remains the separate override path the custom map editor uses for user-painted boards, and `buildHexBoard`'s wrapper picks between the two based on which kind of shape is being built.

`buildHexBoardFromCells` treats overrides in two ways. A cell overridden to a biome that's still part of the normal land-biome pool has that biome removed from `pool` via `pool.indexOf(override)`, which no-ops harmlessly when the override isn't a pool member — this pre-existing mechanism is unchanged. A cell overridden to `'sea'` or `'gold'` is different: both are structurally excluded from `BIOME_WEIGHTS`, so they can never be drawn from `pool` at all, which means they must also be excluded from the *sizing* math up front, not just the drawing. `poolTileCount = tileCount - nonPoolPaintedCount` (where `nonPoolPaintedCount` counts only cells overridden to `'sea'`/`'gold'`) feeds both `desertCountFor` and `buildBiomePool`, so the pool is sized for exactly the cells that will actually draw from it. Land cells keep drawing randomly from the correctly-sized pool as today; sea/gold cells are fixed.

**One real code change is needed, though — not zero.** The number-disc assignment (`number = biome === 'desert' ? null : numberSequence[...]`) and its pool-sizing count (`actualNonDesertCount = biomes.filter((biome) => biome !== 'desert').length`) both only exclude `'desert'`. Sea hexes never produce either — CN3083's own number-disc set is sized for land/gold hexes only — so both spots need to treat `'sea'` the same as `'desert'`. Gold fields **do** get a number disc (they produce, just with a player-chosen resource instead of a fixed one), so they're unaffected and need no exclusion.

## Out of Scope

The 8 named scenarios (Heading for New Shores, The Four/Six Islands, The Fog Islands, Through the Desert, The Forgotten Tribe, Cloth for Catan, The Pirate Islands, The Wonders of Catan), the New World random-layout variant, and the Seafarers 5–6 player expansion (CN3084) — all phase 5 or later, per the rules-reference doc's own framing and this project's existing precedent of deferring C&K's own 5-6 player expansion the same way.

## Testing

Same approach as every reducer slice in this codebase: direct Vitest unit tests on the pure reducer cases, no React rendering needed, no mocks. `calculateLongestRoad` gets new fixture-based tests covering mixed road/ship routes (continuing through an own building, breaking at an empty vertex, breaking at an opponent's building/knight regardless of type) alongside its existing all-road test suite, which must keep passing unchanged. `board.ts`/`players.ts` get new `describe` blocks for `BUILD_SHIP`, `MOVE_SHIP`, `ROBBER_MOVED`'s new board-side case, `PIRATE_MOVED` (both reducers' cases), and `GOLD_FIELD_RESOURCE_PICKED`, following the exact conventions the players-slice migration project already established (per-literal `as const` casts, isolation tests via `toEqual`/reference identity).
