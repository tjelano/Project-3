// catan-3d/tests/multiplayer/scenarios/progress-card-draw.spec.ts
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
import { COMMODITY_FOR_TRACK, type ImprovementTrack } from '../../../src/game/types'

// Same target as dev-card-purchase.spec.ts, reused for a different reason:
// a vertex touching mountains+fields+pasture funds a city's CITY_COST
// (game/types.ts:379 — { ore: 3, grain: 2 }) via its kickstart + ongoing
// production, AND — once that settlement becomes a city — that same
// mountain/pasture tile pair produces both coin (politics track) and cloth
// (trade track) commodities (game/types.ts's BIOME_TO_COMMODITY: forest→
// paper/science, pasture→cloth/trade, mountains→coin/politics; fields
// produces no commodity, only the grain that helped fund the city). Giving
// this scenario two independent tracks to succeed on, not just one, matters
// because the actual draw trigger (below) is a genuinely low-probability
// event even once eligible.
const TARGET_BIOMES: Biome[] = ['mountains', 'fields', 'pasture']

// CITY_COST (ore+grain) is the hard, unavoidable first gate every round of
// the catch-up loop below is blocked behind — pasture/wool matters only
// once a city already exists (cloth production, much later). Weighting
// mountains/fields above pasture in vertex selection keeps the algorithm
// from picking a vertex whose SUMMED probability looks great only because
// one strong wool number is carrying two weak ore/grain ones — verified
// live: unweighted selection did exactly that (grain stuck at 1, short of
// CITY_COST's 2, for 15 straight rounds while ore comfortably passed 3).
const CITY_COST_BIOME_WEIGHTS: Partial<Record<Biome, number>> = { mountains: 2, fields: 2, pasture: 1 }

// Cities & Knights progress-card draw eligibility (game/progressCards.ts's
// isEligibleToDraw): level 1 draws whenever the production (red) die shows
// 1 or 2 — 2/6 — AND the separate event die (rolled alongside the 2
// production dice) lands on this track's face — 1/6 of 6 faces (3 ship,
// 1 each science/trade/politics). This scenario watches for a draw on
// EITHER of the two commodities this placement produces (coin/politics,
// cloth/trade), not a single fixed track, which roughly doubles the
// per-roll odds once a player has both.
const TRACKS_PRODUCED: ImprovementTrack[] = ['politics', 'trade']

// CITY_COST, game/types.ts:379 — { ore: 3, grain: 2 }.
function canAffordCity(resources: { ore: number; grain: number }): boolean {
  return resources.ore >= 3 && resources.grain >= 2
}

async function getState(page: Page) {
  return page.evaluate(() => window.__catanTestHarness!.getState())
}

// Bounded catch-up spanning 3 sequential stages for `actor`'s own tracked
// vertex: build the city (once CITY_COST is affordable), buy level 1 on
// whichever of politics/trade has a commodity available (once a city
// exists), then just keep rolling until a draw actually lands. Each round
// only ever attempts ONE of these — the next real roll re-reads state and
// picks up wherever production left the player. `other` only rolls/passes
// during `actor`'s loop; their own city/improvement progress advances on
// their own turn inside their own call to this same function afterward,
// same structure as dev-card-purchase.spec.ts's buyDevCardWithCatchup.
async function advanceToProgressCardDraw(
  pageA: Page,
  pageB: Page,
  actor: Actor,
  other: Actor,
  ownVertexId: string,
  graph: TestHarnessGraph,
  maxRounds: number,
): Promise<void> {
  for (let round = 0; round < maxRounds; round++) {
    await runScenario(pageA, pageB, [{ actor, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, actor, graph)

    const actorPage = pageForActor(pageA, pageB, actor)
    const state = await getState(actorPage)
    const player = state.players[state.turn.currentPlayerIndex]

    // Doesn't end the turn here — mirrors dev-card-purchase.spec.ts's
    // buyDevCardWithCatchup, whose success branch just performs the action
    // and returns, leaving the caller as the ONE place that ends actor's
    // turn. An earlier version called endTurn here too, which combined
    // with the caller's own endTurn call right after this function returns
    // into a genuine double-endTurn bug — the second call landed after
    // the turn had already passed to `other`, rejected with "It's not
    // your turn."
    if (player.progressCards.length > 0) return

    const building = state.board.settlements[ownVertexId]
    if (!building || building.type !== 'city') {
      if (canAffordCity(player.resources)) {
        await runScenario(pageA, pageB, [{ actor, action: 'buildSettlement', args: [ownVertexId] }])
      }
    } else if (TRACKS_PRODUCED.every((track) => player.cityImprovements[track] < 1)) {
      const affordableTrack = TRACKS_PRODUCED.find((track) => player.commodities[COMMODITY_FOR_TRACK[track]] >= 1)
      if (affordableTrack) {
        await runScenario(pageA, pageB, [{ actor, action: 'buyCityImprovement', args: [affordableTrack] }])
      }
    }
    // Else: city built, already at level >= 1 on a track — nothing to buy,
    // just keep rolling and hope for the event-die + red-die combo.

    await runScenario(pageA, pageB, [{ actor, action: 'endTurn' }])
    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
    await resolvePostRollObligations(pageA, pageB, other, graph)
    await runScenario(pageA, pageB, [{ actor: other, action: 'endTurn' }])
  }
  throw new Error(`${actor} did not draw a progress card within ${maxRounds} of their own turns`)
}

// This scenario's catch-up loop is inherently heavier than dev-card-
// purchase.spec.ts's: CITY_COST (5 resource units) is a bigger ask than
// DEV_CARD_COST (3, mostly pre-covered by the setup kickstart), and the
// progress-card draw trigger itself is rarer than "roll until you hold 3
// specific resources." A single player's worst case was observed to take
// several minutes even before reaching the draw stage — well inside
// playwright.config.ts's global 1,050,000ms per-test timeout on its own,
// but both players hitting a bad case back to back could plausibly
// approach it. Extended explicitly rather than shrinking MAX_CATCHUP_ROUNDS
// to fit — the round cap exists for genuine dice/board variance, not
// wall-clock budgeting.
test('setup phase, both players draw a progress card', async ({ browser }) => {
  test.setTimeout(20 * 60 * 1000)
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

    // The real lobby only exposes ONE combined Cities & Knights toggle
    // (GameSetupMenu.tsx's toggleCitiesAndKnights), which turns knights and
    // barbarian attacks on right alongside commodities/progress cards —
    // this scenario needs only the latter two. A barbarian attack's
    // pillage can downgrade the very city this scenario depends on right
    // as it's being built, and does so on a schedule this test doesn't
    // control — verified live: a full run hit its 20-minute cap without
    // finishing, compounding "rebuild a pillaged city" cycles on top of
    // the already-slower-than-dev-card-purchase economy below. Called
    // identically on both pages before either one rolls (see setGameRules'
    // App.tsx wiring comment for why that's safe without a broadcast).
    await pageA.evaluate(() =>
      window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsKnights: false, citiesAndKnightsBarbarians: false }),
    )
    await pageB.evaluate(() =>
      window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsKnights: false, citiesAndKnightsBarbarians: false }),
    )

    const graph = await pageA.evaluate(() => window.__catanTestHarness!.getGraph())

    // Same priority-order reasoning as dev-card-purchase.spec.ts: v3/v4
    // (each player's SECOND, kickstart-granting settlement) get first pick
    // of the best-matching vertices, since that's the one each player will
    // upgrade into their commodity-producing city — v1/v2 only ever add
    // ongoing production toward the city's own resource cost.
    const occupied = new Set<string>()
    const v3 = findBestBiomeVertex(graph, TARGET_BIOMES, occupied, CITY_COST_BIOME_WEIGHTS)
    occupy(occupied, graph, v3)
    const v4 = findBestBiomeVertex(graph, TARGET_BIOMES, occupied, CITY_COST_BIOME_WEIGHTS)
    occupy(occupied, graph, v4)
    const v1 = findBestBiomeVertex(graph, TARGET_BIOMES, occupied, CITY_COST_BIOME_WEIGHTS)
    occupy(occupied, graph, v1)
    const v2 = findBestBiomeVertex(graph, TARGET_BIOMES, occupied, CITY_COST_BIOME_WEIGHTS)

    const [e1, e2, e3, e4] = [v1, v2, v3, v4].map((v) => firstEdgeAt(graph, v))

    // Same starter/other derivation as base-game.spec.ts — starting seat is
    // randomized per room (App.tsx:326-328), not always the host.
    const aStatus = await pageA.evaluate(() => window.__catanTestHarness!.getStatus())
    const starter: Actor = aStatus.isMyTurn ? 'A' : 'B'
    const other: Actor = starter === 'A' ? 'B' : 'A'

    // Setup order for 2 players is [starter, other, other, starter]. v4 is
    // starter's own eventual city; v3 is other's.
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
    // (App.tsx's applyRoadPlacement, setup-completion branch). Starts at
    // 100, not dev-card-purchase.spec.ts's 60 — this scenario has 3
    // sequential stages (city cost, then improvement cost, then the
    // draw itself) stacked on top of the same per-roll dice variance that
    // scenario's cap already had to absorb, and the draw trigger alone is
    // meaningfully rarer (roughly 1-in-9 per applicable roll with both
    // tracks live, vs. dev-card-purchase's simple "roll until you have the
    // 3 resources"). Tuned empirically the same way that scenario's cap
    // was — live runs, not a priori math.
    const MAX_CATCHUP_ROUNDS = 100
    await advanceToProgressCardDraw(pageA, pageB, starter, other, v4, graph, MAX_CATCHUP_ROUNDS)
    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])
    await advanceToProgressCardDraw(pageA, pageB, other, starter, v3, graph, MAX_CATCHUP_ROUNDS)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
