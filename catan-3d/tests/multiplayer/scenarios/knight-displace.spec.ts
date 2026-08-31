// catan-3d/tests/multiplayer/scenarios/knight-displace.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, secondEdgeAt, neighborsOf, pickSpreadVertices, resolvePostRollObligations, callHarnessAction } from '../scenarioHelpers'
import { KNIGHT_RECRUIT_COST, KNIGHT_PROMOTE_COST, KNIGHT_ACTIVATE_COST, ROAD_COST } from '../../../src/game/types'

// Last knight-lifecycle primitive, completing recruit (PR #90) + activate
// (PR #90) + move (PR #91) + promote (PR #92). Needed a genuinely
// different board setup than every other scenario in this suite: Displace
// requires an OPPONENT's knight to be reachable from the mover's OWN road
// network (knightDisplaceTargets -> reachableOpponentKnights ->
// reachableVertices, game/knights.ts — the adjacency is built ONLY from
// edges the MOVER owns a road on, ownRoadAdjacency, confirmed by reading
// it directly). Every other scenario uses pickSpreadVertices to
// deliberately MAXIMIZE separation between the two players' territory —
// exactly wrong for this one, so starter and other's first placements are
// built close together instead, via a specific 3-edge chain:
//   v1 (starter) --e1-- knightVertexA --e2-- targetVertex --e3-- v2 (other)
// e2 is a SECOND road starter builds (extending past their own knight),
// putting targetVertex within starter's own reachability. e3 is simply
// other's own SETUP road (touches their settlement v2 and targetVertex
// directly) — no extra construction needed on other's side at all.
//
// This topology also naturally puts the displaced knight nowhere to go:
// other's only road-reachable vertex from targetVertex is their own
// settlement v2, which knightMoveTargets excludes (can't land a knight on
// a building) — so the displaced knight is removed to supply
// (displacedVertexId: null), not moved to a new vertex. That's a real,
// distinct CN3087-documented outcome (KNIGHT_DISPLACED's reducer case has
// a dedicated branch for it), not a scenario design compromise.
test('a stronger knight can displace a weaker one, removing it to supply when nowhere to go', async ({ browser }) => {
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

    const [v1, v3, v4] = pickSpreadVertices(graph, 3)
    const e1 = firstEdgeAt(graph, v1)
    const e1Edge = graph.edges.find((e) => e.id === e1)!
    const knightVertexA = e1Edge.a === v1 ? e1Edge.b : e1Edge.a
    const e2 = secondEdgeAt(graph, knightVertexA, e1)
    const e2Edge = graph.edges.find((e) => e.id === e2)!
    const targetVertex = e2Edge.a === knightVertexA ? e2Edge.b : e2Edge.a
    const e3 = secondEdgeAt(graph, targetVertex, e2)
    const e3Edge = graph.edges.find((e) => e.id === e3)!
    const v2 = e3Edge.a === targetVertex ? e3Edge.b : e3Edge.a

    // Distance rule (settlements only, not knight/road vertices) — v2 is
    // the one vertex NOT chosen via pickSpreadVertices' own wide-separation
    // guarantee, so it's the one actually at risk of landing adjacent to
    // v1. A collision here is a board-topology edge case, same accepted
    // "loud failure over silent wrong" tradeoff the Diplomacy scenario's
    // own comment already established — not worth a full backtracking
    // search for.
    if (neighborsOf(graph, v1).includes(v2)) {
      throw new Error('knight-displace.spec.ts: v2 landed adjacent to v1 on this board — cannot build a legal setup')
    }

    const e4 = firstEdgeAt(graph, v3)
    const e5 = firstEdgeAt(graph, v4)

    const aStatus = await pageA.evaluate(() => window.__catanTestHarness!.getStatus())
    const starter: Actor = aStatus.isMyTurn ? 'A' : 'B'
    const other: Actor = starter === 'A' ? 'B' : 'A'
    const starterPage = starter === 'A' ? pageA : pageB

    const setupSteps: ScenarioStep[] = [
      { actor: starter, action: 'buildSettlement', args: [v1] },
      { actor: starter, action: 'buildRoad', args: [e1] },
      { actor: other, action: 'buildSettlement', args: [v2] },
      { actor: other, action: 'buildRoad', args: [e3] },
      { actor: other, action: 'buildSettlement', args: [v3] },
      { actor: other, action: 'buildRoad', args: [e4] },
      { actor: starter, action: 'buildSettlement', args: [v4] },
      { actor: starter, action: 'buildRoad', args: [e5] },
    ]
    await runScenario(pageA, pageB, setupSteps)

    // --- Starter's turn: recruit at knightVertexA, extend the network to
    // targetVertex with a second road, promote to strong, activate.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantResources', args: [KNIGHT_RECRUIT_COST] }])
    await callHarnessAction(starterPage, 'armKnightRecruit')
    await runScenario(pageA, pageB, [{ actor: starter, action: 'selectKnightVertex', args: [knightVertexA] }])

    const afterStarterRecruit = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterId = afterStarterRecruit.players[afterStarterRecruit.turn.currentPlayerIndex].id
    const otherId = afterStarterRecruit.players.find((p) => p.id !== starterId)!.id
    const starterKnightId = afterStarterRecruit.players.find((p) => p.id === starterId)!.knightPieces[0].id

    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [ROAD_COST] },
      { actor: starter, action: 'buildRoad', args: [e2] },
      { actor: starter, action: 'grantResources', args: [KNIGHT_PROMOTE_COST] },
      { actor: starter, action: 'promoteKnight', args: [starterKnightId] },
      { actor: starter, action: 'grantResources', args: [KNIGHT_ACTIVATE_COST] },
      { actor: starter, action: 'activateKnight', args: [starterKnightId] },
      { actor: starter, action: 'endTurn' },
    ])

    // --- Other's turn: recruit AT targetVertex, using their own SETUP
    // road (e3) — no new construction needed on this side at all.
    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, other, graph)
    await runScenario(pageA, pageB, [{ actor: other, action: 'grantResources', args: [KNIGHT_RECRUIT_COST] }])
    await callHarnessAction(starter === 'A' ? pageB : pageA, 'armKnightRecruit')
    await runScenario(pageA, pageB, [{ actor: other, action: 'selectKnightVertex', args: [targetVertex] }])

    const afterOtherRecruit = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const otherKnightId = afterOtherRecruit.players.find((p) => p.id === otherId)!.knightPieces[0].id
    const otherBasicSupplyBefore = afterOtherRecruit.players.find((p) => p.id === otherId)!.knightSupply.basic
    await runScenario(pageA, pageB, [{ actor: other, action: 'endTurn' }])

    // --- Back to starter: arm + resolve Displace. armKnightDisplace
    // touches no synced state at all — same bypass category as
    // armKnightMove/armKnightRecruit.
    await callHarnessAction(starterPage, 'armKnightDisplace', [starterKnightId])
    await runScenario(pageA, pageB, [{ actor: starter, action: 'selectDisplaceTarget', args: [otherKnightId] }])

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    const finalStarter = finalStateA.players.find((p) => p.id === starterId)!
    const finalOther = finalStateA.players.find((p) => p.id === otherId)!
    const finalStarterKnight = finalStarter.knightPieces.find((k) => k.id === starterKnightId)!
    expect(finalStarterKnight.vertexId, "the mover should occupy the displaced knight's old vertex").toBe(targetVertex)
    expect(finalStarterKnight.active, 'the mover should go inactive after displacing').toBe(false)
    expect(
      finalOther.knightPieces.find((k) => k.id === otherKnightId),
      'the displaced knight should be removed entirely (nowhere reachable to move it to)',
    ).toBeUndefined()
    expect(finalOther.knightSupply.basic, "the displaced knight's strength should return to other's supply").toBe(
      otherBasicSupplyBefore + 1,
    )
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
