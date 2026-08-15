# Hidden Tiles House Rule — Design Spec

## Summary

A new house rule, "Hidden Tiles," that hides each tile's resource type,
number, or both until a player builds a settlement touching it. Hiding is
purely a rendering concern — the underlying tile data (biome, number) is
always intact and always drives production math; nothing about resource
distribution changes. The rule is symmetric: every player sees the same
hidden/revealed state, whether local pass-and-play or online (per-player
secret knowledge was explicitly ruled out — it only makes sense in online
mode, and this game supports both).

## Modes

`GameRules` gains one new field:

```ts
hiddenTiles: 'off' | 'numbers' | 'resources' | 'both'
```

- `'off'` — current behavior, unchanged.
- `'numbers'` — biome/terrain visible (so the model itself shows what it
  is), but the number chit is hidden.
- `'resources'` — number chit visible, terrain disguised behind the mist
  mesh.
- `'both'` — full mystery: mist mesh AND hidden number chit.

`DEFAULT_GAME_RULES` (`catan-3d/src/game/types.ts:153`) gets
`hiddenTiles: 'off'` added alongside the existing 6 fields.

## Reveal mechanic

**Trigger:** a tile reveals, permanently, the instant any vertex touching
it gets a settlement — including initial setup placements. City upgrades
need no separate hook: a city can only be built by upgrading an existing
settlement, whose tiles are already revealed by the time that happens.

**State:** new game state, `revealedTileIds: Set<string>` (or
`Record<string, true>`, matching the existing `settlements`/`roads`
by-ID-keying convention in `App.tsx`), empty at game start.

**Hook point:** `applySettlementPlacement` (`App.tsx:418`) — the single
trusted mutation for settlement placement, used identically for local
guarded builds AND applying an already-validated remote placement over the
network. Adding the reveal side-effect here, rather than at each of its
callers, guarantees local play, online play, and setup-phase placement all
reveal correctly with one code path. The tiles to reveal come from
`graph.vertexTileIds.get(vertexId)` (already used for resource granting at
`App.tsx:1084`) — no new adjacency lookup needed.

**Known interaction, not a gap:** the robber always starts on the desert
tile (`App.tsx:305`, `tiles.find(t => t.biome === 'desert')`), and the
robber piece is visibly sitting on it from turn one. So the desert tile is
effectively revealed from the start regardless of `hiddenTiles` — nothing
in this design fights that, it's just an accepted consequence of an
existing mechanic.

## Multiplayer sync

`revealedTileIds` must round-trip through `MatchSnapshot`
(`catan-3d/src/multiplayer/matchSnapshot.ts`) the same way `settlements`
and `roads` already do, so a reconnecting online player restores the
correct reveal state rather than re-hiding already-revealed tiles. Treated
as optional on the snapshot type (same pattern as `gameRules`,
`totalRollsThisGame`, etc.) so old saved snapshots without it don't break
`isPlausibleMatchSnapshot`'s validation — absent means "nothing revealed
yet," which is only wrong for an in-progress game reconnecting after this
feature ships, a one-time cosmetic-only edge case (worst case: a few
already-revealed tiles look hidden again after reconnect, self-correcting
as soon as anyone builds).

## Visual design

### Numbers hidden (`'numbers'` / `'both'`)

`NumberToken` (`catan-3d/src/components/TileDecorations.tsx`) doesn't
render the real digit for an unrevealed tile; a new mystery-chit variant
renders instead — same chit surface/position, blank or a "?" glyph, so an
unrevealed number reads differently from a desert's genuine absence of a
chit rather than being confused with one.

### Resources hidden (`'resources'` / `'both'`)

`BiomeTileModel` (`catan-3d/src/components/CatanBoard.tsx:68`) renders the
mist mesh instead of the real biome GLB when the tile is unrevealed. One
shared mist asset is reused across every currently-hidden tile regardless
of its real biome — that's the entire point, nothing about which mist
instance is showing leaks the biome underneath.

**Asset:** `hiddentile.glb` (already inspected — see prior conversation).
Measured bounding box vs. `mountains-tile.glb` (the tallest existing
biome, per `CatanBoard.tsx`'s own `BIOME_CHIT_Y_OFFSET` comment):

| | Width (X) | Depth (Z) | Height (Y) |
|---|---|---|---|
| mountains-tile.glb | 1.90 | 1.68 | 0.73 |
| hiddentile.glb | 1.78 | 1.91 | 0.87 |

Footprint needs a modest computed scale correction — same
"measure the model's own native size, then compute a scale factor" pattern
`RoadMesh` already uses via `ROAD_NATIVE_LENGTH`
(`catan-3d/src/components/GamePieces.tsx:132`), not a guess. Height already
exceeds mountains' with no scaling, so it fully covers even the tallest
tile as-is. Material is `OPAQUE` + double-sided (confirmed via
`gltf-transform inspect`), so it reads as solid from any camera angle —
the "wispy" look in the Meshy preview render was that render's lighting,
not real transparency. No baked animation, which is correct: motion comes
from the shader, not the mesh.

### Animated mist shader

Follows the exact pattern `Ocean.tsx` already establishes in this codebase
for "static mesh + GPU-animated surface" — `mat.onBeforeCompile` injecting
a custom uniform and GLSL into a standard material, ticked via `useFrame`,
with a graceful no-shader fallback if compilation ever fails
(`Ocean.tsx:106-145`, `shaderFailed` flag).

Difference from Ocean's use of the pattern: Ocean displaces vertex
positions (`transformed.y += ...` inside `#include <begin_vertex>`) to
make geometric waves. The mist instead perturbs the **fragment** shader —
sampling a noise function (simplex/Perlin, same family of well-known GLSL
noise as everything else in this space) using surface UVs plus a
`uTime`-driven scroll offset, and using that to modulate opacity/color —
so the surface pattern visibly swirls without any vertex moving.

**Reveal transition:** a second uniform, `uReveal`, animated 0→1 (rather
than snapped) when a tile enters `revealedTileIds` — the shader reads it
to fade the mist out instead of it vanishing instantly. Driven the same
way `uTime` is: ticked in the same `useFrame` callback, lerping toward a
target each frame.

## UI

The existing House Rules panel (`HouseRulesDropdown.tsx`) only knows how to
render boolean checkbox rows (`CHECKBOX_RULES`) plus the one special-cased
number field (victory point target). `hiddenTiles` is neither — it's a
4-way selector. Needs a new row type/control (e.g. a small segmented
button group: Off / Numbers / Resources / Both) added to that panel,
distinct from the existing ring-toggle row style. Exact placement/look is
an implementation-plan decision, not a spec-level one — flagging here only
that the existing row rendering can't just be reused unchanged.

## Out of scope for v1

- Per-player secret knowledge (explicitly ruled out — see Summary).
- A custom-modeled (non-shader) alternate mist look — the shader-driven
  approach on `hiddentile.glb` is v1; a fancier hand-authored asset is a
  swap-in upgrade path later if wanted, not blocking this.
- Texture/VRAM optimization on `hiddentile.glb`'s 3 baked 4096×4096
  textures — same oversized-texture pattern as the recent road model
  swap; user has already said to leave that alone for now.
- Any change to production/resource math — hiding is render-only, by
  design, everywhere in this spec.
