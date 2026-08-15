# Hidden Tiles House Rule Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Hidden Tiles" house rule (Off / Numbers / Resources / Both) that hides a tile's number and/or terrain until a player builds a settlement touching it, using an animated mist mesh for the hidden-terrain look.

**Architecture:** A pure `revealTilesForVertex` function tracks which tiles have been revealed, hooked into the single existing settlement-placement mutation point. Rendering reads that state to swap in a mist mesh (animated via a `mat.onBeforeCompile` shader injection, mirroring `Ocean.tsx`'s established technique) and/or a blank number chit. Reveal state round-trips through `MatchSnapshot` for online reconnects.

**Tech Stack:** React Three Fiber, Three.js (`onBeforeCompile` GLSL injection), Vitest.

## Global Constraints

- Hiding is a **rendering-only** concern — `tile.number`/`tile.biome` are read directly for production math everywhere they already are today; nothing in this plan changes resource distribution.
- The rule is **symmetric** — one shared `revealedTileIds` set for the whole game, not per-player. No task in this plan should introduce per-player visibility state.
- Reveal is **permanent** — a tile never re-hides once in `revealedTileIds`.
- The desert tile is expected to read as "revealed" from turn one (the robber starts there, visibly) — this is an accepted consequence of an existing mechanic, not something any task here should try to prevent.
- No semicolons, 2-space indent, comments explain *why* not *what* (existing codebase convention).
- Verify every task with `npx tsc -b` (build-mode — NOT `tsc --noEmit`) and `npx eslint <changed files>` from `catan-3d/`; run `npx vitest run` for tasks that add/touch tests.

---

### Task 1: `hiddenTiles` field on `GameRules`

**Files:**
- Modify: `catan-3d/src/game/types.ts:134-160`

**Interfaces:**
- Produces: `GameRules.hiddenTiles: 'off' | 'numbers' | 'resources' | 'both'`, `DEFAULT_GAME_RULES.hiddenTiles === 'off'`. Every later task that reads house rules uses this exact field name and these exact 4 string values.

- [ ] **Step 1: Add the field to the interface**

In `catan-3d/src/game/types.ts`, right after `doublesRerollRule: boolean` (line 150), add:

```ts
  // Hides a tile's number, resource type, or both until a settlement is
  // built on a vertex touching it — reveal is permanent and shared by every
  // player (no per-player secret knowledge). Purely a rendering concern:
  // tile.number/tile.biome are always the real values everywhere else.
  hiddenTiles: 'off' | 'numbers' | 'resources' | 'both'
```

- [ ] **Step 2: Add the default**

In `DEFAULT_GAME_RULES` (line 153), add `hiddenTiles: 'off',` alongside the other 6 fields.

- [ ] **Step 3: Verify**

Run: `npx tsc -b` from `catan-3d/`
Expected: clean (no consumer of `GameRules` breaks, since every existing construction of a `GameRules` value either spreads `DEFAULT_GAME_RULES` or will be caught here as a real compile error to fix in a later task if any exists).

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/game/types.ts
git commit -m "feat: add hiddenTiles field to GameRules"
```

---

### Task 2: Pure reveal-tracking logic

**Files:**
- Create: `catan-3d/src/game/hiddenTiles.ts`
- Test: `catan-3d/src/game/hiddenTiles.test.ts`

**Interfaces:**
- Consumes: `vertexTileIds: Map<string, string[]>` — the exact type of `BoardGraph.vertexTileIds` (`catan-3d/src/data/boardGraph.ts`).
- Produces: `revealTilesForVertex(revealedTileIds: ReadonlySet<string>, vertexId: string, vertexTileIds: Map<string, string[]>): Set<string>` — Task 3 calls this by this exact name/signature from `App.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `catan-3d/src/game/hiddenTiles.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { revealTilesForVertex } from './hiddenTiles'

function graphWith(entries: [string, string[]][]): Map<string, string[]> {
  return new Map(entries)
}

describe('revealTilesForVertex', () => {
  it('adds every tile touching the vertex to the revealed set', () => {
    const graph = graphWith([['v1', ['t1', 't2', 't3']]])
    const result = revealTilesForVertex(new Set(), 'v1', graph)
    expect(result).toEqual(new Set(['t1', 't2', 't3']))
  })

  it('keeps tiles already revealed and does not duplicate them', () => {
    const graph = graphWith([['v1', ['t1', 't2']]])
    const result = revealTilesForVertex(new Set(['t1', 't9']), 'v1', graph)
    expect(result).toEqual(new Set(['t1', 't2', 't9']))
  })

  it('returns an unchanged copy for a vertex with no tiles', () => {
    const graph = graphWith([])
    const before = new Set(['t1'])
    const result = revealTilesForVertex(before, 'unknown-vertex', graph)
    expect(result).toEqual(new Set(['t1']))
    expect(result).not.toBe(before) // always a new Set, never the input mutated
  })

  it('never mutates the input set', () => {
    const graph = graphWith([['v1', ['t1']]])
    const before = new Set<string>()
    revealTilesForVertex(before, 'v1', graph)
    expect(before.size).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/game/hiddenTiles.test.ts`
Expected: FAIL — `Cannot find module './hiddenTiles'`

- [ ] **Step 3: Write the implementation**

Create `catan-3d/src/game/hiddenTiles.ts`:

```ts
/**
 * A tile reveals permanently the instant a settlement lands on any vertex
 * touching it — including setup-phase placements. City upgrades need no
 * separate call: a city can only replace an existing settlement, whose
 * tiles are already revealed by the time that happens.
 *
 * Always returns a NEW Set (never mutates revealedTileIds) so callers can
 * use it directly as a useState updater — the exact same by-reference-
 * change contract every other piece of board state in this codebase
 * (settlements, roads) already relies on for React to notice the update.
 */
export function revealTilesForVertex(
  revealedTileIds: ReadonlySet<string>,
  vertexId: string,
  vertexTileIds: Map<string, string[]>,
): Set<string> {
  const touchedTiles = vertexTileIds.get(vertexId) ?? []
  const next = new Set(revealedTileIds)
  for (const tileId of touchedTiles) next.add(tileId)
  return next
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/game/hiddenTiles.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/game/hiddenTiles.ts catan-3d/src/game/hiddenTiles.test.ts
git commit -m "feat: add pure reveal-tracking logic for hidden tiles"
```

---

### Task 3: Wire reveal state into App.tsx

**Files:**
- Modify: `catan-3d/src/App.tsx` (state declaration near other `useState`s, `applySettlementPlacement` at line 418, and wherever `<CatanBoard>` is rendered)

**Interfaces:**
- Consumes: `revealTilesForVertex` (Task 2), `graph.vertexTileIds` (already in scope in `App.tsx`).
- Produces: `revealedTileIds: Set<string>` state, threaded as a prop into `<CatanBoard>` alongside `gameRules.hiddenTiles` — Task 8 (`CatanBoard.tsx`) consumes both under these exact prop names: `hiddenTilesMode` and `revealedTileIds`.

- [ ] **Step 1: Add the state**

Near the other board-state `useState` calls in `App.tsx` (alongside `settlements`/`roads`), add:

```ts
// Which tiles have had a settlement built on a touching vertex — drives
// the Hidden Tiles house rule's mist/blank-chit rendering. Empty at game
// start regardless of hiddenTiles mode; 'off' mode just means CatanBoard
// never checks this set. Never re-hides a tile once added — see
// game/hiddenTiles.ts.
const [revealedTileIds, setRevealedTileIds] = useState<Set<string>>(new Set())
```

- [ ] **Step 2: Hook the reveal into `applySettlementPlacement`**

In `applySettlementPlacement` (`App.tsx:418`), add one line — it runs unconditionally (not gated on `hiddenTiles !== 'off'`) since tracking an empty-effect reveal set costs nothing and keeps the state always-correct if the house rule setting itself changes reasoning simple:

```ts
  const applySettlementPlacement = (vertexId: string, playerId: number, isSetup: boolean) => {
    setSettlements((prev) => ({ ...prev, [vertexId]: { ownerId: playerId, type: 'settlement' } }))
    setRevealedTileIds((prev) => revealTilesForVertex(prev, vertexId, graph.vertexTileIds))
    setPlayers((prev) =>
```

Add the import at the top of `App.tsx`:

```ts
import { revealTilesForVertex } from './game/hiddenTiles'
```

- [ ] **Step 3: Thread the state down to `CatanBoard`**

Find the existing `<CatanBoard tiles={...} />` usage and add the two new props:

```tsx
<CatanBoard tiles={tiles} hiddenTilesMode={gameRules.hiddenTiles} revealedTileIds={revealedTileIds} />
```

(`CatanBoard`'s prop types are extended in Task 8 — this task's `tsc -b` will show a type error against `CatanBoard`'s CURRENT signature until Task 8 lands; that's expected and resolves once Task 8 is done. Note this in the task report rather than treating it as this task's own bug.)

- [ ] **Step 4: Reset on new game**

Find wherever other board state (`settlements`, `roads`) gets reset when starting a new game and add `setRevealedTileIds(new Set())` alongside them, so a "New Game" click doesn't carry over reveal state from the previous match.

- [ ] **Step 5: Verify**

Run: `npx tsc -b` — expect the one `CatanBoard` prop-mismatch error described in Step 3 (not a regression, resolves in Task 8) and otherwise clean.
Run: `npx vitest run` — expect all existing tests still passing (76/76 before this task).

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: track revealed tiles and hook into settlement placement"
```

---

### Task 4: Multiplayer snapshot round-trip

**Files:**
- Modify: `catan-3d/src/multiplayer/matchSnapshot.ts`
- Modify: `catan-3d/src/App.tsx` (wherever `saveMatchSnapshot`/`restoreFromSnapshot` build/read the snapshot object)

**Interfaces:**
- Consumes: `revealedTileIds` state from Task 3.
- Produces: `MatchSnapshot.revealedTileIds?: string[]`.

- [ ] **Step 1: Add the optional field**

In `catan-3d/src/multiplayer/matchSnapshot.ts`, add to the `MatchSnapshot` interface, near the other optional/backward-compatible fields (e.g. next to `totalRollsThisGame`):

```ts
  // Optional for the same reason boardShapeId is — snapshots saved before
  // Hidden Tiles existed won't have it. restoreFromSnapshot treats absent
  // as "nothing revealed yet," which only under-reveals a handful of
  // already-built tiles on a reconnect to an in-progress pre-feature
  // match — cosmetic only, self-corrects the moment anyone builds again.
  revealedTileIds?: string[]
```

- [ ] **Step 2: Serialize on save**

Wherever `App.tsx` builds the `MatchSnapshot` object passed to `saveMatchSnapshot`, add:

```ts
revealedTileIds: Array.from(revealedTileIds),
```

(`Set` doesn't survive `JSON.stringify` as itself — this converts at the one serialization boundary, same reasoning as every other Map/Set-shaped piece of state in this snapshot.)

- [ ] **Step 3: Deserialize on restore**

Wherever `App.tsx`'s `restoreFromSnapshot` reads snapshot fields back into state, add:

```ts
setRevealedTileIds(new Set(snapshot.revealedTileIds ?? []))
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b` and `npx eslint catan-3d/src/multiplayer/matchSnapshot.ts catan-3d/src/App.tsx`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/multiplayer/matchSnapshot.ts catan-3d/src/App.tsx
git commit -m "feat: round-trip revealed tiles through match snapshots"
```

---

### Task 5: Mist tile asset — placement, scale, rotation

**Files:**
- Create: `catan-3d/src/assets/models/hidden-tile.glb` (copied from the user-provided `hiddentile.glb`)

**Interfaces:**
- Produces: the asset file + 2 named constants (`HIDDEN_TILE_ROTATION_Y`, `HIDDEN_TILE_SCALE`) that Task 6 uses by these names.

- [ ] **Step 1: Copy the asset**

```bash
cp "/c/Users/tjela/Documents/Claude Websites/Portfolio/Project 3/hiddentile.glb" \
   "catan-3d/src/assets/models/hidden-tile.glb"
```

- [ ] **Step 2: Record the measured rotation/scale as constants**

These are computed, not guessed, from `gltf-transform inspect` measurements already taken (see the design spec):

| | Width (X) | Depth (Z) | Height (Y) |
|---|---|---|---|
| forest/mountains (standard) | 1.90 | 1.68 | — |
| hidden-tile.glb (raw) | 1.78 | 1.91 | 0.87 |

The raw footprint is long on Z where standard tiles are long on X — the same "authored with X/Z swapped" situation `CatanBoard.tsx`'s `BIOME_MODEL_ROTATION_Y` already documents and fixes for `hills-tile.glb`. A 90° Y rotation swaps the spans (post-rotation: X≈1.91, Z≈1.78), then a single uniform scale of `0.94` brings both within a few percent of standard (X≈1.79, Z≈1.67) while leaving height (0.87 × 0.94 ≈ 0.82) still ~12% taller than mountains' own 0.73 — comfortable coverage of the tallest biome tile with no separate Y-axis scale needed.

These values are a computed best estimate from bounding-box measurement, not a substitute for a live look — Task 8 Step 3 below is a required visual check, not optional polish.

This task has no separate file to create for the constants — they're defined directly in Task 6's component, since that's their only consumer. Note them here as: `HIDDEN_TILE_ROTATION_Y = Math.PI / 2`, `HIDDEN_TILE_SCALE = 0.94`.

- [ ] **Step 3: Commit**

```bash
git add catan-3d/src/assets/models/hidden-tile.glb
git commit -m "feat: add hidden-tile mist mesh asset"
```

---

### Task 6: Animated mist tile component

**Files:**
- Create: `catan-3d/src/components/MistTile.tsx`

**Interfaces:**
- Consumes: `hidden-tile.glb` (Task 5), `useClonedModel` (`catan-3d/src/hooks/useClonedModel.ts`).
- Produces: `<MistTile revealed={boolean} />` — Task 8 (`CatanBoard.tsx`) renders this in place of `<BiomeTileModel>` for a hidden-resource tile.

- [ ] **Step 1: Write the component**

Create `catan-3d/src/components/MistTile.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useClonedModel } from '../hooks/useClonedModel'
import hiddenTileUrl from '../assets/models/hidden-tile.glb'

// See Task 5 in the Hidden Tiles implementation plan for how these were
// measured (gltf-transform inspect against mountains-tile.glb, the
// tallest existing biome) — a 90° authoring-orientation fix (same
// situation CatanBoard.tsx's BIOME_MODEL_ROTATION_Y already documents for
// hills-tile.glb) plus a uniform scale to match the standard tile
// footprint while keeping height comfortably above the tallest tile.
const HIDDEN_TILE_ROTATION_Y = Math.PI / 2
const HIDDEN_TILE_SCALE = 0.94

// How long the dissolve-away takes once a tile reveals, in seconds.
const REVEAL_FADE_SECONDS = 0.4

// Same swirling-noise technique as Ocean.tsx's WAVE_GLSL — summed sine
// waves at incommensurate directions/frequencies/speeds, the established
// "alive without a real noise texture" trick already used in this
// codebase, just reused here to modulate fragment brightness (a roiling
// mist density) instead of vertex height.
const MIST_GLSL = /* glsl */ `
  uniform float uTime;

  float catanMistDensity(vec2 p, float t) {
    float n = 0.0;
    n += sin(dot(p, vec2( 1.7,  0.6)) * 3.1 + t * 0.35) * 0.5;
    n += sin(dot(p, vec2(-0.9,  1.3)) * 4.7 - t * 0.51) * 0.3;
    n += sin(dot(p, vec2( 0.4, -1.8)) * 6.2 + t * 0.72) * 0.2;
    return n * 0.5 + 0.5; // remap [-1, 1] -> [0, 1]
  }
`

/**
 * The hidden-terrain mist for a Hidden Tiles ('resources'/'both' mode)
 * tile that hasn't been revealed yet. Static shape (hidden-tile.glb) +
 * animated fragment shader (this file) are deliberately separate concerns
 * — see the design spec. `revealed` plays a scale-down dissolve rather
 * than an instant pop; CatanBoard.tsx (Task 8) stops rendering this
 * component entirely once the tile is actually in revealedTileIds.
 */
export function MistTile({ revealed }: { revealed: boolean }) {
  const instance = useClonedModel(hiddenTileUrl)
  const groupRef = useRef<THREE.Group>(null)
  const shaderRef = useRef<THREE.WebGLProgramParametersWithUniforms | null>(null)
  const { gl } = useThree()

  // Same reasoning as Ocean.tsx: a broken shader must fall back to the
  // model's own plain baked material (still fully opaque — still
  // successfully hides the tile, just without the swirl) rather than
  // rendering nothing. Shader link failures don't throw a catchable JS
  // exception in three.js; onShaderError is the one hook it exposes.
  const [shaderFailed, setShaderFailed] = useState(false)

  useEffect(() => {
    const previous = gl.debug.onShaderError
    // eslint-disable-next-line react-hooks/immutability
    gl.debug.onShaderError = (context, program, vertexShader, fragmentShader) => {
      console.error('[Catan] Hidden-tile mist shader failed to compile/link — falling back to a static mist mesh.', {
        vertexLog: context.getShaderInfoLog(vertexShader),
        fragmentLog: context.getShaderInfoLog(fragmentShader),
        programLog: context.getProgramInfoLog(program),
      })
      setShaderFailed(true)
    }
    return () => {
      gl.debug.onShaderError = previous
    }
  }, [gl])

  // Materials from a cloned GLTF scene are shared BY REFERENCE across
  // every clone (Three.js's Object3D.clone() shallow-copies materials) —
  // explicitly cloning each mesh's material here gives this specific
  // MistTile instance its own independent shader/uniform set, so multiple
  // simultaneously-hidden tiles never fight over one shared uTime hookup.
  // Textures themselves are still shared by reference (cheap — this
  // doesn't duplicate the 46MB of baked texture data, just the small
  // material property object and its own onBeforeCompile hook).
  useMemo(() => {
    if (shaderFailed) return
    instance.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      const material = (child.material as THREE.Material).clone()
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 }
        shader.fragmentShader = shader.fragmentShader
          .replace('void main() {', `uniform float uTime;\n${MIST_GLSL}\nvoid main() {`)
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
             float catanDensity = catanMistDensity(vUv * 3.0, uTime);
             diffuseColor.rgb *= mix(0.75, 1.15, catanDensity);`,
          )
        shaderRef.current = shader
      }
      child.material = material
    })
  }, [instance, shaderFailed])

  useFrame(({ clock }, delta) => {
    const shader = shaderRef.current
    if (shader) shader.uniforms.uTime.value = clock.elapsedTime

    // Dissolve-away on reveal: linear shrink to 0 over REVEAL_FADE_SECONDS
    // rather than vanishing instantly.
    const group = groupRef.current
    if (!group || !revealed) return
    const step = (HIDDEN_TILE_SCALE / REVEAL_FADE_SECONDS) * delta
    group.scale.setScalar(Math.max(0, group.scale.x - step))
  })

  return (
    <group ref={groupRef} rotation={[0, HIDDEN_TILE_ROTATION_Y, 0]} scale={HIDDEN_TILE_SCALE}>
      <primitive object={instance} />
    </group>
  )
}
```

- [ ] **Step 2: Verify it builds**

Run: `npx tsc -b` and `npx eslint catan-3d/src/components/MistTile.tsx`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add catan-3d/src/components/MistTile.tsx
git commit -m "feat: add animated mist tile component"
```

---

### Task 7: Mystery number chit

**Files:**
- Modify: `catan-3d/src/components/TileDecorations.tsx`

**Interfaces:**
- Produces: `<NumberToken value={...} hidden={boolean} yOffset={...} />` — extends the existing prop signature with one new optional prop. Task 8 passes `hidden` based on `hiddenTilesMode`/`revealedTileIds`.

- [ ] **Step 1: Extend `NumberToken`'s props**

In `catan-3d/src/components/TileDecorations.tsx`, change the signature:

```ts
export function NumberToken({ value, yOffset = 0, hidden = false }: { value: number; yOffset?: number; hidden?: boolean }) {
```

- [ ] **Step 2: Render a blank chit face when hidden**

The label texture is built from `String(value)` — swap to a mystery glyph when hidden, and drop the hot-number red coloring (6/8 aren't meaningfully "hot" if the player can't see they're 6/8):

```ts
  const isHot = !hidden && (value === 6 || value === 8)

  const label = useMemo(
    () => createLabelTexture(hidden ? '?' : String(value), { fontPx: 96, color: isHot ? '#a32020' : '#2b2b2b' }),
    [value, isHot, hidden],
  )
```

- [ ] **Step 3: Verify**

Run: `npx tsc -b` and `npx eslint catan-3d/src/components/TileDecorations.tsx`
Expected: clean. `hidden` defaults to `false`, so every existing call site (none pass it yet) is unaffected.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/components/TileDecorations.tsx
git commit -m "feat: add hidden/mystery state to NumberToken"
```

---

### Task 8: Wire hidden/reveal rendering into CatanBoard

**Files:**
- Modify: `catan-3d/src/components/CatanBoard.tsx`

**Interfaces:**
- Consumes: `MistTile` (Task 6), `NumberToken`'s `hidden` prop (Task 7), `hiddenTilesMode`/`revealedTileIds` props (Task 3's `<CatanBoard>` call site).
- Produces: `CatanBoard`'s new prop signature — this is the type Task 3's `tsc -b` error (Step 5 there) resolves against.

- [ ] **Step 1: Add the new props to `CatanBoard` and thread them to `HexTile`**

In `catan-3d/src/components/CatanBoard.tsx`, add the import and update both component signatures:

```ts
import { MistTile } from './MistTile'
import type { GameRules } from '../game/types'
```

```tsx
const HexTile = memo(function HexTile({
  tile,
  hideResource,
  hideNumber,
  isRevealed,
}: {
  tile: HexTileData
  hideResource: boolean
  hideNumber: boolean
  isRevealed: boolean
}) {
  const elevation = BIOME_ELEVATION[tile.biome]
  return (
    <group position={[tile.x, 0, tile.z]}>
      <group position={[0, TILE_HEIGHT / 2 + elevation, 0]}>
        <ModelErrorBoundary label={`${tile.biome} tile`}>
          {hideResource ? <MistTile revealed={isRevealed} /> : <BiomeTileModel tile={tile} />}
        </ModelErrorBoundary>
        {tile.number !== null && (
          <NumberToken value={tile.number} yOffset={BIOME_CHIT_Y_OFFSET[tile.biome] ?? 0} hidden={hideNumber} />
        )}
      </group>
    </group>
  )
})

export const CatanBoard = memo(function CatanBoard({
  tiles,
  hiddenTilesMode,
  revealedTileIds,
}: {
  tiles: HexTileData[]
  hiddenTilesMode: GameRules['hiddenTiles']
  revealedTileIds: ReadonlySet<string>
}) {
  return (
    <group>
      {tiles.map((tile) => {
        const isRevealed = revealedTileIds.has(tile.id)
        const hideResource = (hiddenTilesMode === 'resources' || hiddenTilesMode === 'both') && !isRevealed
        const hideNumber = (hiddenTilesMode === 'numbers' || hiddenTilesMode === 'both') && !isRevealed
        return <HexTile key={tile.id} tile={tile} hideResource={hideResource} hideNumber={hideNumber} isRevealed={isRevealed} />
      })}
    </group>
  )
})
```

**Judgment call to make with the running app, not from reading code:** `hideResource` flips to `false` the instant `isRevealed` flips `true`, at which point `HexTile` swaps from `<MistTile revealed={false}>` straight to `<BiomeTileModel>` — for `MistTile`'s own dissolve-out animation to actually be visible rather than skipped, `hideResource` needs to stay `true` for `REVEAL_FADE_SECONDS` past the reveal moment (e.g. tracking tiles "mid-reveal" separately from "revealed" in `CatanBoard`), OR an instant swap is fine for v1 and `MistTile`'s scale-animation branch is dead weight to delete. Decide by watching it happen, not by re-reading this code.

- [ ] **Step 2: Verify**

Run: `npx tsc -b` (should now be fully clean, including Task 3's earlier prop-mismatch) and `npx eslint catan-3d/src/components/CatanBoard.tsx`.
Run: `npx vitest run` — 76/76 (no test in this suite touches `CatanBoard.tsx` directly, so this just confirms nothing else broke).

- [ ] **Step 3: Manual verification in the dev server**

Start a local game with House Rules → Hidden Tiles set to each of the 4 modes in turn (UI control added in Task 9 — do this step after Task 9 lands) and confirm: tiles render mist/blank-chit correctly per mode, building a settlement reveals exactly the touching tiles, and the mountains tile (tallest) is fully covered by the mist with no terrain poking through at a few different camera angles.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/components/CatanBoard.tsx
git commit -m "feat: render mist mesh and mystery chits for hidden tiles"
```

---

### Task 9: House Rules UI — 4-way mode selector

**Files:**
- Modify: `catan-3d/src/components/hud/HouseRulesDropdown.tsx`

**Interfaces:**
- Consumes: `rules.hiddenTiles`, `onChange` (already-existing props of `HouseRulesDropdown`).
- Produces: a rendered row in the panel that calls `onChange({ ...rules, hiddenTiles: <mode> })` — no new exported interface, this is the leaf UI.

- [ ] **Step 1: Add a segmented-control row below the checkbox grid**

`CHECKBOX_RULES`'s existing row rendering (`RuleRow`) is boolean-only (a ring toggle) — `hiddenTiles` needs 4 selectable states, so this is a new row type, not a `CHECKBOX_RULES` entry. Add it as its own row, styled consistently with the existing VP-target row (same `ROW_FONT_SIZE_PX`/`ROW_VERTICAL_PADDING_PX`/divider treatment), between the checkbox grid and the VP-target row:

```tsx
const HIDDEN_TILES_OPTIONS: { value: GameRules['hiddenTiles']; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'numbers', label: 'Numbers' },
  { value: 'resources', label: 'Resources' },
  { value: 'both', label: 'Both' },
]
```

```tsx
<div
  className="flex flex-col animate-house-rules-row-in"
  style={{
    gap: ROW_RING_GAP_PX,
    paddingTop: ROW_VERTICAL_PADDING_PX,
    paddingBottom: ROW_VERTICAL_PADDING_PX,
    borderTop: `1px solid ${GRID_DIVIDER_COLOR}`,
    animationDelay: `${(CHECKBOX_RULES.length + 1) * STAGGER_STEP_MS}ms`,
  }}
>
  <span className="truncate font-display text-gold" style={{ fontSize: ROW_FONT_SIZE_PX }}>
    Hidden tiles
  </span>
  <div className="flex" style={{ gap: ROW_RING_GAP_PX }}>
    {HIDDEN_TILES_OPTIONS.map((option) => (
      <button
        key={option.value}
        type="button"
        onClick={() => setRule('hiddenTiles', option.value)}
        aria-pressed={rules.hiddenTiles === option.value}
        className={`rounded-md border px-2 py-1 font-body text-xs ${
          rules.hiddenTiles === option.value
            ? 'border-gold bg-gold/20 text-gold'
            : 'border-glass-border bg-white/5 text-white/70'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
</div>
```

This is a starting point, not a locked-in visual — the House Rules panel has already gone through several rounds of live visual tuning against reference art in this session. Treat the exact look of this new row (spacing, button styling) the same way: build it, then check it live against the panel's existing rows and adjust to match, rather than treating this code block as final.

- [ ] **Step 2: Verify**

Run: `npx tsc -b` and `npx eslint catan-3d/src/components/hud/HouseRulesDropdown.tsx`
Expected: clean.

- [ ] **Step 3: Manual verification in the dev server**

Open House Rules, confirm all 4 mode buttons render, clicking each updates `aria-pressed` correctly and visually highlights the active one, and the row's spacing doesn't visually collide with the checkbox grid above or the VP-target row below.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/components/hud/HouseRulesDropdown.tsx
git commit -m "feat: add Hidden Tiles mode selector to House Rules panel"
```

---

## Self-Review Notes

- **Spec coverage:** every section of the design spec (modes, reveal mechanic, multiplayer sync, both visual modes, the shader, the UI) maps to a task above.
- **Known open judgment calls, flagged explicitly rather than hidden:** Task 8's note on the reveal-dissolve timing needing a live check; Task 9's row styling being a first pass, not final. These are called out deliberately — real behavior (timing, visual fit) that can't be fully pinned down by reading code, matching how the rest of this session's UI work got finalized (build, then look, then adjust).
- **Type consistency check:** `hiddenTiles` type, `revealTilesForVertex` signature, `MistTile`'s `revealed` prop, `NumberToken`'s `hidden` prop, and `CatanBoard`'s `hiddenTilesMode`/`revealedTileIds` props all match across every task that references them.
