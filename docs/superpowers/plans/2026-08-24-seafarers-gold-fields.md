# Seafarers — Gold Fields Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gold Field hexes produce a real, player-chosen resource when their number is rolled (a settlement picks 1, a city picks 2 independently), and a coastal settlement can place a ship instead of a road as its second setup piece — the last two pieces of the Seafarers phase's spec that hadn't shipped yet.

**Architecture:** Gold production can't go through the synchronous `RESOURCES_PRODUCED` loop every other hex uses, since it needs player input mid-resolution. It reuses the exact shape this codebase already solved for Cities & Knights' Science level 3 free-resource pick (`scienceFreeResourcePlayerIds` queue + `SCIENCE_FREE_RESOURCE_PICKED` action + a shared resource-picker modal) — a new `GOLD_FIELD_RESOURCE_PICKED` action, a new queue that (unlike Science's) allows the same player to appear more than once, and one new picker mode. The tile/vertex walk that decides who's owed a pick is extracted into a small pure module (`game/goldFieldProduction.ts`), matching this project's established precedent (`shipEligibility.ts`, `pirateEligibility.ts`) for keeping App.tsx's otherwise-untested closures testable. Setup-phase ship substitution is a separate, much smaller change: `buildShipRaw`/`applyShipPlacement` already accept an `isSetup` flag on `BUILD_SHIP` (added in sub-plan 2) that the reducer layer already handles correctly — only the App.tsx-level guard/completion logic was never wired to use it.

**Tech Stack:** React + TypeScript, Vitest, existing reducer/broadcast conventions.

**Spec:** `docs/superpowers/specs/2026-08-23-seafarers-ships-open-sea-design.md` (Gold fields section; Setup change section for the ship-substitution piece).

## Global Constraints

- One client decides a non-deterministic value (here: a player's chosen resource) and every client — including the deciding one — applies the exact same decided result via a shared trusted-apply function, never re-deriving it (`CONVENTIONS.md` §1, already used throughout this codebase for Science's free-resource pick, the robber/pirate steal, etc.).
- New shared multiplayer state goes into the reducer (players.ts's `GOLD_FIELD_RESOURCE_PICKED` case) — the pending-queue itself (`goldFieldResourcePlayerIds`) is transient per-client UI state, same treatment `scienceFreeResourcePlayerIds` already gets (not persisted in `matchSnapshot.ts`, reset to `[]` on both `resetGame` and `restoreFromSnapshot`, simply dropped on reconnect rather than reconstructed — this is an accepted, already-shipped precedent, not a new gap to solve here).
- **The queue allows duplicate player ids and must be resolved one entry at a time.** A city on a Gold Field owes its owner 2 independent picks (CN3083's "any combination" — they don't have to match). Removing a resolved pick must use "delete the first matching entry" (e.g. `indexOf` + slice), never `Array.prototype.filter`, which would incorrectly clear every pending pick for that player at once.
- Every task's diff must pass `npm run build` (not just `tsc`/`eslint`/`vitest`) before being reported done — this project's own history has one real case (Board Foundation) of a broken Vite asset import that only `npm run build` caught.
- Grep for other hand-maintained exhaustive tables (`Record<Biome, X>`-shaped or similar) before finishing any task that touches `Biome`; this plan does not expect to find any left (Board Foundation and Ships & Longest Route already swept the ones that existed), but confirm rather than assume.
- **No live playtest is required or expected for this plan.** `seafarersBasic` (the only board shape with sea/gold tiles) is still not selectable through `RegionSelectMenu` — confirmed via grep, nothing outside `RobberLayer.tsx` references it — so gold production is unreachable through the normal game UI regardless of what this plan builds (same "reducer-correct, UI-deferred" state ships have been in since sub-plan 2). Combine that with this environment's confirmed ~176s-per-roll dice-physics cost under software rendering (documented twice in the Robber & Pirate sub-plan), and a live dice-roll-triggered playtest isn't a productive use of either an implementer's or a reviewer's time here. The verification bar is: full test suite green, `npm run build` clean, and — for the final whole-branch review — the same elevated code-level hand-tracing scrutiny sub-plan 3's Task 6 used for its own unreachable, roll-triggered path (`chooseRobberOrPirate`), not a browser session.
- This is the 4th and final sub-plan of the Seafarers phase. `RegionSelectMenu` wiring (which would make gold/ships/pirate all reachable at once) was explicitly scoped OUT of this plan after a check-in with the project owner — it's a distinctly-shaped UI task (menu art/positioning) that belongs in its own follow-up, not folded in here.
- The spec's "Dev card changes" section (Road Building building ships, Knight choosing robber-or-pirate) reads as this phase's scope but is **already fully shipped** — confirmed by reading the actual code, not assumed: `playRoadBuilding`'s `freeRoadsRemaining` counter already covers a free ship (`isFreeShip = freeRoadsRemaining > 0` in `buildShipRaw`, sub-plan 2), and Knight/rolled-7 already route through the `chooseRobberOrPirate` phase (sub-plan 3). No task in this plan touches either. Likewise the spec's Longest Route, Robber & pirate, and New board shape sections are entirely delivered by sub-plans 1-3 — nothing further needed from this plan.

---

### Task 1: Gold Field pick-collection helper (pure, testable)

**Files:**
- Create: `catan-3d/src/game/goldFieldProduction.ts`
- Test: `catan-3d/src/game/goldFieldProduction.test.ts`

**Interfaces:**
- Produces: `GoldFieldPick { playerId: number; vertexId: string }` and `collectGoldFieldPicks(tiles: HexTileData[], total: number, robberTileId: string, settlements: Record<string, Building>, tileVertexIds: Map<string, string[]>): GoldFieldPick[]` — Task 4 calls this directly from App.tsx's dice-roll production handler.

- [ ] **Step 1: Write the failing tests**

```ts
// catan-3d/src/game/goldFieldProduction.test.ts
import { describe, expect, it } from 'vitest'
import { collectGoldFieldPicks } from './goldFieldProduction'
import type { HexTileData } from '../data/hexBoard'
import type { Building } from './types'

function tile(id: string, biome: HexTileData['biome'], number: number | null): HexTileData {
  return { id, col: 0, row: 0, x: 0, z: 0, biome, number }
}

describe('collectGoldFieldPicks', () => {
  it('owes 1 pick for a settlement on a matching gold tile', () => {
    const tiles = [tile('G1', 'gold', 8)]
    const settlements: Record<string, Building> = { V1: { ownerId: 1, type: 'settlement' } }
    const tileVertexIds = new Map([['G1', ['V1']]])
    expect(collectGoldFieldPicks(tiles, 8, '', settlements, tileVertexIds)).toEqual([{ playerId: 1, vertexId: 'V1' }])
  })

  it('owes 2 picks for a city on a matching gold tile', () => {
    const tiles = [tile('G1', 'gold', 8)]
    const settlements: Record<string, Building> = { V1: { ownerId: 1, type: 'city' } }
    const tileVertexIds = new Map([['G1', ['V1']]])
    expect(collectGoldFieldPicks(tiles, 8, '', settlements, tileVertexIds)).toEqual([
      { playerId: 1, vertexId: 'V1' },
      { playerId: 1, vertexId: 'V1' },
    ])
  })

  it('ignores a gold tile blocked by the Robber', () => {
    const tiles = [tile('G1', 'gold', 8)]
    const settlements: Record<string, Building> = { V1: { ownerId: 1, type: 'settlement' } }
    const tileVertexIds = new Map([['G1', ['V1']]])
    expect(collectGoldFieldPicks(tiles, 8, 'G1', settlements, tileVertexIds)).toEqual([])
  })

  it('ignores a gold tile that did not match the roll', () => {
    const tiles = [tile('G1', 'gold', 8)]
    const settlements: Record<string, Building> = { V1: { ownerId: 1, type: 'settlement' } }
    const tileVertexIds = new Map([['G1', ['V1']]])
    expect(collectGoldFieldPicks(tiles, 6, '', settlements, tileVertexIds)).toEqual([])
  })

  it('ignores a non-gold tile even when it matches the roll', () => {
    const tiles = [tile('F1', 'forest', 8)]
    const settlements: Record<string, Building> = { V1: { ownerId: 1, type: 'settlement' } }
    const tileVertexIds = new Map([['F1', ['V1']]])
    expect(collectGoldFieldPicks(tiles, 8, '', settlements, tileVertexIds)).toEqual([])
  })

  it('skips a vertex with no building', () => {
    const tiles = [tile('G1', 'gold', 8)]
    const tileVertexIds = new Map([['G1', ['V1', 'V2']]])
    expect(collectGoldFieldPicks(tiles, 8, '', {}, tileVertexIds)).toEqual([])
  })

  it('aggregates across multiple gold tiles and multiple owners', () => {
    const tiles = [tile('G1', 'gold', 8), tile('G2', 'gold', 8)]
    const settlements: Record<string, Building> = {
      V1: { ownerId: 1, type: 'settlement' },
      V2: { ownerId: 2, type: 'city' },
    }
    const tileVertexIds = new Map([
      ['G1', ['V1']],
      ['G2', ['V2']],
    ])
    expect(collectGoldFieldPicks(tiles, 8, '', settlements, tileVertexIds)).toEqual([
      { playerId: 1, vertexId: 'V1' },
      { playerId: 2, vertexId: 'V2' },
      { playerId: 2, vertexId: 'V2' },
    ])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/goldFieldProduction.test.ts`
Expected: FAIL — `Cannot find module './goldFieldProduction'`

- [ ] **Step 3: Implement**

```ts
// catan-3d/src/game/goldFieldProduction.ts
import type { HexTileData } from '../data/hexBoard'
import type { Building } from './types'

// One entry per resource pick a Gold Field roll owes a player — a
// settlement produces 1 entry, a city produces 2 (CN3083's "any
// combination": a city's 2 picks don't have to match each other, unlike
// every other hex's single fixed resource). Returned flat rather than
// grouped by player, since the caller queues one pending pick at a time
// (see App.tsx's goldFieldResourcePlayerIds).
export interface GoldFieldPick {
  playerId: number
  vertexId: string
}

// Pure extraction of the same tile/vertex walk App.tsx's dice-roll
// production handler already does for every other biome (BIOME_TO_RESOURCE)
// — App.tsx's own closures aren't unit-testable, this is. Matches this
// project's established precedent for extracting untested App.tsx logic
// (shipEligibility.ts, pirateEligibility.ts).
export function collectGoldFieldPicks(
  tiles: HexTileData[],
  total: number,
  robberTileId: string,
  settlements: Record<string, Building>,
  tileVertexIds: Map<string, string[]>,
): GoldFieldPick[] {
  const picks: GoldFieldPick[] = []
  for (const tile of tiles) {
    if (tile.biome !== 'gold') continue
    if (tile.number !== total) continue
    if (tile.id === robberTileId) continue // blocked by the Robber, same as every other hex

    const vertexIds = tileVertexIds.get(tile.id) ?? []
    for (const vertexId of vertexIds) {
      const building = settlements[vertexId]
      if (!building) continue
      const pickCount = building.type === 'city' ? 2 : 1
      for (let i = 0; i < pickCount; i++) {
        picks.push({ playerId: building.ownerId, vertexId })
      }
    }
  }
  return picks
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/goldFieldProduction.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/game/goldFieldProduction.ts catan-3d/src/game/goldFieldProduction.test.ts
git commit -m "feat: add pure Gold Field pick-collection helper"
```

---

### Task 2: `GOLD_FIELD_RESOURCE_PICKED` reducer action

**Files:**
- Modify: `catan-3d/src/game/reducers/players.ts` (add to the `PlayersAction` union, add a case)
- Modify: `catan-3d/src/game/types.ts:324-330` (update the `BIOME_TO_RESOURCE` comment — it currently says gold's `null` is "a placeholder until the Gold Fields sub-plan adds the player-choice production path"; this task IS that sub-plan)
- Test: `catan-3d/src/game/reducers/players.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: the `GOLD_FIELD_RESOURCE_PICKED` action (`{ type: 'GOLD_FIELD_RESOURCE_PICKED'; playerId: number; resource: ResourceType }`), consumed by Task 4's `applyGoldFieldResourcePick`.

- [ ] **Step 1: Write the failing tests**

Find the existing `SCIENCE_FREE_RESOURCE_PICKED` describe block in `catan-3d/src/game/reducers/players.test.ts` (currently around line 1051) and add a new block directly after it:

```ts
describe('reducePlayers — GOLD_FIELD_RESOURCE_PICKED', () => {
  it('adds 1 of the picked resource', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(players, { type: 'GOLD_FIELD_RESOURCE_PICKED', playerId: players[0].id, resource: 'ore' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.resources.ore).toBe(1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'GOLD_FIELD_RESOURCE_PICKED', playerId: players[0].id, resource: 'ore' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })

  it('applying it twice in a row adds 2 (models a city\'s 2 independent picks)', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const afterFirst = reducePlayers(players, { type: 'GOLD_FIELD_RESOURCE_PICKED', playerId: players[0].id, resource: 'ore' }, initialGameState)
    const afterSecond = reducePlayers(
      afterFirst,
      { type: 'GOLD_FIELD_RESOURCE_PICKED', playerId: players[0].id, resource: 'wool' },
      initialGameState,
    )
    const player = afterSecond.find((p) => p.id === players[0].id)!
    expect(player.resources.ore).toBe(1)
    expect(player.resources.wool).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts -t "GOLD_FIELD_RESOURCE_PICKED"`
Expected: FAIL — TypeScript error, `'GOLD_FIELD_RESOURCE_PICKED'` is not assignable to the action union.

- [ ] **Step 3: Add the action and reducer case**

In `catan-3d/src/game/reducers/players.ts`, find the `SCIENCE_FREE_RESOURCE_PICKED` line in the `PlayersAction` union (`| { type: 'SCIENCE_FREE_RESOURCE_PICKED'; playerId: number; resource: ResourceType }`) and add directly after it:

```ts
  | { type: 'GOLD_FIELD_RESOURCE_PICKED'; playerId: number; resource: ResourceType }
```

Find the `case 'SCIENCE_FREE_RESOURCE_PICKED':` case in `reducePlayers` and add directly after its `return` line:

```ts
    case 'GOLD_FIELD_RESOURCE_PICKED':
      return players.map((p) => (p.id === action.playerId ? { ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] + 1 } } : p))
```

(This is byte-for-byte the same body as `SCIENCE_FREE_RESOURCE_PICKED` — the spec calls for mirroring its shape exactly, since both are "add 1 of a player-chosen resource" with no other side effects.)

- [ ] **Step 4: Update the `BIOME_TO_RESOURCE` comment**

In `catan-3d/src/game/types.ts:324-330`, replace:

```ts
// What each hex biome produces when its number is rolled. Desert and sea
// never produce anything — that's permanent. Gold is different: it DOES
// produce, but the resource is player-chosen at production time rather
// than fixed, so it can't be represented as a single ResourceType here.
// `null` is a placeholder until the Gold Fields sub-plan adds the
// player-choice production path; until then gold fields carry a real
// number disc (see hexBoard.ts) but resolve to nothing when rolled.
```

with:

```ts
// What each hex biome produces when its number is rolled. Desert and sea
// never produce anything — that's permanent. Gold is different: it DOES
// produce, but the resource is player-chosen at production time rather
// than fixed, so it can't be represented as a single ResourceType here —
// see game/goldFieldProduction.ts's collectGoldFieldPicks (called from
// App.tsx's dice-roll production handler, alongside — not through — the
// RESOURCES_PRODUCED loop this table drives) and the GOLD_FIELD_RESOURCE_PICKED
// action (game/reducers/players.ts) that resolves each pick.
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: PASS (full file, no regressions)

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts catan-3d/src/game/types.ts
git commit -m "feat: add GOLD_FIELD_RESOURCE_PICKED reducer action"
```

---

### Task 3: Multiplayer broadcast plumbing

**Files:**
- Modify: `catan-3d/src/multiplayer/useRoomChannel.ts` (5 touch points, mirroring `ScienceFreeResourcePickedPayload`'s exact shape)

**Interfaces:**
- Consumes: nothing new.
- Produces: `GoldFieldResourcePickedPayload`, `broadcastGoldFieldResourcePicked`, the `onGoldFieldResourcePicked` handler field and its `channel.on` subscription — all consumed by Task 4's App.tsx wiring.

- [ ] **Step 1: Add the payload interface**

Find `ScienceFreeResourcePickedPayload` (currently `catan-3d/src/multiplayer/useRoomChannel.ts:662-665`) and add directly after its closing `}`:

```ts
// Gold Fields' per-roll resource pick(s) — same shape as
// ScienceFreeResourcePickedPayload above, and same reasoning: this can fire
// for ANY player regardless of whose turn it is, and (unlike Science) can
// fire MORE THAN ONCE for the same player on the same roll (a city's 2
// independent picks) — see the goldFieldResourcePlayerIds queue in App.tsx.
export interface GoldFieldResourcePickedPayload {
  playerId: number
  resource: ResourceType
}
```

- [ ] **Step 2: Add the handler field**

Find `onScienceFreeResourcePicked?: (payload: ScienceFreeResourcePickedPayload) => void` (currently line 778) and add directly after it:

```ts
  onGoldFieldResourcePicked?: (payload: GoldFieldResourcePickedPayload) => void
```

- [ ] **Step 3: Add the channel subscription**

Find the `channel.on<ScienceFreeResourcePickedPayload>('broadcast', { event: 'SCIENCE_FREE_RESOURCE_PICKED' }, ...)` block (currently lines 1069-1071) and add directly after its closing `})`:

```ts
    channel.on<GoldFieldResourcePickedPayload>('broadcast', { event: 'GOLD_FIELD_RESOURCE_PICKED' }, ({ payload }) => {
      handlersRef.current.onGoldFieldResourcePicked?.(payload)
    })
```

- [ ] **Step 4: Add the broadcast function**

Find `const broadcastScienceFreeResourcePicked = (payload: ScienceFreeResourcePickedPayload) => { ... }` (currently lines 1355-1357) and add directly after its closing `}`:

```ts
  const broadcastGoldFieldResourcePicked = (payload: GoldFieldResourcePickedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'GOLD_FIELD_RESOURCE_PICKED', payload })
  }
```

- [ ] **Step 5: Export it from the hook**

Find `broadcastScienceFreeResourcePicked,` in the hook's returned object (currently line 1480) and add directly after it:

```ts
    broadcastGoldFieldResourcePicked,
```

- [ ] **Step 6: Verify the file still type-checks**

Run: `cd catan-3d && npx tsc --noEmit`
Expected: no new errors. (App.tsx won't yet destructure `broadcastGoldFieldResourcePicked` or implement `onGoldFieldResourcePicked` — that's fine, both are optional/unused-until-Task-4.)

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/multiplayer/useRoomChannel.ts
git commit -m "feat: add GOLD_FIELD_RESOURCE_PICKED broadcast plumbing"
```

---

### Task 4: App.tsx gold-field integration

**Files:**
- Modify: `catan-3d/src/App.tsx` (multiple spots, listed below)

**Interfaces:**
- Consumes: `collectGoldFieldPicks` (Task 1), the `GOLD_FIELD_RESOURCE_PICKED` action (Task 2), `GoldFieldResourcePickedPayload`/`broadcastGoldFieldResourcePicked`/`onGoldFieldResourcePicked` (Task 3).
- Produces: `goldFieldResourcePlayerIds` state, `applyGoldFieldResourcePick`, `activeGoldFieldResourcePlayerId`, `resolveGoldFieldResourcePick` — all consumed by Task 5's GameHud wiring.

Line numbers below are current as of this plan's writing — if a prior task in this file has shifted them slightly, use the surrounding code shown (which is unique in the file) to relocate the insertion point.

- [ ] **Step 1: Import the new helper**

Find App.tsx's block of `./game/...` imports near the top of the file and add:

```ts
import { collectGoldFieldPicks } from './game/goldFieldProduction'
```

- [ ] **Step 2: Add the pending-pick queue state**

Find `const [scienceFreeResourcePlayerIds, setScienceFreeResourcePlayerIds] = useState<number[]>([])` (currently line 548) and add directly after it:

```ts
  // Player IDs owed a Gold Field resource pick after the most recent roll —
  // unlike scienceFreeResourcePlayerIds (at most one entry per player per
  // roll), the same player id can appear more than once here: a city on a
  // Gold Field owes 2 independent picks (CN3083's "any combination," they
  // don't have to match), and a player can have multiple producing Gold
  // Field buildings in the same roll. Resolved one entry at a time (see
  // applyGoldFieldResourcePick below), never deduped via Set the way
  // scienceFreeResourcePlayerIds is.
  const [goldFieldResourcePlayerIds, setGoldFieldResourcePlayerIds] = useState<number[]>([])
```

- [ ] **Step 3: Add the trusted-apply function**

Find `const applyScienceFreeResourcePick = (playerId: number, resource: ResourceType) => { ... }` (currently lines 1349-1352) and add directly after its closing `}`:

```ts
  // Trusted state mutation for one player's Gold Field resource pick —
  // shared by the local actor (resolveGoldFieldResourcePick, below, which
  // also broadcasts) and receiving clients (onGoldFieldResourcePicked), same
  // trusted-apply split as applyScienceFreeResourcePick above. Removes only
  // ONE matching queue entry, not every occurrence (Array.prototype.filter
  // would incorrectly clear a city's second pending pick along with its
  // first) — a player with 2 pending picks must still owe 1 after resolving
  // the first.
  const applyGoldFieldResourcePick = (playerId: number, resource: ResourceType) => {
    dispatch({ type: 'GOLD_FIELD_RESOURCE_PICKED', playerId, resource })
    setGoldFieldResourcePlayerIds((prev) => {
      const index = prev.indexOf(playerId)
      if (index === -1) return prev
      return [...prev.slice(0, index), ...prev.slice(index + 1)]
    })
  }
```

- [ ] **Step 4: Wire the production loop**

Find `dispatch({ type: 'RESOURCES_PRODUCED', productions })` (currently line 3565, right after the main per-tile production loop, right before the Science level 3 comment block) and add directly after it:

```ts
    // Gold Fields: player-chosen resource, can't go through the synchronous
    // RESOURCES_PRODUCED loop above the way every other hex's fixed
    // resource does (BIOME_TO_RESOURCE['gold'] is null — see that table's
    // own comment). collectGoldFieldPicks is a pure extraction of this exact
    // same tile/vertex walk, kept in its own testable module rather than
    // inline here (see game/goldFieldProduction.ts).
    const goldFieldPicks = collectGoldFieldPicks(
      tiles,
      total,
      gameState.board.robberTileId,
      gameState.board.settlements,
      graph.tileVertexIds,
    )
    if (goldFieldPicks.length > 0) {
      setGoldFieldResourcePlayerIds((prev) => [...prev, ...goldFieldPicks.map((pick) => pick.playerId)])
      const pickCountByPlayer = new Map<number, number>()
      for (const pick of goldFieldPicks) {
        pickCountByPlayer.set(pick.playerId, (pickCountByPlayer.get(pick.playerId) ?? 0) + 1)
      }
      for (const [playerId, count] of pickCountByPlayer) {
        const owner = playerById.get(playerId)
        if (owner) messages.push(`${owner.name} may pick ${count} resource${count > 1 ? 's' : ''} from the Gold Field!`)
      }
    }
```

This block has no functional ordering dependency with the existing Science level 3 block that follows it (which reads `tiles.filter((t) => t.number === total && t.id !== gameState.board.robberTileId)` to compute who produced) — placing it directly after `RESOURCES_PRODUCED`'s dispatch just keeps both production-adjacent blocks together. Do not modify the Science level 3 block itself: it already treats any vertex on a matching, unblocked tile as "produced," which already correctly includes gold-producing vertices with zero changes needed (confirmed: its `producedTileIds` computation doesn't check `BIOME_TO_RESOURCE`, only `tile.number`/`robberTileId`).

- [ ] **Step 5: Reset the queue on a fresh game**

Find `setScienceFreeResourcePlayerIds([])` inside `resetGame` (currently line 6316) and add directly after it:

```ts
    setGoldFieldResourcePlayerIds([])
```

- [ ] **Step 6: Reset the queue on snapshot restore**

Find the `setScienceFreeResourcePlayerIds([])` inside `restoreFromSnapshot`, alongside its comment about the queue not being persisted (currently around line 6621) and add directly after it:

```ts
    // Same treatment as scienceFreeResourcePlayerIds above — not persisted,
    // not derivable from restored state, simply dropped on reconnect.
    setGoldFieldResourcePlayerIds([])
```

- [ ] **Step 7: Derive the active local picker**

Find `const activeScienceFreeResourcePlayerId = onlineInfo ? ... : (scienceFreeResourcePlayerIds[0] ?? null)` (currently lines 2273-2277) and add directly after it:

```ts
  // Who's actively resolving a Gold Field resource pick on THIS screen right
  // now — same "sequential locally, parallel online" split as
  // activeScienceFreeResourcePlayerId above. Position in the queue doesn't
  // matter for this check (only how many entries remain does, handled by
  // applyGoldFieldResourcePick's single-entry removal), so this reads
  // exactly the same way scienceFreeResourcePlayerIds does despite allowing
  // duplicate entries.
  const activeGoldFieldResourcePlayerId = onlineInfo
    ? goldFieldResourcePlayerIds.includes(onlineInfo.localPlayerId)
      ? onlineInfo.localPlayerId
      : null
    : (goldFieldResourcePlayerIds[0] ?? null)
```

- [ ] **Step 8: Add the local-actor resolve function**

Find `const resolveScienceFreeResource = (resource: ResourceType) => { ... }` (currently lines 6162-6169) and add directly after its closing `}`:

```ts
  // Resolves the active Gold Field pick with the resource the player chose
  // in the modal. Only ever reachable by the local actor whose id matches
  // activeGoldFieldResourcePlayerId — see that derivation above for why this
  // can be a different player than currentPlayerIndex.
  const resolveGoldFieldResourcePick = (resource: ResourceType) => {
    const playerId = activeGoldFieldResourcePlayerId
    if (playerId == null) return
    const player = playerById.get(playerId)
    applyGoldFieldResourcePick(playerId, resource)
    if (player) inform(`${player.name} took 1 ${RESOURCE_LABELS[resource]} from the Gold Field.`)
    if (onlineInfo) broadcastGoldFieldResourcePicked({ playerId, resource })
  }
  // Neither activeGoldFieldResourcePlayerId nor resolveGoldFieldResourcePick
  // has a caller yet within this task — Task 5 wires both into <GameHud .../>.
  // Same `void` idiom this codebase already uses for a function implemented
  // ahead of its UI wiring (e.g. buildShipRaw in sub-plan 2), applied here to
  // satisfy noUnusedLocals in the meantime. Task 5 removes both of these
  // lines as part of adding the real usage.
  void activeGoldFieldResourcePlayerId
  void resolveGoldFieldResourcePick
```

- [ ] **Step 9: Wire the broadcast receiver**

Find the `onScienceFreeResourcePicked: (payload) => { ... }` handler in the object passed to `useRoomChannel` (currently lines 1735-1747) and add directly after its closing `},`:

```ts
    onGoldFieldResourcePicked: (payload) => {
      // Broadcast-sourced — same validation shape as onScienceFreeResourcePicked
      // above: payload.resource goes straight into resources[resource]
      // arithmetic, so a bogus key would write NaN into a real player's state
      // permanently. Also requiring playerId to still be in the pending queue
      // — a duplicated message must not grant a second free pick or apply one
      // to a player who was never actually eligible on this client.
      if (!RESOURCE_ORDER.includes(payload.resource) || !goldFieldResourcePlayerIds.includes(payload.playerId)) {
        console.error('[Catan] Ignoring malformed gold field resource payload:', payload)
        return
      }
      applyGoldFieldResourcePick(payload.playerId, payload.resource)
    },
```

- [ ] **Step 10: Destructure the new broadcast function**

Find `broadcastScienceFreeResourcePicked,` in the destructuring of the `useRoomChannel(...)` return value (currently line 1544) and add directly after it:

```ts
    broadcastGoldFieldResourcePicked,
```

- [ ] **Step 11: Verify**

Run: `cd catan-3d && npx tsc --noEmit && npx eslint src/App.tsx && npx vitest run`
Expected: no errors, full suite green. `GameHud` doesn't accept the two new props yet — this task doesn't touch the `<GameHud .../>` call site at all (Step 8's `void` statements are what keep this task self-contained and buildable on its own); Task 5 both wires the props in and removes those two `void` lines.

- [ ] **Step 12: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: wire Gold Field production into App.tsx's roll/broadcast flow"
```

---

### Task 5: Gold Field resource-picker UI

**Files:**
- Modify: `catan-3d/src/components/hud/GameHud.tsx`
- Modify: `catan-3d/src/App.tsx` (pass the two new props to `<GameHud .../>`)

**Interfaces:**
- Consumes: `activeGoldFieldResourcePlayerId`/`resolveGoldFieldResourcePick` (Task 4).

- [ ] **Step 1: Remove Task 4's placeholder `void` statements**

Task 4 left two `void activeGoldFieldResourcePlayerId` / `void resolveGoldFieldResourcePick` lines at the end of `resolveGoldFieldResourcePick`'s declaration in `catan-3d/src/App.tsx` (satisfying `noUnusedLocals` until this task gives both a real caller). Delete both lines now — Step 7 below gives them real callers.

- [ ] **Step 2: Extend the picker-mode union**

Find `type PickerMode = DevCardPickerMode | 'scienceFreeResource'` (currently `catan-3d/src/components/hud/GameHud.tsx:51`) and change it to:

```ts
type PickerMode = DevCardPickerMode | 'scienceFreeResource' | 'goldFieldResource'
```

- [ ] **Step 3: Add its copy entry**

Find the `DEV_CARD_PICKER_COPY` object (starts at line 53) and add a new entry anywhere inside it:

```ts
  goldFieldResource: { title: 'Gold Field', subtitle: 'Choose 1 resource to take from the bank.', pickCount: 1 },
```

(TypeScript will refuse to compile if this entry is missing, since `DEV_CARD_PICKER_COPY` is typed `Record<PickerMode, ...>` — this is deliberate, the same exhaustiveness check this table already relies on for every other mode.)

- [ ] **Step 4: Add the two new props**

Find `scienceFreeResourceActive: boolean` / `onResolveScienceFreeResource: (resource: ResourceType) => void` in `GameHudProps` (currently lines 142-143) and add directly after them:

```ts
  // Gold Fields' per-roll resource pick — same "own flag/handler pair, can
  // be a different player than currentPlayerIndex" shape as
  // scienceFreeResourceActive above. Mutually exclusive with it in practice:
  // a player only ever owes ONE of the two per roll (Science level 3 only
  // fires when a player got zero production that roll; a Gold Field pick IS
  // production, so the two conditions can't both be true for the same
  // player on the same roll).
  goldFieldResourceActive: boolean
  onResolveGoldFieldResource: (resource: ResourceType) => void
```

- [ ] **Step 5: Destructure the new props**

Find `scienceFreeResourceActive,` / `onResolveScienceFreeResource,` in the component's destructured parameters (currently around lines 439-440) and add directly after them:

```ts
  goldFieldResourceActive,
  onResolveGoldFieldResource,
```

- [ ] **Step 6: Extend `activePickerMode`'s derivation**

Find `const activePickerMode: PickerMode | null = devCardPicker ?? (scienceFreeResourceActive ? 'scienceFreeResource' : null)` (currently line 533) and change it to:

```ts
  const activePickerMode: PickerMode | null =
    devCardPicker ?? (scienceFreeResourceActive ? 'scienceFreeResource' : goldFieldResourceActive ? 'goldFieldResource' : null)
```

- [ ] **Step 7: Extend the resolve branch**

Find the `DevCardResourcePicker`'s `onComplete` handler (currently lines 1156-1165):

```tsx
      {activePickerMode && activePickerMode !== 'tradeMonopolyProgress' && (
        <DevCardResourcePicker
          title={DEV_CARD_PICKER_COPY[activePickerMode].title}
          subtitle={DEV_CARD_PICKER_COPY[activePickerMode].subtitle}
          pickCount={DEV_CARD_PICKER_COPY[activePickerMode].pickCount}
          onComplete={(picks) =>
            activePickerMode === 'scienceFreeResource' ? onResolveScienceFreeResource(picks[0]) : onResolveDevCardPicker(picks)
          }
        />
      )}
```

Replace the `onComplete` line with:

```tsx
          onComplete={(picks) =>
            activePickerMode === 'scienceFreeResource'
              ? onResolveScienceFreeResource(picks[0])
              : activePickerMode === 'goldFieldResource'
                ? onResolveGoldFieldResource(picks[0])
                : onResolveDevCardPicker(picks)
          }
```

- [ ] **Step 8: Pass the new props from App.tsx**

Find `scienceFreeResourceActive={activeScienceFreeResourcePlayerId != null}` / `onResolveScienceFreeResource={resolveScienceFreeResource}` in the `<GameHud .../>` call (currently `catan-3d/src/App.tsx:7175-7176`) and add directly after them:

```tsx
        goldFieldResourceActive={activeGoldFieldResourcePlayerId != null}
        onResolveGoldFieldResource={resolveGoldFieldResourcePick}
```

- [ ] **Step 9: Verify**

Run: `cd catan-3d && npx tsc --noEmit && npx eslint src && npx vitest run && npm run build`
Expected: no errors, full suite green, build succeeds.

- [ ] **Step 10: Commit**

```bash
git add catan-3d/src/components/hud/GameHud.tsx catan-3d/src/App.tsx
git commit -m "feat: add Gold Field resource-picker UI"
```

---

### Task 6: Setup-phase ship substitution

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts` (one line — exclude setup ships from `shipsBuiltThisTurn`)
- Modify: `catan-3d/src/App.tsx` (`buildShipRaw`, `applyShipPlacement`)
- Test: `catan-3d/src/game/reducers/board.test.ts`

**Interfaces:**
- Consumes: nothing new from this plan's earlier tasks — independent of Gold Fields, bundled into this sub-plan because it's the last spec'd Seafarers piece with no home elsewhere (per the project's check-in: everything reachability-related, like `RegionSelectMenu`, is explicitly deferred to a future follow-up — this task only fixes the reducer-adjacent logic, same "correct but not board-reachable yet" state ship-building has been in since sub-plan 2).

CN3083: "During setup, players may place a ship instead of a road for their second piece, if their second settlement is on the coast." Both `BUILD_ROAD` and `BUILD_SHIP` already carry `isSetup: boolean`, and `players.ts`'s `BUILD_SHIP` case already correctly skips cost deduction when `isSetup` is true (confirmed: `resources: action.isSetup || action.isFreeShip ? p.resources : deductCost(...)`). The only gap is in App.tsx: `buildShipRaw` never allows `isSetup` at all today (no setup branch, no roll-check bypass), and `applyShipPlacement` never advances the setup turn order the way `applyRoadPlacement` already does.

- [ ] **Step 1: Write the failing test for `shipsBuiltThisTurn`**

Find the existing `describe('reduceBoard — BUILD_SHIP'` block in `catan-3d/src/game/reducers/board.test.ts` (it contains the `it('records the edge in shipsBuiltThisTurn', ...)` test at line 88) and add a new test directly after it:

```ts
  it('does not record the edge in shipsBuiltThisTurn when placed during setup', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_SHIP', edgeId: 'E1', playerId: 1, isSetup: true, isFreeShip: false })
    expect(result.shipsBuiltThisTurn).toEqual([])
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts -t "does not record"`
Expected: FAIL — `shipsBuiltThisTurn` currently contains `['E1']` regardless of `isSetup`.

- [ ] **Step 3: Fix the reducer**

In `catan-3d/src/game/reducers/board.ts`, find the `case 'BUILD_SHIP':` case:

```ts
    case 'BUILD_SHIP':
      return {
        ...state,
        ships: { ...state.ships, [action.edgeId]: action.playerId },
        shipsBuiltThisTurn: [...state.shipsBuiltThisTurn, action.edgeId],
      }
```

Replace it with:

```ts
    case 'BUILD_SHIP':
      return {
        ...state,
        ships: { ...state.ships, [action.edgeId]: action.playerId },
        // A setup-placed ship isn't "built this turn" in the gameplay sense —
        // there is no turn yet during setup, and applyShipPlacement's setup
        // branch never dispatches TURN_ADVANCED on its way into real play, so
        // an entry added here would otherwise survive into the player's
        // actual first turn and wrongly block that same ship from being
        // moved on it.
        shipsBuiltThisTurn: action.isSetup ? state.shipsBuiltThisTurn : [...state.shipsBuiltThisTurn, action.edgeId],
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`
Expected: PASS (full file, no regressions)

- [ ] **Step 5: Wire `buildShipRaw`'s setup path**

In `catan-3d/src/App.tsx`, find `buildShipRaw`:

```ts
  const buildShipRaw = (edgeId: string) => {
    if (!canInteract()) return

    const player = players[currentPlayerIndex]
    const isFreeShip = freeRoadsRemaining > 0

    if (!isFreeShip && !hasRolledThisTurn) {
      warn('Roll the dice before building.')
      return
    }
    if (gameState.board.roads[edgeId] != null || gameState.board.ships[edgeId] != null) {
      warn('That edge is already occupied.')
      return
    }
    if (!edgeTouchesSea(edgeId)) {
      warn('Ships can only be placed on edges bordering the sea.')
      return
    }
    if (
      !isShipPlacementConnected(
        graph,
        edgeById,
        gameState.board.settlements,
        gameState.board.ships,
        edgeId,
        player.id,
        undefined,
        gameState.board.pirateTileId,
      )
    ) {
      warn('Ship must connect to one of your ships or buildings.')
      return
    }
    if (player.shipsRemaining <= 0) {
      warn('You have no ships left to place.')
      return
    }
    if (!isFreeShip && !canAfford(player.resources, SHIP_COST)) {
      warn('Not enough resources for a ship.')
      return
    }

    applyShipPlacement(edgeId, player.id, false, isFreeShip, true)
  }
```

Replace it with:

```ts
  const buildShipRaw = (edgeId: string) => {
    if (!canInteract()) return

    const player = players[currentPlayerIndex]
    const isSetup = gamePhase === 'setup'
    const isFreeShip = !isSetup && freeRoadsRemaining > 0

    // Same reasoning as buildRoadRaw's own guard — a setup piece is legal to
    // place before the game's first roll (there is no roll yet), and a free
    // ship (from a Road Building card) is exempt for the same reason a free
    // road already is.
    if (!isSetup && !isFreeShip && !hasRolledThisTurn) {
      warn('Roll the dice before building.')
      return
    }
    if (isSetup && setupStage !== 'road') {
      warn('Place your settlement first.')
      return
    }
    if (gameState.board.roads[edgeId] != null || gameState.board.ships[edgeId] != null) {
      warn('That edge is already occupied.')
      return
    }
    if (!edgeTouchesSea(edgeId)) {
      warn('Ships can only be placed on edges bordering the sea.')
      return
    }
    if (isSetup) {
      // CN3083's setup substitution — same rule buildRoadRaw's own setup
      // branch already enforces for roads: the free second piece must
      // connect to the settlement just placed, not the player's network at
      // large (which doesn't exist yet this early anyway).
      const edge = edgeById.get(edgeId)
      const touchesNewSettlement =
        edge != null &&
        setupSettlementVertexId != null &&
        (edge.a === setupSettlementVertexId || edge.b === setupSettlementVertexId)
      if (!touchesNewSettlement) {
        warn('Your ship must connect to the settlement you just placed!')
        return
      }
    } else if (
      !isShipPlacementConnected(
        graph,
        edgeById,
        gameState.board.settlements,
        gameState.board.ships,
        edgeId,
        player.id,
        undefined,
        gameState.board.pirateTileId,
      )
    ) {
      warn('Ship must connect to one of your ships or buildings.')
      return
    }
    if (player.shipsRemaining <= 0) {
      warn('You have no ships left to place.')
      return
    }
    if (!isSetup && !isFreeShip && !canAfford(player.resources, SHIP_COST)) {
      warn('Not enough resources for a ship.')
      return
    }

    applyShipPlacement(edgeId, player.id, isSetup, isFreeShip, true)
  }
```

- [ ] **Step 6: Wire `applyShipPlacement`'s setup-completion logic**

Find `applyShipPlacement`:

```ts
  const applyShipPlacement = (edgeId: string, playerId: number, isSetup: boolean, isFreeShip: boolean, isDeciding: boolean) => {
    dispatchGameAction({ type: 'BUILD_SHIP', edgeId, playerId, isSetup, isFreeShip }, isDeciding)
    if (isFreeShip) setFreeRoadsRemaining((prev) => Math.max(0, prev - 1))
  }
```

Replace it with:

```ts
  const applyShipPlacement = (edgeId: string, playerId: number, isSetup: boolean, isFreeShip: boolean, isDeciding: boolean) => {
    dispatchGameAction({ type: 'BUILD_SHIP', edgeId, playerId, isSetup, isFreeShip }, isDeciding)
    if (isFreeShip) setFreeRoadsRemaining((prev) => Math.max(0, prev - 1))

    // Deliberately a verbatim duplicate of applyRoadPlacement's own isSetup
    // block above, not a shared helper — same "near-verbatim copy for a
    // symmetric mechanic" precedent this codebase already uses elsewhere
    // (Chase Away the Pirate vs. Chase Away the Robber), since a road and a
    // ship are the two interchangeable choices for the exact same setup
    // step, not actually the same code path in disguise.
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      setSetupSettlementVertexId(null)
      if (nextStepIndex >= setupOrder.length) {
        setGamePhase('playing')
        setCurrentPlayerIndex(setupOrder[0])
        setSetupStepIndex(0)
        setSetupStage('settlement')
      } else {
        setSetupStepIndex(nextStepIndex)
        setCurrentPlayerIndex(setupOrder[nextStepIndex])
        setSetupStage('settlement')
      }
    }
  }
```

- [ ] **Step 7: Verify**

Run: `cd catan-3d && npx tsc --noEmit && npx eslint src && npx vitest run && npm run build`
Expected: no errors, full suite green, build succeeds. There is no App-level test file to extend (no `App.test.tsx` exists in this codebase — a known, already-tracked gap, not something to fix in this task); verification here is the reducer test from Steps 1-4 plus the standing `npm run build`/lint/typecheck bar.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/reducers/board.test.ts catan-3d/src/App.tsx
git commit -m "feat: allow a ship to substitute for the second setup piece (CN3083)"
```
