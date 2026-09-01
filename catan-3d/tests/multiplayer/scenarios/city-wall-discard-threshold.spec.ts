// catan-3d/tests/multiplayer/scenarios/city-wall-discard-threshold.spec.ts
import { expect, test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import { firstEdgeAt, pickSpreadVertices, pageForActor, callHarnessAction, waitForPhaseChange } from '../scenarioHelpers'
import { CITY_COST, CITY_WALL_COST, RESOURCE_ORDER, COMMODITY_ORDER, type Resources, type Commodities } from '../../../src/game/types'
import type { TestHarnessGraph } from '../../../src/testHarness'
import type { Page } from '@playwright/test'

// Cities & Knights city walls — found via the same post-roadmap code audit
// as PR #97/#98/#101. City walls do NOT protect a city from barbarian
// pillage in this codebase (confirmed by reading every `cityWalls` call
// site directly — an earlier assumption in this project's own roadmap
// notes that they might, was wrong, corrected before building the wrong
// scenario). Their real, sole mechanical effect (CN3087 p.8): "Each city
// wall adds 2 to the number you may hold before having to discard" —
// discardThreshold(wallCount) = 7 + 2*wallCount (game/discard.ts).
//
// Real cross-client risk this exercises: validDiscardPlayerIds is
// recomputed independently by EACH client from its own already-synced
// cityWalls/resources state on every roll — the same "independently
// recomputed per client" shape as the two real desync bugs this harness
// has already caught, never exercised for city walls before now.
//
// Three design iterations before this one — worth recording, since every
// one looked like a real bug at first and none of them were:
//   1. A per-round resync of BOTH players' full hands — flaky in a way
//      never fully root-caused, possibly the same identity-tracking gap
//      as (3) below rather than a genuine race.
//   2. A single up-front grant + floor(hand/2) formula, no resync at all —
//      flaky because a 7 ALSO moves the robber and steals from whoever has
//      a building on the new tile, silently subtracting 1 more than the
//      discard formula alone predicts.
//   3. Same as (2) plus a steal-free robber (steered to a tile touching
//      neither player) — STILL flaky, because the test's own "should
//      starter be exempt" check compared starter's hand against the BASE
//      7 threshold instead of starter's own WALL-ADJUSTED 9 threshold.
//      With an unbounded round loop, starter's hand can legitimately climb
//      past 9 too (production doesn't stop just because they're walled) —
//      at which point discarding them is CORRECT, and the test's own
//      premise, not the game, was wrong.
// This version fixes (3)'s actual bug (compare against 9, not 7) AND
// removes the possibility of it mattering at all: starter's hand is
// capped back to a safe value every round (a resync, like (1), but of
// ONLY the one player whose exact size the assertion depends on — other's
// exact size never matters, only that it stays over 7, which the initial
// grant already guarantees permanently).
const MAX_ROUNDS = 30
const STARTER_SAFE_HAND = 8 // over the base-7 threshold, always under starter's own 9

function safeTileIds(graph: TestHarnessGraph, vertices: string[]): string[] {
  const touched = new Set<string>()
  for (const v of vertices) for (const t of graph.vertexTileIds[v] ?? []) touched.add(t)
  return graph.tiles.map((t) => t.id).filter((id) => !touched.has(id))
}

// Same discard/chooseRobber/moveRobber sequence resolvePostRollObligations
// (scenarioHelpers.ts) uses, but with a CONTROLLED robber destination
// (any tile in `safe`) instead of its own "first other tile" default — see
// this file's own top comment for why. Omits waitForPillageToClear:
// barbarians are off for this whole scenario, so no pillage queue can ever
// populate.
async function resolveObligationsNoSteal(pageA: Page, pageB: Page, roller: Actor, safe: string[]): Promise<void> {
  await callHarnessAction(pageA, 'discard')
  await callHarnessAction(pageB, 'discard')
  const rollerPage = pageForActor(pageA, pageB, roller)
  let state = await waitForPhaseChange(rollerPage, 'discard')
  if (state.turn.gamePhase === 'chooseRobberOrPirate') {
    await callHarnessAction(rollerPage, 'chooseRobber')
    state = await waitForPhaseChange(rollerPage, 'chooseRobberOrPirate')
  }
  if (state.turn.gamePhase === 'moveRobber') {
    const target = safe.find((id) => id !== state.board.robberTileId)
    if (!target) throw new Error('resolveObligationsNoSteal: no safe robber tile available on this board')
    await callHarnessAction(rollerPage, 'moveRobber', [target])
    state = await waitForPhaseChange(rollerPage, 'moveRobber')
    if (state.turn.gamePhase !== 'playing') {
      throw new Error(`resolveObligationsNoSteal: gamePhase is "${state.turn.gamePhase}", not 'playing', after moving the robber`)
    }
  }
}

function handTotal(player: { resources: Record<string, number>; commodities: Record<string, number> }): number {
  return Object.values(player.resources).reduce((a, b) => a + b, 0) + Object.values(player.commodities).reduce((a, b) => a + b, 0)
}

// Caps ONE player's entire hand (resources + commodities) back to exactly
// `target` lumber and nothing else, via signed deltas (GRANT_TEST_RESOURCES
// applies with +=, never clamps — same technique player-trade.spec.ts
// already established). Skips the call entirely when already exactly at
// target — an all-zero grant is a legitimate no-op, but runScenario's own
// "did this action produce any observable effect" safety net can't tell
// that apart from a real rejection and would throw.
async function capHand(pageA: Page, pageB: Page, actor: Actor, playerId: number, target: number): Promise<void> {
  const state = await pageA.evaluate(() => window.__catanTestHarness!.getState())
  const self = state.players.find((p) => p.id === playerId)!
  const resources: Partial<Resources> = {}
  for (const r of RESOURCE_ORDER) resources[r] = (r === 'lumber' ? target : 0) - self.resources[r]
  const commodities: Partial<Commodities> = {}
  for (const c of COMMODITY_ORDER) commodities[c] = -self.commodities[c]
  const allZero = [...Object.values(resources), ...Object.values(commodities)].every((v) => v === 0)
  if (allZero) return
  await runScenario(pageA, pageB, [{ actor, action: 'grantResources', args: [resources, commodities] }])
}

test('a walled city raises the discard threshold, exempting the owner from a 7 that still hits others', async ({ browser }) => {
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

    await pageA.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsBarbarians: false }))
    await pageB.evaluate(() => window.__catanTestHarness!.actions.setGameRules({ citiesAndKnightsBarbarians: false }))

    const graph = await pageA.evaluate(() => window.__catanTestHarness!.getGraph())
    const [v1, v2, v3, v4] = pickSpreadVertices(graph, 4)
    const [e1, e2, e3, e4] = [v1, v2, v3, v4].map((v) => firstEdgeAt(graph, v))
    const safe = safeTileIds(graph, [v1, v2, v3, v4])
    if (safe.length === 0) throw new Error('no tile on this board touches neither player — cannot build a steal-free setup')

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

    // --- Starter's turn: build a city, then wall it. Uses the shared
    // resolvePostRollObligations for this ONE roll (steal risk is
    // irrelevant before either player holds a meaningful hand).
    await runScenario(pageA, pageB, [{ actor: starter, action: 'rollDice' }])
    await resolveObligationsNoSteal(pageA, pageB, starter, safe)
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [CITY_COST] },
      { actor: starter, action: 'buildSettlement', args: [v1] },
      { actor: starter, action: 'grantResources', args: [CITY_WALL_COST] },
    ])
    const beforeWall = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const brickBeforeWall = beforeWall.players.find((p) => p.id === starterId)!.resources.brick
    await runScenario(pageA, pageB, [{ actor: starter, action: 'buildCityWall', args: [v1] }])

    const afterWall = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    const starterAfterWall = afterWall.players.find((p) => p.id === starterId)!
    expect(starterAfterWall.cityWalls, 'the wall should be recorded at the city vertex').toEqual([v1])
    expect(starterAfterWall.resources.brick, 'building the wall should deduct CITY_WALL_COST brick').toBe(brickBeforeWall - 2)

    // Grant both players a real hand comfortably over the base-7 threshold
    // — starter (1 wall, threshold 9) should stay well under their own
    // threshold; other (0 walls, threshold 7) should be well over. Granted
    // ONCE, not re-synced per round — whatever real production adds on top
    // before the 7 lands is fine, since the assertions below read actual
    // state at that moment rather than assuming a fixed number.
    await runScenario(pageA, pageB, [
      { actor: starter, action: 'grantResources', args: [{ lumber: 8 }] },
      { actor: other, action: 'grantResources', args: [{ lumber: 8 }] },
    ])
    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])

    let resolved = false
    for (let round = 0; round < MAX_ROUNDS && !resolved; round++) {
      for (const roller of [other, starter]) {
        // Capped EVERY round so starter's hand can never organically climb
        // past their own 9 threshold before a 7 lands — see this file's
        // own top comment for why that specifically was design (3)'s bug.
        // other is never capped: any hand over 7 (guaranteed by the grant
        // above, permanently, since nothing before this point ever reduces
        // it) must discard regardless of its exact size, so there is
        // nothing for a cap to protect there.
        await capHand(pageA, pageB, starter, starterId, STARTER_SAFE_HAND)
        const before = await pageA.evaluate(() => window.__catanTestHarness!.getState())
        const otherHandBefore = handTotal(before.players.find((p) => p.id === otherId)!)

        await runScenario(pageA, pageB, [{ actor: roller, action: 'rollDice' }])
        await resolveObligationsNoSteal(pageA, pageB, roller, safe)

        const state = await pageA.evaluate(() => window.__catanTestHarness!.getState())
        const starterNow = state.players.find((p) => p.id === starterId)!
        const otherNow = state.players.find((p) => p.id === otherId)!
        const otherHandNow = handTotal(otherNow)

        // A 7 resolved iff other's hand actually dropped (they were over
        // their own 7 threshold and got auto-discarded, guaranteed from
        // the grant above regardless of which round this fires in) — no
        // robber steal can also be in play here (the robber always lands
        // on a tile touching neither player), so this drop is attributable
        // to the discard rule alone.
        if (otherHandNow < otherHandBefore) {
          resolved = true
          // The actual claim this scenario exists for — exempted vs. not,
          // gated by the wall bonus — not the exact discard COUNT
          // (floor(hand/2), already covered by discard.ts's own dedicated
          // unit tests and base-game scenarios elsewhere).
          expect(handTotal(starterNow), 'the walled owner (hand capped at 8, threshold 9) must NOT have been discarded').toBe(STARTER_SAFE_HAND)
          expect(otherHandNow, 'the unwalled player (threshold 7) must have been discarded (hand strictly decreased)').toBeLessThan(otherHandBefore)
          break
        }
        await runScenario(pageA, pageB, [{ actor: roller, action: 'endTurn' }])
      }
    }
    if (!resolved) {
      throw new Error(`No 7 resolved within ${MAX_ROUNDS} rounds (1/6 odds per roll)`)
    }

    // The loop above breaks the instant a 7 resolves, skipping the
    // runScenario(endTurn) call that would normally follow — so nothing
    // has waited for the discard broadcast resolveObligationsNoSteal
    // triggered (bypass path; only waits on the ROLLER's own phase, see
    // its header comment) to actually land on the OTHER page yet. Poll
    // for that convergence directly instead of reading both pages cold,
    // same bounded-wait shape as waitForPillageToClear (scenarioHelpers.ts).
    const deadline = Date.now() + 15_000
    let finalStateA = await pageA.evaluate(() => window.__catanTestHarness!.getState())
    let finalStateB = await pageB.evaluate(() => window.__catanTestHarness!.getState())
    while (JSON.stringify(finalStateA.players) !== JSON.stringify(finalStateB.players) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 200))
      ;[finalStateA, finalStateB] = await Promise.all([
        pageA.evaluate(() => window.__catanTestHarness!.getState()),
        pageB.evaluate(() => window.__catanTestHarness!.getState()),
      ])
    }
    expect(finalStateB.players, 'both pages must agree on the final player state').toEqual(finalStateA.players)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
