import type { BoardEdge, BoardGraph } from '../data/boardGraph'
import type { Building } from './types'

// CN3083: a ship connects to your existing ships or buildings — never
// roads. `excludeEdgeId` lets a move-eligibility check ignore the ship's
// own current edge when evaluating its DESTINATION: the ship is still
// present in board state at check time (eligibility runs before the
// move dispatches), but after the move applies it will no longer be at
// its old edge, so it must not be allowed to anchor its own destination.
export function hasPlayerShipAt(
  graph: BoardGraph,
  ships: Record<string, number>,
  vertexId: string,
  playerId: number,
  excludeEdgeId?: string,
): boolean {
  const edgeIds = graph.vertexEdgeIds.get(vertexId) ?? []
  return edgeIds.some((edgeId) => edgeId !== excludeEdgeId && ships[edgeId] === playerId)
}

// A new ship (or a ship's destination, when moving) must connect to one
// of the player's existing ships or buildings — deliberately does not
// fall back to checking roads: a road ending at a coastal vertex does
// not, by itself, let a ship branch off it; the road has to terminate at
// a settlement/city first, which the settlements check below already
// covers.
//
// CN3083: "You may not place any new ship on an edge of the hex
// currently occupied by the pirate" (and, for moves, the destination
// obeys the same placement rule) — pirateTileId is optional so every
// pre-pirate call site keeps compiling; pass null/omit to check nothing.
export function isShipPlacementConnected(
  graph: BoardGraph,
  edgeById: Map<string, BoardEdge>,
  settlements: Record<string, Building>,
  ships: Record<string, number>,
  edgeId: string,
  playerId: number,
  excludeEdgeId?: string,
  pirateTileId?: string | null,
): boolean {
  const edge = edgeById.get(edgeId)
  if (!edge) return false
  if (pirateTileId != null && (graph.edgeTileIds.get(edgeId) ?? []).includes(pirateTileId)) return false
  if (settlements[edge.a]?.ownerId === playerId || settlements[edge.b]?.ownerId === playerId) return true
  return (
    hasPlayerShipAt(graph, ships, edge.a, playerId, excludeEdgeId) ||
    hasPlayerShipAt(graph, ships, edge.b, playerId, excludeEdgeId)
  )
}
