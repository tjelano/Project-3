// catan-3d/tests/multiplayer/scenarios/monopoly-guild-dues-diplomacy.spec.ts
import { expect, test, type Page } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, resolvePostRollObligations, callHarnessAction } from '../scenarioHelpers'
import { ROAD_COST } from '../../../src/game/types'
import type { TestHarnessGraph } from '../../../src/testHarness'
import type { Biome } from '../../../src/data/hexBoard'

// Four more Cities & Knights progress cards, one game — continuing the
// "bundle several Tier 1/2 cards" pattern sabotage-wedding-espionage.spec.ts
// and progress-card-draw.spec.ts already established. Taxation (the 5th
// Tier 2b card) is deliberately NOT here — it needs robberActive === true,
// which needs a full barbarian-attack precondition (barbarians on, several
// rounds of dice) unrelated to and heavier than what the other 4 need
// (barbarians stay off here, same as every other non-barbarian-attack
// scenario) — a natural separate scenario, not a reason to block these 4.
//
// Resource Monopoly / Trade Monopoly are the highest-value pair here: both
// effects independently recompute WHICH opponents to take from and HOW
// MUCH, from each client's own already-synced resource/commodity counts
// (players.ts's RESOURCE_MONOPOLY_PLAYED/TRADE_MONOPOLY_PLAYED reducer
// cases) — the exact same risk shape as Sabotage/Wedding. Guild Dues and
// Diplomacy are both real cross-player-targeting cards with lower
// structural risk (explicit picks/ids in the dispatched action, not
// re-derived per client) but were never exercised by any scenario before
// now either.
test('Resource Monopoly, Trade Monopoly, Guild Dues, and Diplomacy all resolve identically on both clients', async ({
  browser,
}) => {
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

    const playerState = async (page: typeof pageA, playerId: number) => {
      const state = await page.evaluate(() => window.__catanTestHarness!.getState())
      return state.players.find((p) => p.id === playerId)!
    }

    const starterPage = starter === 'A' ? pageA : pageB

    const stateNow = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterId = stateNow.players[stateNow.turn.currentPlayerIndex].id
    const otherId = stateNow.players.find((p) => p.id !== starterId)!.id

    // Fund `other` for all 3 of starter's cards up front: 'brick'
    // (Resource Monopoly target), 'paper' commodity (Trade Monopoly
    // target), 'wool'/'cloth' (Guild Dues' explicit picks — kept distinct
    // from brick/paper so each card's own assertion can't be confused by
    // an earlier card's effect on the same type). 'printing' gives other
    // 3 VP > starter's 2, the threshold Guild Dues needs ('gt' — same
    // grant-a-VP-card trick sabotage-wedding-espionage.spec.ts used for
    // Wedding).
    await runScenario(pageA, pageB, [
      { actor: other, action: 'grantResources', args: [{ brick: 3, wool: 2 }, { paper: 2, cloth: 2 }] },
      { actor: other, action: 'grantProgressCard', args: ['printing'] },
    ])

    // --- Resource Monopoly. playResourceMonopoly only spends the card and
    // arms the picker LOCALLY — no broadcast happens until
    // resolveDevCardPicker sends the combined spend+effect in one message
    // (see scenarioHelpers.ts's BypassAction comment) — so the play* call
    // itself bypasses runScenario's cross-client convergence check, same
    // as selectInventionTile.
    // Read BOTH players' actual before-counts — starter's own setup
    // placement can produce some brick too, same lesson as Guild Dues'
    // fix just above: never assume an unset resource starts at 0.
    const otherBeforeResourceMonopoly = await playerState(pageA, otherId)
    const starterBeforeResourceMonopoly = await playerState(pageA, starterId)
    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantProgressCard', args: ['resourceMonopoly'] }])
    await callHarnessAction(starterPage, 'playResourceMonopoly')
    await runScenario(pageA, pageB, [{ actor: starter, action: 'resolveDevCardPicker', args: [['brick']] }])
    const takenBrick = Math.min(2, otherBeforeResourceMonopoly.resources.brick)
    const otherAfterResourceMonopoly = await playerState(pageA, otherId)
    const starterAfterResourceMonopoly = await playerState(pageA, starterId)
    expect(otherAfterResourceMonopoly.resources.brick, 'Resource Monopoly should take min(2, held) brick from other').toBe(
      otherBeforeResourceMonopoly.resources.brick - takenBrick,
    )
    expect(starterAfterResourceMonopoly.resources.brick, 'starter should gain exactly what was taken').toBe(
      starterBeforeResourceMonopoly.resources.brick + takenBrick,
    )

    // --- Trade Monopoly, same play*-bypasses/resolve*-converges shape.
    const otherBeforeTradeMonopoly = otherAfterResourceMonopoly
    const starterBeforeTradeMonopoly = starterAfterResourceMonopoly
    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantProgressCard', args: ['tradeMonopoly'] }])
    await callHarnessAction(starterPage, 'playTradeMonopoly')
    await runScenario(pageA, pageB, [{ actor: starter, action: 'resolveDevCardCommodityPicker', args: ['paper'] }])
    const takenPaper = otherBeforeTradeMonopoly.commodities.paper > 0 ? 1 : 0
    const otherAfterTradeMonopoly = await playerState(pageA, otherId)
    const starterAfterTradeMonopoly = await playerState(pageA, starterId)
    expect(otherAfterTradeMonopoly.commodities.paper, 'Trade Monopoly should take 1 paper from other if they held any').toBe(
      otherBeforeTradeMonopoly.commodities.paper - takenPaper,
    )
    expect(starterAfterTradeMonopoly.commodities.paper, 'starter should gain exactly what was taken').toBe(
      starterBeforeTradeMonopoly.commodities.paper + takenPaper,
    )

    // --- Guild Dues: other (3 VP) qualifies as starter's (2 VP) only
    // eligible target ('gt' threshold) — no selectGuildDuesTarget call
    // needed, same "only one other player" reasoning Espionage's own
    // scenario already used. Read the ACTUAL before-counts rather than
    // assuming they equal the earlier grant exactly — setup placement can
    // hand `other` extra wool/cloth from their own 2nd-settlement yield,
    // on top of what was explicitly granted (same lesson as Sabotage's
    // remaining-hand formula, PR #86: assert against real observed state,
    // not a hardcoded number).
    const otherBeforeGuildDues = await playerState(pageA, otherId)
    const starterBeforeGuildDues = await playerState(pageA, starterId)
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantProgressCard', args: ['guildDues'] },
      { actor: starter, action: 'playGuildDues' },
      { actor: starter, action: 'confirmGuildDues', args: [['wool', 'cloth']] },
    ])
    const finalOtherAfterGuildDues = await playerState(pageA, otherId)
    const finalStarterAfterGuildDues = await playerState(pageA, starterId)
    expect(finalOtherAfterGuildDues.resources.wool, 'Guild Dues should take exactly 1 wool from other').toBe(
      otherBeforeGuildDues.resources.wool - 1,
    )
    expect(finalOtherAfterGuildDues.commodities.cloth, 'Guild Dues should take exactly 1 cloth from other').toBe(
      otherBeforeGuildDues.commodities.cloth - 1,
    )
    expect(finalStarterAfterGuildDues.resources.wool, 'starter should gain exactly 1 wool').toBe(starterBeforeGuildDues.resources.wool + 1)
    expect(finalStarterAfterGuildDues.commodities.cloth, 'starter should gain exactly 1 cloth').toBe(
      starterBeforeGuildDues.commodities.cloth + 1,
    )

    // handleEndTurn requires hasRolledThisTurn, even on the very first turn
    // — none of the 3 progress cards above needed a roll (canPlayProgressCardNow
    // only checks gamePhase), but ending the turn does.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, starter, graph)
    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])

    // --- Diplomacy needs an "open" road (neither endpoint touches a
    // building, App.tsx's isOpenRoad) — other's setup road (e2/e3) always
    // fails that (one endpoint is other's own settlement), so `other`
    // builds a genuine second road first, extending from the far end of
    // their first road out to a fresh vertex.
    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, other, graph)

    const otherFirstEdge = graph.edges.find((e) => e.id === e2)!
    const midVertex = otherFirstEdge.a === v2 ? otherFirstEdge.b : otherFirstEdge.a
    const openEdge = secondEdgeAt(graph, midVertex, e2)

    await runScenario(pageA, pageB, [
      { actor: other, action: 'grantResources', args: [ROAD_COST] },
      { actor: other, action: 'buildRoad', args: [openEdge] },
    ])
    expect(await roadOwner(pageA, openEdge), "other's new road should exist before Diplomacy removes it").toBe(otherId)

    await runScenario(pageA, pageB, [{ actor: other, action: 'endTurn' }])

    const otherRoadsBeforeDiplomacy = (await playerState(pageA, otherId)).roadsRemaining
    await runScenario(pageA, pageB, [{ actor: starter, action: 'grantProgressCard', args: ['diplomacy'] }])
    // activateDiplomacy only sets pendingDiplomacyRemoval, local React
    // state outside GameState — bypasses runScenario the same reason
    // selectInventionTile does. Resolved via the ordinary buildRoad action
    // below — buildRoadRaw checks pendingDiplomacyRemoval BEFORE its
    // normal build logic and routes an armed click straight to
    // Diplomacy's own resolver, same click target a real player uses (no
    // separate harness action needed for the resolve step itself).
    await callHarnessAction(starterPage, 'activateDiplomacy')
    await runScenario(pageA, pageB, [{ actor: starter, action: 'buildRoad', args: [openEdge] }])

    const finalOtherRoadsRemaining = (await playerState(pageA, otherId)).roadsRemaining
    expect(finalOtherRoadsRemaining, "removing an opponent's road should return it to their own supply").toBe(
      otherRoadsBeforeDiplomacy + 1,
    )
    expect(await roadOwner(pageA, openEdge), "Diplomacy should have removed other's road").toBeUndefined()
    const finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    expect(finalStateB.board.roads, 'both pages must agree on the final road layout').toEqual(finalStateA.board.roads)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})

async function roadOwner(page: Page, edgeId: string): Promise<number | undefined> {
  const state = await page.evaluate(() => window.__catanTestHarness!.getState())
  return state.board.roads[edgeId]
}

// The first ROAD-buildable edge touching `vertexId` OTHER than
// `excludeEdgeId` — same open-ocean skip as scenarioHelpers.ts's own
// firstEdgeAt (not reused directly: that helper has no exclusion
// parameter, and this is the only caller so far that needs one).
function secondEdgeAt(graph: TestHarnessGraph, vertexId: string, excludeEdgeId: string): string {
  const tileById = new Map(graph.tiles.map((t) => [t.id, t]))
  const isOpenOcean = (edgeId: string): boolean => {
    const tileIds = graph.edgeTileIds[edgeId] ?? []
    return tileIds.length > 0 && tileIds.every((id) => tileById.get(id)?.biome === ('sea' as Biome))
  }
  const edgeId = (graph.vertexEdgeIds[vertexId] ?? []).find((id) => id !== excludeEdgeId && !isOpenOcean(id))
  if (!edgeId) throw new Error(`secondEdgeAt: no second road-buildable edge found touching vertex ${vertexId}`)
  return edgeId
}
