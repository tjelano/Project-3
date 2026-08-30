// catan-3d/tests/multiplayer/scenarios/ship-longest-route.spec.ts
import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor } from '../harness'
import {
  firstEdgeAt,
  occupy,
  findBestBiomeVertex,
  findShipCapeWithChain,
  pageForActor,
  resolvePostRollObligations,
} from '../scenarioHelpers'
import type { TestHarnessGraph } from '../../../src/testHarness'
import type { Biome } from '../../../src/data/hexBoard'
import type { Resources } from '../../../src/game/types'
import { LONGEST_ROAD_MIN_LENGTH } from '../../../src/game/types'

// SHIP_COST, game/types.ts:378 — { lumber: 1, wool: 1 }.
function hasShipCost(resources: Resources): boolean {
  return resources.lumber >= 1 && resources.wool >= 1
}

async function getCurrentPlayerResources(page: Page): Promise<Resources> {
  const state = await page.evaluate(() => window.__catanTestHarness!.getState())
  return state.players[state.turn.currentPlayerIndex].resources
}

// Every vertex the chain actually passes through, cape included — walked
// from the edge list since findShipChain only returns edge ids. Most of
// these are pure-ocean vertices findBestBiomeVertex would never pick
// anyway, but a chain hugging a re-entrant coastline COULD touch land at a
// different tile than the one that makes its own edges open-ocean; feeding
// all of them through occupy() (same distance-rule exclusion used for every
// real settlement pick) rules out `other`'s v2/v3 landing a settlement on
// or next to the route and silently breaking it (calculateLongestRoad
// treats an opponent-owned vertex mid-route as a hard stop).
function chainVertices(graph: TestHarnessGraph, startVertexId: string, chain: string[]): string[] {
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]))
  const vertices = [startVertexId]
  let current = startVertexId
  for (const edgeId of chain) {
    const edge = edgeById.get(edgeId)!
    current = edge.a === current ? edge.b : edge.a
    vertices.push(current)
  }
  return vertices
}

// Builds the remaining chain edges (index >= 1 — index 0 is the setup-phase
// free ship, already placed) in order, a real turn at a time. Same bounded
// catch-up shape as dev-card-purchase.spec.ts's buyDevCardWithCatchup: roll,
// resolve obligations, spend down to SHIP_COST while affordable (a single
// good roll can fund more than one hop), end turn, let `other` take theirs,
// repeat. Chain edges are vertex-connected by construction
// (findShipChain walks vertex to vertex), so building them strictly in
// order always satisfies buildShip's own connectivity guard.
async function buildRemainingChainWithCatchup(
  pageA: Page,
  pageB: Page,
  actor: Actor,
  other: Actor,
  graph: TestHarnessGraph,
  remainingEdges: string[],
  maxRounds: number,
): Promise<void> {
  let cursor = 0
  for (let round = 0; round < maxRounds && cursor < remainingEdges.length; round++) {
    await runScenario(pageA, pageB, [{ actor, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, actor, graph)

    while (cursor < remainingEdges.length) {
      const resources = await getCurrentPlayerResources(pageForActor(pageA, pageB, actor))
      if (!hasShipCost(resources)) break
      await runScenario(pageA, pageB, [{ actor, action: 'buildShip', args: [remainingEdges[cursor]] }])
      cursor += 1
    }
    if (cursor >= remainingEdges.length) return

    await runScenario(pageA, pageB, [{ actor, action: 'endTurn' }])
    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, other, graph)
    await runScenario(pageA, pageB, [{ actor: other, action: 'endTurn' }])
  }
  if (cursor < remainingEdges.length) {
    throw new Error(
      `${actor} only placed ${cursor}/${remainingEdges.length} remaining ships (lumber+wool) within ${maxRounds} of their own turns`,
    )
  }
}

test('a 5-edge all-ship chain earns Longest Route and stays converged', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    const roomCode = await hostRoom(pageA, { seafarers: true })
    await joinRoom(pageB, 'Joiner', roomCode)
    await startWhenFull(pageA)
    await waitForGameStarted(pageA)
    await waitForGameStarted(pageB)
    await assertConnected(pageA, 'host')
    await assertConnected(pageB, 'joiner')

    const graph = await pageA.evaluate(() => window.__catanTestHarness!.getGraph())

    // Same starter/other derivation as base-game.spec.ts and
    // dev-card-purchase.spec.ts — starting seat is randomized per room
    // (App.tsx:326-328), not always the host.
    const aStatus = await pageA.evaluate(() => window.__catanTestHarness!.getStatus())
    const starter: Actor = aStatus.isMyTurn ? 'A' : 'B'
    const other: Actor = starter === 'A' ? 'B' : 'A'
    // Game state isn't per-viewer, so reading it from pageA is valid
    // regardless of whether pageA is the starter — turn.currentPlayerIndex
    // at this pre-setup moment always indexes the starter's own seat.
    const preSetupState = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterPlayerId = preSetupState.players[preSetupState.turn.currentPlayerIndex].id

    // The chain anchor is `starter`'s SECOND setup settlement (the one that
    // grants the setup-substitution free ship, CN3083 p.3) — found and
    // reserved FIRST, before any other vertex pick, so no other placement
    // can accidentally claim it or a neighbor.
    const occupied = new Set<string>()
    const { vertexId: capeVertexId, chain } = findShipCapeWithChain(graph, occupied, LONGEST_ROAD_MIN_LENGTH)
    for (const v of chainVertices(graph, capeVertexId, chain)) occupy(occupied, graph, v)

    const LUMBER_WOOL: Biome[] = ['forest', 'pasture']
    const ANY_LAND: Biome[] = ['forest', 'pasture', 'fields', 'hills', 'mountains']
    // starter's first settlement (v1, no kickstart) — biased toward
    // lumber/wool too, since starter is the one funding the chain's
    // remaining 4 ships out of ongoing production.
    const v1 = findBestBiomeVertex(graph, LUMBER_WOOL, occupied)
    occupy(occupied, graph, v1)
    // other's two settlements: no bearing on this scenario's own goal, just
    // needs any legal, non-interfering placement.
    const v2 = findBestBiomeVertex(graph, ANY_LAND, occupied)
    occupy(occupied, graph, v2)
    const v3 = findBestBiomeVertex(graph, ANY_LAND, occupied)
    occupy(occupied, graph, v3)

    const e1 = firstEdgeAt(graph, v1)
    const e2 = firstEdgeAt(graph, v2)
    const e3 = firstEdgeAt(graph, v3)

    // Setup order for 2 players is [starter, other, other, starter].
    // starter's second placement (the cape) takes buildShip for its free
    // piece instead of buildRoad — chain[0] is the setup-substitution ship,
    // already known to touch capeVertexId by construction
    // (findShipCapeWithChain only returns edges starting from it).
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'buildSettlement', args: [v1] },
      { actor: starter, action: 'buildRoad', args: [e1] },
      { actor: other, action: 'buildSettlement', args: [v2] },
      { actor: other, action: 'buildRoad', args: [e2] },
      { actor: other, action: 'buildSettlement', args: [v3] },
      { actor: other, action: 'buildRoad', args: [e3] },
      { actor: starter, action: 'buildSettlement', args: [capeVertexId] },
      { actor: starter, action: 'buildShip', args: [chain[0]] },
    ])

    // 60 real turns of production, same bound and same "genuine dice
    // variance, not a logic bug" reasoning as dev-card-purchase.spec.ts's
    // MAX_CATCHUP_ROUNDS — SHIP_COST (lumber+wool) is cheaper than that
    // scenario's ore+grain+wool, but findBestBiomeVertex's lumber/wool bias
    // is still best-effort on a board whose biome layout is random.
    const MAX_CATCHUP_ROUNDS = 60
    await buildRemainingChainWithCatchup(pageA, pageB, starter, other, graph, chain.slice(1), MAX_CATCHUP_ROUNDS)

    // The trophy itself, not just sync — runScenario's per-step convergence
    // check already proves both clients agree with each other after every
    // placement, but this is the actual point of the scenario: a 5-edge
    // ALL-SHIP route (no roads in it at all) must be recognized as Longest
    // Route, same as an all-road one would be (game/trophies.ts's
    // calculateLongestRoad treats roads/ships as one combined edge set).
    const finalState = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    expect(finalState.trophies.longestRoadHolderId).toBe(starterPlayerId)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
