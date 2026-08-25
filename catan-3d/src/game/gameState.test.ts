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

  it('routes PILLAGE_CITY through both reduceBoard and reducePlayers', () => {
    const playerId = initialGameState.players[0].id
    const before = {
      ...initialGameState,
      board: { ...initialGameState.board, settlements: { V1: { ownerId: playerId, type: 'city' as const } } },
      players: initialGameState.players.map((p) => (p.id === playerId ? { ...p, cityWalls: ['V1'] } : p)),
    }
    const beforePlayer = before.players.find((p) => p.id === playerId)!
    const result = reduceGame(before, { type: 'PILLAGE_CITY', vertexId: 'V1', playerId })
    expect(result.board.settlements['V1']).toEqual({ ownerId: playerId, type: 'settlement' })
    const player = result.players.find((p) => p.id === playerId)!
    expect(player.cityWalls).toEqual([])
    expect(player.citiesRemaining).toBe(beforePlayer.citiesRemaining + 1)
    expect(player.settlementsRemaining).toBe(Math.max(0, beforePlayer.settlementsRemaining - 1))
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

  it('routes a turn action through reduceTurn', () => {
    const result = reduceGame(initialGameState, { type: 'GAME_PHASE_SET', phase: 'playing' })
    expect(result.turn.gamePhase).toBe('playing')
    expect(result.board).toBe(initialGameState.board)
  })

  it('routes a progress action through reduceProgress', () => {
    const result = reduceGame(initialGameState, { type: 'BARBARIAN_TRACK_POSITION_SET', position: 4 })
    expect(result.progress.barbarianTrackPosition).toBe(4)
    expect(result.board).toBe(initialGameState.board)
  })

  it('fans TURN_ADVANCED out to every slice that owns a share of it', () => {
    const dirty = {
      ...initialGameState,
      progress: { ...initialGameState.progress, knightsPromotedThisTurn: new Set(['knight-1-1']) },
    }
    const result = reduceGame(dirty, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 })
    expect(result.progress.knightsPromotedThisTurn).toEqual(new Set())
    expect(result.turn.currentPlayerIndex).toBe(1)
    expect(result.board.shipsBuiltThisTurn).toEqual([])
  })

  it('routes a decks action through reduceDecks', () => {
    const result = reduceGame(initialGameState, { type: 'DEV_CARD_DRAWN' })
    expect(result.decks.devDeck).toEqual(initialGameState.decks.devDeck.slice(1))
    expect(result.board).toBe(initialGameState.board)
  })

  it('routes a trophies action through reduceTrophies', () => {
    const result = reduceGame(initialGameState, { type: 'LONGEST_ROAD_HOLDER_SET', playerId: 2 })
    expect(result.trophies.longestRoadHolderId).toBe(2)
    expect(result.board).toBe(initialGameState.board)
  })

  it('routes a pendingQueues action through reducePendingQueues', () => {
    const result = reduceGame(initialGameState, { type: 'DISCARD_PLAYERS_SET', playerIds: [1, 2] })
    expect(result.pendingQueues.discardPlayerIds).toEqual([1, 2])
    expect(result.board).toBe(initialGameState.board)
  })

  it('does not mutate the input state', () => {
    const before = initialGameState
    const settlementsRemainingBefore = before.players[0].settlementsRemaining
    reduceGame(before, { type: 'BUILD_SETTLEMENT', vertexId: 'V1', playerId: before.players[0].id, isSetup: false })
    expect(before.board.settlements).toEqual({})
    expect(before.players[0].settlementsRemaining).toBe(settlementsRemainingBefore)
  })
})
