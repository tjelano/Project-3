# Cities & Knights — Commodities & City Improvements (Phase A) — Design Spec

## Summary

The first of a 5-phase plan to bring the Cities & Knights and Seafarers
expansions into this game, each phase getting its own spec → plan →
implementation cycle:

1. **Commodities & City Improvements** (this spec)
2. Knights & Barbarians
3. Progress Cards (depends on #1 — cards are earned via improvement levels)
4. Seafarers — Ships & Open Sea
5. Seafarers — Scenario Maps (mostly content once #4 exists)

This spec covers Phase A only: cities adjacent to forest/pasture/mountains
hexes produce a commodity (paper/cloth/coin) alongside their normal
resource; players spend commodities climbing 3 improvement tracks
(Science/Trade/Politics); level 3 on a track grants a passive ability;
level 4/5 grants control of that track's Metropolis (an upgraded city
worth extra VP). All rules below are sourced directly from the official
Cities & Knights rulebook (CN3087, catan.com) and the physical City
Improvement board component, not from memory.

Every subsystem across all 5 phases is its own independent house rule —
mix-and-match, not one all-or-nothing "expansion mode" toggle. This spec's
piece is `citiesAndKnightsCommodities: boolean`.

## Global Constraints

These bind every phase of this expansion plan, not just this spec:

- **Placeholder assets first.** Every new visual element (models, icons,
  card art) ships with placeholder art — reused/tinted existing assets or
  simple icons — before any dedicated art is commissioned. Real art is a
  later, separate pass per asset.
- **Gated asset preloading.** Per the Hidden Tiles fix-wave precedent
  (`catan-3d/src/components/hud/GameSetupMenu.tsx`, preloading
  `hidden-tile.glb` only when that house rule is picked), every new
  expansion asset preloads only when its own house-rule flag is turned on
  in setup — never a blanket module-scope preload. A base-game-only
  session's asset payload must not grow no matter how many future phases
  ship.
- **Multiplayer sync** for all new state follows the existing pattern:
  round-trip through `MatchSnapshot` (optional fields, same as
  `revealedTileIds`), broadcast/apply split the same way settlements/roads
  already work.
- **House rules stay independently toggleable** with a sensible default —
  no phase may require another phase's rule to be on to function, unless
  the dependency is real (Progress Cards on Commodities is the one
  accepted exception, since progress cards are earned through improvement
  levels).

## Official rules reference

### Commodity production

Only cities produce commodities; settlements are unaffected. Only 3 of the
5 resource-producing hexes yield a commodity — fields and hills instead
give a city double the plain resource, same as base Catan already does.

| Hex | City collects |
|---|---|
| Forest | 1 lumber + 1 **paper** |
| Pasture | 1 wool + 1 **cloth** |
| Mountains | 1 ore + 1 **coin** |
| Fields | 2 grain (no commodity) |
| Hills | 2 brick (no commodity) |
| Desert | nothing |

### City Improvement tracks

3 tracks — Science, Trade, Politics. Each player has a cube per track,
starting at level 0 ("Basic City"). Moving from level N−1 to level N costs
discarding **N** matching commodities (level 1 costs 1, level 2 costs 2,
… level 5 costs 5) — confirmed against the physical board component.

| Level | Science (paper) | Trade (cloth) | Politics (coin) |
|---|---|---|---|
| 1 | School | Market | Town Hall |
| 2 | Library | Trading House | Embassy |
| 3 | Aqueduct | Merchant Guild | Fortress |
| 4 | Theater | Bank | Courthouse |
| 5 | University | Great Exchange | High Assembly |

**Level 3** grants a permanent passive ability:
- Science 3: if a roll grants you no production, take 1 free resource of
  your choice (not on a 7).
- Trade 3: at any time, trade 2 identical commodities for any 1 other
  commodity or resource.
- Politics 3: may promote strong knights (Level 2) to mighty knights
  (Level 3) — relevant once Phase B ships knights; harmless no-op until
  then.

**Metropolis:** one exists per track (3 total, shared across all
players). First player to reach level 4 on a track gains *temporary*
control of that track's Metropolis; first to reach level 5 gains
*permanent* control. A player may hold multiple Metropolises, each on a
different one of their own cities. Control is worth 2 VP, on top of the
city's own 2 VP (4 VP total for a Metropolis city). If you don't have a
spare city to place it on, you may not buy the level 4/5 improvement.

## Data model

`catan-3d/src/game/types.ts`:

```ts
export type CommodityType = 'paper' | 'cloth' | 'coin'
export type Commodities = Record<CommodityType, number>

export type ImprovementTrack = 'science' | 'trade' | 'politics'
export type CityImprovements = Record<ImprovementTrack, number> // 0–5 each
```

Mirrors the existing `ResourceType`/`Resources`/`RESOURCE_ORDER`/
`RESOURCE_LABELS`/`RESOURCE_COLORS` pattern — `COMMODITY_ORDER`,
`COMMODITY_LABELS`, `COMMODITY_COLORS`, plus:

```ts
export const COMMODITY_FOR_BIOME: Partial<Record<Biome, CommodityType>> = {
  forest: 'paper',
  pasture: 'cloth',
  mountains: 'coin',
}

export const IMPROVEMENT_TRACK_NAMES: Record<ImprovementTrack, string[]> = {
  science: ['School', 'Library', 'Aqueduct', 'Theater', 'University'],
  trade: ['Market', 'Trading House', 'Merchant Guild', 'Bank', 'Great Exchange'],
  politics: ['Town Hall', 'Embassy', 'Fortress', 'Courthouse', 'High Assembly'],
} // index 0 = level 1
```

`Player` gains:

```ts
commodities: Commodities
cityImprovements: CityImprovements
metropolisTracks: Set<ImprovementTrack> // 0-3 entries — a player may hold every Metropolis at once
```

`GameRules` gains:

```ts
citiesAndKnightsCommodities: boolean // default false
```

When toggled on during setup and `victoryPointTarget` is still at its
untouched default, pre-fill it to 13 instead of 10 (official C&K balance —
still a default, not a lock; the field remains manually editable exactly
as it is today).

`emptyResources()`-style helpers: `emptyCommodities()`, and a
`cityImprovements` zero-value `{ science: 0, trade: 0, politics: 0 }`,
both wired into `createInitialPlayers`.

Purchase-affordability logic mirrors `canAfford`/`deductCost`
(`catan-3d/src/game/types.ts:328-340`) — parallel functions operating on
`Commodities` and a per-level cost, or a small generalization of the
existing pair if that reads cleaner once written.

## Production hook

Exact hook point: `applyRollResult`'s production loop in `App.tsx`,
currently:

```ts
// App.tsx:1468-1488
for (const tile of tiles) {
  if (tile.number !== total) continue
  if (tile.id === robberTileId) continue

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
```

Fields/hills' "city gets 2 of the resource" behavior is already correct
and unchanged — that's standard Catan, not a C&K addition. The change is
narrow: when `gameRules.citiesAndKnightsCommodities` is on, a **city** on a
tile whose biome is in `COMMODITY_FOR_BIOME` collects 1 resource + 1
commodity instead of 2 resource, and the commodity is added to
`owner.commodities`. Forest/pasture/mountains settlements, and all
fields/hills/desert production, are untouched.

Science level 3's "free resource on no production" hooks into this same
production step: after the loop, if a player with `cityImprovements.science
>= 3` received nothing this roll (and it wasn't a 7), grant 1 resource of
their choice via the existing `DevCardResourcePicker`
(`catan-3d/src/components/hud/DevCardResourcePicker.tsx`), already used for
Year of Plenty — not a new interaction paradigm.

## Improvements UI & purchase

New HUD panel showing each player's 3 tracks (current level, next level's
name + cost, afford-check against `player.commodities`). Clicking a
track's next level spends the commodities and increments it, using the
same button-affordance pattern as the existing Settlement/City/Road/Dev
Card build buttons. Exact placement in the HUD is an implementation-time
decision (to be confirmed live against the running app, same as every
other HUD placement this session), not fixed here.

Metropolis purchase (level 4/5): requires an available city to place it on
(same city-selection interaction as building a City today — click a
qualifying own-city vertex). If the player has no spare city, the
level 4/5 purchase button is disabled with an explanatory label, mirroring
how build buttons already disable when unaffordable.

## Metropolis placeholder

No new geometry for v1. Reuses the existing per-color city GLB
(`catan-3d/src/assets/models/pieces/settlement-city-player-*.glb`) with a
visual differentiator decided once actually looking at it in-browser
(likely a scale-up plus a tint or a simple marker prop) — same "ship the
mechanic, defer the art" approach the Hidden Tiles mist review confirmed
worked well. `getScoreBreakdown` (`catan-3d/src/game/types.ts:277`) gains
a `metropolis` field: `metropolisTracks.size * 2` VP — a player may hold
all 3 Metropolises at once, so this sums across tracks rather than
assuming at most one, which the official rules don't limit.

## Multiplayer sync

`commodities`, `cityImprovements`, and Metropolis ownership are per-player
fields on the existing `Player` object, which already round-trips through
`MatchSnapshot.players` in full — no new snapshot field needed beyond what
carrying the extended `Player` shape already provides. Purchase actions
follow the same local-action-handler + broadcast + trusted-apply pattern
already used for settlement/road/city placement.

## Phase A asset list (placeholders)

- 3 commodity icons (paper/cloth/coin) — simple placeholder icons matching
  the existing resource `.jpeg` icon convention
  (`catan-3d/src/assets/icons/`), not full painted art yet.
- Metropolis visual differentiator — a tint/scale tweak to the existing
  city GLB, not a new model (see above).
- City Improvements HUD panel — plain UI, no new art assets required; can
  reuse existing panel chrome/typography conventions already established
  in the HUD.
- No new 3D models required for Phase A.

## Out of scope for v1 (this spec)

- **Progress cards** — Phase B. Not needed for commodities/improvements to
  function; the event die is not used anywhere in this spec.
- **Knights & Barbarians** — Phase C. Politics level 3's
  knight-promotion ability is a documented no-op until knights exist.
- **Event die / robber activation-deferral** — these are Phase C
  mechanics coupled to the barbarian track, not Phase A. The robber
  behaves exactly as it does today when this house rule is on alone.
- **Seafarers** (ships, gold hex, pirate ship, scenario maps) — Phases D/E,
  separate specs, sourced from the Seafarers rulebook when we get there.
- **City walls** and the +2 hand-size-on-7 mechanic — not part of
  Commodities/City Improvements proper in the rulebook's own structure;
  revisit whether it belongs in this phase or Phase C when writing that
  phase's spec (it's listed under "new build options" alongside knights in
  the rulebook, suggesting Phase C is the better home).
- **Dedicated Metropolis geometry, full commodity card art** — placeholder
  policy applies; real art is a future pass.
- **Any change to base-game production math** for non-C&K games — this
  house rule off means production behaves exactly as it does today.
