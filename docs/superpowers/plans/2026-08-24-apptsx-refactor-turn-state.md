# App.tsx Reducer Refactor — Turn-State Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `App.tsx`'s 9 turn-flow `useState` fields (`currentPlayerIndex`, `gamePhase`, `setupStepIndex`, `setupStage`, `setupSettlementVertexId`, `devCardPlayedThisTurn`, `hasRolledThisTurn`, `totalRollsThisGame`, `consecutiveDoublesThisTurn`) into a new `TurnState` reducer slice, following the exact pattern already proven by the board and players slices.

**Architecture:** A new `game/reducers/turn.ts` defines `TurnState`/`TurnAction`/`reduceTurn`, wired into `GameState`/`GameAction`/`reduceGame` in `game/gameState.ts` exactly like `board.ts`/`players.ts` already are. `App.tsx`'s 9 `useState` declarations are each replaced in place with `const field = gameState.turn.field`, and every setter call site becomes a bare `dispatch({ type: '...' })` call — no new synchronization behavior, this is a storage relocation only.

**Tech Stack:** React 18 `useReducer`, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-24-apptsx-reducer-refactor-design.md` (this plan's own concrete `TurnState` design, worked out by reading the live code this session, supersedes that spec's own looser sketch of this slice — same relationship Sub-plan 2's queue-helper design had to its own spec sketch).

## Global Constraints

Copied verbatim from the master spec's own Global Constraints, plus this sub-plan's own two additions at the end:

- **Trusted-apply pattern (`CONVENTIONS.md` §1) is unchanged and non-negotiable.** One client decides a non-deterministic value, broadcasts it, every client — including the decider — applies the exact same decided result via a shared function, never re-deriving it. This refactor moves *where* that decided value lives (reducer instead of `useState`), never *how* it gets decided.
- **Composition pattern extends, doesn't change.** `GameState`/`GameAction` currently compose as `{ board: BoardState; players: Player[] }` / `BoardAction | PlayersAction`, with `reduceGame` running every sub-reducer against every action unconditionally (each ignores actions it doesn't own via its own switch's default case). This sub-plan follows the exact same shape: own file, own action-union member, one more line in `reduceGame`. No new composition mechanism.
- **The classification rule is the binding test for "does this state move."** For this sub-plan, all 9 fields were independently re-verified against it this session: `currentPlayerIndex` and `gamePhase` qualify via BOTH rule 1 (dual-write through the same shared trusted-apply functions called from the local-actor path and the broadcast-receiver path — e.g. `applyRoadPlacement`/`applyShipPlacement`'s isSetup branches, `applyRobberMove`/`applyPiratePlace`) AND rule 2 (both are turn-flow flags that gate which actions are legal — `gamePhase !== 'playing'` guards, `currentPlayerIndex` gates `isMyTurn`). The other 7 fields (`setupStepIndex`, `setupStage`, `setupSettlementVertexId`, `devCardPlayedThisTurn`, `hasRolledThisTurn`, `totalRollsThisGame`, `consecutiveDoublesThisTurn`) qualify via rule 1 alone: every one is written only inside the same shared trusted-apply functions (`applySettlementPlacement`/`applyRoadPlacement`/`applyShipPlacement`, `applyRollResult`, `applyTurnAdvance`) called identically by the local actor and every broadcast receiver, and all 7 already round-trip through `MatchSnapshot` for reconnect.
- **`npm run build` (not just `tsc`/`eslint`/`vitest`) is required before any task is reported done** — this project's own history has a real case of a broken Vite asset import that only `npm run build` caught.
- **Bare `npx tsc --noEmit` checks zero files on this project — never use it as a task's typecheck command.** `catan-3d/tsconfig.json` is solution-style (`"files": []` + project references), so it exits 0 unconditionally without checking anything. Every task below uses `npx tsc -p tsconfig.app.json` as the real per-task typecheck gate.
- **This sub-plan's own constraint 1: every `TurnState` action dispatches via bare `dispatch(...)`, never `dispatchGameAction`.** No banner/sfx/broadcast side effects are added anywhere by this migration — it relocates storage only, it never adds new synchronization. This matches `TURN_ADVANCED`'s own existing call site and `RESET_BOARD`/`RESTORE_BOARD`'s established bypass.
- **This sub-plan's own constraint 2: no combined `RESET_TURN`/`RESTORE_TURN` action.** Every call site inside `resetGame`/`restoreFromSnapshot` uses the exact same granular per-field action as every other call site for that field. Unlike `BoardState`'s `settlements`/`roads`/`ships` (`Record`/map types with no simpler granular reset), every `TurnState` field is a plain scalar/enum that already gets its own "set" action — there is no simpler-alternative reason to special-case a reset/restore action here, and none is added.

---

## Baseline (confirmed this session)

- `catan-3d/src/App.tsx` is currently 7503 lines.
- `npx vitest run` currently passes **428 tests across 17 files**, 0 failing. Every task's verify step expects this baseline plus whatever tests that task itself adds, 0 failing.
- `GamePhase`/`SetupStage` are currently declared at `App.tsx:126-127`:
  ```ts
  export type GamePhase = 'setup' | 'playing' | 'discard' | 'chooseRobberOrPirate' | 'moveRobber' | 'movePirate'
  export type SetupStage = 'settlement' | 'road'
  ```
- The two external import sites are:
  - `src/multiplayer/matchSnapshot.ts:4`: `import type { GamePhase, SetupStage } from '../App'`
  - `src/components/hud/GameHud.tsx:2`: `import type { BannerMessage, DevCardPickerMode, EventLogEntry, GamePhase, SetupStage } from '../../App'`

---

### Task 1: Create the `TurnState` reducer slice and wire it into `GameState`

**Files:**
- Create: `catan-3d/src/game/reducers/turn.ts`
- Create: `catan-3d/src/game/reducers/turn.test.ts`
- Modify: `catan-3d/src/game/gameState.ts` (whole file, currently 25 lines)
- Modify: `catan-3d/src/App.tsx:123-127` (remove local `GamePhase`/`SetupStage` type declarations, add import)
- Modify: `catan-3d/src/multiplayer/matchSnapshot.ts:4` (repoint import)
- Modify: `catan-3d/src/components/hud/GameHud.tsx:2` (split import)

**Interfaces:**
- Produces: `TurnState` interface, `initialTurnState`, `TurnAction` union (9 new members), `reduceTurn(state, action, fullState)`, `GamePhase`/`SetupStage` types (relocated, same literal unions), all exported from `game/reducers/turn.ts`. `GameState.turn: TurnState` and `GameAction` extended with `TurnAction`, both from `game/gameState.ts`. This task does NOT touch any of App.tsx's 9 `useState` declarations or their call sites — `gameState.turn` exists unused alongside them until Tasks 2-5.

- [ ] **Step 1: Write `game/reducers/turn.ts`**

```ts
import type { GameAction, GameState } from '../gameState'

export type GamePhase = 'setup' | 'playing' | 'discard' | 'chooseRobberOrPirate' | 'moveRobber' | 'movePirate'
export type SetupStage = 'settlement' | 'road'

export interface TurnState {
  currentPlayerIndex: number
  gamePhase: GamePhase
  setupStepIndex: number
  setupStage: SetupStage
  setupSettlementVertexId: string | null
  devCardPlayedThisTurn: boolean
  hasRolledThisTurn: boolean
  totalRollsThisGame: number
  consecutiveDoublesThisTurn: number
}

export const initialTurnState: TurnState = {
  currentPlayerIndex: 0,
  gamePhase: 'setup',
  setupStepIndex: 0,
  setupStage: 'settlement',
  setupSettlementVertexId: null,
  devCardPlayedThisTurn: false,
  hasRolledThisTurn: false,
  totalRollsThisGame: 0,
  consecutiveDoublesThisTurn: 0,
}

export type TurnAction =
  | { type: 'CURRENT_PLAYER_SET'; playerIndex: number }
  | { type: 'GAME_PHASE_SET'; phase: GamePhase }
  | { type: 'SETUP_STEP_SET'; stepIndex: number }
  | { type: 'SETUP_STAGE_SET'; stage: SetupStage }
  | { type: 'SETUP_SETTLEMENT_VERTEX_SET'; vertexId: string | null }
  | { type: 'DEV_CARD_PLAYED_THIS_TURN_SET'; played: boolean }
  | { type: 'HAS_ROLLED_THIS_TURN_SET'; rolled: boolean }
  | { type: 'TOTAL_ROLLS_INCREMENTED' }
  | { type: 'TOTAL_ROLLS_RESET' }
  | { type: 'TOTAL_ROLLS_SET'; count: number }
  | { type: 'CONSECUTIVE_DOUBLES_SET'; count: number }

export function reduceTurn(state: TurnState, action: GameAction, _fullState: GameState): TurnState {
  switch (action.type) {
    case 'CURRENT_PLAYER_SET':
      return { ...state, currentPlayerIndex: action.playerIndex }
    case 'GAME_PHASE_SET':
      return { ...state, gamePhase: action.phase }
    case 'SETUP_STEP_SET':
      return { ...state, setupStepIndex: action.stepIndex }
    case 'SETUP_STAGE_SET':
      return { ...state, setupStage: action.stage }
    case 'SETUP_SETTLEMENT_VERTEX_SET':
      return { ...state, setupSettlementVertexId: action.vertexId }
    case 'DEV_CARD_PLAYED_THIS_TURN_SET':
      return { ...state, devCardPlayedThisTurn: action.played }
    case 'HAS_ROLLED_THIS_TURN_SET':
      return { ...state, hasRolledThisTurn: action.rolled }
    case 'TOTAL_ROLLS_INCREMENTED':
      return { ...state, totalRollsThisGame: state.totalRollsThisGame + 1 }
    case 'TOTAL_ROLLS_RESET':
      return { ...state, totalRollsThisGame: 0 }
    case 'TOTAL_ROLLS_SET':
      return { ...state, totalRollsThisGame: action.count }
    case 'CONSECUTIVE_DOUBLES_SET':
      return { ...state, consecutiveDoublesThisTurn: action.count }
    case 'TURN_ADVANCED':
      return {
        ...state,
        currentPlayerIndex: action.nextPlayerIndex,
        hasRolledThisTurn: false,
        devCardPlayedThisTurn: false,
        consecutiveDoublesThisTurn: 0,
      }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full
      // GameAction union (every slice's actions), not just TurnAction, so
      // most of that union — including every board-only and players-only
      // action — is legitimately unhandled here. reduceTurn only owns the 11
      // dedicated cases above, plus TURN_ADVANCED (declared as a
      // PlayersAction member — see players.ts — and already handled by
      // reduceBoard and reducePlayers too; each slice applies its own share
      // of the same turn-advance effect to the same action).
      return state
  }
}
```

- [ ] **Step 2: Write `game/reducers/turn.test.ts`**

Matches `board.test.ts`'s exact conventions: `describe`/`it` per action, `initialGameState` as the `fullState` argument (unused by `reduceTurn` but required by its signature), `toEqual` spread-immutability checks.

```ts
import { describe, expect, it } from 'vitest'
import { reduceTurn, initialTurnState } from './turn'
import { initialGameState } from '../gameState'

describe('reduceTurn — CURRENT_PLAYER_SET', () => {
  it('sets currentPlayerIndex, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'CURRENT_PLAYER_SET', playerIndex: 2 }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, currentPlayerIndex: 2 })
  })
})

describe('reduceTurn — GAME_PHASE_SET', () => {
  it('sets gamePhase, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'GAME_PHASE_SET', phase: 'playing' }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, gamePhase: 'playing' })
  })
})

describe('reduceTurn — SETUP_STEP_SET', () => {
  it('sets setupStepIndex, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'SETUP_STEP_SET', stepIndex: 3 }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, setupStepIndex: 3 })
  })
})

describe('reduceTurn — SETUP_STAGE_SET', () => {
  it('sets setupStage, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'SETUP_STAGE_SET', stage: 'road' }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, setupStage: 'road' })
  })
})

describe('reduceTurn — SETUP_SETTLEMENT_VERTEX_SET', () => {
  it('sets setupSettlementVertexId, leaves every other field untouched', () => {
    const result = reduceTurn(
      initialTurnState,
      { type: 'SETUP_SETTLEMENT_VERTEX_SET', vertexId: 'V1' },
      initialGameState,
    )
    expect(result).toEqual({ ...initialTurnState, setupSettlementVertexId: 'V1' })
  })

  it('accepts null (clearing the vertex after a setup pairing completes)', () => {
    const dirty = { ...initialTurnState, setupSettlementVertexId: 'V1' }
    const result = reduceTurn(dirty, { type: 'SETUP_SETTLEMENT_VERTEX_SET', vertexId: null }, initialGameState)
    expect(result.setupSettlementVertexId).toBeNull()
  })
})

describe('reduceTurn — DEV_CARD_PLAYED_THIS_TURN_SET', () => {
  it('sets devCardPlayedThisTurn, leaves every other field untouched', () => {
    const result = reduceTurn(
      initialTurnState,
      { type: 'DEV_CARD_PLAYED_THIS_TURN_SET', played: true },
      initialGameState,
    )
    expect(result).toEqual({ ...initialTurnState, devCardPlayedThisTurn: true })
  })
})

describe('reduceTurn — HAS_ROLLED_THIS_TURN_SET', () => {
  it('sets hasRolledThisTurn, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'HAS_ROLLED_THIS_TURN_SET', rolled: true }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, hasRolledThisTurn: true })
  })
})

describe('reduceTurn — TOTAL_ROLLS_INCREMENTED', () => {
  it('increments totalRollsThisGame by 1 from 0, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'TOTAL_ROLLS_INCREMENTED' }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, totalRollsThisGame: 1 })
  })

  it('increments from a non-zero starting value', () => {
    const dirty = { ...initialTurnState, totalRollsThisGame: 5 }
    const result = reduceTurn(dirty, { type: 'TOTAL_ROLLS_INCREMENTED' }, initialGameState)
    expect(result.totalRollsThisGame).toBe(6)
  })
})

describe('reduceTurn — TOTAL_ROLLS_RESET', () => {
  it('resets totalRollsThisGame to 0, leaves every other field untouched', () => {
    const dirty = { ...initialTurnState, totalRollsThisGame: 7 }
    const result = reduceTurn(dirty, { type: 'TOTAL_ROLLS_RESET' }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, totalRollsThisGame: 0 })
  })
})

describe('reduceTurn — TOTAL_ROLLS_SET', () => {
  it('sets totalRollsThisGame to the given count, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'TOTAL_ROLLS_SET', count: 12 }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, totalRollsThisGame: 12 })
  })
})

describe('reduceTurn — CONSECUTIVE_DOUBLES_SET', () => {
  it('sets consecutiveDoublesThisTurn, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'CONSECUTIVE_DOUBLES_SET', count: 2 }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, consecutiveDoublesThisTurn: 2 })
  })
})

describe('reduceTurn — TURN_ADVANCED', () => {
  it('sets currentPlayerIndex and resets hasRolledThisTurn/devCardPlayedThisTurn/consecutiveDoublesThisTurn in one dispatch, leaves setup fields untouched', () => {
    const dirty = {
      ...initialTurnState,
      currentPlayerIndex: 0,
      hasRolledThisTurn: true,
      devCardPlayedThisTurn: true,
      consecutiveDoublesThisTurn: 2,
      setupStepIndex: 3,
    }
    const result = reduceTurn(dirty, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 }, initialGameState)
    expect(result).toEqual({
      ...dirty,
      currentPlayerIndex: 1,
      hasRolledThisTurn: false,
      devCardPlayedThisTurn: false,
      consecutiveDoublesThisTurn: 0,
    })
  })
})
```

- [ ] **Step 3: Run the new tests to verify they pass**

Run: `npx vitest run src/game/reducers/turn.test.ts`
Expected: PASS, 14 tests (12 `describe` blocks, `SETUP_SETTLEMENT_VERTEX_SET` and `TOTAL_ROLLS_INCREMENTED` each have 2 `it`s, the other 10 have 1 each).

- [ ] **Step 4: Wire `TurnState` into `game/gameState.ts`**

Find (`catan-3d/src/game/gameState.ts`, entire current file):
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

Replace with:
```ts
import { reduceBoard, initialBoardState, type BoardState, type BoardAction } from './reducers/board'
import { reducePlayers, type PlayersAction } from './reducers/players'
import { reduceTurn, initialTurnState, type TurnState, type TurnAction } from './reducers/turn'
import { createInitialPlayers, type Player } from './types'

export interface GameState {
  board: BoardState
  players: Player[]
  turn: TurnState
}

export const initialGameState: GameState = {
  board: initialBoardState,
  // Matches the default the old `useState(() => createInitialPlayers(3))`
  // used to seed with, before a real game (resetGame) replaces it.
  players: createInitialPlayers(3),
  turn: initialTurnState,
}

export type GameAction = BoardAction | PlayersAction | TurnAction

export function reduceGame(state: GameState, action: GameAction): GameState {
  return {
    board: reduceBoard(state.board, action, state),
    players: reducePlayers(state.players, action, state),
    turn: reduceTurn(state.turn, action, state),
  }
}
```

- [ ] **Step 5: Move `GamePhase`/`SetupStage` out of `App.tsx`**

Find (`App.tsx:123-127`):
```ts
import { reduceGame, initialGameState, type GameAction } from './game/gameState'
import { describeBoardAction } from './game/reducers/board'

export type GamePhase = 'setup' | 'playing' | 'discard' | 'chooseRobberOrPirate' | 'moveRobber' | 'movePirate'
export type SetupStage = 'settlement' | 'road'
export type DevCardPickerMode = 'yearOfPlenty' | 'monopoly' | 'resourceMonopolyProgress' | 'tradeMonopolyProgress'
```

Replace with:
```ts
import { reduceGame, initialGameState, type GameAction } from './game/gameState'
import { describeBoardAction } from './game/reducers/board'
import type { GamePhase, SetupStage } from './game/reducers/turn'

export type DevCardPickerMode = 'yearOfPlenty' | 'monopoly' | 'resourceMonopolyProgress' | 'tradeMonopolyProgress'
```

No re-export is added — this codebase's explicit convention is no backward-compatibility shims. Every existing bare read of `GamePhase`/`SetupStage` inside `App.tsx` itself keeps working unchanged since the imported type names are identical.

- [ ] **Step 6: Repoint `matchSnapshot.ts`'s import**

Find (`catan-3d/src/multiplayer/matchSnapshot.ts:4`):
```ts
import type { GamePhase, SetupStage } from '../App'
```

Replace with:
```ts
import type { GamePhase, SetupStage } from '../game/reducers/turn'
```

- [ ] **Step 7: Split `GameHud.tsx`'s import**

Find (`catan-3d/src/components/hud/GameHud.tsx:2`):
```ts
import type { BannerMessage, DevCardPickerMode, EventLogEntry, GamePhase, SetupStage } from '../../App'
```

Replace with:
```ts
import type { BannerMessage, DevCardPickerMode, EventLogEntry } from '../../App'
import type { GamePhase, SetupStage } from '../../game/reducers/turn'
```

Nothing else in `GameHud.tsx` changes — `GameHudProps`'s own `gamePhase: GamePhase`/`setupStage: SetupStage` fields (lines 98-99) keep working unchanged since the imported type names are identical.

- [ ] **Step 8: Run full verification**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors.

Run: `npx eslint src`
Expected: no errors.

Run: `npx vitest run`
Expected: 442 passing (428 baseline + 14 new), 0 failing.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 9: Commit**

```bash
git add catan-3d/src/game/reducers/turn.ts catan-3d/src/game/reducers/turn.test.ts catan-3d/src/game/gameState.ts catan-3d/src/App.tsx catan-3d/src/multiplayer/matchSnapshot.ts catan-3d/src/components/hud/GameHud.tsx
git commit -m "feat: add TurnState reducer slice, relocate GamePhase/SetupStage into it"
```

---

### Task 2: Migrate `currentPlayerIndex`

**Files:**
- Modify: `catan-3d/src/App.tsx` (declaration at line 346; call sites at lines 931, 1009, 1014, 1035, 1040, 6430, 6634 as currently read — locate each by the exact code shown below, not by trusting these line numbers verbatim, since Task 1's edits shift some of them slightly)

**Interfaces:**
- Consumes: `gameState.turn.currentPlayerIndex` and the `CURRENT_PLAYER_SET`/`TURN_ADVANCED` `TurnAction` members from Task 1.
- Produces: nothing new consumed by later tasks — `currentPlayerIndex` stays the same bare identifier for every downstream read (`players[currentPlayerIndex]`, `isMyTurn` checks, etc.), which are NOT enumerated or touched by this task.

- [ ] **Step 1: Replace the declaration**

Find (`App.tsx:346`):
```ts
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0)
```

Replace with:
```ts
  const currentPlayerIndex = gameState.turn.currentPlayerIndex
```

- [ ] **Step 2: Delete the redundant call in `applyTurnAdvance` (do NOT convert to a dispatch)**

`applyTurnAdvance` already dispatches `TURN_ADVANCED` immediately above this line, and Task 1's `reduceTurn` already handles `TURN_ADVANCED` by setting `currentPlayerIndex` itself. Converting this line to a second dispatch would fire two `CURRENT_PLAYER_SET`-equivalent updates for one turn advance — delete it outright.

Find (`App.tsx`, inside `applyTurnAdvance`, currently around line 929-931):
```ts
    setKnightsPromotedThisTurn(new Set())
    dispatch({ type: 'TURN_ADVANCED', nextPlayerIndex: nextIndex })
    setCurrentPlayerIndex(nextIndex)
```

Replace with:
```ts
    setKnightsPromotedThisTurn(new Set())
    dispatch({ type: 'TURN_ADVANCED', nextPlayerIndex: nextIndex })
```

- [ ] **Step 3: Convert the 2 call sites inside `applyRoadPlacement`'s isSetup branch**

Find (`App.tsx`, inside `applyRoadPlacement`, currently around lines 999-1017):
```ts
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      // This step's settlement/road pairing is complete — don't let the
      // vertex linger into the next step.
      setSetupSettlementVertexId(null)
      if (nextStepIndex >= setupOrder.length) {
        setGamePhase('playing')
        // The snake's starting seat (setupOrder[0], randomized in resetGame)
        // takes the first REAL turn too, same as standard Catan rules —
        // whoever placed first also rolls first.
        setCurrentPlayerIndex(setupOrder[0])
        setSetupStepIndex(0)
        setSetupStage('settlement')
      } else {
        setSetupStepIndex(nextStepIndex)
        setCurrentPlayerIndex(setupOrder[nextStepIndex])
        setSetupStage('settlement')
      }
    }
```

Replace with:
```ts
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      // This step's settlement/road pairing is complete — don't let the
      // vertex linger into the next step.
      setSetupSettlementVertexId(null)
      if (nextStepIndex >= setupOrder.length) {
        setGamePhase('playing')
        // The snake's starting seat (setupOrder[0], randomized in resetGame)
        // takes the first REAL turn too, same as standard Catan rules —
        // whoever placed first also rolls first.
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[0] })
        setSetupStepIndex(0)
        setSetupStage('settlement')
      } else {
        setSetupStepIndex(nextStepIndex)
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[nextStepIndex] })
        setSetupStage('settlement')
      }
    }
```

- [ ] **Step 4: Convert the 2 call sites inside `applyShipPlacement`'s isSetup branch**

Find (`App.tsx`, inside `applyShipPlacement`, currently around lines 1030-1043):
```ts
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
```

Replace with:
```ts
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      setSetupSettlementVertexId(null)
      if (nextStepIndex >= setupOrder.length) {
        setGamePhase('playing')
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[0] })
        setSetupStepIndex(0)
        setSetupStage('settlement')
      } else {
        setSetupStepIndex(nextStepIndex)
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[nextStepIndex] })
        setSetupStage('settlement')
      }
    }
```

(This block is a deliberate verbatim duplicate of `applyRoadPlacement`'s own isSetup block per the file's own existing comment just above it — not a shared helper. Keep the two migrations independent, matching that precedent.)

- [ ] **Step 5: Convert the call site in `resetGame`**

Find (`App.tsx`, inside `resetGame`, currently around line 6430):
```ts
    setCurrentPlayerIndex(freshStartingPlayerIndex)
```

Replace with:
```ts
    dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: freshStartingPlayerIndex })
```

- [ ] **Step 6: Convert the call site in `restoreFromSnapshot`**

Find (`App.tsx`, inside `restoreFromSnapshot`, currently around line 6634):
```ts
    setCurrentPlayerIndex(snapshot.currentPlayerIndex)
```

Replace with:
```ts
    dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: snapshot.currentPlayerIndex })
```

- [ ] **Step 7: Run full verification**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors.

Run: `npx eslint src`
Expected: no errors.

Run: `npx vitest run`
Expected: 442 passing, 0 failing (this task adds no new tests — pure call-site migration).

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate currentPlayerIndex to gameState.turn via CURRENT_PLAYER_SET/TURN_ADVANCED"
```

---

### Task 3: Migrate `gamePhase`

**Files:**
- Modify: `catan-3d/src/App.tsx` (declaration at line 511; 20 call sites currently spread across `applyRoadPlacement`, `applyShipPlacement`, `applyRobberMove`, `applyPiratePlace`, `applyKnightPlay`, `applyDiscard`, a discard self-heal `useEffect`, `applyRollResult`, `applyTaxationResolved`, `chooseRobber`, `choosePirate`, `armChaseRobber`, `armChasePirate`, `armTaxation`, `resetGame`, `restoreFromSnapshot`)

**Interfaces:**
- Consumes: `gameState.turn.gamePhase` and the `GAME_PHASE_SET` `TurnAction` member from Task 1. Runs after Task 2 — the `applyRoadPlacement`/`applyShipPlacement` blocks below already show Task 2's `CURRENT_PLAYER_SET` dispatch in place.
- Produces: nothing new consumed by later tasks — `gamePhase` stays the same bare identifier for every downstream read (`gamePhase === 'playing'`, `canInteract` checks, etc.), NOT enumerated or touched by this task. No deletions in this task (unlike Task 2, no other action already covers any `gamePhase` transition).

- [ ] **Step 1: Replace the declaration**

Find (`App.tsx:511`):
```ts
  const [gamePhase, setGamePhase] = useState<GamePhase>('setup')
```

Replace with:
```ts
  const gamePhase = gameState.turn.gamePhase
```

- [ ] **Step 2: Convert the call site inside `applyRoadPlacement`'s isSetup branch**

Find (`App.tsx`, inside `applyRoadPlacement`, post-Task-2 state):
```ts
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      // This step's settlement/road pairing is complete — don't let the
      // vertex linger into the next step.
      setSetupSettlementVertexId(null)
      if (nextStepIndex >= setupOrder.length) {
        setGamePhase('playing')
        // The snake's starting seat (setupOrder[0], randomized in resetGame)
        // takes the first REAL turn too, same as standard Catan rules —
        // whoever placed first also rolls first.
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[0] })
        setSetupStepIndex(0)
        setSetupStage('settlement')
      } else {
        setSetupStepIndex(nextStepIndex)
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[nextStepIndex] })
        setSetupStage('settlement')
      }
    }
```

Replace with:
```ts
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      // This step's settlement/road pairing is complete — don't let the
      // vertex linger into the next step.
      setSetupSettlementVertexId(null)
      if (nextStepIndex >= setupOrder.length) {
        dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
        // The snake's starting seat (setupOrder[0], randomized in resetGame)
        // takes the first REAL turn too, same as standard Catan rules —
        // whoever placed first also rolls first.
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[0] })
        setSetupStepIndex(0)
        setSetupStage('settlement')
      } else {
        setSetupStepIndex(nextStepIndex)
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[nextStepIndex] })
        setSetupStage('settlement')
      }
    }
```

- [ ] **Step 3: Convert the call site inside `applyShipPlacement`'s isSetup branch**

Find (`App.tsx`, inside `applyShipPlacement`, post-Task-2 state):
```ts
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      setSetupSettlementVertexId(null)
      if (nextStepIndex >= setupOrder.length) {
        setGamePhase('playing')
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[0] })
        setSetupStepIndex(0)
        setSetupStage('settlement')
      } else {
        setSetupStepIndex(nextStepIndex)
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[nextStepIndex] })
        setSetupStage('settlement')
      }
    }
```

Replace with:
```ts
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      setSetupSettlementVertexId(null)
      if (nextStepIndex >= setupOrder.length) {
        dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[0] })
        setSetupStepIndex(0)
        setSetupStage('settlement')
      } else {
        setSetupStepIndex(nextStepIndex)
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[nextStepIndex] })
        setSetupStage('settlement')
      }
    }
```

- [ ] **Step 4: Convert the call site at the tail of `applyRobberMove`**

Find (`App.tsx`, inside `applyRobberMove`, currently around line 1085-1091):
```ts
    const tile = tileById.get(tileId)
    if (tile) inform(`The Robber moves to ${BIOME_LABELS[tile.biome]}.${stealNote}`)
    // Never ends the turn here, whether this came from a natural 7 or a
    // Knight card — turn advancement only ever happens via the explicit
    // End Turn button. Control simply returns to the mover's active turn.
    setGamePhase('playing')
  }
```

Replace with:
```ts
    const tile = tileById.get(tileId)
    if (tile) inform(`The Robber moves to ${BIOME_LABELS[tile.biome]}.${stealNote}`)
    // Never ends the turn here, whether this came from a natural 7 or a
    // Knight card — turn advancement only ever happens via the explicit
    // End Turn button. Control simply returns to the mover's active turn.
    dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
  }
```

- [ ] **Step 5: Convert the call site at the tail of `applyPiratePlace`**

Find (`App.tsx`, inside `applyPiratePlace`, currently around lines 1124-1131):
```ts
    if (tileId != null) {
      const tile = tileById.get(tileId)
      if (tile) inform(`The Pirate moves to ${BIOME_LABELS[tile.biome]}.${stealNote}`)
    } else {
      inform('The Pirate returns to the frame.')
    }
    setGamePhase('playing')
  }
```

Replace with:
```ts
    if (tileId != null) {
      const tile = tileById.get(tileId)
      if (tile) inform(`The Pirate moves to ${BIOME_LABELS[tile.biome]}.${stealNote}`)
    } else {
      inform('The Pirate returns to the frame.')
    }
    dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
  }
```

- [ ] **Step 6: Convert the call site in `applyKnightPlay`**

Find (`App.tsx`, currently around lines 1196-1207):
```ts
  const applyKnightPlay = (playerId: number) => {
    spendDevCard(playerId, 'knight')
    const player = playerById.get(playerId)
    if (player) {
      inform(
        boardHasSeaTile
          ? `${player.name} played a Knight! Choose the Robber or the Pirate.`
          : `${player.name} played a Knight! Move the Robber.`,
      )
    }
    setGamePhase('chooseRobberOrPirate')
  }
```

Replace with:
```ts
  const applyKnightPlay = (playerId: number) => {
    spendDevCard(playerId, 'knight')
    const player = playerById.get(playerId)
    if (player) {
      inform(
        boardHasSeaTile
          ? `${player.name} played a Knight! Choose the Robber or the Pirate.`
          : `${player.name} played a Knight! Move the Robber.`,
      )
    }
    dispatch({ type: 'GAME_PHASE_SET', phase: 'chooseRobberOrPirate' })
  }
```

- [ ] **Step 7: Convert the 2 call sites in `applyDiscard`**

Find (`App.tsx`, inside `applyDiscard`, currently around lines 1358-1365):
```ts
    if (remaining.length === 0) {
      if (!gameRules.citiesAndKnightsBarbarians || robberActive) {
        inform(boardHasSeaTile ? 'Discards resolved — choose the Robber or the Pirate.' : 'Discards resolved — move the Robber.')
        setGamePhase('chooseRobberOrPirate')
      } else {
        setGamePhase('playing')
      }
    }
```

Replace with:
```ts
    if (remaining.length === 0) {
      if (!gameRules.citiesAndKnightsBarbarians || robberActive) {
        inform(boardHasSeaTile ? 'Discards resolved — choose the Robber or the Pirate.' : 'Discards resolved — move the Robber.')
        dispatch({ type: 'GAME_PHASE_SET', phase: 'chooseRobberOrPirate' })
      } else {
        dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
      }
    }
```

- [ ] **Step 8: Convert the 2 call sites in the discard self-heal `useEffect`**

Find (`App.tsx`, currently around lines 2582-2601):
```ts
  useEffect(() => {
    if (gamePhase !== 'discard' || validDiscardPlayerIds.length > 0) return
    debugLog('discard self-heal fired', { discardPlayerIds })
    // The phase release rides along with the log instead of staying a
    // render-time adjustment: they are one step ("the queue self-healed, let
    // the phase go"), and splitting them would make the log unreachable —
    // a render-phase setState re-renders before effects flush, so an Effect
    // guarded on gamePhase === 'discard' would never see the discard phase.
    // Cities & Knights barbarian-track gate (Task 3) — same reasoning as
    // applyDiscard's queue-empty branch above: before the first barbarian
    // attack resolves, skip arming moveRobber and return straight to play.
    if (!gameRules.citiesAndKnightsBarbarians || robberActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      inform(boardHasSeaTile ? 'Discards resolved — choose the Robber or the Pirate.' : 'Discards resolved — move the Robber.')
      setGamePhase('chooseRobberOrPirate')
    } else {
      setGamePhase('playing')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inform is read fresh via closure (recreated every render); only gamePhase/validDiscardPlayerIds/discardPlayerIds/the barbarian rule/robberActive identity should re-run this self-heal.
  }, [gamePhase, validDiscardPlayerIds, discardPlayerIds, gameRules.citiesAndKnightsBarbarians, robberActive])
```

Replace with:
```ts
  useEffect(() => {
    if (gamePhase !== 'discard' || validDiscardPlayerIds.length > 0) return
    debugLog('discard self-heal fired', { discardPlayerIds })
    // The phase release rides along with the log instead of staying a
    // render-time adjustment: they are one step ("the queue self-healed, let
    // the phase go"), and splitting them would make the log unreachable —
    // a render-phase setState re-renders before effects flush, so an Effect
    // guarded on gamePhase === 'discard' would never see the discard phase.
    // Cities & Knights barbarian-track gate (Task 3) — same reasoning as
    // applyDiscard's queue-empty branch above: before the first barbarian
    // attack resolves, skip arming moveRobber and return straight to play.
    if (!gameRules.citiesAndKnightsBarbarians || robberActive) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      inform(boardHasSeaTile ? 'Discards resolved — choose the Robber or the Pirate.' : 'Discards resolved — move the Robber.')
      dispatch({ type: 'GAME_PHASE_SET', phase: 'chooseRobberOrPirate' })
    } else {
      dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- inform is read fresh via closure (recreated every render); only gamePhase/validDiscardPlayerIds/discardPlayerIds/the barbarian rule/robberActive identity should re-run this self-heal.
  }, [gamePhase, validDiscardPlayerIds, discardPlayerIds, gameRules.citiesAndKnightsBarbarians, robberActive])
```

- [ ] **Step 9: Convert the 3 call sites in `applyRollResult`'s 7-rolled branch**

Find (`App.tsx`, inside `applyRollResult`, currently around lines 3578-3604):
```ts
      if (isStillRollersTurn) {
        const handSizeOf = (p: Player) =>
          discardHandSize(p.resources, p.commodities, gameRules.citiesAndKnightsCommodities)
        const overLimitIds = players.filter((p) => handSizeOf(p) > playerDiscardThreshold(p)).map((p) => p.id)
        debugLog('7 rolled — discard check', {
          overLimitIds,
          resourceCounts: players.map((p) => ({ id: p.id, name: p.name, total: handSizeOf(p) })),
          consecutiveDoublesThisTurn,
          onlineLocalPlayerId: onlineInfo?.localPlayerId,
        })
        if (overLimitIds.length > 0) {
          setDiscardPlayerIds(overLimitIds)
          setDiscardSelection([])
          setGamePhase('discard')
          inform('Rolled 7 — players over their card limit must discard half.')
        } else if (!gameRules.citiesAndKnightsBarbarians || robberActive) {
          inform(boardHasSeaTile ? 'Rolled 7 — choose the Robber or the Pirate.' : 'Rolled 7 — move the Robber.')
          setGamePhase('chooseRobberOrPirate')
        } else {
          // Cities & Knights barbarian-track gate (Task 3) — before the
          // first barbarian attack resolves, the robber stays inert: CN3087
          // p.7's "does not activate until after it has been placed on the
          // desert following the first barbarian attack." No robber move,
          // no steal — control returns straight to play.
          inform('Rolled 7 — the Robber has not activated yet.')
          setGamePhase('playing')
        }
      }
```

Replace with:
```ts
      if (isStillRollersTurn) {
        const handSizeOf = (p: Player) =>
          discardHandSize(p.resources, p.commodities, gameRules.citiesAndKnightsCommodities)
        const overLimitIds = players.filter((p) => handSizeOf(p) > playerDiscardThreshold(p)).map((p) => p.id)
        debugLog('7 rolled — discard check', {
          overLimitIds,
          resourceCounts: players.map((p) => ({ id: p.id, name: p.name, total: handSizeOf(p) })),
          consecutiveDoublesThisTurn,
          onlineLocalPlayerId: onlineInfo?.localPlayerId,
        })
        if (overLimitIds.length > 0) {
          setDiscardPlayerIds(overLimitIds)
          setDiscardSelection([])
          dispatch({ type: 'GAME_PHASE_SET', phase: 'discard' })
          inform('Rolled 7 — players over their card limit must discard half.')
        } else if (!gameRules.citiesAndKnightsBarbarians || robberActive) {
          inform(boardHasSeaTile ? 'Rolled 7 — choose the Robber or the Pirate.' : 'Rolled 7 — move the Robber.')
          dispatch({ type: 'GAME_PHASE_SET', phase: 'chooseRobberOrPirate' })
        } else {
          // Cities & Knights barbarian-track gate (Task 3) — before the
          // first barbarian attack resolves, the robber stays inert: CN3087
          // p.7's "does not activate until after it has been placed on the
          // desert following the first barbarian attack." No robber move,
          // no steal — control returns straight to play.
          inform('Rolled 7 — the Robber has not activated yet.')
          dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
        }
      }
```

- [ ] **Step 10: Convert the call site in `applyTaxationResolved`**

Find (`App.tsx`, inside `applyTaxationResolved`, currently around lines 4000-4007):
```ts
    playSfx('robber')
    dispatch({ type: 'TAXATION_RESOLVED', playerId, tileId, steals: safeSteals })
    const tile = tileById.get(tileId)
    const actor = playerById.get(playerId)
    if (tile && actor) inform(`${actor.name} played Taxation on ${BIOME_LABELS[tile.biome]}.`)
    setPendingTaxation(null)
    setGamePhase('playing')
    if (isDeciding && onlineInfo) broadcastTaxationResolved({ playerId, tileId, steals: safeSteals })
```

Replace with:
```ts
    playSfx('robber')
    dispatch({ type: 'TAXATION_RESOLVED', playerId, tileId, steals: safeSteals })
    const tile = tileById.get(tileId)
    const actor = playerById.get(playerId)
    if (tile && actor) inform(`${actor.name} played Taxation on ${BIOME_LABELS[tile.biome]}.`)
    setPendingTaxation(null)
    dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
    if (isDeciding && onlineInfo) broadcastTaxationResolved({ playerId, tileId, steals: safeSteals })
```

- [ ] **Step 11: Convert the call site in `chooseRobber`**

Find (`App.tsx`, currently around lines 4173-4177):
```ts
  const chooseRobber = () => {
    if (gamePhase !== 'chooseRobberOrPirate') return
    if (!isMyTurn) return
    setGamePhase('moveRobber')
  }
```

Replace with:
```ts
  const chooseRobber = () => {
    if (gamePhase !== 'chooseRobberOrPirate') return
    if (!isMyTurn) return
    dispatch({ type: 'GAME_PHASE_SET', phase: 'moveRobber' })
  }
```

- [ ] **Step 12: Convert the call site in `choosePirate`**

Find (`App.tsx`, currently around lines 4179-4192):
```ts
  const choosePirate = () => {
    if (gamePhase !== 'chooseRobberOrPirate') return
    if (!isMyTurn) return
    // Defense-in-depth mirror of the picker's own boardHasSeaTile gate below
    // (see boardHasSeaTile's own comment) — the Pirate button is hidden
    // whenever this would fire, but this keeps the invariant true even if
    // some other future entry point ever calls choosePirate directly.
    if (!boardHasSeaTile) {
      warn('There is no sea hex on this board — the Pirate cannot be placed.')
      return
    }
    inform('Choose a sea hex for the Pirate.')
    setGamePhase('movePirate')
  }
```

Replace with:
```ts
  const choosePirate = () => {
    if (gamePhase !== 'chooseRobberOrPirate') return
    if (!isMyTurn) return
    // Defense-in-depth mirror of the picker's own boardHasSeaTile gate below
    // (see boardHasSeaTile's own comment) — the Pirate button is hidden
    // whenever this would fire, but this keeps the invariant true even if
    // some other future entry point ever calls choosePirate directly.
    if (!boardHasSeaTile) {
      warn('There is no sea hex on this board — the Pirate cannot be placed.')
      return
    }
    inform('Choose a sea hex for the Pirate.')
    dispatch({ type: 'GAME_PHASE_SET', phase: 'movePirate' })
  }
```

- [ ] **Step 13: Convert the call site in `armChaseRobber`**

Find (`App.tsx`, inside `armChaseRobber`, currently around lines 5304-5311):
```ts
    const adjacentTileIds = new Set(graph.vertexTileIds.get(knight.vertexId) ?? [])
    if (!adjacentTileIds.has(gameState.board.robberTileId)) {
      warn('That knight is not next to the robber.')
      return
    }
    setChasingRobberKnightId(knightId)
    setGamePhase('moveRobber')
  }
```

Replace with:
```ts
    const adjacentTileIds = new Set(graph.vertexTileIds.get(knight.vertexId) ?? [])
    if (!adjacentTileIds.has(gameState.board.robberTileId)) {
      warn('That knight is not next to the robber.')
      return
    }
    setChasingRobberKnightId(knightId)
    dispatch({ type: 'GAME_PHASE_SET', phase: 'moveRobber' })
  }
```

- [ ] **Step 14: Convert the call site in `armChasePirate`**

Find (`App.tsx`, inside `armChasePirate`, currently around lines 5342-5349):
```ts
    const adjacentTileIds = new Set(graph.vertexTileIds.get(knight.vertexId) ?? [])
    if (!adjacentTileIds.has(gameState.board.pirateTileId)) {
      warn('That knight is not next to the pirate.')
      return
    }
    setChasingPirateKnightId(knightId)
    setGamePhase('movePirate')
  }
```

Replace with:
```ts
    const adjacentTileIds = new Set(graph.vertexTileIds.get(knight.vertexId) ?? [])
    if (!adjacentTileIds.has(gameState.board.pirateTileId)) {
      warn('That knight is not next to the pirate.')
      return
    }
    setChasingPirateKnightId(knightId)
    dispatch({ type: 'GAME_PHASE_SET', phase: 'movePirate' })
  }
```

- [ ] **Step 15: Convert the call site in `armTaxation`**

Find (`App.tsx`, inside `armTaxation`, currently around lines 6045-6055):
```ts
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('taxation')) {
      warn('No Taxation card to play.')
      return
    }
    dispatch({ type: 'TAXATION_ARMED', playerId: player.id })
    setPendingTaxation(player.id)
    setGamePhase('moveRobber')
    inform(`${player.name} played Taxation — choose a hex for the robber.`)
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'taxation' })
  }
```

Replace with:
```ts
    const player = players[currentPlayerIndex]
    if (!player.progressCards.includes('taxation')) {
      warn('No Taxation card to play.')
      return
    }
    dispatch({ type: 'TAXATION_ARMED', playerId: player.id })
    setPendingTaxation(player.id)
    dispatch({ type: 'GAME_PHASE_SET', phase: 'moveRobber' })
    inform(`${player.name} played Taxation — choose a hex for the robber.`)
    if (onlineInfo) broadcastProgressCardPlayed({ playerId: player.id, card: 'taxation' })
  }
```

- [ ] **Step 16: Convert the call site in `resetGame`**

Find (`App.tsx`, inside `resetGame`, currently around line 6541):
```ts
    setGamePhase('setup')
```

Replace with:
```ts
    dispatch({ type: 'GAME_PHASE_SET', phase: 'setup' })
```

- [ ] **Step 17: Convert the call site in `restoreFromSnapshot`**

Find (`App.tsx`, inside `restoreFromSnapshot`, currently around line 6635):
```ts
    setGamePhase(snapshot.gamePhase)
```

Replace with:
```ts
    dispatch({ type: 'GAME_PHASE_SET', phase: snapshot.gamePhase })
```

- [ ] **Step 18: Run full verification**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors.

Run: `npx eslint src`
Expected: no errors.

Run: `npx vitest run`
Expected: 442 passing, 0 failing.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 19: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate gamePhase to gameState.turn via GAME_PHASE_SET"
```

---

### Task 4: Migrate the setup-flow trio (`setupStepIndex`, `setupStage`, `setupSettlementVertexId`)

**Files:**
- Modify: `catan-3d/src/App.tsx` (3 declarations at lines 512-513, 517; call sites inside `applySettlementPlacement`, `applyRoadPlacement`, `applyShipPlacement`, `resetGame`, `restoreFromSnapshot`)

**Interfaces:**
- Consumes: `gameState.turn.setupStepIndex`/`setupStage`/`setupSettlementVertexId` and the `SETUP_STEP_SET`/`SETUP_STAGE_SET`/`SETUP_SETTLEMENT_VERTEX_SET` `TurnAction` members from Task 1. Runs after Tasks 2-3 — the `applyRoadPlacement`/`applyShipPlacement` blocks below show both prior tasks' dispatches already in place.
- Produces: nothing new consumed by later tasks. Reads of these 3 fields elsewhere (`setupStepIndex` used for step-index arithmetic in the same 3 apply functions, `setupStage` read as a build-order guard in `buildSettlementRaw`/`buildRoadRaw`/`buildShipRaw`, `setupSettlementVertexId` read for the "touches new settlement" edge check in `buildRoadRaw`/`buildShipRaw`) are left completely untouched — the destructured `const`s preserve them with zero changes needed.

- [ ] **Step 1: Replace the 3 declarations**

Find (`App.tsx:512-513, 517`):
```ts
  const [gamePhase, setGamePhase] = useState<GamePhase>('setup')
  const [setupStepIndex, setSetupStepIndex] = useState(0)
  const [setupStage, setSetupStage] = useState<SetupStage>('settlement')
  // The settlement placed during the current setup step. The free road that
  // follows it must touch this exact intersection — that pairing is what
  // makes the opening draft a real strategic choice.
  const [setupSettlementVertexId, setSetupSettlementVertexId] = useState<string | null>(null)
```

Note: `gamePhase`'s declaration line is already converted by Task 3 to `const gamePhase = gameState.turn.gamePhase` — this find block shows the pre-Task-3 line only so the surrounding context is unambiguous; locate the actual current line 511 area and change only the two `useState` lines for `setupStepIndex`/`setupStage`, plus line 517 for `setupSettlementVertexId`.

Find (`App.tsx`, post-Task-3, currently around lines 511-517):
```ts
  const gamePhase = gameState.turn.gamePhase
  const [setupStepIndex, setSetupStepIndex] = useState(0)
  const [setupStage, setSetupStage] = useState<SetupStage>('settlement')
  // The settlement placed during the current setup step. The free road that
  // follows it must touch this exact intersection — that pairing is what
  // makes the opening draft a real strategic choice.
  const [setupSettlementVertexId, setSetupSettlementVertexId] = useState<string | null>(null)
```

Replace with:
```ts
  const gamePhase = gameState.turn.gamePhase
  const setupStepIndex = gameState.turn.setupStepIndex
  const setupStage = gameState.turn.setupStage
  // The settlement placed during the current setup step. The free road that
  // follows it must touch this exact intersection — that pairing is what
  // makes the opening draft a real strategic choice.
  const setupSettlementVertexId = gameState.turn.setupSettlementVertexId
```

- [ ] **Step 2: Convert the 2 call sites in `applySettlementPlacement`'s isSetup branch**

Find (`App.tsx`, currently around lines 976-985):
```ts
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

Replace with:
```ts
  const applySettlementPlacement = (vertexId: string, playerId: number, isSetup: boolean, isDeciding: boolean) => {
    dispatchGameAction({ type: 'BUILD_SETTLEMENT', vertexId, playerId, isSetup }, isDeciding)
    setRevealedTileIds((prev) => revealTilesForVertex(prev, vertexId, graph.vertexTileIds))
    if (isSetup) {
      const isSecondRound = setupStepIndex >= setupOrder.length / 2
      if (isSecondRound) grantResourcesForVertex(vertexId, playerId)
      dispatch({ type: 'SETUP_SETTLEMENT_VERTEX_SET', vertexId })
      dispatch({ type: 'SETUP_STAGE_SET', stage: 'road' })
    }
  }
```

- [ ] **Step 3: Convert the setup trio's call sites inside `applyRoadPlacement`'s isSetup branch**

Find (`App.tsx`, inside `applyRoadPlacement`, post-Tasks-2-3 state):
```ts
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      // This step's settlement/road pairing is complete — don't let the
      // vertex linger into the next step.
      setSetupSettlementVertexId(null)
      if (nextStepIndex >= setupOrder.length) {
        dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
        // The snake's starting seat (setupOrder[0], randomized in resetGame)
        // takes the first REAL turn too, same as standard Catan rules —
        // whoever placed first also rolls first.
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[0] })
        setSetupStepIndex(0)
        setSetupStage('settlement')
      } else {
        setSetupStepIndex(nextStepIndex)
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[nextStepIndex] })
        setSetupStage('settlement')
      }
    }
```

Replace with:
```ts
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      // This step's settlement/road pairing is complete — don't let the
      // vertex linger into the next step.
      dispatch({ type: 'SETUP_SETTLEMENT_VERTEX_SET', vertexId: null })
      if (nextStepIndex >= setupOrder.length) {
        dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
        // The snake's starting seat (setupOrder[0], randomized in resetGame)
        // takes the first REAL turn too, same as standard Catan rules —
        // whoever placed first also rolls first.
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[0] })
        dispatch({ type: 'SETUP_STEP_SET', stepIndex: 0 })
        dispatch({ type: 'SETUP_STAGE_SET', stage: 'settlement' })
      } else {
        dispatch({ type: 'SETUP_STEP_SET', stepIndex: nextStepIndex })
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[nextStepIndex] })
        dispatch({ type: 'SETUP_STAGE_SET', stage: 'settlement' })
      }
    }
```

- [ ] **Step 4: Convert the setup trio's call sites inside `applyShipPlacement`'s isSetup branch**

Find (`App.tsx`, inside `applyShipPlacement`, post-Tasks-2-3 state):
```ts
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      setSetupSettlementVertexId(null)
      if (nextStepIndex >= setupOrder.length) {
        dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[0] })
        setSetupStepIndex(0)
        setSetupStage('settlement')
      } else {
        setSetupStepIndex(nextStepIndex)
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[nextStepIndex] })
        setSetupStage('settlement')
      }
    }
```

Replace with:
```ts
    if (isSetup) {
      const nextStepIndex = setupStepIndex + 1
      dispatch({ type: 'SETUP_SETTLEMENT_VERTEX_SET', vertexId: null })
      if (nextStepIndex >= setupOrder.length) {
        dispatch({ type: 'GAME_PHASE_SET', phase: 'playing' })
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[0] })
        dispatch({ type: 'SETUP_STEP_SET', stepIndex: 0 })
        dispatch({ type: 'SETUP_STAGE_SET', stage: 'settlement' })
      } else {
        dispatch({ type: 'SETUP_STEP_SET', stepIndex: nextStepIndex })
        dispatch({ type: 'CURRENT_PLAYER_SET', playerIndex: setupOrder[nextStepIndex] })
        dispatch({ type: 'SETUP_STAGE_SET', stage: 'settlement' })
      }
    }
```

- [ ] **Step 5: Convert the 3 call sites in `resetGame`**

Find (`App.tsx`, inside `resetGame`, currently around lines 6542-6544):
```ts
    setSetupStepIndex(0)
    setSetupStage('settlement')
    setSetupSettlementVertexId(null)
```

Replace with:
```ts
    dispatch({ type: 'SETUP_STEP_SET', stepIndex: 0 })
    dispatch({ type: 'SETUP_STAGE_SET', stage: 'settlement' })
    dispatch({ type: 'SETUP_SETTLEMENT_VERTEX_SET', vertexId: null })
```

- [ ] **Step 6: Convert the 3 call sites in `restoreFromSnapshot`**

Find (`App.tsx`, inside `restoreFromSnapshot`, currently around lines 6636-6638):
```ts
    setSetupStepIndex(snapshot.setupStepIndex)
    setSetupStage(snapshot.setupStage)
    setSetupSettlementVertexId(snapshot.setupSettlementVertexId)
```

Replace with:
```ts
    dispatch({ type: 'SETUP_STEP_SET', stepIndex: snapshot.setupStepIndex })
    dispatch({ type: 'SETUP_STAGE_SET', stage: snapshot.setupStage })
    dispatch({ type: 'SETUP_SETTLEMENT_VERTEX_SET', vertexId: snapshot.setupSettlementVertexId })
```

- [ ] **Step 7: Run full verification**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors.

Run: `npx eslint src`
Expected: no errors.

Run: `npx vitest run`
Expected: 442 passing, 0 failing.

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate setupStepIndex/setupStage/setupSettlementVertexId to gameState.turn"
```

---

### Task 5: Migrate the 4 per-turn counters (`devCardPlayedThisTurn`, `hasRolledThisTurn`, `totalRollsThisGame`, `consecutiveDoublesThisTurn`)

**Files:**
- Modify: `catan-3d/src/App.tsx` (declarations at lines 275, 281, 520, 525; call sites inside `applyTurnAdvance`, `applyRollResult`, `spendDevCard`, `resetGame`, `restoreFromSnapshot`)

**Interfaces:**
- Consumes: `gameState.turn.devCardPlayedThisTurn`/`hasRolledThisTurn`/`totalRollsThisGame`/`consecutiveDoublesThisTurn` and the `DEV_CARD_PLAYED_THIS_TURN_SET`/`HAS_ROLLED_THIS_TURN_SET`/`TOTAL_ROLLS_INCREMENTED`/`TOTAL_ROLLS_RESET`/`TOTAL_ROLLS_SET`/`CONSECUTIVE_DOUBLES_SET`/`TURN_ADVANCED` `TurnAction` members — all already declared in Task 1 (including `TOTAL_ROLLS_RESET`/`TOTAL_ROLLS_SET`, needed because plain `TOTAL_ROLLS_INCREMENTED` alone can't implement `resetGame`'s "reset to 0" or `restoreFromSnapshot`'s "set to an arbitrary snapshot value" below). This is the LAST task in this sub-plan.
- Produces: the completed `TurnState` migration — after this task, none of the 9 original fields has a `useState` declaration left anywhere in `App.tsx`.

- [ ] **Step 1: Replace the 4 declarations**

Find (`App.tsx:275`):
```ts
  const [totalRollsThisGame, setTotalRollsThisGame] = useState(0)
```

Replace with:
```ts
  const totalRollsThisGame = gameState.turn.totalRollsThisGame
```

Find (`App.tsx:281`):
```ts
  const [consecutiveDoublesThisTurn, setConsecutiveDoublesThisTurn] = useState(0)
```

Replace with:
```ts
  const consecutiveDoublesThisTurn = gameState.turn.consecutiveDoublesThisTurn
```

Find (`App.tsx`, post-Task-4, currently around line 520):
```ts
  const [devCardPlayedThisTurn, setDevCardPlayedThisTurn] = useState(false)
```

Replace with:
```ts
  const devCardPlayedThisTurn = gameState.turn.devCardPlayedThisTurn
```

Find (`App.tsx`, post-Task-4, currently around line 525):
```ts
  const [hasRolledThisTurn, setHasRolledThisTurn] = useState(false)
```

Replace with:
```ts
  const hasRolledThisTurn = gameState.turn.hasRolledThisTurn
```

- [ ] **Step 2: Delete the 3 redundant resets in `applyTurnAdvance` (do NOT convert to dispatches)**

`applyTurnAdvance` already dispatches `TURN_ADVANCED` (see Task 2, Step 2's find block — the dispatch line itself is untouched by that task), and Task 1's `reduceTurn` already resets `hasRolledThisTurn`/`devCardPlayedThisTurn`/`consecutiveDoublesThisTurn` to their turn-start values as part of that same `TURN_ADVANCED` case. Delete all 3 lines outright — converting them to dispatches would double-apply the same reset.

Find (`App.tsx`, inside `applyTurnAdvance`, currently around lines 889-892):
```ts
    setFreeRoadsRemaining(0)
    setDevCardPlayedThisTurn(false)
    setHasRolledThisTurn(false)
    setConsecutiveDoublesThisTurn(0)
    // Cities & Knights Merchant Fleet — "for the rest of this turn," so any
```

Replace with:
```ts
    setFreeRoadsRemaining(0)
    // Cities & Knights Merchant Fleet — "for the rest of this turn," so any
```

- [ ] **Step 3: Convert the call sites in `applyRollResult`**

Find (`App.tsx`, inside `applyRollResult`, currently around lines 3516-3552):
```ts
    if (gameRules.doublesRerollRule && isDouble && doublesCount < 3) {
      inform('Doubles! Roll again.')
      setHasRolledThisTurn(false)
    }
  }

  // Returns the resulting consecutive-doubles count, so handlePhysicsSettled
  // (the only caller that ever needs it) can decide whether to trigger a
  // bonus roll without re-deriving it from state that may not have
  // committed yet.
  const applyRollResult = (total: number, isDouble: boolean, rollerId: number): number => {
    setIsRolling(false)
    const roller = playerById.get(rollerId)
    // True on the roller's own client (no network delay, always still their
    // turn by the time this runs) and on a spectator's client for a NORMAL
    // roll. False only when a mirrored roll's animation is still tumbling
    // after this client already processed TURN_PASSED for it — a spectator's
    // dice take real time to settle, and a fast End Turn click right behind
    // a roll (or, with doublesRerollRule on, a quick manual re-roll click)
    // can land the near-instant TURN_PASSED handler before that animation
    // finishes. Every "whose turn is it" flag below has to be skipped in
    // that case, or the new turn gets falsely marked as already-rolled
    // before its player ever touched Roll Dice. Resource distribution
    // further down is NOT gated behind this: it must always apply so this
    // client's board stays in sync with the roller's, whichever turn it's
    // since become.
    const isStillRollersTurn = players[currentPlayerIndex]?.id === rollerId
    if (isStillRollersTurn) {
      setLastRoll(total)
      setHasRolledThisTurn(true)
    }
    // Only reachable with an ACCEPTED roll (a rerolled 7 returns early in
    // handlePhysicsSettled above and never reaches here), so this stays a
    // reliable "how many rolls has the game had" count for noSevensFirstTwoRolls.
    setTotalRollsThisGame((n) => n + 1)
    const doublesCount = isDouble && isStillRollersTurn ? consecutiveDoublesThisTurn + 1 : 0
    if (isStillRollersTurn) setConsecutiveDoublesThisTurn(doublesCount)
```

Replace with:
```ts
    if (gameRules.doublesRerollRule && isDouble && doublesCount < 3) {
      inform('Doubles! Roll again.')
      dispatch({ type: 'HAS_ROLLED_THIS_TURN_SET', rolled: false })
    }
  }

  // Returns the resulting consecutive-doubles count, so handlePhysicsSettled
  // (the only caller that ever needs it) can decide whether to trigger a
  // bonus roll without re-deriving it from state that may not have
  // committed yet.
  const applyRollResult = (total: number, isDouble: boolean, rollerId: number): number => {
    setIsRolling(false)
    const roller = playerById.get(rollerId)
    // True on the roller's own client (no network delay, always still their
    // turn by the time this runs) and on a spectator's client for a NORMAL
    // roll. False only when a mirrored roll's animation is still tumbling
    // after this client already processed TURN_PASSED for it — a spectator's
    // dice take real time to settle, and a fast End Turn click right behind
    // a roll (or, with doublesRerollRule on, a quick manual re-roll click)
    // can land the near-instant TURN_PASSED handler before that animation
    // finishes. Every "whose turn is it" flag below has to be skipped in
    // that case, or the new turn gets falsely marked as already-rolled
    // before its player ever touched Roll Dice. Resource distribution
    // further down is NOT gated behind this: it must always apply so this
    // client's board stays in sync with the roller's, whichever turn it's
    // since become.
    const isStillRollersTurn = players[currentPlayerIndex]?.id === rollerId
    if (isStillRollersTurn) {
      setLastRoll(total)
      dispatch({ type: 'HAS_ROLLED_THIS_TURN_SET', rolled: true })
    }
    // Only reachable with an ACCEPTED roll (a rerolled 7 returns early in
    // handlePhysicsSettled above and never reaches here), so this stays a
    // reliable "how many rolls has the game had" count for noSevensFirstTwoRolls.
    dispatch({ type: 'TOTAL_ROLLS_INCREMENTED' })
    const doublesCount = isDouble && isStillRollersTurn ? consecutiveDoublesThisTurn + 1 : 0
    if (isStillRollersTurn) dispatch({ type: 'CONSECUTIVE_DOUBLES_SET', count: doublesCount })
```

- [ ] **Step 4: Convert the call site in `spendDevCard`**

Find (`App.tsx`, currently around lines 4734-4737):
```ts
  const spendDevCard = (playerId: number, type: DevCardType) => {
    dispatch({ type: 'DEV_CARD_SPENT', playerId, devCardType: type })
    setDevCardPlayedThisTurn(true)
  }
```

Replace with:
```ts
  const spendDevCard = (playerId: number, type: DevCardType) => {
    dispatch({ type: 'DEV_CARD_SPENT', playerId, devCardType: type })
    dispatch({ type: 'DEV_CARD_PLAYED_THIS_TURN_SET', played: true })
  }
```

- [ ] **Step 5: Convert the `totalRollsThisGame`/`consecutiveDoublesThisTurn` reset in `resetGame`**

Find (`App.tsx`, inside `resetGame`, currently around lines 6357-6362):
```ts
    setBoardShapeId(effectiveShapeId)
    setCustomBoardCells(effectiveCustomCells)
    setCustomBoardBiomeOverrides(effectiveCustomBiomeOverrides)
    setGameRules(effectiveRules)
    setTotalRollsThisGame(0)
    setConsecutiveDoublesThisTurn(0)
```

Replace with:
```ts
    setBoardShapeId(effectiveShapeId)
    setCustomBoardCells(effectiveCustomCells)
    setCustomBoardBiomeOverrides(effectiveCustomBiomeOverrides)
    setGameRules(effectiveRules)
    dispatch({ type: 'TOTAL_ROLLS_RESET' })
    dispatch({ type: 'CONSECUTIVE_DOUBLES_SET', count: 0 })
```

- [ ] **Step 6: Convert the `devCardPlayedThisTurn`/`hasRolledThisTurn` reset in `resetGame`**

Find (`App.tsx`, inside `resetGame`, currently around lines 6444-6447):
```ts
    setFreeRoadsRemaining(0)
    setDevCardPicker(null)
    setDevCardPlayedThisTurn(false)
    setHasRolledThisTurn(false)
```

Replace with:
```ts
    setFreeRoadsRemaining(0)
    setDevCardPicker(null)
    dispatch({ type: 'DEV_CARD_PLAYED_THIS_TURN_SET', played: false })
    dispatch({ type: 'HAS_ROLLED_THIS_TURN_SET', rolled: false })
```

- [ ] **Step 7: Convert the call sites in `restoreFromSnapshot`, preserving the `?? 0` fallbacks**

Find (`App.tsx`, inside `restoreFromSnapshot`, currently around lines 6566-6569):
```ts
    setRevealedTileIds(new Set(snapshot.revealedTileIds ?? []))
    setTotalRollsThisGame(snapshot.totalRollsThisGame ?? 0)
    setConsecutiveDoublesThisTurn(snapshot.consecutiveDoublesThisTurn ?? 0)
    setStartingPlayerIndex(snapshot.startingPlayerIndex ?? 0)
```

Replace with:
```ts
    setRevealedTileIds(new Set(snapshot.revealedTileIds ?? []))
    dispatch({ type: 'TOTAL_ROLLS_SET', count: snapshot.totalRollsThisGame ?? 0 })
    dispatch({ type: 'CONSECUTIVE_DOUBLES_SET', count: snapshot.consecutiveDoublesThisTurn ?? 0 })
    setStartingPlayerIndex(snapshot.startingPlayerIndex ?? 0)
```

Find (`App.tsx`, inside `restoreFromSnapshot`, currently around lines 6657, 6659):
```ts
    setDevCardPlayedThisTurn(snapshot.devCardPlayedThisTurn)
    setFreeRoadsRemaining(snapshot.freeRoadsRemaining)
    setHasRolledThisTurn(snapshot.hasRolledThisTurn)
```

Replace with:
```ts
    dispatch({ type: 'DEV_CARD_PLAYED_THIS_TURN_SET', played: snapshot.devCardPlayedThisTurn })
    setFreeRoadsRemaining(snapshot.freeRoadsRemaining)
    dispatch({ type: 'HAS_ROLLED_THIS_TURN_SET', rolled: snapshot.hasRolledThisTurn })
```

Both of these are required (non-optional) `MatchSnapshot` fields — no `?? fallback` needed or added, matching the snapshot's own type.

- [ ] **Step 8: Run full verification, including the leftover-reference sweep**

Run: `npx tsc -p tsconfig.app.json`
Expected: no errors.

Run: `npx eslint src`
Expected: no errors.

Run: `npx vitest run`
Expected: 442 passing, 0 failing.

Run: `npm run build`
Expected: succeeds.

Run (leftover-setter sweep — this is the LAST task, so this must come back empty):
```bash
grep -nE "setCurrentPlayerIndex|setGamePhase|setSetupStepIndex|setSetupStage\(|setSetupSettlementVertexId|setDevCardPlayedThisTurn|setHasRolledThisTurn|setTotalRollsThisGame|setConsecutiveDoublesThisTurn" catan-3d/src/App.tsx
```
Expected: no matches. (React's own `useState` import stays in `App.tsx` — dozens of other fields still use it. This sweep only checks the 9 setter names specific to this migration.)

- [ ] **Step 9: Commit**

```bash
git add catan-3d/src/App.tsx
git commit -m "feat: migrate devCardPlayedThisTurn/hasRolledThisTurn/totalRollsThisGame/consecutiveDoublesThisTurn to gameState.turn"
```
