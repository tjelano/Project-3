import type { Player, Resources, ResourceType, StolenItem, CommodityType, KnightPiece, KnightStrength, ProgressCardType, DevCardType, ImprovementTrack } from '../types'
import { deductCost, SETTLEMENT_COST, CITY_COST, ROAD_COST, CITY_WALL_COST, COMMODITY_ORDER, RESOURCE_ORDER, removeOne, KNIGHT_RECRUIT_COST, KNIGHT_ACTIVATE_COST, KNIGHT_PROMOTE_COST, PROGRESS_CARD_VP_TYPES, COMMODITY_FOR_TRACK } from '../types'
import type { GameAction, GameState } from '../gameState'
import { applyDiscardCounts, autoDiscardCounts, discardHandSize } from '../discard'
import { nextKnightStrength } from '../knights'
import { buyImprovementLevel } from '../cityImprovements'

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
  | { type: 'KNIGHT_RECRUITED'; knight: KnightPiece; isFree: boolean }
  | { type: 'KNIGHT_MOVED'; playerId: number; knightId: string; vertexId: string }
  | { type: 'KNIGHT_DISPLACED'; moverId: number; knightId: string; displacedOwnerId: number; targetKnightId: string; newMoverVertexId: string; displacedVertexId: string | null }
  | { type: 'INTRIGUE_RESOLVED'; displacedOwnerId: number; targetKnightId: string; displacedVertexId: string | null }
  | { type: 'KNIGHT_ACTIVATED'; playerId: number; knightId: string }
  | { type: 'KNIGHT_PROMOTED'; playerId: number; knightId: string; newStrength: KnightStrength }
  | { type: 'SMITHING_PLAYED'; playerId: number; knightIds: string[] }
  | { type: 'ENCOURAGEMENT_PLAYED'; playerId: number }
  | { type: 'KNIGHT_DEACTIVATED_AFTER_CHASE'; playerId: number; knightId: string }
  | { type: 'TREASON_KNIGHT_REMOVED'; actingPlayerId: number; targetPlayerId: number; removedKnight: KnightPiece }
  | { type: 'PROGRESS_CARD_SPENT'; playerId: number; card: ProgressCardType }
  | { type: 'DIPLOMACY_PLAYED'; playerId: number; ownerId: number }
  | { type: 'DEV_CARD_SPENT'; playerId: number; devCardType: DevCardType }
  | { type: 'IRRIGATION_PLAYED'; playerId: number; hexCount: number }
  | { type: 'MINING_PLAYED'; playerId: number; hexCount: number }
  | { type: 'CRANE_PLAYED'; playerId: number }
  | { type: 'MEDICINE_PLAYED'; playerId: number }
  | { type: 'YEAR_OF_PLENTY_PLAYED'; playerId: number; picks: ResourceType[] }
  | { type: 'MONOPOLY_PLAYED'; playerId: number; resource: ResourceType }
  | { type: 'RESOURCE_MONOPOLY_PLAYED'; playerId: number; resource: ResourceType }
  | { type: 'TRADE_MONOPOLY_PLAYED'; playerId: number; commodity: CommodityType }
  | { type: 'PROGRESS_DISCARD_CONFIRMED'; playerId: number; indices: number[] }
  | { type: 'SCIENCE_FREE_RESOURCE_PICKED'; playerId: number; resource: ResourceType }
  | { type: 'PROGRESS_CARDS_DRAWN'; draws: { playerId: number; card: ProgressCardType }[] }
  | { type: 'SABOTAGE_PLAYED'; announcerId: number; affected: number[]; countsCommodities: boolean }
  | { type: 'WEDDING_PLAYED'; announcerId: number; perPlayerCounts: { playerId: number; counts: Partial<Record<ResourceType | CommodityType, number>> }[]; takenTotals: Partial<Record<ResourceType | CommodityType, number>> }
  | { type: 'GUILD_DUES_TAKEN'; takerId: number; targetId: number; picks: (ResourceType | CommodityType)[] }
  | { type: 'ESPIONAGE_TAKEN'; takerId: number; targetId: number; cardIndex: number }
  | { type: 'CITY_IMPROVEMENT_PURCHASED'; playerId: number; track: ImprovementTrack; craneDiscount: boolean }
  | { type: 'CITY_WALL_BUILT'; playerId: number; vertexId: string; isFree: boolean }

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
    case 'KNIGHT_RECRUITED':
      return players.map((p) =>
        p.id === action.knight.ownerId
          ? {
              ...p,
              resources: action.isFree ? p.resources : deductCost(p.resources, KNIGHT_RECRUIT_COST),
              knightSupply: { ...p.knightSupply, [action.knight.strength]: p.knightSupply[action.knight.strength] - 1 },
              knightPieces: [...p.knightPieces, action.knight],
            }
          : p,
      )
    case 'KNIGHT_MOVED':
      return players.map((p) =>
        p.id !== action.playerId
          ? p
          : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === action.knightId ? { ...k, vertexId: action.vertexId, active: false } : k)) },
      )
    case 'KNIGHT_DISPLACED':
      return players.map((p) => {
        if (p.id === action.moverId) {
          return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === action.knightId ? { ...k, vertexId: action.newMoverVertexId, active: false } : k)) }
        }
        if (p.id === action.displacedOwnerId) {
          if (action.displacedVertexId) {
            return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === action.targetKnightId ? { ...k, vertexId: action.displacedVertexId! } : k)) }
          }
          const removed = p.knightPieces.find((k) => k.id === action.targetKnightId)
          return {
            ...p,
            knightPieces: p.knightPieces.filter((k) => k.id !== action.targetKnightId),
            knightSupply: removed ? { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 } : p.knightSupply,
          }
        }
        return p
      })
    case 'KNIGHT_ACTIVATED':
      return players.map((p) =>
        p.id !== action.playerId
          ? p
          : { ...p, resources: deductCost(p.resources, KNIGHT_ACTIVATE_COST), knightPieces: p.knightPieces.map((k) => (k.id === action.knightId ? { ...k, active: true } : k)) },
      )
    case 'KNIGHT_PROMOTED':
      return players.map((p) => {
        if (p.id !== action.playerId) return p
        const knight = p.knightPieces.find((k) => k.id === action.knightId)
        if (!knight) return p
        return {
          ...p,
          resources: deductCost(p.resources, KNIGHT_PROMOTE_COST),
          knightSupply: { ...p.knightSupply, [knight.strength]: p.knightSupply[knight.strength] + 1, [action.newStrength]: p.knightSupply[action.newStrength] - 1 },
          knightPieces: p.knightPieces.map((k) => (k.id === action.knightId ? { ...k, strength: action.newStrength } : k)),
        }
      })
    case 'SMITHING_PLAYED':
      return players.map((p) => {
        if (p.id !== action.playerId) return p
        let supply = { ...p.knightSupply }
        const knightPieces = p.knightPieces.map((k) => {
          if (!action.knightIds.includes(k.id)) return k
          const next = nextKnightStrength(k.strength)
          if (!next) return k
          supply = { ...supply, [k.strength]: supply[k.strength] + 1, [next]: supply[next] - 1 }
          return { ...k, strength: next }
        })
        return { ...p, progressCards: removeOne(p.progressCards, 'smithing'), knightSupply: supply, knightPieces }
      })
    case 'ENCOURAGEMENT_PLAYED':
      return players.map((p) =>
        p.id !== action.playerId
          ? p
          : { ...p, progressCards: removeOne(p.progressCards, 'encouragement'), knightPieces: p.knightPieces.map((k) => ({ ...k, active: true })) },
      )
    case 'KNIGHT_DEACTIVATED_AFTER_CHASE':
      return players.map((p) =>
        p.id !== action.playerId
          ? p
          : { ...p, knightPieces: p.knightPieces.map((k) => (k.id === action.knightId ? { ...k, active: false } : k)) },
      )
    case 'INTRIGUE_RESOLVED':
      return players.map((p) => {
        if (p.id !== action.displacedOwnerId) return p
        if (action.displacedVertexId) {
          return { ...p, knightPieces: p.knightPieces.map((k) => (k.id === action.targetKnightId ? { ...k, vertexId: action.displacedVertexId! } : k)) }
        }
        const removed = p.knightPieces.find((k) => k.id === action.targetKnightId)
        return {
          ...p,
          knightPieces: p.knightPieces.filter((k) => k.id !== action.targetKnightId),
          knightSupply: removed ? { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 } : p.knightSupply,
        }
      })
    case 'TREASON_KNIGHT_REMOVED':
      return players.map((p) => {
        if (p.id === action.actingPlayerId) return { ...p, progressCards: removeOne(p.progressCards, 'treason') }
        if (p.id === action.targetPlayerId) {
          // Trust the stored knight, not the action payload's copy — a
          // stale/malformed action naming a real knight ID with a different
          // strength must not credit the wrong supply tier, and a knight ID
          // that no longer exists must not credit any tier at all.
          const removed = p.knightPieces.find((k) => k.id === action.removedKnight.id)
          if (!removed) return p
          return {
            ...p,
            knightPieces: p.knightPieces.filter((k) => k.id !== action.removedKnight.id),
            knightSupply: { ...p.knightSupply, [removed.strength]: p.knightSupply[removed.strength] + 1 },
          }
        }
        return p
      })
    case 'PROGRESS_CARD_SPENT':
      return players.map((p) =>
        p.id === action.playerId ? { ...p, progressCards: removeOne(p.progressCards, action.card) } : p,
      )
    case 'DIPLOMACY_PLAYED':
      return players.map((p) => {
        if (p.id === action.playerId) return { ...p, progressCards: removeOne(p.progressCards, 'diplomacy') }
        // Returned to the OWNER's own supply, never the announcer's — a
        // removed road just goes back to whoever built it, same as any
        // other "un-build" (the announcer only gets something extra when
        // the removed road was their OWN, via the free-rebuild branch in
        // App.tsx's applyDiplomacyRemoval, not via this counter).
        if (p.id === action.ownerId && action.ownerId !== action.playerId) return { ...p, roadsRemaining: p.roadsRemaining + 1 }
        return p
      })
    case 'DEV_CARD_SPENT':
      return players.map((p) =>
        p.id === action.playerId
          ? { ...p, devCards: removeOne(p.devCards, action.devCardType), knightsPlayed: action.devCardType === 'knight' ? p.knightsPlayed + 1 : p.knightsPlayed }
          : p,
      )
    case 'IRRIGATION_PLAYED':
      return players.map((p) =>
        p.id === action.playerId
          ? { ...p, resources: { ...p.resources, grain: p.resources.grain + action.hexCount * 2 }, progressCards: removeOne(p.progressCards, 'irrigation') }
          : p,
      )
    case 'MINING_PLAYED':
      return players.map((p) =>
        p.id === action.playerId
          ? { ...p, resources: { ...p.resources, ore: p.resources.ore + action.hexCount * 2 }, progressCards: removeOne(p.progressCards, 'mining') }
          : p,
      )
    case 'CRANE_PLAYED':
      return players.map((p) => (p.id === action.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'crane') } : p))
    case 'MEDICINE_PLAYED':
      return players.map((p) => (p.id === action.playerId ? { ...p, progressCards: removeOne(p.progressCards, 'medicine') } : p))
    case 'YEAR_OF_PLENTY_PLAYED':
      return players.map((p) => {
        if (p.id !== action.playerId) return p
        const resources = { ...p.resources }
        for (const resource of action.picks) resources[resource] += 1
        return { ...p, resources }
      })
    case 'MONOPOLY_PLAYED': {
      const next = players.map((p) => ({ ...p, resources: { ...p.resources } }))
      const byId = new Map(next.map((p) => [p.id, p]))
      const currentEntry = byId.get(action.playerId)
      if (!currentEntry) return players
      for (const p of next) {
        if (p.id === action.playerId) continue
        const amount = p.resources[action.resource]
        if (amount <= 0) continue
        p.resources[action.resource] = 0
        currentEntry.resources[action.resource] += amount
      }
      return next
    }
    case 'RESOURCE_MONOPOLY_PLAYED': {
      let collected = 0
      const next = players.map((p) => {
        if (p.id === action.playerId || p.resources[action.resource] <= 0) return p
        const take = Math.min(2, p.resources[action.resource])
        collected += take
        return { ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] - take } }
      })
      return next.map((p) =>
        p.id === action.playerId ? { ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] + collected } } : p,
      )
    }
    case 'TRADE_MONOPOLY_PLAYED': {
      let collected = 0
      const next = players.map((p) => {
        if (p.id === action.playerId || p.commodities[action.commodity] <= 0) return p
        collected += 1
        return { ...p, commodities: { ...p.commodities, [action.commodity]: p.commodities[action.commodity] - 1 } }
      })
      return next.map((p) =>
        p.id === action.playerId ? { ...p, commodities: { ...p.commodities, [action.commodity]: p.commodities[action.commodity] + collected } } : p,
      )
    }
    case 'PROGRESS_DISCARD_CONFIRMED':
      return players.map((p) => {
        if (p.id !== action.playerId) return p
        const next = [...p.progressCards]
        for (const index of [...action.indices].sort((a, b) => b - a)) next.splice(index, 1)
        return { ...p, progressCards: next }
      })
    case 'SCIENCE_FREE_RESOURCE_PICKED':
      return players.map((p) => (p.id === action.playerId ? { ...p, resources: { ...p.resources, [action.resource]: p.resources[action.resource] + 1 } } : p))
    case 'PROGRESS_CARDS_DRAWN':
      return players.map((p) => {
        const drawn = action.draws.filter((d) => d.playerId === p.id).map((d) => d.card)
        return drawn.length === 0 ? p : { ...p, progressCards: [...p.progressCards, ...drawn] }
      })
    case 'SABOTAGE_PLAYED':
      return players.map((p) => {
        if (p.id === action.announcerId) return { ...p, progressCards: removeOne(p.progressCards, 'sabotage') }
        if (!action.affected.includes(p.id)) return p
        const handSize = discardHandSize(p.resources, p.commodities, action.countsCommodities)
        const counts = autoDiscardCounts(p.resources, p.commodities, Math.floor(handSize / 2))
        const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, counts)
        return { ...p, resources, commodities }
      })
    case 'GUILD_DUES_TAKEN':
      return players.map((p) => {
        if (p.id === action.targetId) {
          let resources = { ...p.resources }
          let commodities = { ...p.commodities }
          for (const pick of action.picks) {
            if ((RESOURCE_ORDER as readonly string[]).includes(pick)) resources = { ...resources, [pick]: Math.max(0, resources[pick as ResourceType] - 1) }
            else commodities = { ...commodities, [pick]: Math.max(0, commodities[pick as CommodityType] - 1) }
          }
          return { ...p, resources, commodities }
        }
        if (p.id === action.takerId) {
          let resources = { ...p.resources }
          let commodities = { ...p.commodities }
          for (const pick of action.picks) {
            if ((RESOURCE_ORDER as readonly string[]).includes(pick)) resources = { ...resources, [pick]: resources[pick as ResourceType] + 1 }
            else commodities = { ...commodities, [pick]: commodities[pick as CommodityType] + 1 }
          }
          return { ...p, resources, commodities }
        }
        return p
      })
    case 'WEDDING_PLAYED': {
      const countsByPlayerId = new Map(action.perPlayerCounts.map((entry) => [entry.playerId, entry.counts]))
      return players.map((p) => {
        if (p.id === action.announcerId) {
          const resources = { ...p.resources }
          const commodities = { ...p.commodities }
          for (const [type, count] of Object.entries(action.takenTotals)) {
            if (RESOURCE_ORDER.includes(type as ResourceType)) resources[type as ResourceType] += count as number
            else commodities[type as CommodityType] += count as number
          }
          return { ...p, resources, commodities, progressCards: removeOne(p.progressCards, 'wedding') }
        }
        const counts = countsByPlayerId.get(p.id)
        if (!counts) return p
        const { resources, commodities } = applyDiscardCounts(p.resources, p.commodities, counts)
        return { ...p, resources, commodities }
      })
    }
    case 'ESPIONAGE_TAKEN': {
      const target = players.find((p) => p.id === action.targetId)
      const card = target?.progressCards[action.cardIndex]
      // VP cards can't be taken — re-verified here (the receiver), not just
      // picker-side, since a receiving client must never trust that an
      // incoming index was already screened by the sender's own UI.
      if (!card || PROGRESS_CARD_VP_TYPES.has(card)) return players
      return players.map((p) => {
        if (p.id === action.targetId) {
          const next = [...p.progressCards]
          next.splice(action.cardIndex, 1)
          return { ...p, progressCards: next }
        }
        if (p.id === action.takerId) return { ...p, progressCards: [...p.progressCards, card] }
        return p
      })
    }
    case 'CITY_IMPROVEMENT_PURCHASED':
      return players.map((p) => {
        if (p.id !== action.playerId) return p
        const { commodities, cityImprovements } = buyImprovementLevel(p.commodities, p.cityImprovements, action.track)
        if (!action.craneDiscount) return { ...p, commodities, cityImprovements }
        const commodity = COMMODITY_FOR_TRACK[action.track]
        return { ...p, commodities: { ...commodities, [commodity]: commodities[commodity] + 1 }, cityImprovements }
      })
    case 'CITY_WALL_BUILT':
      return players.map((p) =>
        p.id !== action.playerId
          ? p
          : { ...p, resources: action.isFree ? p.resources : deductCost(p.resources, CITY_WALL_COST), cityWalls: [...p.cityWalls, action.vertexId] },
      )
    default:
      // reducePlayers never has (or needs) a `never`-exhaustiveness default
      // — unlike reduceBoard, it's deliberately, permanently partial over
      // GameAction: it only owns the subset of actions with a players-side
      // effect. Everything else passes through unchanged.
      return players
  }
}
