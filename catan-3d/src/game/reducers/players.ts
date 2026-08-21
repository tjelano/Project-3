import type { Player, Resources, ResourceType, StolenItem, CommodityType } from '../types'
import { deductCost, SETTLEMENT_COST, CITY_COST, ROAD_COST, COMMODITY_ORDER, removeOne } from '../types'
import type { GameAction, GameState } from '../gameState'
import { applyDiscardCounts } from '../discard'

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
  | { type: 'TRADE_RESOLVED'; fromPlayerId: number; toPlayerId: number; offerResource: ResourceType; wantResource: ResourceType }
  | { type: 'DISCARD_CONFIRMED'; playerId: number; counts: Partial<Record<ResourceType | CommodityType, number>> }
  | { type: 'COMMODITY_TRADED'; playerId: number; give: CommodityType; receive: ResourceType | CommodityType }
  | { type: 'COMMERCIAL_HARBOR_PLAYED'; announcerId: number; resource: ResourceType; otherIdsInOrder: number[] }
  | { type: 'BANK_TRADE'; playerId: number; give: ResourceType; receive: ResourceType; rate: number }
  | { type: 'DEFENDER_OF_CATAN_AWARDED'; playerId: number }
  | { type: 'ALL_KNIGHTS_DEACTIVATED' }
  | { type: 'TAXATION_ARMED'; playerId: number }
  | { type: 'TAXATION_RESOLVED'; playerId: number; tileId: string; steals: { victimId: number; item: StolenItem | null }[] }

export function reducePlayers(players: Player[], action: GameAction, fullState: GameState): Player[] {
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
    case 'PILLAGE_CITY': {
      // Same ownership guard reduceBoard's own PILLAGE_CITY case uses —
      // reject anything that isn't a city this player actually owns, so a
      // future dispatcher of this action (snapshot replay, undo, a new call
      // site) can't hand a player free supply the way an unguarded
      // dispatch could.
      const building = fullState.board.settlements[action.vertexId]
      if (!building || building.type !== 'city' || building.ownerId !== action.playerId) return players
      return players.map((p) =>
        p.id === action.playerId
          ? {
              ...p,
              cityWalls: p.cityWalls.filter((v) => v !== action.vertexId),
              // Exact reverse of BUILD_CITY's own supply bookkeeping above:
              // the city returns to supply and a settlement piece is spent
              // taking its place. Without this a pillaged player could never
              // rebuild the city they just lost. Clamped at 0 as a safety
              // net, same as everywhere else supply counts are decremented.
              citiesRemaining: p.citiesRemaining + 1,
              settlementsRemaining: Math.max(0, p.settlementsRemaining - 1),
            }
          : p,
      )
    }
    case 'TRADE_RESOLVED':
      return players.map((p) => {
        if (p.id === action.fromPlayerId) {
          return { ...p, resources: { ...p.resources, [action.offerResource]: p.resources[action.offerResource] - 1, [action.wantResource]: p.resources[action.wantResource] + 1 } }
        }
        if (p.id === action.toPlayerId) {
          return { ...p, resources: { ...p.resources, [action.wantResource]: p.resources[action.wantResource] - 1, [action.offerResource]: p.resources[action.offerResource] + 1 } }
        }
        return p
      })
    case 'DISCARD_CONFIRMED':
      return players.map((p) => {
        if (p.id !== action.playerId) return p
        const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, action.counts)
        return { ...p, resources, commodities }
      })
    case 'COMMODITY_TRADED':
      // Trade level 3's 2:1 commodity trade. The rate is hardcoded at 2 here
      // rather than trusted over the wire (CommodityTradedPayload carries no
      // rate field at all) since this ability, unlike bank trades, has no
      // port-derived variance — it's always exactly 2:1. `receive` can name
      // either a resource or a different commodity (the rulebook allows
      // both), so which bucket gets the +1 is resolved by membership in
      // COMMODITY_ORDER.
      return players.map((p) => {
        if (p.id !== action.playerId) return p
        const commodities = { ...p.commodities, [action.give]: p.commodities[action.give] - 2 }
        if ((COMMODITY_ORDER as string[]).includes(action.receive)) {
          const receiveCommodity = action.receive as CommodityType
          return { ...p, commodities: { ...commodities, [receiveCommodity]: commodities[receiveCommodity] + 1 } }
        }
        const receiveResource = action.receive as ResourceType
        return { ...p, commodities, resources: { ...p.resources, [receiveResource]: p.resources[receiveResource] + 1 } }
      })
    case 'COMMERCIAL_HARBOR_PLAYED': {
      let next = players.map((p) =>
        p.id === action.announcerId ? { ...p, progressCards: removeOne(p.progressCards, 'commercialHarbor') } : p,
      )
      for (const targetId of action.otherIdsInOrder) {
        const announcer = next.find((p) => p.id === action.announcerId)!
        if (announcer.resources[action.resource] <= 0) break
        const target = next.find((p) => p.id === targetId)!
        const heldCommodities = COMMODITY_ORDER.filter((c) => target.commodities[c] > 0).sort(
          (a, b) => target.commodities[b] - target.commodities[a],
        )
        if (heldCommodities.length === 0) continue
        const commodity = heldCommodities[0]
        next = next.map((p) => {
          if (p.id === action.announcerId) {
            return { ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] - 1 }, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] + 1 } }
          }
          if (p.id === targetId) {
            return { ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] + 1 }, commodities: { ...p.commodities, [commodity]: p.commodities[commodity] - 1 } }
          }
          return p
        })
      }
      return next
    }
    case 'BANK_TRADE':
      return players.map((p) =>
        p.id === action.playerId
          ? { ...p, resources: { ...p.resources, [action.give]: p.resources[action.give] - action.rate, [action.receive]: p.resources[action.receive] + 1 } }
          : p,
      )
    case 'DEFENDER_OF_CATAN_AWARDED':
      return players.map((p) => (p.id === action.playerId ? { ...p, defenderOfCatanCount: p.defenderOfCatanCount + 1 } : p))
    case 'ALL_KNIGHTS_DEACTIVATED':
      return players.map((p) => ({ ...p, knightPieces: p.knightPieces.map((k) => ({ ...k, active: false })) }))
    case 'TAXATION_ARMED':
      return players.map((p) => (p.id === action.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'taxation') } : p))
    case 'TAXATION_RESOLVED':
      return players.map((p) => {
        const steal = action.steals.find((s) => s.victimId === p.id)
        if (steal?.item) {
          const item = steal.item
          return (COMMODITY_ORDER as string[]).includes(item)
            ? { ...p, commodities: { ...p.commodities, [item]: p.commodities[item as CommodityType] - 1 } }
            : { ...p, resources: { ...p.resources, [item]: p.resources[item as ResourceType] - 1 } }
        }
        if (p.id === action.playerId) {
          const resources = { ...p.resources }
          const commodities = { ...p.commodities }
          for (const s of action.steals) {
            if (!s.item) continue
            if ((COMMODITY_ORDER as string[]).includes(s.item)) {
              const commodity = s.item as CommodityType
              commodities[commodity] += 1
            } else {
              const resource = s.item as ResourceType
              resources[resource] += 1
            }
          }
          return { ...p, resources, commodities }
        }
        return p
      })
    default:
      // reducePlayers never has (or needs) a `never`-exhaustiveness default
      // — unlike reduceBoard, it's deliberately, permanently partial over
      // GameAction: it only owns the subset of actions with a players-side
      // effect. Everything else passes through unchanged.
      return players
  }
}
