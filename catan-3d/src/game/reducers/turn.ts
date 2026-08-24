import type { GameAction, GameState } from '../gameState'

export type GamePhase = 'setup' | 'playing' | 'discard' | 'chooseRobberOrPirate' | 'moveRobber' | 'movePirate'
export type SetupStage = 'settlement' | 'road'

export interface TurnState {
  currentPlayerIndex: number
  gamePhase: GamePhase
  setupStepIndex: number
  setupStage: SetupStage
  setupSettlementVertexId: string | null
  devCardPlayedThisTurn: boolean
  hasRolledThisTurn: boolean
  totalRollsThisGame: number
  consecutiveDoublesThisTurn: number
}

export const initialTurnState: TurnState = {
  currentPlayerIndex: 0,
  gamePhase: 'setup',
  setupStepIndex: 0,
  setupStage: 'settlement',
  setupSettlementVertexId: null,
  devCardPlayedThisTurn: false,
  hasRolledThisTurn: false,
  totalRollsThisGame: 0,
  consecutiveDoublesThisTurn: 0,
}

export type TurnAction =
  | { type: 'CURRENT_PLAYER_SET'; playerIndex: number }
  | { type: 'GAME_PHASE_SET'; phase: GamePhase }
  | { type: 'SETUP_STEP_SET'; stepIndex: number }
  | { type: 'SETUP_STAGE_SET'; stage: SetupStage }
  | { type: 'SETUP_SETTLEMENT_VERTEX_SET'; vertexId: string | null }
  | { type: 'DEV_CARD_PLAYED_THIS_TURN_SET'; played: boolean }
  | { type: 'HAS_ROLLED_THIS_TURN_SET'; rolled: boolean }
  | { type: 'TOTAL_ROLLS_INCREMENTED' }
  | { type: 'TOTAL_ROLLS_RESET' }
  | { type: 'TOTAL_ROLLS_SET'; count: number }
  | { type: 'CONSECUTIVE_DOUBLES_SET'; count: number }

export function reduceTurn(state: TurnState, action: GameAction, _fullState: GameState): TurnState {
  switch (action.type) {
    case 'CURRENT_PLAYER_SET':
      return { ...state, currentPlayerIndex: action.playerIndex }
    case 'GAME_PHASE_SET':
      return { ...state, gamePhase: action.phase }
    case 'SETUP_STEP_SET':
      return { ...state, setupStepIndex: action.stepIndex }
    case 'SETUP_STAGE_SET':
      return { ...state, setupStage: action.stage }
    case 'SETUP_SETTLEMENT_VERTEX_SET':
      return { ...state, setupSettlementVertexId: action.vertexId }
    case 'DEV_CARD_PLAYED_THIS_TURN_SET':
      return { ...state, devCardPlayedThisTurn: action.played }
    case 'HAS_ROLLED_THIS_TURN_SET':
      return { ...state, hasRolledThisTurn: action.rolled }
    case 'TOTAL_ROLLS_INCREMENTED':
      return { ...state, totalRollsThisGame: state.totalRollsThisGame + 1 }
    case 'TOTAL_ROLLS_RESET':
      return { ...state, totalRollsThisGame: 0 }
    case 'TOTAL_ROLLS_SET':
      return { ...state, totalRollsThisGame: action.count }
    case 'CONSECUTIVE_DOUBLES_SET':
      return { ...state, consecutiveDoublesThisTurn: action.count }
    case 'TURN_ADVANCED':
      return {
        ...state,
        currentPlayerIndex: action.nextPlayerIndex,
        hasRolledThisTurn: false,
        devCardPlayedThisTurn: false,
        consecutiveDoublesThisTurn: 0,
      }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full
      // GameAction union (every slice's actions), not just TurnAction, so
      // most of that union — including every board-only and players-only
      // action — is legitimately unhandled here. reduceTurn only owns the 11
      // dedicated cases above, plus TURN_ADVANCED (declared as a
      // PlayersAction member — see players.ts — and already handled by
      // reduceBoard and reducePlayers too; each slice applies its own share
      // of the same turn-advance effect to the same action).
      return state
  }
}
