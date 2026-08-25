import type { GameAction, GameState } from '../gameState'
import type { BarbarianAttackResult } from '../knights'

export interface ProgressState {
  barbarianTrackPosition: number
  activeBarbarianAttack: BarbarianAttackResult | null
  knightsPromotedThisTurn: Set<string>
}

export const initialProgressState: ProgressState = {
  barbarianTrackPosition: 0,
  activeBarbarianAttack: null,
  knightsPromotedThisTurn: new Set(),
}

export type ProgressAction =
  | { type: 'BARBARIAN_TRACK_POSITION_SET'; position: number }
  | { type: 'BARBARIAN_ATTACK_SET'; result: BarbarianAttackResult | null }
  | { type: 'KNIGHTS_PROMOTED_THIS_TURN_ADDED'; knightIds: string[] }

export function reduceProgress(state: ProgressState, action: GameAction, _fullState: GameState): ProgressState {
  switch (action.type) {
    case 'BARBARIAN_TRACK_POSITION_SET':
      return { ...state, barbarianTrackPosition: action.position }
    case 'BARBARIAN_ATTACK_SET':
      return { ...state, activeBarbarianAttack: action.result }
    case 'KNIGHTS_PROMOTED_THIS_TURN_ADDED':
      return { ...state, knightsPromotedThisTurn: new Set([...state.knightsPromotedThisTurn, ...action.knightIds]) }
    case 'TURN_ADVANCED':
      return { ...state, knightsPromotedThisTurn: new Set() }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full
      // GameAction union (every slice's actions), not just ProgressAction,
      // so most of that union — including every board-only and
      // players-only action — is legitimately unhandled here. reduceProgress
      // only owns the 3 dedicated cases above, plus TURN_ADVANCED (declared
      // as a PlayersAction member — see players.ts — and already handled by
      // reduceBoard, reducePlayers, and reduceTurn too; each slice applies
      // its own share of the same turn-advance effect to the same action).
      return state
  }
}
