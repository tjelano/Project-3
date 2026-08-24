import { describe, expect, it } from 'vitest'
import { reduceTurn, initialTurnState } from './turn'
import { initialGameState } from '../gameState'

describe('reduceTurn — CURRENT_PLAYER_SET', () => {
  it('sets currentPlayerIndex, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'CURRENT_PLAYER_SET', playerIndex: 2 }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, currentPlayerIndex: 2 })
  })
})

describe('reduceTurn — GAME_PHASE_SET', () => {
  it('sets gamePhase, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'GAME_PHASE_SET', phase: 'playing' }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, gamePhase: 'playing' })
  })
})

describe('reduceTurn — SETUP_STEP_SET', () => {
  it('sets setupStepIndex, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'SETUP_STEP_SET', stepIndex: 3 }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, setupStepIndex: 3 })
  })
})

describe('reduceTurn — SETUP_STAGE_SET', () => {
  it('sets setupStage, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'SETUP_STAGE_SET', stage: 'road' }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, setupStage: 'road' })
  })
})

describe('reduceTurn — SETUP_SETTLEMENT_VERTEX_SET', () => {
  it('sets setupSettlementVertexId, leaves every other field untouched', () => {
    const result = reduceTurn(
      initialTurnState,
      { type: 'SETUP_SETTLEMENT_VERTEX_SET', vertexId: 'V1' },
      initialGameState,
    )
    expect(result).toEqual({ ...initialTurnState, setupSettlementVertexId: 'V1' })
  })

  it('accepts null (clearing the vertex after a setup pairing completes)', () => {
    const dirty = { ...initialTurnState, setupSettlementVertexId: 'V1' }
    const result = reduceTurn(dirty, { type: 'SETUP_SETTLEMENT_VERTEX_SET', vertexId: null }, initialGameState)
    expect(result.setupSettlementVertexId).toBeNull()
  })
})

describe('reduceTurn — DEV_CARD_PLAYED_THIS_TURN_SET', () => {
  it('sets devCardPlayedThisTurn, leaves every other field untouched', () => {
    const result = reduceTurn(
      initialTurnState,
      { type: 'DEV_CARD_PLAYED_THIS_TURN_SET', played: true },
      initialGameState,
    )
    expect(result).toEqual({ ...initialTurnState, devCardPlayedThisTurn: true })
  })
})

describe('reduceTurn — HAS_ROLLED_THIS_TURN_SET', () => {
  it('sets hasRolledThisTurn, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'HAS_ROLLED_THIS_TURN_SET', rolled: true }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, hasRolledThisTurn: true })
  })
})

describe('reduceTurn — TOTAL_ROLLS_INCREMENTED', () => {
  it('increments totalRollsThisGame by 1 from 0, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'TOTAL_ROLLS_INCREMENTED' }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, totalRollsThisGame: 1 })
  })

  it('increments from a non-zero starting value', () => {
    const dirty = { ...initialTurnState, totalRollsThisGame: 5 }
    const result = reduceTurn(dirty, { type: 'TOTAL_ROLLS_INCREMENTED' }, initialGameState)
    expect(result.totalRollsThisGame).toBe(6)
  })
})

describe('reduceTurn — TOTAL_ROLLS_RESET', () => {
  it('resets totalRollsThisGame to 0, leaves every other field untouched', () => {
    const dirty = { ...initialTurnState, totalRollsThisGame: 7 }
    const result = reduceTurn(dirty, { type: 'TOTAL_ROLLS_RESET' }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, totalRollsThisGame: 0 })
  })
})

describe('reduceTurn — TOTAL_ROLLS_SET', () => {
  it('sets totalRollsThisGame to the given count, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'TOTAL_ROLLS_SET', count: 12 }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, totalRollsThisGame: 12 })
  })
})

describe('reduceTurn — CONSECUTIVE_DOUBLES_SET', () => {
  it('sets consecutiveDoublesThisTurn, leaves every other field untouched', () => {
    const result = reduceTurn(initialTurnState, { type: 'CONSECUTIVE_DOUBLES_SET', count: 2 }, initialGameState)
    expect(result).toEqual({ ...initialTurnState, consecutiveDoublesThisTurn: 2 })
  })
})

describe('reduceTurn — TURN_ADVANCED', () => {
  it('sets currentPlayerIndex and resets hasRolledThisTurn/devCardPlayedThisTurn/consecutiveDoublesThisTurn in one dispatch, leaves setup fields untouched', () => {
    const dirty = {
      ...initialTurnState,
      currentPlayerIndex: 0,
      hasRolledThisTurn: true,
      devCardPlayedThisTurn: true,
      consecutiveDoublesThisTurn: 2,
      setupStepIndex: 3,
    }
    const result = reduceTurn(dirty, { type: 'TURN_ADVANCED', nextPlayerIndex: 1 }, initialGameState)
    expect(result).toEqual({
      ...dirty,
      currentPlayerIndex: 1,
      hasRolledThisTurn: false,
      devCardPlayedThisTurn: false,
      consecutiveDoublesThisTurn: 0,
    })
  })
})
