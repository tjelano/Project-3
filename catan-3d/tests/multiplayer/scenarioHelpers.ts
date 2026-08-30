// catan-3d/tests/multiplayer/scenarioHelpers.ts
// Shared by every multi-round scenario (dev-card-purchase.spec.ts,
// progress-card-draw.spec.ts) — extracted once a second scenario needed the
// identical vertex-selection and post-roll-obligation logic, rather than
// duplicating it and risking the two copies drifting apart.
import type { Page } from '@playwright/test'
import type { Actor } from './harness'
import type { TestHarnessGraph, CatanTestHarness } from '../../src/testHarness'
import type { Biome } from '../../src/data/hexBoard'

export function firstEdgeAt(graph: TestHarnessGraph, vertexId: string): string {
  const edgeId = graph.vertexEdgeIds[vertexId]?.[0]
  if (!edgeId) throw new Error(`No edge found touching vertex ${vertexId}`)
  return edgeId
}

// The vertices directly connected (one edge) to `vertexId` — Catan's actual
// distance rule is just "not adjacent to another settlement," not a wider
// N-hop minimum, so checking immediate neighbors is sufficient and matches
// what buildSettlementRaw itself enforces.
export function neighborsOf(graph: TestHarnessGraph, vertexId: string): string[] {
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
// eligible for a future settlement pick — called after every placement a
// scenario computes, so later picks can never land somewhere the distance
// rule would reject.
export function occupy(occupied: Set<string>, graph: TestHarnessGraph, vertexId: string): void {
  occupied.add(vertexId)
  for (const neighbor of neighborsOf(graph, vertexId)) occupied.add(neighbor)
}

// Relative frequency of each dice total out of 36 two-die outcomes — 7 is
// never a tile number (that's the robber trigger, not a producer), so it's
// omitted rather than mapped to 0.
const DICE_WEIGHT: Record<number, number> = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 }

// Finds the unoccupied vertex that best touches `biomes` — primarily ranked
// by how many of the target biomes it touches (a vertex touches at most 3
// tiles), ties broken by summed dice-roll probability across the matching
// tiles, so a placement touching, say, mountains-on-6 beats one touching
// mountains-on-2 even though both count as "1 matching biome." Originally
// built for dev-card-purchase.spec.ts's ore+grain+wool target (all 3
// equally load-bearing there, so uniform weighting is correct); generic
// over `biomes`/`biomeWeights` since progress-card-draw.spec.ts needs the
// same mountains/fields/pasture target but NOT the same priorities — its
// city-building step only spends ore+grain (CITY_COST, game/types.ts:379),
// wool is dead weight until much later. Verified live: uniform weighting
// picked a vertex whose mountain and pasture numbers produced constantly
// but whose fields number barely ever came up — grain sat stuck at 1
// (short of CITY_COST's 2) for 15 straight rounds while ore climbed past
// 3, because the combined score rewarded a high SUM even though one of the
// two resources this stage actually needs was starved. biomeWeights lets a
// caller bias the tie-break toward the tiles that matter to it, without
// changing dev-card-purchase.spec.ts's behavior (defaults to 1 for every
// biome, i.e. unweighted, its existing behavior exactly).
export function findBestBiomeVertex(
  graph: TestHarnessGraph,
  biomes: Biome[],
  occupied: ReadonlySet<string>,
  biomeWeights: Partial<Record<Biome, number>> = {},
): string {
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
    const probabilityScore = matchingTiles.reduce(
      (sum, t) => sum + (t.number != null ? (DICE_WEIGHT[t.number] ?? 0) * (biomeWeights[t.biome] ?? 1) : 0),
      0,
    )
    const score = biomeMatchCount * 1000 + probabilityScore
    if (score > bestScore) {
      bestScore = score
      best = vertex.id
    }
  }
  if (!best) throw new Error('findBestBiomeVertex: no unoccupied vertex left on the board')
  return best
}

export function pageForActor(pageA: Page, pageB: Page, actor: Actor): Page {
  return actor === 'A' ? pageA : pageB
}

type BypassAction = 'discard' | 'chooseRobber' | 'moveRobber'

// Calls a test-hook action directly via page.evaluate() (not through
// runScenario's cross-page convergence check — see resolvePostRollObligations
// below for why) and throws if it was rejected.
export async function callHarnessAction(page: Page, action: BypassAction, args: unknown[] = []): Promise<void> {
  await page.evaluate(
    ({ action, args }) => (window.__catanTestHarness!.actions[action] as (...a: unknown[]) => void)(...args),
    { action, args },
  )
  const warning = await page.evaluate(() => window.__catanTestHarness!.getLastWarning())
  if (warning) throw new Error(`${action} was rejected: "${warning}"`)
}

// React's own state update from a dispatch inside page.evaluate() isn't
// necessarily visible via getState() the instant that evaluate() call
// resolves — the same batching lag documented at length in harness.ts
// (STABILIZATION_POLLS). A single immediate read after calling discard/
// chooseRobber/moveRobber caught a stale 'discard' snapshot once (verified
// live: gamePhase read back as 'discard' right after both pages' discard
// queues had already emptied). Polls until gamePhase visibly moves off
// `awayFrom`, bounded so a genuine stall still surfaces as a clear timeout.
export async function waitForPhaseChange(page: Page, awayFrom: string, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs
  let state = await page.evaluate(() => window.__catanTestHarness!.getState())
  while (state.turn.gamePhase === awayFrom && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    state = await page.evaluate(() => window.__catanTestHarness!.getState())
  }
  return state
}

// A round of catch-up can span many real rolls, so a 7 — and, past the
// 7-card limit, a discard — is a when-not-if, not just an edge case a short
// fixed-length scenario (base-game.spec.ts) can ignore. A natural 7 always
// lands on 'discard' first (if anyone's over the limit), then
// 'chooseRobberOrPirate' (App.tsx's chooseRobber/choosePirate, Task 6) —
// even on a board with no sea hexes to make the Pirate a real option,
// chooseRobber() is the only valid choice here — then 'moveRobber'. The
// game blocks endTurn until all of that resolves (every one of these
// phases fails handleEndTurn's `gamePhase !== 'playing'` check with the
// same "Roll the dice..." message, which is what actually surfaced this
// whole gap while building dev-card-purchase.spec.ts).
//
// Deliberately bypasses runScenario's cross-page convergence check for
// these steps: discard resolves per-viewer (App.tsx's activeDiscarderId —
// online play resolves each over-limit player's discard independently, not
// as a strict turn order), and chooseRobber's own comment in App.tsx says
// it's "local-only resolution... nothing to broadcast" — gamePhase is a
// turn-local UI concern each client derives for itself from the shared
// 7-roll trigger, not necessarily identical between the current player's
// screen and a spectating client's at every intermediate step. What
// actually matters is that the ROLLER's own phase gets back to 'playing'
// (what handleEndTurn requires) — polled via waitForPhaseChange, bounded
// so a genuine desync still surfaces as a clear timeout rather than
// hanging. Any real cross-client divergence in the actually-shared fields
// (resources from a discard or a steal, whose turn it is) still gets
// caught by the next real action's own runScenario call.
// A Cities & Knights barbarian attack (ship event-die faces advance the
// track independently of the 7/discard/robber flow above, so this can
// trigger on ANY roll, not just a 7) resolves its pillage — including any
// auto-resolve when there's only one eligible target — over more than one
// render/dispatch, the same batching lag every other wait in this file
// exists to absorb. Verified live: a buildSettlement call's OWN
// convergence check (runScenario) caught pillageQueue non-empty on one
// page and already-empty on the other, moments after a barbarian attack —
// this scenario's own post-roll settling hadn't waited long enough for
// that separate resolution to finish converging before moving on. Waits
// on BOTH pages (not just the roller's) since a pillage targets whichever
// player's city was eligible, not necessarily the roller.
async function waitForPillageToClear(page: Page, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let state = await page.evaluate(() => window.__catanTestHarness!.getState())
  while (
    (state.pendingQueues.pillageQueue.length > 0 || state.progress.activeBarbarianAttack != null) &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 150))
    state = await page.evaluate(() => window.__catanTestHarness!.getState())
  }
}

export async function resolvePostRollObligations(pageA: Page, pageB: Page, roller: Actor, graph: TestHarnessGraph): Promise<void> {
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
  if (state.turn.gamePhase === 'moveRobber') {
    const targetTile = graph.tiles.find((t) => t.id !== state.board.robberTileId)
    if (!targetTile) throw new Error('resolvePostRollObligations: no alternate tile found for the robber to move to')
    await callHarnessAction(rollerPage, 'moveRobber', [targetTile.id])

    state = await waitForPhaseChange(rollerPage, 'moveRobber')
    if (state.turn.gamePhase !== 'playing') {
      throw new Error(
        `resolvePostRollObligations: ${roller}'s gamePhase is "${state.turn.gamePhase}", not 'playing', after moving the robber`,
      )
    }
  }

  await waitForPillageToClear(pageA)
  await waitForPillageToClear(pageB)
}

export type { CatanTestHarness }
