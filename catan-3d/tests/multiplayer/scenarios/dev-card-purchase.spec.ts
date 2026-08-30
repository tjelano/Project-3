// catan-3d/tests/multiplayer/scenarios/dev-card-purchase.spec.ts
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import type { TestHarnessGraph } from '../../../src/testHarness'
import type { Biome } from '../../../src/data/hexBoard'
import type { Resources } from '../../../src/game/types'

function firstEdgeAt(graph: TestHarnessGraph, vertexId: string): string {
  const edgeId = graph.vertexEdgeIds[vertexId]?.[0]
  if (!edgeId) throw new Error(`No edge found touching vertex ${vertexId}`)
  return edgeId
}

// The vertices directly connected (one edge) to `vertexId` — Catan's actual
// distance rule is just "not adjacent to another settlement," not a wider
// N-hop minimum, so checking immediate neighbors is sufficient and matches
// what buildSettlementRaw itself enforces.
function neighborsOf(graph: TestHarnessGraph, vertexId: string): string[] {
  const edgeIds = graph.vertexEdgeIds[vertexId] ?? []
  const neighbors: string[] = []
  for (const edgeId of edgeIds) {
    const edge = graph.edges.find((e) => e.id === edgeId)
    if (!edge) continue
    neighbors.push(edge.a === vertexId ? edge.b : edge.a)
  }
  return neighbors
}

// Marks `vertexId` AND everything one edge away from it as no longer
// eligible for a future settlement pick — called after every placement
// this scenario computes, so later picks can never land somewhere the
// distance rule would reject.
function occupy(occupied: Set<string>, graph: TestHarnessGraph, vertexId: string): void {
  occupied.add(vertexId)
  for (const neighbor of neighborsOf(graph, vertexId)) occupied.add(neighbor)
}

// Relative frequency of each dice total out of 36 two-die outcomes — 7 is
// never a tile number (that's the robber trigger, not a producer), so it's
// omitted rather than mapped to 0.
const DICE_WEIGHT: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }

// Finds the unoccupied vertex that best supports affording ore+grain+wool
// (mountains/fields/pasture) — see hasDevCardCost below. Primarily ranked
// by how many of the 3 target biomes it touches (a vertex touches at most
// 3 tiles, so this alone can reach at most 3); ties within that broken by
// summed dice-roll probability across the matching tiles, so a placement
// that touches, say, mountains-on-6 beats one touching mountains-on-2 even
// though both count as "1 matching biome."
//
// This isn't just about the SECOND settlement's one-time setup kickstart
// (grantResourcesForVertex) — every settlement keeps producing resources
// for the rest of the game, and this scenario's catch-up loop
// (buyDevCardWithCatchup) leans on that ongoing production whenever the
// kickstart alone doesn't cover the full cost. A vertex touching all 3
// exact biomes is NOT guaranteed to exist on every randomly-seeded board
// (buildHexBoardFromCells seeds off the room code — verified empirically:
// only ~90% of boards have even 1 such vertex, and only ~29% have 2 that
// are mutually non-adjacent). Best-effort placement plus the bounded
// catch-up loop is what makes this scenario work on every board rather
// than only the lucky ones — weighting by number, not just biome, should
// also cut how many catch-up rounds that loop actually needs, since a
// biome-match-count-only version needed a 40-round cap and still
// occasionally exhausted it.
function findBestBiomeVertex(graph: TestHarnessGraph, biomes: Biome[], occupied: ReadonlySet<string>): string {
  const tileById = new Map(graph.tiles.map((t) => [t.id, t]))
  let best: string | null = null
  let bestScore = -1
  for (const vertex of graph.vertices) {
    if (occupied.has(vertex.id)) continue
    const touchingTiles = (graph.vertexTileIds[vertex.id] ?? [])
      .map((tileId) => tileById.get(tileId))
      .filter((t): t is NonNullable<typeof t> => t != null)
    const matchingTiles = touchingTiles.filter((t) => biomes.includes(t.biome))
    const biomeMatchCount = new Set(matchingTiles.map((t) => t.biome)).size
    const probabilityScore = matchingTiles.reduce((sum, t) => sum + (t.number != null ? (DICE_WEIGHT[t.number] ?? 0) : 0), 0)
    const score = biomeMatchCount * 1000 + probabilityScore
    if (score > bestScore) {
      bestScore = score
      best = vertex.id
    }
  }
  if (!best) throw new Error('findBestBiomeVertex: no unoccupied vertex left on the board')
  return best
}

function pageForActor(pageA: Page, pageB: Page, actor: Actor): Page {
  return actor === 'A' ? pageA : pageB
}

// DEV_CARD_COST, game/types.ts:380 — { ore: 1, grain: 1, wool: 1 }.
function hasDevCardCost(resources: Resources): boolean {
  return resources.ore >= 1 && resources.grain >= 1 && resources.wool >= 1
}

async function getCurrentPlayerResources(page: Page): Promise<Resources> {
  const state = await page.evaluate(() => window.__catanTestHarness!.getState())
  return state.players[state.turn.currentPlayerIndex].resources
}

async function callHarnessAction(
  page: Page,
  action: 'discard' | 'chooseRobber' | 'moveRobber',
  args: unknown[] = [],
): Promise<void> {
  await page.evaluate(
    ({ action, args }) => (window.__catanTestHarness!.actions[action] as (...a: unknown[]) => void)(...args),
    { action, args },
  )
  const warning = await page.evaluate(() => window.__catanTestHarness!.getLastWarning())
  if (warning) throw new Error(`${action} was rejected: "${warning}"`)
}

// A round of catch-up can span many real rolls, so — unlike base-game.spec.ts,
// which only ever rolls twice and stays inside the "no 7s on first 2 rolls"
// house rule's protection — a 7 is a when-not-if here, and with enough rolls
// accumulating resources, so is landing over the 7-card discard limit. A
// natural 7 always lands on 'discard' first (if anyone's over the limit),
// then 'chooseRobberOrPirate' (App.tsx's chooseRobber/choosePirate, Task 6)
// — even on a board with no sea hexes to make the Pirate a real option,
// chooseRobber() is the only valid choice here — then 'moveRobber'. The
// game blocks endTurn until all of that resolves (every one of these phases
// fails handleEndTurn's `gamePhase !== 'playing'` check with the same "Roll
// the dice..." message, which is what actually surfaced this whole gap).
//
// Deliberately bypasses runScenario's cross-page convergence check for these
// steps: discard resolves per-viewer (App.tsx's activeDiscarderId — online
// play resolves each over-limit player's discard independently, not as a
// strict turn order), and chooseRobber's own comment in App.tsx says it's
// "local-only resolution... nothing to broadcast" — gamePhase is a
// turn-local UI concern each client derives for itself from the shared
// 7-roll trigger, not necessarily identical between the current player's
// screen and a spectating client's at every intermediate step. What
// actually matters for this scenario is that the ROLLER's own phase gets
// back to 'playing' (what handleEndTurn requires) — polled directly below,
// bounded so a genuine desync still surfaces as a clear timeout rather than
// hanging. Any real cross-client divergence in the actually-shared fields
// (resources from a discard or a steal, whose turn it is) still gets caught
// by the next real action's own runScenario call.
// React's own state update from a dispatch inside page.evaluate() isn't
// necessarily visible via getState() the instant that evaluate() call
// resolves — the same batching lag documented at length in harness.ts
// (STABILIZATION_POLLS). A single immediate read after calling discard/
// chooseRobber/moveRobber caught a stale 'discard' snapshot here (verified
// live: gamePhase read back as 'discard' right after both pages' discard
// queues had already emptied). Polls until gamePhase visibly moves off
// `awayFrom`, bounded so a genuine stall still surfaces as a clear timeout.
async function waitForPhaseChange(page: Page, awayFrom: string, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs
  let state = await page.evaluate(() => window.__catanTestHarness!.getState())
  while (state.turn.gamePhase === awayFrom && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    state = await page.evaluate(() => window.__catanTestHarness!.getState())
  }
  return state
}

async function resolvePostRollObligations(pageA: Page, pageB: Page, roller: Actor, graph: TestHarnessGraph): Promise<void> {
  // discardForTest() is a no-op when this page's own player has nothing
  // pending, so calling it unconditionally on both pages is safe and
  // simpler than first inspecting state to decide who (if anyone) is over
  // the limit.
  await callHarnessAction(pageA, 'discard')
  await callHarnessAction(pageB, 'discard')

  const rollerPage = pageForActor(pageA, pageB, roller)
  let state = await waitForPhaseChange(rollerPage, 'discard')
  if (state.turn.gamePhase === 'chooseRobberOrPirate') {
    await callHarnessAction(rollerPage, 'chooseRobber')
    state = await waitForPhaseChange(rollerPage, 'chooseRobberOrPirate')
  }
  if (state.turn.gamePhase !== 'moveRobber') return
  const targetTile = graph.tiles.find((t) => t.id !== state.board.robberTileId)
  if (!targetTile) throw new Error('resolvePostRollObligations: no alternate tile found for the robber to move to')
  await callHarnessAction(rollerPage, 'moveRobber', [targetTile.id])

  state = await waitForPhaseChange(rollerPage, 'moveRobber')
  if (state.turn.gamePhase === 'playing') return
  throw new Error(
    `resolvePostRollObligations: ${roller}'s gamePhase is "${state.turn.gamePhase}", not 'playing', after moving the robber`,
  )
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
