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
  const cityAt = (vertexId: string, ownerId: number) => ({
    ...initialGameState,
    board: { ...initialGameState.board, settlements: { [vertexId]: { ownerId, type: 'city' as const } } },
  })

  it('removes the vertex from cityWalls, returns a city to supply, takes a settlement out', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, cityWalls: ['V1', 'V2'] }))
    const before = players[0]
    const result = reducePlayers(players, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, cityAt('V1', players[0].id))
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.cityWalls).toEqual(['V2'])
    expect(player.citiesRemaining).toBe(before.citiesRemaining + 1)
    expect(player.settlementsRemaining).toBe(Math.max(0, before.settlementsRemaining - 1))
  })

  it('clamps settlementsRemaining at 0', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, settlementsRemaining: 0 }))
    const result = reducePlayers(players, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, cityAt('V1', players[0].id))
    expect(result.find((p) => p.id === players[0].id)!.settlementsRemaining).toBe(0)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, cityAt('V1', players[0].id))
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })

  it('no-ops when the vertex is not a city owned by the acting player', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, cityWalls: ['V1'] }))
    // Not a city at all (falls back to initialGameState's empty board).
    const notACity = reducePlayers(players, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, initialGameState)
    expect(notACity).toEqual(players)
    // A city, but owned by a different player.
    const wrongOwner = reducePlayers(players, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, cityAt('V1', players[1].id))
    expect(wrongOwner).toEqual(players)
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

describe('reducePlayers — DEFENDER_OF_CATAN_AWARDED', () => {
  it('increments defenderOfCatanCount for the named player only', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'DEFENDER_OF_CATAN_AWARDED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.defenderOfCatanCount).toBe(players[0].defenderOfCatanCount + 1)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — ALL_KNIGHTS_DEACTIVATED', () => {
  it('sets active to false on every knight for every player', () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      knightPieces: [{ id: `k${i}`, ownerId: p.id, strength: 'basic' as const, active: true, vertexId: `V${i}` }],
    }))
    const result = reducePlayers(players, { type: 'ALL_KNIGHTS_DEACTIVATED' }, initialGameState)
    expect(result[0].knightPieces[0].active).toBe(false)
    expect(result[1].knightPieces[0].active).toBe(false)
  })

  it('leaves a player with no knights unchanged', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'ALL_KNIGHTS_DEACTIVATED' }, initialGameState)
    expect(result[0].knightPieces).toEqual([])
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

describe('reducePlayers — TAXATION_ARMED', () => {
  it('removes one taxation card from the named player only', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['taxation' as const] }))
    const result = reducePlayers(players, { type: 'TAXATION_ARMED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual([])
    expect(result.find((p) => p.id === players[1].id)!.progressCards).toEqual(['taxation'])
  })
})

describe('reducePlayers — TAXATION_RESOLVED', () => {
  it('deducts each victim\'s stolen item and credits the actor', () => {
    const players = createInitialPlayers(3).map((p, i) => ({
      ...p,
      resources: i === 1 ? { lumber: 2, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
    }))
    const result = reducePlayers(
      players,
      { type: 'TAXATION_RESOLVED', playerId: players[0].id, tileId: 'T1', steals: [{ victimId: players[1].id, item: 'lumber' }] },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[1].id)!.resources.lumber).toBe(1)
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(1)
  })

  it('skips a victim with nothing to steal (item: null)', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(
      players,
      { type: 'TAXATION_RESOLVED', playerId: players[0].id, tileId: 'T1', steals: [{ victimId: players[1].id, item: null }] },
      initialGameState,
    )
    expect(result).toEqual(players)
  })

  it('credits multiple stolen items of mixed resource/commodity types to the actor', () => {
    const players = createInitialPlayers(3).map((p, i) => ({
      ...p,
      resources: i === 1 ? { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 } : { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 },
      commodities: i === 2 ? { paper: 1, cloth: 0, coin: 0 } : { paper: 0, cloth: 0, coin: 0 },
    }))
    const result = reducePlayers(
      players,
      {
        type: 'TAXATION_RESOLVED',
        playerId: players[0].id,
        tileId: 'T1',
        steals: [
          { victimId: players[1].id, item: 'lumber' },
          { victimId: players[2].id, item: 'paper' },
        ],
      },
      initialGameState,
    )
    const actor = result.find((p) => p.id === players[0].id)!
    expect(actor.resources.lumber).toBe(1)
    expect(actor.commodities.paper).toBe(1)
  })
})

describe('reducePlayers — KNIGHT_RECRUITED', () => {
  it('adds the knight and decrements its strength tier in supply, deducting resources when not free', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 1, grain: 0, ore: 1 } }))
    const knight = { id: 'k1', ownerId: players[0].id, strength: 'basic' as const, active: false, vertexId: 'V1' }
    const result = reducePlayers(players, { type: 'KNIGHT_RECRUITED', knight, isFree: false }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })
    expect(player.knightSupply.basic).toBe(players[0].knightSupply.basic - 1)
    expect(player.knightPieces).toEqual([knight])
  })

  it('adds the knight and decrements supply without deducting resources when free', () => {
    const players = createInitialPlayers(2)
    const knight = { id: 'k1', ownerId: players[0].id, strength: 'strong' as const, active: true, vertexId: 'V1' }
    const result = reducePlayers(players, { type: 'KNIGHT_RECRUITED', knight, isFree: true }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual(players[0].resources)
    expect(player.knightSupply.strong).toBe(players[0].knightSupply.strong - 1)
    expect(player.knightPieces).toEqual([knight])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const knight = { id: 'k1', ownerId: players[0].id, strength: 'basic' as const, active: false, vertexId: 'V1' }
    const result = reducePlayers(players, { type: 'KNIGHT_RECRUITED', knight, isFree: false }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — KNIGHT_MOVED', () => {
  it('moves the named knight and deactivates it', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_MOVED', playerId: players[0].id, knightId: 'k1', vertexId: 'V2' }, initialGameState)
    const knight = result.find((p) => p.id === players[0].id)!.knightPieces[0]
    expect(knight.vertexId).toBe('V2')
    expect(knight.active).toBe(false)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_MOVED', playerId: players[0].id, knightId: 'k1', vertexId: 'V2' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — KNIGHT_DISPLACED', () => {
  it('moves the mover to the new vertex (deactivated) and relocates the displaced knight when a vertex is available', () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      knightPieces: [{ id: i === 0 ? 'mover' : 'target', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(
      players,
      { type: 'KNIGHT_DISPLACED', moverId: players[0].id, knightId: 'mover', displacedOwnerId: players[1].id, targetKnightId: 'target', newMoverVertexId: 'V1', displacedVertexId: 'V2' },
      initialGameState,
    )
    const mover = result.find((p) => p.id === players[0].id)!.knightPieces[0]
    const target = result.find((p) => p.id === players[1].id)!.knightPieces[0]
    expect(mover.vertexId).toBe('V1')
    expect(mover.active).toBe(false)
    expect(target.vertexId).toBe('V2')
  })

  it('removes the displaced knight to supply when displacedVertexId is null', () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      knightPieces: [{ id: i === 0 ? 'mover' : 'target', ownerId: p.id, strength: 'strong' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(
      players,
      { type: 'KNIGHT_DISPLACED', moverId: players[0].id, knightId: 'mover', displacedOwnerId: players[1].id, targetKnightId: 'target', newMoverVertexId: 'V1', displacedVertexId: null },
      initialGameState,
    )
    const targetOwner = result.find((p) => p.id === players[1].id)!
    expect(targetOwner.knightPieces).toEqual([])
    expect(targetOwner.knightSupply.strong).toBe(players[1].knightSupply.strong + 1)
  })
})

describe('reducePlayers — INTRIGUE_RESOLVED', () => {
  it('relocates the displaced knight when a vertex is available', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'target', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(
      players,
      { type: 'INTRIGUE_RESOLVED', displacedOwnerId: players[0].id, targetKnightId: 'target', displacedVertexId: 'V2' },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[0].id)!.knightPieces[0].vertexId).toBe('V2')
  })

  it('removes the displaced knight to supply when displacedVertexId is null', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'target', ownerId: p.id, strength: 'mighty' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(
      players,
      { type: 'INTRIGUE_RESOLVED', displacedOwnerId: players[0].id, targetKnightId: 'target', displacedVertexId: null },
      initialGameState,
    )
    const owner = result.find((p) => p.id === players[0].id)!
    expect(owner.knightPieces).toEqual([])
    expect(owner.knightSupply.mighty).toBe(players[0].knightSupply.mighty + 1)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'target', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(
      players,
      { type: 'INTRIGUE_RESOLVED', displacedOwnerId: players[0].id, targetKnightId: 'target', displacedVertexId: 'V2' },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — KNIGHT_ACTIVATED', () => {
  it('deducts KNIGHT_ACTIVATE_COST and activates the named knight', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      resources: { lumber: 0, brick: 0, wool: 0, grain: 1, ore: 0 },
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: false, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_ACTIVATED', playerId: players[0].id, knightId: 'k1' }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.grain).toBe(0)
    expect(player.knightPieces[0].active).toBe(true)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: false, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_ACTIVATED', playerId: players[0].id, knightId: 'k1' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — KNIGHT_PROMOTED', () => {
  it('deducts KNIGHT_PROMOTE_COST, swaps supply buckets, and updates the knight\'s strength', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      resources: { lumber: 0, brick: 0, wool: 1, grain: 0, ore: 1 },
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_PROMOTED', playerId: players[0].id, knightId: 'k1', newStrength: 'strong' }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources).toEqual({ lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 })
    expect(player.knightSupply.basic).toBe(players[0].knightSupply.basic + 1)
    expect(player.knightSupply.strong).toBe(players[0].knightSupply.strong - 1)
    expect(player.knightPieces[0].strength).toBe('strong')
  })

  it('is a no-op when the knight is not found', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'KNIGHT_PROMOTED', playerId: players[0].id, knightId: 'missing', newStrength: 'strong' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!).toEqual(players[0])
  })
})

describe('reducePlayers — SMITHING_PLAYED', () => {
  it('promotes every listed knight one tier and removes one smithing card', () => {
    const players = createInitialPlayers(2)
    const testPlayers = [
      {
        ...players[0],
        progressCards: ['smithing' as const],
        knightPieces: [
          { id: 'k1', ownerId: players[0].id, strength: 'basic' as const, active: true, vertexId: 'V1' },
          { id: 'k2', ownerId: players[0].id, strength: 'strong' as const, active: true, vertexId: 'V2' },
        ],
      },
      players[1],
    ]
    const result = reducePlayers(testPlayers, { type: 'SMITHING_PLAYED', playerId: testPlayers[0].id, knightIds: ['k1', 'k2'] }, initialGameState)
    const player = result.find((p) => p.id === testPlayers[0].id)!
    expect(player.progressCards).toEqual([])
    expect(player.knightPieces.find((k) => k.id === 'k1')!.strength).toBe('strong')
    expect(player.knightPieces.find((k) => k.id === 'k2')!.strength).toBe('mighty')
  })

  it('leaves a mighty knight unchanged (no further tier to promote to)', () => {
    const players = createInitialPlayers(2)
    const testPlayers = [
      {
        ...players[0],
        progressCards: ['smithing' as const],
        knightPieces: [{ id: 'k1', ownerId: players[0].id, strength: 'mighty' as const, active: true, vertexId: 'V1' }],
      },
      players[1],
    ]
    const result = reducePlayers(testPlayers, { type: 'SMITHING_PLAYED', playerId: testPlayers[0].id, knightIds: ['k1'] }, initialGameState)
    expect(result.find((p) => p.id === testPlayers[0].id)!.knightPieces[0].strength).toBe('mighty')
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const testPlayers = [{ ...players[0], progressCards: ['smithing' as const] }, players[1]]
    const result = reducePlayers(testPlayers, { type: 'SMITHING_PLAYED', playerId: testPlayers[0].id, knightIds: [] }, initialGameState)
    expect(result.find((p) => p.id === testPlayers[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — ENCOURAGEMENT_PLAYED', () => {
  it('removes one encouragement card and activates every knight for the named player', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      progressCards: ['encouragement' as const],
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: false, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'ENCOURAGEMENT_PLAYED', playerId: players[0].id }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.progressCards).toEqual([])
    expect(player.knightPieces[0].active).toBe(true)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['encouragement' as const] }))
    const result = reducePlayers(players, { type: 'ENCOURAGEMENT_PLAYED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — KNIGHT_DEACTIVATED_AFTER_CHASE', () => {
  it('deactivates the named knight for the named player', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_DEACTIVATED_AFTER_CHASE', playerId: players[0].id, knightId: 'k1' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.knightPieces[0].active).toBe(false)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({
      ...p,
      knightPieces: [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }],
    }))
    const result = reducePlayers(players, { type: 'KNIGHT_DEACTIVATED_AFTER_CHASE', playerId: players[0].id, knightId: 'k1' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — TREASON_KNIGHT_REMOVED', () => {
  it("removes the treason card from the acting player and the named knight from the target, returning it to their supply", () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? ['treason' as const] : [],
      knightPieces: i === 1 ? [{ id: 'k1', ownerId: p.id, strength: 'strong' as const, active: true, vertexId: 'V1' }] : [],
    }))
    const knight = players[1].knightPieces[0]
    const result = reducePlayers(
      players,
      { type: 'TREASON_KNIGHT_REMOVED', actingPlayerId: players[0].id, targetPlayerId: players[1].id, removedKnight: knight },
      initialGameState,
    )
    const actor = result.find((p) => p.id === players[0].id)!
    const target = result.find((p) => p.id === players[1].id)!
    expect(actor.progressCards).toEqual([])
    expect(target.knightPieces).toEqual([])
    expect(target.knightSupply.strong).toBe(players[1].knightSupply.strong + 1)
  })

  it('leaves a third player untouched', () => {
    const players = createInitialPlayers(3).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? ['treason' as const] : [],
      knightPieces: i === 1 ? [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }] : [],
    }))
    const knight = players[1].knightPieces[0]
    const result = reducePlayers(
      players,
      { type: 'TREASON_KNIGHT_REMOVED', actingPlayerId: players[0].id, targetPlayerId: players[1].id, removedKnight: knight },
      initialGameState,
    )
    expect(result.find((p) => p.id === players[2].id)!).toEqual(players[2])
  })

  it("credits the knight's actual stored strength, not the action payload's, when they differ", () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? ['treason' as const] : [],
      knightPieces: i === 1 ? [{ id: 'k1', ownerId: p.id, strength: 'basic' as const, active: true, vertexId: 'V1' }] : [],
    }))
    // A stale/malformed action names the right knight ID but the wrong
    // strength — the reducer must trust the stored knight, not the payload.
    const staleKnight = { id: 'k1', ownerId: players[1].id, strength: 'mighty' as const, active: true, vertexId: 'V1' }
    const result = reducePlayers(
      players,
      { type: 'TREASON_KNIGHT_REMOVED', actingPlayerId: players[0].id, targetPlayerId: players[1].id, removedKnight: staleKnight },
      initialGameState,
    )
    const target = result.find((p) => p.id === players[1].id)!
    expect(target.knightPieces).toEqual([])
    expect(target.knightSupply.basic).toBe(players[1].knightSupply.basic + 1)
    expect(target.knightSupply.mighty).toBe(players[1].knightSupply.mighty)
  })

  it('is a no-op on the target when the named knight is already absent', () => {
    const players = createInitialPlayers(2).map((p, i) => ({
      ...p,
      progressCards: i === 0 ? ['treason' as const] : [],
      knightPieces: [],
    }))
    const ghostKnight = { id: 'gone', ownerId: players[1].id, strength: 'basic' as const, active: true, vertexId: 'V1' }
    const result = reducePlayers(
      players,
      { type: 'TREASON_KNIGHT_REMOVED', actingPlayerId: players[0].id, targetPlayerId: players[1].id, removedKnight: ghostKnight },
      initialGameState,
    )
    const target = result.find((p) => p.id === players[1].id)!
    expect(target).toEqual(players[1])
  })
})

describe('reducePlayers — PROGRESS_CARD_SPENT', () => {
  it('removes one instance of the named card from the player', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['alchemy' as const, 'alchemy' as const] }))
    const result = reducePlayers(players, { type: 'PROGRESS_CARD_SPENT', playerId: players[0].id, card: 'alchemy' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual(['alchemy'])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['invention' as const] }))
    const result = reducePlayers(players, { type: 'PROGRESS_CARD_SPENT', playerId: players[0].id, card: 'invention' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — DEV_CARD_SPENT', () => {
  it('removes one instance of the named dev card and bumps knightsPlayed only for knight', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, devCards: ['knight' as const, 'knight' as const], knightsPlayed: 1 }))
    const result = reducePlayers(players, { type: 'DEV_CARD_SPENT', playerId: players[0].id, devCardType: 'knight' }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.devCards).toEqual(['knight'])
    expect(player.knightsPlayed).toBe(2)
  })

  it('does not bump knightsPlayed for a non-knight dev card', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, devCards: ['monopoly' as const], knightsPlayed: 0 }))
    const result = reducePlayers(players, { type: 'DEV_CARD_SPENT', playerId: players[0].id, devCardType: 'monopoly' }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.devCards).toEqual([])
    expect(player.knightsPlayed).toBe(0)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, devCards: ['roadBuilding' as const] }))
    const result = reducePlayers(players, { type: 'DEV_CARD_SPENT', playerId: players[0].id, devCardType: 'roadBuilding' }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — IRRIGATION_PLAYED', () => {
  it('adds hexCount*2 grain and removes one irrigation card', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }, progressCards: ['irrigation' as const] }))
    const result = reducePlayers(players, { type: 'IRRIGATION_PLAYED', playerId: players[0].id, hexCount: 3 }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.grain).toBe(6)
    expect(player.progressCards).toEqual([])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['irrigation' as const] }))
    const result = reducePlayers(players, { type: 'IRRIGATION_PLAYED', playerId: players[0].id, hexCount: 1 }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — MINING_PLAYED', () => {
  it('adds hexCount*2 ore and removes one mining card', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }, progressCards: ['mining' as const] }))
    const result = reducePlayers(players, { type: 'MINING_PLAYED', playerId: players[0].id, hexCount: 2 }, initialGameState)
    const player = result.find((p) => p.id === players[0].id)!
    expect(player.resources.ore).toBe(4)
    expect(player.progressCards).toEqual([])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['mining' as const] }))
    const result = reducePlayers(players, { type: 'MINING_PLAYED', playerId: players[0].id, hexCount: 1 }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — CRANE_PLAYED', () => {
  it('removes one crane card', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['crane' as const] }))
    const result = reducePlayers(players, { type: 'CRANE_PLAYED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual([])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['crane' as const] }))
    const result = reducePlayers(players, { type: 'CRANE_PLAYED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — MEDICINE_PLAYED', () => {
  it('removes one medicine card', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['medicine' as const] }))
    const result = reducePlayers(players, { type: 'MEDICINE_PLAYED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.progressCards).toEqual([])
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, progressCards: ['medicine' as const] }))
    const result = reducePlayers(players, { type: 'MEDICINE_PLAYED', playerId: players[0].id }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — YEAR_OF_PLENTY_PLAYED', () => {
  it('adds 1 of each picked resource, allowing duplicates', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(players, { type: 'YEAR_OF_PLENTY_PLAYED', playerId: players[0].id, picks: ['lumber', 'lumber'] }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(2)
  })

  it('leaves every other player untouched', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'YEAR_OF_PLENTY_PLAYED', playerId: players[0].id, picks: ['ore'] }, initialGameState)
    expect(result.find((p) => p.id === players[1].id)!).toEqual(players[1])
  })
})

describe('reducePlayers — MONOPOLY_PLAYED', () => {
  it('takes all of a resource from every other player', () => {
    const players = createInitialPlayers(3).map((p, i) => ({ ...p, resources: { lumber: i === 0 ? 0 : 3, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(players, { type: 'MONOPOLY_PLAYED', playerId: players[0].id, resource: 'lumber' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(6)
    expect(result.find((p) => p.id === players[1].id)!.resources.lumber).toBe(0)
    expect(result.find((p) => p.id === players[2].id)!.resources.lumber).toBe(0)
  })

  it('is a no-op when no other player holds the resource', () => {
    const players = createInitialPlayers(2).map((p) => ({ ...p, resources: { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 } }))
    const result = reducePlayers(players, { type: 'MONOPOLY_PLAYED', playerId: players[0].id, resource: 'lumber' }, initialGameState)
    expect(result.find((p) => p.id === players[0].id)!.resources.lumber).toBe(0)
  })
})

describe('reducePlayers — action not owned by this reducer', () => {
  it('returns the same array reference unchanged', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'RESET_BOARD' }, initialGameState)
    expect(result).toBe(players)
  })
})
