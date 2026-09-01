// catan-3d/tests/multiplayer/scenarios/science-free-resource.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, resolvePostRollObligations } from '../scenarioHelpers'
import { CITY_COST } from '../../../src/game/types'

// Cities & Knights Science level 3 — CN3087 p.8: a player at Science level 3
// or higher who produces NOTHING on a non-7 roll (ANY roll, not just their
// own turn — confirmed by reading the eligibility check in App.tsx directly)
// gets to pick 1 free resource from the bank. Genuinely untested by this
// harness before now: the only prior scenario to ever raise a track past
// level 0 (metropolis-contest.spec.ts) bought all its levels in one batch
// mid-turn with no further roll afterward, so this bonus's own queue
// (scienceFreeResourcePlayerIds, pendingQueues) never actually got exercised.
//
// The real risk this closes: eligibility (`cityImprovements.science >= 3 &&
// !playersWithProduction.has(p.id)`) is recomputed independently by EACH
// client from its own already-synced production/improvement data on every
// single roll — the identical "independently recomputed per client" shape
// as the two real desync bugs this harness has already caught (dev-card and
// progress-card deck drift). The queue MERGES rather than replaces across
// rolls (own comment: "a player queued from an earlier roll who hasn't
// resolved their pick yet... must stay queued"), so this scenario doesn't
// need to resolve the instant it appears — it can keep rolling past it and
// resolve afterward, same as a real (possibly slow/AFK) player would.
const MAX_ROUNDS = 25

test("a Science level 3 player gets a free resource on a non-7, zero-production roll", async ({ browser }) => {
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

    // Barbarians off — same reasoning every non-barbarian scenario already
    // gives: a stray attack mid-loop could pillage starter's city back to a
    // settlement, and a pillaged/rebuilt city has no bearing on this
    // scenario's own point.
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

    // --- Starter's turn: build a city (same "buildCity" shape every other
    // C&K scenario uses — a real roll first, satisfying buildSettlementRaw's
    // "must have rolled" guard), then climb Science to exactly level 3.
    // improvementLevelCost(level) === level, so level 1+2+3 costs 6 paper —
    // granted up front rather than metered per-purchase (buyCityImprovement
    // only ever spends what it needs).
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [CITY_COST] },
      { actor: starter, action: 'buildSettlement', args: [v1] },
      { actor: starter, action: 'grantResources', args: [undefined, { paper: 6 }] },
      { actor: starter, action: 'buyCityImprovement', args: ['science'] },
      { actor: starter, action: 'buyCityImprovement', args: ['science'] },
      { actor: starter, action: 'buyCityImprovement', args: ['science'] },
    ])
    const afterBuy = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    expect(afterBuy.players.find((p) => p.id === starterId)!.cityImprovements.science, 'starter should be at Science level 3').toBe(3)
    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])

    // --- Roll until a non-7 roll produces nothing for starter. Doesn't
    // matter who rolls it — eligibility is checked against every player on
    // every roll, not just the roller's own turn.
    let queued = false
    for (let round = 0; round < MAX_ROUNDS && !queued; round++) {
      for (const roller of [other, starter]) {
        await runScenario(pageA, pageB, [{ actor: roller, action: 'rollDice' }])
        await resolvePostRollObligations(pageA, pageB, roller, graph)
        const state = await pageA.evaluate(() => window.__catanTestHarness!.getState())
        if (state.pendingQueues.scienceFreeResourcePlayerIds.includes(starterId)) {
          queued = true
          break
        }
        await runScenario(pageA, pageB, [{ actor: roller, action: 'endTurn' }])
      }
    }
    if (!queued) {
      throw new Error(`starter never got queued for a Science free resource within ${MAX_ROUNDS} rounds`)
    }

    const beforeResolve = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterLumberBefore = beforeResolve.players.find((p) => p.id === starterId)!.resources.lumber
    await runScenario(pageA, pageB, [{ actor: starter, action: 'resolveScienceFreeResource', args: ['lumber'] }])

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    expect(
      finalStateA.players.find((p) => p.id === starterId)!.resources.lumber,
      'the Science free-resource pick should grant exactly 1 lumber',
    ).toBe(starterLumberBefore + 1)
    expect(
      finalStateA.pendingQueues.scienceFreeResourcePlayerIds,
      'starter should be dequeued after resolving their pick',
    ).not.toContain(starterId)
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
    expect(
      finalStateB.pendingQueues.scienceFreeResourcePlayerIds,
      'both pages must agree on the remaining queue',
    ).toEqual(finalStateA.pendingQueues.scienceFreeResourcePlayerIds)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
