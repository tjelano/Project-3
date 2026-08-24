import type { HexTileData } from '../data/hexBoard'
import type { Building } from './types'

// One entry per resource pick a Gold Field roll owes a player — a
// settlement produces 1 entry, a city produces 2 (CN3083's "any
// combination": a city's 2 picks don't have to match each other, unlike
// every other hex's single fixed resource). Returned flat rather than
// grouped by player, since the caller queues one pending pick at a time
// (see App.tsx's goldFieldResourcePlayerIds).
export interface GoldFieldPick {
  playerId: number
  vertexId: string
}

// Pure extraction of the same tile/vertex walk App.tsx's dice-roll
// production handler already does for every other biome (BIOME_TO_RESOURCE)
// — App.tsx's own closures aren't unit-testable, this is. Matches this
// project's established precedent for extracting untested App.tsx logic
// (shipEligibility.ts, pirateEligibility.ts).
export function collectGoldFieldPicks(
  tiles: HexTileData[],
  total: number,
  robberTileId: string,
  settlements: Record<string, Building>,
  tileVertexIds: Map<string, string[]>,
): GoldFieldPick[] {
  const picks: GoldFieldPick[] = []
  for (const tile of tiles) {
    if (tile.biome !== 'gold') continue
    if (tile.number !== total) continue
    if (tile.id === robberTileId) continue // blocked by the Robber, same as every other hex

    const vertexIds = tileVertexIds.get(tile.id) ?? []
    for (const vertexId of vertexIds) {
      const building = settlements[vertexId]
      if (!building) continue
      const pickCount = building.type === 'city' ? 2 : 1
      for (let i = 0; i < pickCount; i++) {
        picks.push({ playerId: building.ownerId, vertexId })
      }
    }
  }
  return picks
}
