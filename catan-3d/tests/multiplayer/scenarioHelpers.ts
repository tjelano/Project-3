// catan-3d/tests/multiplayer/scenarioHelpers.ts
// Shared by every multi-round scenario (dev-card-purchase.spec.ts,
// progress-card-draw.spec.ts) — extracted once a second scenario needed the
// identical vertex-selection and post-roll-obligation logic, rather than
// duplicating it and risking the two copies drifting apart.
import type { Page } from '@playwright/test'
import { runScenario, type Actor } from './harness'
import type { TestHarnessGraph, CatanTestHarness } from '../../src/testHarness'
import type { Biome } from '../../src/data/hexBoard'
import { RESOURCE_ORDER, type Resources, type ResourceType } from '../../src/game/types'

// Seafarers: an edge is open ocean when EVERY flanking tile is sea (as
// opposed to "coastal," where at least one flanking tile is land) — the
// same distinction App.tsx's own coastalEdgeIds computes at runtime. This
// matters because buildRoad now defaults onto coastal edges (see App.tsx's
// buildRoadRaw); only true open ocean forces buildShip, so anything picking
// a road-buildable edge has to use this exact classification rather than
// "any edge touching a sea tile."
function isOpenOceanEdge(graph: TestHarnessGraph, tileById: Map<string, { biome: Biome }>, edgeId: string): boolean {
  const tileIds = graph.edgeTileIds[edgeId] ?? []
  return tileIds.length > 0 && tileIds.every((id) => tileById.get(id)?.biome === 'sea')
}

// The first ROAD-buildable edge touching `vertexId` — skips open ocean, not
// just "the first edge in the list": on a non-Seafarers board (no sea
// tiles at all) this is every caller's original behavior unchanged, but on
// a Seafarers board a coastal vertex's first-listed edge can easily BE open
// ocean, which buildRoad rejects (CodeRabbit review, PR #74 — a real gap
// once ship-longest-route.spec.ts started calling this on Seafarers
// vertices; the two live runs that passed before this fix just got lucky
// on vertex-edge ordering, not proof the gap was safe). A land-touching
// vertex always has at least 2 non-open-ocean edges (every edge bordering
// its land tile has that tile as a non-sea flanking tile), so this never
// throws for a vertex findBestBiomeVertex/findShipCapeCandidates would
// actually hand it.
export function firstEdgeAt(graph: TestHarnessGraph, vertexId: string): string {
  const tileById = new Map(graph.tiles.map((t) => [t.id, t]))
  const edgeId = (graph.vertexEdgeIds[vertexId] ?? []).find((id) => !isOpenOceanEdge(graph, tileById, id))
  if (!edgeId) throw new Error(`No road-buildable (non-open-ocean) edge found touching vertex ${vertexId}`)
  return edgeId
}

// The first ROAD-buildable edge touching `vertexId` OTHER than
// `excludeEdgeId` — same open-ocean skip as firstEdgeAt above. Extracted
// from monopoly-guild-dues-diplomacy.spec.ts (PR #88) once
// knight-move.spec.ts needed the identical "extend a road network by one
// more hop" logic, same "second scenario needs it" rule this file's own
// header comment documents.
export function secondEdgeAt(graph: TestHarnessGraph, vertexId: string, excludeEdgeId: string): string {
  const tileById = new Map(graph.tiles.map((t) => [t.id, t]))
  const edgeId = (graph.vertexEdgeIds[vertexId] ?? []).find((id) => id !== excludeEdgeId && !isOpenOceanEdge(graph, tileById, id))
  if (!edgeId) throw new Error(`secondEdgeAt: no second road-buildable edge found touching vertex ${vertexId}`)
  return edgeId
}

// Extracted from base-game.spec.ts once invention-play.spec.ts needed the
// identical logic — same "second scenario needs it" rule this file's own
// header comment documents. Picks `count` vertex ids spread evenly across
// the board (sorted by diagonal position), for setup-phase settlement
// placement where WHICH biomes get touched doesn't matter (no resource
// target to fund). The distance rule only requires 2+ edges of separation
// between settlements; spreading picks across the whole board's coordinate
// range gives far more separation than that on a board this size, so this
// doesn't need to reason about the graph's actual edge distances.
export function pickSpreadVertices(graph: TestHarnessGraph, count: number): string[] {
  if (count < 2) throw new Error(`pickSpreadVertices: count must be >= 2 (got ${count}) — division by (count - 1) below`)
  const sorted = [...graph.vertices].sort((a, b) => a.x + a.z - (b.x + b.z))
  const picks: string[] = []
  for (let i = 0; i < count; i++) {
    const index = Math.floor((i * (sorted.length - 1)) / (count - 1))
    picks.push(sorted[index].id)
  }
  return picks
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

// A bank trade's real rate depends on ports (2:1/3:1/4:1, App.tsx's
// getPortRate) — computed server-side, never exposed via getGraph(). 4 is
// the worst case; a surplus of that much in any resource always trades
// successfully regardless of what port (if any) the player actually has,
// and the game's own logic charges whatever the real, possibly-cheaper
// rate turns out to be — this helper never needs to know it in advance.
const MIN_TRADEABLE_SURPLUS = 4

// CITY_COST (game/types.ts:379, ore:3 grain:2) is the largest target any
// current scenario passes here — 5 individual trades in the worst case,
// since bankTrade only ever converts one resource per call. Generous
// margin above that so a bigger future target doesn't silently under-run.
const MAX_TRADES_PER_CALL = 12

async function getActorResources(page: Page): Promise<Resources> {
  const state = await page.evaluate(() => window.__catanTestHarness!.getState())
  return state.players[state.turn.currentPlayerIndex].resources
}

// Models how a real player actually closes a resource gap instead of just
// hoping dice eventually produce it: trades away genuine SURPLUS (current
// count minus whatever `needed` still requires of that same type — never
// dips into the portion this call itself is trying to reach) for whichever
// needed resource is still short. Catches a real class of scenario flake
// this session found: findBestBiomeVertex's setup placement is best-effort,
// not guaranteed — a player can end up with ZERO tiles producing one
// needed resource, in which case no number of dice rolls could ever
// satisfy `needed` on their own. Trading (using whatever the player DOES
// produce in surplus) is the only thing that can actually close that gap,
// exactly like a real player would.
//
// Call after each roll in a catch-up loop, before checking whether
// `needed` is now affordable. Every attempted trade goes through the real
// runScenario convergence check (not a bypass, unlike discard/chooseRobber/
// moveRobber above) — a bank trade changes both players' shared GameState
// the same way any build action does, so it gets the same sync coverage.
export async function topUpMissingResources(
  pageA: Page,
  pageB: Page,
  actor: Actor,
  needed: Partial<Resources>,
): Promise<void> {
  for (let i = 0; i < MAX_TRADES_PER_CALL; i++) {
    const resources = await getActorResources(pageForActor(pageA, pageB, actor))
    const shortType = RESOURCE_ORDER.find((type) => resources[type] < (needed[type] ?? 0))
    if (!shortType) return // nothing missing

    let giveType: ResourceType | null = null
    let giveSurplus = MIN_TRADEABLE_SURPLUS - 1
    for (const type of RESOURCE_ORDER) {
      if (type === shortType) continue
      const surplus = resources[type] - (needed[type] ?? 0)
      if (surplus > giveSurplus) {
        giveSurplus = surplus
        giveType = type
      }
    }
    if (!giveType) return // nothing has enough real surplus yet — try again after the next roll

    await runScenario(pageA, pageB, [{ actor, action: 'bankTrade', args: [giveType, shortType] }])
  }
}

// A "cape": a legal settlement spot (touches at least one land tile) that
// ALSO has at least one open-ocean edge of its own — a vertex where two sea
// tiles meet a land tile. Landing a settlement here lets the setup-phase
// free piece (CN3083 p.3: a coastal starting settlement may take a ship
// instead of a road) be a ship on the very first hop, so a chain walked
// from it can stay ALL-ship end to end. That matters because
// calculateLongestRoad (game/trophies.ts) only lets a road/ship type
// change count as one continuous route at a vertex where the player has a
// building — an all-ship chain sidesteps that rule entirely instead of
// needing a second settlement placed mid-chain to bridge a type change.
// Returns every candidate (not just the best), ranked by forest/pasture
// exposure (lumber/wool — SHIP_COST) so a caller can fall back to the next
// candidate if the best one's local sea pocket turns out too shallow for
// the chain length it needs.
export function findShipCapeCandidates(
  graph: TestHarnessGraph,
  occupied: ReadonlySet<string>,
): { vertexId: string; firstShipEdgeId: string }[] {
  const tileById = new Map(graph.tiles.map((t) => [t.id, t]))
  const candidates: { vertexId: string; firstShipEdgeId: string; score: number }[] = []
  for (const vertex of graph.vertices) {
    if (occupied.has(vertex.id)) continue
    const touchingTiles = (graph.vertexTileIds[vertex.id] ?? [])
      .map((id) => tileById.get(id))
      .filter((t): t is NonNullable<typeof t> => t != null)
    if (!touchingTiles.some((t) => t.biome !== 'sea')) continue
    const firstShipEdgeId = (graph.vertexEdgeIds[vertex.id] ?? []).find((id) => isOpenOceanEdge(graph, tileById, id))
    if (!firstShipEdgeId) continue
    const score = touchingTiles.filter((t) => t.biome === 'forest' || t.biome === 'pasture').length
    candidates.push({ vertexId: vertex.id, firstShipEdgeId, score })
  }
  candidates.sort((a, b) => b.score - a.score)
  return candidates
}

// Walks a chain of exactly `length` connected open-ocean edges, starting
// from `startEdgeId` (already known to touch `startVertexId`). DFS with
// backtracking, not a greedy walk — a sea-ring vertex can have as few as 2
// usable neighbors, so a purely greedy pick can dead-end short of `length`
// even when a full-length path exists via a different branch. Returns null
// (not a throw) when no full-length chain exists from this start — expected
// for a cape whose local sea pocket is too shallow, not an error; callers
// like findShipCapeWithChain below try the next candidate instead.
export function findShipChain(
  graph: TestHarnessGraph,
  startVertexId: string,
  startEdgeId: string,
  length: number,
): string[] | null {
  const tileById = new Map(graph.tiles.map((t) => [t.id, t]))
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]))
  const otherEndOf = (edgeId: string, vertexId: string): string => {
    const edge = edgeById.get(edgeId)!
    return edge.a === vertexId ? edge.b : edge.a
  }

  const walk = (vertexId: string, path: string[], visitedVertices: Set<string>): string[] | null => {
    if (path.length === length) return path
    for (const edgeId of graph.vertexEdgeIds[vertexId] ?? []) {
      if (path.includes(edgeId)) continue
      if (!isOpenOceanEdge(graph, tileById, edgeId)) continue
      const next = otherEndOf(edgeId, vertexId)
      if (visitedVertices.has(next)) continue
      visitedVertices.add(next)
      const result = walk(next, [...path, edgeId], visitedVertices)
      if (result) return result
      visitedVertices.delete(next)
    }
    return null
  }

  const firstNext = otherEndOf(startEdgeId, startVertexId)
  return walk(firstNext, [startEdgeId], new Set([startVertexId, firstNext]))
}

// Tries every cape candidate in rank order until one yields a full-length
// all-ship chain — the top-scoring cape by lumber/wool exposure isn't
// guaranteed to sit in a deep enough sea pocket for `length` edges.
export function findShipCapeWithChain(
  graph: TestHarnessGraph,
  occupied: ReadonlySet<string>,
  length: number,
): { vertexId: string; chain: string[] } {
  for (const candidate of findShipCapeCandidates(graph, occupied)) {
    const chain = findShipChain(graph, candidate.vertexId, candidate.firstShipEdgeId, length)
    if (chain) return { vertexId: candidate.vertexId, chain }
  }
  throw new Error(`findShipCapeWithChain: no coastal vertex on this board reaches a ${length}-edge open-ocean chain`)
}

// selectInventionTile joins this set for the same reason: the actual tile
// swap it resolves lives in a local React array (App.tsx's `tiles`) entirely
// outside GameState, so runScenario's getState()-only convergence check would
// wait the full CONVERGENCE_TIMEOUT_MS for a change that can never appear
// there, then throw "produced no observable state change" — a false failure,
// not a real one. See invention-play.spec.ts for how convergence gets
// verified instead (a manual getGraph().tiles poll on both pages).
// playResourceMonopoly/playTradeMonopoly join this set for a related but
// distinct reason from selectInventionTile above: they DO mutate real
// GameState (spend the card, arm the picker) but deliberately don't
// broadcast anything at that point — only the later resolveDevCardPicker/
// resolveDevCardCommodityPicker call broadcasts the combined spend+effect
// in one message (confirmed by reading onResourceMonopolyPlayed/
// onTradeMonopolyPlayed: both dispatch PROGRESS_CARD_SPENT themselves,
// receiver-side, when that single broadcast lands). Treating the play*
// call as its own runScenario step made a real (temporary, expected)
// cross-client gap look like a convergence failure — verified live before
// concluding this wasn't an actual bug.
// activateDiplomacy joins this set for the same reason selectInventionTile
// does: it only sets pendingDiplomacyRemoval, plain local React state
// outside GameState (same category as pendingEspionage/pendingGuildDues/
// pendingMetropolisClaim) — nothing for runScenario's getState()-only
// convergence check to ever observe. The real, broadcast action is the
// buildRoad(edgeId) call that resolves it (buildRoadRaw checks
// pendingDiplomacyRemoval before its normal logic), which goes through
// runScenario normally.
// armTaxation joins this set too — it flips gamePhase to 'moveRobber'
// LOCALLY (only PROGRESS_CARD_SPENT is mirrored to the receiver via
// onProgressCardPlayed's taxation branch, not GAME_PHASE_SET), same
// divergence shape playResourceMonopoly/playTradeMonopoly have. Resolved
// via the already-exposed moveRobber(tileId), which converges normally
// (applyTaxationResolved resets gamePhase back to 'playing' on BOTH
// clients once the steal actually broadcasts).
// armKnightRecruit joins this set too, and more simply than the others
// above: it touches NO synced state at all (not even a divergent one) —
// it only sets pendingKnightRecruit, plain local React state, with zero
// dispatch and zero broadcast (App.tsx's own comment on armKnightRecruit:
// "nothing is spent here until handleKnightVertexSelect... actually
// places the knight"). The real converging step is selectKnightVertex.
type BypassAction =
  | 'discard'
  | 'chooseRobber'
  | 'moveRobber'
  | 'selectInventionTile'
  | 'playResourceMonopoly'
  | 'playTradeMonopoly'
  | 'activateDiplomacy'
  | 'armTaxation'
  | 'armKnightRecruit'
  | 'armKnightMove'

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
