# App.tsx Reducer Refactor — Sub-plan 5: Decks & Trophies Bucket

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 6 fields — `devDeck`, `progressCardDecks` (a brand-new `DecksState`/`decks.ts` slice) and `longestRoadHolderId`, `largestArmyHolderId`, `metropolisHolders`, `metropolisVertexIds` (a brand-new `TrophiesState`/`trophies.ts` slice) — out of `App.tsx` `useState` and into the reducer.

**Architecture:** `GameState = { board: BoardState; players: Player[]; turn: TurnState; progress: ProgressState }`, composed via `src/game/gameState.ts`'s `reduceGame`, which runs every sub-reducer against every dispatched action unconditionally (each slice ignores actions it doesn't own via its switch's `default` case). This sub-plan adds two more slices the identical way `progress.ts` (the most recent precedent) was added: own file, own `initialState`, own action union, one more line in `reduceGame`. `GameState` becomes `{ board; players; turn; progress; decks; trophies }`.

**Tech Stack:** React 18 + TypeScript, `useReducer`, Vitest for reducer unit tests, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-24-apptsx-reducer-refactor-design.md` — this plan's own concrete field-by-field design (verified against the live code this session) supersedes that spec's loose sketch of `DecksState`/`TrophiesState` (same relationship every prior sub-plan's own concrete design had to its spec sketch).

**Naming note:** `src/game/trophies.ts` **already exists** — a pure-helpers file (`calculateLongestRoad`, `pickTrophyHolder`) imported by `App.tsx` today (`import { calculateLongestRoad, pickTrophyHolder } from './game/trophies'`, `App.tsx:102`). This sub-plan creates a **different** file, `src/game/reducers/trophies.ts` (a reducer slice), in a different directory. The existing `src/game/trophies.ts` is not touched by this sub-plan and both files coexist — do not confuse the two, and do not let an editor auto-import resolve `TrophiesState`/`reduceTrophies` to the wrong file.

---

## Global Constraints

- **Trusted-apply pattern (`CONVENTIONS.md` §1) is unchanged and non-negotiable.** One client decides a non-deterministic value, broadcasts it, every client — including the decider — applies the exact same decided result via a shared function, never re-deriving it. This sub-plan moves *where* 6 decided values live (reducer instead of `useState`), never *how* they get decided.
- **Composition pattern extends, doesn't change.** `GameState`/`GameAction` currently compose as `{ board: BoardState; players: Player[]; turn: TurnState; progress: ProgressState }` / `BoardAction | PlayersAction | TurnAction | ProgressAction`, with `reduceGame` running every sub-reducer against every action unconditionally. This sub-plan adds `decks: DecksState` and `trophies: TrophiesState` as two more lines in that same composition (own files, own action union members, two more `reduceGame` lines — no new composition mechanism), matching how `board`/`players`/`turn`/`progress` already compose.
- **The classification rule is the binding test for "does this state move," and all 6 fields were independently verified against it this session:**
  - `devDeck`/`progressCardDecks` qualify via rule 1 (dual-write) — each is written from both a local actor's own dispatch path (`buyDevCard`, `handleBarbarianWinnerDraw`, `handlePhysicsSettled`'s event-die draw block) AND a broadcast-receiver block (`onDevCardBought`, `onBarbarianWinnerDrawResolved`, `onProgressCardsDrawn`) — the strongest possible signal that the app is already hand-syncing this state across clients.
  - `longestRoadHolderId`/`largestArmyHolderId` qualify via rule 1 through a **host-authoritative variant**: the effective host's own render-time block computes the holder via a stateful, path-dependent `pickTrophyHolder` helper (ties don't unseat the incumbent — this makes the result path-dependent, not a pure function of current board state) and broadcasts it (`broadcastTrophyUpdated`); every other client just applies the broadcast value verbatim via `onTrophyUpdated`, never re-deriving it. This was explicitly checked against `winner`'s own worked example in the spec's Classification Rule section (a *pure* `useMemo` derivation, needing no reducer state at all) and ruled out as an analog — `pickTrophyHolder`'s stickiness makes independently-computed holders across clients able to permanently diverge, unlike `winner`.
  - `metropolisHolders`/`metropolisVertexIds` qualify via rule 1 (dual-write, always written together at every mutation site — `onMetropolisClaimed` and `buildSettlementRaw`'s claim-resolution branch).
- **`npm run build` (not just `tsc`/`eslint`/`vitest`) is required before any task is reported done** — this project's own history has a real case (Board Foundation, Seafarers sub-plan 1) of a broken Vite asset import that only `npm run build` caught.
- **Bare `npx tsc --noEmit` checks zero files on this project — do not use it as a task's typecheck command.** `catan-3d/tsconfig.json` is solution-style (`"files": []` + project references), so `tsc --noEmit` exits 0 unconditionally without checking anything. Every task below uses `npx tsc -p tsconfig.app.json` (run from the `catan-3d/` directory) as the real per-task typecheck gate.
- **This sub-plan's own binding constraints**, verified against the live code this session:
  1. **Every new action dispatches via bare `dispatch(...)`, never `dispatchGameAction`.** No banner/sfx/broadcast side effects are added anywhere by this migration — it relocates storage only.
  2. **No combined reset/restore action for either new slice.** Every field/field-group uses the same granular action at its reset/restore site as at every other site, dispatched multiple times where a reset/restore touches multiple tracks: `progressCardDecks` gets 3 `PROGRESS_CARD_DECK_SET` dispatches (one per track) at both `resetGame` and `restoreFromSnapshot`; `metropolisHolders`+`metropolisVertexIds` together get 3 `METROPOLIS_CLAIMED` dispatches (one per track) at both sites. This matches Sub-plan 3's and Sub-plan 4's own explicit "no combined `RESET_TURN`/`RESTORE_TURN`"/"no combined restore action for `ProgressState`" precedent.
  3. **Read-preserving alias pattern, matching `turn.ts`'s/`progress.ts`'s own established convention.** Every migrated field gets exactly ONE alias, declared exactly where its old `useState` line sat: `const devDeck = gameState.decks.devDeck`, etc. Every downstream read/gate site (GameHud props, the autosave-snapshot object, `buyDevCard`'s length guard, the barbarian-attack protected-vertex computation, …) keeps referencing the same bare identifier, unchanged, and keeps compiling and behaving identically.
  4. **The winner-draw timeout `useEffect`'s local running-copy loop structure (`App.tsx:3930-3951` approximate) must be preserved EXACTLY — do not touch the loop body's `decks[track] = rest` line or any other loop-internal logic.** Only the single, final `setProgressCardDecks(decks)` line (after the loop, still inside the `setTimeout` callback) converts, into a loop dispatching one `PROGRESS_CARD_DECK_SET` per track unconditionally (all 3 tracks, not just the ones a straggler in this sweep drew from) — see Task 2 Step 6 for the exact reasoning this is behaviorally identical to the original.
  5. **The render-time trophy computation's `!==` guards (`App.tsx:2522-2532` approximate, both `longestRoadHolderId` and `largestArmyHolderId`) are load-bearing — they prevent an infinite render loop — and must be preserved exactly, unchanged.** Only the innermost `setLongestRoadHolderId(...)`/`setLargestArmyHolderId(...)` calls convert to `dispatch(...)`; the surrounding `if (!onlineInfo || isEffectiveHost)` and the inner `if (next !== current)` guards are untouched.
  6. **Explicitly out of scope, do not touch:** `pendingMetropolisClaim` (local-only UI state, deliberately excluded from `MatchSnapshot`, re-derived on restore via `unresolvedMetropolisClaimTrack` — unaffected by this migration), `longestRoadLengths`/`knightCounts` (the `useMemo` Maps feeding the trophy computation — pure derivations, already correct, not persisted state).
  7. **Import path corrections found this session** (the spec's own sketch guessed some of these wrong — verified against the actual exports before finalizing this plan): `shuffle` is exported from `src/utils/seededRandom.ts`; `buildDevCardDeck`, `DevCardType`, `ProgressCardType`, `ImprovementTrack`, `IMPROVEMENT_TRACK_ORDER`, and — notably — `MetropolisHolders` are ALL exported from `src/game/types.ts` (NOT from `cityImprovements.ts` — `cityImprovements.ts` merely re-imports `MetropolisHolders` from `./types` for its own internal use, at `cityImprovements.ts:8`); `buildProgressCardDeck` is exported from `src/game/progressCards.ts`; only `MetropolisVertexIds` is actually defined in `src/game/cityImprovements.ts` (line 125: `export type MetropolisVertexIds = Record<ImprovementTrack, string | null>`).
  8. **`tsconfig.app.json` has `noUnusedLocals: true`.** `App.tsx`'s `MetropolisHolders` import (`App.tsx:94`) is used ONLY at the `metropolisHolders` `useState` declaration line being removed in Task 3 — confirmed by grep, no other reference anywhere in `App.tsx`. Task 3 MUST delete that import line or `npx tsc -p tsconfig.app.json`/`npm run build` fails with an unused-import error. `DevCardType` and `ProgressCardType` do NOT have this problem — both remain used at multiple other sites in `App.tsx` (`playableDevCardCount`, `applyBarbarianWinnerDraw`, `applyDevCardBought`, `spendDevCard`, `playDevCard`, etc.) after Task 2's edits.

---

## File Structure

- **Create** `catan-3d/src/game/reducers/decks.ts` — new `DecksState`/`initialDecksState`/`DecksAction`/`reduceDecks`.
- **Create** `catan-3d/src/game/reducers/decks.test.ts` — full coverage matching `progress.test.ts`'s conventions.
- **Create** `catan-3d/src/game/reducers/trophies.ts` — new `TrophiesState`/`initialTrophiesState`/`TrophiesAction`/`reduceTrophies`. (Distinct from the pre-existing `catan-3d/src/game/trophies.ts` — see the naming note above.)
- **Create** `catan-3d/src/game/reducers/trophies.test.ts` — full coverage matching `progress.test.ts`'s conventions.
- **Modify** `catan-3d/src/game/gameState.ts` — wire `decks`/`trophies` into `GameState`/`initialGameState`/`GameAction`/`reduceGame`.
- **Modify** `catan-3d/src/game/gameState.test.ts` — add 2 routing tests (one per new slice), required by this sub-plan's own process constraint (see Task 1).
- **Modify** `catan-3d/src/App.tsx` — migrate all 6 fields' `useState` declarations and every mid-game/reset/restore call site onto the reducer; remove the now-unused `MetropolisHolders` import.
- **Not touched:** `catan-3d/src/multiplayer/matchSnapshot.ts` (its `MatchSnapshot` interface already carries `devDeck`, `longestRoadHolderId`, `largestArmyHolderId` as required fields and `progressCardDecks?`, `metropolisHolders?`, `metropolisVertexIds?` as optional fields — unchanged), `catan-3d/src/components/hud/GameHud.tsx` (its prop types already match — no change needed since the alias pattern keeps every prop-passing call site a bare, still-valid identifier), `catan-3d/src/game/trophies.ts` (pre-existing pure-helpers file, untouched), `catan-3d/src/game/cityImprovements.ts` (untouched — only its already-exported `MetropolisVertexIds` type is imported by the new `trophies.ts`).

---

### Task 1: Create `decks.ts`/`decks.test.ts` and `trophies.ts`/`trophies.test.ts`, wire `gameState.ts` + `gameState.test.ts`

**Files:**
- Create: `catan-3d/src/game/reducers/decks.ts`
- Create: `catan-3d/src/game/reducers/decks.test.ts`
- Create: `catan-3d/src/game/reducers/trophies.ts`
- Create: `catan-3d/src/game/reducers/trophies.test.ts`
- Modify: `catan-3d/src/game/gameState.ts`
- Modify: `catan-3d/src/game/gameState.test.ts`

**Interfaces:**
- Consumes: existing `GameState`/`GameAction`/`reduceGame`/`initialGameState` (`gameState.ts`); `buildDevCardDeck`, `type DevCardType`, `type ProgressCardType`, `type ImprovementTrack`, `type MetropolisHolders` from `../types` (i.e. `src/game/types.ts`, confirmed exports); `buildProgressCardDeck` from `../progressCards`; `shuffle` from `../../utils/seededRandom`; `type MetropolisVertexIds` from `../cityImprovements`.
- Produces: `DecksState { devDeck: DevCardType[]; progressCardDecks: Record<ImprovementTrack, ProgressCardType[]> }`, `initialDecksState`, `DecksAction` (3 members: `DEV_CARD_DRAWN`, `DEV_DECK_SET`, `PROGRESS_CARD_DECK_SET`), `reduceDecks(state, action, fullState)`; `TrophiesState { longestRoadHolderId: number | null; largestArmyHolderId: number | null; metropolisHolders: MetropolisHolders; metropolisVertexIds: MetropolisVertexIds }`, `initialTrophiesState`, `TrophiesAction` (3 members: `LONGEST_ROAD_HOLDER_SET`, `LARGEST_ARMY_HOLDER_SET`, `METROPOLIS_CLAIMED`), `reduceTrophies(state, action, fullState)`; `GameState.decks: DecksState`, `GameState.trophies: TrophiesState`; `GameAction` includes `DecksAction | TrophiesAction`.

This task is pure reducer-slice construction — nothing in `App.tsx` reads `gameState.decks.*`/`gameState.trophies.*` yet (Tasks 2/3 wire those reads). Zero `App.tsx` changes in this task; both new action unions are brand new with zero existing callers (unlike a pre-existing action like `RESTORE_BOARD` in Sub-plan 4, neither `decks.ts` nor `trophies.ts` widens anything already dispatched today), so there is no cross-task compile-safety gap to bridge with a placeholder.

- [ ] **Step 1: Write failing tests for `decks.ts`**

Create `catan-3d/src/game/reducers/decks.test.ts`, matching `progress.test.ts`'s exact conventions (plain `describe`/`it`, `reduceDecks(state, action, initialGameState)`, `toEqual`/`toBe` spread-immutability and reference-identity checks, plus the sibling "action not owned by this reducer" block every existing reducer test file has):

```ts
import { describe, expect, it } from 'vitest'
import { reduceDecks, initialDecksState } from './decks'
import { initialGameState } from '../gameState'
import type { DevCardType, ProgressCardType } from '../types'

describe('reduceDecks — DEV_CARD_DRAWN', () => {
  it('removes exactly the top card off devDeck', () => {
    const dirty = { ...initialDecksState, devDeck: ['knight', 'monopoly', 'roadBuilding'] as DevCardType[] }
    const result = reduceDecks(dirty, { type: 'DEV_CARD_DRAWN' }, initialGameState)
    expect(result.devDeck).toEqual(['monopoly', 'roadBuilding'])
  })

  it('leaves progressCardDecks untouched', () => {
    const dirty = { ...initialDecksState, devDeck: ['knight'] as DevCardType[] }
    const result = reduceDecks(dirty, { type: 'DEV_CARD_DRAWN' }, initialGameState)
    expect(result.progressCardDecks).toBe(dirty.progressCardDecks)
  })
})

describe('reduceDecks — DEV_DECK_SET', () => {
  it('replaces devDeck wholesale', () => {
    const newDeck: DevCardType[] = ['victoryPoint', 'victoryPoint']
    const result = reduceDecks(initialDecksState, { type: 'DEV_DECK_SET', deck: newDeck }, initialGameState)
    expect(result).toEqual({ ...initialDecksState, devDeck: newDeck })
  })
})

describe('reduceDecks — PROGRESS_CARD_DECK_SET', () => {
  it('replaces exactly one track, leaves the other two untouched', () => {
    const newScienceDeck: ProgressCardType[] = ['printing', 'printing']
    const result = reduceDecks(
      initialDecksState,
      { type: 'PROGRESS_CARD_DECK_SET', track: 'science', deck: newScienceDeck },
      initialGameState,
    )
    expect(result.progressCardDecks.science).toEqual(newScienceDeck)
    expect(result.progressCardDecks.trade).toBe(initialDecksState.progressCardDecks.trade)
    expect(result.progressCardDecks.politics).toBe(initialDecksState.progressCardDecks.politics)
  })

  it('leaves devDeck untouched', () => {
    const result = reduceDecks(
      initialDecksState,
      { type: 'PROGRESS_CARD_DECK_SET', track: 'trade', deck: [] },
      initialGameState,
    )
    expect(result.devDeck).toBe(initialDecksState.devDeck)
  })
})

describe('reduceDecks — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reduceDecks(initialDecksState, { type: 'RESET_BOARD', robberTileId: 'D1' }, initialGameState)
    expect(result).toBe(initialDecksState)
  })
})
```

- [ ] **Step 2: Run the test file to verify it fails**

Run (from `catan-3d/`): `npx vitest run src/game/reducers/decks.test.ts`
Expected: FAIL — `./decks` doesn't exist yet (`Cannot find module './decks'` or equivalent).

- [ ] **Step 3: Implement `decks.ts`**

Create `catan-3d/src/game/reducers/decks.ts`:

```ts
import type { GameAction, GameState } from '../gameState'
import { shuffle } from '../../utils/seededRandom'
import { buildDevCardDeck, type DevCardType, type ImprovementTrack, type ProgressCardType } from '../types'
import { buildProgressCardDeck } from '../progressCards'

export interface DecksState {
  devDeck: DevCardType[]
  progressCardDecks: Record<ImprovementTrack, ProgressCardType[]>
}

// Matches the default the old `useState(() => shuffle(buildDevCardDeck()))`/
// `useState(() => ({ science: buildProgressCardDeck('science'), ... }))`
// used to seed with, before a real game (resetGame) replaces them — same
// "plain non-lazy value" treatment initialGameState.players already gets
// (createInitialPlayers(3), not a lazy function — see gameState.ts).
export const initialDecksState: DecksState = {
  devDeck: shuffle(buildDevCardDeck()),
  progressCardDecks: {
    science: buildProgressCardDeck('science'),
    trade: buildProgressCardDeck('trade'),
    politics: buildProgressCardDeck('politics'),
  },
}

export type DecksAction =
  | { type: 'DEV_CARD_DRAWN' }
  | { type: 'DEV_DECK_SET'; deck: DevCardType[] }
  | { type: 'PROGRESS_CARD_DECK_SET'; track: ImprovementTrack; deck: ProgressCardType[] }
  | { type: 'PROGRESS_CARD_DECK_POPPED'; track: ImprovementTrack; count: number }

export function reduceDecks(state: DecksState, action: GameAction, _fullState: GameState): DecksState {
  switch (action.type) {
    case 'DEV_CARD_DRAWN':
      return { ...state, devDeck: state.devDeck.slice(1) }
    case 'DEV_DECK_SET':
      return { ...state, devDeck: action.deck }
    case 'PROGRESS_CARD_DECK_SET':
      return { ...state, progressCardDecks: { ...state.progressCardDecks, [action.track]: action.deck } }
    case 'PROGRESS_CARD_DECK_POPPED':
      return {
        ...state,
        progressCardDecks: {
          ...state.progressCardDecks,
          [action.track]: state.progressCardDecks[action.track].slice(action.count),
        },
      }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full GameAction
      // union (every slice's actions), not just DecksAction, so most of that
      // union — including every board-only/players-only/turn-only/progress-
      // only action — is legitimately unhandled here. reduceDecks only owns
      // the 4 dedicated cases above.
      return state
  }
}
```

**Post-merge correction (added after this sub-plan's final whole-branch review):** the original version of this section specified only 3 `DecksAction` members. The final review found that `onBarbarianWinnerDrawResolved` and `onProgressCardsDrawn` (Task 2, Steps 4 and 8 below) — as originally specified using `PROGRESS_CARD_DECK_SET` with a value computed from the closed-over `progressCardDecks` alias — reintroduced a stale-closure bug: React's OLD functional-updater form (`setProgressCardDecks((prev) => ({ ...prev, [track]: prev[track].slice(N) }))`) was safe regardless of closure staleness, but the migrated absolute-dispatch form was not, since two rapid-fire broadcasts for the same track (reachable via the host's winner-draw timeout sweep) could both read the same stale value and the second would silently overwrite instead of compound with the first. `PROGRESS_CARD_DECK_POPPED` fixes this by computing the slice against LIVE reducer state (`state.progressCardDecks[action.track]`), never a value threaded in from a component closure — mirroring `DEV_CARD_DRAWN`'s own "reducer computes against live state" design. Steps 4 and 8 below already show the corrected, final form (`PROGRESS_CARD_DECK_POPPED`, not `PROGRESS_CARD_DECK_SET`) — this note exists so a future reader of this plan understands why 4 actions exist instead of the 3 originally designed, and does not "simplify" back to 3 by re-deriving the vulnerable form. The other 6 `PROGRESS_CARD_DECK_SET` call sites (Steps 5, 6, 7, 9's 3 dispatches, 11's 3 dispatches) are unaffected and correctly keep using `PROGRESS_CARD_DECK_SET` — they are either local user-triggered handlers, not rapid-fire broadcast receivers, or already compute from a fresh local snapshot.

- [ ] **Step 4: Run the test file to verify it passes**

Run: `npx vitest run src/game/reducers/decks.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing tests for `trophies.ts`**

Create `catan-3d/src/game/reducers/trophies.test.ts`, same conventions:

```ts
import { describe, expect, it } from 'vitest'
import { reduceTrophies, initialTrophiesState } from './trophies'
import { initialGameState } from '../gameState'

describe('reduceTrophies — LONGEST_ROAD_HOLDER_SET', () => {
  it('sets longestRoadHolderId, leaves every other field untouched', () => {
    const result = reduceTrophies(
      initialTrophiesState,
      { type: 'LONGEST_ROAD_HOLDER_SET', playerId: 2 },
      initialGameState,
    )
    expect(result).toEqual({ ...initialTrophiesState, longestRoadHolderId: 2 })
  })

  it('accepts null (incumbent loses, or nobody has ever qualified)', () => {
    const dirty = { ...initialTrophiesState, longestRoadHolderId: 2 }
    const result = reduceTrophies(dirty, { type: 'LONGEST_ROAD_HOLDER_SET', playerId: null }, initialGameState)
    expect(result.longestRoadHolderId).toBeNull()
  })
})

describe('reduceTrophies — LARGEST_ARMY_HOLDER_SET', () => {
  it('sets largestArmyHolderId, leaves every other field untouched', () => {
    const result = reduceTrophies(
      initialTrophiesState,
      { type: 'LARGEST_ARMY_HOLDER_SET', playerId: 3 },
      initialGameState,
    )
    expect(result).toEqual({ ...initialTrophiesState, largestArmyHolderId: 3 })
  })

  it('accepts null', () => {
    const dirty = { ...initialTrophiesState, largestArmyHolderId: 3 }
    const result = reduceTrophies(dirty, { type: 'LARGEST_ARMY_HOLDER_SET', playerId: null }, initialGameState)
    expect(result.largestArmyHolderId).toBeNull()
  })
})

describe('reduceTrophies — METROPOLIS_CLAIMED', () => {
  it('sets both metropolisHolders[track] and metropolisVertexIds[track] together', () => {
    const result = reduceTrophies(
      initialTrophiesState,
      { type: 'METROPOLIS_CLAIMED', track: 'science', playerId: 1, vertexId: 'V7' },
      initialGameState,
    )
    expect(result.metropolisHolders).toEqual({ science: 1, trade: null, politics: null })
    expect(result.metropolisVertexIds).toEqual({ science: 'V7', trade: null, politics: null })
  })

  it('leaves the other two tracks untouched', () => {
    const dirty = {
      ...initialTrophiesState,
      metropolisHolders: { science: null, trade: 2, politics: null },
      metropolisVertexIds: { science: null, trade: 'V3', politics: null },
    }
    const result = reduceTrophies(
      dirty,
      { type: 'METROPOLIS_CLAIMED', track: 'politics', playerId: 1, vertexId: 'V9' },
      initialGameState,
    )
    expect(result.metropolisHolders).toEqual({ science: null, trade: 2, politics: 1 })
    expect(result.metropolisVertexIds).toEqual({ science: null, trade: 'V3', politics: 'V9' })
  })

  it('accepts null/null (reset/clear a track)', () => {
    const dirty = {
      ...initialTrophiesState,
      metropolisHolders: { science: 1, trade: null, politics: null },
      metropolisVertexIds: { science: 'V7', trade: null, politics: null },
    }
    const result = reduceTrophies(
      dirty,
      { type: 'METROPOLIS_CLAIMED', track: 'science', playerId: null, vertexId: null },
      initialGameState,
    )
    expect(result.metropolisHolders.science).toBeNull()
    expect(result.metropolisVertexIds.science).toBeNull()
  })

  it('leaves longestRoadHolderId/largestArmyHolderId untouched', () => {
    const dirty = { ...initialTrophiesState, longestRoadHolderId: 4, largestArmyHolderId: 5 }
    const result = reduceTrophies(
      dirty,
      { type: 'METROPOLIS_CLAIMED', track: 'trade', playerId: 2, vertexId: 'V1' },
      initialGameState,
    )
    expect(result.longestRoadHolderId).toBe(4)
    expect(result.largestArmyHolderId).toBe(5)
  })
})

describe('reduceTrophies — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reduceTrophies(initialTrophiesState, { type: 'RESET_BOARD', robberTileId: 'D1' }, initialGameState)
    expect(result).toBe(initialTrophiesState)
  })
})
```

- [ ] **Step 6: Run the test file to verify it fails**

Run: `npx vitest run src/game/reducers/trophies.test.ts`
Expected: FAIL — `./trophies` doesn't exist yet (`Cannot find module './trophies'` or equivalent). Note: this refers to the NEW `src/game/reducers/trophies.ts`, not the pre-existing `src/game/trophies.ts` — a relative import from inside `src/game/reducers/trophies.test.ts` (`./trophies`) resolves to the sibling file in the same directory, so there's no path collision with the existing pure-helpers file.

- [ ] **Step 7: Implement `trophies.ts`**

Create `catan-3d/src/game/reducers/trophies.ts`:

```ts
import type { GameAction, GameState } from '../gameState'
import type { ImprovementTrack, MetropolisHolders } from '../types'
import type { MetropolisVertexIds } from '../cityImprovements'

export interface TrophiesState {
  longestRoadHolderId: number | null
  largestArmyHolderId: number | null
  metropolisHolders: MetropolisHolders
  metropolisVertexIds: MetropolisVertexIds
}

export const initialTrophiesState: TrophiesState = {
  longestRoadHolderId: null,
  largestArmyHolderId: null,
  metropolisHolders: { science: null, trade: null, politics: null },
  metropolisVertexIds: { science: null, trade: null, politics: null },
}

export type TrophiesAction =
  | { type: 'LONGEST_ROAD_HOLDER_SET'; playerId: number | null }
  | { type: 'LARGEST_ARMY_HOLDER_SET'; playerId: number | null }
  | { type: 'METROPOLIS_CLAIMED'; track: ImprovementTrack; playerId: number | null; vertexId: string | null }

export function reduceTrophies(state: TrophiesState, action: GameAction, _fullState: GameState): TrophiesState {
  switch (action.type) {
    case 'LONGEST_ROAD_HOLDER_SET':
      return { ...state, longestRoadHolderId: action.playerId }
    case 'LARGEST_ARMY_HOLDER_SET':
      return { ...state, largestArmyHolderId: action.playerId }
    case 'METROPOLIS_CLAIMED':
      return {
        ...state,
        metropolisHolders: { ...state.metropolisHolders, [action.track]: action.playerId },
        metropolisVertexIds: { ...state.metropolisVertexIds, [action.track]: action.vertexId },
      }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full GameAction
      // union (every slice's actions), not just TrophiesAction, so most of
      // that union is legitimately unhandled here. reduceTrophies only owns
      // the 3 dedicated cases above.
      return state
  }
}
```

- [ ] **Step 8: Run the test file to verify it passes**

Run: `npx vitest run src/game/reducers/trophies.test.ts`
Expected: PASS.

- [ ] **Step 9: Wire `decks`/`trophies` into `gameState.ts`**

Read `catan-3d/src/game/gameState.ts` first (confirm nothing has drifted from what's quoted here — it currently composes `board`/`players`/`turn`/`progress`). Replace its full contents:

```ts
import { reduceBoard, initialBoardState, type BoardState, type BoardAction } from './reducers/board'
import { reducePlayers, type PlayersAction } from './reducers/players'
import { reduceTurn, initialTurnState, type TurnState, type TurnAction } from './reducers/turn'
import { reduceProgress, initialProgressState, type ProgressState, type ProgressAction } from './reducers/progress'
import { reduceDecks, initialDecksState, type DecksState, type DecksAction } from './reducers/decks'
import { reduceTrophies, initialTrophiesState, type TrophiesState, type TrophiesAction } from './reducers/trophies'
import { createInitialPlayers, type Player } from './types'

export interface GameState {
  board: BoardState
  players: Player[]
  turn: TurnState
  progress: ProgressState
  decks: DecksState
  trophies: TrophiesState
}

export const initialGameState: GameState = {
  board: initialBoardState,
  // Matches the default the old `useState(() => createInitialPlayers(3))`
  // used to seed with, before a real game (resetGame) replaces it.
  players: createInitialPlayers(3),
  turn: initialTurnState,
  progress: initialProgressState,
  decks: initialDecksState,
  trophies: initialTrophiesState,
}

export type GameAction = BoardAction | PlayersAction | TurnAction | ProgressAction | DecksAction | TrophiesAction

export function reduceGame(state: GameState, action: GameAction): GameState {
  return {
    board: reduceBoard(state.board, action, state),
    players: reducePlayers(state.players, action, state),
    turn: reduceTurn(state.turn, action, state),
    progress: reduceProgress(state.progress, action, state),
    decks: reduceDecks(state.decks, action, state),
    trophies: reduceTrophies(state.trophies, action, state),
  }
}
```

- [ ] **Step 10: Add the 2 required `gameState.test.ts` routing tests**

This step exists because Sub-plan 3's and Sub-plan 4's own final whole-branch reviews independently found the same gap: a newly-added slice's own `reduceGame` composition line shipped with zero direct routing-level test coverage in `game/gameState.test.ts`, even though the new reducer file itself was exhaustively tested in isolation — a real, silent, type-safe regression risk (a regression to `decks: state.decks` would pass every other test). This must not happen a third time.

Read `catan-3d/src/game/gameState.test.ts` first (confirm nothing has drifted — it currently has one routing test per existing slice, e.g. `'routes a progress action through reduceProgress'`, each asserting the routed slice updated AND an unrelated slice — `result.board` — kept its reference). Insert 2 new tests, matching that exact style, right before the existing `'does not mutate the input state'` test at the end:

```ts
  it('routes a decks action through reduceDecks', () => {
    const result = reduceGame(initialGameState, { type: 'DEV_CARD_DRAWN' })
    expect(result.decks.devDeck).toEqual(initialGameState.decks.devDeck.slice(1))
    expect(result.board).toBe(initialGameState.board)
  })

  it('routes a trophies action through reduceTrophies', () => {
    const result = reduceGame(initialGameState, { type: 'LONGEST_ROAD_HOLDER_SET', playerId: 2 })
    expect(result.trophies.longestRoadHolderId).toBe(2)
    expect(result.board).toBe(initialGameState.board)
  })
```

- [ ] **Step 11: Run the full reducer test suite**

Run: `npx vitest run src/game`
Expected: PASS — `decks.test.ts`, `trophies.test.ts`, `gameState.test.ts`, and every other pre-existing `src/game/**/*.test.ts` all green.

- [ ] **Step 12: Typecheck**

Run: `npx tsc -p tsconfig.app.json`
Expected: clean, no errors. (Nothing in `App.tsx` references `gameState.decks`/`gameState.trophies` yet, and no pre-existing action's payload was widened, so there is nothing for this task to break.)

- [ ] **Step 13: Build**

Run (from `catan-3d/`): `npm run build`
Expected: succeeds.

- [ ] **Step 14: Commit**

```bash
git add src/game/reducers/decks.ts src/game/reducers/decks.test.ts src/game/reducers/trophies.ts src/game/reducers/trophies.test.ts src/game/gameState.ts src/game/gameState.test.ts
git commit -m "feat: add DecksState and TrophiesState reducer slices"
```

---

### Task 2: Migrate `devDeck` + `progressCardDecks` (`DecksState` fields) in `App.tsx`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `DecksState.devDeck`/`progressCardDecks`, `DecksAction`'s `DEV_CARD_DRAWN`/`DEV_DECK_SET`/`PROGRESS_CARD_DECK_SET` members (all from Task 1).
- Produces: `gameState.decks.devDeck`/`progressCardDecks` as the live source of truth in `App.tsx` — local `useState` for these 2 fields fully removed.

`App.tsx` has no dedicated test file (confirmed precedent — see the spec's own "Deviation, Sub-plan 1" note). This task's verification is `npx tsc -p tsconfig.app.json` + the full existing Vitest suite + `npm run build`.

- [ ] **Step 1: Replace the 2 `useState` declarations with reducer-backed aliases**

Read `App.tsx:379-384` first to confirm nothing has drifted.

Find:
```tsx
  const [devDeck, setDevDeck] = useState<DevCardType[]>(() => shuffle(buildDevCardDeck()))
  const [progressCardDecks, setProgressCardDecks] = useState<Record<ImprovementTrack, ProgressCardType[]>>(() => ({
    science: buildProgressCardDeck('science'),
    trade: buildProgressCardDeck('trade'),
    politics: buildProgressCardDeck('politics'),
  }))
```

Replace:
```tsx
  const devDeck = gameState.decks.devDeck
  const progressCardDecks = gameState.decks.progressCardDecks
```

- [ ] **Step 2: `buyDevCard` — draw the top card**

Read `App.tsx:4551-4588` first to confirm nothing has drifted.

Find:
```tsx
    if (devDeck.length === 0) {
      warn('No development cards left.')
      return
    }

    const player = players[currentPlayerIndex]
    if (!canAfford(player.resources, DEV_CARD_COST)) {
      warn('Not enough resources for a development card.')
      return
    }

    const [card, ...remaining] = devDeck
    setDevDeck(remaining)
    applyDevCardBought(player.id, card)
    inform(`${player.name} bought a development card.`)
    if (onlineInfo) broadcastDevCardBought({ playerId: player.id, card })
  }
```

Replace (the `devDeck.length === 0` guard just above already establishes the deck is non-empty, so reading `devDeck[0]` directly — instead of destructuring `[card, ...remaining]`, which would leave `remaining` unused and trip `noUnusedLocals` now that the array-shrinking itself moves into the reducer's `DEV_CARD_DRAWN` case — is safe and matches `onDevCardBought`'s own no-payload treatment in Step 3 below):
```tsx
    const card = devDeck[0]
    dispatch({ type: 'DEV_CARD_DRAWN' })
    applyDevCardBought(player.id, card)
    inform(`${player.name} bought a development card.`)
    if (onlineInfo) broadcastDevCardBought({ playerId: player.id, card })
  }
```

- [ ] **Step 3: `onDevCardBought` receiver — draw the top card**

Read `App.tsx:1829-1832` first.

Find:
```tsx
    onDevCardBought: (payload) => {
      applyDevCardBought(payload.playerId, payload.card)
      setDevDeck((prev) => prev.slice(1))
    },
```

Replace:
```tsx
    onDevCardBought: (payload) => {
      applyDevCardBought(payload.playerId, payload.card)
      dispatch({ type: 'DEV_CARD_DRAWN' })
    },
```

- [ ] **Step 4: `onBarbarianWinnerDrawResolved` receiver — pop 1 card off `progressCardDecks[track]`**

Read `App.tsx:1705-1720` first.

Find:
```tsx
      setProgressCardDecks((prev) => ({ ...prev, [payload.track]: prev[payload.track].slice(1) }))
```

**Post-merge correction:** the version below is the CORRECTED final form (`PROGRESS_CARD_DECK_POPPED`), not this plan's original draft (which specified `PROGRESS_CARD_DECK_SET` with `deck: progressCardDecks[payload.track].slice(1)`, computed from the closed-over alias). That original form reintroduced a stale-closure bug the final whole-branch review found — see the "Post-merge correction" note under `decks.ts`'s own definition above. Use `PROGRESS_CARD_DECK_POPPED` here, not `PROGRESS_CARD_DECK_SET`.

Replace:
```tsx
      dispatch({ type: 'PROGRESS_CARD_DECK_POPPED', track: payload.track, count: 1 })
```

- [ ] **Step 5: `handleBarbarianWinnerDraw` — pop 1 card off `progressCardDecks[track]`**

Read `App.tsx:2375-2389` first. The `deck`/`[card, ...rest]` computation just above the setter is UNCHANGED — only the final setter line converts.

Find:
```tsx
  const handleBarbarianWinnerDraw = (track: ImprovementTrack) => {
    const playerId = activeWinnerDrawPlayerId
    if (playerId == null) return
    const deck = progressCardDecks[track]
    const [card, ...rest] = deck
    if (!card) {
      warn('That deck is empty.')
      return
    }
    applyBarbarianWinnerDraw(playerId, card)
    setProgressCardDecks((prev) => ({ ...prev, [track]: rest }))
    const player = playerById.get(playerId)
    if (player) inform(`${player.name} drew a ${PROGRESS_CARD_LABELS[card]} progress card for tying as Defender of Catan.`)
    if (onlineInfo) broadcastBarbarianWinnerDrawResolved({ playerId, track, card })
  }
```

Replace (only the `setProgressCardDecks` line):
```tsx
  const handleBarbarianWinnerDraw = (track: ImprovementTrack) => {
    const playerId = activeWinnerDrawPlayerId
    if (playerId == null) return
    const deck = progressCardDecks[track]
    const [card, ...rest] = deck
    if (!card) {
      warn('That deck is empty.')
      return
    }
    applyBarbarianWinnerDraw(playerId, card)
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track, deck: rest })
    const player = playerById.get(playerId)
    if (player) inform(`${player.name} drew a ${PROGRESS_CARD_LABELS[card]} progress card for tying as Defender of Catan.`)
    if (onlineInfo) broadcastBarbarianWinnerDrawResolved({ playerId, track, card })
  }
```

- [ ] **Step 6: The winner-draw timeout `useEffect` — preserve the local running-copy loop, convert only the final write**

Read `App.tsx:3930-3951` first, in full, to confirm it still matches exactly. This is the ONE structurally different site: it uses a LOCAL running-copy object (`decks`) mutated across loop iterations, necessary because a second straggler drawing from the same track within the same batch must see the FIRST straggler's removal, not stale pre-loop state (per the code's own comment). **Do not touch the loop body's `decks[track] = rest` line or any other loop-internal logic — only the single final `setProgressCardDecks(decks)` line changes.**

Find:
```tsx
  useEffect(() => {
    if (winnerDrawQueue.length === 0) return
    if (onlineInfo && !isEffectiveHost) return
    const timer = setTimeout(() => {
      const decks = { ...progressCardDecks }
      for (const playerId of winnerDrawQueue) {
        const track = IMPROVEMENT_TRACK_ORDER.find((t) => decks[t].length > 0)
        if (!track) {
          setWinnerDrawQueue((prev) => dequeueOne(prev, (id) => id, playerId))
          continue
        }
        const [card, ...rest] = decks[track]
        decks[track] = rest
        applyBarbarianWinnerDraw(playerId, card)
        inform(`${playerById.get(playerId)?.name ?? 'A player'}'s Defender of Catan draw timed out — a card was drawn automatically.`)
        if (onlineInfo) broadcastBarbarianWinnerDrawResolved({ playerId, track, card })
      }
      setProgressCardDecks(decks)
    }, DISCARD_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same reasoning as the two timeout effects above: progressCardDecks/playerById/onlineInfo/inform/applyBarbarianWinnerDraw/broadcastBarbarianWinnerDrawResolved are read fresh via closure; only winnerDrawQueue/isEffectiveHost identity should restart the timer.
  }, [winnerDrawQueue, isEffectiveHost])
```

Replace (only the final `setProgressCardDecks(decks)` line, into a loop dispatching one `PROGRESS_CARD_DECK_SET` per track — this is behaviorally IDENTICAL to the original `setProgressCardDecks(decks)`, which also replaced all 3 keys unconditionally, including tracks nothing drew from that batch: those tracks' `decks[t]` still equals their original array reference, so dispatching them back is a harmless no-op-shaped write, exactly matching the old code's own behavior of writing back a whole object where most keys are unchanged):
```tsx
  useEffect(() => {
    if (winnerDrawQueue.length === 0) return
    if (onlineInfo && !isEffectiveHost) return
    const timer = setTimeout(() => {
      const decks = { ...progressCardDecks }
      for (const playerId of winnerDrawQueue) {
        const track = IMPROVEMENT_TRACK_ORDER.find((t) => decks[t].length > 0)
        if (!track) {
          setWinnerDrawQueue((prev) => dequeueOne(prev, (id) => id, playerId))
          continue
        }
        const [card, ...rest] = decks[track]
        decks[track] = rest
        applyBarbarianWinnerDraw(playerId, card)
        inform(`${playerById.get(playerId)?.name ?? 'A player'}'s Defender of Catan draw timed out — a card was drawn automatically.`)
        if (onlineInfo) broadcastBarbarianWinnerDrawResolved({ playerId, track, card })
      }
      for (const t of IMPROVEMENT_TRACK_ORDER) {
        dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: t, deck: decks[t] })
      }
    }, DISCARD_TIMEOUT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same reasoning as the two timeout effects above: progressCardDecks/playerById/onlineInfo/inform/applyBarbarianWinnerDraw/broadcastBarbarianWinnerDrawResolved are read fresh via closure; only winnerDrawQueue/isEffectiveHost identity should restart the timer.
  }, [winnerDrawQueue, isEffectiveHost])
```

- [ ] **Step 7: `handlePhysicsSettled`'s event-die draw block**

Read `App.tsx:3437-3453` first.

Find:
```tsx
      const result = resolveEventDieDraws(players, track, d1, progressCardDecks[track], turnOrderIds)
      if (result.draws.length > 0) {
        applyProgressCardDraws(result.draws)
        setProgressCardDecks((prev) => ({ ...prev, [track]: result.remainingDeck }))
        for (const { playerId, card } of result.draws) {
          const p = playerById.get(playerId)
          if (p) inform(`${p.name} drew a ${PROGRESS_CARD_LABELS[card]} progress card.`)
        }
        if (onlineInfo) broadcastProgressCardsDrawn({ track, draws: result.draws })
      }
```

Replace (only the setter line):
```tsx
      const result = resolveEventDieDraws(players, track, d1, progressCardDecks[track], turnOrderIds)
      if (result.draws.length > 0) {
        applyProgressCardDraws(result.draws)
        dispatch({ type: 'PROGRESS_CARD_DECK_SET', track, deck: result.remainingDeck })
        for (const { playerId, card } of result.draws) {
          const p = playerById.get(playerId)
          if (p) inform(`${p.name} drew a ${PROGRESS_CARD_LABELS[card]} progress card.`)
        }
        if (onlineInfo) broadcastProgressCardsDrawn({ track, draws: result.draws })
      }
```

- [ ] **Step 8: `onProgressCardsDrawn` receiver**

Read `App.tsx:1851-1884` first.

Find:
```tsx
      applyProgressCardDraws(payload.draws)
      // Pop the SAME COUNT off this client's own local deck copy — contents
      // never shown to anyone, so which specific cards remain doesn't need to
      // match the roller's; only the remaining length does.
      setProgressCardDecks((prev) => ({
        ...prev,
        [payload.track]: prev[payload.track].slice(payload.draws.length),
      }))
```

**Post-merge correction:** the version below is the CORRECTED final form (`PROGRESS_CARD_DECK_POPPED`), not this plan's original draft (which specified `PROGRESS_CARD_DECK_SET` with `deck: progressCardDecks[payload.track].slice(payload.draws.length)`, computed from the closed-over alias). That original form reintroduced the same stale-closure bug described in Step 4's own note above. Use `PROGRESS_CARD_DECK_POPPED` here, not `PROGRESS_CARD_DECK_SET`.

Replace:
```tsx
      applyProgressCardDraws(payload.draws)
      // Pop the SAME COUNT off this client's own local deck copy — contents
      // never shown to anyone, so which specific cards remain doesn't need to
      // match the roller's; only the remaining length does.
      dispatch({ type: 'PROGRESS_CARD_DECK_POPPED', track: payload.track, count: payload.draws.length })
```

- [ ] **Step 9: `resetGame` — `devDeck`/`progressCardDecks`**

Read `App.tsx:6422-6427` first.

Find:
```tsx
    setDevDeck(shuffle(buildDevCardDeck(effectiveRules.victoryPointTarget)))
    setProgressCardDecks({
      science: buildProgressCardDeck('science'),
      trade: buildProgressCardDeck('trade'),
      politics: buildProgressCardDeck('politics'),
    })
```

Replace:
```tsx
    dispatch({ type: 'DEV_DECK_SET', deck: shuffle(buildDevCardDeck(effectiveRules.victoryPointTarget)) })
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'science', deck: buildProgressCardDeck('science') })
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'trade', deck: buildProgressCardDeck('trade') })
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'politics', deck: buildProgressCardDeck('politics') })
```

- [ ] **Step 10: `restoreFromSnapshot` — `devDeck` (required snapshot field)**

Read `App.tsx:6634` first.

Find:
```tsx
    setDevDeck(snapshot.devDeck)
```

Replace:
```tsx
    dispatch({ type: 'DEV_DECK_SET', deck: snapshot.devDeck })
```

- [ ] **Step 11: `restoreFromSnapshot` — `progressCardDecks` (optional snapshot field)**

Read `App.tsx:6732-6744` first.

Find:
```tsx
    setProgressCardDecks(
      snapshot.progressCardDecks ?? {
        science: buildProgressCardDeck('science'),
        trade: buildProgressCardDeck('trade'),
        politics: buildProgressCardDeck('politics'),
      },
    )
```

Replace:
```tsx
    const restoredProgressCardDecks = snapshot.progressCardDecks ?? {
      science: buildProgressCardDeck('science'),
      trade: buildProgressCardDeck('trade'),
      politics: buildProgressCardDeck('politics'),
    }
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'science', deck: restoredProgressCardDecks.science })
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'trade', deck: restoredProgressCardDecks.trade })
    dispatch({ type: 'PROGRESS_CARD_DECK_SET', track: 'politics', deck: restoredProgressCardDecks.politics })
```

- [ ] **Step 12: Confirm the remaining read sites still compile unchanged**

No edits needed — verification only. Because Step 1's aliases keep `devDeck`/`progressCardDecks` as bare identifiers, every one of these keeps compiling and behaving identically:
- `buyDevCard`'s `if (devDeck.length === 0)` guard (`App.tsx:4572`)
- The autosave-snapshot object-literal shorthand (`devDeck,` / `progressCardDecks,` at `App.tsx:6892`/`6906`) and its `useEffect` dependency array (`App.tsx:6936`/`6950`)
- `GameHudProps.devDeckCount={devDeck.length}` (`App.tsx:7295`) and `progressCardDeckCounts={{ science: progressCardDecks.science.length, ... }}` (`App.tsx:7348-7352`)

- [ ] **Step 13: Typecheck**

Run: `npx tsc -p tsconfig.app.json`
Expected: clean.

- [ ] **Step 14: Run the full existing test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 15: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 16: Commit**

```bash
git add src/App.tsx
git commit -m "feat: migrate devDeck/progressCardDecks onto DecksState"
```

---

### Task 3: Migrate `longestRoadHolderId` + `largestArmyHolderId` + `metropolisHolders` + `metropolisVertexIds` (`TrophiesState` fields) in `App.tsx`

**Files:**
- Modify: `catan-3d/src/App.tsx`

**Interfaces:**
- Consumes: `TrophiesState.longestRoadHolderId`/`largestArmyHolderId`/`metropolisHolders`/`metropolisVertexIds`, `TrophiesAction`'s `LONGEST_ROAD_HOLDER_SET`/`LARGEST_ARMY_HOLDER_SET`/`METROPOLIS_CLAIMED` members (all from Task 1).
- Produces: `gameState.trophies.*` as the live source of truth in `App.tsx` — local `useState` for these 4 fields fully removed; the now-unused `MetropolisHolders` import removed.

Same verification approach as Task 2 (`npx tsc -p tsconfig.app.json` + full Vitest suite + `npm run build`; no dedicated `App.tsx` test file).

- [ ] **Step 1: Remove the now-unused `MetropolisHolders` import**

`tsconfig.app.json` has `noUnusedLocals: true`. `MetropolisHolders` is used ONLY at the `useState` declaration line Step 2 below removes — confirmed by grep, no other reference anywhere in `App.tsx` — so leaving the import in place after Step 2 breaks `npx tsc -p tsconfig.app.json`/`npm run build`. Do this step BEFORE Step 2, or do both in the same pass; order between them doesn't matter as long as both land before Step 8's typecheck.

Read `App.tsx:90-97` first (part of the large `from './game/types'` import block starting at `App.tsx:52`).

Find:
```tsx
  type KnightStrength,
  type MetropolisHolders,
  type Player,
```

Replace:
```tsx
  type KnightStrength,
  type Player,
```

- [ ] **Step 2: Replace the 4 `useState` declarations with reducer-backed aliases**

Read `App.tsx:460-473` first to confirm nothing has drifted.

Find:
```tsx
  const [longestRoadHolderId, setLongestRoadHolderId] = useState<number | null>(null)
  const [largestArmyHolderId, setLargestArmyHolderId] = useState<number | null>(null)
  // Cities & Knights Metropolis — per-track control (who currently holds
  // each track's Metropolis, for scoring) and per-track placement (which of
  // that player's own city vertices carries the marker, for the 3D board —
  // Task 7). Kept as two separate records rather than one, since control is
  // per-player but the marker itself sits on one specific city (see the
  // design note on Task 6's own plan entry).
  const [metropolisHolders, setMetropolisHolders] = useState<MetropolisHolders>({ science: null, trade: null, politics: null })
  const [metropolisVertexIds, setMetropolisVertexIds] = useState<Record<ImprovementTrack, string | null>>({
    science: null,
    trade: null,
    politics: null,
  })
```

Replace:
```tsx
  const longestRoadHolderId = gameState.trophies.longestRoadHolderId
  const largestArmyHolderId = gameState.trophies.largestArmyHolderId
  // Cities & Knights Metropolis — per-track control (who currently holds
  // each track's Metropolis, for scoring) and per-track placement (which of
  // that player's own city vertices carries the marker, for the 3D board —
  // Task 7). Kept as two separate records rather than one, since control is
  // per-player but the marker itself sits on one specific city (see the
  // design note on Task 6's own plan entry).
  const metropolisHolders = gameState.trophies.metropolisHolders
  const metropolisVertexIds = gameState.trophies.metropolisVertexIds
```

- [ ] **Step 3: `onTrophyUpdated` receiver**

Read `App.tsx:1809-1816` first.

Find:
```tsx
    onTrophyUpdated: (payload) => {
      setLongestRoadHolderId(payload.longestRoadHolderId)
      setLargestArmyHolderId(payload.largestArmyHolderId)
    },
```

Replace:
```tsx
    onTrophyUpdated: (payload) => {
      dispatch({ type: 'LONGEST_ROAD_HOLDER_SET', playerId: payload.longestRoadHolderId })
      dispatch({ type: 'LARGEST_ARMY_HOLDER_SET', playerId: payload.largestArmyHolderId })
    },
```

- [ ] **Step 4: `onMetropolisClaimed` receiver — 2 setters become 1 dispatch**

Read `App.tsx:1977-1994` first.

Find:
```tsx
    onMetropolisClaimed: (payload) => {
      // Same broadcast-sourced validation as onCityImprovementPurchased just
      // above — payload.track is used as the key both of these records are
      // written under, so an unrecognized value would quietly add a bogus
      // fourth entry that IMPROVEMENT_TRACK_ORDER-driven readers (score,
      // panel) never see, while the real track stays unclaimed.
      if (!IMPROVEMENT_TRACK_ORDER.includes(payload.track)) {
        console.error('[Catan] Ignoring malformed metropolis-claim payload:', payload)
        return
      }
      setMetropolisVertexIds((prev) => ({ ...prev, [payload.track]: payload.vertexId }))
      setMetropolisHolders((prev) => ({ ...prev, [payload.track]: payload.playerId }))
    },
```

Replace:
```tsx
    onMetropolisClaimed: (payload) => {
      // Same broadcast-sourced validation as onCityImprovementPurchased just
      // above — payload.track is used as the key both of these records are
      // written under, so an unrecognized value would quietly add a bogus
      // fourth entry that IMPROVEMENT_TRACK_ORDER-driven readers (score,
      // panel) never see, while the real track stays unclaimed.
      if (!IMPROVEMENT_TRACK_ORDER.includes(payload.track)) {
        console.error('[Catan] Ignoring malformed metropolis-claim payload:', payload)
        return
      }
      dispatch({
        type: 'METROPOLIS_CLAIMED',
        track: payload.track,
        playerId: payload.playerId,
        vertexId: payload.vertexId,
      })
    },
```

- [ ] **Step 5: The render-time trophy computation — preserve the `!==` guards exactly**

Read `App.tsx:2506-2532` first, in full, to confirm it still matches exactly. The `!==` guards on both `nextLongestRoadHolderId`/`nextLargestArmyHolderId` are **load-bearing — they prevent an infinite render loop** (this runs directly in the render body, not inside an effect — React's own "adjust state during render" pattern, self-terminating only because the condition goes false the instant state catches up). **Preserve the surrounding `if (!onlineInfo || isEffectiveHost)` and both inner `if (next !== current)` guards exactly, unchanged — convert ONLY the two innermost setter calls.**

Find:
```tsx
  if (!onlineInfo || isEffectiveHost) {
    const nextLongestRoadHolderId = pickTrophyHolder(longestRoadHolderId, longestRoadLengths, LONGEST_ROAD_MIN_LENGTH)
    if (nextLongestRoadHolderId !== longestRoadHolderId) {
      setLongestRoadHolderId(nextLongestRoadHolderId)
    }

    const nextLargestArmyHolderId = pickTrophyHolder(largestArmyHolderId, knightCounts, LARGEST_ARMY_MIN_KNIGHTS)
    if (nextLargestArmyHolderId !== largestArmyHolderId) {
      setLargestArmyHolderId(nextLargestArmyHolderId)
    }
  }
```

Replace (only the two innermost calls):
```tsx
  if (!onlineInfo || isEffectiveHost) {
    const nextLongestRoadHolderId = pickTrophyHolder(longestRoadHolderId, longestRoadLengths, LONGEST_ROAD_MIN_LENGTH)
    if (nextLongestRoadHolderId !== longestRoadHolderId) {
      dispatch({ type: 'LONGEST_ROAD_HOLDER_SET', playerId: nextLongestRoadHolderId })
    }

    const nextLargestArmyHolderId = pickTrophyHolder(largestArmyHolderId, knightCounts, LARGEST_ARMY_MIN_KNIGHTS)
    if (nextLargestArmyHolderId !== largestArmyHolderId) {
      dispatch({ type: 'LARGEST_ARMY_HOLDER_SET', playerId: nextLargestArmyHolderId })
    }
  }
```

`longestRoadLengths`/`knightCounts` (the `useMemo` Maps feeding this block, `App.tsx:2489-2504`) and the `broadcastTrophyUpdated` effect just below (`App.tsx:2541-2545`, reads `longestRoadHolderId`/`largestArmyHolderId` as bare identifiers in its dependency array and payload) are NOT touched — both keep compiling and behaving identically because Step 2's aliases preserve the bare identifiers.

- [ ] **Step 6: `buildSettlementRaw`'s `pendingMetropolisClaim` resolution branch — 2 setters become 1 dispatch**

Read `App.tsx:2732-2781` first.

Find:
```tsx
      setMetropolisVertexIds((prev) => ({ ...prev, [track]: vertexId }))
      setMetropolisHolders((prev) => ({ ...prev, [track]: nextHolderId }))
      setPendingMetropolisClaim(null)
      if (onlineInfo) broadcastMetropolisClaimed({ track, playerId: nextHolderId, vertexId })
      return
```

Replace:
```tsx
      dispatch({ type: 'METROPOLIS_CLAIMED', track, playerId: nextHolderId, vertexId })
      setPendingMetropolisClaim(null)
      if (onlineInfo) broadcastMetropolisClaimed({ track, playerId: nextHolderId, vertexId })
      return
```

`setPendingMetropolisClaim(null)` and the `broadcastMetropolisClaimed` call are untouched — `pendingMetropolisClaim` is explicitly out of scope (Global Constraint 6).

- [ ] **Step 7: `resetGame` — `longestRoadHolderId`/`largestArmyHolderId`, then `metropolisHolders`/`metropolisVertexIds`**

Read `App.tsx:6441-6450` first.

Find:
```tsx
    setLongestRoadHolderId(null)
    setLargestArmyHolderId(null)
```

Replace:
```tsx
    dispatch({ type: 'LONGEST_ROAD_HOLDER_SET', playerId: null })
    dispatch({ type: 'LARGEST_ARMY_HOLDER_SET', playerId: null })
```

Then find (a few lines further down, still inside `resetGame`):
```tsx
    setMetropolisHolders({ science: null, trade: null, politics: null })
    setMetropolisVertexIds({ science: null, trade: null, politics: null })
```

Replace:
```tsx
    dispatch({ type: 'METROPOLIS_CLAIMED', track: 'science', playerId: null, vertexId: null })
    dispatch({ type: 'METROPOLIS_CLAIMED', track: 'trade', playerId: null, vertexId: null })
    dispatch({ type: 'METROPOLIS_CLAIMED', track: 'politics', playerId: null, vertexId: null })
```

- [ ] **Step 8: `restoreFromSnapshot` — `longestRoadHolderId`/`largestArmyHolderId` (required snapshot fields), then `metropolisHolders`/`metropolisVertexIds` (optional snapshot fields)**

Read `App.tsx:6633-6641` first. `restoredMetropolisHolders`/`restoredMetropolisVertexIds` are also read later in this same function (`unresolvedMetropolisClaimTrack(...)` at `App.tsx:6666-6672`) — keep both `const` declarations exactly as they are; only their `setMetropolisHolders`/`setMetropolisVertexIds` calls convert.

Find:
```tsx
    setLongestRoadHolderId(snapshot.longestRoadHolderId)
    setLargestArmyHolderId(snapshot.largestArmyHolderId)
    const restoredMetropolisHolders = snapshot.metropolisHolders ?? { science: null, trade: null, politics: null }
    const restoredMetropolisVertexIds = snapshot.metropolisVertexIds ?? { science: null, trade: null, politics: null }
    setMetropolisHolders(restoredMetropolisHolders)
    setMetropolisVertexIds(restoredMetropolisVertexIds)
```

Replace:
```tsx
    dispatch({ type: 'LONGEST_ROAD_HOLDER_SET', playerId: snapshot.longestRoadHolderId })
    dispatch({ type: 'LARGEST_ARMY_HOLDER_SET', playerId: snapshot.largestArmyHolderId })
    const restoredMetropolisHolders = snapshot.metropolisHolders ?? { science: null, trade: null, politics: null }
    const restoredMetropolisVertexIds = snapshot.metropolisVertexIds ?? { science: null, trade: null, politics: null }
    dispatch({
      type: 'METROPOLIS_CLAIMED',
      track: 'science',
      playerId: restoredMetropolisHolders.science,
      vertexId: restoredMetropolisVertexIds.science,
    })
    dispatch({
      type: 'METROPOLIS_CLAIMED',
      track: 'trade',
      playerId: restoredMetropolisHolders.trade,
      vertexId: restoredMetropolisVertexIds.trade,
    })
    dispatch({
      type: 'METROPOLIS_CLAIMED',
      track: 'politics',
      playerId: restoredMetropolisHolders.politics,
      vertexId: restoredMetropolisVertexIds.politics,
    })
```

- [ ] **Step 9: Confirm the remaining read sites still compile unchanged**

No edits needed — verification only. Because Step 2's aliases keep all 4 fields as bare identifiers, every one of these keeps compiling and behaving identically:
- `getPlayerScore`/`getPublicScore` call sites feeding `longestRoadHolderId`/`largestArmyHolderId`/`metropolisHolders` (e.g. `App.tsx:2555-2558`, `4104-4106`, `5769-5781`)
- `evaluateMetropolisPurchase` calls and `buildSettlementRaw`'s click-time re-validation reading `metropolisHolders`/`metropolisVertexIds` (e.g. `App.tsx:2755`, `2765-2770`)
- The barbarian-attack protected-vertex computation (`App.tsx:3472`, `Object.values(metropolisVertexIds).filter(...)`)
- The autosave-snapshot object-literal shorthand (`App.tsx:6894-6897`) and its `useEffect` dependency array (`App.tsx:6938-6941`)
- `GameHudProps.longestRoadHolderId`/`largestArmyHolderId`/`metropolisHolders`/`metropolisVertexIds` props (`App.tsx:7083`, `7313`, `7315-7317`)

- [ ] **Step 10: Typecheck**

Run: `npx tsc -p tsconfig.app.json`
Expected: clean.

- [ ] **Step 11: Run the full existing test suite**

Run: `npx vitest run`
Expected: PASS, no regressions.

- [ ] **Step 12: Build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 13: Commit**

```bash
git add src/App.tsx
git commit -m "feat: migrate longestRoadHolderId/largestArmyHolderId/metropolisHolders/metropolisVertexIds onto TrophiesState"
```

---

## Self-Review

**1. Spec coverage** — all 6 fields covered: `devDeck` (Task 1 reducer + Task 2: declaration, `buyDevCard`, `onDevCardBought`, `resetGame`, `restoreFromSnapshot` — 4 mid-game/reset/restore sites), `progressCardDecks` (Task 1 + Task 2: declaration, 5 mid-game sites including the structurally-distinct winner-draw-timeout effect with its running-copy loop preserved exactly, `resetGame` widened to 3 dispatches, `restoreFromSnapshot` widened to 3 dispatches), `longestRoadHolderId`/`largestArmyHolderId` (Task 1 + Task 3: declaration, `onTrophyUpdated`, the render-time computation with both `!==` guards preserved exactly, `resetGame`, `restoreFromSnapshot`), `metropolisHolders`+`metropolisVertexIds` (Task 1 + Task 3: declaration, `onMetropolisClaimed`, `buildSettlementRaw`'s claim-resolution branch, `resetGame` widened to 3 dispatches, `restoreFromSnapshot` widened to 3 dispatches). `decks.ts`/`decks.test.ts`/`trophies.ts`/`trophies.test.ts` creation and `gameState.ts` wiring are Task 1 Steps 1-9; the 2 required `gameState.test.ts` routing tests are Task 1 Step 10 (present, one per new slice, each asserting an unrelated slice — `result.board` — keeps its reference, matching every existing routing test's own assertion shape).

**2. Placeholder scan** — no "TBD"/"implement later"/"add appropriate handling"/"similar to Task N" language anywhere in the task steps; every code block is real, complete code read from the live files this session (not paraphrased or invented), with one flagged, justified deviation from pure line-for-line transcription: Task 2 Step 2 (`buyDevCard`) switches `const [card, ...remaining] = devDeck` to `const card = devDeck[0]`, because `DEV_CARD_DRAWN`'s no-payload design (mandated by the brief, matching `onDevCardBought`'s identical treatment) moves the array-shrinking into the reducer, leaving a destructured `remaining` unused — which `noUnusedLocals: true` would reject. This is called out explicitly in that step's own prose, not silently changed.

**3. Type/signature consistency** — checked across all 3 tasks: `DecksState`/`DecksAction`/`reduceDecks`/`initialDecksState` and `TrophiesState`/`TrophiesAction`/`reduceTrophies`/`initialTrophiesState` names and signatures introduced in Task 1 are used identically in Tasks 2/3 (no renaming drift). `PROGRESS_CARD_DECK_SET`'s `{ track, deck }` shape is used consistently at all 5 mid-game sites plus 3+3 reset/restore dispatches. `METROPOLIS_CLAIMED`'s `{ track, playerId, vertexId }` shape is used consistently at both mid-game sites plus 3+3 reset/restore dispatches. Import paths were independently verified against the live exports this session and corrected against the brief's own guesses in two places: `ProgressCardType` is exported from `game/types.ts`, not `game/progressCards.ts` as guessed; `MetropolisHolders` is exported from `game/types.ts`, not `game/cityImprovements.ts` as guessed (only `MetropolisVertexIds` actually lives in `cityImprovements.ts`). A third, brief-independent finding: `tsconfig.app.json`'s `noUnusedLocals: true` requires Task 3 to delete the now-orphaned `MetropolisHolders` import (Task 3 Step 1) — confirmed by grep that it has no other use in `App.tsx`, and confirmed `DevCardType`/`ProgressCardType` do NOT have the same problem (both remain used at multiple other sites after Task 2).

No gaps found requiring an added task; the plan's task decomposition (3 tasks: reducer-slice construction + routing tests, `DecksState` migration, `TrophiesState` migration) matches the brief's own target exactly, no restructuring needed.
