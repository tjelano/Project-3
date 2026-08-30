// catan-3d/tests/multiplayer/scenarios/dev-card-purchase.spec.ts
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import {
  firstEdgeAt,
  occupy,
  findBestBiomeVertex,
  pageForActor,
  resolvePostRollObligations,
} from '../scenarioHelpers'
import type { TestHarnessGraph } from '../../../src/testHarness'
import type { Biome } from '../../../src/data/hexBoard'
import type { Resources } from '../../../src/game/types'

// DEV_CARD_COST, game/types.ts:380 — { ore: 1, grain: 1, wool: 1 }.
function hasDevCardCost(resources: Resources): boolean {
  return resources.ore >= 1 && resources.grain >= 1 && resources.wool >= 1
}

async function getCurrentPlayerResources(page: Page): Promise<Resources> {
  const state = await page.evaluate(() => window.__catanTestHarness!.getState())
  return state.players[state.turn.currentPlayerIndex].resources
}

// Bounded catch-up: rolls for `actor`, buys the instant the roll leaves them
// able to afford it (usually round 0, thanks to findBestBiomeVertex above),
// then ends their turn. Capped at MAX_ROUNDS real turns of production so a
// board that left this player with none of a needed resource type still
// fails fast with a clear message instead of hanging — this is the
// documented fallback for the ~1-in-10 board that lacks even a partial
// biome match, not the common path.
async function buyDevCardWithCatchup(
  pageA: Page,
  pageB: Page,
  actor: Actor,
  other: Actor,
  graph: TestHarnessGraph,
  maxRounds: number,
): Promise<void> {
  for (let round = 0; round < maxRounds; round++) {
    await runScenario(pageA, pageB, [{ actor, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, actor, graph)
    const resources = await getCurrentPlayerResources(pageForActor(pageA, pageB, actor))
    if (hasDevCardCost(resources)) {
      await runScenario(pageA, pageB, [{ actor, action: 'buyDevCard' }])
      return
    }
    await runScenario(pageA, pageB, [{ actor, action: 'endTurn' }])
    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, other, graph)
    await runScenario(pageA, pageB, [{ actor: other, action: 'endTurn' }])
  }
  throw new Error(`${actor} could not afford a dev card (ore+grain+wool) within ${maxRounds} of their own turns`)
}

test('setup phase, both players buy a dev card', async ({ browser }) => {
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

    // All 4 setup settlements target the same ore+grain+wool match, not just
    // v3/v4 (each player's SECOND, kickstart-granting placement) — v1/v2
    // (the FIRST placements) grant no kickstart, but they're still real
    // settlements that go on producing resources every subsequent roll for
    // the rest of the catch-up loop below. Leaving them position-agnostic
    // (the original design) left each player with only one of their two
    // settlements actually contributing to the resources this scenario
    // needs — verified live: with only v3/v4 biome-aware, both players'
    // catch-up loops exhausted 40 rounds each without ever affording a dev
    // card, purely from weak production, not a logic error.
    //
    // Picked in QUALITY priority (v3, v4, then v1, v2), not game order:
    // v3/v4 are each player's SECOND settlement, the one that grants
    // grantResourcesForVertex's one-time kickstart — getting one of those
    // to an exact 3/3 match matters far more than v1/v2 (which grant no
    // kickstart and only ever contribute ongoing production). Giving v1/v2
    // first pick of the best vertices — the original order — spent the
    // board's best spots on placements that can only ever provide partial
    // credit, leaving v3/v4 to fall back on outright worse ones. The
    // occupied-set exclusion still makes every pick correctly aware of
    // every vertex chosen before it, regardless of this search order; only
    // the actual buildSettlement steps below stay in real setup order.
    const targetBiomes: Biome[] = ['mountains', 'fields', 'pasture']
    const occupied = new Set<string>()
    const v3 = findBestBiomeVertex(graph, targetBiomes, occupied)
    occupy(occupied, graph, v3)
    const v4 = findBestBiomeVertex(graph, targetBiomes, occupied)
    occupy(occupied, graph, v4)
    const v1 = findBestBiomeVertex(graph, targetBiomes, occupied)
    occupy(occupied, graph, v1)
    const v2 = findBestBiomeVertex(graph, targetBiomes, occupied)

    const [e1, e2, e3, e4] = [v1, v2, v3, v4].map((v) => firstEdgeAt(graph, v))

    // Same starter/other derivation as base-game.spec.ts — starting seat is
    // randomized per room (App.tsx:326-328), not always the host.
    const aStatus = await pageA.evaluate(() => window.__catanTestHarness!.getStatus())
    const starter: Actor = aStatus.isMyTurn ? 'A' : 'B'
    const other: Actor = starter === 'A' ? 'B' : 'A'

    // Setup order for 2 players is [starter, other, other, starter].
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

    // After setup completes, the starter takes the first real turn
    // (App.tsx's applyRoadPlacement, setup-completion branch).
    // 20, then 40, were both observed live to be occasionally insufficient
    // — a real run exhausting the cap without ever accumulating ore+grain+
    // wool, purely from unlucky dice on an already best-effort placement
    // (findBestBiomeVertex's number-weighting and priority ordering above).
    // Every one of those rounds' own rolls/discards/robber-moves converged
    // cleanly every time this was observed — this cap exists for genuine
    // dice variance, not to paper over a logic bug. 60 trades a longer
    // worst case (still well inside Playwright's own per-test timeout) for
    // a meaningfully smaller residual failure rate; it doesn't reduce that
    // rate to exactly zero, the same way base-game.spec.ts's documented
    // rare broadcast-loss limitation isn't fully eliminated either.
    const MAX_CATCHUP_ROUNDS = 60
    await buyDevCardWithCatchup(pageA, pageB, starter, other, graph, MAX_CATCHUP_ROUNDS)
    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])
    await buyDevCardWithCatchup(pageA, pageB, other, starter, graph, MAX_CATCHUP_ROUNDS)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
