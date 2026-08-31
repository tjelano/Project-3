// catan-3d/tests/multiplayer/scenarios/barbarian-attack.spec.ts
import type { Page } from '@playwright/test'
import { test, expect } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor } from '../harness'
import { firstEdgeAt, occupy, findBestBiomeVertex, resolvePostRollObligations } from '../scenarioHelpers'
import type { TestHarnessGraph } from '../../../src/testHarness'
import type { Biome } from '../../../src/data/hexBoard'
import { CITY_COST } from '../../../src/game/types'

async function settlementType(page: Page, vertexId: string): Promise<string | undefined> {
  const state = await page.evaluate(() => window.__catanTestHarness!.getState())
  return state.board.settlements[vertexId]?.type
}

// One real roll (satisfies buildSettlementRaw's "must roll before building
// outside setup" guard, App.tsx:2928 — buildSettlement on an already-owned
// settlement vertex IS the upgrade-to-city action, no separate test-hook
// surface needed), then grants CITY_COST directly instead of grinding dice
// for it. This phase isn't testing the economy — it's just getting a city
// built fast and reliably before the actual point of this scenario (the
// barbarian attack) begins. Previously a bounded 60-round dice-catchup loop
// (same shape as dev-card-purchase.spec.ts's own), which could and did hit
// its own round cap on an unlucky board (CI, 2026-08-31: "B could not
// afford a city within 60 of their own turns") — grantResources (merged
// separately) eliminates that flake category entirely for a setup step
// that was never meant to be testing realistic play in the first place.
async function buildCity(pageA: Page, pageB: Page, actor: Actor, graph: TestHarnessGraph, cityVertexId: string): Promise<void> {
  await runScenario(pageA, pageB, [{ actor, action: 'rollDice' }])
  await resolvePostRollObligations(pageA, pageB, actor, graph)
  await runScenario(pageA, pageB, [
    { actor, action: 'grantResources', args: [CITY_COST] },
    { actor, action: 'buildSettlement', args: [cityVertexId] },
  ])
}

// Bounded catch-up: keeps rolling (barbarians now ON) until cityVertexId
// flips back from 'city' to 'settlement' — the pillage this scenario exists
// to exercise. Checks after EVERY roll, not just `actor`'s: the barbarian
// track is fully shared state, so either player's 'ship'-face roll can be
// the one that reaches the final track position and triggers the attack.
// A city-owner with exactly one eligible city auto-resolves pillage via a
// real App.tsx effect the instant the attack broadcast lands on their own
// screen (no click, no waiting on the 90s disconnect-timeout fallback) — so
// this loop only ever needs to wait as long as resolvePostRollObligations'
// own waitForPillageToClear already waits, not any longer.
async function rollUntilPillaged(
  pageA: Page,
  pageB: Page,
  actor: Actor,
  other: Actor,
  graph: TestHarnessGraph,
  cityVertexId: string,
  maxRounds: number,
): Promise<void> {
  for (let round = 0; round < maxRounds; round++) {
    await runScenario(pageA, pageB, [{ actor, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, actor, graph)
    if ((await settlementType(pageA, cityVertexId)) === 'settlement') return
    // Must end `actor`'s turn before `other` can roll at all — Catan only
    // ever lets the current player roll, regardless of whether checking
    // after every roll (rather than only after a full round) would
    // otherwise be convenient here.
    await runScenario(pageA, pageB, [{ actor, action: 'endTurn' }])

    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, other, graph)
    if ((await settlementType(pageA, cityVertexId)) === 'settlement') return
    await runScenario(pageA, pageB, [{ actor: other, action: 'endTurn' }])
  }
  throw new Error(`No barbarian attack pillaged the city within ${maxRounds} rounds (50% ship-face odds per roll)`)
}

test('a barbarian attack pillages the sole city and stays converged', async ({ browser }) => {
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

    // citiesAndKnights: true bundles all 4 C&K flags — Commodities,
    // Progress Cards, Knights, Barbarians. Progress Cards stay off for the
    // whole scenario (unrelated event-die branch, no reason to deal with
    // its own discard/draw bookkeeping here). Barbarians start OFF too —
    // deliberately, see rollUntilPillaged's own comment and this test's
    // design notes: the test hook has no way to click the barbarian-attack
    // modal's Close button, so once ANY attack ever fires,
    // progress.activeBarbarianAttack never goes back to null, and every
    // later resolvePostRollObligations call would then eat its full 8s
    // waitForPillageToClear timeout waiting for a clear that's never
    // coming. Keeping barbarians off until the city already exists
    // guarantees exactly one attack ever fires (right when we're ready for
    // it), instead of risking an early, harmless-but-costly no-op attack
    // (0 cities on the board yet) during the city-building phase below.
    // Called identically on both pages before either rolls — see
    // setGameRules' App.tsx wiring comment for why that's safe without a
    // broadcast.
    await pageA.evaluate(() =>
      window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsProgressCards: false, citiesAndKnightsBarbarians: false }),
    )
    await pageB.evaluate(() =>
      window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsProgressCards: false, citiesAndKnightsBarbarians: false }),
    )

    const graph = await pageA.evaluate(() => window.__catanTestHarness!.getGraph())

    // Same starter/other derivation as every other scenario — starting
    // seat is randomized per room (App.tsx:326-328), not always the host.
    const aStatus = await pageA.evaluate(() => window.__catanTestHarness!.getStatus())
    const starter: Actor = aStatus.isMyTurn ? 'A' : 'B'
    const other: Actor = starter === 'A' ? 'B' : 'A'
    // Game state isn't per-viewer, so reading it from pageA is valid
    // regardless of whether pageA is the starter — turn.currentPlayerIndex
    // at this pre-setup moment always indexes the starter's own seat.
    const preSetupState = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterPlayerId = preSetupState.players[preSetupState.turn.currentPlayerIndex].id

    // The test harness has no knight-recruitment action at all, so
    // defenderStrength (sum of ACTIVE knight strengths) is always 0 in any
    // scenario this harness can drive — resolveBarbarianAttack (game/
    // knights.ts) always resolves as a barbarian win the instant
    // barbarianStrength (total cities on the board) is >= 1. Building
    // exactly ONE city, owned by `starter` only, both guarantees the
    // barbarians win AND (since `other` never owns a city) guarantees the
    // resulting pillageTargets has exactly one target with exactly one
    // eligible city — the case App.tsx auto-resolves without a click.
    const occupied = new Set<string>()
    const cityVertexId = findBestBiomeVertex(graph, ['mountains', 'fields'], occupied)
    occupy(occupied, graph, cityVertexId)
    const ANY_LAND: Biome[] = ['forest', 'pasture', 'fields', 'hills', 'mountains']
    const starterFirstVertex = findBestBiomeVertex(graph, ANY_LAND, occupied)
    occupy(occupied, graph, starterFirstVertex)
    const otherFirstVertex = findBestBiomeVertex(graph, ANY_LAND, occupied)
    occupy(occupied, graph, otherFirstVertex)
    const otherSecondVertex = findBestBiomeVertex(graph, ANY_LAND, occupied)
    occupy(occupied, graph, otherSecondVertex)

    const starterFirstEdge = firstEdgeAt(graph, starterFirstVertex)
    const cityEdge = firstEdgeAt(graph, cityVertexId)
    const otherFirstEdge = firstEdgeAt(graph, otherFirstVertex)
    const otherSecondEdge = firstEdgeAt(graph, otherSecondVertex)

    // Setup order for 2 players is [starter, other, other, starter].
    // cityVertexId is `starter`'s SECOND placement (the kickstart-granting
    // one) — same priority-order reasoning as dev-card-purchase.spec.ts:
    // the vertex this scenario's whole economy depends on deserves the
    // better of starter's two picks, not just whichever happened to be
    // chosen first.
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'buildSettlement', args: [starterFirstVertex] },
      { actor: starter, action: 'buildRoad', args: [starterFirstEdge] },
      { actor: other, action: 'buildSettlement', args: [otherFirstVertex] },
      { actor: other, action: 'buildRoad', args: [otherFirstEdge] },
      { actor: other, action: 'buildSettlement', args: [otherSecondVertex] },
      { actor: other, action: 'buildRoad', args: [otherSecondEdge] },
      { actor: starter, action: 'buildSettlement', args: [cityVertexId] },
      { actor: starter, action: 'buildRoad', args: [cityEdge] },
    ])

    await buildCity(pageA, pageB, starter, graph, cityVertexId)
    expect(await settlementType(pageA, cityVertexId)).toBe('city')
    // buildCity returns with starter's turn still open (they've rolled,
    // just spent it on the upgrade instead of ending) — the caller owns
    // ending it, same contract the old catch-up loop had.
    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])

    // Barbarians back on — the city exists now, so the next attack this
    // triggers is exactly the one this scenario is testing for.
    await pageA.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsBarbarians: true }))
    await pageB.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsBarbarians: true }))

    // 30 rounds (60 rolls) — a 'ship' event-die face is 3 of 6 faces (50%
    // per roll), and the track needs 6 advances to trigger an attack, so
    // ~6 rounds is the expected case; this bound is a wide safety margin
    // for genuine dice variance, not a logic bug, same reasoning as every
    // other scenario's own round cap.
    const MAX_BARBARIAN_ROUNDS = 30
    // `other`, not `starter` — starter just ended their turn above, so
    // other is the one whose turn it actually is now.
    await rollUntilPillaged(pageA, pageB, other, starter, graph, cityVertexId, MAX_BARBARIAN_ROUNDS)

    // The actual outcome, not just sync — runScenario's per-step
    // convergence check already proves both clients agree with each other
    // after every roll, but this is the point of the scenario: the city
    // was really pillaged (downgraded, not destroyed — CN3087 p.11), still
    // owned by the same player, and the attack resolved with the exact
    // strength numbers this setup guarantees (1 city vs. 0 defenders).
    const finalState = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    expect(finalState.board.settlements[cityVertexId]).toMatchObject({ type: 'settlement', ownerId: starterPlayerId })
    expect(finalState.progress.activeBarbarianAttack).toMatchObject({
      barbarianStrength: 1,
      defenderStrength: 0,
      defendersWin: false,
    })
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
