import type { GameState } from './game/gameState'
import type { DevCardType } from './game/types'
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
  // biomes — e.g. the dev-card purchase scenario needs a vertex touching
  // mountains/fields/pasture so the setup-phase second-settlement resource
  // kickstart (BoardGraph's own vertexTileIds, same source this mirrors)
  // guarantees buyDevCard's 1 ore + 1 grain + 1 wool cost is affordable
  // immediately, with no dependency on dice luck.
  vertexTileIds: Record<string, string[]>
  tiles: { id: string; biome: Biome }[]
}

export interface CatanTestHarness {
  actions: {
    buildSettlement: (vertexId: string) => void
    buildRoad: (edgeId: string) => void
    buildShip: (edgeId: string) => void
    rollDice: () => void
    buyDevCard: () => void
    playDevCard: (card: DevCardType) => void
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
