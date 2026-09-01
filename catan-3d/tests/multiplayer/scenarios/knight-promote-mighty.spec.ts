// catan-3d/tests/multiplayer/scenarios/knight-promote-mighty.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, resolvePostRollObligations, callHarnessAction } from '../scenarioHelpers'
import { CITY_COST, KNIGHT_RECRUIT_COST, KNIGHT_PROMOTE_COST, KNIGHT_STARTING_SUPPLY } from '../../../src/game/types'

// Closes a real gap PR #92's own history flagged but didn't fix: that PR
// only ever promoted basic -> strong, which needs no city-improvement
// level at all — strong -> mighty is gated on Politics level 3
// (MIGHTY_KNIGHT_POLITICS_LEVEL, game/knights.ts), never exercised by any
// scenario since. Found via a direct grep of every `cityImprovements`
// read site after the original harness roadmap was fully cleared (PR #97).
//
// A knight can only be promoted ONCE per turn (`knightsPromotedThisTurn`,
// checked in App.tsx's promoteKnight, reset on TURN_ADVANCED) — basic ->
// strong and strong -> mighty for the SAME knight instance must happen on
// two DIFFERENT turns, hence the endTurn/rollDice cycle between them below.
test('a knight can be promoted all the way to mighty once Politics reaches level 3', async ({ browser }) => {
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

    const stateAfterSetup = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterId = stateAfterSetup.players[stateAfterSetup.turn.currentPlayerIndex].id

    // --- Starter's turn 1: build a city, climb Politics to exactly level 3
    // (improvementLevelCost(level) === level, so 1+2+3 = 6 coin), recruit a
    // knight, and promote it basic -> strong (needs no level at all).
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [CITY_COST] },
      { actor: starter, action: 'buildSettlement', args: [v1] },
      { actor: starter, action: 'grantResources', args: [undefined, { coin: 6 }] },
      { actor: starter, action: 'buyCityImprovement', args: ['politics'] },
      { actor: starter, action: 'buyCityImprovement', args: ['politics'] },
      { actor: starter, action: 'buyCityImprovement', args: ['politics'] },
    ])
    const afterPolitics = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    expect(afterPolitics.players.find((p) => p.id === starterId)!.cityImprovements.politics, 'starter should be at Politics level 3').toBe(3)

    const e1Edge = graph.edges.find((e) => e.id === e1)!
    const recruitVertex = e1Edge.a === v1 ? e1Edge.b : e1Edge.a
    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantResources', args: [KNIGHT_RECRUIT_COST] }])
    await callHarnessAction(starterPage, 'armKnightRecruit')
    await runScenario(pageA, pageB, [{ actor: starter, action: 'selectKnightVertex', args: [recruitVertex] }])

    const afterRecruit = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const knightId = afterRecruit.players.find((p) => p.id === starterId)!.knightPieces[0].id
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [KNIGHT_PROMOTE_COST] },
      { actor: starter, action: 'promoteKnight', args: [knightId] },
    ])
    const afterFirstPromote = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    expect(
      afterFirstPromote.players.find((p) => p.id === starterId)!.knightPieces.find((k) => k.id === knightId)!.strength,
      'first promotion should reach strong',
    ).toBe('strong')
    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])

    // --- Other's turn: nothing knight-related, just advances the turn so
    // knightsPromotedThisTurn resets (TURN_ADVANCED, game/reducers/progress.ts)
    // and the SAME knight becomes eligible to promote again.
    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, other, graph)
    await runScenario(pageA, pageB, [{ actor: other, action: 'endTurn' }])

    // --- Back to starter: promote strong -> mighty, now that Politics is
    // at level 3.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    const beforeSecondPromote = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterWoolBefore = beforeSecondPromote.players.find((p) => p.id === starterId)!.resources.wool
    const starterOreBefore = beforeSecondPromote.players.find((p) => p.id === starterId)!.resources.ore
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [KNIGHT_PROMOTE_COST] },
      { actor: starter, action: 'promoteKnight', args: [knightId] },
    ])

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    const finalStarter = finalStateA.players.find((p) => p.id === starterId)!
    expect(finalStarter.knightPieces.find((k) => k.id === knightId)!.strength, 'second promotion should reach mighty').toBe(
      'mighty',
    )
    // KNIGHT_PROMOTE_COST was granted then immediately spent — net resources
    // should be unchanged from just before this specific promotion (same
    // "actually asserts the deduction happened" discipline PR #92's own
    // CodeRabbit-caught gap established, not just trusting the grant).
    expect(finalStarter.resources.wool, 'the second promotion should actually deduct KNIGHT_PROMOTE_COST wool').toBe(starterWoolBefore)
    expect(finalStarter.resources.ore, 'the second promotion should actually deduct KNIGHT_PROMOTE_COST ore').toBe(starterOreBefore)
    // Two round-trip promotions (basic->strong->mighty) net exactly to the
    // starting supply minus 1 mighty — basic/strong each got one knight out
    // and one knight back.
    expect(finalStarter.knightSupply, 'knightSupply should net to starting values minus 1 mighty').toEqual({
      ...KNIGHT_STARTING_SUPPLY,
      mighty: KNIGHT_STARTING_SUPPLY.mighty - 1,
    })
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
