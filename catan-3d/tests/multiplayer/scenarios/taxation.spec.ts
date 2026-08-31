// catan-3d/tests/multiplayer/scenarios/taxation.spec.ts
import { expect, test, type Page } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, resolvePostRollObligations, callHarnessAction } from '../scenarioHelpers'
import type { TestHarnessGraph } from '../../../src/testHarness'

// The last Tier 2b progress card — deliberately its own scenario rather
// than bundled with monopoly-guild-dues-diplomacy.spec.ts (PR #88): every
// other Tier 2b card only needs progress cards enabled; Taxation ALONE is
// gated on robberActive (App.tsx's armTaxation: "CN3087 only allows
// Taxation once the robber is active"), which needs a real barbarian
// attack to have resolved at least once — barbarians must stay ON here,
// an unrelated and heavier precondition than what the other 4 cards need.
//
// No city is needed on the board at all: robberActive flips true on the
// FIRST barbarian attack to ever resolve, win or lose (App.tsx:
// `isFirstActivation = !robberActive`, unconditional) — unlike
// barbarian-attack.spec.ts, which specifically needs the barbarians-WIN
// path to exercise pillage.
const MAX_BARBARIAN_ROUNDS = 30

async function rollUntilRobberActive(
  pageA: Page,
  pageB: Page,
  first: Actor,
  second: Actor,
  graph: TestHarnessGraph,
  maxRounds: number,
): Promise<Actor> {
  for (let round = 0; round < maxRounds; round++) {
    for (const roller of [first, second]) {
      await runScenario(pageA, pageB, [{ actor: roller, action: 'rollDice' }])
      await resolvePostRollObligations(pageA, pageB, roller, graph)
      const state = await pageA.evaluate(() => window.__catanTestHarness!.getState())
      if (state.board.robberActive) return roller
      await runScenario(pageA, pageB, [{ actor: roller, action: 'endTurn' }])
    }
  }
  throw new Error(`robberActive never became true within ${maxRounds} rounds (50% ship-face odds per roll)`)
}

test('Taxation steals from a player on the chosen hex and stays converged', async ({ browser }) => {
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

    // Knights off (unrelated to Taxation) — barbarians deliberately left
    // ON (citiesAndKnights: true's default), the one thing every other
    // Tier 1/2b scenario turns off.
    await pageA.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsKnights: false }))
    await pageB.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsKnights: false }))

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
    const otherId = stateAfterSetup.players.find((p) => p.id !== starterId)!.id

    const announcer = await rollUntilRobberActive(pageA, pageB, starter, other, graph, MAX_BARBARIAN_ROUNDS)
    const victim = announcer === starter ? other : starter
    const announcerId = announcer === starter ? starterId : otherId
    const victimId = announcer === starter ? otherId : starterId
    const announcerPage = announcer === starter ? (starter === 'A' ? pageA : pageB) : other === 'A' ? pageA : pageB

    const playerState = async (page: Page, playerId: number) => {
      const state = await page.evaluate(() => window.__catanTestHarness!.getState())
      return state.players.find((p) => p.id === playerId)!
    }
    const cardTotal = (p: { resources: Record<string, number>; commodities: Record<string, number> }): number =>
      Object.values(p.resources).reduce((a, b) => a + b, 0) + Object.values(p.commodities).reduce((a, b) => a + b, 0)

    // Top up `victim`'s hand so the steal is guaranteed observable —
    // granted HERE, after the roll-until loop, not before it: the loop
    // can run up to MAX_BARBARIAN_ROUNDS rounds of real production and
    // natural-7 discards, easily draining an earlier grant to 0 by the
    // time Taxation actually resolves (caught live: a full-suite run with
    // real dice variance emptied it, `victimTotalBefore` came back 0).
    // `victim` isn't even known until after the loop picks `announcer`.
    await runScenario(pageA, pageB, [{ actor: victim, action: 'grantResources', args: [{ lumber: 2, brick: 2, wool: 2 }] }])

    await runScenario(pageA, pageB, [{ actor: announcer, action: 'grantProgressCard', args: ['taxation'] }])
    // armTaxation flips gamePhase to 'moveRobber' LOCALLY (never mirrored
    // to the receiver — see testHarness.ts's own comment) — bypasses
    // runScenario the same reason playResourceMonopoly/activateDiplomacy
    // do (PR #88).
    await callHarnessAction(announcerPage, 'armTaxation')

    // Any hex touching `victim`'s settlement, other than the CURRENT
    // robber tile (resolveTaxation: "The Robber must move to a new hex!").
    const victimVertex = victim === starter ? v1 : v2
    const robberTileId = (await pageA.evaluate(() => window.__catanTestHarness!.getState())).board.robberTileId
    const targetTileId = (graph.vertexTileIds[victimVertex] ?? []).find((id) => id !== robberTileId)
    if (!targetTileId) throw new Error("No taxable hex touching victim's settlement other than the current robber tile")

    const victimBefore = await playerState(pageA, victimId)
    const announcerBefore = await playerState(pageA, announcerId)
    // Resolved via the already-exposed moveRobber action — resolveTaxation
    // (App.tsx) is moveRobber's leading branch whenever pendingTaxation is
    // set, same "existing action already routes an armed click" pattern
    // buildRoad/Diplomacy established. This step converges normally:
    // applyTaxationResolved resets gamePhase back to 'playing' on BOTH
    // clients once the steal actually broadcasts.
    await runScenario(pageA, pageB, [{ actor: announcer, action: 'moveRobber', args: [targetTileId] }])

    const victimAfter = await playerState(pageA, victimId)
    const announcerAfter = await playerState(pageA, announcerId)
    const victimTotalBefore = cardTotal(victimBefore)
    const victimTotalAfter = cardTotal(victimAfter)
    const stolen = victimTotalBefore - victimTotalAfter
    // resolveTaxation steals nothing if the victim held nothing at all,
    // otherwise exactly 1 random card (CN3087: "steal 1 random resource/
    // commodity card") — the earlier grantResources top-up guarantees
    // victim holds something, so this should always be exactly 1, not
    // just "at most 1".
    expect(victimTotalBefore, 'this scenario should always have something to observably steal').toBeGreaterThan(0)
    expect(stolen, 'a victim holding cards should always lose exactly 1').toBe(1)
    expect(cardTotal(announcerAfter), 'announcer should gain exactly what was stolen').toBe(cardTotal(announcerBefore) + stolen)

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    expect(finalStateA.turn.gamePhase, "gamePhase should be back to 'playing' after the steal resolves").toBe('playing')
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
