import { reduceBoard, initialBoardState, type BoardState, type BoardAction } from './reducers/board'
import { reducePlayers, type PlayersAction } from './reducers/players'
import { reduceTurn, initialTurnState, type TurnState, type TurnAction } from './reducers/turn'
import { createInitialPlayers, type Player } from './types'

export interface GameState {
  board: BoardState
  players: Player[]
  turn: TurnState
}

export const initialGameState: GameState = {
  board: initialBoardState,
  // Matches the default the old `useState(() => createInitialPlayers(3))`
  // used to seed with, before a real game (resetGame) replaces it.
  players: createInitialPlayers(3),
  turn: initialTurnState,
}

export type GameAction = BoardAction | PlayersAction | TurnAction

export function reduceGame(state: GameState, action: GameAction): GameState {
  return {
    board: reduceBoard(state.board, action, state),
    players: reducePlayers(state.players, action, state),
    turn: reduceTurn(state.turn, action, state),
  }
}
