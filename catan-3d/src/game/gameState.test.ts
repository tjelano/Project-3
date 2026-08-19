import { describe, expect, it } from 'vitest'
import { reduceGame, initialGameState } from './gameState'

describe('reduceGame', () => {
  it('routes a board action through reduceBoard', () => {
    const result = reduceGame(initialGameState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    expect(result.board.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('does not mutate the input state', () => {
    const before = initialGameState
    reduceGame(before, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1 })
    expect(before.board.settlements).toEqual({})
  })
})
