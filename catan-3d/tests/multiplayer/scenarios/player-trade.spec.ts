// catan-3d/tests/multiplayer/scenarios/player-trade.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, resolvePostRollObligations } from '../scenarioHelpers'

// Player-to-player trade (propose/accept/reject) — the last fully-untouched
// primitive, independent of knights/progress cards entirely. Real risk this
// exercises, confirmed by reading proposePlayerTrade/resolvePlayerTrade/
// resolveTradeAsHost directly: this is a HOST-ARBITER action, genuinely
// different in shape from every other action this harness drives so far.
// The accepting client does NOT apply the trade locally — if it isn't the
// (effective) host, resolvePlayerTrade only ever broadcasts a
// TradeAcceptRequest; the HOST is the one who re-validates both sides'
// CURRENT resource counts (not trusting either client's own copy) and is the
// only one who ever dispatches TRADE_RESOLVED, broadcasting the outcome back
// out from there. That two-hop relay (accepter -> host -> both clients),
// vs. a direct broadcast every other action in this harness uses, is exactly
// the kind of shape this harness exists to catch drift in.
//
// Two cases, matching that re-validation's own stated reason for existing
// (resolveTradeAsHost's own comment: "the offerer's resources could have
// changed... in the gap between the offer being sent and the target
// accepting it"):
//   1. A normal accept — full resource swap, both clients converge.
//   2. The offer's WANTED card gets drained from the target's hand (via
//      grantResources — a controlled stand-in for "spent it on something
//      else in the meantime", not a game action under test here) between
//      propose and accept, so the host's re-validation must reject it
//      without ever swapping anything, on BOTH clients identically.
// Between the two, both host-accepting and joiner-accepting paths get
// exercised at least once, regardless of which page happens to hold the
// first turn (starter/other is randomized per room, host is always pageA).
//
// No Cities & Knights needed — proposePlayerTrade/resolvePlayerTrade work
// identically for plain ResourceType trades in the base game.
test('a player trade resolves correctly on both clients, including a resolve-time fall-through', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  const pageA = await contextA.newPage()
  const pageB = await contextB.newPage()

  try {
    const roomCode = await hostRoom(pageA)
    await joinRoom(pageB, 'Joiner', roomCode)
    await startWhenFull(pageA)
    await waitForGameStarted(pageA)
    await waitForGameStarted(pageB)
    await assertConnected(pageA, 'host')
    await assertConnected(pageB, 'joiner')

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
    const playerState = async (playerId: number) => {
      const state = await pageA.evaluate(() => window.__catanTestHarness!.getState())
      return state.players.find((p) => p.id === playerId)!
    }

    // --- Trade 1: starter offers 1 ore for 1 wool, other accepts. Deltas
    // computed against ACTUAL before-counts (never assumed 0) — setup's own
    // random biome-based grants may already have left either player holding
    // some of either resource.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [{ ore: 1 }] },
      { actor: other, action: 'grantResources', args: [{ wool: 1 }] },
    ])
    const starterBeforeTrade1 = await playerState(starterId)
    const otherBeforeTrade1 = await playerState(otherId)
    await runScenario(pageA, pageB, [{ actor: starter, action: 'proposeTrade', args: [otherId, 'ore', 'wool'] }])
    await runScenario(pageA, pageB, [{ actor: other, action: 'resolveTrade', args: [true] }])

    const starterAfterTrade1 = await playerState(starterId)
    const otherAfterTrade1 = await playerState(otherId)
    expect(starterAfterTrade1.resources.ore, 'the offerer should lose exactly the offered ore').toBe(
      starterBeforeTrade1.resources.ore - 1,
    )
    expect(starterAfterTrade1.resources.wool, 'the offerer should gain exactly the wanted wool').toBe(
      starterBeforeTrade1.resources.wool + 1,
    )
    expect(otherAfterTrade1.resources.wool, 'the accepter should lose exactly the wanted wool').toBe(
      otherBeforeTrade1.resources.wool - 1,
    )
    expect(otherAfterTrade1.resources.ore, 'the accepter should gain exactly the offered ore').toBe(
      otherBeforeTrade1.resources.ore + 1,
    )
    const stateAfterTrade1 = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    expect(stateAfterTrade1.trade.pendingTrade, 'a resolved trade should clear pendingTrade').toBeNull()

    // --- Trade 2: other offers 1 brick for 1 lumber. Before starter
    // accepts, their lumber is drained to exactly 0 via grantResources with
    // a negative delta — a controlled stand-in for "spent it on something
    // else since the offer went out," not itself the thing under test.
    // starter can freely accept/decline without ever taking their own
    // turn — resolvePlayerTrade has no isMyTurn/hasRolledThisTurn guard at
    // all (confirmed by reading it directly), only proposePlayerTrade does.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])
    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, other, graph)
    await runScenario(pageA, pageB, [{ actor: other, action: 'grantResources', args: [{ brick: 1 }] }])
    const otherBeforeTrade2 = await playerState(otherId)
    await runScenario(pageA, pageB, [{ actor: other, action: 'proposeTrade', args: [starterId, 'brick', 'lumber'] }])

    // GRANT_TEST_RESOURCES applies each value with += and never clamps or
    // rejects negatives (players.ts) — a negative delta here subtracts
    // cleanly, draining starter's lumber to exactly 0 regardless of
    // whatever setup/production already gave them.
    const starterLumberNow = (await playerState(starterId)).resources.lumber
    if (starterLumberNow > 0) {
      await runScenario(pageA, pageB, [{ actor: starter, action: 'grantResources', args: [{ lumber: -starterLumberNow }] }])
    }
    await runScenario(pageA, pageB, [{ actor: starter, action: 'resolveTrade', args: [true] }])

    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    expect(finalStateA.trade.pendingTrade, 'a fallen-through trade should still clear pendingTrade').toBeNull()
    const otherAfterTrade2 = finalStateA.players.find((p) => p.id === otherId)!
    expect(otherAfterTrade2.resources.brick, "a fallen-through trade must NOT swap anything — the offerer's brick stays put").toBe(
      otherBeforeTrade2.resources.brick,
    )
    const starterAfterTrade2 = finalStateA.players.find((p) => p.id === starterId)!
    expect(starterAfterTrade2.resources.lumber, 'the accepter still has exactly 0 lumber — nothing was received either').toBe(0)
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
