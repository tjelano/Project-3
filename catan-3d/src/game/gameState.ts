import { reduceBoard, initialBoardState, type BoardState, type BoardAction } from './reducers/board'
import { reducePlayers, type PlayersAction } from './reducers/players'
import { reduceTurn, initialTurnState, type TurnState, type TurnAction } from './reducers/turn'
import { reduceProgress, initialProgressState, type ProgressState, type ProgressAction } from './reducers/progress'
import { reduceDecks, initialDecksState, type DecksState, type DecksAction } from './reducers/decks'
import { reduceTrophies, initialTrophiesState, type TrophiesState, type TrophiesAction } from './reducers/trophies'
import { reducePendingQueues, initialPendingQueuesState, type PendingQueuesState, type PendingQueuesAction } from './reducers/pendingQueues'
import { reduceTrade, initialTradeState, type TradeState, type TradeAction } from './reducers/trade'
import { createInitialPlayers, type Player } from './types'

export interface GameState {
  board: BoardState
  players: Player[]
  turn: TurnState
  progress: ProgressState
  decks: DecksState
  trophies: TrophiesState
  pendingQueues: PendingQueuesState
  trade: TradeState
}

export const initialGameState: GameState = {
  board: initialBoardState,
  // Matches the default the old `useState(() => createInitialPlayers(3))`
  // used to seed with, before a real game (resetGame) replaces it.
  players: createInitialPlayers(3),
  turn: initialTurnState,
  progress: initialProgressState,
  decks: initialDecksState,
  trophies: initialTrophiesState,
  pendingQueues: initialPendingQueuesState,
  trade: initialTradeState,
}

export type GameAction = BoardAction | PlayersAction | TurnAction | ProgressAction | DecksAction | TrophiesAction | PendingQueuesAction | TradeAction

export function reduceGame(state: GameState, action: GameAction): GameState {
  const board = reduceBoard(state.board, action, state)
  const players = reducePlayers(state.players, action, state)
  const turn = reduceTurn(state.turn, action, state)
  const progress = reduceProgress(state.progress, action, state)
  const decks = reduceDecks(state.decks, action, state)
  const trophies = reduceTrophies(state.trophies, action, state)
  const pendingQueues = reducePendingQueues(state.pendingQueues, action, state)
  const trade = reduceTrade(state.trade, action, state)

  if (
    board === state.board &&
    players === state.players &&
    turn === state.turn &&
    progress === state.progress &&
    decks === state.decks &&
    trophies === state.trophies &&
    pendingQueues === state.pendingQueues &&
    trade === state.trade
  ) {
    return state
  }

  return {
    board,
    players,
    turn,
    progress,
    decks,
    trophies,
    pendingQueues,
    trade,
  }
}
