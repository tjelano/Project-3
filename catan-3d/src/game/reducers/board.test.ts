import { describe, expect, it } from 'vitest'
import { reduceBoard, initialBoardState } from './board'

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

describe('reduceBoard — unrecognized action', () => {
  it('returns the same state reference unchanged', () => {
    // @ts-expect-error - deliberately testing an action type this reducer doesn't handle
    const result = reduceBoard(initialBoardState, { type: 'SOME_OTHER_ACTION' })
    expect(result).toBe(initialBoardState)
  })
})
