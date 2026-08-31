// catan-3d/tests/multiplayer/scenarios/knight-move.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, secondEdgeAt, pickSpreadVertices, resolvePostRollObligations, callHarnessAction } from '../scenarioHelpers'
import { KNIGHT_RECRUIT_COST, KNIGHT_ACTIVATE_COST, ROAD_COST } from '../../../src/game/types'

// Second knight-lifecycle primitive, following knight-recruit-activate.spec.ts
// (PR #90). armKnightMove arms the SAME picker selectKnightVertex already
// resolves — handleKnightVertexSelect branches on armedKnightAction.mode
// vs. pendingKnightRecruit — so this needed only one new harness action,
// not a new resolve path.
//
// knightMoveTargets (game/knights.ts) is a BFS along the player's OWN road
// network (reachableVertices), unbounded in hop count, blocked only by an
// opponent's building/knight — a freshly-recruited knight's only reachable
// vertex is its own origin (excluded) until the network is actually
// extended, so this scenario builds one more real road first, same
// "extend the network by a hop" pattern monopoly-guild-dues-diplomacy.spec.ts
// already established for Diplomacy's own open-road requirement.
test('an active knight can move along its network and goes inactive, staying converged', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    const roomCode = await hostRoom(pageA, { citiesAndKnights: true })
    await joinRoom(pageB, 'Joiner', roomCode)
    await startWhenFull(pageA)
    await waitForGameStarted(pageA)
    await waitForGameStarted(pageB)
    await assertConnected(pageA, 'host')
    await assertConnected(pageB, 'joiner')

    await pageA.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsBarbarians: false }))
    await pageB.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsBarbarians: false }))

    const graph = await pageA.evaluate(() => window.__catanTestHarness!.getGraph())
    const [v1, v2, v3, v4] = pickSpreadVertices(graph, 4)
    const [e1, e2, e3, e4] = [v1, v2, v3, v4].map((v) => firstEdgeAt(graph, v))

    const aStatus = await pageA.evaluate(() => window.__catanTestHarness!.getStatus())
    const starter: Actor = aStatus.isMyTurn ? 'A' : 'B'
    const other: Actor = starter === 'A' ? 'B' : 'A'
    const starterPage = starter === 'A' ? pageA : pageB

    const setupSteps: ScenarioStep[] = [
      { actor: starter, action: 'buildSettlement', args: [v1] },
      { actor: starter, action: 'buildRoad', args: [e1] },
      { actor: other, action: 'buildSettlement', args: [v2] },
      { actor: other, action: 'buildRoad', args: [e2] },
      { actor: other, action: 'buildSettlement', args: [v3] },
      { actor: other, action: 'buildRoad', args: [e3] },
      { actor: starter, action: 'buildSettlement', args: [v4] },
      { actor: starter, action: 'buildRoad', args: [e4] },
    ]
    await runScenario(pageA, pageB, setupSteps)

    // Recruit + activate, same reasoning knight-recruit-activate.spec.ts's
    // own comments already give.
    const e1Edge = graph.edges.find((e) => e.id === e1)!
    const recruitVertex = e1Edge.a === v1 ? e1Edge.b : e1Edge.a

    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantResources', args: [KNIGHT_RECRUIT_COST] }])
    await callHarnessAction(starterPage, 'armKnightRecruit')
    await runScenario(pageA, pageB, [{ actor: starter, action: 'selectKnightVertex', args: [recruitVertex] }])

    const afterRecruit = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterId = afterRecruit.players[afterRecruit.turn.currentPlayerIndex].id
    const knightId = afterRecruit.players.find((p) => p.id === starterId)!.knightPieces[0].id

    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [KNIGHT_ACTIVATE_COST] },
      { actor: starter, action: 'activateKnight', args: [knightId] },
    ])

    // Extend the road network by one more hop — recruitVertex's own
    // network otherwise has nowhere empty for the knight to move to.
    // Building outside setup needs one real roll first (same
    // "must have rolled" guard every other non-setup build in this suite
    // already respects).
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    const moveEdge = secondEdgeAt(graph, recruitVertex, e1)
    const moveEdgeObj = graph.edges.find((e) => e.id === moveEdge)!
    const moveTarget = moveEdgeObj.a === recruitVertex ? moveEdgeObj.b : moveEdgeObj.a
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [ROAD_COST] },
      { actor: starter, action: 'buildRoad', args: [moveEdge] },
    ])

    // armKnightMove only sets armedKnightAction, plain local React state —
    // zero dispatch, zero broadcast — same bypass category as
    // armKnightRecruit.
    await callHarnessAction(starterPage, 'armKnightMove', [knightId])
    await runScenario(pageA, pageB, [{ actor: starter, action: 'selectKnightVertex', args: [moveTarget] }])

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    const finalKnight = finalStateA.players.find((p) => p.id === starterId)!.knightPieces.find((k) => k.id === knightId)!
    expect(finalKnight.vertexId, 'the knight should have moved to the new vertex').toBe(moveTarget)
    // CN3087: a knight goes inactive after moving — real rule, easy to
    // silently break (KNIGHT_MOVED's reducer case sets active: false
    // alongside vertexId), worth asserting explicitly rather than trusting
    // the cross-page equality check alone to notice a regression here.
    expect(finalKnight.active, 'moving should deactivate the knight').toBe(false)
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
