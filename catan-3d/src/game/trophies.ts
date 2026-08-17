import type { BoardGraph } from '../data/boardGraph'
import type { Building } from './types'

// Longest continuous chain of a player's own roads (edges), respecting the
// standard Catan rule that an opponent's settlement or city on an
// intermediate vertex breaks the road at that point — the path can still
// arrive there, but can't continue past it. Board road counts are small
// (max 15 per player), so a plain DFS with backtracking is comfortably fast
// — no need for memoization.
export function calculateLongestRoad(
  playerId: number,
  roads: Record<string, number>,
  graph: BoardGraph,
  settlements: Record<string, Building>,
  // Cities & Knights knights: vertex id -> owning player id, for every
  // knight currently on the board (any strength, active or inactive — both
  // block equally per CN3087 p.9). Defaults to empty so every pre-existing
  // call site (and the whole pre-existing test suite above) keeps behaving
  // identically when this house rule is off.
  knightOwnerByVertex: ReadonlyMap<string, number> = new Map(),
): number {
  const ownedEdgeIds = new Set(graph.edges.filter((edge) => roads[edge.id] === playerId).map((edge) => edge.id))
  if (ownedEdgeIds.size === 0) return 0

  const adjacency = new Map<string, { edgeId: string; nextVertex: string }[]>()
  for (const edge of graph.edges) {
    if (!ownedEdgeIds.has(edge.id)) continue
    const addEntry = (from: string, to: string) => {
      const entry = { edgeId: edge.id, nextVertex: to }
      const list = adjacency.get(from)
      if (list) list.push(entry)
      else adjacency.set(from, [entry])
    }
    addEntry(edge.a, edge.b)
    addEntry(edge.b, edge.a)
  }

  const isBlockedByOpponent = (vertexId: string): boolean => {
    const building = settlements[vertexId]
    if (building != null && building.ownerId !== playerId) return true
    const knightOwnerId = knightOwnerByVertex.get(vertexId)
    return knightOwnerId != null && knightOwnerId !== playerId
  }

  const dfs = (vertex: string, visitedEdges: Set<string>): number => {
    // An opponent's settlement/city breaks the road here — arriving is
    // fine (already counted by the caller), but the path can't extend
    // further from this vertex.
    if (isBlockedByOpponent(vertex) && visitedEdges.size > 0) return 0

    let best = 0
    for (const { edgeId, nextVertex } of adjacency.get(vertex) ?? []) {
      if (visitedEdges.has(edgeId)) continue
      visitedEdges.add(edgeId)
      best = Math.max(best, 1 + dfs(nextVertex, visitedEdges))
      visitedEdges.delete(edgeId)
    }
    return best
  }

  let longest = 0
  for (const vertex of adjacency.keys()) {
    longest = Math.max(longest, dfs(vertex, new Set()))
  }
  return longest
}

// The transfer rule shared by Longest Road and Largest Army:
//
//  - Unclaimed until someone first reaches the threshold.
//  - The current holder keeps it on a tie — a challenger must STRICTLY
//    exceed the holder's count to take it over.
//  - The holder must keep MEETING the threshold to keep holding it. This
//    matters for Longest Road, where an opponent dropping a settlement
//    mid-path can split the holder's network below 5 — at which point the
//    card is returned, going to whichever challenger still qualifies, or
//    to nobody. (Largest Army can't decrease, so this never fires there.)
export function pickTrophyHolder(
  prevHolderId: number | null,
  counts: Map<number, number>,
  threshold: number,
): number | null {
  const incumbentCount = prevHolderId != null ? (counts.get(prevHolderId) ?? 0) : 0
  const incumbentQualifies = prevHolderId != null && incumbentCount >= threshold

  // With no qualifying incumbent the bar to beat is one below the
  // threshold, so the first player to actually reach it claims the trophy.
  let winnerId = incumbentQualifies ? prevHolderId : null
  let winnerCount = incumbentQualifies ? incumbentCount : threshold - 1

  for (const [playerId, count] of counts) {
    if (playerId === prevHolderId && incumbentQualifies) continue
    if (count < threshold) continue
    if (count > winnerCount) {
      winnerId = playerId
      winnerCount = count
    }
  }

  return winnerId
}
