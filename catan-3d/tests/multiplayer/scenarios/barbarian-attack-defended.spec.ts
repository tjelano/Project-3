// catan-3d/tests/multiplayer/scenarios/barbarian-attack-defended.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, resolvePostRollObligations, callHarnessAction } from '../scenarioHelpers'
import { CITY_COST, KNIGHT_RECRUIT_COST, KNIGHT_ACTIVATE_COST } from '../../../src/game/types'

// Complements barbarian-attack.spec.ts, which can only ever exercise the
// DEFENDERS-LOSE path — defenderStrength was hard-coded 0 by construction
// until this session's knight-lifecycle PRs (#90-93) made recruit+activate
// reachable. This is the DEFENDERS-WIN path: CN3087 p.11,
// defendersWin = defenderStrength >= barbarianStrength (a TIE favors
// defenders), confirmed by reading resolveBarbarianAttack directly
// (game/knights.ts).
//
// Exactly 1 city (barbarianStrength=1) + exactly 1 active basic knight
// (defenderStrength=1, KNIGHT_STRENGTH_VALUE.basic=1) is the simplest
// possible win: a SOLE winner (not tied), which takes the direct
// DEFENDER_OF_CATAN_AWARDED branch (+1 VP) — deliberately avoiding the
// tied-winner progress-card-draw path (WINNER_DRAW_QUEUE_SET), which
// relies on winnerDrawQueue and has its own latent stale-closure race
// already flagged elsewhere in project memory as unfixed. Keeping this
// scenario to the sole-winner path is not avoidance of real coverage —
// it's the correct minimal case for "does an active knight's strength
// actually count," which is the actual point here.
const MAX_BARBARIAN_ROUNDS = 30

test('a defended city survives a barbarian attack and its defender is awarded', async ({ browser }) => {
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

    // Barbarians kept OFF while the city/knight are being set up — same
    // reasoning barbarian-attack.spec.ts's own setup gives: the test hook
    // can't click the attack modal's Close button, so the FIRST attack
    // ever fired must already have both barbarianStrength and
    // defenderStrength in their final state, or an early no-op attack
    // (0 cities yet) would permanently occupy activeBarbarianAttack for
    // nothing.
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
    const starterDefenderCountBefore = stateAfterSetup.players.find((p) => p.id === starterId)!.defenderOfCatanCount

    // One real roll (satisfies buildSettlementRaw's "must have rolled"
    // guard for the city upgrade) — same "buildCity" shape
    // barbarian-attack.spec.ts already established.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [CITY_COST] },
      { actor: starter, action: 'buildSettlement', args: [v1] },
    ])

    // Recruit + activate ON THE SAME PLAYER as the city, at the far end of
    // e1 (already starter's own road) — same recruit-vertex pattern every
    // other knight scenario this session established.
    const e1Edge = graph.edges.find((e) => e.id === e1)!
    const recruitVertex = e1Edge.a === v1 ? e1Edge.b : e1Edge.a
    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantResources', args: [KNIGHT_RECRUIT_COST] }])
    await callHarnessAction(starterPage, 'armKnightRecruit')
    await runScenario(pageA, pageB, [{ actor: starter, action: 'selectKnightVertex', args: [recruitVertex] }])

    const afterRecruit = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterKnightId = afterRecruit.players.find((p) => p.id === starterId)!.knightPieces[0].id
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [KNIGHT_ACTIVATE_COST] },
      { actor: starter, action: 'activateKnight', args: [starterKnightId] },
    ])
    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])

    // Barbarians back on — city + active knight are both in place, so the
    // next attack this triggers is exactly the defended one this scenario
    // tests for.
    await pageA.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsBarbarians: true }))
    await pageB.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsBarbarians: true }))

    // Roll until the barbarian track resolves an attack — same alternating
    // roll-and-end-turn shape rollUntilPillaged (barbarian-attack.spec.ts)
    // and rollUntilRobberActive (taxation.spec.ts) already established,
    // just checking a different termination condition (an attack having
    // resolved AT ALL, not a specific outcome — the outcome itself is
    // asserted afterward).
    let resolved = false
    for (let round = 0; round < MAX_BARBARIAN_ROUNDS && !resolved; round++) {
      for (const roller of [other, starter]) {
        await runScenario(pageA, pageB, [{ actor: roller, action: 'rollDice' }])
        await resolvePostRollObligations(pageA, pageB, roller, graph)
        const state = await pageA.evaluate(() => window.__catanTestHarness!.getState())
        if (state.progress.activeBarbarianAttack != null) {
          resolved = true
          break
        }
        await runScenario(pageA, pageB, [{ actor: roller, action: 'endTurn' }])
      }
    }
    if (!resolved) {
      throw new Error(`No barbarian attack resolved within ${MAX_BARBARIAN_ROUNDS} rounds (50% ship-face odds per roll)`)
    }

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    expect(finalStateA.progress.activeBarbarianAttack, 'defenders should win: 1 active knight ties 1 city').toMatchObject({
      barbarianStrength: 1,
      defenderStrength: 1,
      defendersWin: true,
    })
    expect(finalStateA.board.settlements[v1], 'the city must NOT be pillaged when defenders win').toMatchObject({
      type: 'city',
      ownerId: starterId,
    })
    const finalStarter = finalStateA.players.find((p) => p.id === starterId)!
    expect(finalStarter.defenderOfCatanCount, 'the sole defender should be awarded Defender of Catan').toBe(
      starterDefenderCountBefore + 1,
    )
    const finalKnight = finalStarter.knightPieces.find((k) => k.id === starterKnightId)!
    expect(finalKnight.active, 'every knight goes inactive after an attack resolves, regardless of participation').toBe(
      false,
    )
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
