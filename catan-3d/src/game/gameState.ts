import { reduceBoard, initialBoardState, type BoardState, type BoardAction } from './reducers/board'

export interface GameState {
  board: BoardState
}

export const initialGameState: GameState = {
  board: initialBoardState,
}

// Grows to a full discriminated union as more slices migrate — for now,
// every action this project has is board-relevant, so GameAction and
// BoardAction are the same shape. Aliased (not just `export type
// GameAction = BoardAction`) so call sites in App.tsx import from this
// file rather than reaching into game/reducers/board directly.
export type GameAction = BoardAction

export function reduceGame(state: GameState, action: GameAction): GameState {
  return {
    board: reduceBoard(state.board, action),
  }
}
