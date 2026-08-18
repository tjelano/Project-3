import type { BoardGraph } from '../data/boardGraph'
import {
  KNIGHT_STRENGTH_ORDER,
  KNIGHT_STRENGTH_VALUE,
  KNIGHT_RECRUIT_COST,
  KNIGHT_ACTIVATE_COST,
  KNIGHT_PROMOTE_COST,
  CITY_WALL_COST,
  MAX_CITY_WALLS_BOARD_WIDE,
  MIGHTY_KNIGHT_POLITICS_LEVEL,
  canAfford,
  type Building,
  type KnightPiece,
  type KnightStrength,
  type Player,
} from './types'

// basic -> strong -> mighty -> null (already at the top).
export function nextKnightStrength(strength: KnightStrength): KnightStrength | null {
  const index = KNIGHT_STRENGTH_ORDER.indexOf(strength)
  return KNIGHT_STRENGTH_ORDER[index + 1] ?? null
}

export function canRecruitKnight(player: Player): boolean {
  return player.knightSupply.basic > 0 && canAfford(player.resources, KNIGHT_RECRUIT_COST)
}

export function canActivateKnight(player: Player, knight: KnightPiece): boolean {
  return !knight.active && canAfford(player.resources, KNIGHT_ACTIVATE_COST)
}

// Cost/supply/track checks only — does NOT check "already promoted this
// turn" (that's per-knight turn-state App.tsx tracks separately, since this
// module has no notion of "this turn").
export function canPromoteKnight(player: Player, knight: KnightPiece): boolean {
  const next = nextKnightStrength(knight.strength)
  if (!next) return false
  if (player.knightSupply[next] <= 0) return false
  if (next === 'mighty' && player.cityImprovements.politics < MIGHTY_KNIGHT_POLITICS_LEVEL) return false
  return canAfford(player.resources, KNIGHT_PROMOTE_COST)
}

export function canBuildCityWall(
  player: Player,
  vertexId: string,
  settlements: Record<string, Building>,
  totalWallsOnBoard: number,
): boolean {
  const building = settlements[vertexId]
  if (!building || building.ownerId !== player.id || building.type !== 'city') return false
  if (player.cityWalls.includes(vertexId)) return false
  if (totalWallsOnBoard >= MAX_CITY_WALLS_BOARD_WIDE) return false
  return canAfford(player.resources, CITY_WALL_COST)
}

// Cities & Knights Smithing (Task 13) — selects up to `max` (2, per the
// card text) of the player's OWN knights to promote for free. Tracks a
// RUNNING copy of knightSupply (remainingSupply below) as each candidate is
// accepted, rather than trusting canPromoteKnight's own static read of
// player.knightSupply across the whole selection: that field is unchanged
// on `player` for every candidate in one call, so two knights eligible for
// the SAME next tier would BOTH pass it when supply[next] === 1 for both —
// only a count that actually decrements between candidates catches that a
// single tier-slot can't cover two promotions. Left unfixed, the caller's
// own apply step (which DOES decrement sequentially, once per selected
// knight) would then drive knightSupply[next] to -1 — reachable in ordinary
// play, since knight displacement already returns a displaced knight's
// strength to its owner's supply mid-game, which is exactly how a tier's
// supply becomes 1 rather than 0.
//
// `player` should already have resources overridden to bypass
// canPromoteKnight's own affordability check (the caller's throwaway-clone
// trick — see playSmithing's own comment in App.tsx), since Smithing makes
// every promotion free; canPromoteKnight's track-level/politics check still
// runs per candidate unmodified, since that doesn't change per-selection.
export function selectSmithingPromotions(player: Player, alreadyPromotedThisTurn: Set<string>, max = 2): KnightPiece[] {
  const remainingSupply = { ...player.knightSupply }
  const selected: KnightPiece[] = []
  for (const knight of player.knightPieces) {
    if (selected.length >= max) break
    if (alreadyPromotedThisTurn.has(knight.id)) continue
    const next = nextKnightStrength(knight.strength)
    if (!next) continue
    if (!canPromoteKnight(player, knight)) continue
    if (remainingSupply[next] <= 0) continue
    remainingSupply[next] -= 1
    selected.push(knight)
  }
  return selected
}

// Builds a vertex adjacency map restricted to edges owned by playerId — the
// same technique game/trophies.ts's calculateLongestRoad already uses for
// its own DFS adjacency.
function ownRoadAdjacency(playerId: number, graph: BoardGraph, roads: Record<string, number>): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()
  const addNeighbor = (from: string, to: string) => {
    const list = adjacency.get(from)
    if (list) list.push(to)
    else adjacency.set(from, [to])
  }
  for (const edge of graph.edges) {
    if (roads[edge.id] !== playerId) continue
    addNeighbor(edge.a, edge.b)
    addNeighbor(edge.b, edge.a)
  }
  return adjacency
}

// Every vertex touching AT LEAST ONE of playerId's own road edges, that is
// currently empty (no building, no knight of any owner) — CN3087 p.9:
// "Knights must connect to one of your existing roads... do not need to
// follow the Distance Rule." Unlike knightMoveTargets below, this is NOT a
// continuous-route reachability search — recruiting has no "origin" to walk
// from, just "touches any of my roads."
export function recruitableVertices(
  playerId: number,
  graph: BoardGraph,
  roads: Record<string, number>,
  settlements: Record<string, Building>,
  knightsByVertex: ReadonlyMap<string, KnightPiece>,
): Set<string> {
  const result = new Set<string>()
  for (const edge of graph.edges) {
    if (roads[edge.id] !== playerId) continue
    for (const vertexId of [edge.a, edge.b]) {
      if (settlements[vertexId]) continue
      if (knightsByVertex.has(vertexId)) continue
      result.add(vertexId)
    }
  }
  return result
}

// BFS from originVertexId along playerId's own road network. Can pass
// through (not stop at) vertices holding playerId's OWN building/knight;
// stops at (can arrive at, cannot continue past) any other player's
// building or knight — same asymmetric rule game/trophies.ts's
// isBlockedByOpponent already applies for longest-road counting, applied
// here to reachability instead of path length.
function reachableVertices(
  originVertexId: string,
  playerId: number,
  graph: BoardGraph,
  roads: Record<string, number>,
  settlements: Record<string, Building>,
  knightsByVertex: ReadonlyMap<string, KnightPiece>,
): Set<string> {
  const adjacency = ownRoadAdjacency(playerId, graph, roads)

  const isPassable = (vertexId: string): boolean => {
    const building = settlements[vertexId]
    if (building != null && building.ownerId !== playerId) return false
    const knight = knightsByVertex.get(vertexId)
    if (knight != null && knight.ownerId !== playerId) return false
    return true
  }

  const visited = new Set<string>([originVertexId])
  const queue = [originVertexId]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current !== originVertexId && !isPassable(current)) continue
    for (const next of adjacency.get(current) ?? []) {
      if (visited.has(next)) continue
      visited.add(next)
      queue.push(next)
    }
  }
  visited.delete(originVertexId)
  return visited
}

// Empty vertices an active knight can move to.
export function knightMoveTargets(
  knight: KnightPiece,
  graph: BoardGraph,
  roads: Record<string, number>,
  settlements: Record<string, Building>,
  knightsByVertex: ReadonlyMap<string, KnightPiece>,
): Set<string> {
  const reachable = reachableVertices(knight.vertexId, knight.ownerId, graph, roads, settlements, knightsByVertex)
  const result = new Set<string>()
  for (const vertexId of reachable) {
    if (settlements[vertexId]) continue
    if (knightsByVertex.has(vertexId)) continue
    result.add(vertexId)
  }
  return result
}

// Reachable opponent knights, regardless of strength — the shared
// reachability/ownership half of knightDisplaceTargets, without its
// strength filter. Used directly by ordinary Displace (which layers its
// own strictly-weaker-than-mover filter on top, below) AND by Intrigue
// (App.tsx, Task 14 — CN3087: "You may displace an opponent's knight...
// connected to at least one of your routes" — no strength restriction at
// all, unlike an ordinary Displace action). Factored out here (Task 14
// review fix) rather than reused via a virtual mover object of some
// artificial strength: knightDisplaceTargets' own strength filter is
// `>=` (target must be STRICTLY weaker), so even a virtual 'mighty' mover
// — the top strength — would still wrongly exclude an opposing knight
// that is ALSO mighty (a tie), which is exactly backwards from Intrigue's
// actual "no restriction at all" rule.
export function reachableOpponentKnights(
  originVertexId: string,
  playerId: number,
  graph: BoardGraph,
  roads: Record<string, number>,
  settlements: Record<string, Building>,
  knightsByVertex: ReadonlyMap<string, KnightPiece>,
): KnightPiece[] {
  const reachable = reachableVertices(originVertexId, playerId, graph, roads, settlements, knightsByVertex)
  const result: KnightPiece[] = []
  for (const vertexId of reachable) {
    const target = knightsByVertex.get(vertexId)
    if (!target || target.ownerId === playerId) continue
    result.push(target)
  }
  return result
}

// Reachable opponent knights strictly weaker than the mover — CN3087 p.10:
// "Your knight must be stronger than the other player's knight." Layers
// the strength filter on top of reachableOpponentKnights' own reachability/
// ownership check rather than duplicating that BFS.
export function knightDisplaceTargets(
  knight: KnightPiece,
  graph: BoardGraph,
  roads: Record<string, number>,
  settlements: Record<string, Building>,
  knightsByVertex: ReadonlyMap<string, KnightPiece>,
): KnightPiece[] {
  return reachableOpponentKnights(knight.vertexId, knight.ownerId, graph, roads, settlements, knightsByVertex).filter(
    (target) => KNIGHT_STRENGTH_VALUE[target.strength] < KNIGHT_STRENGTH_VALUE[knight.strength],
  )
}

// CN3087's barbarian track has 7 positions (confirmed against the
// rulebook's own component art, page 3 — web sources disagreed between
// 7 and 8, likely an edition difference). Position 0 is the start;
// reaching position 6 (the 7th position) triggers an attack.
export const BARBARIAN_TRACK_LENGTH = 7

export interface BarbarianPillageTarget {
  playerId: number
  eligibleCityVertexIds: string[]
}

export interface BarbarianAttackWinner {
  playerId: number
  // true when tied for highest — a tied winner draws a progress card
  // instead of receiving the Defender of Catan VP (only a SOLE highest
  // contributor gets the VP).
  tied: boolean
}

export interface BarbarianAttackResult {
  barbarianStrength: number
  defenderStrength: number
  defendersWin: boolean
  // Empty when defenders win.
  pillageTargets: BarbarianPillageTarget[]
  // Empty when barbarians win.
  winners: BarbarianAttackWinner[]
}

// CN3087 pp.11: barbarian strength = total cities (incl. metropolises) on
// the board; defender strength = sum of ACTIVE knight strengths, all
// players. Ties favor defenders.
export function resolveBarbarianAttack(
  players: Player[],
  settlements: Record<string, Building>,
  // Vertex ids currently upgraded to a metropolis (any of the 3 tracks).
  // A metropolis is immune from pillage and is excluded from
  // citiesByPlayer below — but it still counts toward barbarianStrength
  // above, since barbarian strength counts ALL cities including
  // metropolises. Defaults to none, so callers that only need
  // barbarianStrength/defenderStrength (e.g. the track HUD's live
  // preview, Task 8) can keep calling this with 2 arguments.
  metropolisVertexIds: ReadonlySet<string> = new Set(),
): BarbarianAttackResult {
  const barbarianStrength = Object.values(settlements).filter((b) => b.type === 'city').length

  const activeKnightStrengthByPlayer = new Map<number, number>()
  for (const player of players) {
    const strength = player.knightPieces
      .filter((k) => k.active)
      .reduce((sum, k) => sum + KNIGHT_STRENGTH_VALUE[k.strength], 0)
    activeKnightStrengthByPlayer.set(player.id, strength)
  }
  const defenderStrength = [...activeKnightStrengthByPlayer.values()].reduce((a, b) => a + b, 0)

  const defendersWin = defenderStrength >= barbarianStrength

  if (defendersWin) {
    const maxStrength = Math.max(...activeKnightStrengthByPlayer.values())
    const topContributors = players.filter((p) => activeKnightStrengthByPlayer.get(p.id) === maxStrength)
    const tied = topContributors.length > 1
    return {
      barbarianStrength,
      defenderStrength,
      defendersWin: true,
      pillageTargets: [],
      winners: topContributors.map((p) => ({ playerId: p.id, tied })),
    }
  }

  // Cities owned per player, in a stable vertex-id order (for a
  // deterministic eligible-target list — the actual CHOICE of which one
  // to pillage is the player's own, per the design's UI section).
  const citiesByPlayer = new Map<number, string[]>()
  for (const [vertexId, building] of Object.entries(settlements)) {
    if (building.type !== 'city') continue
    if (metropolisVertexIds.has(vertexId)) continue // metropolises are immune from pillage
    const list = citiesByPlayer.get(building.ownerId)
    if (list) list.push(vertexId)
    else citiesByPlayer.set(building.ownerId, [vertexId])
  }
  for (const list of citiesByPlayer.values()) list.sort()

  // Immune: no PILLAGEABLE city at all — a metropolis-only player already
  // has none, since the metropolisVertexIds filter above excludes their
  // metropolis vertex from citiesByPlayer entirely (they still count
  // toward barbarianStrength up top, just not here).
  const strengthTiers = [...new Set([...activeKnightStrengthByPlayer.values()])].sort((a, b) => a - b)

  let pillageTargets: BarbarianPillageTarget[] = []
  for (const tierValue of strengthTiers) {
    const tierPlayerIds = players
      .filter((p) => activeKnightStrengthByPlayer.get(p.id) === tierValue)
      .map((p) => p.id)
    const nonImmune = tierPlayerIds.filter((id) => (citiesByPlayer.get(id)?.length ?? 0) > 0)
    if (nonImmune.length === 0) continue // whole tier immune, move to next tier up
    pillageTargets = nonImmune.map((playerId) => ({
      playerId,
      eligibleCityVertexIds: citiesByPlayer.get(playerId)!,
    }))
    break
  }

  return {
    barbarianStrength,
    defenderStrength,
    defendersWin: false,
    pillageTargets,
    winners: [],
  }
}
