import { describe, expect, it } from 'vitest'
import { reduceGame, initialGameState } from './gameState'

describe('reduceGame', () => {
  it('routes a board action through reduceBoard', () => {
    const result = reduceGame(initialGameState, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: 1, isSetup: false })
    expect(result.board.settlements['V1']).toEqual({ ownerId: 1, type: 'settlement' })
  })

  it('routes the same action through reducePlayers too — BUILD_SETTLEMENT is handled by both slices', () => {
    const result = reduceGame(initialGameState, {
      type: 'BUILD_SETTLEMENT',
      vertexId: 'V1',
      playerId: initialGameState.players[0].id,
      isSetup: true,
    })
    const player = result.players.find((p) => p.id === initialGameState.players[0].id)!
    expect(player.settlementsRemaining).toBe(initialGameState.players[0].settlementsRemaining - 1)
  })

  it('routes a players-only action (GRANT_SETUP_RESOURCES) without touching board', () => {
    const result = reduceGame(initialGameState, {
      type: 'GRANT_SETUP_RESOURCES',
      playerId: initialGameState.players[0].id,
      resources: { grain: 1 },
    })
    expect(result.board).toBe(initialGameState.board)
    expect(result.players.find((p) => p.id === initialGameState.players[0].id)!.resources.grain).toBe(1)
  })

  it('does not mutate the input state', () => {
    const before = initialGameState
    const settlementsRemainingBefore = before.players[0].settlementsRemaining
    reduceGame(before, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: before.players[0].id, isSetup: false })
    expect(before.board.settlements).toEqual({})
    expect(before.players[0].settlementsRemaining).toBe(settlementsRemainingBefore)
  })
})
