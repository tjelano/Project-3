import type { BoardGraph } from '../data/boardGraph'
import type { HexTileData } from '../data/hexBoard'

// CN3083: the pirate may only be placed on a sea hex.
export function isPirateEligibleTile(tileById: Map<string, HexTileData>, tileId: string): boolean {
  return tileById.get(tileId)?.biome === 'sea'
}

// CN3083: "only choose 1 player with a ship on that hex" — collects every
// distinct ship owner touching the tile's 6 edges, excluding the thief.
// Mirrors moveRobber's building-owner collection over vertices/settlements,
// here over edges/ships instead. No friendly-robber-style VP filter — CN3083
// doesn't specify one for the pirate.
export function pirateVictimShipOwners(
  graph: BoardGraph,
  ships: Record<string, number>,
  tileId: string,
  thiefId: number,
): number[] {
  const edgeIds = graph.tileEdgeIds.get(tileId) ?? []
  const ownerIds: number[] = []
  for (const edgeId of edgeIds) {
    const ownerId = ships[edgeId]
    if (ownerId != null && ownerId !== thiefId && !ownerIds.includes(ownerId)) {
      ownerIds.push(ownerId)
    }
  }
  return ownerIds
}
