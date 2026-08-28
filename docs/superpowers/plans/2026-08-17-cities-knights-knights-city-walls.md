# Cities & Knights — Knights & City Walls (Phase C1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cities & Knights knight pieces (recruit/activate/promote/move/displace/chase-robber), city walls, and their board/HUD UI to catan-3d, gated behind a new `citiesAndKnightsKnights` house rule, and unstub 5 of the 6 progress cards Phase B left as no-ops (Engineering, Smithing, Encouragement, Intrigue, Treason).

**Architecture:** New pure-logic module `game/knights.ts` (reachability/predicates, no React), a new `KnightLayer.tsx` board-overlay component mirroring the existing `RobberLayer.tsx`/`MerchantLayer.tsx` pattern, a new `KnightsPanel.tsx` HUD panel mirroring `ProgressCardsPanel.tsx`, and per-action handlers wired into `App.tsx` following the exact broadcast/trusted-apply patterns already established by the Merchant (cross-turn persistent placement) and Invention/Diplomacy (local-only 2-step picker) flows from Phase B.

**Tech Stack:** React + TypeScript, react-three-fiber/drei (3D board), Vitest (tests), Supabase Realtime (multiplayer broadcast, via `useRoomChannel.ts`), Supabase (match snapshot persistence, via `matchSnapshot.ts`).

## Global Constraints

(Copied verbatim from the design spec — every task's requirements implicitly include these.)

- **Placeholder assets first.** Knight tokens: simple primitive 3D geometry (cone/pawn), scaled by strength, colored via `PLAYER_COLORS` (NOT a pre-textured GLB — this project's existing building models are pre-baked GLBs with no runtime tinting step, but new Cities & Knights pieces without commissioned art use primitive geometry + material color, exactly like `MerchantLayer.tsx`'s cone). City walls: a simple low ring/base placeholder around the city's existing mesh.
- **Gated asset preloading.** N/A this phase — primitive geometry needs no preload step.
- **Multiplayer sync.** All new state round-trips through `MatchSnapshot` as part of the existing `players: Player[]` field (new `Player`-level fields, not new top-level snapshot fields) with `?? <default>` normalization on restore, exactly matching the existing `commodities`/`cityImprovements`/`progressCards` pattern at `App.tsx:4620-4630`. Broadcast/apply: local actor computes and broadcasts; receivers apply after validating (trusted-apply).
- **House rules stay independently toggleable**, set before the game starts.
- **Turn-ownership guard convention.** Every new handler acting on `players[currentPlayerIndex]` (or a specific knight/wall the acting player owns) gets both an `isMyTurn` check and a panel-level UI gate, even where the UI already blocks it.
- **Naming.** `KnightPiece`, `Player.knightPieces`, `Player.knightSupply` — deliberately distinct from the pre-existing `DevCardType: 'knight'` / `Player.knightsPlayed` (base game's Knight/Soldier dev card and Largest Army counter). Do not touch `knightsPlayed`/`largestArmy` in this plan.
- **Costs** (confirmed via rendered rulebook page images): recruit a knight = 1 wool + 1 ore. Activate a knight = 1 grain. Promote a knight = 1 wool + 1 ore (strong→mighty additionally requires the promoting player's own Politics track at level 3+). Build a city wall = 2 brick.
- **Supply caps.** Each player starts with `{ basic: 2, strong: 0, mighty: 0 }` knights in supply (6 total physical tokens). City walls: max 1 per city, max **3 board-wide across all players** (a shared, contested resource — not a per-player supply).
- **Once-per-turn promotion** is tracked per knight *instance* (a `Set` of knight IDs promoted this turn, cleared at turn start), not a single global boolean — Smithing promotes 2 different knights for free in one play, which must remain legal.

---

## File Structure

| File | Responsibility |
|---|---|
| `catan-3d/src/game/types.ts` | Modify — new types/constants/fields (Task 1) |
| `catan-3d/src/game/knights.ts` | Create — pure reachability/predicate logic (Task 2) |
| `catan-3d/src/game/knights.test.ts` | Create — tests for the above |
| `catan-3d/src/game/trophies.ts` | Modify — knight-aware longest road (Task 3) |
| `catan-3d/src/game/trophies.test.ts` | Modify — new test cases |
| `catan-3d/src/game/discard.ts` | Modify — wall-adjusted hand-limit threshold (Task 4) |
| `catan-3d/src/game/discard.test.ts` | Modify — new test cases |
| `catan-3d/src/components/KnightLayer.tsx` | Create — 3D knight tokens + target highlighting (Task 5) |
| `catan-3d/src/components/BoardInteractions.tsx` | Modify — city wall ring visual (Task 5) |
| `catan-3d/src/components/hud/KnightsPanel.tsx` | Create — HUD panel (Task 6) |
| `catan-3d/src/App.tsx` | Modify — all handler wiring (Tasks 7-13) |
| `catan-3d/src/multiplayer/useRoomChannel.ts` | Modify — broadcast payload types/senders (Tasks 7-13) |
| `catan-3d/src/multiplayer/matchSnapshot.ts` | Modify — restore normalization (Task 14) |
| `catan-3d/src/components/hud/HouseRulesDropdown.tsx` | Modify — new checkbox (Task 14) |

---

### Task 1: Data Model & Constants

**Files:**
- Modify: `catan-3d/src/game/types.ts`
- Test: `catan-3d/src/game/types.test.ts`

**Interfaces:**
- Produces: `KnightStrength`, `KNIGHT_STRENGTH_ORDER`, `KNIGHT_STRENGTH_VALUE`, `KnightPiece`, `KNIGHT_STARTING_SUPPLY`, `KNIGHT_RECRUIT_COST`, `KNIGHT_ACTIVATE_COST`, `KNIGHT_PROMOTE_COST`, `CITY_WALL_COST`, `MAX_CITY_WALLS_BOARD_WIDE`, `Player.knightPieces`, `Player.knightSupply`, `Player.cityWalls`, `GameRules.citiesAndKnightsKnights` — every later task in this plan imports these exact names.

- [ ] **Step 1: Write the failing test**

Add to `catan-3d/src/game/types.test.ts` (add `KNIGHT_STARTING_SUPPLY` to the existing import list from `./types`):

```ts
describe('createInitialPlayers — knights & city walls', () => {
  it('gives every player the starting knight supply, no knights on board, and no city walls', () => {
    const players = createInitialPlayers(3)
    for (const player of players) {
      expect(player.knightSupply).toEqual(KNIGHT_STARTING_SUPPLY)
      expect(player.knightPieces).toEqual([])
      expect(player.cityWalls).toEqual([])
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/types.test.ts`
Expected: FAIL — `knightSupply`/`knightPieces`/`cityWalls` don't exist on `Player`, `KNIGHT_STARTING_SUPPLY` isn't exported.

- [ ] **Step 3: Add the new types and constants**

In `catan-3d/src/game/types.ts`, immediately after the `DevCardType`/`ProgressCardType` block (after line 68, before `export interface Player`), add:

```ts
// Cities & Knights knight pieces — deliberately separate from DevCardType's
// 'knight' (the base game's Knight/Soldier development card, which drives
// the existing largestArmy trophy via Player.knightsPlayed). These are a
// completely different game object: a physical piece placed on a board
// intersection, not a card that gets played once and discarded. See the
// design spec's "Naming — Avoiding Collisions" section.
export type KnightStrength = 'basic' | 'strong' | 'mighty'

export const KNIGHT_STRENGTH_ORDER: KnightStrength[] = ['basic', 'strong', 'mighty']

export const KNIGHT_STRENGTH_VALUE: Record<KnightStrength, number> = {
  basic: 1,
  strong: 2,
  mighty: 3,
}

export const KNIGHT_STRENGTH_LABELS: Record<KnightStrength, string> = {
  basic: 'Basic Knight',
  strong: 'Strong Knight',
  mighty: 'Mighty Knight',
}

export interface KnightPiece {
  id: string
  ownerId: number
  strength: KnightStrength
  active: boolean
  vertexId: string
}

// 2 basic, 0 strong, 0 mighty — 6 physical tokens total per player (CN3087
// p.9: "Players each have 6 knights, two of each strength"). Promoting a
// knight moves 1 unit from this record's source bucket to the next.
export const KNIGHT_STARTING_SUPPLY: Record<KnightStrength, number> = {
  basic: 2,
  strong: 0,
  mighty: 0,
}

// Costs confirmed via rendered rulebook page images (icon-only in this
// edition's text layout — see the design spec).
export const KNIGHT_RECRUIT_COST: Partial<Resources> = { wool: 1, ore: 1 }
export const KNIGHT_ACTIVATE_COST: Partial<Resources> = { grain: 1 }
export const KNIGHT_PROMOTE_COST: Partial<Resources> = { wool: 1, ore: 1 }
export const CITY_WALL_COST: Partial<Resources> = { brick: 2 }

// Shared board-wide pool, NOT per-player — CN3087 p.8: "you may have a
// maximum of 3 city walls built at the same time," no per-player qualifier.
export const MAX_CITY_WALLS_BOARD_WIDE = 3

// A player's own strong→mighty promotion additionally requires this
// Politics track level (CN3087 p.8/p.9). basic→strong has no track
// requirement.
export const MIGHTY_KNIGHT_POLITICS_LEVEL = 3
```

- [ ] **Step 4: Add the new `Player` fields**

In `catan-3d/src/game/types.ts`, modify the `Player` interface (currently lines 92-108) to add 3 fields after `knightsPlayed`:

```ts
export interface Player {
  id: number
  name: string
  colorToken: PlayerColorToken
  resources: Resources
  commodities: Commodities
  cityImprovements: CityImprovements
  progressCards: ProgressCardType[]
  settlementsRemaining: number
  roadsRemaining: number
  citiesRemaining: number
  devCards: DevCardType[]
  devCardsBoughtThisTurn: DevCardType[]
  knightsPlayed: number
  // Cities & Knights knight pieces currently on the board. See KnightPiece
  // above — deliberately distinct from knightsPlayed.
  knightPieces: KnightPiece[]
  // Off-board knight tokens available to recruit/promote into. Starts at
  // KNIGHT_STARTING_SUPPLY.
  knightSupply: Record<KnightStrength, number>
  // Vertex IDs of this player's walled cities. Subject to both a 1-per-city
  // check (against the vertex) and the shared MAX_CITY_WALLS_BOARD_WIDE cap
  // (checked across all players' cityWalls combined, not enforced by this
  // field's shape alone).
  cityWalls: string[]
}
```

- [ ] **Step 5: Update `createInitialPlayers`**

In `catan-3d/src/game/types.ts`, modify `createInitialPlayers`'s return object (currently lines 402-416) to add the 3 new fields:

```ts
  return resolvedColorTokens.map((colorToken, index) => ({
    id: index + 1,
    name: names?.[index]?.trim() || `Player ${index + 1}`,
    colorToken,
    resources: emptyResources(),
    commodities: emptyCommodities(),
    cityImprovements: emptyCityImprovements(),
    progressCards: [],
    settlementsRemaining,
    roadsRemaining,
    citiesRemaining,
    devCards: [],
    devCardsBoughtThisTurn: [],
    knightsPlayed: 0,
    knightPieces: [],
    knightSupply: { ...KNIGHT_STARTING_SUPPLY },
    cityWalls: [],
  }))
```

Note the spread (`{ ...KNIGHT_STARTING_SUPPLY }`) — every player must get their OWN copy of the supply record, not a shared reference (mirrors why `emptyResources()`/`emptyCommodities()` are functions returning fresh objects rather than shared constants).

- [ ] **Step 6: Add the `GameRules` field**

In `catan-3d/src/game/types.ts`, modify the `GameRules` interface (currently lines 277-311) to add one field after `citiesAndKnightsProgressCards`:

```ts
  // Cities & Knights knight pieces & city walls: recruit/activate/promote/
  // move/displace knights, chase the robber with an active knight, build
  // city walls (raises the discard-on-7 hand limit). See
  // docs/superpowers/specs/2026-08-17-cities-knights-knights-city-walls-design.md.
  // Only meaningful alongside citiesAndKnightsProgressCards (5 progress
  // cards act on knights/walls) — turning this on alone is harmless, not
  // broken: knights can be recruited/moved with no progress-card
  // interaction, matching the "provably inert when its dependency is off"
  // bar every Phase A/B feature already had to clear.
  citiesAndKnightsKnights: boolean
```

And in `DEFAULT_GAME_RULES` (currently lines 313-323), add:

```ts
  citiesAndKnightsKnights: false,
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/types.test.ts`
Expected: PASS

- [ ] **Step 8: Typecheck**

Run: `cd catan-3d && npx tsc -b`
Expected: Errors at every other file that builds a `Player` or `GameRules` object literal without the 3 new required fields (test fixtures, `matchSnapshot.ts` defaults if any). Fix each by adding the new fields with sensible defaults (`knightPieces: []`, `knightSupply: { ...KNIGHT_STARTING_SUPPLY }`, `cityWalls: []`, `citiesAndKnightsKnights: false`) — do NOT make these fields optional to paper over the errors; every caller must construct them explicitly, matching how `knightsPlayed`/`citiesAndKnightsProgressCards` are already required everywhere.

- [ ] **Step 9: Commit**

```bash
git add catan-3d/src/game/types.ts catan-3d/src/game/types.test.ts
git commit -m "feat: add knight piece and city wall data model"
```

---

### Task 2: Knight Reachability & Predicate Logic

**Files:**
- Create: `catan-3d/src/game/knights.ts`
- Test: `catan-3d/src/game/knights.test.ts`

**Interfaces:**
- Consumes: `KnightPiece`, `KnightStrength`, `KNIGHT_STRENGTH_ORDER`, `KNIGHT_STRENGTH_VALUE`, `KNIGHT_RECRUIT_COST`, `KNIGHT_ACTIVATE_COST`, `KNIGHT_PROMOTE_COST`, `MIGHTY_KNIGHT_POLITICS_LEVEL`, `CITY_WALL_COST`, `MAX_CITY_WALLS_BOARD_WIDE`, `Player`, `Building`, `canAfford` (all from `./types`); `BoardGraph`, `BoardEdge` (from `../data/boardGraph`).
- Produces: `nextKnightStrength(strength): KnightStrength | null`, `canRecruitKnight(player): boolean`, `canActivateKnight(player, knight): boolean`, `canPromoteKnight(player, knight): boolean`, `canBuildCityWall(player, vertexId, settlements, totalWallsOnBoard): boolean`, `recruitableVertices(playerId, graph, roads, settlements, knightsByVertex): Set<string>`, `knightMoveTargets(knight, graph, roads, settlements, knightsByVertex): Set<string>`, `knightDisplaceTargets(knight, graph, roads, settlements, knightsByVertex): KnightPiece[]` — every App.tsx handler task below calls into these by exact name.

- [ ] **Step 1: Write the failing tests**

Create `catan-3d/src/game/knights.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  nextKnightStrength,
  canRecruitKnight,
  canActivateKnight,
  canPromoteKnight,
  canBuildCityWall,
  recruitableVertices,
  knightMoveTargets,
  knightDisplaceTargets,
} from './knights'
import { createInitialPlayers, emptyResources, type Building, type KnightPiece } from './types'
import type { BoardEdge, BoardGraph } from '../data/boardGraph'

function edge(id: string, a: string, b: string): BoardEdge {
  return { id, a, b, x: 0, z: 0 }
}

function graphOf(edges: BoardEdge[]): BoardGraph {
  const vertexEdgeIds = new Map<string, string[]>()
  for (const e of edges) {
    for (const v of [e.a, e.b]) {
      const list = vertexEdgeIds.get(v)
      if (list) list.push(e.id)
      else vertexEdgeIds.set(v, [e.id])
    }
  }
  return { vertices: [], edges, vertexById: new Map(), tileVertexIds: new Map(), vertexTileIds: new Map(), vertexEdgeIds, tileCenters: new Map() }
}

function ownedBy(playerId: number, edges: BoardEdge[]): Record<string, number> {
  return Object.fromEntries(edges.map((e) => [e.id, playerId]))
}

function knightsByVertexOf(knights: KnightPiece[]): Map<string, KnightPiece> {
  return new Map(knights.map((k) => [k.vertexId, k]))
}

describe('nextKnightStrength', () => {
  it('promotes basic to strong, strong to mighty, and mighty to nothing', () => {
    expect(nextKnightStrength('basic')).toBe('strong')
    expect(nextKnightStrength('strong')).toBe('mighty')
    expect(nextKnightStrength('mighty')).toBeNull()
  })
})

describe('canRecruitKnight', () => {
  it('requires both a basic knight in supply and the resource cost', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 1, ore: 1 }
    expect(canRecruitKnight(player)).toBe(true)

    const noSupply = { ...player, knightSupply: { basic: 0, strong: 0, mighty: 0 } }
    expect(canRecruitKnight(noSupply)).toBe(false)

    const noResources = { ...player, resources: emptyResources() }
    expect(canRecruitKnight(noResources)).toBe(false)
  })
})

describe('canActivateKnight', () => {
  it('requires the knight to be inactive and the player to afford 1 grain', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), grain: 1 }
    const inactive: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'basic', active: false, vertexId: 'A' }
    const active: KnightPiece = { ...inactive, active: true }
    expect(canActivateKnight(player, inactive)).toBe(true)
    expect(canActivateKnight(player, active)).toBe(false)
    expect(canActivateKnight({ ...player, resources: emptyResources() }, inactive)).toBe(false)
  })
})

describe('canPromoteKnight', () => {
  it('basic to strong needs supply + resources, no track requirement', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 1, ore: 1 }
    player.knightSupply = { basic: 1, strong: 1, mighty: 1 }
    const basic: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'basic', active: false, vertexId: 'A' }
    expect(canPromoteKnight(player, basic)).toBe(true)
  })

  it('strong to mighty additionally requires Politics level 3', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 1, ore: 1 }
    player.knightSupply = { basic: 1, strong: 1, mighty: 1 }
    const strong: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'strong', active: false, vertexId: 'A' }
    expect(canPromoteKnight(player, strong)).toBe(false)
    player.cityImprovements = { ...player.cityImprovements, politics: 3 }
    expect(canPromoteKnight(player, strong)).toBe(true)
  })

  it('mighty knights cannot be promoted further', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 1, ore: 1 }
    player.knightSupply = { basic: 1, strong: 1, mighty: 1 }
    const mighty: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'mighty', active: false, vertexId: 'A' }
    expect(canPromoteKnight(player, mighty)).toBe(false)
  })

  it('cannot promote if the next-strength supply is exhausted', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 1, ore: 1 }
    player.knightSupply = { basic: 1, strong: 0, mighty: 1 }
    const basic: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'basic', active: false, vertexId: 'A' }
    expect(canPromoteKnight(player, basic)).toBe(false)
  })
})

describe('canBuildCityWall', () => {
  it('requires an owned city, no existing wall there, and under the board-wide cap', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), brick: 2 }
    const settlements: Record<string, Building> = { V1: { ownerId: player.id, type: 'city' } }
    expect(canBuildCityWall(player, 'V1', settlements, 0)).toBe(true)
    expect(canBuildCityWall(player, 'V1', settlements, 3)).toBe(false) // board-wide cap hit
    player.cityWalls = ['V1']
    expect(canBuildCityWall(player, 'V1', settlements, 1)).toBe(false) // already walled
  })

  it('rejects a settlement (not yet a city) or a vertex owned by someone else', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), brick: 2 }
    const settlements: Record<string, Building> = {
      V1: { ownerId: player.id, type: 'settlement' },
      V2: { ownerId: 999, type: 'city' },
    }
    expect(canBuildCityWall(player, 'V1', settlements, 0)).toBe(false)
    expect(canBuildCityWall(player, 'V2', settlements, 0)).toBe(false)
  })
})

describe('recruitableVertices', () => {
  it('returns empty vertices touching any of the player road, excluding occupied ones', () => {
    const edges = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const settlements: Record<string, Building> = { C: { ownerId: 1, type: 'settlement' } }
    const targets = recruitableVertices(1, graph, roads, settlements, new Map())
    expect(targets).toEqual(new Set(['A', 'B'])) // C excluded — occupied
  })
})

describe('knightMoveTargets', () => {
  it('reaches empty vertices along the owner continuous route, passing through own pieces', () => {
    const edges = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C'), edge('CD', 'C', 'D')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const knight: KnightPiece = { id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'A' }
    // Own knight sits at B — passable, not a stopping point.
    const knightsByVertex = knightsByVertexOf([knight, { id: 'k2', ownerId: 1, strength: 'basic', active: false, vertexId: 'B' }])
    const targets = knightMoveTargets(knight, graph, roads, {}, knightsByVertex)
    expect(targets).toEqual(new Set(['C', 'D']))
  })

  it('cannot pass through or land on an intersection with an opponent piece', () => {
    const edges = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const knight: KnightPiece = { id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'A' }
    const settlements: Record<string, Building> = { B: { ownerId: 2, type: 'settlement' } }
    const targets = knightMoveTargets(knight, graph, roads, settlements, new Map())
    expect(targets).toEqual(new Set()) // B blocks, C unreachable
  })
})

describe('knightDisplaceTargets', () => {
  it('finds reachable opponent knights strictly weaker than the mover', () => {
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const mover: KnightPiece = { id: 'k1', ownerId: 1, strength: 'strong', active: true, vertexId: 'A' }
    const weaker: KnightPiece = { id: 'k2', ownerId: 2, strength: 'basic', active: false, vertexId: 'B' }
    const targets = knightDisplaceTargets(mover, graph, roads, {}, knightsByVertexOf([mover, weaker]))
    expect(targets).toEqual([weaker])
  })

  it('excludes opponent knights that are equal or stronger', () => {
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const mover: KnightPiece = { id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'A' }
    const equal: KnightPiece = { id: 'k2', ownerId: 2, strength: 'basic', active: false, vertexId: 'B' }
    const targets = knightDisplaceTargets(mover, graph, roads, {}, knightsByVertexOf([mover, equal]))
    expect(targets).toEqual([])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/knights.test.ts`
Expected: FAIL — `./knights` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `catan-3d/src/game/knights.ts`:

```ts
import type { BoardGraph } from '../data/boardGraph'
import {
  KNIGHT_STRENGTH_ORDER,
  KNIGHT_STRENGTH_VALUE,
  KNIGHT_RECRUIT_COST,
  KNIGHT_ACTIVATE_COST,
  KNIGHT_PROMOTE_COST,
  CITY_WALL_COST,
  MAX_CITY_WALLS_BOARD_WIDE,
  MIGHTY_KNIGHT_POLITICS_LEVEL,
  canAfford,
  type Building,
  type KnightPiece,
  type KnightStrength,
  type Player,
} from './types'

// basic -> strong -> mighty -> null (already at the top).
export function nextKnightStrength(strength: KnightStrength): KnightStrength | null {
  const index = KNIGHT_STRENGTH_ORDER.indexOf(strength)
  return KNIGHT_STRENGTH_ORDER[index + 1] ?? null
}

export function canRecruitKnight(player: Player): boolean {
  return player.knightSupply.basic > 0 && canAfford(player.resources, KNIGHT_RECRUIT_COST)
}

export function canActivateKnight(player: Player, knight: KnightPiece): boolean {
  return !knight.active && canAfford(player.resources, KNIGHT_ACTIVATE_COST)
}

// Cost/supply/track checks only — does NOT check "already promoted this
// turn" (that's per-knight turn-state App.tsx tracks separately, since this
// module has no notion of "this turn").
export function canPromoteKnight(player: Player, knight: KnightPiece): boolean {
  const next = nextKnightStrength(knight.strength)
  if (!next) return false
  if (player.knightSupply[next] <= 0) return false
  if (next === 'mighty' && player.cityImprovements.politics < MIGHTY_KNIGHT_POLITICS_LEVEL) return false
  return canAfford(player.resources, KNIGHT_PROMOTE_COST)
}

export function canBuildCityWall(
  player: Player,
  vertexId: string,
  settlements: Record<string, Building>,
  totalWallsOnBoard: number,
): boolean {
  const building = settlements[vertexId]
  if (!building || building.ownerId !== player.id || building.type !== 'city') return false
  if (player.cityWalls.includes(vertexId)) return false
  if (totalWallsOnBoard >= MAX_CITY_WALLS_BOARD_WIDE) return false
  return canAfford(player.resources, CITY_WALL_COST)
}

// Builds a vertex adjacency map restricted to edges owned by playerId — the
// same technique game/trophies.ts's calculateLongestRoad already uses for
// its own DFS adjacency.
function ownRoadAdjacency(playerId: number, graph: BoardGraph, roads: Record<string, number>): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()
  const addNeighbor = (from: string, to: string) => {
    const list = adjacency.get(from)
    if (list) list.push(to)
    else adjacency.set(from, [to])
  }
  for (const edge of graph.edges) {
    if (roads[edge.id] !== playerId) continue
    addNeighbor(edge.a, edge.b)
    addNeighbor(edge.b, edge.a)
  }
  return adjacency
}

// Every vertex touching AT LEAST ONE of playerId's own road edges, that is
// currently empty (no building, no knight of any owner) — CN3087 p.9:
// "Knights must connect to one of your existing roads... do not need to
// follow the Distance Rule." Unlike knightMoveTargets below, this is NOT a
// continuous-route reachability search — recruiting has no "origin" to walk
// from, just "touches any of my roads."
export function recruitableVertices(
  playerId: number,
  graph: BoardGraph,
  roads: Record<string, number>,
  settlements: Record<string, Building>,
  knightsByVertex: ReadonlyMap<string, KnightPiece>,
): Set<string> {
  const result = new Set<string>()
  for (const edge of graph.edges) {
    if (roads[edge.id] !== playerId) continue
    for (const vertexId of [edge.a, edge.b]) {
      if (settlements[vertexId]) continue
      if (knightsByVertex.has(vertexId)) continue
      result.add(vertexId)
    }
  }
  return result
}

// BFS from originVertexId along playerId's own road network. Can pass
// through (not stop at) vertices holding playerId's OWN building/knight;
// stops at (can arrive at, cannot continue past) any other player's
// building or knight — same asymmetric rule game/trophies.ts's
// isBlockedByOpponent already applies for longest-road counting, applied
// here to reachability instead of path length.
function reachableVertices(
  originVertexId: string,
  playerId: number,
  graph: BoardGraph,
  roads: Record<string, number>,
  settlements: Record<string, Building>,
  knightsByVertex: ReadonlyMap<string, KnightPiece>,
): Set<string> {
  const adjacency = ownRoadAdjacency(playerId, graph, roads)

  const isPassable = (vertexId: string): boolean => {
    const building = settlements[vertexId]
    if (building != null && building.ownerId !== playerId) return false
    const knight = knightsByVertex.get(vertexId)
    if (knight != null && knight.ownerId !== playerId) return false
    return true
  }

  const visited = new Set<string>([originVertexId])
  const queue = [originVertexId]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current !== originVertexId && !isPassable(current)) continue
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }
  visited.delete(originVertexId)
  return visited
}

// Empty vertices an active knight can move to.
export function knightMoveTargets(
  knight: KnightPiece,
  graph: BoardGraph,
  roads: Record<string, number>,
  settlements: Record<string, Building>,
  knightsByVertex: ReadonlyMap<string, KnightPiece>,
): Set<string> {
  const reachable = reachableVertices(knight.vertexId, knight.ownerId, graph, roads, settlements, knightsByVertex)
  const result = new Set<string>()
  for (const vertexId of reachable) {
    if (settlements[vertexId]) continue
    if (knightsByVertex.has(vertexId)) continue
    result.add(vertexId)
  }
  return result
}

// Reachable opponent knights strictly weaker than the mover — CN3087 p.10:
// "Your knight must be stronger than the other player's knight."
export function knightDisplaceTargets(
  knight: KnightPiece,
  graph: BoardGraph,
  roads: Record<string, number>,
  settlements: Record<string, Building>,
  knightsByVertex: ReadonlyMap<string, KnightPiece>,
): KnightPiece[] {
  const reachable = reachableVertices(knight.vertexId, knight.ownerId, graph, roads, settlements, knightsByVertex)
  const result: KnightPiece[] = []
  for (const vertexId of reachable) {
    const target = knightsByVertex.get(vertexId)
    if (!target || target.ownerId === knight.ownerId) continue
    if (KNIGHT_STRENGTH_VALUE[target.strength] >= KNIGHT_STRENGTH_VALUE[knight.strength]) continue
    result.push(target)
  }
  return result
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/knights.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/game/knights.ts src/game/knights.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/knights.ts catan-3d/src/game/knights.test.ts
git commit -m "feat: add knight reachability and predicate logic"
```

---

### Task 3: Longest Route & Board-Occupancy Blocking (knights act like buildings)

This is the highest-risk task in this plan — it changes an existing, already-shipped, already-tested function (`calculateLongestRoad`) and an existing road-connectivity check that every road build in the game already goes through.

**Files:**
- Modify: `catan-3d/src/game/trophies.ts`
- Modify: `catan-3d/src/game/trophies.test.ts`
- Modify: `catan-3d/src/App.tsx` (the `isRoadPlacementConnected` function at line 1869, the longest-road recompute call site, and `buildSettlementRaw`'s new-settlement placement branch)

**Interfaces:**
- Consumes: `KnightPiece` (from `./types`).
- Produces: `calculateLongestRoad`'s new 5th parameter `knightOwnerByVertex` (optional, defaults to an empty map — every existing call site and the entire existing test suite must keep passing unchanged).

- [ ] **Step 1: Write the failing tests**

Add to `catan-3d/src/game/trophies.test.ts` (inside the existing `describe('calculateLongestRoad', ...)` block, after the existing `it` cases):

```ts
  it('an opponent knight breaks the road the same way an opponent settlement does', () => {
    const edges = chain('A', 'B', 'C', 'D', 'E', 'F') // 5 edges, would be length 5
    const knightOwnerByVertex = new Map([['D', 2]]) // opponent's knight sits at D
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), {}, knightOwnerByVertex)).toBe(3) // A-B-C-D, blocked past D
  })

  it('the road owner own knight does not break their own road', () => {
    const edges = chain('A', 'B', 'C', 'D', 'E', 'F')
    const knightOwnerByVertex = new Map([['D', 1]]) // the SAME player's own knight
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), {}, knightOwnerByVertex)).toBe(5)
  })

  it('with no knightOwnerByVertex argument, behaves exactly as before', () => {
    const edges = chain('A', 'B', 'C', 'D', 'E', 'F')
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), {})).toBe(5)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/trophies.test.ts`
Expected: FAIL — `calculateLongestRoad` doesn't accept a 5th argument, and doesn't apply it.

- [ ] **Step 3: Modify `calculateLongestRoad`**

In `catan-3d/src/game/trophies.ts`, change the function signature and the `isBlockedByOpponent` closure (currently lines 10-41):

```ts
export function calculateLongestRoad(
  playerId: number,
  roads: Record<string, number>,
  graph: BoardGraph,
  settlements: Record<string, Building>,
  // Cities & Knights knights: vertex id -> owning player id, for every
  // knight currently on the board (any strength, active or inactive — both
  // block equally per CN3087 p.9). Defaults to empty so every pre-existing
  // call site (and the whole pre-existing test suite above) keeps behaving
  // identically when this house rule is off.
  knightOwnerByVertex: ReadonlyMap<string, number> = new Map(),
): number {
  const ownedEdgeIds = new Set(graph.edges.filter((edge) => roads[edge.id] === playerId).map((edge) => edge.id))
  if (ownedEdgeIds.size === 0) return 0

  const adjacency = new Map<string, { edgeId: string; nextVertex: string }[]>()
  for (const edge of graph.edges) {
    if (!ownedEdgeIds.has(edge.id)) continue
    const addEntry = (from: string, to: string) => {
      const entry = { edgeId: edge.id, nextVertex: to }
      const list = adjacency.get(from)
      if (list) list.push(entry)
      else adjacency.set(from, [entry])
    }
    addEntry(edge.a, edge.b)
    addEntry(edge.b, edge.a)
  }

  const isBlockedByOpponent = (vertexId: string): boolean => {
    const building = settlements[vertexId]
    if (building != null && building.ownerId !== playerId) return true
    const knightOwnerId = knightOwnerByVertex.get(vertexId)
    return knightOwnerId != null && knightOwnerId !== playerId
  }

  const dfs = (vertex: string, visitedEdges: Set<string>): number => {
    if (isBlockedByOpponent(vertex) && visitedEdges.size > 0) return 0

    let best = 0
    for (const { edgeId, nextVertex } of adjacency.get(vertex) ?? []) {
      if (visitedEdges.has(edgeId)) continue
      visitedEdges.add(edgeId)
      best = Math.max(best, 1 + dfs(nextVertex, visitedEdges))
      visitedEdges.delete(edgeId)
    }
    return best
  }

  let longest = 0
  for (const vertex of adjacency.keys()) {
    longest = Math.max(longest, dfs(vertex, new Set()))
  }
  return longest
}
```

(Everything below `isBlockedByOpponent` is unchanged — only that closure and the function signature change.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/trophies.test.ts`
Expected: PASS — all existing cases plus the 3 new ones.

- [ ] **Step 5: Find and update the App.tsx longest-road recompute call site**

Run: `cd catan-3d && grep -n "calculateLongestRoad(" src/App.tsx`

At that call site, build a `knightOwnerByVertex` map from every player's `knightPieces` and pass it as the 5th argument:

```ts
const knightOwnerByVertex = new Map(
  players.flatMap((p) => p.knightPieces.map((k) => [k.vertexId, p.id] as const)),
)
// ...then thread `knightOwnerByVertex` as the 5th argument at every existing
// calculateLongestRoad(...) call found by the grep above.
```

If `gameRules.citiesAndKnightsKnights` is off, every player's `knightPieces` is always `[]` (nothing in this plan ever populates it while the rule is off, since every knight action handler in Tasks 7-13 checks the rule first), so the map is naturally empty and this is a no-op — no separate `if (gameRules.citiesAndKnightsKnights)` branch is needed here.

- [ ] **Step 6: Block road-building past an opponent's knight**

In `catan-3d/src/App.tsx`, modify `isRoadPlacementConnected` (currently lines 1869-1874):

```ts
  // Cities & Knights knights: a road cannot be extended THROUGH a vertex
  // occupied by another player's knight (CN3087 p.9's own illustration: "If
  // Blue places their knight at intersection A, then Orange will not be
  // able to extend their road past that point"). Arrival is unaffected —
  // this only matters for whether a vertex counts as a valid JUMPING-OFF
  // point for a NEW edge, so a settlement you already own at that vertex is
  // unaffected too (a settlement and a knight can never share a vertex —
  // see Step 7 below).
  const isBlockedForRoadPlacement = (vertexId: string, playerId: number): boolean => {
    if (!gameRules.citiesAndKnightsKnights) return false
    const knight = knightPiecesByVertex.get(vertexId)
    return knight != null && knight.ownerId !== playerId
  }

  const isRoadPlacementConnected = (edgeId: string, playerId: number): boolean => {
    const edge = edgeById.get(edgeId)
    if (!edge) return false
    if (settlements[edge.a]?.ownerId === playerId || settlements[edge.b]?.ownerId === playerId) return true
    const aUsable = hasPlayerRoadAt(edge.a, playerId) && !isBlockedForRoadPlacement(edge.a, playerId)
    const bUsable = hasPlayerRoadAt(edge.b, playerId) && !isBlockedForRoadPlacement(edge.b, playerId)
    return aUsable || bUsable
  }
```

This requires a `knightPiecesByVertex: Map<string, KnightPiece>` derived value in scope. Add it as a `useMemo` near where `edgeById`/`vertexAdjacency` are already defined (around line 220):

```ts
const knightPiecesByVertex = useMemo(
  () => new Map(players.flatMap((p) => p.knightPieces.map((k) => [k.vertexId, k] as const))),
  [players],
)
```

(This same memoized map is reusable by Tasks 7-13's handlers and by Task 5's `KnightLayer` wiring — don't create a second one later.)

- [ ] **Step 7: Block settlement placement on a knight-occupied vertex**

Run: `cd catan-3d && grep -n "const buildSettlementRaw" src/App.tsx`

In that function's NEW-settlement branch (the `else`/non-upgrade path — distinct from the upgrade branch already shown in this plan's research), add a check before the existing distance-rule/connectivity checks:

```ts
  if (gameRules.citiesAndKnightsKnights && knightPiecesByVertex.has(vertexId)) {
    warn('A knight is standing there.')
    return
  }
```

Locate the exact insertion point by reading the function's existing early-return guards (e.g. the existing "That intersection is already occupied" check) and add this new check alongside them, before any resource-spending happens.

- [ ] **Step 8: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/game/trophies.ts`
Expected: clean. (`knightPiecesByVertex` will be unused by anything except Steps 6-7 until Task 5+ wire up the rest — that's expected at this point in the plan, not a bug.)

- [ ] **Step 9: Commit**

```bash
git add catan-3d/src/game/trophies.ts catan-3d/src/game/trophies.test.ts catan-3d/src/App.tsx
git commit -m "feat: make knights block roads, settlements, and longest-route counting"
```

---

### Task 4: Wall-Adjusted Discard Hand Limit

**Files:**
- Modify: `catan-3d/src/game/discard.ts`
- Modify: `catan-3d/src/game/discard.test.ts`
- Modify: `catan-3d/src/App.tsx` (3 gate-check call sites)

**Interfaces:**
- Consumes: nothing new.
- Produces: `discardThreshold(cityWallCount: number): number`.

- [ ] **Step 1: Write the failing test**

Add to `catan-3d/src/game/discard.test.ts`:

```ts
describe('discardThreshold', () => {
  it('is 7 with no city walls', () => {
    expect(discardThreshold(0)).toBe(7)
  })

  it('adds 2 per city wall', () => {
    expect(discardThreshold(1)).toBe(9)
    expect(discardThreshold(2)).toBe(11)
  })
})
```

(Add `discardThreshold` to the existing `from './discard'` import line at the top of the file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/discard.test.ts`
Expected: FAIL — `discardThreshold` isn't exported.

- [ ] **Step 3: Add the function**

In `catan-3d/src/game/discard.ts`, add (near `discardHandSize`, same file):

```ts
// CN3087 p.8: "Each city wall adds 2 to the number you may hold before
// having to discard." The discard COUNT itself stays `floor(handSize / 2)`
// unchanged — only the threshold for whether a player must discard AT ALL
// moves. Callers pass 0 when citiesAndKnightsKnights is off, recovering the
// flat 7 every existing call site already used.
export function discardThreshold(cityWallCount: number): number {
  return 7 + 2 * cityWallCount
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/discard.test.ts`
Expected: PASS

- [ ] **Step 5: Update the 3 gate-check call sites in App.tsx**

These are the only 3 of the 9 `discardHandSize` call sites that compare against `7` directly (the other 6 compute `Math.floor(handSize / 2)` for an ALREADY-identified over-limit player and don't need to change — the discard COUNT formula is unaffected by this task, only the GATE is). Import `discardThreshold` alongside the existing `discard.ts` imports at the top of `App.tsx` (currently `import { autoDiscardCounts, applyDiscardCounts, discardHandSize } from './game/discard'`).

Add a small local helper near the other player-derived helpers (e.g. near `hasPlayerRoadAt`):

```ts
const playerDiscardThreshold = (player: Player): number =>
  discardThreshold(gameRules.citiesAndKnightsKnights ? player.cityWalls.length : 0)
```

Then, at each of these 3 sites, replace the hardcoded `> 7` comparison:

1. `App.tsx:1697` — change:
   ```ts
   return discardHandSize(player.resources, player.commodities, gameRules.citiesAndKnightsCommodities) > 7
   ```
   to:
   ```ts
   return discardHandSize(player.resources, player.commodities, gameRules.citiesAndKnightsCommodities) > playerDiscardThreshold(player)
   ```

2. `App.tsx:2604-2606` — change:
   ```ts
   const handSizeOf = (p: Player) =>
     discardHandSize(p.resources, p.commodities, gameRules.citiesAndKnightsCommodities)
   const overLimitIds = players.filter((p) => handSizeOf(p) > 7).map((p) => p.id)
   ```
   to:
   ```ts
   const handSizeOf = (p: Player) =>
     discardHandSize(p.resources, p.commodities, gameRules.citiesAndKnightsCommodities)
   const overLimitIds = players.filter((p) => handSizeOf(p) > playerDiscardThreshold(p)).map((p) => p.id)
   ```

3. `App.tsx:4747-4749` (inside `restoreFromSnapshot`, using `restoredRules` and `normalizedPlayers` — NOT the outer `gameRules`/`players`, since this runs during restore before those are set) — change:
   ```ts
   ? normalizedPlayers
       .filter((p) => discardHandSize(p.resources, p.commodities, restoredRules.citiesAndKnightsCommodities) > 7)
       .map((p) => p.id)
   ```
   to:
   ```ts
   ? normalizedPlayers
       .filter(
         (p) =>
           discardHandSize(p.resources, p.commodities, restoredRules.citiesAndKnightsCommodities) >
           discardThreshold(restoredRules.citiesAndKnightsKnights ? p.cityWalls.length : 0),
       )
       .map((p) => p.id)
   ```
   (`p.cityWalls` here is safe even on an old snapshot missing the field, IF Task 14's `normalizedPlayers` normalization (which adds `cityWalls: p.cityWalls ?? []`) runs before this filter — confirm Task 14 lands before or alongside this, since this line already reads `normalizedPlayers`, not raw `snapshot.players`.)

- [ ] **Step 6: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/game/discard.ts`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/game/discard.ts catan-3d/src/game/discard.test.ts catan-3d/src/App.tsx
git commit -m "feat: raise the discard hand limit by 2 per city wall"
```

---

### Task 5: Board Visuals — Knight Tokens & City Wall Rings

**Files:**
- Create: `catan-3d/src/components/KnightLayer.tsx`
- Modify: `catan-3d/src/components/BoardInteractions.tsx`

**Interfaces:**
- Consumes: `KnightPiece`, `KnightStrength`, `KNIGHT_STRENGTH_VALUE`, `PLAYER_COLORS`, `PlayerColorToken` (from `../game/types`); `TILE_HEIGHT`, `STRUCTURE_ELEVATION` (from `../data/hexBoard`); `BoardVertex` (from `../data/boardGraph`).
- Produces: `KnightLayerProps` (`knights: KnightPiece[]`, `colorTokenByPlayerId: Map<number, PlayerColorToken>`, `vertexById: Map<string, BoardVertex>`, `recruitTargets: ReadonlySet<string> | null`, `moveTargets: ReadonlySet<string> | null`, `displaceTargets: KnightPiece[] | null`, `onSelectVertex: (vertexId: string) => void`, `onSelectKnight: (knightId: string) => void`) — Tasks 7-13 wire App.tsx state into these exact props. `BoardInteractions`'s new `cityWalls: ReadonlySet<string>` prop, added to its existing `BoardInteractionsProps`.

This task is pure rendering — no App.tsx wiring, no game-logic calls. It's independently visually verifiable by rendering with hardcoded sample data.

- [ ] **Step 1: Create `KnightLayer.tsx`**

```tsx
import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { TILE_HEIGHT, STRUCTURE_ELEVATION } from '../data/hexBoard'
import type { BoardVertex } from '../data/boardGraph'
import { KNIGHT_STRENGTH_VALUE, PLAYER_COLORS, type KnightPiece, type PlayerColorToken } from '../game/types'

// Placeholder-first policy (this plan's Global Constraints): no bespoke
// model, primitive geometry recolored via PLAYER_COLORS — same technique
// MerchantLayer.tsx's cone placeholder already established for Cities &
// Knights pieces without commissioned art (Phase B, Task 13).
const KNIGHT_BASE_RADIUS = 0.1
const KNIGHT_BASE_HEIGHT = 0.22
// Taller per strength level so basic/strong/mighty read apart at a glance
// even before real art exists — matches CN3087's own physical tokens
// (1/2/3 rings stacked higher per level).
const KNIGHT_HEIGHT_PER_STRENGTH = 0.1
// An inactive knight lies flat in the physical game ("lay it down to show
// it is now inactive" — CN3087 p.9) — mirrored here as a dimmer, shorter
// silhouette rather than a literal rotation, which would make the piece
// much harder to read/click at this scale.
const KNIGHT_INACTIVE_OPACITY = 0.55

const RECRUIT_TARGET_COLOR = '#f2c14e' // same "you can place this" gold TileSwapLayer uses
const MOVE_TARGET_COLOR = '#7fe7ff' // same cyan BoardInteractions' own settlement ghost uses
const DISPLACE_TARGET_COLOR = '#d64545' // same "this is a threat" red RobberLayer uses

function KnightToken({ knight, colorToken }: { knight: KnightPiece; colorToken: PlayerColorToken }) {
  const height = KNIGHT_BASE_HEIGHT + KNIGHT_HEIGHT_PER_STRENGTH * (KNIGHT_STRENGTH_VALUE[knight.strength] - 1)
  const color = PLAYER_COLORS[colorToken]
  return (
    <mesh position={[0, height / 2, 0]}>
      <coneGeometry args={[KNIGHT_BASE_RADIUS, height, 8]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={knight.active ? 0.5 : 0.15}
        transparent={!knight.active}
        opacity={knight.active ? 1 : KNIGHT_INACTIVE_OPACITY}
      />
    </mesh>
  )
}

function VertexTarget({
  vertex,
  color,
  onSelect,
}: {
  vertex: BoardVertex
  color: string
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <group position={[vertex.x, TILE_HEIGHT / 2 + STRUCTURE_ELEVATION, vertex.z]}>
      <mesh
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(false)
        }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          onSelect()
        }}
      >
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh visible={hovered}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

export interface KnightLayerProps {
  knights: KnightPiece[]
  colorTokenByPlayerId: Map<number, PlayerColorToken>
  vertexById: Map<string, BoardVertex>
  // Non-null while the LOCAL viewer has one of these picker modes armed —
  // mutually exclusive in practice (App.tsx never arms more than one at a
  // time), each rendered as its own target set/color.
  recruitTargets: ReadonlySet<string> | null
  moveTargets: ReadonlySet<string> | null
  displaceTargets: KnightPiece[] | null
  onSelectVertex: (vertexId: string) => void
  onSelectKnight: (knightId: string) => void
}

export function KnightLayer({
  knights,
  colorTokenByPlayerId,
  vertexById,
  recruitTargets,
  moveTargets,
  displaceTargets,
  onSelectVertex,
  onSelectKnight,
}: KnightLayerProps) {
  return (
    <group>
      {knights.map((knight) => {
        const vertex = vertexById.get(knight.vertexId)
        if (!vertex) return null
        const colorToken = colorTokenByPlayerId.get(knight.ownerId) ?? 'player-1'
        return (
          <group key={knight.id} position={[vertex.x, TILE_HEIGHT / 2 + STRUCTURE_ELEVATION, vertex.z]}>
            <KnightToken knight={knight} colorToken={colorToken} />
          </group>
        )
      })}

      {recruitTargets &&
        [...recruitTargets].map((vertexId) => {
          const vertex = vertexById.get(vertexId)
          if (!vertex) return null
          return (
            <VertexTarget
              key={vertexId}
              vertex={vertex}
              color={RECRUIT_TARGET_COLOR}
              onSelect={() => onSelectVertex(vertexId)}
            />
          )
        })}

      {moveTargets &&
        [...moveTargets].map((vertexId) => {
          const vertex = vertexById.get(vertexId)
          if (!vertex) return null
          return (
            <VertexTarget
              key={vertexId}
              vertex={vertex}
              color={MOVE_TARGET_COLOR}
              onSelect={() => onSelectVertex(vertexId)}
            />
          )
        })}

      {displaceTargets &&
        displaceTargets.map((target) => {
          const vertex = vertexById.get(target.vertexId)
          if (!vertex) return null
          return (
            <VertexTarget
              key={target.id}
              vertex={vertex}
              color={DISPLACE_TARGET_COLOR}
              onSelect={() => onSelectKnight(target.id)}
            />
          )
        })}
    </group>
  )
}
```

- [ ] **Step 2: Add the city wall ring visual to `BoardInteractions.tsx`**

In `catan-3d/src/components/BoardInteractions.tsx`, add a wall-ring constant near the top (after `EDGE_LENGTH_SCALE`):

```tsx
// City wall placeholder — a low stone-colored ring sitting flush around the
// city model's base, per this plan's Global Constraints (placeholder art
// before commissioned art).
const CITY_WALL_COLOR = '#8a7f6b'
const CITY_WALL_RADIUS = 0.22
const CITY_WALL_HEIGHT = 0.05
```

Modify `VertexSlot`'s props (currently lines 80-99) to accept `hasWall: boolean`:

```tsx
const VertexSlot = memo(function VertexSlot({
  vertex,
  building,
  ownerColorToken,
  isMetropolis,
  hasWall,
  onBuild,
  locked,
  remoteHighlighted,
  remoteColor,
  onHoverChange,
}: {
  vertex: BoardVertex
  building: Building | undefined
  ownerColorToken: PlayerColorToken | undefined
  isMetropolis: boolean
  hasWall: boolean
  onBuild: (vertexId: string) => void
  locked: boolean
  remoteHighlighted: boolean
  remoteColor: string | undefined
  onHoverChange: (target: HoverTarget) => void
}) {
```

In the `if (building)` branch (currently lines 107-133), add the ring inside the returned `<group>`, sibling to the hitbox mesh and the `CityModel`/`SettlementModel`:

```tsx
      {hasWall && building.type === 'city' && (
        <mesh position={[0, -CITY_WALL_HEIGHT / 2, 0]}>
          <cylinderGeometry args={[CITY_WALL_RADIUS, CITY_WALL_RADIUS, CITY_WALL_HEIGHT, 8, 1, true]} />
          <meshStandardMaterial color={CITY_WALL_COLOR} side={2 /* THREE.DoubleSide */} />
        </mesh>
      )}
```

Thread `hasWall` through: in `BoardInteractionsProps` (currently lines 300-323), add `cityWalls: ReadonlySet<string>`; in the main component body's `graph.vertices.map` (currently lines 350-367), pass `hasWall={cityWalls.has(vertex.id)}` to `VertexSlot`; add `cityWalls` to the destructured props of the main `BoardInteractions` function.

- [ ] **Step 3: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/components/KnightLayer.tsx src/components/BoardInteractions.tsx`
Expected: `BoardInteractions.tsx`'s call site in `App.tsx` will now fail to typecheck (missing the new required `cityWalls` prop) — that's expected; Task 7 supplies it. Confirm the error is ONLY that one missing prop, nothing else.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/components/KnightLayer.tsx catan-3d/src/components/BoardInteractions.tsx
git commit -m "feat: add knight token and city wall placeholder visuals"
```

---

### Task 6: Knights HUD Panel

**Files:**
- Create: `catan-3d/src/components/hud/KnightsPanel.tsx`

**Interfaces:**
- Consumes: `KnightPiece`, `KnightStrength`, `KNIGHT_STRENGTH_ORDER`, `KNIGHT_STRENGTH_LABELS`, `Player` (from `../../game/types`).
- Produces: `KnightsPanelProps` — Task 7's App.tsx wiring supplies every callback prop.

- [ ] **Step 1: Create the component**

```tsx
import { KNIGHT_STRENGTH_LABELS, KNIGHT_STRENGTH_ORDER, type KnightPiece, type Player } from '../../game/types'

export interface KnightsPanelProps {
  player: Player
  isMyTurn: boolean
  onRecruit: () => void
  onActivate: (knightId: string) => void
  onPromote: (knightId: string) => void
  onArmMove: (knightId: string) => void
  onArmDisplace: (knightId: string) => void
  onArmChaseRobber: (knightId: string) => void
  canRecruit: boolean
  canPromote: (knight: KnightPiece) => boolean
  canChaseRobber: (knight: KnightPiece) => boolean
  armedKnightId: string | null
}

export function KnightsPanel({
  player,
  isMyTurn,
  onRecruit,
  onActivate,
  onPromote,
  onArmMove,
  onArmDisplace,
  onArmChaseRobber,
  canRecruit,
  canPromote,
  canChaseRobber,
  armedKnightId,
}: KnightsPanelProps) {
  const slots: { strength: (typeof KNIGHT_STRENGTH_ORDER)[number]; knight: KnightPiece | undefined }[] = []
  for (const strength of KNIGHT_STRENGTH_ORDER) {
    const owned = player.knightPieces.filter((k) => k.strength === strength)
    const inSupply = player.knightSupply[strength]
    for (let i = 0; i < owned.length; i++) slots.push({ strength, knight: owned[i] })
    for (let i = 0; i < inSupply; i++) slots.push({ strength, knight: undefined })
  }

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <span className="font-body text-[10px] tracking-[0.2em] text-white/60 uppercase">Knights</span>
      <div className="flex flex-col gap-1.5">
        {slots.map((slot, index) => (
          <div
            key={slot.knight?.id ?? `empty-${slot.strength}-${index}`}
            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-white/80"
          >
            <span>{KNIGHT_STRENGTH_LABELS[slot.strength]}</span>
            {!slot.knight && (
              <button
                type="button"
                disabled={!isMyTurn || !canRecruit}
                onClick={onRecruit}
                className="rounded bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40"
              >
                Recruit
              </button>
            )}
            {slot.knight && !slot.knight.active && (
              <button
                type="button"
                disabled={!isMyTurn}
                onClick={() => onActivate(slot.knight!.id)}
                className="rounded bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40"
              >
                Activate
              </button>
            )}
            {slot.knight && slot.knight.active && (
              <div className="flex gap-1">
                <button
                  type="button"
                  disabled={!isMyTurn || !canPromote(slot.knight)}
                  onClick={() => onPromote(slot.knight!.id)}
                  className="rounded bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40"
                >
                  Promote
                </button>
                <button
                  type="button"
                  disabled={!isMyTurn}
                  onClick={() => onArmMove(slot.knight!.id)}
                  className={`rounded px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40 ${
                    armedKnightId === slot.knight.id ? 'bg-cyan-400/30' : 'bg-white/10'
                  }`}
                >
                  Move
                </button>
                <button
                  type="button"
                  disabled={!isMyTurn}
                  onClick={() => onArmDisplace(slot.knight!.id)}
                  className={`rounded px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40 ${
                    armedKnightId === slot.knight.id ? 'bg-red-400/30' : 'bg-white/10'
                  }`}
                >
                  Displace
                </button>
                <button
                  type="button"
                  disabled={!isMyTurn || !canChaseRobber(slot.knight)}
                  onClick={() => onArmChaseRobber(slot.knight!.id)}
                  className="rounded bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40"
                >
                  Chase Robber
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/components/hud/KnightsPanel.tsx`
Expected: clean (this component isn't imported anywhere yet, so no other errors should appear from it).

- [ ] **Step 3: Commit**

```bash
git add catan-3d/src/components/hud/KnightsPanel.tsx
git commit -m "feat: add Knights HUD panel"
```

---

### Task 7: App.tsx Wiring — Recruit Knight

The first App.tsx wiring task. Establishes the state shape and `GameHud`/`KnightLayer`/`KnightsPanel` render wiring that Tasks 8-13 build on — read this task's full diff before starting Task 8.

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/components/hud/GameHud.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `canRecruitKnight`, `recruitableVertices` (from `./game/knights`); `KNIGHT_RECRUIT_COST` (from `./game/types`); `KnightLayer`, `KnightsPanel` (Tasks 5-6).
- Produces: `pendingKnightRecruit: number | null` state, `armKnightRecruit()`, `handleKnightVertexSelect(vertexId)` (this becomes the SINGLE resolve handler `KnightLayer`'s `onSelectVertex` calls — Task 9's Move handler extends it with a branch, do not create a second handler), `KnightRecruitedPayload` broadcast type.

- [ ] **Step 1: Add state**

In `App.tsx`, near the other Cities & Knights `pending*` state declarations (alongside `pendingMerchantPlacement`), add:

```tsx
// Cities & Knights knight recruit — non-null only on the acting client's
// own screen while a placement is in progress, same local-only treatment
// pendingMerchantPlacement/pendingInventionSwap already get.
const [pendingKnightRecruit, setPendingKnightRecruit] = useState<number | null>(null)
// Cities & Knights knight move/displace — which of the viewer's OWN
// knights is currently armed for a Move or Displace action. Mutually
// exclusive with pendingKnightRecruit (KnightsPanel only ever arms one
// mode at a time) and with each other (armMode discriminates).
const [armedKnightAction, setArmedKnightAction] = useState<{ knightId: string; mode: 'move' | 'displace' } | null>(
  null,
)
// Once per turn, per knight INSTANCE (not a single global flag) — Smithing
// promotes 2 different knights for free in one play, which must stay
// legal. Cleared in handleEndTurn alongside devCardsBoughtThisTurn.
const [knightsPromotedThisTurn, setKnightsPromotedThisTurn] = useState<Set<string>>(new Set())
```

- [ ] **Step 2: Add the arm and resolve handlers**

Add near the other `playX`/`activateX` progress-card handlers:

```tsx
const armKnightRecruit = () => {
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  const player = players[currentPlayerIndex]
  if (!canRecruitKnight(player)) {
    warn('Cannot recruit a knight right now.')
    return
  }
  if (pendingKnightRecruit != null || armedKnightAction) {
    warn('Finish the current knight action first.')
    return
  }
  setPendingKnightRecruit(player.id)
}

const cancelKnightRecruit = () => setPendingKnightRecruit(null)

const handleKnightVertexSelect = (vertexId: string) => {
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  if (pendingKnightRecruit != null) {
    const playerId = pendingKnightRecruit
    const player = playerById.get(playerId)
    if (!player || !canRecruitKnight(player)) {
      warn('Cannot recruit a knight right now.')
      setPendingKnightRecruit(null)
      return
    }
    const knightsByVertex = new Map(players.flatMap((p) => p.knightPieces.map((k) => [k.vertexId, k] as const)))
    const targets = recruitableVertices(playerId, graph, roads, settlements, knightsByVertex)
    if (!targets.has(vertexId)) {
      warn('Not a valid knight placement.')
      return
    }
    const newKnight: KnightPiece = { id: `knight-${playerId}-${Date.now()}`, ownerId: playerId, strength: 'basic', active: false, vertexId }
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === playerId
          ? { ...p, resources: deductCost(p.resources, KNIGHT_RECRUIT_COST), knightSupply: { ...p.knightSupply, basic: p.knightSupply.basic - 1 }, knightPieces: [...p.knightPieces, newKnight] }
          : p,
      ),
    )
    setPendingKnightRecruit(null)
    if (onlineInfo) broadcastKnightRecruited({ knight: newKnight })
    return
  }
  // Task 9 (Move) adds its own branch here, checking armedKnightAction
  // instead of pendingKnightRecruit — see that task's diff.
}
```

Note: `newKnight.id` uses `Date.now()` for uniqueness within one player's action — this mirrors no existing precedent exactly (most IDs in this codebase are vertex/edge-derived), so cross-check for collisions is unnecessary since a single player can only recruit one knight per click and `Date.now()` millisecond resolution is far finer than human click cadence; if a reviewer flags this, an acceptable alternative is `` `knight-${playerId}-${player.knightPieces.length}-${Math.random().toString(36).slice(2, 8)}` ``.

- [ ] **Step 3: Broadcast payload and receive handler**

In `catan-3d/src/multiplayer/useRoomChannel.ts`, alongside `MerchantMovedPayload`, add:

```ts
export interface KnightRecruitedPayload {
  knight: KnightPiece
}
```

(Add `KnightPiece` to that file's existing import from `../game/types`.) Add the sender, mirroring `broadcastMerchantMoved`:

```ts
broadcastKnightRecruited = (payload: KnightRecruitedPayload) => {
  void channelRef.current?.send({ type: 'broadcast', event: 'KNIGHT_RECRUITED', payload })
}
```

Add `onKnightRecruited` to the channel's receive-handler interface, following the exact pattern `onMerchantMoved` uses (find it via `grep -n "onMerchantMoved" src/multiplayer/useRoomChannel.ts` and mirror its shape for the new event name/payload).

In `App.tsx`, add the receive handler alongside `onMerchantMoved`:

```tsx
onKnightRecruited: (payload) => {
  setPlayers((prev) =>
    prev.map((p) =>
      p.id === payload.knight.ownerId
        ? { ...p, resources: deductCost(p.resources, KNIGHT_RECRUIT_COST), knightSupply: { ...p.knightSupply, basic: p.knightSupply.basic - 1 }, knightPieces: [...p.knightPieces, payload.knight] }
        : p,
    ),
  )
},
```

- [ ] **Step 4: Reset and restore**

In `resetGame` (near the Merchant reset lines), add:

```tsx
setPendingKnightRecruit(null)
setArmedKnightAction(null)
setKnightsPromotedThisTurn(new Set())
```

(`players`' own `knightPieces`/`knightSupply`/`cityWalls` reset automatically via `createInitialPlayers` inside `resetGame` — no separate reset needed for those, same as `progressCards`/`commodities`.)

`restoreFromSnapshot` needs no changes for `pendingKnightRecruit`/`armedKnightAction`/`knightsPromotedThisTurn` — all 3 are local-only UI state, never persisted, same treatment `pendingMerchantPlacement` already gets. (Task 14 handles restoring the per-`Player` fields.)

- [ ] **Step 5: Render wiring — `KnightLayer` and `KnightsPanel`**

In `App.tsx`'s JSX, add `<KnightLayer>` as a sibling to `<RobberLayer>`/`<MerchantLayer>` inside the `<Canvas>`:

```tsx
{gameRules.citiesAndKnightsKnights && (
  <KnightLayer
    knights={players.flatMap((p) => p.knightPieces)}
    colorTokenByPlayerId={colorTokenByPlayerId}
    vertexById={graph.vertexById}
    recruitTargets={
      pendingKnightRecruit != null
        ? recruitableVertices(pendingKnightRecruit, graph, roads, settlements, knightPiecesByVertex)
        : null
    }
    moveTargets={null /* Task 9 replaces this */}
    displaceTargets={null /* Task 10 replaces this */}
    onSelectVertex={handleKnightVertexSelect}
    onSelectKnight={() => {} /* Task 10 replaces this */}
  />
)}
```

(`colorTokenByPlayerId` — check whether a memo of this exact shape already exists near `BoardInteractions`'s own internal one; if not already hoisted to `App.tsx` scope, add `const colorTokenByPlayerId = useMemo(() => new Map(players.map((p) => [p.id, p.colorToken])), [players])` once, reused by both `KnightLayer` and any other consumer.)

Also pass `BoardInteractions` its new required `cityWalls` prop (from Task 5): `cityWalls={new Set(players.flatMap((p) => p.cityWalls))}`.

In `GameHud.tsx`, add a `KnightsPanel` prop passthrough mirroring how `ProgressCardsPanel` is wired (new props on `GameHudProps`: `viewer`'s player object is already available as `viewer`; add `onRecruitKnight`, `canRecruitKnight`, etc., then render `{gameRules.citiesAndKnightsKnights && <KnightsPanel player={viewer} isMyTurn={canPlayProgressCards} onRecruit={onRecruitKnight} ... />}` near where `ProgressCardsPanel` renders). Thread the new props down from `App.tsx`'s `<GameHud>` call site.

- [ ] **Step 6: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/components/hud/GameHud.tsx src/multiplayer/useRoomChannel.ts`
Expected: clean, except placeholder-prop TODOs explicitly marked for Tasks 9-10 above (those are real gaps this task deliberately leaves for later tasks — confirm the ONLY remaining type errors are the empty-function/null placeholders written above, nothing else).

Then start the dev server (`cd catan-3d && npm run dev`) and manually verify in a browser: with `citiesAndKnightsKnights` on, click "Recruit" in the Knights panel, confirm gold target rings appear on vertices touching your roads, click one, confirm a knight cone appears there and resources/supply update.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/hud/GameHud.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: wire up knight recruitment"
```

---

### Task 8: App.tsx Wiring — Activate & Promote Knight

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `canActivateKnight`, `canPromoteKnight`, `nextKnightStrength` (from `./game/knights`); `KNIGHT_ACTIVATE_COST`, `KNIGHT_PROMOTE_COST` (from `./game/types`); `knightsPromotedThisTurn` (Task 7).
- Produces: `activateKnight(knightId)`, `promoteKnight(knightId)`, `KnightActivatedPayload`, `KnightPromotedPayload`.

Both actions resolve immediately (no board picker) — the closest existing template is `buyDevCard`'s straightforward resource-deduct-and-broadcast shape, not Merchant/Invention's 2-step pattern.

- [ ] **Step 1: Write the handlers**

```tsx
const activateKnight = (knightId: string) => {
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  const player = players[currentPlayerIndex]
  const knight = player.knightPieces.find((k) => k.id === knightId)
  if (!knight || !canActivateKnight(player, knight)) {
    warn('Cannot activate that knight.')
    return
  }
  setPlayers((prev) =>
    prev.map((p) =>
      p.id !== player.id
        ? p
        : {
            ...p,
            resources: deductCost(p.resources, KNIGHT_ACTIVATE_COST),
            knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, active: true } : k)),
          },
    ),
  )
  if (onlineInfo) broadcastKnightActivated({ playerId: player.id, knightId })
}

const promoteKnight = (knightId: string) => {
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  const player = players[currentPlayerIndex]
  const knight = player.knightPieces.find((k) => k.id === knightId)
  if (!knight) {
    warn('Cannot promote that knight.')
    return
  }
  if (knightsPromotedThisTurn.has(knightId)) {
    warn('That knight was already promoted this turn.')
    return
  }
  if (!canPromoteKnight(player, knight)) {
    warn('Cannot promote that knight.')
    return
  }
  const next = nextKnightStrength(knight.strength)!
  setPlayers((prev) =>
    prev.map((p) =>
      p.id !== player.id
        ? p
        : {
            ...p,
            resources: deductCost(p.resources, KNIGHT_PROMOTE_COST),
            knightSupply: { ...p.knightSupply, [knight.strength]: p.knightSupply[knight.strength] + 1, [next]: p.knightSupply[next] - 1 },
            knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, strength: next } : k)),
          },
    ),
  )
  setKnightsPromotedThisTurn((prev) => new Set(prev).add(knightId))
  if (onlineInfo) broadcastKnightPromoted({ playerId: player.id, knightId, newStrength: next })
}
```

- [ ] **Step 2: Broadcast payloads and receive handlers**

In `useRoomChannel.ts`:

```ts
export interface KnightActivatedPayload {
  playerId: number
  knightId: string
}

export interface KnightPromotedPayload {
  playerId: number
  knightId: string
  newStrength: KnightStrength
}
```

Add senders `broadcastKnightActivated`/`broadcastKnightPromoted` mirroring `broadcastKnightRecruited` from Task 7, and the corresponding entries in the receive-handler interface.

In `App.tsx`:

```tsx
onKnightActivated: (payload) => {
  setPlayers((prev) =>
    prev.map((p) =>
      p.id !== payload.playerId
        ? p
        : {
            ...p,
            resources: deductCost(p.resources, KNIGHT_ACTIVATE_COST),
            knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, active: true } : k)),
          },
    ),
  )
},
onKnightPromoted: (payload) => {
  setPlayers((prev) =>
    prev.map((p) => {
      if (p.id !== payload.playerId) return p
      const knight = p.knightPieces.find((k) => k.id === payload.knightId)
      if (!knight) return p
      return {
        ...p,
        resources: deductCost(p.resources, KNIGHT_PROMOTE_COST),
        knightSupply: {
          ...p.knightSupply,
          [knight.strength]: p.knightSupply[knight.strength] + 1,
          [payload.newStrength]: p.knightSupply[payload.newStrength] - 1,
        },
        knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, strength: payload.newStrength } : k)),
      }
    }),
  )
  setKnightsPromotedThisTurn((prev) => new Set(prev).add(payload.knightId))
},
```

- [ ] **Step 3: Clear `knightsPromotedThisTurn` on turn end**

Find `handleEndTurn`'s existing reset of `devCardsBoughtThisTurn` (or similar per-turn state) and add alongside it:

```tsx
setKnightsPromotedThisTurn(new Set())
```

- [ ] **Step 4: Wire `KnightsPanel`'s `onActivate`/`onPromote`/`canPromote` props**

In `GameHud.tsx`'s `KnightsPanel` render (from Task 7), pass `onActivate={onActivateKnight}`, `onPromote={onPromoteKnight}`, `canPromote={(knight) => canPromoteKnight(viewer, knight) && !knightsPromotedThisTurn.has(knight.id)}` — thread `knightsPromotedThisTurn` down as a new `GameHudProps` field from `App.tsx`.

- [ ] **Step 5: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/multiplayer/useRoomChannel.ts`
Expected: clean.

Dev server: recruit a knight, activate it, promote it (with enough resources/supply), confirm the 3D token's height changes per Task 5's `KNIGHT_HEIGHT_PER_STRENGTH`.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts catan-3d/src/components/hud/GameHud.tsx
git commit -m "feat: wire up knight activation and promotion"
```

---

### Task 9: App.tsx Wiring — Move a Knight

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `knightMoveTargets` (from `./game/knights`); `armedKnightAction` (Task 7).
- Produces: extends `handleKnightVertexSelect` (Task 7) with a `mode === 'move'` branch, `KnightMovedPayload`.

- [ ] **Step 1: Add the arm handler**

```tsx
const armKnightMove = (knightId: string) => {
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  const player = players[currentPlayerIndex]
  const knight = player.knightPieces.find((k) => k.id === knightId)
  if (!knight || !knight.active) {
    warn('That knight cannot move.')
    return
  }
  if (pendingKnightRecruit != null || armedKnightAction) {
    warn('Finish the current knight action first.')
    return
  }
  setArmedKnightAction({ knightId, mode: 'move' })
}
```

- [ ] **Step 2: Extend `handleKnightVertexSelect` (Task 7's function) with the move branch**

Replace the `// Task 9 (Move) adds its own branch here` placeholder comment from Task 7 with:

```tsx
  if (armedKnightAction?.mode === 'move') {
    const { knightId } = armedKnightAction
    const player = players[currentPlayerIndex]
    const knight = player.knightPieces.find((k) => k.id === knightId)
    if (!knight) {
      setArmedKnightAction(null)
      return
    }
    const knightsByVertex = new Map(players.flatMap((p) => p.knightPieces.map((k) => [k.vertexId, k] as const)))
    const targets = knightMoveTargets(knight, graph, roads, settlements, knightsByVertex)
    if (!targets.has(vertexId)) {
      warn('Not a valid move.')
      return
    }
    setPlayers((prev) =>
      prev.map((p) =>
        p.id !== player.id
          ? p
          : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, vertexId, active: false } : k)) },
      ),
    )
    setArmedKnightAction(null)
    if (onlineInfo) broadcastKnightMoved({ playerId: player.id, knightId, vertexId })
    return
  }
```

(Insert this block BEFORE the closing of `handleKnightVertexSelect`, after the `pendingKnightRecruit` branch from Task 7 — both branches `return` early, so order between them doesn't matter functionally, but keep `pendingKnightRecruit` first since Task 7 wrote it first.)

- [ ] **Step 3: Broadcast payload and receive handler**

```ts
export interface KnightMovedPayload {
  playerId: number
  knightId: string
  vertexId: string
}
```

Sender `broadcastKnightMoved`, mirroring Task 7/8's senders. Receive handler in `App.tsx`:

```tsx
onKnightMoved: (payload) => {
  setPlayers((prev) =>
    prev.map((p) =>
      p.id !== payload.playerId
        ? p
        : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, vertexId: payload.vertexId, active: false } : k)) },
    ),
  )
},
```

- [ ] **Step 4: Wire `moveTargets` into `KnightLayer` and `KnightsPanel.onArmMove`**

In `App.tsx`'s `<KnightLayer>` (Task 7), replace `moveTargets={null /* Task 9 replaces this */}` with:

```tsx
moveTargets={
  armedKnightAction?.mode === 'move'
    ? (() => {
        const knight = players.flatMap((p) => p.knightPieces).find((k) => k.id === armedKnightAction.knightId)
        return knight ? knightMoveTargets(knight, graph, roads, settlements, knightPiecesByVertex) : null
      })()
    : null
}
```

Wire `KnightsPanel`'s `onArmMove={armKnightMove}` and pass `armedKnightId={armedKnightAction?.knightId ?? null}` down from `App.tsx` through `GameHud.tsx`.

- [ ] **Step 5: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/multiplayer/useRoomChannel.ts`

Dev server: recruit + activate a knight, click Move, confirm cyan targets appear only along your own road network (not through opponent pieces — test against a board with an opponent settlement/knight blocking a path), click one, confirm the knight relocates and goes inactive.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts catan-3d/src/components/hud/GameHud.tsx
git commit -m "feat: wire up moving a knight"
```

---

### Task 10: App.tsx Wiring — Displace a Knight

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: `knightDisplaceTargets`, `knightMoveTargets` (for resolving the displaced knight's forced move — from `./game/knights`).
- Produces: `armKnightDisplace(knightId)`, a `handleKnightSelect(targetKnightId)` resolve handler (`KnightLayer`'s `onSelectKnight` callback — separate from `handleKnightVertexSelect` since displace targets are OTHER KNIGHTS, not empty vertices), `KnightDisplacedPayload`.

- [ ] **Step 1: Add the arm handler**

```tsx
const armKnightDisplace = (knightId: string) => {
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  const player = players[currentPlayerIndex]
  const knight = player.knightPieces.find((k) => k.id === knightId)
  if (!knight || !knight.active) {
    warn('That knight cannot displace.')
    return
  }
  if (pendingKnightRecruit != null || armedKnightAction) {
    warn('Finish the current knight action first.')
    return
  }
  setArmedKnightAction({ knightId, mode: 'displace' })
}
```

- [ ] **Step 2: Add the resolve handler**

```tsx
const handleKnightSelect = (targetKnightId: string) => {
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  if (armedKnightAction?.mode !== 'displace') return
  const { knightId } = armedKnightAction
  const player = players[currentPlayerIndex]
  const mover = player.knightPieces.find((k) => k.id === knightId)
  if (!mover) {
    setArmedKnightAction(null)
    return
  }
  const knightsByVertex = new Map(players.flatMap((p) => p.knightPieces.map((k) => [k.vertexId, k] as const)))
  const targets = knightDisplaceTargets(mover, graph, roads, settlements, knightsByVertex)
  const target = targets.find((k) => k.id === targetKnightId)
  if (!target) {
    warn('Not a valid displace target.')
    return
  }
  const targetOwner = playerById.get(target.ownerId)!
  // Where the displaced knight is forced to — reachable empty vertex from
  // ITS OWN owner's road network, same reachability rule as an ordinary
  // move, computed as if the knight were still standing where it is right
  // now (its own vertexId is the origin). Picked deterministically (lowest
  // vertex id) — CN3087 places no choice constraint on which one.
  const forcedTargets = [...knightMoveTargets(target, graph, roads, settlements, knightsByVertex)].sort()
  const displacedVertexId = forcedTargets[0] ?? null // null => removed to supply, no empty reachable vertex

  setPlayers((prev) =>
    prev.map((p) => {
      if (p.id === player.id) {
        return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === knightId ? { ...k, vertexId: target.vertexId, active: false } : k)) }
      }
      if (p.id === targetOwner.id) {
        if (displacedVertexId) {
          return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === target.id ? { ...k, vertexId: displacedVertexId } : k)) }
        }
        return {
          ...p,
          knightPieces: p.knightPieces.filter((k) => k.id !== target.id),
          knightSupply: { ...p.knightSupply, [target.strength]: p.knightSupply[target.strength] + 1 },
        }
      }
      return p
    }),
  )
  setArmedKnightAction(null)
  if (onlineInfo) {
    broadcastKnightDisplaced({ moverId: player.id, knightId, displacedOwnerId: targetOwner.id, targetKnightId, newMoverVertexId: target.vertexId, displacedVertexId })
  }
}
```

- [ ] **Step 3: Broadcast payload and receive handler**

```ts
export interface KnightDisplacedPayload {
  moverId: number
  knightId: string
  displacedOwnerId: number
  targetKnightId: string
  newMoverVertexId: string
  displacedVertexId: string | null
}
```

Sender `broadcastKnightDisplaced`. Receive handler — trusted-apply, mirroring the local resolution exactly:

```tsx
onKnightDisplaced: (payload) => {
  setPlayers((prev) =>
    prev.map((p) => {
      if (p.id === payload.moverId) {
        return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, vertexId: payload.newMoverVertexId, active: false } : k)) }
      }
      if (p.id === payload.displacedOwnerId) {
        if (payload.displacedVertexId) {
          return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === payload.targetKnightId ? { ...k, vertexId: payload.displacedVertexId! } : k)) }
        }
        const removed = p.knightPieces.find((k) => k.id === payload.targetKnightId)
        return {
          ...p,
          knightPieces: p.knightPieces.filter((k) => k.id !== payload.targetKnightId),
          knightSupply: removed ? { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 } : p.knightSupply,
        }
      }
      return p
    }),
  )
},
```

- [ ] **Step 4: Wire `displaceTargets` into `KnightLayer` and `KnightsPanel.onArmDisplace`**

In `App.tsx`'s `<KnightLayer>`, replace `displaceTargets={null /* Task 10 replaces this */}` with:

```tsx
displaceTargets={
  armedKnightAction?.mode === 'displace'
    ? (() => {
        const knight = players.flatMap((p) => p.knightPieces).find((k) => k.id === armedKnightAction.knightId)
        return knight ? knightDisplaceTargets(knight, graph, roads, settlements, knightPiecesByVertex) : null
      })()
    : null
}
```

and `onSelectKnight={() => {} /* Task 10 replaces this */}` → `onSelectKnight={handleKnightSelect}`.

Wire `KnightsPanel`'s `onArmDisplace={armKnightDisplace}`.

- [ ] **Step 5: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/multiplayer/useRoomChannel.ts`

Dev server (2 players in Pass & Play): give player 1 a strong knight adjacent (via roads) to player 2's basic knight, click Displace, confirm the red target appears on player 2's knight, click it, confirm player 1's knight takes that spot and player 2's knight relocates (or returns to supply if boxed in).

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts catan-3d/src/components/hud/GameHud.tsx
git commit -m "feat: wire up displacing a knight"
```

---

### Task 11: App.tsx Wiring — Chase Away the Robber

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`

**Interfaces:**
- Consumes: existing `moveRobber`, `graph.tileVertexIds`, `graph.vertexTileIds`, the existing `gamePhase: GamePhase` state machine (`'setup' | 'playing' | 'discard' | 'moveRobber'`).
- Produces: `armChaseRobber(knightId)`, extends `moveRobber` with a knight-deactivation tail, extends its broadcast payload.

An active knight adjacent to the robber's hex can trigger the SAME robber-move-and-steal flow a rolled 7 already uses (`gamePhase = 'moveRobber'`, resolved by clicking a tile in `RobberLayer`). The only new behavior: remember which knight initiated it, and deactivate that knight once the move resolves. `moveRobber`'s existing `thief = players[currentPlayerIndex]` assumption is correct here unchanged — a knight action can only ever be taken by the current turn's player (this is already enforced by every other knight handler's `isMyTurn` guard), so the knight owner and the robber-move's `thief` are always the same player.

- [ ] **Step 1: Add state and the arm handler**

```tsx
// Cities & Knights "Chase Away the Robber" — which knight is mid-action
// while gamePhase is 'moveRobber' via this entry point (as opposed to a
// rolled 7). Local-only, cleared once moveRobber resolves.
const [chasingRobberKnightId, setChasingRobberKnightId] = useState<string | null>(null)

const armChaseRobber = (knightId: string) => {
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  if (gamePhase !== 'playing') {
    warn('Cannot chase the robber right now.')
    return
  }
  const player = players[currentPlayerIndex]
  const knight = player.knightPieces.find((k) => k.id === knightId)
  if (!knight || !knight.active) {
    warn('That knight cannot chase the robber.')
    return
  }
  const adjacentTileIds = new Set(graph.vertexTileIds.get(knight.vertexId) ?? [])
  if (!adjacentTileIds.has(robberTileId)) {
    warn('That knight is not next to the robber.')
    return
  }
  setChasingRobberKnightId(knightId)
  setGamePhase('moveRobber')
}
```

- [ ] **Step 2: Find and extend `moveRobber`'s tail**

Run: `cd catan-3d && grep -n "setGamePhase('playing')" src/App.tsx` to find every place `moveRobber` (and the ordinary 7-triggered path) returns to the `'playing'` phase. Read `moveRobber`'s full body (starts at line 2891) through to its own `setGamePhase('playing')` call and its broadcast call (likely `broadcastRobberMoved` or similar — confirm the exact existing name via `grep -n "broadcastRobberMoved\|RobberMovedPayload" src/App.tsx src/multiplayer/useRoomChannel.ts`).

Immediately before `moveRobber`'s own `setGamePhase('playing')` line, add:

```tsx
    if (chasingRobberKnightId) {
      const chaserId = chasingRobberKnightId
      setPlayers((prev) =>
        prev.map((p) =>
          p.id !== thief.id ? p : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === chaserId ? { ...k, active: false } : k)) },
        ),
      )
      setChasingRobberKnightId(null)
      if (onlineInfo) broadcastKnightDeactivatedAfterChase({ playerId: thief.id, knightId: chaserId })
    }
```

(`thief` is already in scope from `moveRobber`'s own body — reuse it, don't redeclare.) This broadcasts as a SEPARATE small event from the existing robber-move broadcast, rather than widening that broadcast's payload — the existing robber-move payload is shared with the ordinary 7-triggered path, which has no knight to deactivate, so widening it would force every non-knight caller to pass a meaningless `null`.

- [ ] **Step 3: Broadcast payload and receive handler**

```ts
export interface KnightDeactivatedAfterChasePayload {
  playerId: number
  knightId: string
}
```

Sender `broadcastKnightDeactivatedAfterChase`. Receive handler in `App.tsx`:

```tsx
onKnightDeactivatedAfterChase: (payload) => {
  setPlayers((prev) =>
    prev.map((p) =>
      p.id !== payload.playerId ? p : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === payload.knightId ? { ...k, active: false } : k)) },
    ),
  )
},
```

- [ ] **Step 4: Reset**

In `resetGame`, add `setChasingRobberKnightId(null)` alongside the other Task 7 resets.

- [ ] **Step 5: Wire `KnightsPanel`'s `onArmChaseRobber`/`canChaseRobber`**

`onArmChaseRobber={armChaseRobber}`, `canChaseRobber={(knight) => new Set(graph.vertexTileIds.get(knight.vertexId) ?? []).has(robberTileId)}`.

- [ ] **Step 6: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/multiplayer/useRoomChannel.ts`

Dev server: place an active knight adjacent to the robber's hex, click "Chase Robber," confirm the existing robber tile-picker UI opens (same visual as a rolled 7), pick a new tile, confirm the steal resolves normally AND the knight goes inactive.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts catan-3d/src/components/hud/GameHud.tsx
git commit -m "feat: wire up chasing the robber with a knight"
```

---

### Task 12: App.tsx Wiring — Build City Wall

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts`
- Modify: `catan-3d/src/components/hud/ResourcePanel.tsx`

**Interfaces:**
- Consumes: `canBuildCityWall` (from `./game/knights`); `CITY_WALL_COST` (from `./game/types`).
- Produces: `buildCityWall(vertexId)`, `CityWallBuiltPayload`.

Unlike knight recruit/move, this needs no board picker — the target (a specific one of the viewer's own cities) is chosen via a HUD affordance, not a board click, since `ResourcePanel.tsx`'s existing Trade/Buy-Dev-Card buttons are the closer template here (a plain `disabled`-gated button calling a passed-in prop) rather than a new `BoardInteractions`/`KnightLayer`-style overlay.

- [ ] **Step 1: Add the handler**

```tsx
const buildCityWall = (vertexId: string) => {
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  const player = players[currentPlayerIndex]
  const totalWallsOnBoard = players.reduce((sum, p) => sum + p.cityWalls.length, 0)
  if (!canBuildCityWall(player, vertexId, settlements, totalWallsOnBoard)) {
    warn('Cannot build a city wall there.')
    return
  }
  setPlayers((prev) =>
    prev.map((p) => (p.id !== player.id ? p : { ...p, resources: deductCost(p.resources, CITY_WALL_COST), cityWalls: [...p.cityWalls, vertexId] })),
  )
  if (onlineInfo) broadcastCityWallBuilt({ playerId: player.id, vertexId })
}
```

- [ ] **Step 2: Broadcast payload and receive handler**

```ts
export interface CityWallBuiltPayload {
  playerId: number
  vertexId: string
}
```

Sender `broadcastCityWallBuilt`. Receive handler:

```tsx
onCityWallBuilt: (payload) => {
  setPlayers((prev) =>
    prev.map((p) => (p.id !== payload.playerId ? p : { ...p, resources: deductCost(p.resources, CITY_WALL_COST), cityWalls: [...p.cityWalls, payload.vertexId] })),
  )
},
```

- [ ] **Step 3: Add the HUD button**

In `catan-3d/src/components/hud/ResourcePanel.tsx`, add a new prop `citiesAndKnightsKnights: boolean`, `ownCities: string[]` (vertex ids the viewer owns, type `'city'`), `canBuildWallAt: (vertexId: string) => boolean`, `onBuildWall: (vertexId: string) => void`. Render, near the existing Buy Dev Card button:

```tsx
{citiesAndKnightsKnights && ownCities.length > 0 && (
  <div className="flex flex-col gap-1">
    <span className="font-body text-[10px] tracking-[0.2em] text-white/60 uppercase">City Walls</span>
    <div className="flex gap-1">
      {ownCities.map((vertexId) => (
        <button
          key={vertexId}
          type="button"
          disabled={!canBuildWallAt(vertexId)}
          onClick={() => onBuildWall(vertexId)}
          className="rounded bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40"
        >
          Wall
        </button>
      ))}
    </div>
  </div>
)}
```

Thread `ownCities` from `GameHud.tsx`/`App.tsx` as `Object.entries(settlements).filter(([, b]) => b.ownerId === viewer.id && b.type === 'city').map(([vertexId]) => vertexId)`, `canBuildWallAt={(vertexId) => canBuildCityWall(viewer, vertexId, settlements, totalWallsOnBoard)}`, `onBuildWall={buildCityWall}`.

- [ ] **Step 4: Reset**

`players`' own `cityWalls` resets automatically via `createInitialPlayers` inside `resetGame` — no separate reset call needed (same as `knightPieces`/`knightSupply` from Task 7).

- [ ] **Step 5: Manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/multiplayer/useRoomChannel.ts src/components/hud/ResourcePanel.tsx`

Dev server: build a city, click Wall, confirm the ring appears (Task 5's visual) and the discard-on-7 threshold rises by 2 (Task 4).

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/multiplayer/useRoomChannel.ts catan-3d/src/components/hud/ResourcePanel.tsx catan-3d/src/components/hud/GameHud.tsx
git commit -m "feat: wire up building city walls"
```

---

### Task 13: Progress Card Unstubs — Engineering, Smithing, Encouragement

**Files:**
- Modify: `catan-3d/src/App.tsx`
- Modify: `catan-3d/src/components/hud/ProgressCardsPanel.tsx` (if its "not yet implemented" stub list is hardcoded there — confirm via `grep -n "not yet implemented" src/components/hud/ProgressCardsPanel.tsx src/App.tsx`)

**Interfaces:**
- Consumes: `canBuildCityWall`, `canPromoteKnight`, `nextKnightStrength` (from `./game/knights`); the existing `removeOne` helper; the card-play dispatch table Phase B built for `ProgressCardsPanel`'s `playHandlers` prop.

- [ ] **Step 1: Engineering — free city wall**

Find Engineering's current no-op handler (search `grep -n "engineering" src/App.tsx`). Replace it with: spend the card, then require the player to pick one of their own eligible cities (reuse Task 12's `ResourcePanel` wall-button UI — Engineering doesn't need its OWN board/HUD picker, it just needs the SAME "click one of my eligible cities" affordance to become active for free). Simplest correct implementation: set a `pendingFreeCityWall: number | null` local-only state (mirrors `pendingMerchantPlacement`'s shape) that, when non-null, makes `ResourcePanel`'s Wall buttons call a free-build path instead of `buildCityWall`:

```tsx
const [pendingFreeCityWall, setPendingFreeCityWall] = useState<number | null>(null)

const playEngineering = () => {
  if (!canPlayProgressCardNow()) return
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('engineering')) {
    warn('No Engineering card to play.')
    return
  }
  const totalWallsOnBoard = players.reduce((sum, p) => sum + p.cityWalls.length, 0)
  const hasEligibleCity = Object.entries(settlements).some(
    ([vertexId, b]) => b.ownerId === player.id && b.type === 'city' && canBuildCityWall({ ...player, resources: { ...player.resources, brick: 999 } }, vertexId, settlements, totalWallsOnBoard),
  )
  if (!hasEligibleCity) {
    warn('No eligible city for a free wall.')
    return
  }
  setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'engineering') } : p)))
  setPendingFreeCityWall(player.id)
  inform(`${player.name} played Engineering — choose a city for a free wall.`)
}

const resolveFreeCityWall = (vertexId: string) => {
  if (pendingFreeCityWall == null) return
  const playerId = pendingFreeCityWall
  const player = playerById.get(playerId)!
  const totalWallsOnBoard = players.reduce((sum, p) => sum + p.cityWalls.length, 0)
  const building = settlements[vertexId]
  if (!building || building.ownerId !== playerId || building.type !== 'city' || player.cityWalls.includes(vertexId) || totalWallsOnBoard >= 3) {
    warn('Not a valid free wall target.')
    return
  }
  setPlayers((prev) => prev.map((p) => (p.id !== playerId ? p : { ...p, cityWalls: [...p.cityWalls, vertexId] })))
  setPendingFreeCityWall(null)
  if (onlineInfo) broadcastCityWallBuilt({ playerId, vertexId })
}
```

(`{ ...player, resources: { ...player.resources, brick: 999 } }` is a deliberate throwaway-clone trick to reuse `canBuildCityWall`'s eligibility check minus its resource-affordability half, without duplicating the other 3 checks — acceptable here since it's a local variable never written back to state.)

In `ResourcePanel.tsx`'s Wall buttons (Task 12), branch `onClick` between `onBuildWall`/`onResolveFreeWall` based on a new `freeWallActive: boolean` prop threaded from `pendingFreeCityWall === viewer.id`.

- [ ] **Step 2: Smithing — promote up to 2 knights free**

```tsx
const playSmithing = () => {
  if (!canPlayProgressCardNow()) return
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('smithing')) {
    warn('No Smithing card to play.')
    return
  }
  const promotable = player.knightPieces.filter(
    (k) => nextKnightStrength(k.strength) != null && canPromoteKnight({ ...player, resources: { ...player.resources, wool: 999, ore: 999 } }, k) && !knightsPromotedThisTurn.has(k.id),
  )
  if (promotable.length === 0) {
    warn('No knights eligible to promote.')
    return
  }
  const toPromote = promotable.slice(0, 2)
  setPlayers((prev) =>
    prev.map((p) => {
      if (p.id !== player.id) return p
      let supply = { ...p.knightSupply }
      const knightPieces = p.knightPieces.map((k) => {
        const promoting = toPromote.find((t) => t.id === k.id)
        if (!promoting) return k
        const next = nextKnightStrength(k.strength)!
        supply = { ...supply, [k.strength]: supply[k.strength] + 1, [next]: supply[next] - 1 }
        return { ...k, strength: next }
      })
      return { ...p, progressCards: removeOne(p.progressCards, 'smithing'), knightSupply: supply, knightPieces }
    }),
  )
  setKnightsPromotedThisTurn((prev) => {
    const next = new Set(prev)
    for (const k of toPromote) next.add(k.id)
    return next
  })
  inform(`${player.name} played Smithing — promoted ${toPromote.length} knight(s).`)
  if (onlineInfo) broadcastSmithingPlayed({ playerId: player.id, knightIds: toPromote.map((k) => k.id) })
}
```

Add `SmithingPlayedPayload { playerId: number; knightIds: string[] }`, sender, and a trusted-apply receive handler that re-derives each knight's `next` strength the same way (do not trust a `newStrength` in the payload per-knight — derive it locally from each knight's CURRENT strength on the receiving client, since `nextKnightStrength` is a pure function every client can compute identically, avoiding a payload that could claim an impossible jump if malformed).

- [ ] **Step 3: Encouragement — activate all knights free**

```tsx
const playEncouragement = () => {
  if (!canPlayProgressCardNow()) return
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('encouragement')) {
    warn('No Encouragement card to play.')
    return
  }
  setPlayers((prev) =>
    prev.map((p) => (p.id !== player.id ? p : { ...p, progressCards: removeOne(p.progressCards, 'encouragement'), knightPieces: p.knightPieces.map((k) => ({ ...k, active: true })) })),
  )
  inform(`${player.name} played Encouragement — all knights activated.`)
  if (onlineInfo) broadcastEncouragementPlayed({ playerId: player.id })
}
```

Add `EncouragementPlayedPayload { playerId: number }`, sender, receive handler mirroring the local resolution.

- [ ] **Step 4: Wire into `ProgressCardsPanel`'s `playHandlers`**

Remove Engineering/Smithing/Encouragement from whatever "not yet implemented" list gates them (found via Step 1's grep), add `engineering: playEngineering, smithing: playSmithing, encouragement: playEncouragement` to the `playHandlers` object passed into `<ProgressCardsPanel>`.

- [ ] **Step 5: Typecheck, lint, manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx src/components/hud/ResourcePanel.tsx src/multiplayer/useRoomChannel.ts`

Dev server: draw/force these 3 cards (or temporarily seed a hand via devtools) and confirm each resolves correctly.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/hud/ResourcePanel.tsx catan-3d/src/components/hud/ProgressCardsPanel.tsx catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: unstub Engineering, Smithing, and Encouragement progress cards"
```

---

### Task 14: Progress Card Unstubs — Intrigue, Treason

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `knightDisplaceTargets` (from `./game/knights`); the existing single-target-player picker pattern (`PlayerTargetPicker` component, already used by Espionage/Guild Dues per Phase B).

- [ ] **Step 1: Intrigue — displace without using your own knight**

Intrigue reuses Task 10's displace RESOLUTION logic but skips the "mover must be one of the player's own active knights" requirement — the card itself is the "mover." Add a local-only pending state:

```tsx
const [pendingIntrigueDisplace, setPendingIntrigueDisplace] = useState<number | null>(null)

const playIntrigue = () => {
  if (!canPlayProgressCardNow()) return
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('intrigue')) {
    warn('No Intrigue card to play.')
    return
  }
  // Eligible targets: any opponent knight reachable along THIS player's own
  // road network from ANY of their own vertices — CN3087: "must be on an
  // intersection connected to at least one of your routes." Modeled as a
  // virtual basic knight standing at every one of the player's own
  // building vertices simultaneously isn't practical with the existing
  // single-origin reachability helper, so this unions reachability from
  // each of the player's own buildings/knights instead.
  const ownVertexIds = [
    ...Object.entries(settlements).filter(([, b]) => b.ownerId === player.id).map(([v]) => v),
    ...player.knightPieces.map((k) => k.vertexId),
  ]
  const knightsByVertex = new Map(players.flatMap((p) => p.knightPieces.map((k) => [k.vertexId, k] as const)))
  const hasTarget = ownVertexIds.some((origin) => {
    const virtualMover = { id: '__intrigue__', ownerId: player.id, strength: 'mighty' as const, active: true, vertexId: origin }
    return knightDisplaceTargets(virtualMover, graph, roads, settlements, knightsByVertex).length > 0
  })
  if (!hasTarget) {
    warn('No knight available to displace with Intrigue.')
    return
  }
  setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, progressCards: removeOne(p.progressCards, 'intrigue') } : p)))
  setPendingIntrigueDisplace(player.id)
  inform(`${player.name} played Intrigue — choose an opponent knight to displace.`)
}
```

`'mighty'` as the virtual mover's strength is deliberate — Intrigue's displaced knight can be ANY strength (CN3087 places no strength restriction on Intrigue's targets, unlike an ordinary Displace action which requires the mover to be strictly stronger), so using the top strength ensures `knightDisplaceTargets`'s `>= ` strength filter never wrongly excludes a valid target.

Add `handleKnightSelect` (Task 10) a leading branch:

```tsx
  if (pendingIntrigueDisplace != null) {
    const playerId = pendingIntrigueDisplace
    const targetOwner = players.flatMap((p) => p.knightPieces.map((k) => ({ ...k, ownerPlayer: p }))).find((k) => k.id === targetKnightId)
    if (!targetOwner) {
      warn('Not a valid target.')
      return
    }
    // Reuse the same "reachable empty vertex from the displaced knight's
    // OWN network, else removed to supply" resolution Task 10's ordinary
    // displace already established.
    const knightsByVertex = new Map(players.flatMap((p) => p.knightPieces.map((k) => [k.vertexId, k] as const)))
    const forcedTargets = [...knightMoveTargets(targetOwner, graph, roads, settlements, knightsByVertex)].sort()
    const displacedVertexId = forcedTargets[0] ?? null
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== targetOwner.ownerId) return p
        if (displacedVertexId) {
          return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === targetKnightId ? { ...k, vertexId: displacedVertexId } : k)) }
        }
        return { ...p, knightPieces: p.knightPieces.filter((k) => k.id !== targetKnightId), knightSupply: { ...p.knightSupply, [targetOwner.strength]: p.knightSupply[targetOwner.strength] + 1 } }
      }),
    )
    setPendingIntrigueDisplace(null)
    if (onlineInfo) broadcastIntrigueResolved({ displacedOwnerId: targetOwner.ownerId, targetKnightId, displacedVertexId })
    return
  }
```

(Insert as the FIRST branch inside `handleKnightSelect`, before Task 10's ordinary-displace body — this is a distinct pending flag, so the two branches never both fire.)

Add `IntrigueResolvedPayload { displacedOwnerId: number; targetKnightId: string; displacedVertexId: string | null }`, sender `broadcastIntrigueResolved`, trusted-apply receive handler mirroring the local resolution.

Wire `KnightLayer`'s `displaceTargets` prop with an additional branch for `pendingIntrigueDisplace != null` (union of `knightDisplaceTargets` from every one of the acting player's own vertices, matching `hasTarget`'s computation above).

- [ ] **Step 2: Treason — target removes a knight, you may place one of equal-or-lower strength/status**

```tsx
const playTreason = (targetPlayerId: number) => {
  if (!canPlayProgressCardNow()) return
  if (!isMyTurn) {
    warn("It's not your turn.")
    return
  }
  const player = players[currentPlayerIndex]
  if (!player.progressCards.includes('treason')) {
    warn('No Treason card to play.')
    return
  }
  const target = playerById.get(targetPlayerId)
  if (!target || target.knightPieces.length === 0) {
    warn('That player has no knights to remove.')
    return
  }
  // The TARGET chooses which of their own knights to remove — since this is
  // a single local UI (no separate "opponent decides" prompt exists in this
  // codebase for Pass & Play, and online play has no out-of-band channel
  // for the opponent's OWN choice mid-turn), the removed knight is picked
  // deterministically: their currently WEAKEST knight (ties broken by
  // vertex id) — a reasonable stand-in for "opponent's choice" that never
  // favors the acting player, since removing the weakest knight is the
  // least costly outcome for the target, matching what a rational opponent
  // would pick anyway.
  const removed = [...target.knightPieces].sort(
    (a, b) => KNIGHT_STRENGTH_VALUE[a.strength] - KNIGHT_STRENGTH_VALUE[b.strength] || a.id.localeCompare(b.id),
  )[0]
  const eligiblePlacementVertices = recruitableVertices(player.id, graph, roads, settlements, new Map(players.flatMap((p) => p.knightPieces.map((k) => [k.vertexId, k] as const))))
  const canPlace =
    eligiblePlacementVertices.size > 0 &&
    (removed.strength === 'mighty' || player.knightSupply[removed.strength] > 0 || KNIGHT_STRENGTH_VALUE[removed.strength] > 1) // acting player may place equal-or-LOWER strength — supply check happens at resolve time via the picker
  setPlayers((prev) =>
    prev.map((p) => {
      if (p.id === player.id) return { ...p, progressCards: removeOne(p.progressCards, 'treason') }
      if (p.id === targetPlayerId) return { ...p, knightPieces: p.knightPieces.filter((k) => k.id !== removed.id), knightSupply: { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 } }
      return p
    }),
  )
  inform(`${player.name} played Treason on ${target.name} — removed their ${removed.strength} knight.`)
  if (onlineInfo) broadcastTreasonRemoved({ actingPlayerId: player.id, targetPlayerId, removedKnight: removed })
  if (canPlace) {
    setPendingTreasonPlacement({ playerId: player.id, maxStrength: removed.strength, active: removed.active })
  }
}
```

Add `pendingTreasonPlacement: { playerId: number; maxStrength: KnightStrength; active: boolean } | null` state. Add a `handleKnightVertexSelect` (Task 7) leading branch:

```tsx
  if (pendingTreasonPlacement) {
    const { playerId, maxStrength, active } = pendingTreasonPlacement
    const player = playerById.get(playerId)!
    const targets = recruitableVertices(playerId, graph, roads, settlements, new Map(players.flatMap((p) => p.knightPieces.map((k) => [k.vertexId, k] as const))))
    if (!targets.has(vertexId)) {
      warn('Not a valid placement.')
      return
    }
    // Equal-or-lower strength than the removed knight, whichever the player
    // actually has available in supply, preferring the removed knight's own
    // strength first — CN3087: "you may place one of your own knights of
    // the same strength or lower."
    const strengthOptions = KNIGHT_STRENGTH_ORDER.filter((s) => KNIGHT_STRENGTH_VALUE[s] <= KNIGHT_STRENGTH_VALUE[maxStrength]).reverse()
    const available = strengthOptions.find((s) => player.knightSupply[s] > 0)
    if (!available) {
      setPendingTreasonPlacement(null)
      return
    }
    const newKnight: KnightPiece = { id: `knight-${playerId}-${Date.now()}`, ownerId: playerId, strength: available, active, vertexId }
    setPlayers((prev) => prev.map((p) => (p.id !== playerId ? p : { ...p, knightSupply: { ...p.knightSupply, [available]: p.knightSupply[available] - 1 }, knightPieces: [...p.knightPieces, newKnight] })))
    setPendingTreasonPlacement(null)
    if (onlineInfo) broadcastKnightRecruited({ knight: newKnight }) // deliberately reuses Task 7's payload/receiver — a "knight appears at this vertex with this strength/status" event needs no Treason-specific shape
    return
  }
```

(Insert as the FIRST branch in `handleKnightVertexSelect`, ahead of `pendingKnightRecruit` and the Task 9 move branch.)

Add `TreasonRemovedPayload { actingPlayerId: number; targetPlayerId: number; removedKnight: KnightPiece }`, sender `broadcastTreasonRemoved`, receive handler:

```tsx
onTreasonRemoved: (payload) => {
  setPlayers((prev) =>
    prev.map((p) => {
      if (p.id === payload.actingPlayerId) return { ...p, progressCards: removeOne(p.progressCards, 'treason') }
      if (p.id === payload.targetPlayerId) return { ...p, knightPieces: p.knightPieces.filter((k) => k.id !== payload.removedKnight.id), knightSupply: { ...p.knightSupply, [payload.removedKnight.strength]: p.knightSupply[payload.removedKnight.strength] + 1 } }
      return p
    }),
  )
},
```

(`onKnightRecruited` from Task 7 already handles the placement half via the reused payload.)

- [ ] **Step 3: Wire into `ProgressCardsPanel`**

Treason needs a target-player picker (reuse the existing `PlayerTargetPicker` component Espionage/Guild Dues already use — find its exact prop shape via `grep -n "PlayerTargetPicker" src/App.tsx` and mirror it). Intrigue has no target-PLAYER picker (it targets a KNIGHT via the board, already wired in Step 1). Remove both from the "not yet implemented" list and add `intrigue: playIntrigue` to `playHandlers`; wire Treason's target-picker the same way Espionage's already is.

- [ ] **Step 4: Typecheck, lint, manual verification**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx`

Dev server: seed/draw both cards in a 2+ player Pass & Play game and confirm each resolves correctly, including the "no eligible target" warn paths.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/App.tsx catan-3d/src/components/hud/ProgressCardsPanel.tsx
git commit -m "feat: unstub Intrigue and Treason progress cards"
```

---

### Task 15: House Rules Checkbox

**Files:**
- Modify: `catan-3d/src/components/hud/HouseRulesDropdown.tsx`

**Interfaces:**
- Consumes: `GameRules.citiesAndKnightsKnights` (Task 1).

- [ ] **Step 1: Add the checkbox**

In `catan-3d/src/components/hud/HouseRulesDropdown.tsx`, extend the `CHECKBOX_RULES` union type and array (currently lines 16-24) with one new entry after `citiesAndKnightsProgressCards`:

```tsx
{ key: 'citiesAndKnightsKnights', label: 'Knights & city walls' },
```

(Add `'citiesAndKnightsKnights'` to the inline union type at the top of that array declaration too.) No other change needed — the render loop, grid layout, and `setRule` generic all already handle a new plain-boolean entry automatically (per this file's existing design, confirmed during planning research).

- [ ] **Step 2: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/components/hud/HouseRulesDropdown.tsx`
Expected: clean.

- [ ] **Step 3: Manual verification**

Dev server: open the House Rules dropdown in setup, confirm the new checkbox appears correctly laid out in the grid, toggling it on enables the Knights panel/board pieces elsewhere in the app.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/components/hud/HouseRulesDropdown.tsx
git commit -m "feat: add Knights & City Walls house rule checkbox"
```

---

### Task 16: Multiplayer Snapshot Round-Trip

**Files:**
- Modify: `catan-3d/src/App.tsx` (`restoreFromSnapshot`'s `normalizedPlayers` mapping)

**Interfaces:**
- Consumes: `KNIGHT_STARTING_SUPPLY` (Task 1).

Since `Player.knightPieces`/`knightSupply`/`cityWalls` (Task 1) live INSIDE the `Player` objects already serialized wholesale via `MatchSnapshot.players: Player[]`, no new top-level `MatchSnapshot` fields are needed — only backward-compatible normalization for snapshots saved before this feature existed, exactly the same shape as the existing `commodities`/`cityImprovements`/`progressCards` fallbacks.

- [ ] **Step 1: Extend `normalizedPlayers`**

In `App.tsx`'s `restoreFromSnapshot` (currently lines 4620-4630), add 3 fields to the existing `.map((p) => ({ ...p, ... }))`:

```tsx
    const normalizedPlayers = snapshot.players.map((p) => ({
      ...p,
      commodities: p.commodities ?? emptyCommodities(),
      cityImprovements: p.cityImprovements ?? emptyCityImprovements(),
      progressCards: p.progressCards ?? [],
      // Cities & Knights knight pieces & city walls — same pre-feature-
      // snapshot gap as the 3 fields above.
      knightPieces: p.knightPieces ?? [],
      knightSupply: p.knightSupply ?? { ...KNIGHT_STARTING_SUPPLY },
      cityWalls: p.cityWalls ?? [],
    }))
```

- [ ] **Step 2: Typecheck**

Run: `cd catan-3d && npx tsc -b`
Expected: clean.

- [ ] **Step 3: Manual verification**

Dev server: start an online game with `citiesAndKnightsKnights` on, recruit/move a knight, build a wall, refresh the browser (triggers `restoreFromSnapshot`), confirm the knight/wall state survives the reload. Then (if feasible) load an OLDER saved snapshot from before this feature existed and confirm it doesn't crash — every player should just show empty knight/wall state.

- [ ] **Step 4: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: round-trip knight pieces and city walls through match snapshots"
```

---

## After All Tasks

Once every task above is complete and individually reviewed, this plan's execution skill (subagent-driven-development) runs ONE final whole-branch review, ONE fix wave for its findings, and ONE scoped re-review, per that skill's own process — do not re-derive that process here.
