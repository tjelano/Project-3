// catan-3d/tests/multiplayer/scenarios/dev-card-purchase.spec.ts
import type { Page } from '@playwright/test'
import { test } from '@playwright/test'
import { hostRoom, joinRoom, startWhenFull, waitForGameStarted, assertConnected } from '../lobby'
import { runScenario, type Actor, type ScenarioStep } from '../harness'
import type { TestHarnessGraph } from '../../../src/testHarness'
import type { Biome } from '../../../src/data/hexBoard'
import type { Resources } from '../../../src/game/types'

// Same "spread across coordinates" trick as base-game.spec.ts, for the two
// FIRST setup settlements only — their position doesn't affect resources
// (only the SECOND settlement grants a starting-resource kickstart, see
// App.tsx's grantResourcesForVertex), so no biome constraint applies here.
function pickSpreadVertices(graph: TestHarnessGraph, count: number): string[] {
  if (count < 2) throw new Error(`pickSpreadVertices: count must be >= 2 (got ${count}) — division by (count - 1) below`)
  const sorted = [...graph.vertices].sort((a, b) => a.x + a.z - (b.x + b.z))
  const picks: string[] = []
  for (let i = 0; i < count; i++) {
    const index = Math.floor((i * (sorted.length - 1)) / (count - 1))
    picks.push(sorted[index].id)
  }
  return picks
}

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

// Finds the unoccupied vertex whose touching tiles best overlap `biomes`
// (most matching biomes wins; ties broken by graph order). Used to pick
// each player's SECOND setup settlement as close as possible to ore+grain+
// wool (mountains/fields/pasture) — see hasDevCardCost below — so
// grantResourcesForVertex's kickstart gets them as close to affording a
// dev card as the board's random biome layout allows.
//
// A vertex touching all 3 exact biomes is NOT guaranteed to exist on every
// randomly-seeded board (buildHexBoardFromCells seeds off the room code —
// verified empirically: only ~90% of boards have even 1 such vertex, and
// only ~29% have 2 that are mutually non-adjacent, i.e. usable by two
// different players). Best-effort placement plus the bounded catch-up loop
// below (buyDevCardWithCatchup) is what makes this scenario work on every
// board rather than only the lucky ones.
function findBestBiomeVertex(graph: TestHarnessGraph, biomes: Biome[], occupied: ReadonlySet<string>): string {
  const biomeByTileId = new Map(graph.tiles.map((t) => [t.id, t.biome]))
  let best: string | null = null
  let bestScore = -1
  for (const vertex of graph.vertices) {
    if (occupied.has(vertex.id)) continue
    const touchingBiomes = new Set(
      (graph.vertexTileIds[vertex.id] ?? []).map((tileId) => biomeByTileId.get(tileId)).filter((b): b is Biome => b != null),
    )
    const score = biomes.filter((b) => touchingBiomes.has(b)).length
    if (score > bestScore) {
      bestScore = score
      best = vertex.id
      if (score === biomes.length) break
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
  maxRounds: number,
): Promise<void> {
  for (let round = 0; round < maxRounds; round++) {
    await runScenario(pageA, pageB, [{ actor, action: 'rollDice' }])
    const resources = await getCurrentPlayerResources(pageForActor(pageA, pageB, actor))
    if (hasDevCardCost(resources)) {
      await runScenario(pageA, pageB, [{ actor, action: 'buyDevCard' }])
      return
    }
    await runScenario(pageA, pageB, [{ actor, action: 'endTurn' }])
    await runScenario(pageA, pageB, [{ actor: other, action: 'rollDice' }])
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

    // v1/v2: each player's FIRST setup settlement — position-agnostic.
    const [v1, v2] = pickSpreadVertices(graph, 2)
    const occupied = new Set<string>()
    occupy(occupied, graph, v1)
    occupy(occupied, graph, v2)

    // v3/v4: each player's SECOND setup settlement — best-effort ore+grain+
    // wool match. Picked in setup order (other's second, then starter's
    // second) so each pick's occupied-set exclusion already accounts for
    // every vertex placed before it.
    const targetBiomes: Biome[] = ['mountains', 'fields', 'pasture']
    const v3 = findBestBiomeVertex(graph, targetBiomes, occupied)
    occupy(occupied, graph, v3)
    const v4 = findBestBiomeVertex(graph, targetBiomes, occupied)

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
    const MAX_CATCHUP_ROUNDS = 20
    await buyDevCardWithCatchup(pageA, pageB, starter, other, MAX_CATCHUP_ROUNDS)
    await runScenario(pageA, pageB, [{ actor: starter, action: 'endTurn' }])
    await buyDevCardWithCatchup(pageA, pageB, other, starter, MAX_CATCHUP_ROUNDS)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
