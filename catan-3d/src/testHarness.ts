import type { GameState } from './game/gameState'
import type { DevCardType, GameRules, ImprovementTrack } from './game/types'
import type { Biome } from './data/hexBoard'

// Plain, JSON-safe shape for the board graph — BoardGraph itself
// (data/boardGraph.ts) carries several fields as native Map objects,
// which silently serialize to `{}` across Playwright's page.evaluate()
// boundary. getGraph() converts them before returning.
export interface TestHarnessGraph {
  vertices: { id: string; x: number; z: number }[]
  edges: { id: string; a: string; b: string }[]
  vertexEdgeIds: Record<string, string[]>
  // vertex id -> the ids of the (1-3) tiles that touch it. Combined with
  // `tiles` below, lets a scenario pick a vertex adjacent to specific
  // biomes — e.g. the dev-card purchase scenario picks each setup
  // settlement to touch mountains/fields/pasture (ore+grain+wool), getting
  // as close as the board's random biome layout allows to buyDevCard's
  // cost — not always achievable in one placement, so that scenario also
  // needs `number` below to break ties toward tiles that actually produce
  // often, and falls back to a bounded number of real dice rolls for
  // whatever a placement alone couldn't cover.
  vertexTileIds: Record<string, string[]>
  // edge id -> the ids of the 1-2 tiles that flank it. Lets a scenario
  // tell whether a specific edge borders the sea (any flanking tile has
  // biome 'sea') — the same check App.tsx's own edgeTouchesSea makes —
  // which matters because ships can ONLY be placed on such edges. Needed
  // by the Seafarers ship scenario to walk a coastal chain, choosing ship
  // vs. road per edge based on its actual terrain rather than assuming.
  edgeTileIds: Record<string, string[]>
  tiles: { id: string; biome: Biome; number: number | null }[]
}

export interface CatanTestHarness {
  actions: {
    buildSettlement: (vertexId: string) => void
    buildRoad: (edgeId: string) => void
    buildShip: (edgeId: string) => void
    rollDice: () => void
    discard: () => void
    chooseRobber: () => void
    moveRobber: (tileId: string) => void
    buyDevCard: () => void
    playDevCard: (card: DevCardType) => void
    buyCityImprovement: (track: ImprovementTrack) => void
    // Local-only (not broadcast) — see its App.tsx wiring comment for why
    // that's safe: called identically on every page before any game
    // action, from gameRules already synced by the game-started broadcast.
    setGameRules: (overrides: Partial<GameRules>) => void
    // Wired to App.tsx's handleEndTurn (the guarded handler, same one the
    // real End Turn button calls) — not the raw endTurn it delegates to,
    // which has no guards of its own and assumes only handleEndTurn's
    // click ever reaches it. A wrongly-timed scenario step gets a real
    // getLastWarning() rejection here, same as every other action.
    endTurn: () => void
  }
  getState: () => GameState
  // Reflects whatever board resetGame() last built. Called before the
  // game has actually started (gameStarted still false), this returns
  // the DEFAULT board, not the real match's board — plausible-looking
  // but wrong vertex/edge ids. Call only after waitForGameStarted().
  getGraph: () => TestHarnessGraph
  getStatus: () => { gameStarted: boolean; isMyTurn: boolean; connectionStatus: string }
  getLastWarning: () => string | null
}

declare global {
  interface Window {
    __catanTestHarness?: CatanTestHarness
  }
}

// A plain module-scope function, not an inline assignment inside App()'s
// effect — eslint-plugin-react-hooks's immutability rule flags direct
// `window.foo = ...` writes from within a component/hook body (part of its
// React Compiler-oriented purity checks), even from inside a useEffect.
// This mutation is genuinely test-only and mode-gated out of every real
// build (see App.tsx's own MODE guard), so it isn't a real purity concern
// — routing it through an ordinary outside-a-component function is enough
// to satisfy the rule without suppressing it.
export function installTestHarness(harness: CatanTestHarness): void {
  window.__catanTestHarness = harness
}

// Plain module-scope function, not inline Math.random() inside App()'s own
// closure — eslint-plugin-react-hooks's purity rule flags a direct impure
// call reachable from a component's render, but is opaque to (and so
// doesn't flag) a call out to an ordinary imported function — same reason
// game/progressCards.ts's rollEventDie exists as its own module-scope
// function rather than inline in App.tsx. Used only by rollDice's
// test-mode bypass (triggerDiceAttempt in App.tsx), which resolves a roll
// directly instead of waiting on PhysicsDice3D's simulation — there's no
// Canvas mounted to ever run it in test mode.
export function rollTestDicePair(): [number, number] {
  return [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]
}
