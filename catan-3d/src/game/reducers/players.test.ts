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

describe('reducePlayers — action not owned by this reducer', () => {
  it('returns the same array reference unchanged', () => {
    const players = createInitialPlayers(2)
    const result = reducePlayers(players, { type: 'RESET_BOARD' }, initialGameState)
    expect(result).toBe(players)
  })
})
