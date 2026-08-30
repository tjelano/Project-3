import type { GameState } from './game/gameState'
import type { DevCardType } from './game/types'

// Plain, JSON-safe shape for the board graph — BoardGraph itself
// (data/boardGraph.ts) carries several fields as native Map objects,
// which silently serialize to `{}` across Playwright's page.evaluate()
// boundary. getGraph() converts them before returning.
export interface TestHarnessGraph {
  vertices: { id: string; x: number; z: number }[]
  edges: { id: string; a: string; b: string }[]
  vertexEdgeIds: Record<string, string[]>
}

export interface CatanTestHarness {
  actions: {
    buildSettlement: (vertexId: string) => void
    buildRoad: (edgeId: string) => void
    buildShip: (edgeId: string) => void
    rollDice: () => void
    buyDevCard: () => void
    playDevCard: (card: DevCardType) => void
    // Unlike every other action here, endTurn has no legality guard of
    // its own (no canPerformAction/isMyTurn/phase check) — the real UI
    // gates it by only rendering the button when it's valid, which the
    // test hook bypasses by design. A scenario step that calls this at
    // the wrong time won't set getLastWarning(); it will silently
    // advance the turn and broadcast, manufacturing a real divergence
    // that reads as a sync bug. Scenario authors: sequence endTurn calls
    // carefully, don't rely on rejection detection to catch a mistake here.
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
