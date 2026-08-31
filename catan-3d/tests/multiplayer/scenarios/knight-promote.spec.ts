// catan-3d/tests/multiplayer/scenarios/knight-promote.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, callHarnessAction } from '../scenarioHelpers'
import { KNIGHT_RECRUIT_COST, KNIGHT_PROMOTE_COST } from '../../../src/game/types'

// Third knight-lifecycle primitive, following recruit+activate (PR #90) and
// move (PR #91). Built ahead of Displace deliberately: Displace requires
// the mover to be STRICTLY STRONGER than the target
// (knightDisplaceTargets, game/knights.ts) — recruiting only ever produces
// a 'basic' knight, so Displace can't be meaningfully tested at all until
// something in the harness can push a knight above 'basic' first. This
// scenario is that unlock.
//
// promoteKnight resolves immediately (no arm/resolve split, no board
// picker) — same shape as activateKnight, a real single converging step,
// no BypassAction treatment needed. basic -> strong needs no city-
// improvement level (canPromoteKnight only gates 'mighty' on
// MIGHTY_KNIGHT_POLITICS_LEVEL), so this is reachable with nothing more
// than KNIGHT_PROMOTE_COST.
test('a knight can be promoted from basic to strong, staying converged', async ({ browser }) => {
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

    // Recruit, same reasoning knight-recruit-activate.spec.ts's own
    // comments already give — no activate needed here, promoting doesn't
    // require the knight to be active.
    const e1Edge = graph.edges.find((e) => e.id === e1)!
    const recruitVertex = e1Edge.a === v1 ? e1Edge.b : e1Edge.a

    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantResources', args: [KNIGHT_RECRUIT_COST] }])
    await callHarnessAction(starterPage, 'armKnightRecruit')
    await runScenario(pageA, pageB, [{ actor: starter, action: 'selectKnightVertex', args: [recruitVertex] }])

    const afterRecruit = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterId = afterRecruit.players[afterRecruit.turn.currentPlayerIndex].id
    const starterAfterRecruit = afterRecruit.players.find((p) => p.id === starterId)!
    const knightId = starterAfterRecruit.knightPieces[0].id
    const strongSupplyBefore = starterAfterRecruit.knightSupply.strong
    const basicSupplyBefore = starterAfterRecruit.knightSupply.basic

    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [KNIGHT_PROMOTE_COST] },
      { actor: starter, action: 'promoteKnight', args: [knightId] },
    ])

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    const finalStarter = finalStateA.players.find((p) => p.id === starterId)!
    const finalKnight = finalStarter.knightPieces.find((k) => k.id === knightId)!
    expect(finalKnight.strength, 'the knight should now be strong').toBe('strong')
    expect(finalStarter.knightSupply.basic, 'promoting should return the basic supply slot').toBe(basicSupplyBefore + 1)
    expect(finalStarter.knightSupply.strong, 'promoting should consume a strong supply slot').toBe(strongSupplyBefore - 1)
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
