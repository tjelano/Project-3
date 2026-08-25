import type { GameAction, GameState } from '../gameState'
import { dequeueOne } from '../pendingQueue'
import type { BarbarianPillageTarget } from '../knights'

export interface PendingQueuesState {
  discardPlayerIds: number[]
  scienceFreeResourcePlayerIds: number[]
  goldFieldResourcePlayerIds: number[]
  pillageQueue: BarbarianPillageTarget[]
  winnerDrawQueue: number[]
  progressCardOverLimitPlayerIds: number[]
  revealedTileIds: Set<string>
}

export const initialPendingQueuesState: PendingQueuesState = {
  discardPlayerIds: [],
  scienceFreeResourcePlayerIds: [],
  goldFieldResourcePlayerIds: [],
  pillageQueue: [],
  winnerDrawQueue: [],
  progressCardOverLimitPlayerIds: [],
  revealedTileIds: new Set(),
}

export type PendingQueuesAction =
  | { type: 'DISCARD_PLAYERS_SET'; playerIds: number[] }
  | { type: 'DISCARD_PLAYER_REMOVED'; playerId: number }
  | { type: 'SCIENCE_FREE_RESOURCE_PLAYERS_ADDED'; playerIds: number[] }
  | { type: 'SCIENCE_FREE_RESOURCE_PLAYER_REMOVED'; playerId: number }
  | { type: 'SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED' }
  | { type: 'GOLD_FIELD_RESOURCE_PLAYERS_ADDED'; playerIds: number[] }
  | { type: 'GOLD_FIELD_RESOURCE_PLAYER_REMOVED'; playerId: number }
  | { type: 'GOLD_FIELD_RESOURCE_PLAYERS_CLEARED' }
  | { type: 'PILLAGE_QUEUE_SET'; targets: BarbarianPillageTarget[] }
  | { type: 'PILLAGE_QUEUE_ENTRY_REMOVED'; playerId: number }
  | { type: 'WINNER_DRAW_QUEUE_SET'; playerIds: number[] }
  | { type: 'WINNER_DRAW_QUEUE_ENTRY_REMOVED'; playerId: number }
  | { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED'; playerIds: number[] }
  | { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED'; playerId: number }
  | { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET'; playerIds: number[] }
  | { type: 'TILES_REVEALED'; tileIds: string[] }
  | { type: 'REVEALED_TILES_SET'; tileIds: string[] }

export function reducePendingQueues(state: PendingQueuesState, action: GameAction, _fullState: GameState): PendingQueuesState {
  switch (action.type) {
    case 'DISCARD_PLAYERS_SET':
      return { ...state, discardPlayerIds: action.playerIds }
    case 'DISCARD_PLAYER_REMOVED':
      return { ...state, discardPlayerIds: dequeueOne(state.discardPlayerIds, (id) => id, action.playerId) }
    case 'SCIENCE_FREE_RESOURCE_PLAYERS_ADDED':
      return { ...state, scienceFreeResourcePlayerIds: [...new Set([...state.scienceFreeResourcePlayerIds, ...action.playerIds])] }
    case 'SCIENCE_FREE_RESOURCE_PLAYER_REMOVED':
      return { ...state, scienceFreeResourcePlayerIds: dequeueOne(state.scienceFreeResourcePlayerIds, (id) => id, action.playerId) }
    case 'SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED':
      return { ...state, scienceFreeResourcePlayerIds: [] }
    case 'GOLD_FIELD_RESOURCE_PLAYERS_ADDED':
      return { ...state, goldFieldResourcePlayerIds: [...state.goldFieldResourcePlayerIds, ...action.playerIds] }
    case 'GOLD_FIELD_RESOURCE_PLAYER_REMOVED':
      return { ...state, goldFieldResourcePlayerIds: dequeueOne(state.goldFieldResourcePlayerIds, (id) => id, action.playerId) }
    case 'GOLD_FIELD_RESOURCE_PLAYERS_CLEARED':
      return { ...state, goldFieldResourcePlayerIds: [] }
    case 'PILLAGE_QUEUE_SET':
      return { ...state, pillageQueue: action.targets }
    case 'PILLAGE_QUEUE_ENTRY_REMOVED':
      return { ...state, pillageQueue: dequeueOne(state.pillageQueue, (t) => t.playerId, action.playerId) }
    case 'WINNER_DRAW_QUEUE_SET':
      return { ...state, winnerDrawQueue: action.playerIds }
    case 'WINNER_DRAW_QUEUE_ENTRY_REMOVED':
      return { ...state, winnerDrawQueue: dequeueOne(state.winnerDrawQueue, (id) => id, action.playerId) }
    case 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED':
      return { ...state, progressCardOverLimitPlayerIds: [...new Set([...state.progressCardOverLimitPlayerIds, ...action.playerIds])] }
    case 'PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED':
      return { ...state, progressCardOverLimitPlayerIds: dequeueOne(state.progressCardOverLimitPlayerIds, (id) => id, action.playerId) }
    case 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET':
      return { ...state, progressCardOverLimitPlayerIds: action.playerIds }
    case 'TILES_REVEALED':
      return { ...state, revealedTileIds: new Set([...state.revealedTileIds, ...action.tileIds]) }
    case 'REVEALED_TILES_SET':
      return { ...state, revealedTileIds: new Set(action.tileIds) }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full GameAction
      // union (every slice's actions), not just PendingQueuesAction, so most
      // of that union — including every board-only/players-only/turn-only/
      // progress-only/decks-only/trophies-only action — is legitimately
      // unhandled here. reducePendingQueues only owns the 16 dedicated cases
      // above.
      return state
  }
}
