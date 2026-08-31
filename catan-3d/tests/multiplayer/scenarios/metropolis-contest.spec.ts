// catan-3d/tests/multiplayer/scenarios/metropolis-contest.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, resolvePostRollObligations } from '../scenarioHelpers'
import { CITY_COST } from '../../../src/game/types'

// Cities & Knights Metropolis contest/reclaim — needs no new harness
// primitive at all (audited earlier this project: buyCityImprovement is
// already exposed and auto-arms pendingMetropolisClaim the instant a
// purchase would actually flip control; buildSettlement, called again on
// the SAME already-owned city vertex, resolves it — buildSettlementRaw's
// pendingMetropolisClaim branch runs before its normal placement logic).
// Never exercised by this harness before now: every prior scenario has
// left cityImprovements at 0 for both players.
//
// Real Cities & Knights rule this test exists to exercise (CN3087 p.5):
// Metropolis control is ARRIVAL-ORDER, not highest-level-wins. The first
// player to reach level 4 on a track keeps TEMPORARY control even once a
// second player also reaches level 4 — only a level-5 arrival takes it
// away (PERMANENT control at that point). metropolisHolderAfterPurchase
// (cityImprovements.ts) encodes this; this scenario drives both halves of
// it for real: a first claim (starter reaches level 4, uncontested), then
// a genuine reclaim (other reaches level 5, taking it from starter).
test('a Metropolis claim can be contested and taken by a later, higher-level purchase', async ({ browser }) => {
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

    // Barbarians off: a stray attack mid-test could pillage a city back to
    // a settlement, which would break the "spare city" requirement a
    // Metropolis claim needs — same reasoning barbarian-attack.spec.ts's
    // own setup gives for the opposite (keeping barbarians off until it
    // WANTS one). Knights off too — unrelated to this scenario, same as
    // every other non-barbarian scenario's identical call.
    await pageA.evaluate(() =>
      window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsKnights: false, citiesAndKnightsBarbarians: false }),
    )
    await pageB.evaluate(() =>
      window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsKnights: false, citiesAndKnightsBarbarians: false }),
    )

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

    // 'science'/'paper' — arbitrary pick among the 3 tracks, no reason to
    // prefer one (COMMODITY_FOR_TRACK, game/types.ts).
    const TRACK = 'science'
    const COMMODITY = 'paper'
    // improvementLevelCost(level) === level, so climbing from 0 straight to
    // N costs 1+2+...+N. Granted up front in one call rather than metered
    // per-purchase — buyCityImprovement only ever spends what it needs, so
    // an over-grant is harmless and avoids 4-5 separate small grants.
    const costThroughLevel = (n: number) => (n * (n + 1)) / 2

    const stateNow = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterPlayerId = stateNow.players[stateNow.turn.currentPlayerIndex].id
    const otherPlayerId = stateNow.players.find((p) => p.id !== starterPlayerId)!.id

    // --- Starter's turn: build a city (via one real roll + grantResources,
    // same "buildCity" shape barbarian-attack.spec.ts already established
    // for the identical must-have-rolled guard), then climb Science to
    // level 4 and claim it — the FIRST claim on this track, so it succeeds
    // uncontested (metropolisHolderAfterPurchase: currentHolderId is null).
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [CITY_COST] },
      { actor: starter, action: 'buildSettlement', args: [v1] },
      { actor: starter, action: 'grantResources', args: [undefined, { [COMMODITY]: costThroughLevel(4) }] },
      { actor: starter, action: 'buyCityImprovement', args: [TRACK] },
      { actor: starter, action: 'buyCityImprovement', args: [TRACK] },
      { actor: starter, action: 'buyCityImprovement', args: [TRACK] },
      { actor: starter, action: 'buyCityImprovement', args: [TRACK] },
      // 4th purchase reaches level 4 and arms pendingMetropolisClaim — this
      // call resolves it (buildSettlementRaw checks pendingMetropolisClaim
      // BEFORE its normal placement logic, so re-clicking the same,
      // already-owned city vertex places the marker instead of erroring).
      { actor: starter, action: 'buildSettlement', args: [v1] },
    ])

    const midState = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    expect(midState.trophies.metropolisHolders[TRACK], 'starter should hold Science Metropolis after the first claim').toBe(
      starterPlayerId,
    )
    expect(midState.trophies.metropolisVertexIds[TRACK], "the marker should sit on starter's city").toBe(v1)

    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])

    // --- Other's turn: same city-building step, then climb Science all the
    // way to level 5. Arrival-order means `other` reaching level 4 alone
    // would NOT take control (starter, the incumbent, keeps it) — only the
    // level-5 arrival does (metropolisHolderAfterPurchase's `newLevel >= 5
    // && currentHolderLevel < 5` branch). This is the actual point of the
    // scenario: a genuine RECLAIM, not just a first claim.
    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, other, graph)
    await runScenario(pageA, pageB, [
      { actor: other, action: 'grantResources', args: [CITY_COST] },
      { actor: other, action: 'buildSettlement', args: [v2] },
      { actor: other, action: 'grantResources', args: [undefined, { [COMMODITY]: costThroughLevel(5) }] },
      { actor: other, action: 'buyCityImprovement', args: [TRACK] },
      { actor: other, action: 'buyCityImprovement', args: [TRACK] },
      { actor: other, action: 'buyCityImprovement', args: [TRACK] },
      { actor: other, action: 'buyCityImprovement', args: [TRACK] },
    ])
    // Level 4 for `other` — starter is still the incumbent, so this
    // purchase must NOT have taken control (arrival-order: matching an
    // existing holder's level doesn't flip it). Verified before the 5th
    // purchase specifically so a false pass here can't hide behind the 5th
    // purchase's own claim overwriting it moments later.
    const afterOtherLevel4 = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    expect(afterOtherLevel4.trophies.metropolisHolders[TRACK], 'reaching level 4 while starter still holds it must not flip control').toBe(
      starterPlayerId,
    )

    await runScenario(pageA, pageB, [
      { actor: other, action: 'buyCityImprovement', args: [TRACK] },
      // 5th purchase (level 5) takes control from starter — resolves the
      // same way the first claim did, on other's own (different) city.
      { actor: other, action: 'buildSettlement', args: [v2] },
    ])

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    expect(finalStateA.trophies.metropolisHolders[TRACK], 'other should now hold Science Metropolis').toBe(otherPlayerId)
    expect(finalStateA.trophies.metropolisVertexIds[TRACK], "the marker should have moved to other's city").toBe(v2)
    expect(finalStateB.trophies, 'both pages must agree on the final Metropolis holder/vertex').toEqual(finalStateA.trophies)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
