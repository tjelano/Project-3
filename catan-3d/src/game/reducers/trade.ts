import type { GameAction, GameState } from '../gameState'
import type { PendingTrade } from '../../components/hud/TradeOfferPrompt'

export interface TradeState {
  pendingTrade: PendingTrade | null
}

export const initialTradeState: TradeState = {
  pendingTrade: null,
}

export type TradeAction =
  | { type: 'PENDING_TRADE_SET'; trade: PendingTrade }
  | { type: 'PENDING_TRADE_CLEARED' }

export function reduceTrade(state: TradeState, action: GameAction, _fullState: GameState): TradeState {
  switch (action.type) {
    case 'PENDING_TRADE_SET':
      return { ...state, pendingTrade: action.trade }
    case 'PENDING_TRADE_CLEARED':
      return { ...state, pendingTrade: null }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full
      // GameAction union (every slice's actions), not just TradeAction, so
      // most of that union — including every board-only and players-only
      // action — is legitimately unhandled here. reduceTrade only owns the 2
      // dedicated cases above. Deliberately NO TURN_ADVANCED case, unlike
      // every other slice: a pending offer is not turn-scoped. It outlives
      // the offerer's own turn until it's accepted, declined, rejected by
      // the host, or expired by App.tsx's own timeout effect — the turn
      // boundary is not what bounds its lifetime. Contrast
      // freeRoadsRemaining in turn.ts, which IS turn-scoped and does reset
      // there.
      return state
  }
}
