import { describe, expect, it } from 'vitest'
import { reducePlayers } from './players'
import { createInitialPlayers } from '../types'
import { initialGameState } from '../gameState'

describe('reducePlayers — LEGACY_SET_PLAYERS', () => {
  it('applies the given updater to the players array', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => ({ ...p, knightsPlayed: 9 })) },
      initialGameState,
    )
    expect(result[0].knightsPlayed).toBe(9)
    expect(result[1].knightsPlayed).toBe(9)
  })

  it('does not mutate the input array', () => {
    const players = createInitialPlayers(2)
    reducePlayers(players, { type: 'LEGACY_SET_PLAYERS', updater: (prev) => prev.map((p) => ({ ...p, knightsPlayed: 9 })) }, initialGameState)
    expect(players[0].knightsPlayed).toBe(0)
  })
})

describe('reducePlayers — BUILD_SETTLEMENT', () => {
  it('deducts the settlement cost and decrements settlementsRemaining outside setup', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 1, brick: 1, wool: 1, grain: 1, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: players[0].id, isSetup: false },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })
    expect(player.settlementsRemaining).toBe(players[0].settlementsRemaining - 1)
  })

  it('does not deduct resources during setup', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: players[0].id, isSetup: true },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual(players[0].resources)
    expect(player.settlementsRemaining).toBe(players[0].settlementsRemaining - 1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: players[0].id, isSetup: true },
      initialGameState,
    )
    expect(result[1]).toEqual(players[1])
  })
})

describe('reducePlayers — BUILD_CITY', () => {
  it('deducts CITY_COST, swaps a settlement for a city in the supply counts', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 2, ore: 3 } }))
    const result = reducePlayers(players, { type: 'BUILD_CITY', vertexId: 'V1', playerId: players[0].id }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })
    expect(player.settlementsRemaining).toBe(players[0].settlementsRemaining + 1)
    expect(player.citiesRemaining).toBe(players[0].citiesRemaining - 1)
  })

  it('deducts costOverride instead of CITY_COST when present (Medicine discount)', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 1 } }))
    const result = reducePlayers(
      players,
      { type: 'BUILD_CITY', vertexId: 'V1', playerId: players[0].id, costOverride: { ore: 1 } },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources.ore).toBe(0)
  })
})

describe('reducePlayers — BUILD_ROAD', () => {
  it('deducts ROAD_COST and decrements roadsRemaining outside setup/free roads', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 1, brick: 1, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: players[0].id, isSetup: false, isFreeRoad: false },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })
    expect(player.roadsRemaining).toBe(players[0].roadsRemaining - 1)
  })

  it('does not deduct resources when isSetup is true', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: players[0].id, isSetup: true, isFreeRoad: false },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources).toEqual(players[0].resources)
  })

  it('does not deduct resources when isFreeRoad is true', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: players[0].id, isSetup: false, isFreeRoad: true },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources).toEqual(players[0].resources)
  })
})

describe('reducePlayers — GRANT_SETUP_RESOURCES', () => {
  it('adds the given resource delta to the named player only', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'GRANT_SETUP_RESOURCES', playerId: players[0].id, resources: { grain: 2, ore: 1 } },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.grain).toBe(2)
    expect(player.resources.ore).toBe(1)
    expect(player.resources.lumber).toBe(0)
    expect(result.find((p) => p.id === players[1].id)!.resources).toEqual(players[1].resources)
  })
})

describe('reducePlayers — ROBBER_MOVED', () => {
  it('moves a resource from victim to thief', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 3, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'ROBBER_MOVED', tileId: 'T1', thiefId: players[1].id, victimId: players[0].id, stolenItem: 'lumber' },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(2)
    expect(result.find((p) => p.id === players[1].id)!.resources.lumber).toBe(4)
  })

  it('moves a commodity from victim to thief', () => {
    const players = createInitialPlayers(2)
    const playersWithCommodities = players.map((p, i) =>
      i === 0
        ? { ...p, commodities: { paper: 2, cloth: 0, coin: 0 } }
        : p
    )
    const result = reducePlayers(
      playersWithCommodities,
      { type: 'ROBBER_MOVED', tileId: 'T1', thiefId: playersWithCommodities[1].id, victimId: playersWithCommodities[0].id, stolenItem: 'paper' },
      initialGameState,
    )
    expect(result.find((p) => p.id === playersWithCommodities[0].id)!.commodities.paper).toBe(1)
    expect(result.find((p) => p.id === playersWithCommodities[1].id)!.commodities.paper).toBe(1)
  })

  it('does nothing when stolenItem is null', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'ROBBER_MOVED', tileId: 'T1', thiefId: players[1].id, victimId: players[0].id, stolenItem: null },
      initialGameState,
    )
    expect(result).toEqual(players)
  })

  it('does nothing when victimId is null', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'ROBBER_MOVED', tileId: 'T1', thiefId: players[1].id, victimId: null, stolenItem: 'lumber' },
      initialGameState,
    )
    expect(result).toEqual(players)
  })
})

describe('reducePlayers — PILLAGE_CITY', () => {
  it('removes the vertex from cityWalls, returns a city to supply, takes a settlement out', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, cityWalls: ['V1', 'V2'] }))
    const before = players[0]
    const result = reducePlayers(players, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.cityWalls).toEqual(['V2'])
    expect(player.citiesRemaining).toBe(before.citiesRemaining + 1)
    expect(player.settlementsRemaining).toBe(Math.max(0, before.settlementsRemaining - 1))
  })

  it('clamps settlementsRemaining at 0', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, settlementsRemaining: 0 }))
    const result = reducePlayers(players, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.settlementsRemaining).toBe(0)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — TRADE_RESOLVED', () => {
  it('swaps 1 offerResource for 1 wantResource between the two traders', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 2, brick: 2, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'TRADE_RESOLVED', fromPlayerId: players[0].id, toPlayerId: players[1].id, offerResource: 'lumber', wantResource: 'brick' },
      initialGameState,
    )
    const from = result.find((p) => p.id === players[0].id)!
    const to = result.find((p) => p.id === players[1].id)!
    expect(from.resources.lumber).toBe(1)
    expect(from.resources.brick).toBe(3)
    expect(to.resources.lumber).toBe(3)
    expect(to.resources.brick).toBe(1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(3)
    const result = reducePlayers(
      players,
      { type: 'TRADE_RESOLVED', fromPlayerId: players[0].id, toPlayerId: players[1].id, offerResource: 'lumber', wantResource: 'brick' },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[2].id)!).toEqual(players[2])
  })
})

describe('reducePlayers — DISCARD_CONFIRMED', () => {
  it('subtracts the given resource/commodity counts from the named player', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      resources: { lumber: 4, brick: 0, wool: 0, grain: 0, ore: 0 },
      commodities: { paper: 2, cloth: 0, coin: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'DISCARD_CONFIRMED', playerId: players[0].id, counts: { lumber: 2, paper: 1 } },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.lumber).toBe(2)
    expect(player.commodities.paper).toBe(1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'DISCARD_CONFIRMED', playerId: players[0].id, counts: {} }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — COMMODITY_TRADED', () => {
  it('deducts 2 of give, adds 1 to receive when receive is a commodity', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, commodities: { paper: 3, cloth: 0, coin: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'COMMODITY_TRADED', playerId: players[0].id, give: 'paper', receive: 'cloth' },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.commodities.paper).toBe(1)
    expect(player.commodities.cloth).toBe(1)
  })

  it('deducts 2 of give, adds 1 to receive when receive is a resource', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      commodities: { paper: 3, cloth: 0, coin: 0 },
      resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'COMMODITY_TRADED', playerId: players[0].id, give: 'paper', receive: 'ore' },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.commodities.paper).toBe(1)
    expect(player.resources.ore).toBe(1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, commodities: { paper: 3, cloth: 0, coin: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'COMMODITY_TRADED', playerId: players[0].id, give: 'paper', receive: 'cloth' },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — COMMERCIAL_HARBOR_PLAYED', () => {
  it("removes one commercialHarbor card from the announcer's hand", () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['commercialHarbor' as const] }))
    const result = reducePlayers(
      players,
      { type: 'COMMERCIAL_HARBOR_PLAYED', announcerId: players[0].id, resource: 'lumber', otherIdsInOrder: [] },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual([])
  })

  it("trades 1 resource for the target's most-held commodity, once per target, until the announcer runs out", () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? (['commercialHarbor' as const]) : [],
      resources: i === 0 ? { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
      commodities: i === 1 ? { paper: 0, cloth: 3, coin: 1 } : { paper: 0, cloth: 0, coin: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'COMMERCIAL_HARBOR_PLAYED', announcerId: players[0].id, resource: 'lumber', otherIdsInOrder: [players[1].id] },
      initialGameState,
    )
    const announcer = result.find((p) => p.id === players[0].id)!
    const target = result.find((p) => p.id === players[1].id)!
    expect(announcer.resources.lumber).toBe(0)
    expect(announcer.commodities.cloth).toBe(1)
    expect(target.resources.lumber).toBe(1)
    expect(target.commodities.cloth).toBe(2)
  })

  it('skips a target holding no commodities', () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? (['commercialHarbor' as const]) : [],
      resources: i === 0 ? { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'COMMERCIAL_HARBOR_PLAYED', announcerId: players[0].id, resource: 'lumber', otherIdsInOrder: [players[1].id] },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(1)
  })

  it('trades with multiple targets in order, re-reading announcer resources from each iteration', () => {
    const players = createInitialPlayers(3).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? (['commercialHarbor' as const]) : [],
      resources: i === 0 ? { lumber: 2, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
      commodities: i > 0 ? { paper: 0, cloth: 2, coin: 0 } : { paper: 0, cloth: 0, coin: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'COMMERCIAL_HARBOR_PLAYED', announcerId: players[0].id, resource: 'lumber', otherIdsInOrder: [players[1].id, players[2].id] },
      initialGameState,
    )
    const announcer = result.find((p) => p.id === players[0].id)!
    const target1 = result.find((p) => p.id === players[1].id)!
    const target2 = result.find((p) => p.id === players[2].id)!
    expect(announcer.resources.lumber).toBe(0)
    expect(announcer.commodities.cloth).toBe(2)
    expect(target1.resources.lumber).toBe(1)
    expect(target1.commodities.cloth).toBe(1)
    expect(target2.resources.lumber).toBe(1)
    expect(target2.commodities.cloth).toBe(1)
  })

  it('breaks early when announcer runs out of resources, leaving later targets untouched', () => {
    const players = createInitialPlayers(3).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? (['commercialHarbor' as const]) : [],
      resources: i === 0 ? { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
      commodities: i > 0 ? { paper: 0, cloth: 2, coin: 0 } : { paper: 0, cloth: 0, coin: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'COMMERCIAL_HARBOR_PLAYED', announcerId: players[0].id, resource: 'lumber', otherIdsInOrder: [players[1].id, players[2].id] },
      initialGameState,
    )
    const announcer = result.find((p) => p.id === players[0].id)!
    const target1 = result.find((p) => p.id === players[1].id)!
    const target2 = result.find((p) => p.id === players[2].id)!
    expect(announcer.resources.lumber).toBe(0)
    expect(announcer.commodities.cloth).toBe(1)
    expect(target1.resources.lumber).toBe(1)
    expect(target1.commodities.cloth).toBe(1)
    expect(target2.resources.lumber).toBe(0)
    expect(target2.commodities.cloth).toBe(2)
  })

  it('continues when a target has no commodities, proceeds to next target', () => {
    const players = createInitialPlayers(3).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? (['commercialHarbor' as const]) : [],
      resources: i === 0 ? { lumber: 2, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
      commodities: i === 1 ? { paper: 0, cloth: 0, coin: 0 } : i === 2 ? { paper: 0, cloth: 2, coin: 0 } : { paper: 0, cloth: 0, coin: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'COMMERCIAL_HARBOR_PLAYED', announcerId: players[0].id, resource: 'lumber', otherIdsInOrder: [players[1].id, players[2].id] },
      initialGameState,
    )
    const announcer = result.find((p) => p.id === players[0].id)!
    const target1 = result.find((p) => p.id === players[1].id)!
    const target2 = result.find((p) => p.id === players[2].id)!
    expect(announcer.resources.lumber).toBe(1)
    expect(announcer.commodities.cloth).toBe(1)
    expect(target1.resources.lumber).toBe(0)
    expect(target1.commodities.cloth).toBe(0)
    expect(target2.resources.lumber).toBe(1)
    expect(target2.commodities.cloth).toBe(1)
  })
})

describe('reducePlayers — BANK_TRADE', () => {
  it('deducts rate*give, adds 1 receive, for the named player only', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 4, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(
      players,
      { type: 'BANK_TRADE', playerId: players[0].id, give: 'lumber', receive: 'brick', rate: 4 },
      initialGameState,
    )
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.lumber).toBe(0)
    expect(player.resources.brick).toBe(1)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — action not owned by this reducer', () => {
  it('returns the same array reference unchanged', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'RESET_BOARD' }, initialGameState)
    expect(result).toBe(players)
  })
})
