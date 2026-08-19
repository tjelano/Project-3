# Game State Reducer — Players Slice, Sub-plan 1 (Building) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `players: Player[]` a home in `GameState` behind a `reducePlayers` reducer, migrate the 4 functions this sub-plan targets (`applySettlementPlacement`, `applyCityPlacement`, `applyRoadPlacement`, `grantResourcesForVertex`) to real, tested, typed actions, and — the part that makes every later sub-plan possible — delete the old `useState<Player[]>` entirely by bridging every other `setPlayers` call site through one temporary `LEGACY_SET_PLAYERS` action.

**Architecture:** `catan-3d/src/game/reducers/players.ts` holds `reducePlayers` and `PlayersAction` (a `Player[] → Player[]` pure reducer, no wrapper state type — `GameState.players` is a bare array). `catan-3d/src/game/gameState.ts`'s `GameAction` becomes `BoardAction | PlayersAction`; `reduceGame` composes `reduceBoard` and `reducePlayers`, both upgraded to the 3-argument `(sliceState, action, fullState)` signature the parent spec always intended. `App.tsx` keeps a read-only `const players = gameState.players` alias (zero changes to ~95 existing read sites) and converts every write site to `dispatch(...)`.

**Tech Stack:** React + TypeScript, Vitest, Supabase Realtime — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-19-game-state-reducer-players-slice-design.md` (this sub-plan's parent design; read its "Why not a smaller plan" section before starting — it explains the `LEGACY_SET_PLAYERS` bridge this plan builds). Parent architecture spec: `docs/superpowers/specs/2026-08-19-game-state-reducer-design.md`.

## Global Constraints

- **Reducers are pure appliers, always.** No `Math.random()`, `inform()`/`warn()`/`playSfx()`, or closure reads inside `reducePlayers`'s cases.
- **`LEGACY_SET_PLAYERS` is never broadcast.** It's `dispatch({ type: 'LEGACY_SET_PLAYERS', updater })` — never `dispatchGameAction(...)` — since it must never reach `broadcastGameAction`'s switch (a function can't be JSON-serialized over the wire). The ~56 functions bridged through it keep their EXISTING multiplayer correctness unchanged: they already run identically on the deciding client and every receiver via the current trusted-apply pattern, so nothing about their broadcast behavior is touched by this plan.
- **`players` is read in ~95 places in `App.tsx` beyond its 87 writes** (JSX props, `.map`/`.find`/`.filter`, derived values). None of those read sites change — `const players = gameState.players` (declared once, read-only) is what keeps them compiling and behaving identically.
- **Migrating a function's write to a real action means deleting its `LEGACY_SET_PLAYERS` call entirely**, not adding a second write. `applySettlementPlacement`/`applyCityPlacement`/`applyRoadPlacement`/`grantResourcesForVertex` each end this plan with exactly one player-side `dispatchGameAction` call (two, for `applySettlementPlacement`, since `grantResourcesForVertex`'s call is nested inside it), no bridge remnant.
- **`reduceBoard` and `reducePlayers` both take `(state, action: GameAction, fullState: GameState)`.** Neither actually reads `fullState` in this plan — parameter named `_fullState` (TypeScript's `noUnusedParameters`, active in this project's `tsconfig.app.json`, exempts underscore-prefixed parameters). `reduceBoard`'s previous `never`-exhaustiveness default is removed: `action` is now the full `GameAction` union (every slice's actions), not just `BoardAction`, so most of that union is legitimately unhandled by `reduceBoard` — same as any `combineReducers`-style slice reducer. `reducePlayers` never had (and will never have) an exhaustiveness check for the same reason: it only ever owns a subset of `GameAction`.
- **`GRANT_SETUP_RESOURCES` needs no new `describeBoardAction`/banner logic.** `dispatchGameAction` still calls `describeBoardAction(action, playerById)` directly (unchanged) — its `default` case already returns `{ message: null, sfx: null }`, which is exactly correct for this action (today's `grantResourcesForVertex` fires no banner or sound). Building a composed `describeAction(action)` that also consults a `describePlayersAction` is deferred to whichever future sub-plan first has a players-only action that needs a banner or sound — YAGNI until then.

---

## File Structure

| File | Responsibility |
|---|---|
| `catan-3d/src/game/reducers/board.ts` | Modify: new action fields, widened `reduceBoard`/`describeBoardAction` signatures (Task 1) |
| `catan-3d/src/game/reducers/board.test.ts` | Modify: updated fixtures for the new required fields (Task 1) |
| `catan-3d/src/game/reducers/players.ts` | Create: `PlayersAction`, `reducePlayers` (Task 2) |
| `catan-3d/src/game/reducers/players.test.ts` | Create: tests for the above (Task 2) |
| `catan-3d/src/game/gameState.ts` | Modify: `players` field, composed `GameAction`, 3-arg `reduceGame` (Task 3) |
| `catan-3d/src/game/gameState.test.ts` | Modify: composition tests (Task 3) |
| `catan-3d/src/App.tsx` | Modify: alias, bridge every remaining call site, delete `useState` (Task 4); migrate the 4 target functions for real (Tasks 5-7) |

---

### Task 1: Extend `BoardAction`'s fields; widen `reduceBoard`/`describeBoardAction` to the composed `GameAction`

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/game/reducers/board.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `BoardAction`'s `BUILD_SETTLEMENT` gains `isSetup: boolean`; `BUILD_CITY` gains `costOverride?: Partial<Resources>`; `BUILD_ROAD` gains `isSetup: boolean` and `isFreeRoad: boolean`. `reduceBoard`/`describeBoardAction` both take `(state, action: GameAction, ...)` instead of `(state, action: BoardAction, ...)` — needed because `reduceGame` (Task 3) will call every sub-reducer with the same `GameAction`-typed value, and a wider union isn't assignable to a narrower one.

This task only changes types and signatures — no case's actual logic changes (none of `reduceBoard`'s cases read the new fields; they exist for `reducePlayers`, added in Task 2).

- [ ] **Step 1: Update the failing tests first**

Replace `catan-3d/src/game/reducers/board.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { reduceBoard, initialBoardState, describeBoardAction } from './board'
import { createInitialPlayers } from '../types'
import { initialGameState } from '../gameState'

describe('reduceBoard — BUILD_SETTLEMENT', () => {
  it('places a settlement at the given vertex, owned by the given player', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false },
      initialGameState,
    )
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('does not mutate the input state', () => {
    const before = initialBoardState
    reduceBoard(before, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false }, initialGameState)
    expect(before.settlements).toEqual({})
  })

  it('leaves roads untouched', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: true },
      initialGameState,
    )
    expect(result.roads).toEqual({})
  })
})

describe('reduceBoard — BUILD_CITY', () => {
  it('upgrades the vertex to a city, owned by the given player', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'city' })
  })

  it('overwrites an existing settlement at that vertex', () => {
    const withSettlement = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false },
      initialGameState,
    )
    const result = reduceBoard(withSettlement, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'city' })
  })

  it('ignores costOverride — that field is only meaningful to reducePlayers', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1, costOverride: { ore: 1 } },
      initialGameState,
    )
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'city' })
  })
})

describe('reduceBoard — BUILD_ROAD', () => {
  it('places a road at the given edge, owned by the given player', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1, isSetup: false, isFreeRoad: false },
      initialGameState,
    )
    expect(result.roads['E1']).toBe(1)
  })

  it('leaves settlements untouched', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1, isSetup: true, isFreeRoad: true },
      initialGameState,
    )
    expect(result.settlements).toEqual({})
  })
})

describe('reduceBoard — PILLAGE_CITY', () => {
  it('downgrades a city owned by the given player to a settlement', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    const result = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('is a no-op if the vertex is not currently a city', () => {
    const withSettlement = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false },
      initialGameState,
    )
    const result = reduceBoard(withSettlement, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(result).toBe(withSettlement)
  })

  it('is a no-op if the vertex has no building at all', () => {
    const result = reduceBoard(initialBoardState, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(result).toBe(initialBoardState)
  })

  it('is a no-op if the city is owned by a different player', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    const result = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 2 }, initialGameState)
    expect(result).toBe(withCity)
  })

  it('is idempotent — dispatching the same pillage twice only changes the vertex once', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    const first = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    const second = reduceBoard(first, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(second).toBe(first)
  })
})

describe('reduceBoard — REMOVE_ROAD', () => {
  it('removes the road at the given edge entirely', () => {
    const withRoad = reduceBoard(
      initialBoardState,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1, isSetup: false, isFreeRoad: false },
      initialGameState,
    )
    const result = reduceBoard(withRoad, { type: 'REMOVE_ROAD', edgeId: 'E1' }, initialGameState)
    expect(result.roads).not.toHaveProperty('E1')
  })

  it('is a no-op if the edge has no road', () => {
    const result = reduceBoard(initialBoardState, { type: 'REMOVE_ROAD', edgeId: 'E1' }, initialGameState)
    expect(result).toBe(initialBoardState)
  })

  it('leaves other roads untouched', () => {
    let state = reduceBoard(
      initialBoardState,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1, isSetup: false, isFreeRoad: false },
      initialGameState,
    )
    state = reduceBoard(state, { type: 'BUILD_ROAD', edgeId: 'E2', playerId: 2, isSetup: false, isFreeRoad: false }, initialGameState)
    const result = reduceBoard(state, { type: 'REMOVE_ROAD', edgeId: 'E1' }, initialGameState)
    expect(result.roads['E2']).toBe(2)
  })
})

describe('reduceBoard — RESET_BOARD', () => {
  it('clears settlements and roads back to empty', () => {
    let state = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false },
      initialGameState,
    )
    state = reduceBoard(state, { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1, isSetup: false, isFreeRoad: false }, initialGameState)
    const result = reduceBoard(state, { type: 'RESET_BOARD' }, initialGameState)
    expect(result).toEqual(initialBoardState)
  })
})

describe('reduceBoard — RESTORE_BOARD', () => {
  it('replaces settlements and roads with the given snapshot values', () => {
    const settlements = { V1: { ownerId: 2, type: 'city' as const } }
    const roads = { E1: 2 }
    const result = reduceBoard(initialBoardState, { type: 'RESTORE_BOARD', settlements, roads }, initialGameState)
    expect(result.settlements).toEqual(settlements)
    expect(result.roads).toEqual(roads)
  })
})

describe('reduceBoard — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'LEGACY_SET_PLAYERS', updater: (p) => p },
      initialGameState,
    )
    expect(result).toBe(initialBoardState)
  })
})

describe('describeBoardAction', () => {
  const players = createInitialPlayers(2)
  const playerById = new Map(players.map((p) => [p.id, p]))

  it('BUILD_SETTLEMENT plays the placement sound, no banner', () => {
    const result = describeBoardAction({ type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: players[0].id, isSetup: false }, playerById)
    expect(result.sfx).toBe('placement')
    expect(result.message).toBeNull()
  })

  it('BUILD_CITY plays the placement sound, no banner', () => {
    const result = describeBoardAction({ type: 'BUILD_CITY', vertexId: 'V1', playerId: players[0].id }, playerById)
    expect(result.sfx).toBe('placement')
    expect(result.message).toBeNull()
  })

  it('BUILD_ROAD plays the road-placement sound, no banner', () => {
    const result = describeBoardAction(
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: players[0].id, isSetup: false, isFreeRoad: false },
      playerById,
    )
    expect(result.sfx).toBe('roadPlacement')
    expect(result.message).toBeNull()
  })

  it('PILLAGE_CITY shows a banner naming the pillaged player, no sound', () => {
    const result = describeBoardAction({ type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, playerById)
    expect(result.message).toBe(`${players[0].name}'s city was pillaged and reduced to a settlement.`)
    expect(result.sfx).toBeNull()
  })

  it('PILLAGE_CITY with an unknown player id returns no banner (not "undefined")', () => {
    const result = describeBoardAction({ type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 9999 }, playerById)
    expect(result.message).toBeNull()
    expect(result.sfx).toBeNull()
  })

  it('REMOVE_ROAD has no board-level description (handled at the call site instead)', () => {
    const result = describeBoardAction({ type: 'REMOVE_ROAD', edgeId: 'E1' }, playerById)
    expect(result.message).toBeNull()
    expect(result.sfx).toBeNull()
  })

  it('an action not owned by this reducer returns no banner or sound', () => {
    const result = describeBoardAction({ type: 'LEGACY_SET_PLAYERS', updater: (p) => p }, playerById)
    expect(result.message).toBeNull()
    expect(result.sfx).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`
Expected: FAIL — `isSetup`/`isFreeRoad` aren't valid fields yet, `../gameState` doesn't export a `LEGACY_SET_PLAYERS`-aware `GameAction`, `initialGameState` import may not resolve to the right shape yet.

- [ ] **Step 3: Update `board.ts`**

Replace `catan-3d/src/game/reducers/board.ts` with:

```ts
import type { Building, Player, Resources } from '../types'
import type { SfxKey } from '../../audio/sfx'
import type { GameAction, GameState } from '../gameState'

export interface BoardState {
  settlements: Record<string, Building>
  roads: Record<string, number>
}

export const initialBoardState: BoardState = {
  settlements: {},
  roads: {},
}

export type BoardAction =
  | { type: 'BUILD_SETTLEMENT'; vertexId: string; playerId: number; isSetup: boolean }
  | { type: 'BUILD_CITY'; vertexId: string; playerId: number; costOverride?: Partial<Resources> }
  | { type: 'BUILD_ROAD'; edgeId: string; playerId: number; isSetup: boolean; isFreeRoad: boolean }
  | { type: 'PILLAGE_CITY'; vertexId: string; playerId: number }
  | { type: 'REMOVE_ROAD'; edgeId: string }
  | { type: 'RESET_BOARD' }
  | { type: 'RESTORE_BOARD'; settlements: Record<string, Building>; roads: Record<string, number> }

export function reduceBoard(state: BoardState, action: GameAction, _fullState: GameState): BoardState {
  switch (action.type) {
    case 'BUILD_SETTLEMENT':
      return {
        ...state,
        settlements: { ...state.settlements, [action.vertexId]: { ownerId: action.playerId, type: 'settlement' } },
      }
    case 'BUILD_CITY':
      return {
        ...state,
        settlements: { ...state.settlements, [action.vertexId]: { ownerId: action.playerId, type: 'city' } },
      }
    case 'BUILD_ROAD':
      return { ...state, roads: { ...state.roads, [action.edgeId]: action.playerId } }
    case 'PILLAGE_CITY': {
      const building = state.settlements[action.vertexId]
      if (!building || building.type !== 'city' || building.ownerId !== action.playerId) return state
      return {
        ...state,
        settlements: { ...state.settlements, [action.vertexId]: { ownerId: action.playerId, type: 'settlement' } },
      }
    }
    case 'REMOVE_ROAD': {
      if (!(action.edgeId in state.roads)) return state
      const roads = { ...state.roads }
      delete roads[action.edgeId]
      return { ...state, roads }
    }
    case 'RESET_BOARD':
      // A fresh object every reset, not the shared `initialBoardState`
      // singleton — nothing mutates settlements/roads in place today, but
      // aliasing the module-level object into live state costs nothing to
      // avoid.
      return { settlements: {}, roads: {} }
    case 'RESTORE_BOARD':
      return { settlements: action.settlements, roads: action.roads }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full
      // GameAction union (every slice's actions), not just BoardAction, so
      // most of that union — including every players-only action — is
      // legitimately unhandled here. reduceBoard only owns the 7 cases
      // above, same as any combineReducers-style slice reducer.
      return state
  }
}

export function describeBoardAction(
  action: GameAction,
  playerById: Map<number, Player>,
): { message: string | null; sfx: SfxKey | null } {
  switch (action.type) {
    case 'BUILD_SETTLEMENT':
    case 'BUILD_CITY':
      return { message: null, sfx: 'placement' }
    case 'BUILD_ROAD':
      return { message: null, sfx: 'roadPlacement' }
    case 'PILLAGE_CITY': {
      const owner = playerById.get(action.playerId)
      return {
        message: owner ? `${owner.name}'s city was pillaged and reduced to a settlement.` : null,
        sfx: null,
      }
    }
    case 'REMOVE_ROAD':
    case 'RESET_BOARD':
    case 'RESTORE_BOARD':
      // No banner/sfx for any of these — REMOVE_ROAD's banner is handled at
      // its own call site (App.tsx applyDiplomacyRemoval), and
      // RESET_BOARD/RESTORE_BOARD bypass dispatchGameAction entirely (see
      // its comment in App.tsx), so this function is never actually called
      // with either in practice. Listed explicitly rather than falling
      // through to default so the intent is documented, not implicit.
      return { message: null, sfx: null }
    default:
      // Same reasoning as reduceBoard's default: not exhaustive over the
      // full GameAction union, only over BoardAction's own cases.
      return { message: null, sfx: null }
  }
}
```

- [ ] **Step 4: Run tests — still expected to fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`
Expected: FAIL — `../gameState` doesn't export `GameAction`/`GameState`/`initialGameState` with a `LEGACY_SET_PLAYERS` member yet (Task 3 adds that). This is expected; Task 1 alone doesn't compile standalone. Confirm the failure is specifically about `gameState.ts`'s exports, not about `board.ts` itself — read the error carefully before moving on.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/reducers/board.test.ts
git commit -m "feat: extend BoardAction fields, widen reduceBoard/describeBoardAction to the composed GameAction"
```

(This commit will not typecheck standalone until Task 3 lands — that's expected for this incremental plan; do not run `tsc -b` as a gate until after Task 3.)

---

### Task 2: `players.ts` — `PlayersAction`, `reducePlayers`

**Files:**
- Create: `catan-3d/src/game/reducers/players.ts`
- Create: `catan-3d/src/game/reducers/players.test.ts`

**Interfaces:**
- Consumes: `Player`, `Resources`, `ResourceType`, `deductCost`, `SETTLEMENT_COST`, `CITY_COST`, `ROAD_COST` from `../types`; `GameAction`, `GameState` from `../gameState` (type-only — `gameState.ts` also imports from this file, a legitimate type-only circular reference resolved by `import type`, matching the existing `board.ts`/`gameState.ts` pattern from Task 1).
- Produces: `PlayersAction` (a new union: `LEGACY_SET_PLAYERS` and `GRANT_SETUP_RESOURCES`), `reducePlayers(players: Player[], action: GameAction, fullState: GameState): Player[]`.

`reducePlayers` handles 5 cases this task: the bridge (`LEGACY_SET_PLAYERS`), the 3 board actions it shares with `reduceBoard` (`BUILD_SETTLEMENT`/`BUILD_CITY`/`BUILD_ROAD` — same action, two reducers reacting to it, standard composition), and `GRANT_SETUP_RESOURCES`.

- [ ] **Step 1: Write the failing test**

Create `catan-3d/src/game/reducers/players.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { reducePlayers } from './players'
import { createInitialPlayers } from '../types'
import { initialGameState } from '../gameState'

describe('reducePlayers — LEGACY_SET_PLAYERS', () => {
  it('applies the given updater to the players array', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => ({ ...p, knightsPlayed: 9 })) },
      initialGameState,
    )
    expect(result[0].knightsPlayed).toBe(9)
    expect(result[1].knightsPlayed).toBe(9)
  })

  it('does not mutate the input array', () => {
    const players = createInitialPlayers(2)
    reducePlayers(players, { type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => ({ ...p, knightsPlayed: 9 })) }, initialGameState)
    expect(players[0].knightsPlayed).toBe(0)
  })
})

describe('reducePlayers — BUILD_SETTLEMENT', () => {
  it('deducts the settlement cost and decrements settlementsRemaining outside setup', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 1, brick: 1, wool: 1, grain: 1, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: players[0].id, isSetup: false },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })
    expect(player.settlementsRemaining).toBe(players[0].settlementsRemaining - 1)
  })

  it('does not deduct resources during setup', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: players[0].id, isSetup: true },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual(players[0].resources)
    expect(player.settlementsRemaining).toBe(players[0].settlementsRemaining - 1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: players[0].id, isSetup: true },
      initialGameState,
    )
    expect(result[1]).toEqual(players[1])
  })
})

describe('reducePlayers — BUILD_CITY', () => {
  it('deducts CITY_COST, swaps a settlement for a city in the supply counts', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 2, ore: 3 } }))
    const result = reducePlayers(players, { type: 'BUILD_CITY', vertexId: 'V1', playerId: players[0].id }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })
    expect(player.settlementsRemaining).toBe(players[0].settlementsRemaining + 1)
    expect(player.citiesRemaining).toBe(players[0].citiesRemaining - 1)
  })

  it('deducts costOverride instead of CITY_COST when present (Medicine discount)', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 1 } }))
    const result = reducePlayers(
      players,
      { type: 'BUILD_CITY', vertexId: 'V1', playerId: players[0].id, costOverride: { ore: 1 } },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources.ore).toBe(0)
  })
})

describe('reducePlayers — BUILD_ROAD', () => {
  it('deducts ROAD_COST and decrements roadsRemaining outside setup/free roads', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 1, brick: 1, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: players[0].id, isSetup: false, isFreeRoad: false },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })
    expect(player.roadsRemaining).toBe(players[0].roadsRemaining - 1)
  })

  it('does not deduct resources when isSetup is true', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: players[0].id, isSetup: true, isFreeRoad: false },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources).toEqual(players[0].resources)
  })

  it('does not deduct resources when isFreeRoad is true', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: players[0].id, isSetup: false, isFreeRoad: true },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources).toEqual(players[0].resources)
  })
})

describe('reducePlayers — GRANT_SETUP_RESOURCES', () => {
  it('adds the given resource delta to the named player only', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'GRANT_SETUP_RESOURCES', playerId: players[0].id, resources: { grain: 2, ore: 1 } },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.grain).toBe(2)
    expect(player.resources.ore).toBe(1)
    expect(player.resources.lumber).toBe(0)
    expect(result.find((p) => p.id === players[1].id)!.resources).toEqual(players[1].resources)
  })
})

describe('reducePlayers — action not owned by this reducer', () => {
  it('returns the same array reference unchanged', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'RESET_BOARD' }, initialGameState)
    expect(result).toBe(players)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL — `./players` doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `catan-3d/src/game/reducers/players.ts`:

```ts
import type { Player, Resources, ResourceType } from '../types'
import { deductCost, SETTLEMENT_COST, CITY_COST, ROAD_COST } from '../types'
import type { GameAction, GameState } from '../gameState'

export type PlayersAction =
  // Bridge for every setPlayers call site not yet individually migrated to
  // its own real action — see the players-slice design spec's "Why not a
  // smaller plan" section. Never broadcast (see this plan's Global
  // Constraints); deleted once every sub-plan through the final cutover has
  // replaced its own functions' calls with real actions.
  | { type: 'LEGACY_SET_PLAYERS'; updater: (players: Player[]) => Player[] }
  // applySettlementPlacement's 2nd-setup-round resource grant — kept as its
  // own action rather than folded into BUILD_SETTLEMENT's payload, per the
  // spec's "one action per distinct effect shape" rule: it's a genuinely
  // separate players-state change (only fires conditionally), not a variant
  // of placing the settlement itself.
  | { type: 'GRANT_SETUP_RESOURCES'; playerId: number; resources: Partial<Resources> }

export function reducePlayers(players: Player[], action: GameAction, _fullState: GameState): Player[] {
  switch (action.type) {
    case 'LEGACY_SET_PLAYERS':
      return action.updater(players)
    case 'BUILD_SETTLEMENT':
      return players.map((p) =>
        p.id === action.playerId
          ? {
              ...p,
              resources: action.isSetup ? p.resources : deductCost(p.resources, SETTLEMENT_COST),
              settlementsRemaining: p.settlementsRemaining - 1,
            }
          : p,
      )
    case 'BUILD_CITY':
      return players.map((p) =>
        p.id === action.playerId
          ? {
              ...p,
              resources: deductCost(p.resources, action.costOverride ?? CITY_COST),
              settlementsRemaining: p.settlementsRemaining + 1,
              citiesRemaining: p.citiesRemaining - 1,
            }
          : p,
      )
    case 'BUILD_ROAD':
      return players.map((p) =>
        p.id === action.playerId
          ? {
              ...p,
              resources: action.isSetup || action.isFreeRoad ? p.resources : deductCost(p.resources, ROAD_COST),
              roadsRemaining: p.roadsRemaining - 1,
            }
          : p,
      )
    case 'GRANT_SETUP_RESOURCES':
      return players.map((p) => {
        if (p.id !== action.playerId) return p
        const resources = { ...p.resources }
        for (const [resource, amount] of Object.entries(action.resources) as [ResourceType, number][]) {
          resources[resource] += amount
        }
        return { ...p, resources }
      })
    default:
      // reducePlayers never has (or needs) a `never`-exhaustiveness default
      // — unlike reduceBoard, it's deliberately, permanently partial over
      // GameAction: it only owns the subset of actions with a players-side
      // effect. Everything else passes through unchanged.
      return players
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/reducers/players.test.ts`
Expected: FAIL still — `../gameState` doesn't export `GameAction` including `PlayersAction` yet (Task 3). Confirm the failure is specifically an import/type error from `gameState.ts`, not a logic failure in `players.ts` itself.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/game/reducers/players.ts catan-3d/src/game/reducers/players.test.ts
git commit -m "feat: add PlayersAction and reducePlayers with the LEGACY_SET_PLAYERS bridge"
```

---

### Task 3: Compose `players` into `GameState`/`GameAction`/`reduceGame`

**Files:**
- Modify: `catan-3d/src/game/gameState.ts`
- Modify: `catan-3d/src/game/gameState.test.ts`

**Interfaces:**
- Consumes: `BoardState`, `reduceBoard`, `initialBoardState`, `BoardAction` (Task 1); `reducePlayers`, `PlayersAction` (Task 2); `Player`, `createInitialPlayers` from `../types`.
- Produces: `GameState.players: Player[]`; `GameAction = BoardAction | PlayersAction`; `reduceGame` composes both reducers, 3-arg signature.

This task is what makes Tasks 1 and 2 typecheck — until now, both referenced a `GameAction`/`GameState` shape this file didn't produce yet.

- [ ] **Step 1: Write the failing test**

Replace `catan-3d/src/game/gameState.test.ts` with:

```ts
import { describe, expect, it } from 'vitest'
import { reduceGame, initialGameState } from './gameState'

describe('reduceGame', () => {
  it('routes a board action through reduceBoard', () => {
    const result = reduceGame(initialGameState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false })
    expect(result.board.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('routes the same action through reducePlayers too — BUILD_SETTLEMENT is handled by both slices', () => {
    const result = reduceGame(initialGameState, {
      type: 'BUILD_SETTLEMENT',
      vertexId: 'V1',
      playerId: initialGameState.players[0].id,
      isSetup: true,
    })
    const player = result.players.find((p) => p.id === initialGameState.players[0].id)!
    expect(player.settlementsRemaining).toBe(initialGameState.players[0].settlementsRemaining - 1)
  })

  it('routes a players-only action (GRANT_SETUP_RESOURCES) without touching board', () => {
    const result = reduceGame(initialGameState, {
      type: 'GRANT_SETUP_RESOURCES',
      playerId: initialGameState.players[0].id,
      resources: { grain: 1 },
    })
    expect(result.board).toBe(initialGameState.board)
    expect(result.players.find((p) => p.id === initialGameState.players[0].id)!.resources.grain).toBe(1)
  })

  it('does not mutate the input state', () => {
    const before = initialGameState
    reduceGame(before, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false })
    expect(before.board.settlements).toEqual({})
    expect(before.players).toBe(initialGameState.players)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/gameState.test.ts`
Expected: FAIL — `initialGameState.players` doesn't exist yet; `BUILD_SETTLEMENT` action shape is missing `isSetup`.

- [ ] **Step 3: Write the implementation**

Replace `catan-3d/src/game/gameState.ts` with:

```ts
import { reduceBoard, initialBoardState, type BoardState, type BoardAction } from './reducers/board'
import { reducePlayers, type PlayersAction } from './reducers/players'
import { createInitialPlayers, type Player } from './types'

export interface GameState {
  board: BoardState
  players: Player[]
}

export const initialGameState: GameState = {
  board: initialBoardState,
  // Matches the default the old `useState(() => createInitialPlayers(3))`
  // used to seed with, before a real game (resetGame) replaces it.
  players: createInitialPlayers(3),
}

export type GameAction = BoardAction | PlayersAction

export function reduceGame(state: GameState, action: GameAction): GameState {
  return {
    board: reduceBoard(state.board, action, state),
    players: reducePlayers(state.players, action, state),
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts src/game/reducers/players.test.ts src/game/gameState.test.ts`
Expected: PASS — all three files, including Tasks 1 and 2's tests that were blocked on this file.

- [ ] **Step 5: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/game/reducers/board.ts src/game/reducers/board.test.ts src/game/reducers/players.ts src/game/reducers/players.test.ts src/game/gameState.ts src/game/gameState.test.ts`
Expected: clean. (`App.tsx` will not typecheck yet — its `dispatch({ type: 'BUILD_SETTLEMENT', ... })` call sites are still missing `isSetup`, fixed in Task 4. Don't run `tsc -b` against the whole project as a gate until after Task 4.)

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/gameState.ts catan-3d/src/game/gameState.test.ts
git commit -m "feat: compose players into GameState/GameAction/reduceGame"
```

---

### Task 4: Bridge every remaining `setPlayers` call site, delete the old `useState`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `GameAction` (now including `LEGACY_SET_PLAYERS`), `gameState`, `dispatch` (already wired by the board slice at `App.tsx:321`).
- Produces: `const players = gameState.players` (read-only alias); every `setPlayers(...)` call site converted to `dispatch({ type: 'LEGACY_SET_PLAYERS', updater })`; `const [players, setPlayers] = useState(...)` deleted.

This task is purely mechanical — the exact same transformation, applied to every remaining call site, changing no logic. It does NOT yet migrate `applySettlementPlacement`/`applyCityPlacement`/`applyRoadPlacement`/`grantResourcesForVertex` to their real actions — those 4 also get bridged here like everything else, then upgraded to real actions in Tasks 5-7. This keeps this task uniform (one rule, no exceptions) and keeps Tasks 5-7 focused purely on the reducer-migration work they're actually about.

**The transformation rule**, two forms:

**Form A — functional updater** (the vast majority of call sites):
```tsx
// Before:
setPlayers((prev) => prev.map((p) => (p.id === playerId ? { ...p, resources: nextResources } : p)))
// After:
dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => (p.id === playerId ? { ...p, resources: nextResources } : p)) })
```
The updater's body is copied verbatim — do not rewrite any logic inside it.

**Form B — direct value replacement** (only `resetGame` and `restoreFromSnapshot`):
```tsx
// Before:
setPlayers(createInitialPlayers(count, resolvedNames, isFreshSubmission ? colorTokens : undefined, effectiveRules.victoryPointTarget))
// After:
dispatch({
  type: 'LEGACY_SET_PLAYERS',
  updater: () => createInitialPlayers(count, resolvedNames, isFreshSubmission ? colorTokens : undefined, effectiveRules.victoryPointTarget),
})
```
Wrap the existing value expression in `() => ...`, ignoring `prev` — do not change the expression itself.

- [ ] **Step 1: Add the read-only alias, remove the old `useState`**

At `App.tsx:293`, delete:
```tsx
  const [players, setPlayers] = useState(() => createInitialPlayers(3))
```

Immediately after `App.tsx:321`'s existing `const [gameState, dispatch] = useReducer(reduceGame, initialGameState)`, add:
```tsx
  // Read-only — every existing read site (`players.find(...)`, `players={players}`,
  // etc.) keeps working unchanged. Only write sites change, in this task and
  // the ones that follow it.
  const players = gameState.players
```

- [ ] **Step 2: Apply the transformation to every remaining call site**

Apply Form A or Form B (as marked) to every call site below. Confirm each line number with `grep -n "setPlayers(" src/App.tsx` before editing — line numbers shift as you work top-to-bottom through the file, so re-check rather than trusting the numbers below blindly once you've made a few edits.

*Form A (functional updater) — building/trading/robber-pillage:*
`applyTradeResolution` (~1218), `bankTrade` (~4282), `applyCommodityTrade` (~1485), `applyCommercialHarborEffect` (~3075), `applyRobberMove` (~1013), `moveRobber` (~4082, the knight-deactivation call only), `applyPillage` (~1334), `applyDiscard` (~1262).

*Form A — barbarians/knights:*
`applyBarbarianAttackResult` (~3373, both calls), `resolveTaxation` (~4013), `armTaxation` (~6213), `handleKnightVertexSelect` (~5377, all 3 calls), `handleKnightSelect` (~5506, both calls), `activateKnight` (~5613), `promoteKnight` (~5643), `playSmithing` (~5806), `playEncouragement` (~5859).

*Form A — progress cards:*
`applyYearOfPlentyEffect` (~1105), `applyMonopolyEffect` (~1119), `applyResourceMonopolyProgressEffect` (~1157), `applyTradeMonopolyEffect` (~1190), `applyProgressDiscard` (~1295), `applyScienceFreeResourcePick` (~1311), `applyBarbarianWinnerDraw` (~1392), `applyProgressCardDraws` (~1428), `applyDiplomacyRemoval` (~3157), `playResourceMonopoly` (~4827), `playTradeMonopoly` (~4859), `playAlchemy` (~4877), `applyIrrigationEffect` (~4933), `applyMiningEffect` (~4975), `applyCraneEffect` (~5017), `applyMedicineEffect` (~5053), `playProgressRoadBuilding` (~5078), `playInvention` (~5144), `applySabotageEffect` (~5940), `applyWeddingEffect` (~5983), `applyGuildDuesTake` (~6046), `playGuildDues` (~6072), `applyEspionageTake` (~6131), `playEspionage` (~6151), `playIntrigue` (~6275), `playTreason` (~6333).

*Form A — city improvements/merchant/turn-misc:*
`applyCityImprovementPurchase` (~1407), `buyCityImprovement` (~4702, the Crane-refund call), `buildCityWall` (~5686), `playEngineering` (~5716), `resolveFreeCityWall` (~5770), `playMerchantFleet` (~5179), `playMerchant` (~5208), `applyTurnAdvance` (~819), `buyDevCard` (~4551), `spendDevCard` (~4757), `applyRollResult` (~3581, both calls).

*Form A — `useRoomChannel` receive-handler duplicates (still duplicated — their own sub-plan removes the duplication, this task only bridges them):*
`onResourceMonopolyPlayed` (~1705), `onTradeMonopolyPlayed` (~1720), `onDevCardBought` (~1780), `onCityImprovementPurchased` (~1817), `onProgressCardPlayed` (~1900, ~1910, ~1922, ~1931, ~1941 — 5 calls), `onBankTrade` (~1999), `onKnightRecruited` (~2120), `onKnightActivated` (~2141), `onKnightPromoted` (~2154), `onKnightMoved` (~2178), `onKnightDisplaced` (~2194), `onKnightDeactivatedAfterChase` (~2229), `onCityWallBuilt` (~2244), `onSmithingPlayed` (~2271), `onEncouragementPlayed` (~2295), `onIntrigueResolved` (~2310), `onTreasonRemoved` (~2339), `onTaxationResolved` (~2377).

*Form A — this sub-plan's own 4 target functions (bridged here, upgraded to real actions in Tasks 5-7):*
`applySettlementPlacement` (~922), `applyCityPlacement` (~953), `applyRoadPlacement` (~978), `grantResourcesForVertex` (~2853).

*Form B (direct value):*
`resetGame` (~6584), `restoreFromSnapshot` (~6793).

- [ ] **Step 3: Verify every call site converted**

Run: `grep -c "setPlayers(" catan-3d/src/App.tsx`
Expected: `0`.

Run: `grep -c "useState<Player\[\]>\|useState(() => createInitialPlayers" catan-3d/src/App.tsx`
Expected: `0`.

- [ ] **Step 4: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx && npx vitest run`
Expected: clean; same test count as Task 3 (this task adds no new automated tests — matching this project's established split of pure-logic-unit-tests vs. `App.tsx`-wiring-manual-verification, e.g. the board slice's own Task 7/8).

- [ ] **Step 5: Manual verification**

Run the dev server (`cd catan-3d && npm run dev`) and play a full local Pass & Play game through several distinct systems this task touched but didn't behaviorally change: build a settlement/city/road, roll dice and collect resources, make a bank trade, buy and play a dev card, trigger a robber steal. Confirm every one behaves identically to before this task (since `LEGACY_SET_PLAYERS` is a pure pass-through, nothing should look or feel different). Confirm no console errors about `setPlayers is not defined` or similar.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "refactor: bridge every setPlayers call through LEGACY_SET_PLAYERS, delete the players useState"
```

---

### Task 5: Migrate `applySettlementPlacement` and `grantResourcesForVertex` to real actions

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `dispatchGameAction` (existing, `App.tsx:717`); `BUILD_SETTLEMENT`/`GRANT_SETUP_RESOURCES` (Tasks 1-2).

Current body after Task 4 (illustrative — confirm exact current text before editing, since Task 4 changed this function):
```tsx
const applySettlementPlacement = (vertexId: string, playerId: number, isSetup: boolean, isDeciding: boolean) => {
  dispatchGameAction({ type: 'BUILD_SETTLEMENT', vertexId, playerId }, isDeciding)
  setRevealedTileIds((prev) => revealTilesForVertex(prev, vertexId, graph.vertexTileIds))
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => p.id === playerId ? { ...p, resources: isSetup ? p.resources : deductCost(p.resources, SETTLEMENT_COST), settlementsRemaining: p.settlementsRemaining - 1 } : p) })
  if (isSetup) {
    const isSecondRound = setupStepIndex >= setupOrder.length / 2
    if (isSecondRound) grantResourcesForVertex(vertexId, playerId)
    setSetupSettlementVertexId(vertexId)
    setSetupStage('road')
  }
}
```

- [ ] **Step 1: Replace `applySettlementPlacement`'s players-side write**

```tsx
const applySettlementPlacement = (vertexId: string, playerId: number, isSetup: boolean, isDeciding: boolean) => {
  dispatchGameAction({ type: 'BUILD_SETTLEMENT', vertexId, playerId, isSetup }, isDeciding)
  setRevealedTileIds((prev) => revealTilesForVertex(prev, vertexId, graph.vertexTileIds))
  if (isSetup) {
    const isSecondRound = setupStepIndex >= setupOrder.length / 2
    if (isSecondRound) grantResourcesForVertex(vertexId, playerId)
    setSetupSettlementVertexId(vertexId)
    setSetupStage('road')
  }
}
```

Note the `BUILD_SETTLEMENT` action now carries `isSetup` (Task 1's new field) — `reducePlayers`'s existing `BUILD_SETTLEMENT` case (Task 2) already reads it correctly; nothing in `reducePlayers` itself changes. `grantResourcesForVertex`'s call keeps its original 2-argument form — no `isDeciding` parameter, for the reason Step 2 explains.

- [ ] **Step 2: Replace `grantResourcesForVertex`**

Current body after Task 4 (illustrative):
```tsx
const grantResourcesForVertex = (vertexId: string, ownerId: number) => {
  const tileIds = graph.vertexTileIds.get(vertexId) ?? []
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => { /* ...original loop... */ }) })
}
```

Replace with:
```tsx
const grantResourcesForVertex = (vertexId: string, ownerId: number) => {
  const tileIds = graph.vertexTileIds.get(vertexId) ?? []
  const resources: Partial<Resources> = {}
  for (const tileId of tileIds) {
    const tile = tileById.get(tileId)
    const resource = tile && BIOME_TO_RESOURCE[tile.biome]
    if (resource) resources[resource] = (resources[resource] ?? 0) + 1
  }
  // Always isDeciding: false — this is never broadcast. Every client
  // (the deciding client AND every receiver) independently computes the
  // identical resource delta from the same static tile/vertex data when
  // THEIR OWN applySettlementPlacement call runs (whether locally decided
  // or received via onSettlementBuilt). Broadcasting it too would double-
  // apply the grant on every receiver, so this function takes no
  // `isDeciding` parameter at all — there's nothing for a caller to decide.
  dispatchGameAction({ type: 'GRANT_SETUP_RESOURCES', playerId: ownerId, resources }, false)
}
```

- [ ] **Step 3: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx && npx vitest run`
Expected: clean, same test count.

- [ ] **Step 4: Manual verification**

Dev server: play through initial setup (both placement rounds) as multiple players locally. Confirm: first-round settlements grant no resources, second-round settlements grant exactly the adjacent hexes' resources, `settlementsRemaining` decrements correctly both rounds, non-setup settlement placement later in the game correctly deducts `SETTLEMENT_COST`.

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate applySettlementPlacement and grantResourcesForVertex to real actions"
```

---

### Task 6: Migrate `applyCityPlacement` to `BUILD_CITY`, drop its broadcast special-case

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `dispatchGameAction`, `broadcastGameAction` (existing); `BUILD_CITY`'s new `costOverride` field (Task 1).

Current body after Task 4 (illustrative):
```tsx
const applyCityPlacement = (vertexId: string, playerId: number, isDeciding: boolean, costOverride?: Partial<Resources>) => {
  dispatchGameAction({ type: 'BUILD_CITY', vertexId, playerId }, false)
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => { /* ...deduct costOverride ?? CITY_COST... */ }) })
  if (isDeciding && onlineInfo) broadcastCityBuilt({ vertexId, playerId, costOverride })
}
```

- [ ] **Step 1: Replace the function — `costOverride` now travels on the action itself**

```tsx
const applyCityPlacement = (vertexId: string, playerId: number, isDeciding: boolean, costOverride?: Partial<Resources>) => {
  dispatchGameAction({ type: 'BUILD_CITY', vertexId, playerId, costOverride }, isDeciding)
}
```

- [ ] **Step 2: Add `BUILD_CITY` to `broadcastGameAction`'s generic switch**

At `App.tsx`'s `broadcastGameAction` function (~line 734), add:
```tsx
case 'BUILD_CITY':
  broadcastCityBuilt({ vertexId: action.vertexId, playerId: action.playerId, costOverride: action.costOverride })
  break
```

Confirm `broadcastCityBuilt`'s existing payload type (`CityBuiltPayload` in `useRoomChannel.ts`) still matches — it already carries `costOverride` (added when this gap was first discovered and fixed during the board slice), so no changes are needed there.

- [ ] **Step 3: Remove the now-obsolete special-case comments**

`dispatchGameAction`'s own comment block (~line 699) and `broadcastGameAction`'s own comment block (~line 725) both currently list `BUILD_CITY`'s `costOverride` as an example of a field the generic path can't carry. Update both comments to remove `BUILD_CITY` from that list — after this task, only `BUILD_ROAD`'s `isFreeRoad` and `REMOVE_ROAD`'s `playerId`/`ownerId` remain as the special-cased actions (both still true after this task; `BUILD_ROAD` gets the same treatment in Task 7, `REMOVE_ROAD` is sub-plan 4's `applyDiplomacyRemoval` migration).

- [ ] **Step 4: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx && npx vitest run`

- [ ] **Step 5: Manual verification**

Dev server, ideally a 2-client online test: upgrade a settlement to a city both with and without Medicine's discount active (Cities & Knights on). Confirm both the deciding client and the receiving client show the correct resource deduction and the correct city on the board — this is the exact gap (`costOverride` missing from the broadcast) that was found and fixed during the board slice; this task closes it a second, more permanent way (on the action itself, not a broadcast-payload patch).

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate applyCityPlacement to BUILD_CITY, route its broadcast through broadcastGameAction generically"
```

---

### Task 7: Migrate `applyRoadPlacement` to `BUILD_ROAD`, drop its broadcast special-case

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `dispatchGameAction`, `broadcastGameAction` (existing); `BUILD_ROAD`'s new `isSetup`/`isFreeRoad` fields (Task 1).

Current body after Task 4 (illustrative):
```tsx
const applyRoadPlacement = (edgeId: string, playerId: number, isSetup: boolean, isFreeRoad: boolean, isDeciding: boolean) => {
  dispatchGameAction({ type: 'BUILD_ROAD', edgeId, playerId }, false)
  dispatch({ type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => { /* ...deduct ROAD_COST unless isSetup||isFreeRoad... */ }) })
  if (isFreeRoad) setFreeRoadsRemaining((prev) => Math.max(0, prev - 1))
  if (isSetup) { /* ...setup-stage advancement, unchanged... */ }
  if (isDeciding && onlineInfo) broadcastRoadBuilt({ edgeId, playerId, isFreeRoad })
}
```

- [ ] **Step 1: Replace the function — `isSetup`/`isFreeRoad` now travel on the action itself**

```tsx
const applyRoadPlacement = (edgeId: string, playerId: number, isSetup: boolean, isFreeRoad: boolean, isDeciding: boolean) => {
  dispatchGameAction({ type: 'BUILD_ROAD', edgeId, playerId, isSetup, isFreeRoad }, isDeciding)
  if (isFreeRoad) setFreeRoadsRemaining((prev) => Math.max(0, prev - 1))
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

- [ ] **Step 2: Add `BUILD_ROAD` to `broadcastGameAction`'s generic switch**

```tsx
case 'BUILD_ROAD':
  broadcastRoadBuilt({ edgeId: action.edgeId, playerId: action.playerId, isFreeRoad: action.isFreeRoad })
  break
```

Confirm `broadcastRoadBuilt`'s existing `RoadBuiltPayload` type already carries `isFreeRoad` (added when this gap was first found during the board slice) — no type changes needed there. Note `isSetup` does NOT need to travel over the broadcast — the receiving client already derives its own `isSetup` from its local `gamePhase` at the `onRoadBuilt` call site (unchanged from today), it's only needed on the ACTION for `reducePlayers`'s cost-deduction logic, which runs identically and locally on every client from their own dispatched/received action.

- [ ] **Step 3: Remove the now-obsolete special-case comment for `BUILD_ROAD`**

Same as Task 6 Step 3 — update `dispatchGameAction`'s and `broadcastGameAction`'s comments to drop `BUILD_ROAD` from the "needs special-casing" list. After this task, only `REMOVE_ROAD` remains (sub-plan 4).

- [ ] **Step 4: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx && npx vitest run`

- [ ] **Step 5: Manual verification**

Dev server: place roads during setup (confirm turn/setup-stage advancement still works, including the last setup road transitioning to `'playing'`), a normal paid road, and a free road (Road Building card or a setup road) — confirm `freeRoadsRemaining` only decrements for the free case, and (2-client online test if possible) that a receiving client correctly skips the cost deduction for the other player's free/setup roads.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate applyRoadPlacement to BUILD_ROAD, route its broadcast through broadcastGameAction generically"
```

---

### Task 8: Final verification for this sub-plan

**Files:** none (verification only)

- [ ] **Step 1: Full automated suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src && npx vitest run`
Expected: all clean.

- [ ] **Step 2: Confirm the bridge's scope**

Run: `grep -c "LEGACY_SET_PLAYERS" catan-3d/src/App.tsx`
Expected: a number matching the call-site count from Task 4's list minus the 6 sites this sub-plan migrated away from it (`applySettlementPlacement`, `applyCityPlacement`, `applyRoadPlacement`, `grantResourcesForVertex`'s conversion, and 2 dispatch sites inside them) — confirms sub-plan 2 has a real, shrinking bridge to work from, not a no-op.

- [ ] **Step 3: Manual end-to-end play session**

Dev server: play one full local Pass & Play game from setup through a few turns, exercising: settlement/city/road placement (this sub-plan's real migration), plus at least one bank trade, one dev card purchase, and one dice roll (all still bridge-backed, confirming the bridge itself is solid under real play, not just the 4 directly-tested functions).
