// Type augmentation for test harness without pulling in testHarness.ts's
// runtime dependencies (which have imports that don't work in test config).
// This file makes window.__catanTestHarness type-safe in Playwright tests.

declare global {
  interface Window {
    __catanTestHarness?: {
      actions: {
        buildSettlement: (vertexId: string) => void
        buildRoad: (edgeId: string) => void
        buildShip: (edgeId: string) => void
        rollDice: () => void
        buyDevCard: () => void
        playDevCard: (card: string) => void
        endTurn: () => void
      }
      getState: () => unknown
      getGraph: () => {
        vertices: { id: string; x: number; z: number }[]
        edges: { id: string; a: string; b: string }[]
        vertexEdgeIds: Record<string, string[]>
      }
      getStatus: () => { gameStarted: boolean; isMyTurn: boolean; connectionStatus: string }
      getLastWarning: () => string | null
    }
  }
}

// Make this file a module so it can be imported
export {}
