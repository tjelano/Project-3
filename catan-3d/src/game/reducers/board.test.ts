import { describe, expect, it } from 'vitest'
import { reduceBoard, initialBoardState, describeBoardAction } from './board'
import { createInitialPlayers } from '../types'
import { initialGameState } from '../gameState'

describe('reduceBoard — BUILD_SETTLEMENT', () => {
  it('places a settlement at the given vertex, owned by the given player', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false },
      initialGameState,
    )
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('does not mutate the input state', () => {
    const before = initialBoardState
    reduceBoard(before, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false }, initialGameState)
    expect(before.settlements).toEqual({})
  })

  it('leaves roads untouched', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: true },
      initialGameState,
    )
    expect(result.roads).toEqual({})
  })
})

describe('reduceBoard — BUILD_CITY', () => {
  it('upgrades the vertex to a city, owned by the given player', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'city' })
  })

  it('overwrites an existing settlement at that vertex', () => {
    const withSettlement = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false },
      initialGameState,
    )
    const result = reduceBoard(withSettlement, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'city' })
  })

  it('ignores costOverride — that field is only meaningful to reducePlayers', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1, costOverride: { ore: 1 } },
      initialGameState,
    )
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'city' })
  })
})

describe('reduceBoard — BUILD_ROAD', () => {
  it('places a road at the given edge, owned by the given player', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1, isSetup: false, isFreeRoad: false },
      initialGameState,
    )
    expect(result.roads['E1']).toBe(1)
  })

  it('leaves settlements untouched', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1, isSetup: true, isFreeRoad: true },
      initialGameState,
    )
    expect(result.settlements).toEqual({})
  })
})

describe('reduceBoard — PILLAGE_CITY', () => {
  it('downgrades a city owned by the given player to a settlement', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    const result = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('is a no-op if the vertex is not currently a city', () => {
    const withSettlement = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false },
      initialGameState,
    )
    const result = reduceBoard(withSettlement, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(result).toBe(withSettlement)
  })

  it('is a no-op if the vertex has no building at all', () => {
    const result = reduceBoard(initialBoardState, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(result).toBe(initialBoardState)
  })

  it('is a no-op if the city is owned by a different player', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    const result = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 2 }, initialGameState)
    expect(result).toBe(withCity)
  })

  it('is idempotent — dispatching the same pillage twice only changes the vertex once', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    const first = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    const second = reduceBoard(first, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 }, initialGameState)
    expect(second).toBe(first)
  })
})

describe('reduceBoard — REMOVE_ROAD', () => {
  it('removes the road at the given edge entirely', () => {
    const withRoad = reduceBoard(
      initialBoardState,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1, isSetup: false, isFreeRoad: false },
      initialGameState,
    )
    const result = reduceBoard(withRoad, { type: 'REMOVE_ROAD', edgeId: 'E1' }, initialGameState)
    expect(result.roads).not.toHaveProperty('E1')
  })

  it('is a no-op if the edge has no road', () => {
    const result = reduceBoard(initialBoardState, { type: 'REMOVE_ROAD', edgeId: 'E1' }, initialGameState)
    expect(result).toBe(initialBoardState)
  })

  it('leaves other roads untouched', () => {
    let state = reduceBoard(
      initialBoardState,
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1, isSetup: false, isFreeRoad: false },
      initialGameState,
    )
    state = reduceBoard(state, { type: 'BUILD_ROAD', edgeId: 'E2', playerId: 2, isSetup: false, isFreeRoad: false }, initialGameState)
    const result = reduceBoard(state, { type: 'REMOVE_ROAD', edgeId: 'E1' }, initialGameState)
    expect(result.roads['E2']).toBe(2)
  })
})

describe('reduceBoard — RESET_BOARD', () => {
  it('clears settlements and roads back to empty', () => {
    let state = reduceBoard(
      initialBoardState,
      { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false },
      initialGameState,
    )
    state = reduceBoard(state, { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1, isSetup: false, isFreeRoad: false }, initialGameState)
    const result = reduceBoard(state, { type: 'RESET_BOARD' }, initialGameState)
    expect(result).toEqual(initialBoardState)
  })
})

describe('reduceBoard — RESTORE_BOARD', () => {
  it('replaces settlements and roads with the given snapshot values', () => {
    const settlements = { V1: { ownerId: 2, type: 'city' as const } }
    const roads = { E1: 2 }
    const result = reduceBoard(
      initialBoardState,
      { type: 'RESTORE_BOARD', settlements, roads, ships: {}, shipsBuiltThisTurn: [], hasMovedShipThisTurn: false },
      initialGameState,
    )
    expect(result.settlements).toEqual(settlements)
    expect(result.roads).toEqual(roads)
  })
})

describe('reduceBoard — ships data model', () => {
  it('initialBoardState has empty ships and clean per-turn ship tracking', () => {
    expect(initialBoardState.ships).toEqual({})
    expect(initialBoardState.shipsBuiltThisTurn).toEqual([])
    expect(initialBoardState.hasMovedShipThisTurn).toBe(false)
  })

  it('RESET_BOARD clears ships and per-turn ship tracking', () => {
    const dirty = {
      settlements: {},
      roads: {},
      ships: { E1: 1 },
      shipsBuiltThisTurn: ['E1'],
      hasMovedShipThisTurn: true,
    }
    const result = reduceBoard(dirty, { type: 'RESET_BOARD' }, initialGameState)
    expect(result.ships).toEqual({})
    expect(result.shipsBuiltThisTurn).toEqual([])
    expect(result.hasMovedShipThisTurn).toBe(false)
  })

  it('RESTORE_BOARD restores ships and per-turn ship tracking verbatim', () => {
    const result = reduceBoard(
      initialBoardState,
      {
        type: 'RESTORE_BOARD',
        settlements: {},
        roads: {},
        ships: { E1: 2 },
        shipsBuiltThisTurn: ['E1'],
        hasMovedShipThisTurn: true,
      },
      initialGameState,
    )
    expect(result.ships).toEqual({ E1: 2 })
    expect(result.shipsBuiltThisTurn).toEqual(['E1'])
    expect(result.hasMovedShipThisTurn).toBe(true)
  })
})

describe('reduceBoard — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reduceBoard(
      initialBoardState,
      { type: 'RESET_PLAYERS', count: 1, names: ['P1'], victoryPointTarget: 10 },
      initialGameState,
    )
    expect(result).toBe(initialBoardState)
  })
})

describe('describeBoardAction', () => {
  const players = createInitialPlayers(2)
  const playerById = new Map(players.map((p) => [p.id, p]))

  it('BUILD_SETTLEMENT plays the placement sound, no banner', () => {
    const result = describeBoardAction({ type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: players[0].id, isSetup: false }, playerById)
    expect(result.sfx).toBe('placement')
    expect(result.message).toBeNull()
  })

  it('BUILD_CITY plays the placement sound, no banner', () => {
    const result = describeBoardAction({ type: 'BUILD_CITY', vertexId: 'V1', playerId: players[0].id }, playerById)
    expect(result.sfx).toBe('placement')
    expect(result.message).toBeNull()
  })

  it('BUILD_ROAD plays the road-placement sound, no banner', () => {
    const result = describeBoardAction(
      { type: 'BUILD_ROAD', edgeId: 'E1', playerId: players[0].id, isSetup: false, isFreeRoad: false },
      playerById,
    )
    expect(result.sfx).toBe('roadPlacement')
    expect(result.message).toBeNull()
  })

  it('PILLAGE_CITY shows a banner naming the pillaged player, no sound', () => {
    const result = describeBoardAction({ type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, playerById)
    expect(result.message).toBe(`${players[0].name}'s city was pillaged and reduced to a settlement.`)
    expect(result.sfx).toBeNull()
  })

  it('PILLAGE_CITY with an unknown player id returns no banner (not "undefined")', () => {
    const result = describeBoardAction({ type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 9999 }, playerById)
    expect(result.message).toBeNull()
    expect(result.sfx).toBeNull()
  })

  it('REMOVE_ROAD has no board-level description (handled at the call site instead)', () => {
    const result = describeBoardAction({ type: 'REMOVE_ROAD', edgeId: 'E1' }, playerById)
    expect(result.message).toBeNull()
    expect(result.sfx).toBeNull()
  })

  it('an action not owned by this reducer returns no banner or sound', () => {
    const result = describeBoardAction({ type: 'RESET_PLAYERS', count: 1, names: ['P1'], victoryPointTarget: 10 }, playerById)
    expect(result.message).toBeNull()
    expect(result.sfx).toBeNull()
  })
})
