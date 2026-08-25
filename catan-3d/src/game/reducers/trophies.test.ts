import { describe, expect, it } from 'vitest'
import { reduceTrophies, initialTrophiesState } from './trophies'
import { initialGameState } from '../gameState'

describe('reduceTrophies — LONGEST_ROAD_HOLDER_SET', () => {
  it('sets longestRoadHolderId, leaves every other field untouched', () => {
    const result = reduceTrophies(
      initialTrophiesState,
      { type: 'LONGEST_ROAD_HOLDER_SET', playerId: 2 },
      initialGameState,
    )
    expect(result).toEqual({ ...initialTrophiesState, longestRoadHolderId: 2 })
  })

  it('accepts null (incumbent loses, or nobody has ever qualified)', () => {
    const dirty = { ...initialTrophiesState, longestRoadHolderId: 2 }
    const result = reduceTrophies(dirty, { type: 'LONGEST_ROAD_HOLDER_SET', playerId: null }, initialGameState)
    expect(result.longestRoadHolderId).toBeNull()
  })
})

describe('reduceTrophies — LARGEST_ARMY_HOLDER_SET', () => {
  it('sets largestArmyHolderId, leaves every other field untouched', () => {
    const result = reduceTrophies(
      initialTrophiesState,
      { type: 'LARGEST_ARMY_HOLDER_SET', playerId: 3 },
      initialGameState,
    )
    expect(result).toEqual({ ...initialTrophiesState, largestArmyHolderId: 3 })
  })

  it('accepts null', () => {
    const dirty = { ...initialTrophiesState, largestArmyHolderId: 3 }
    const result = reduceTrophies(dirty, { type: 'LARGEST_ARMY_HOLDER_SET', playerId: null }, initialGameState)
    expect(result.largestArmyHolderId).toBeNull()
  })
})

describe('reduceTrophies — METROPOLIS_CLAIMED', () => {
  it('sets both metropolisHolders[track] and metropolisVertexIds[track] together', () => {
    const result = reduceTrophies(
      initialTrophiesState,
      { type: 'METROPOLIS_CLAIMED', track: 'science', playerId: 1, vertexId: 'V7' },
      initialGameState,
    )
    expect(result.metropolisHolders).toEqual({ science: 1, trade: null, politics: null })
    expect(result.metropolisVertexIds).toEqual({ science: 'V7', trade: null, politics: null })
  })

  it('leaves the other two tracks untouched', () => {
    const dirty = {
      ...initialTrophiesState,
      metropolisHolders: { science: null, trade: 2, politics: null },
      metropolisVertexIds: { science: null, trade: 'V3', politics: null },
    }
    const result = reduceTrophies(
      dirty,
      { type: 'METROPOLIS_CLAIMED', track: 'politics', playerId: 1, vertexId: 'V9' },
      initialGameState,
    )
    expect(result.metropolisHolders).toEqual({ science: null, trade: 2, politics: 1 })
    expect(result.metropolisVertexIds).toEqual({ science: null, trade: 'V3', politics: 'V9' })
  })

  it('accepts null/null (reset/clear a track)', () => {
    const dirty = {
      ...initialTrophiesState,
      metropolisHolders: { science: 1, trade: null, politics: null },
      metropolisVertexIds: { science: 'V7', trade: null, politics: null },
    }
    const result = reduceTrophies(
      dirty,
      { type: 'METROPOLIS_CLAIMED', track: 'science', playerId: null, vertexId: null },
      initialGameState,
    )
    expect(result.metropolisHolders.science).toBeNull()
    expect(result.metropolisVertexIds.science).toBeNull()
  })

  it('leaves longestRoadHolderId/largestArmyHolderId untouched', () => {
    const dirty = { ...initialTrophiesState, longestRoadHolderId: 4, largestArmyHolderId: 5 }
    const result = reduceTrophies(
      dirty,
      { type: 'METROPOLIS_CLAIMED', track: 'trade', playerId: 2, vertexId: 'V1' },
      initialGameState,
    )
    expect(result.longestRoadHolderId).toBe(4)
    expect(result.largestArmyHolderId).toBe(5)
  })
})

describe('reduceTrophies — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reduceTrophies(initialTrophiesState, { type: 'RESET_BOARD', robberTileId: 'D1' }, initialGameState)
    expect(result).toBe(initialTrophiesState)
  })
})
