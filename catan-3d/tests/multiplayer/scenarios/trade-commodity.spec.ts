// catan-3d/tests/multiplayer/scenarios/trade-commodity.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, resolvePostRollObligations } from '../scenarioHelpers'
import { CITY_COST } from '../../../src/game/types'

// Cities & Knights Trade level 3 — a real 2:1 bank commodity trade
// (tradeCommodity), gated behind cityImprovements.trade >= 3, never
// exercised by any scenario before now (found via the same post-roadmap
// code audit as PR #97/#98). Lower cross-client risk than most Tier 1/2a
// scenarios — onCommodityTraded is fully trusted-apply (validates give/
// receive membership, then just dispatches; no independent per-client
// recomputation) — so the real point here is exercising the level-3 gate
// itself over a real broadcast, not hunting a desync bug.
//
// receive is deliberately a RESOURCE ('ore'), not another commodity — the
// reducer (COMMODITY_TRADED, players.ts) has a real fork resolving which
// bucket gets the +1 by membership in COMMODITY_ORDER; hitting the
// resource branch exercises that fork instead of only ever taking the
// commodity-to-commodity path.
test('a Trade level 3 player can bank-trade 2 commodities for 1 resource', async ({ browser }) => {
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

    // --- Build a city, climb Trade to exactly level 3 (1+2+3 = 6 cloth),
    // grant 2 more cloth for the trade itself.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [CITY_COST] },
      { actor: starter, action: 'buildSettlement', args: [v1] },
      { actor: starter, action: 'grantResources', args: [undefined, { cloth: 6 }] },
      { actor: starter, action: 'buyCityImprovement', args: ['trade'] },
      { actor: starter, action: 'buyCityImprovement', args: ['trade'] },
      { actor: starter, action: 'buyCityImprovement', args: ['trade'] },
    ])
    const afterTrade3 = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    expect(afterTrade3.players.find((p) => p.id === starterId)!.cityImprovements.trade, 'starter should be at Trade level 3').toBe(3)

    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantResources', args: [undefined, { cloth: 2 }] }])
    const beforeTrade = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterBefore = beforeTrade.players.find((p) => p.id === starterId)!
    const clothBefore = starterBefore.commodities.cloth
    const oreBefore = starterBefore.resources.ore

    await runScenario(pageA, pageB, [{ actor: starter, action: 'tradeCommodity', args: ['cloth', 'ore'] }])

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    const finalStarter = finalStateA.players.find((p) => p.id === starterId)!
    expect(finalStarter.commodities.cloth, 'the trade should spend exactly 2 cloth').toBe(clothBefore - 2)
    expect(finalStarter.resources.ore, 'the trade should grant exactly 1 ore').toBe(oreBefore + 1)
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
