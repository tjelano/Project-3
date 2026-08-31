// catan-3d/tests/multiplayer/scenarios/sabotage-wedding-espionage.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices } from '../scenarioHelpers'

// Three Cities & Knights progress cards, one game — same "bundle several
// Tier 1 cards in one run" reasoning progress-card-draw.spec.ts already
// established for draws, now for PLAYS. Sabotage and Wedding are the
// closest structural analog to the two real desync bugs this harness has
// already caught: each client independently recomputes the affected-player
// set (from already-synced public VP state) and the auto-discard/auto-take
// selection, rather than one client computing it once and everyone else
// just trusting the broadcast. Espionage is the highest-value of the three:
// ESPIONAGE_TAKEN resolves `cardIndex` against EACH client's own local copy
// of the target's progressCards array (players.ts) — if the two clients'
// arrays ever drifted in order, they'd resolve DIFFERENT actual cards from
// the identical index, a desync no shallow "did it error" check would ever
// catch.
//
// No dice roll happens anywhere in this scenario — canPlayProgressCardNow
// only requires gamePhase === 'playing' (confirmed by reading App.tsx, same
// finding invention-play.spec.ts's own comment already recorded), and the
// setup-completing road placement already lands the game there.
test('Sabotage, Wedding, and Espionage all resolve identically on both clients', async ({ browser }) => {
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

    // Only need progress cards enabled — same reasoning as
    // invention-play.spec.ts's identical call: no knight or barbarian
    // mechanic is involved in any of these three cards.
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

    const cardTotal = (p: { resources: Record<string, number>; commodities: Record<string, number> }): number =>
      Object.values(p.resources).reduce((a, b) => a + b, 0) + Object.values(p.commodities).reduce((a, b) => a + b, 0)
    const playerState = async (page: typeof pageA, playerId: number) => {
      const state = await page.evaluate(() => window.__catanTestHarness!.getState())
      return state.players.find((p) => p.id === playerId)!
    }
    const stateNow = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterId = stateNow.players[stateNow.turn.currentPlayerIndex].id // starter is current player right after setup
    const otherId = stateNow.players.find((p) => p.id !== starterId)!.id

    // --- Sabotage: both tied at 2 VP after setup, so 'gte' always
    // includes the opponent. Top up `other`'s hand first so the effect is
    // guaranteed observable regardless of what their 2nd-settlement
    // placement happened to produce.
    await runScenario(pageA, pageB, [
      { actor: other, action: 'grantResources', args: [{ lumber: 2, brick: 2, wool: 2 }] },
      { actor: starter, action: 'grantProgressCard', args: ['sabotage'] },
    ])
    const otherBeforeSabotage = cardTotal(await playerState(pageA, otherId))
    await runScenario(pageA, pageB, [{ actor: starter, action: 'playSabotage' }])
    const otherAfterSabotage = cardTotal(await playerState(pageA, otherId))
    // Half the hand is DISCARDED (rounded down), so what's LEFT is the
    // complement: before - floor(before/2), i.e. ceil(before/2) — not
    // floor(before/2) (that's the discard count, not the remainder).
    expect(otherAfterSabotage, 'Sabotage should discard floor(before/2) cards, leaving the rest').toBe(
      otherBeforeSabotage - Math.floor(otherBeforeSabotage / 2),
    )

    // --- Wedding: needs `other` to hold STRICTLY MORE VP than the
    // announcer. Granting the 'printing' VP progress card is the simplest
    // way to create that gap — getPlayerScore counts it immediately, no
    // board interaction (a real 3rd settlement) required. starter
    // announces Sabotage above, so grant VP + a card pool to `other`
    // instead, then have starter (lower VP) announce Wedding against them.
    await runScenario(pageA, pageB, [
      { actor: other, action: 'grantProgressCard', args: ['printing'] },
      { actor: other, action: 'grantResources', args: [{ lumber: 2, brick: 2, wool: 2 }] },
      { actor: starter, action: 'grantProgressCard', args: ['wedding'] },
    ])
    const otherBeforeWedding = cardTotal(await playerState(pageA, otherId))
    const starterBeforeWedding = cardTotal(await playerState(pageA, starterId))
    await runScenario(pageA, pageB, [{ actor: starter, action: 'playWedding' }])
    const taken = Math.min(2, otherBeforeWedding)
    const otherAfterWedding = cardTotal(await playerState(pageA, otherId))
    const starterAfterWedding = cardTotal(await playerState(pageA, starterId))
    expect(otherAfterWedding, 'Wedding should take min(2, before) cards from the higher-VP player').toBe(
      otherBeforeWedding - taken,
    )
    expect(starterAfterWedding, 'Wedding should credit the announcer with exactly what was taken').toBe(
      starterBeforeWedding + taken,
    )

    // --- Espionage: the actual point of this scenario. Grant `other` two
    // MORE distinct progress cards (on top of 'printing' from Wedding
    // setup above, never removed — VP cards are never spent), so their
    // hand is a known 3-card array: ['printing', 'irrigation', 'mining'].
    // starter takes index 2 (not 0) — a non-trivial index specifically to
    // exercise real array-position resolution, not just "always grabs the
    // first card," which would pass even if cross-client ordering broke.
    await runScenario(pageA, pageB, [
      { actor: other, action: 'grantProgressCard', args: ['irrigation'] },
      { actor: other, action: 'grantProgressCard', args: ['mining'] },
      { actor: starter, action: 'grantProgressCard', args: ['espionage'] },
      { actor: starter, action: 'playEspionage' },
      { actor: starter, action: 'confirmEspionage', args: [[2]] },
    ])

    const finalOther = await playerState(pageA, otherId)
    const finalStarterA = await playerState(pageA, starterId)
    const finalStarterB = await playerState(pageB, starterId)
    const finalOtherB = await playerState(pageB, otherId)
    expect(finalOther.progressCards, 'target lost exactly the card at index 2 (mining)').toEqual(['printing', 'irrigation'])
    expect(finalStarterA.progressCards, 'taker gained the card Espionage resolved to on page A').toContain('mining')
    // Both pages must agree on which SPECIFIC card moved — the real risk
    // this scenario exists to catch. runScenario's own convergence check
    // already proves this (full deep-equal GameState), but an explicit
    // check here gives a far more diagnostic failure message than "state
    // did not converge" would if this ever broke.
    expect(finalStarterB.progressCards, 'page B disagrees with page A on which card Espionage took').toEqual(
      finalStarterA.progressCards,
    )
    expect(finalOtherB.progressCards, 'page B disagrees with page A on the target\'s remaining hand').toEqual(
      finalOther.progressCards,
    )
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
