import type { Player, Resources, ResourceType, StolenItem, CommodityType } from '../types'
import { deductCost, SETTLEMENT_COST, CITY_COST, ROAD_COST, COMMODITY_ORDER } from '../types'
import type { GameAction, GameState } from '../gameState'

export type PlayersAction =
  // Bridge for every setPlayers call site not yet individually migrated to
  // its own real action — see the players-slice design spec's "Why not a
  // smaller plan" section. Never broadcast (see this plan's Global
  // Constraints); deleted once every sub-plan through the final cutover has
  // replaced its own functions' calls with real actions.
  | { type: 'LEGACY_SET_PLAYERS'; updater: (players: Player[]) => Player[] }
  // applySettlementPlacement's 2nd-setup-round resource grant — kept as its
  // own action rather than folded into BUILD_SETTLEMENT's payload, per the
  // spec's "one action per distinct effect shape" rule: it's a genuinely
  // separate players-state change (only fires conditionally), not a variant
  // of placing the settlement itself.
  | { type: 'GRANT_SETUP_RESOURCES'; playerId: number; resources: Partial<Resources> }
  | { type: 'ROBBER_MOVED'; tileId: string; thiefId: number; victimId: number | null; stolenItem: StolenItem | null }

export function reducePlayers(players: Player[], action: GameAction, _fullState: GameState): Player[] {
  switch (action.type) {
    case 'LEGACY_SET_PLAYERS':
      return action.updater(players)
    case 'BUILD_SETTLEMENT':
      return players.map((p) =>
        p.id === action.playerId
          ? {
              ...p,
              resources: action.isSetup ? p.resources : deductCost(p.resources, SETTLEMENT_COST),
              settlementsRemaining: p.settlementsRemaining - 1,
            }
          : p,
      )
    case 'BUILD_CITY':
      return players.map((p) =>
        p.id === action.playerId
          ? {
              ...p,
              resources: deductCost(p.resources, action.costOverride ?? CITY_COST),
              settlementsRemaining: p.settlementsRemaining + 1,
              citiesRemaining: p.citiesRemaining - 1,
            }
          : p,
      )
    case 'BUILD_ROAD':
      return players.map((p) =>
        p.id === action.playerId
          ? {
              ...p,
              resources: action.isSetup || action.isFreeRoad ? p.resources : deductCost(p.resources, ROAD_COST),
              roadsRemaining: p.roadsRemaining - 1,
            }
          : p,
      )
    case 'GRANT_SETUP_RESOURCES':
      return players.map((p) => {
        if (p.id !== action.playerId) return p
        const resources = { ...p.resources }
        for (const [resource, amount] of Object.entries(action.resources) as [ResourceType, number][]) {
          resources[resource] += amount
        }
        return { ...p, resources }
      })
    case 'ROBBER_MOVED': {
      if (action.victimId == null || action.stolenItem == null) return players
      const stolenItem = action.stolenItem
      const isCommodity = (COMMODITY_ORDER as string[]).includes(stolenItem)
      return players.map((p) => {
        if (p.id === action.victimId) {
          return isCommodity
            ? { ...p, commodities: { ...p.commodities, [stolenItem as CommodityType]: p.commodities[stolenItem as CommodityType] - 1 } }
            : { ...p, resources: { ...p.resources, [stolenItem as ResourceType]: p.resources[stolenItem as ResourceType] - 1 } }
        }
        if (p.id === action.thiefId) {
          return isCommodity
            ? { ...p, commodities: { ...p.commodities, [stolenItem as CommodityType]: p.commodities[stolenItem as CommodityType] + 1 } }
            : { ...p, resources: { ...p.resources, [stolenItem as ResourceType]: p.resources[stolenItem as ResourceType] + 1 } }
        }
        return p
      })
    }
    case 'PILLAGE_CITY':
      return players.map((p) =>
        p.id === action.playerId
          ? {
              ...p,
              cityWalls: p.cityWalls.filter((v) => v !== action.vertexId),
              citiesRemaining: p.citiesRemaining + 1,
              settlementsRemaining: Math.max(0, p.settlementsRemaining - 1),
            }
          : p,
      )
    default:
      // reducePlayers never has (or needs) a `never`-exhaustiveness default
      // — unlike reduceBoard, it's deliberately, permanently partial over
      // GameAction: it only owns the subset of actions with a players-side
      // effect. Everything else passes through unchanged.
      return players
  }
}
