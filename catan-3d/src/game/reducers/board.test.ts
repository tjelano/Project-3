import { describe, expect, it } from 'vitest'
import { reduceBoard, initialBoardState, describeBoardAction } from './board'
import { createInitialPlayers } from '../types'

describe('reduceBoard — BUILD_SETTLEMENT', () => {
  it('places a settlement at the given vertex, owned by the given player', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('does not mutate the input state', () => {
    const before = initialBoardState
    reduceBoard(before, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    expect(before.settlements).toEqual({})
  })

  it('leaves roads untouched', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    expect(result.roads).toEqual({})
  })
})

describe('reduceBoard — BUILD_CITY', () => {
  it('upgrades the vertex to a city, owned by the given player', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 })
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'city' })
  })

  it('overwrites an existing settlement at that vertex', () => {
    const withSettlement = reduceBoard(initialBoardState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    const result = reduceBoard(withSettlement, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 })
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'city' })
  })
})

describe('reduceBoard — BUILD_ROAD', () => {
  it('places a road at the given edge, owned by the given player', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1 })
    expect(result.roads['E1']).toBe(1)
  })

  it('leaves settlements untouched', () => {
    const result = reduceBoard(initialBoardState, { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1 })
    expect(result.settlements).toEqual({})
  })
})

describe('reduceBoard — PILLAGE_CITY', () => {
  it('downgrades a city owned by the given player to a settlement', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 })
    const result = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 })
    expect(result.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('is a no-op if the vertex is not currently a city', () => {
    const withSettlement = reduceBoard(initialBoardState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    const result = reduceBoard(withSettlement, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 })
    expect(result).toBe(withSettlement) // same reference — genuinely unchanged
  })

  it('is a no-op if the vertex has no building at all', () => {
    const result = reduceBoard(initialBoardState, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 })
    expect(result).toBe(initialBoardState)
  })

  it('is a no-op if the city is owned by a different player', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 })
    const result = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 2 })
    expect(result).toBe(withCity)
  })

  it('is idempotent — dispatching the same pillage twice only changes the vertex once', () => {
    const withCity = reduceBoard(initialBoardState, { type: 'BUILD_CITY', vertexId: 'V1', playerId: 1 })
    const first = reduceBoard(withCity, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 })
    const second = reduceBoard(first, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId: 1 })
    expect(second).toBe(first)
  })
})

describe('reduceBoard — REMOVE_ROAD', () => {
  it('removes the road at the given edge entirely', () => {
    const withRoad = reduceBoard(initialBoardState, { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1 })
    const result = reduceBoard(withRoad, { type: 'REMOVE_ROAD', edgeId: 'E1' })
    expect(result.roads).not.toHaveProperty('E1')
  })

  it('is a no-op if the edge has no road', () => {
    const result = reduceBoard(initialBoardState, { type: 'REMOVE_ROAD', edgeId: 'E1' })
    expect(result).toBe(initialBoardState)
  })

  it('leaves other roads untouched', () => {
    let state = reduceBoard(initialBoardState, { type: 'BUILD_ROAD', edgeId: 'E1', playerId: 1 })
    state = reduceBoard(state, { type: 'BUILD_ROAD', edgeId: 'E2', playerId: 2 })
    const result = reduceBoard(state, { type: 'REMOVE_ROAD', edgeId: 'E1' })
    expect(result.roads['E2']).toBe(2)
  })
})

describe('reduceBoard — unrecognized action', () => {
  it('returns the same state reference unchanged', () => {
    // @ts-expect-error - deliberately testing an action type this reducer doesn't handle
    const result = reduceBoard(initialBoardState, { type: 'SOME_OTHER_ACTION' })
    expect(result).toBe(initialBoardState)
  })
})

describe('describeBoardAction', () => {
  const players = createInitialPlayers(2)
  const playerById = new Map(players.map((p) => [p.id, p]))

  it('BUILD_SETTLEMENT plays the placement sound, no banner', () => {
    const result = describeBoardAction({ type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: players[0].id }, playerById)
    expect(result.sfx).toBe('placement')
    expect(result.message).toBeNull()
  })

  it('BUILD_ROAD plays the road-placement sound, no banner', () => {
    const result = describeBoardAction({ type: 'BUILD_ROAD', edgeId: 'E1', playerId: players[0].id }, playerById)
    expect(result.sfx).toBe('roadPlacement')
    expect(result.message).toBeNull()
  })

  it('PILLAGE_CITY shows a banner naming the pillaged player, no sound', () => {
    const result = describeBoardAction({ type: 'PILLAGE_CITY', vertexId: 'V1', playerId: players[0].id }, playerById)
    expect(result.message).toBe(`${players[0].name}'s city was pillaged and reduced to a settlement.`)
    expect(result.sfx).toBeNull()
  })

  it('REMOVE_ROAD has no board-level description (handled at the call site instead)', () => {
    const result = describeBoardAction({ type: 'REMOVE_ROAD', edgeId: 'E1' }, playerById)
    expect(result.message).toBeNull()
    expect(result.sfx).toBeNull()
  })
})
