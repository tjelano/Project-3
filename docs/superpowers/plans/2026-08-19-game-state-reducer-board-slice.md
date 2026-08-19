# Game State Reducer — Board Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `settlements`/`roads` out of `App.tsx`'s `useState` calls into a real, tested `reduceBoard` reducer — the first working slice of the canonical `GameState`/`GameAction`/`reduceGame` architecture, proving the pattern end-to-end (pure reducer, cross-domain writes via a documented transitional pattern, side-effect separation, multiplayer dispatch) on real, currently-shipping game mechanics.

**Architecture:** `catan-3d/src/game/reducers/board.ts` holds `BoardState`, `reduceBoard`, and one `describeBoardAction` per action. `catan-3d/src/game/gameState.ts` holds the top-level `GameState`/`GameAction` types and `reduceGame` (composes `reduceBoard`; more sub-reducers join this composition in later plans). `App.tsx` gets one `useReducer(reduceGame, initialGameState)` plus a `dispatchGameAction` wrapper, coexisting with all not-yet-migrated `useState` calls.

**Tech Stack:** React + TypeScript, Vitest (tests), Supabase Realtime (multiplayer broadcast) — no new dependencies; `useReducer` is a built-in React hook.

**Spec:** `docs/superpowers/specs/2026-08-19-game-state-reducer-design.md`

## Global Constraints

- **Reducers are pure appliers, always.** No `Math.random()`, no `inform()`/`warn()`/`playSfx()`, no reading anything from closure — every `reduceBoard` case takes `(state, action)` and returns a new state, nothing else.
- **`players` is NOT migrating in this plan** (87 call sites across `App.tsx` — its own future plan). Every function this plan touches that also mutates `players` (`applySettlementPlacement`, `applyCityPlacement`, `applyPillage`, `applyDiplomacyRemoval`) keeps its existing direct `setPlayers(...)` call, unchanged, running alongside the new `dispatch`/`dispatchGameAction` call for the board-piece write. This is a deliberate, documented transitional state, not an oversight — comment it as such at each site.
- **Cross-domain writes stay independent, not coordinated.** The board-piece write (via the reducer) and the players write (via the old direct `setPlayers`) are two separate calls in the same function, each responsible for its own slice — exactly the `combineReducers` shape the spec describes, just with one side still living outside the reducer for now.
- **Side effects (banner text, sound) move to `describeBoardAction`, called by `dispatchGameAction` — never inside `reduceBoard` itself.** Verified against real code: `applySettlementPlacement`/`applyCityPlacement` call `playSfx('placement')`; `applyRoadPlacement` calls `playSfx('roadPlacement')`; `applyPillage` calls `inform(...)`; `applyDiplomacyRemoval` calls `inform(...)`. None of the 5 target functions call both — each migrated action needs exactly one of {sound, banner, neither}, never both.
- **Migration is atomic per piece of state.** Every real call site touching `settlements` or `roads` today gets migrated in this same plan — partially migrating a shared piece of state (some writers on the old `useState`, some on the new reducer) produces silent divergence. Confirmed complete list: `applySettlementPlacement`, `applyCityPlacement`, `applyRoadPlacement`, `applyPillage`, `applyDiplomacyRemoval`, `resetGame`, `restoreFromSnapshot` — no other function in `App.tsx` calls `setSettlements`/`setRoads`.
- **`GameState` only declares the domains actually built.** `GameState = { board: BoardState }` in this plan — not a placeholder shape for 7 other domains that don't exist yet. Later plans extend it by adding fields, mirroring the incremental migration itself.

---

## File Structure

| File | Responsibility |
|---|---|
| `catan-3d/src/game/reducers/board.ts` | `BoardState`, `initialBoardState`, `reduceBoard`, `describeBoardAction` (Tasks 1-6) |
| `catan-3d/src/game/reducers/board.test.ts` | Tests for the above |
| `catan-3d/src/game/gameState.ts` | `GameState`, `GameAction`, `reduceGame` (Task 6) |
| `catan-3d/src/App.tsx` | `useReducer` wiring, `dispatchGameAction`, migrated call sites (Tasks 7-13) |

---

### Task 1: `BoardState`, `reduceBoard` infrastructure, and the `BUILD_SETTLEMENT` case

**Files:**
- Create: `catan-3d/src/game/reducers/board.ts`
- Create: `catan-3d/src/game/reducers/board.test.ts`

**Interfaces:**
- Produces: `BoardState`, `initialBoardState: BoardState`, `BoardAction` (the board-relevant slice of the future `GameAction` union — starts with just `BUILD_SETTLEMENT`, grows one case per task), `reduceBoard(state: BoardState, action: BoardAction): BoardState`.

- [ ] **Step 1: Write the failing test**

Create `catan-3d/src/game/reducers/board.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { reduceBoard, initialBoardState } from './board'

describe('reduceBoard — BUILD_SETTLEMENT', () => {
  it('places a settlement at the given vertex, owned by the given player', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('does not mutate the input state', () => {
    const before = initialBoardState
    reduceBoard(before, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    expect(before.settlements).toEqual({})
  })

  it('leaves roads untouched', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    expect(result.roads).toEqual({})
  })
})

describe('reduceBoard — unrecognized action', () => {
  it('returns the same state reference unchanged', () => {
    // @ts-expect-error - deliberately testing an action type this reducer doesn't handle
    const result = reduceBoard(initialBoardState, { type: 'SOME_OTHER_ACTION' })
    expect(result).toBe(initialBoardState)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`
Expected: FAIL — `./board` module doesn't exist yet.

- [ ] **Step 3: Write the implementation**

Create `catan-3d/src/game/reducers/board.ts`:

```ts
import type { Building } from '../types'

export interface BoardState {
  settlements: Record<string, Building>
  roads: Record<string, number>
}

export const initialBoardState: BoardState = {
  settlements: {},
  roads: {},
}

export type BoardAction =
  | { type: 'BUILD_SETTLEMENT'; vertexId: string; playerId: number }

export function reduceBoard(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'BUILD_SETTLEMENT':
      return {
        ...state,
        settlements: { ...state.settlements, [action.vertexId]: { ownerId: action.playerId, type: 'settlement' } },
      }
    default:
      return state
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`
Expected: PASS — 4/4 tests (the `@ts-expect-error` test will need `BoardAction` to not yet be exhaustively `never`-checked in the `default` branch; this is intentional at this stage, since the union only has one member — do not add exhaustiveness checking yet, it'll make sense once there are multiple cases in Task 5).

- [ ] **Step 5: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/game/reducers/board.ts src/game/reducers/board.test.ts`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/reducers/board.test.ts
git commit -m "feat: add BoardState reducer with BUILD_SETTLEMENT case"
```

---

### Task 2: `reduceBoard`'s `BUILD_CITY` case

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/game/reducers/board.test.ts`

**Interfaces:**
- Consumes: `BoardState`, `BoardAction`, `reduceBoard` (Task 1).
- Produces: `BoardAction` gains a `BUILD_CITY` member; `reduceBoard` gains its case.

- [ ] **Step 1: Write the failing test**

Add to `catan-3d/src/game/reducers/board.test.ts`:

```ts
describe('reduceBoard — BUILD_CITY', () => {
  it('upgrades the vertex to a city, owned by the given player', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 })
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'city' })
  })

  it('overwrites an existing settlement at that vertex', () => {
    const withSettlement = reduceBoard(initialBoardState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    const result = reduceBoard(withSettlement, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 })
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'city' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`
Expected: FAIL — `BUILD_CITY` isn't a recognized action type yet.

- [ ] **Step 3: Write the implementation**

In `catan-3d/src/game/reducers/board.ts`, extend `BoardAction` and `reduceBoard`:

```ts
export type BoardAction =
  | { type: 'BUILD_SETTLEMENT'; vertexId: string; playerId: number }
  | { type: 'BUILD_CITY'; vertexId: string; playerId: number }

export function reduceBoard(state: BoardState, action: BoardAction): BoardState {
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
    default:
      return state
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/game/reducers/board.ts src/game/reducers/board.test.ts`

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/reducers/board.test.ts
git commit -m "feat: add BUILD_CITY case to BoardState reducer"
```

---

### Task 3: `reduceBoard`'s `BUILD_ROAD` case

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/game/reducers/board.test.ts`

**Interfaces:**
- Consumes: `BoardState`, `BoardAction`, `reduceBoard` (Tasks 1-2).
- Produces: `BoardAction` gains `BUILD_ROAD`; `reduceBoard` gains its case.

- [ ] **Step 1: Write the failing test**

```ts
describe('reduceBoard — BUILD_ROAD', () => {
  it('places a road at the given edge, owned by the given player', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1 })
    expect(result.roads['E1']).toBe(1)
  })

  it('leaves settlements untouched', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1 })
    expect(result.settlements).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`

- [ ] **Step 3: Write the implementation**

```ts
export type BoardAction =
  | { type: 'BUILD_SETTLEMENT'; vertexId: string; playerId: number }
  | { type: 'BUILD_CITY'; vertexId: string; playerId: number }
  | { type: 'BUILD_ROAD'; edgeId: string; playerId: number }

// ...add to the switch:
    case 'BUILD_ROAD':
      return { ...state, roads: { ...state.roads, [action.edgeId]: action.playerId } }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`

- [ ] **Step 5: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/game/reducers/board.ts src/game/reducers/board.test.ts`

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/reducers/board.test.ts
git commit -m "feat: add BUILD_ROAD case to BoardState reducer"
```

---

### Task 4: `reduceBoard`'s `PILLAGE_CITY` case

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/game/reducers/board.test.ts`

**Interfaces:**
- Consumes: `BoardState`, `BoardAction`, `reduceBoard` (Tasks 1-3).
- Produces: `BoardAction` gains `PILLAGE_CITY`; `reduceBoard` gains its case.

This ports `applyPillage`'s existing idempotency guard (`App.tsx:1269-1270`: `if (!building || building.type !== 'city' || building.ownerId !== playerId) return`) into the reducer itself. This is NOT the same kind of "validation" the spec says belongs outside the reducer (that's about whether the ACTOR was authorized to dispatch this — a click-handler/receive-handler concern) — this guard is about whether the STATE TRANSITION still applies (has this vertex already been pillaged by an earlier, possibly-duplicate dispatch of the same action — the auto-skip effect, the timeout sweep, and a manual click can all race to target the same vertex). Reducers being idempotent under a duplicate dispatch of the same action is a correctness property of the reducer itself, not an authorization check — it belongs here.

- [ ] **Step 1: Write the failing test**

```ts
describe('reduceBoard — PILLAGE_CITY', () => {
  it('downgrades a city owned by the given player to a settlement', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 })
    const result = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 })
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('is a no-op if the vertex is not currently a city', () => {
    const withSettlement = reduceBoard(initialBoardState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    const result = reduceBoard(withSettlement, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 })
    expect(result).toBe(withSettlement) // same reference — genuinely unchanged
  })

  it('is a no-op if the vertex has no building at all', () => {
    const result = reduceBoard(initialBoardState, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 })
    expect(result).toBe(initialBoardState)
  })

  it('is a no-op if the city is owned by a different player', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 })
    const result = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 2 })
    expect(result).toBe(withCity)
  })

  it('is idempotent — dispatching the same pillage twice only changes the vertex once', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 })
    const first = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 })
    const second = reduceBoard(first, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 })
    expect(second).toBe(first)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`

- [ ] **Step 3: Write the implementation**

```ts
export type BoardAction =
  | { type: 'BUILD_SETTLEMENT'; vertexId: string; playerId: number }
  | { type: 'BUILD_CITY'; vertexId: string; playerId: number }
  | { type: 'BUILD_ROAD'; edgeId: string; playerId: number }
  | { type: 'PILLAGE_CITY'; vertexId: string; playerId: number }

// ...add to the switch:
    case 'PILLAGE_CITY': {
      const building = state.settlements[action.vertexId]
      if (!building || building.type !== 'city' || building.ownerId !== action.playerId) return state
      return {
        ...state,
        settlements: { ...state.settlements, [action.vertexId]: { ownerId: action.playerId, type: 'settlement' } },
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`
Expected: PASS — all 11 tests so far (4 + 2 + 2 + 5, minus the earlier "unrecognized action" one already counted).

- [ ] **Step 5: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/game/reducers/board.ts src/game/reducers/board.test.ts`

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/reducers/board.test.ts
git commit -m "feat: add PILLAGE_CITY case to BoardState reducer"
```

---

### Task 5: `reduceBoard`'s `REMOVE_ROAD` case (Diplomacy)

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/game/reducers/board.test.ts`

**Interfaces:**
- Consumes: `BoardState`, `BoardAction`, `reduceBoard` (Tasks 1-4).
- Produces: `BoardAction` gains `REMOVE_ROAD`; `reduceBoard` gains its case.

Ports `applyDiplomacyRemoval`'s road-removal (`App.tsx:3063-3067`: deletes the edge from `roads` entirely, not just reassigning it). This is the last real writer of `roads` — after this task, `reduceBoard` covers every mutation `settlements`/`roads` need (the migration will be complete once App.tsx's call sites are all switched over, Tasks 7-13).

- [ ] **Step 1: Write the failing test**

```ts
describe('reduceBoard — REMOVE_ROAD', () => {
  it('removes the road at the given edge entirely', () => {
    const withRoad = reduceBoard(initialBoardState, { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1 })
    const result = reduceBoard(withRoad, { type: 'REMOVE_ROAD', edgeId: 'E1' })
    expect(result.roads).not.toHaveProperty('E1')
  })

  it('is a no-op if the edge has no road', () => {
    const result = reduceBoard(initialBoardState, { type: 'REMOVE_ROAD', edgeId: 'E1' })
    expect(result).toBe(initialBoardState)
  })

  it('leaves other roads untouched', () => {
    let state = reduceBoard(initialBoardState, { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1 })
    state = reduceBoard(state, { type: 'BUILD_ROAD', edgeId: 'E2', playerId: 2 })
    const result = reduceBoard(state, { type: 'REMOVE_ROAD', edgeId: 'E1' })
    expect(result.roads['E2']).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`

- [ ] **Step 3: Write the implementation**

```ts
export type BoardAction =
  | { type: 'BUILD_SETTLEMENT'; vertexId: string; playerId: number }
  | { type: 'BUILD_CITY'; vertexId: string; playerId: number }
  | { type: 'BUILD_ROAD'; edgeId: string; playerId: number }
  | { type: 'PILLAGE_CITY'; vertexId: string; playerId: number }
  | { type: 'REMOVE_ROAD'; edgeId: string }

// ...add to the switch:
    case 'REMOVE_ROAD': {
      if (!(action.edgeId in state.roads)) return state
      const roads = { ...state.roads }
      delete roads[action.edgeId]
      return { ...state, roads }
    }
```

Note: unlike the other 4 cases, `REMOVE_ROAD` doesn't carry `playerId` — `applyDiplomacyRemoval`'s original signature takes `playerId`/`ownerId` only for the players-side effect (spending the Diplomacy card, crediting the road owner's supply) and the banner text, neither of which `reduceBoard` needs. Those stay in `App.tsx` as part of the transitional players-side handling in Task 12.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`
Expected: PASS — all tests so far.

- [ ] **Step 5: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/game/reducers/board.ts src/game/reducers/board.test.ts`

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/reducers/board.test.ts
git commit -m "feat: add REMOVE_ROAD case to BoardState reducer"
```

---

### Task 6: `describeBoardAction`, `GameState`/`GameAction`/`reduceGame`

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/game/reducers/board.test.ts`
- Create: `catan-3d/src/game/gameState.ts`
- Create: `catan-3d/src/game/gameState.test.ts`

**Interfaces:**
- Consumes: `BoardState`, `BoardAction`, `reduceBoard`, `initialBoardState` (Tasks 1-5); `Player` (for the `playerById`-shaped lookup `describeBoardAction` needs to turn a `playerId` into a name).
- Produces: `describeBoardAction(action, playerById): { message: string | null; sfx: string | null }`; `GameState`, `GameAction`, `reduceGame(state, action): GameState`.

Verified against real code (Explore research above) exactly what each migrated action needs:
- `BUILD_SETTLEMENT` / `BUILD_CITY`: `playSfx('placement')`, no banner.
- `BUILD_ROAD`: `playSfx('roadPlacement')`, no banner.
- `PILLAGE_CITY`: banner only (`inform`), no sound — `applyPillage` never calls `playSfx`.
- `REMOVE_ROAD`: banner only, no sound in this reducer's scope (the original `inform` text needs the actor's name and whether the removal was the actor's own road — `describeBoardAction` doesn't have that; Task 12 handles `REMOVE_ROAD`'s banner directly in `App.tsx` instead of through this function, since it needs `playerId`/`ownerId` context the action deliberately doesn't carry — see Task 5's note. `describeBoardAction` returns `null` for `REMOVE_ROAD`.)

- [ ] **Step 1: Write the failing test**

Add to `catan-3d/src/game/reducers/board.test.ts`:

```ts
import { describeBoardAction } from './board'
import { createInitialPlayers } from '../types'

describe('describeBoardAction', () => {
  const players = createInitialPlayers(2)
  const playerById = new Map(players.map((p) => [p.id, p]))

  it('BUILD_SETTLEMENT plays the placement sound, no banner', () => {
    const result = describeBoardAction({ type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: players[0].id }, playerById)
    expect(result.sfx).toBe('placement')
    expect(result.message).toBeNull()
  })

  it('BUILD_ROAD plays the road-placement sound, no banner', () => {
    const result = describeBoardAction({ type: 'BUILD_ROAD', edgeId: 'E1', playerId: players[0].id }, playerById)
    expect(result.sfx).toBe('roadPlacement')
    expect(result.message).toBeNull()
  })

  it('PILLAGE_CITY shows a banner naming the pillaged player, no sound', () => {
    const result = describeBoardAction({ type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, playerById)
    expect(result.message).toBe(`${players[0].name}'s city was pillaged and reduced to a settlement.`)
    expect(result.sfx).toBeNull()
  })

  it('REMOVE_ROAD has no board-level description (handled at the call site instead)', () => {
    const result = describeBoardAction({ type: 'REMOVE_ROAD', edgeId: 'E1' }, playerById)
    expect(result.message).toBeNull()
    expect(result.sfx).toBeNull()
  })
})
```

Create `catan-3d/src/game/gameState.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { reduceGame, initialGameState } from './gameState'

describe('reduceGame', () => {
  it('routes a board action through reduceBoard', () => {
    const result = reduceGame(initialGameState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    expect(result.board.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('does not mutate the input state', () => {
    const before = initialGameState
    reduceGame(before, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    expect(before.board.settlements).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts src/game/gameState.test.ts`
Expected: FAIL — `describeBoardAction` and `./gameState` don't exist yet.

- [ ] **Step 3: Write the implementation**

In `catan-3d/src/game/reducers/board.ts`, add:

```ts
import type { Building, Player } from '../types'

export function describeBoardAction(
  action: BoardAction,
  playerById: Map<number, Player>,
): { message: string | null; sfx: string | null } {
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
      return { message: null, sfx: null }
    default:
      return { message: null, sfx: null }
  }
}
```

Create `catan-3d/src/game/gameState.ts`:

```ts
import { reduceBoard, initialBoardState, type BoardState, type BoardAction } from './reducers/board'

export interface GameState {
  board: BoardState
}

export const initialGameState: GameState = {
  board: initialBoardState,
}

// Grows to a full discriminated union as more slices migrate — for now,
// every action this project has is board-relevant, so GameAction and
// BoardAction are the same shape. Aliased (not just `export type
// GameAction = BoardAction`) so call sites in App.tsx import from this
// file rather than reaching into game/reducers/board directly.
export type GameAction = BoardAction

export function reduceGame(state: GameState, action: GameAction): GameState {
  return {
    board: reduceBoard(state.board, action),
  }
}
```

Note on the design spec's `(sliceState, action, fullState)` sub-reducer signature: `reduceBoard` here is 2-arg (`state, action`), not 3. None of this plan's 5 board cases need to read another domain's state to do their own job — the third `fullState` parameter is deliberately NOT added yet, since an unused parameter today would be exactly the kind of speculative flexibility this project's own ponytail-audit discipline flags. Add it to a sub-reducer's signature (and `reduceGame`'s call site) only when the first real case that needs it exists — a future plan, not this one.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts src/game/gameState.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/game/reducers/board.ts src/game/reducers/board.test.ts src/game/gameState.ts src/game/gameState.test.ts`

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/reducers/board.test.ts catan-3d/src/game/gameState.ts catan-3d/src/game/gameState.test.ts
git commit -m "feat: add describeBoardAction and top-level GameState/GameAction/reduceGame"
```

---

### Task 7: Wire `useReducer` into `App.tsx`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `GameState`, `GameAction`, `reduceGame`, `initialGameState` (Task 6); `describeBoardAction` (Task 6, for the wrapper below).
- Produces: `gameState`, `dispatch`, `dispatchGameAction(action, isDeciding)` — nothing in `App.tsx` calls these yet (that starts in Task 8).

This task is purely mechanical: get the reducer live in the component tree, fully inert (nothing reads `gameState` or calls `dispatch` yet), so the next 6 tasks are each a small, focused migration rather than "wire everything up and migrate at the same time."

- [ ] **Step 1: Add the import and the hook**

Near the top of `App.tsx`, alongside the other imports from `./game/*`:

```tsx
import { reduceGame, initialGameState, type GameAction } from './game/gameState'
import { describeBoardAction } from './game/reducers/board'
```

Inside `function App() {`, near the other top-level state declarations:

```tsx
const [gameState, dispatch] = useReducer(reduceGame, initialGameState)
```

- [ ] **Step 2: Add the `dispatchGameAction` wrapper**

Near `inform`/`warn`/`playSfx`'s own declarations (so it can call them):

```tsx
// Every migrated action goes through this — never call dispatch(...) or
// broadcastX(...) directly for a GameAction. isDeciding: true for the
// client that decided the action (a local click, a resolved dice roll);
// false for a receiver applying an already-broadcast action — only the
// deciding client re-broadcasts, mirroring every other trusted-apply
// pattern in this file (see CONVENTIONS.md).
const dispatchGameAction = (action: GameAction, isDeciding: boolean) => {
  dispatch(action)
  const { message, sfx } = describeBoardAction(action, playerById)
  if (message) inform(message)
  if (sfx) playSfx(sfx)
  if (isDeciding && onlineInfo) broadcastGameAction(action)
}
```

`broadcastGameAction` doesn't exist yet — for THIS task, stub it as a no-op (Task 8 will add the real multiplayer wiring, following this plan's established per-action broadcast pattern rather than a new generic one, since `useRoomChannel.ts`'s wrapper-per-event structure isn't being unified in this plan — see the design spec's Out of Scope section):

```tsx
// Task 8 replaces this with real per-action broadcasting.
const broadcastGameAction = (action: GameAction) => {
  console.log('[Catan] dispatchGameAction stub — not yet broadcasting:', action)
}
```

- [ ] **Step 3: Typecheck and lint**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx`
Expected: clean. `gameState`/`dispatchGameAction` will be unused by anything except their own declarations until Task 8 — that's expected at this point.

- [ ] **Step 4: Manual verification**

Run the full test suite to confirm nothing existing broke: `cd catan-3d && npx vitest run`
Expected: PASS, same count as before this task (this change is additive and inert).

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: wire useReducer(reduceGame) into App.tsx"
```

---

### Task 8: Migrate `applySettlementPlacement`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `dispatchGameAction` (Task 7).

Current body (`App.tsx:867-888`):

```tsx
const applySettlementPlacement = (vertexId: string, playerId: number, isSetup: boolean) => {
  setSettlements((prev) => ({ ...prev, [vertexId]: { ownerId: playerId, type: 'settlement' } }))
  setRevealedTileIds((prev) => revealTilesForVertex(prev, vertexId, graph.vertexTileIds))
  setPlayers((prev) =>
    prev.map((p) =>
      p.id === playerId
        ? { ...p, resources: isSetup ? p.resources : deductCost(p.resources, SETTLEMENT_COST), settlementsRemaining: p.settlementsRemaining - 1 }
        : p,
    ),
  )
  if (isSetup) {
    const isSecondRound = setupStepIndex >= setupOrder.length / 2
    if (isSecondRound) grantResourcesForVertex(vertexId, playerId)
    setSetupSettlementVertexId(vertexId)
    setSetupStage('road')
  }
  playSfx('placement')
}
```

- [ ] **Step 1: Replace the board-piece write, remove the now-redundant `playSfx` call**

`dispatchGameAction` already fires `playSfx('placement')` via `describeBoardAction` — the function's own trailing `playSfx('placement')` call becomes a double-play if left in place. This function is called from 2 places (`App.tsx:2950` in `buildSettlementRaw`, and `App.tsx:1515`'s `onSettlementBuilt` receive handler) — `applySettlementPlacement` itself doesn't know which one called it, so it can't decide `isDeciding` on its own. Change its signature to accept that as a parameter:

```tsx
const applySettlementPlacement = (vertexId: string, playerId: number, isSetup: boolean, isDeciding: boolean) => {
  dispatchGameAction({ type: 'BUILD_SETTLEMENT', vertexId, playerId }, isDeciding)
  setRevealedTileIds((prev) => revealTilesForVertex(prev, vertexId, graph.vertexTileIds))
  // Players-side effect stays a direct setPlayers call — `players` isn't
  // migrated in this plan (87 call sites, its own future plan). This is a
  // deliberate transitional state: the board write above goes through the
  // reducer, this one doesn't yet, until players migrates.
  setPlayers((prev) =>
    prev.map((p) =>
      p.id === playerId
        ? { ...p, resources: isSetup ? p.resources : deductCost(p.resources, SETTLEMENT_COST), settlementsRemaining: p.settlementsRemaining - 1 }
        : p,
    ),
  )
  if (isSetup) {
    const isSecondRound = setupStepIndex >= setupOrder.length / 2
    if (isSecondRound) grantResourcesForVertex(vertexId, playerId)
    setSetupSettlementVertexId(vertexId)
    setSetupStage('road')
  }
}
```

- [ ] **Step 2: Update both call sites**

`App.tsx:2950` (local actor, inside `buildSettlementRaw`) — was `applySettlementPlacement(vertexId, player.id, isSetup)`, becomes:

```tsx
applySettlementPlacement(vertexId, player.id, isSetup, true)
```

`App.tsx:1515` (receive handler) — was `onSettlementBuilt: (payload) => applySettlementPlacement(payload.vertexId, payload.playerId, gamePhase === 'setup'),`, becomes:

```tsx
onSettlementBuilt: (payload) => applySettlementPlacement(payload.vertexId, payload.playerId, gamePhase === 'setup', false),
```

- [ ] **Step 3: Add real broadcasting to `dispatchGameAction`**

In Task 7's `broadcastGameAction` stub, add the real per-action-type dispatch to the existing `broadcastX` senders. This switch does NOT grow one case per task — only actions whose broadcast payload matches their `GameAction` shape exactly go through it generically (this task's `BUILD_SETTLEMENT` and Task 11's `PILLAGE_CITY` do; Tasks 9, 10, and 12 each hit a payload field their `GameAction` doesn't carry and broadcast directly instead, explained in each task's own steps):

```tsx
const broadcastGameAction = (action: GameAction) => {
  switch (action.type) {
    case 'BUILD_SETTLEMENT':
      broadcastSettlementBuilt({ vertexId: action.vertexId, playerId: action.playerId })
      break
    default:
      console.log('[Catan] dispatchGameAction — no broadcaster wired for:', action.type)
  }
}
```

- [ ] **Step 4: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx && npx vitest run`
Expected: all clean, same test count as Task 7 (no new automated tests for this task — it's App.tsx wiring, matching this project's existing test-coverage philosophy of pure logic being unit-tested and App.tsx wiring being manually verified).

- [ ] **Step 5: Manual verification**

Start the dev server (`cd catan-3d && npm run dev`), start a local Pass & Play game, place a settlement during setup and during normal play. Confirm: the settlement appears on the board, the placement sound plays exactly once (not twice), resources deduct correctly outside setup, setup-round bonus resources are still granted on the second round.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate applySettlementPlacement's board write to the reducer"
```

---

### Task 9: Migrate `applyCityPlacement`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `dispatchGameAction` (Task 7); the `BUILD_SETTLEMENT` broadcast-wiring pattern established in Task 8.

Current body (`App.tsx:894-909`):

```tsx
const applyCityPlacement = (vertexId: string, playerId: number, costOverride?: Partial<Resources>) => {
  setSettlements((prev) => ({ ...prev, [vertexId]: { ownerId: playerId, type: 'city' } }))
  setPlayers((prev) =>
    prev.map((p) =>
      p.id === playerId
        ? { ...p, resources: deductCost(p.resources, costOverride ?? CITY_COST), settlementsRemaining: p.settlementsRemaining + 1, citiesRemaining: p.citiesRemaining - 1 }
        : p,
    ),
  )
  playSfx('placement')
}
```

- [ ] **Step 1: Replace the board-piece write, remove the redundant `playSfx`, add `isDeciding`**

```tsx
const applyCityPlacement = (vertexId: string, playerId: number, isDeciding: boolean, costOverride?: Partial<Resources>) => {
  dispatchGameAction({ type: 'BUILD_CITY', vertexId, playerId }, isDeciding)
  // Players-side effect stays direct — see applySettlementPlacement's own
  // comment (Task 8) for why.
  setPlayers((prev) =>
    prev.map((p) =>
      p.id === playerId
        ? { ...p, resources: deductCost(p.resources, costOverride ?? CITY_COST), settlementsRemaining: p.settlementsRemaining + 1, citiesRemaining: p.citiesRemaining - 1 }
        : p,
    ),
  )
}
```

Note the parameter order: `isDeciding` is placed before the optional `costOverride` so `costOverride` can stay optional at the end of the signature.

- [ ] **Step 2: Update both call sites**

`App.tsx:2901` (local actor) — was `applyCityPlacement(vertexId, player.id, usingMedicine ? medicineCost : undefined)`, becomes:

```tsx
applyCityPlacement(vertexId, player.id, true, usingMedicine ? medicineCost : undefined)
```

`App.tsx:1531` (receive handler) — was `applyCityPlacement(payload.vertexId, payload.playerId, payload.costOverride)`, becomes:

```tsx
applyCityPlacement(payload.vertexId, payload.playerId, false, payload.costOverride)
```

- [ ] **Step 3: Add the `BUILD_CITY` case to `broadcastGameAction`**

```tsx
case 'BUILD_CITY':
  broadcastCityBuilt({ vertexId: action.vertexId, playerId: action.playerId })
  break
```

Note: this broadcast is missing `costOverride` — `BUILD_CITY`'s `GameAction` shape (from Task 2) doesn't carry it, since it's a `players`-domain concern (the discounted price), not a board-domain one. For this plan, `costOverride` isn't threaded through the dispatch path at all — the LOCAL actor's `applyCityPlacement` call still receives it directly (Step 1/2 above) and applies it to the direct `setPlayers` call, but the BROADCAST omits it, meaning a receiving client currently would NOT see Medicine's discount reflected — this is a real, known regression this task introduces and must fix before considering itself done.

- [ ] **Step 4: Fix the Medicine-discount broadcast gap**

`broadcastCityBuilt` (existing sender, unchanged signature — still takes `CityBuiltPayload` with its own `costOverride` field, per the Explore research) needs the real value, not just what's on `GameAction`. Call it directly with the extra field, bypassing `broadcastGameAction`'s generic dispatch for this one case — `dispatchGameAction` itself doesn't need to change; `applyCityPlacement` broadcasts `costOverride` itself, alongside (not instead of) the `dispatchGameAction` call:

```tsx
const applyCityPlacement = (vertexId: string, playerId: number, isDeciding: boolean, costOverride?: Partial<Resources>) => {
  dispatchGameAction({ type: 'BUILD_CITY', vertexId, playerId }, false) // false: broadcasting is handled explicitly below, not generically
  setPlayers((prev) =>
    prev.map((p) =>
      p.id === playerId
        ? { ...p, resources: deductCost(p.resources, costOverride ?? CITY_COST), settlementsRemaining: p.settlementsRemaining + 1, citiesRemaining: p.citiesRemaining - 1 }
        : p,
    ),
  )
  if (isDeciding && onlineInfo) broadcastCityBuilt({ vertexId, playerId, costOverride })
}
```

Remove the `BUILD_CITY` case from `broadcastGameAction` added in Step 3 — it's dead code now that `applyCityPlacement` broadcasts itself. This is a one-off exception (documented here, and with a comment at the call site) for the one migrated action that needs to broadcast a field its `GameAction` doesn't carry; `BUILD_SETTLEMENT`/`BUILD_ROAD`/`PILLAGE_CITY`/`REMOVE_ROAD` all broadcast generically through `broadcastGameAction` as designed.

- [ ] **Step 5: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx && npx vitest run`

- [ ] **Step 6: Manual verification**

Dev server: upgrade a settlement to a city, both with and without Medicine active (Cities & Knights on), in a 2-client online test if possible — confirm the second client sees the correct resource deduction either way, and the city appears correctly on both screens.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate applyCityPlacement's board write to the reducer"
```

---

### Task 10: Migrate `applyRoadPlacement`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `dispatchGameAction` (Task 7).

Current body (`App.tsx:911-946`):

```tsx
const applyRoadPlacement = (edgeId: string, playerId: number, isSetup: boolean, isFreeRoad: boolean) => {
  setRoads((prev) => ({ ...prev, [edgeId]: playerId }))
  setPlayers((prev) =>
    prev.map((p) =>
      p.id === playerId
        ? { ...p, resources: isSetup || isFreeRoad ? p.resources : deductCost(p.resources, ROAD_COST), roadsRemaining: p.roadsRemaining - 1 }
        : p,
    ),
  )
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
  playSfx('roadPlacement')
}
```

- [ ] **Step 1: Replace the board-piece write, remove the redundant `playSfx`, add `isDeciding`**

```tsx
const applyRoadPlacement = (edgeId: string, playerId: number, isSetup: boolean, isFreeRoad: boolean, isDeciding: boolean) => {
  dispatchGameAction({ type: 'BUILD_ROAD', edgeId, playerId }, isDeciding)
  // Players-side effect stays direct — see applySettlementPlacement's own
  // comment (Task 8).
  setPlayers((prev) =>
    prev.map((p) =>
      p.id === playerId
        ? { ...p, resources: isSetup || isFreeRoad ? p.resources : deductCost(p.resources, ROAD_COST), roadsRemaining: p.roadsRemaining - 1 }
        : p,
    ),
  )
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

- [ ] **Step 2: Update both call sites**

`App.tsx:3230` (local actor) — was `applyRoadPlacement(edgeId, player.id, isSetup, isFreeRoad)`, becomes:

```tsx
applyRoadPlacement(edgeId, player.id, isSetup, isFreeRoad, true)
```

`App.tsx:1533-1534` (receive handler) — was:
```tsx
onRoadBuilt: (payload) =>
  applyRoadPlacement(payload.edgeId, payload.playerId, gamePhase === 'setup', payload.isFreeRoad),
```
becomes:
```tsx
onRoadBuilt: (payload) =>
  applyRoadPlacement(payload.edgeId, payload.playerId, gamePhase === 'setup', payload.isFreeRoad, false),
```

- [ ] **Step 3: Add the `BUILD_ROAD` case to `broadcastGameAction`**

```tsx
case 'BUILD_ROAD':
  broadcastRoadBuilt({ edgeId: action.edgeId, playerId: action.playerId, isFreeRoad: /* see note below */ })
  break
```

Same gap as Task 9's `costOverride`: `RoadBuiltPayload` needs `isFreeRoad`, which `BUILD_ROAD`'s `GameAction` (Task 3) doesn't carry. Apply the same fix pattern: `applyRoadPlacement` broadcasts itself, `dispatchGameAction` is called with `isDeciding: false` so it never auto-broadcasts, and no `BUILD_ROAD` case is added to `broadcastGameAction`:

```tsx
const applyRoadPlacement = (edgeId: string, playerId: number, isSetup: boolean, isFreeRoad: boolean, isDeciding: boolean) => {
  dispatchGameAction({ type: 'BUILD_ROAD', edgeId, playerId }, false)
  setPlayers(/* unchanged from Step 1 */)
  if (isFreeRoad) setFreeRoadsRemaining((prev) => Math.max(0, prev - 1))
  if (isSetup) { /* unchanged from Step 1 */ }
  if (isDeciding && onlineInfo) broadcastRoadBuilt({ edgeId, playerId, isFreeRoad })
}
```

- [ ] **Step 4: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx && npx vitest run`

- [ ] **Step 5: Manual verification**

Dev server: place roads during setup (confirm turn/setup-stage advancement still works correctly, including the last setup road transitioning to `'playing'`), a normal paid road, and a free road (Road Building card or a setup road) — confirm `freeRoadsRemaining` decrements only for the free case.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate applyRoadPlacement's board write to the reducer"
```

---

### Task 11: Migrate `applyPillage`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `dispatchGameAction` (Task 7).

Current body (`App.tsx:1259-1298`) and its 3 call sites — `handlePillageTargetSelect` (`App.tsx:2479-2488`), the timeout-sweep `useEffect` (`App.tsx:3843-3857`), and `onPillageResolved` (`App.tsx:1564-1576`) — are reproduced in full in this plan's research phase; re-read them directly from `App.tsx` before starting, since this is the most-called-from-multiple-places migration in this plan (3 sites, not 2).

- [ ] **Step 1: Replace the board-piece write and idempotency guard, add `isDeciding`**

The idempotency guard (`if (!building || ...) return`) that used to live at the top of `applyPillage`, reading `settlements` from closure, now lives INSIDE `reduceBoard`'s `PILLAGE_CITY` case (Task 4) — it doesn't need to be checked twice for the board write. But the players-side effect (still direct, transitional) DOES still need its own guard, since it's not protected by the reducer's idempotency anymore — a duplicate call must not double-adjust `citiesRemaining`/`settlementsRemaining`/`cityWalls` even though the board write is now safely idempotent on its own:

```tsx
const applyPillage = (vertexId: string, playerId: number, isDeciding: boolean) => {
  // This check now duplicates reduceBoard's own PILLAGE_CITY guard — that's
  // intentional and temporary. The board write below is safe to call even
  // on a duplicate/racing invocation (the reducer no-ops), but the
  // players-side effect isn't protected by anything yet since `players`
  // isn't migrated — this guard is what keeps a duplicate call from
  // double-adjusting citiesRemaining/settlementsRemaining/cityWalls. Goes
  // away once `players` migrates and this whole players block becomes a
  // second reducer case instead of a raw setPlayers call.
  const building = settlements[vertexId]
  if (!building || building.type !== 'city' || building.ownerId !== playerId) return
  const owner = playerById.get(playerId)
  dispatchGameAction({ type: 'PILLAGE_CITY', vertexId, playerId }, isDeciding)
  setPlayers((prev) =>
    prev.map((p) =>
      p.id === playerId
        ? { ...p, cityWalls: p.cityWalls.filter((v) => v !== vertexId), citiesRemaining: p.citiesRemaining + 1, settlementsRemaining: Math.max(0, p.settlementsRemaining - 1) }
        : p,
    ),
  )
  // The inform() banner now fires via dispatchGameAction -> describeBoardAction
  // (Task 6) — do NOT call inform() here too, or the message doubles.
  setPillageQueue((prev) => prev.filter((t) => t.playerId !== playerId))
}
```

Note `owner` is now unused in this function body (it was only used for the `inform()` call this step removes) — delete the `const owner = playerById.get(playerId)` line entirely rather than leaving an unused variable; it's shown above only to make clear what's being removed relative to the original.

- [ ] **Step 2: Update all 3 call sites**

`App.tsx:2486` (`handlePillageTargetSelect`) — was `applyPillage(vertexId, current.playerId)`, becomes:

```tsx
applyPillage(vertexId, current.playerId, true)
```

`App.tsx:3850` (timeout-sweep effect) — was `applyPillage(vertexId, target.playerId)` — this one is also followed by its own `inform(...)` call for the timeout-specific message (`"...pillage choice timed out..."`), which is DIFFERENT from the ordinary pillage message and must stay:

```tsx
applyPillage(vertexId, target.playerId, true)
inform(`${playerById.get(target.playerId)?.name ?? 'A player'}'s pillage choice timed out — a city was chosen automatically.`)
```

(unchanged from before — this `inform` call was never inside `applyPillage`, it's a sibling call in the timeout effect itself, so it's unaffected by Step 1's removal of `applyPillage`'s OWN internal `inform` call.)

`App.tsx:1575` (`onPillageResolved`) — was `applyPillage(payload.vertexId, payload.playerId)`, becomes:

```tsx
applyPillage(payload.vertexId, payload.playerId, false)
```

- [ ] **Step 3: Add the `PILLAGE_CITY` case to `broadcastGameAction`**

`PillageResolvedPayload` (from the Explore research) is exactly `{ vertexId, playerId }` — no extra fields like Tasks 9-10 needed to work around. This one goes through the generic path cleanly:

```tsx
case 'PILLAGE_CITY':
  broadcastPillageResolved({ vertexId: action.vertexId, playerId: action.playerId })
  break
```

- [ ] **Step 4: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx && npx vitest run`

- [ ] **Step 5: Manual verification**

Dev server, Cities & Knights + Barbarians house rules on: trigger a barbarian attack the losing side loses, pillage a city via a direct click, confirm the banner shows exactly once (not zero, not twice) and the settlement/supply counters update correctly. If time allows, also test the timeout auto-resolve path (wait out `DISCARD_TIMEOUT_MS` on a pillage choice) and confirm its own distinct banner still fires correctly alongside the (now reducer-driven) pillage banner — expect to see BOTH messages, since they're two different `inform()` calls from two different places.

- [ ] **Step 6: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate applyPillage's board write to the reducer"
```

---

### Task 12: Migrate `applyDiplomacyRemoval`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `dispatchGameAction` (Task 7).

Current body (`App.tsx:3060-3091`):

```tsx
const applyDiplomacyRemoval = (playerId: number, edgeId: string, ownerId: number) => {
  const actor = playerById.get(playerId)
  const owner = playerById.get(ownerId)
  setRoads((prev) => {
    const next = { ...prev }
    delete next[edgeId]
    return next
  })
  setPlayers((prev) =>
    prev.map((p) => {
      if (p.id === playerId) return { ...p, progressCards: removeOne(p.progressCards, 'diplomacy') }
      if (p.id === ownerId && ownerId !== playerId) return { ...p, roadsRemaining: p.roadsRemaining + 1 }
      return p
    }),
  )
  if (ownerId === playerId) setFreeRoadsRemaining((prev) => prev + 1)
  if (actor) {
    inform(
      ownerId === playerId
        ? `${actor.name} played Diplomacy — removed their own road for a free rebuild.`
        : `${actor.name} played Diplomacy — removed ${owner?.name ?? "an opponent's"} road.`,
    )
  }
}
```

Recall from Task 5: `REMOVE_ROAD`'s `GameAction` shape only carries `edgeId` (no `playerId`/`ownerId`) — `describeBoardAction` (Task 6) returns `null`/`null` for it, since the actual banner text needs both the actor's name AND whether the removal targeted their own road, which the action deliberately doesn't carry (this reducer only needs `edgeId` to do its job — see Task 5's note). This function keeps its own `inform()` call for that reason — it's the one exception in this plan's migrated functions where the banner does NOT move into `describeBoardAction`.

- [ ] **Step 1: Replace the board-piece write, add `isDeciding`**

```tsx
const applyDiplomacyRemoval = (playerId: number, edgeId: string, ownerId: number, isDeciding: boolean) => {
  const actor = playerById.get(playerId)
  const owner = playerById.get(ownerId)
  dispatchGameAction({ type: 'REMOVE_ROAD', edgeId }, false) // false: this action's banner/broadcast needs playerId/ownerId context dispatchGameAction doesn't have — both handled explicitly below, same one-off exception as BUILD_CITY/BUILD_ROAD (Tasks 9-10)
  setPlayers((prev) =>
    prev.map((p) => {
      if (p.id === playerId) return { ...p, progressCards: removeOne(p.progressCards, 'diplomacy') }
      if (p.id === ownerId && ownerId !== playerId) return { ...p, roadsRemaining: p.roadsRemaining + 1 }
      return p
    }),
  )
  if (ownerId === playerId) setFreeRoadsRemaining((prev) => prev + 1)
  if (actor) {
    inform(
      ownerId === playerId
        ? `${actor.name} played Diplomacy — removed their own road for a free rebuild.`
        : `${actor.name} played Diplomacy — removed ${owner?.name ?? "an opponent's"} road.`,
    )
  }
  if (isDeciding && onlineInfo) broadcastDiplomacyPlayed({ playerId, edgeId, ownerId })
}
```

- [ ] **Step 2: Update both call sites**

`App.tsx:3109` (local actor, in `playDiplomacy`) — was:
```tsx
applyDiplomacyRemoval(player.id, edgeId, ownerId)
setPendingDiplomacyRemoval(null)
if (onlineInfo) broadcastDiplomacyPlayed({ playerId: player.id, edgeId, ownerId })
```
becomes (the broadcast call moves INTO `applyDiplomacyRemoval` per Step 1, so it's removed here to avoid double-broadcasting):
```tsx
applyDiplomacyRemoval(player.id, edgeId, ownerId, true)
setPendingDiplomacyRemoval(null)
```

`App.tsx:2021` (`onDiplomacyPlayed` receive handler) — was `applyDiplomacyRemoval(payload.playerId, payload.edgeId, payload.ownerId)`, becomes:
```tsx
applyDiplomacyRemoval(payload.playerId, payload.edgeId, payload.ownerId, false)
```

- [ ] **Step 3: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx && npx vitest run`

- [ ] **Step 4: Manual verification**

Dev server, Cities & Knights on: play the Diplomacy progress card, remove an opponent's road (confirm it disappears from the board, their `roadsRemaining` credits back, correct banner text) and remove your own road (confirm the free-rebuild counter increments, correct banner text).

- [ ] **Step 5: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate applyDiplomacyRemoval's board write to the reducer"
```

---

### Task 13: Migrate `resetGame` and `restoreFromSnapshot`

**Files:**
- Modify: `catan-3d/src/game/reducers/board.ts`
- Modify: `catan-3d/src/game/reducers/board.test.ts`
- Modify: `catan-3d/src/game/gameState.ts`
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `BoardState`, `reduceBoard`, `initialBoardState` (Tasks 1-5); `dispatch` (Task 7, the raw reducer dispatch — these 2 actions bypass `dispatchGameAction` entirely, see Step 3).

With this task, every real writer of `settlements`/`roads` in the codebase goes through `reduceBoard` — the migration is complete for these two fields.

- [ ] **Step 1: Add `RESET_BOARD` and `RESTORE_BOARD` cases (TDD)**

Add to `catan-3d/src/game/reducers/board.test.ts`:

```ts
describe('reduceBoard — RESET_BOARD', () => {
  it('clears settlements and roads back to empty', () => {
    let state = reduceBoard(initialBoardState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    state = reduceBoard(state, { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1 })
    const result = reduceBoard(state, { type: 'RESET_BOARD' })
    expect(result).toEqual(initialBoardState)
  })
})

describe('reduceBoard — RESTORE_BOARD', () => {
  it('replaces settlements and roads with the given snapshot values', () => {
    const settlements = { V1: { ownerId: 2, type: 'city' as const } }
    const roads = { E1: 2 }
    const result = reduceBoard(initialBoardState, { type: 'RESTORE_BOARD', settlements, roads })
    expect(result.settlements).toEqual(settlements)
    expect(result.roads).toEqual(roads)
  })
})
```

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`
Expected: FAIL.

In `catan-3d/src/game/reducers/board.ts`:

```ts
export type BoardAction =
  | { type: 'BUILD_SETTLEMENT'; vertexId: string; playerId: number }
  | { type: 'BUILD_CITY'; vertexId: string; playerId: number }
  | { type: 'BUILD_ROAD'; edgeId: string; playerId: number }
  | { type: 'PILLAGE_CITY'; vertexId: string; playerId: number }
  | { type: 'REMOVE_ROAD'; edgeId: string }
  | { type: 'RESET_BOARD' }
  | { type: 'RESTORE_BOARD'; settlements: Record<string, Building>; roads: Record<string, number> }

// ...add to the switch:
    case 'RESET_BOARD':
      return initialBoardState
    case 'RESTORE_BOARD':
      return { settlements: action.settlements, roads: action.roads }
```

Run: `cd catan-3d && npx vitest run src/game/reducers/board.test.ts`
Expected: PASS.

- [ ] **Step 2: Typecheck and lint the reducer files, commit**

Run: `cd catan-3d && npx tsc -b && npx eslint src/game/reducers/board.ts src/game/reducers/board.test.ts`

```bash
git add catan-3d/src/game/reducers/board.ts catan-3d/src/game/reducers/board.test.ts
git commit -m "feat: add RESET_BOARD and RESTORE_BOARD cases to BoardState reducer"
```

- [ ] **Step 3: Migrate `resetGame`'s and `restoreFromSnapshot`'s call sites**

Neither of these needs `dispatchGameAction` — they're not gameplay actions with a banner/sound/broadcast (the surrounding `resetGame`/`restoreFromSnapshot` functions already handle their own broadcasting and messaging as part of the larger reset/restore flow, unrelated to this plan). Call `dispatch` directly.

In `resetGame` (`App.tsx`, around the existing `setSettlements({})` / `setRoads({})` lines):

```tsx
// was: setSettlements({}); setRoads({})
dispatch({ type: 'RESET_BOARD' })
```

In `restoreFromSnapshot` (`App.tsx`, around the existing `setSettlements(snapshot.settlements)` / `setRoads(snapshot.roads)` lines):

```tsx
// was: setSettlements(snapshot.settlements); setRoads(snapshot.roads)
dispatch({ type: 'RESTORE_BOARD', settlements: snapshot.settlements, roads: snapshot.roads })
```

- [ ] **Step 4: Delete the now-dead `useState` declarations**

Every real writer of `settlements`/`roads` now goes through `reduceBoard` (Tasks 8-13 covered all 7: `applySettlementPlacement`, `applyCityPlacement`, `applyRoadPlacement`, `applyPillage`, `applyDiplomacyRemoval`, `resetGame`, `restoreFromSnapshot`). Delete the original declarations:

```tsx
// DELETE these two lines:
const [settlements, setSettlements] = useState<Record<string, Building>>({})
const [roads, setRoads] = useState<Record<string, number>>({})
```

Every remaining READ of `settlements`/`roads` elsewhere in `App.tsx` (there are many — rendering the board, computing legal moves, `playerById`-adjacent lookups, etc.) needs to change from the bare identifier to `gameState.board.settlements` / `gameState.board.roads`. Grep for `\bsettlements\b` and `\broads\b` across `App.tsx` after deleting the `useState` lines — `tsc -b` will surface every remaining reference as a compile error (undefined name), which is the authoritative list of read sites to update. Update every one to read from `gameState.board.*` instead.

- [ ] **Step 5: Typecheck, lint, full test suite**

Run: `cd catan-3d && npx tsc -b && npx eslint src/App.tsx && npx vitest run`
Expected: clean, full test count unchanged. The `tsc -b` step here is load-bearing, not just a formality — it's how Step 4's remaining read-site updates get found exhaustively.

- [ ] **Step 6: Manual verification**

Full playthrough: start a new game (confirms `resetGame`'s reducer path), play through setup and a few turns exercising every migrated action (settlement, city, road builds; if Cities & Knights + Barbarians is on, a pillage; if Diplomacy is available, a road removal), then refresh an online match mid-game to exercise `restoreFromSnapshot`'s reducer path. Confirm the board state is identical before and after refresh.

- [ ] **Step 7: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate resetGame/restoreFromSnapshot board resets, delete settlements/roads useState"
```

---

## After All Tasks

`settlements`/`roads` are now fully reducer-owned — the first complete slice of `GameState`. `players` (87 call sites) is the natural next plan, per the design spec's migration-order guidance: once it migrates, every transitional direct-`setPlayers`-call comment left by this plan (Tasks 8, 9, 10, 11, 12) collapses into a second reducer case for the same action, and the duplicate idempotency check in `applyPillage` (Task 11) goes away entirely. This plan's own execution skill (subagent-driven-development) runs its final whole-branch review, one fix wave if needed, and one scoped re-review — not re-derived here.
