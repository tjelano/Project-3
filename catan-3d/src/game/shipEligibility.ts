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
// KNOWN GAP (see the Seafarers Ships & Longest Route plan's Global
// Constraints): CN3083 also blocks placement on any edge of the hex the
// pirate currently occupies. The pirate doesn't exist yet (Robber &
// Pirate Migration sub-plan) — this function has no way to check that
// yet. Revisit once pirateTileId exists.
export function isShipPlacementConnected(
  graph: BoardGraph,
  edgeById: Map<string, BoardEdge>,
  settlements: Record<string, Building>,
  ships: Record<string, number>,
  edgeId: string,
  playerId: number,
  excludeEdgeId?: string,
): boolean {
  const edge = edgeById.get(edgeId)
  if (!edge) return false
  if (settlements[edge.a]?.ownerId === playerId || settlements[edge.b]?.ownerId === playerId) return true
  return (
    hasPlayerShipAt(graph, ships, edge.a, playerId, excludeEdgeId) ||
    hasPlayerShipAt(graph, ships, edge.b, playerId, excludeEdgeId)
  )
}
