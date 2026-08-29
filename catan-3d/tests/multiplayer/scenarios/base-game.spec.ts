// catan-3d/tests/multiplayer/scenarios/base-game.spec.ts
import { test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import type { TestHarnessGraph } from '../../../src/testHarness'

// Picks `count` vertex ids spread evenly across the board (sorted by
// diagonal position), for setup-phase settlement placement. The
// distance rule only requires 2+ edges of separation between
// settlements; spreading picks across the whole board's coordinate
// range gives far more separation than that on a board this size, so
// this doesn't need to reason about the graph's actual edge distances.
function pickSpreadVertices(graph: TestHarnessGraph, count: number): string[] {
  const sorted = [...graph.vertices].sort((a, b) => a.x + a.z - (b.x + b.z))
  const picks: string[] = []
  for (let i = 0; i < count; i++) {
    const index = Math.floor((i * (sorted.length - 1)) / (count - 1))
    picks.push(sorted[index].id)
  }
  return picks
}

function firstEdgeAt(graph: TestHarnessGraph, vertexId: string): string {
  const edgeId = graph.vertexEdgeIds[vertexId]?.[0]
  if (!edgeId) throw new Error(`No edge found touching vertex ${vertexId}`)
  return edgeId
}

test('setup phase (4 settlements + roads) then a roll from each player', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    const roomCode = await hostRoom(pageA)
    await joinRoom(pageB, 'Joiner', roomCode)
    await startWhenFull(pageA)
    await waitForGameStarted(pageA)
    await waitForGameStarted(pageB)
    await assertConnected(pageA, 'host')
    await assertConnected(pageB, 'joiner')

    const graph = await pageA.evaluate(() => window.__catanTestHarness!.getGraph())
    const [v1, v2, v3, v4] = pickSpreadVertices(graph, 4)
    const [e1, e2, e3, e4] = [v1, v2, v3, v4].map((v) => firstEdgeAt(graph, v))

    // Setup order for 2 players is [starter, other, other, starter] — but
    // WHICH seat starts is randomized per room (App.tsx's startingPlayerIndex
    // is seeded off the room code, specifically so the host isn't guaranteed
    // to go first every match — see the comment at App.tsx:326-328). A fixed
    // "A always starts" step list is wrong more often than not: confirmed via
    // a live run where the host's very first buildSettlement was rejected
    // with "It's not your turn." because the joiner had been picked to start
    // instead. Read the real starting actor from isMyTurn (already reliable
    // during setup — it compares against the same currentPlayerIndex setup
    // gating uses) instead of assuming.
    const aStatus = await pageA.evaluate(() => window.__catanTestHarness!.getStatus())
    const starter: Actor = aStatus.isMyTurn ? 'A' : 'B'
    const other: Actor = starter === 'A' ? 'B' : 'A'

    const steps: ScenarioStep[] = [
      { actor: starter, action: 'buildSettlement', args: [v1] },
      { actor: starter, action: 'buildRoad', args: [e1] },
      { actor: other, action: 'buildSettlement', args: [v2] },
      { actor: other, action: 'buildRoad', args: [e2] },
      { actor: other, action: 'buildSettlement', args: [v3] },
      { actor: other, action: 'buildRoad', args: [e3] },
      { actor: starter, action: 'buildSettlement', args: [v4] },
      { actor: starter, action: 'buildRoad', args: [e4] },
      { actor: starter, action: 'rollDice' },
      { actor: starter, action: 'endTurn' },
      { actor: other, action: 'rollDice' },
      { actor: other, action: 'endTurn' },
    ]

    await runScenario(pageA, pageB, steps)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
