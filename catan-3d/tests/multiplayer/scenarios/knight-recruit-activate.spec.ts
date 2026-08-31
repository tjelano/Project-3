// catan-3d/tests/multiplayer/scenarios/knight-recruit-activate.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, callHarnessAction } from '../scenarioHelpers'
import { KNIGHT_RECRUIT_COST, KNIGHT_ACTIVATE_COST } from '../../../src/game/types'

// First scenario to ever touch the Cities & Knights knight system at all —
// this harness could not reach knight recruitment/activation before now
// (an earlier roadmap audit confirmed KnightLayer, the 3D-canvas component
// that normally arms/resolves these, never even mounts in test mode — but
// the plain handler functions underneath it are still directly callable).
// Scoped to just Recruit + Activate, the minimum needed to get
// defenderStrength > 0 — every existing barbarian-attack scenario can only
// ever exercise the defenders-LOSE path, since defenderStrength has been
// hard-coded 0 by construction until now. Move/Displace/Promote are
// natural follow-ups, not needed for that unlock and kept out of scope
// here (same "own PR" pattern Taxation used relative to the other Tier 2b
// cards).
test('a knight can be recruited and activated, staying converged on both clients', async ({ browser }) => {
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

    // Barbarians off — irrelevant to this scenario and a stray attack
    // could only add noise (no cities exist to pillage). Progress cards
    // stay on by default (unused here) for consistency with every other
    // C&K scenario's identical setGameRules call.
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

    // recruitableVertices (game/knights.ts) needs a vertex touching an
    // edge the player owns a road on, with no building and no knight
    // already there — e1's OTHER endpoint (not v1, which already holds
    // starter's settlement) satisfies this directly, no second edge needed
    // the way Diplomacy's own scenario required.
    const e1Edge = graph.edges.find((e) => e.id === e1)!
    const recruitVertex = e1Edge.a === v1 ? e1Edge.b : e1Edge.a

    const stateAfterSetup = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterId = stateAfterSetup.players[stateAfterSetup.turn.currentPlayerIndex].id
    const starterSupplyBefore = stateAfterSetup.players.find((p) => p.id === starterId)!.knightSupply.basic

    // No roll needed — armKnightRecruit only checks isMyTurn and
    // canRecruitKnight (cost + supply), no hasRolledThisTurn guard.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantResources', args: [KNIGHT_RECRUIT_COST] }])
    // armKnightRecruit touches no synced state at all (not even a
    // divergent one) — it only sets pendingKnightRecruit, plain local
    // React state, zero dispatch and zero broadcast. Bypasses
    // runScenario the same reason activateDiplomacy/armTaxation do.
    await callHarnessAction(starterPage, 'armKnightRecruit')
    await runScenario(pageA, pageB, [{ actor: starter, action: 'selectKnightVertex', args: [recruitVertex] }])

    const afterRecruit = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterAfterRecruit = afterRecruit.players.find((p) => p.id === starterId)!
    expect(starterAfterRecruit.knightPieces, 'exactly one basic, inactive knight at the chosen vertex').toEqual([
      { id: expect.any(String), ownerId: starterId, strength: 'basic', active: false, vertexId: recruitVertex },
    ])
    expect(starterAfterRecruit.knightSupply.basic, 'recruiting should decrement the basic supply pool by 1').toBe(
      starterSupplyBefore - 1,
    )

    const knightId = starterAfterRecruit.knightPieces[0].id
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [KNIGHT_ACTIVATE_COST] },
      { actor: starter, action: 'activateKnight', args: [knightId] },
    ])

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    const finalStarterA = finalStateA.players.find((p) => p.id === starterId)!
    expect(finalStarterA.knightPieces.find((k) => k.id === knightId)?.active, 'the knight should now be active').toBe(true)
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
