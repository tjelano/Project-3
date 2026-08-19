import type { Building } from '../types'

export interface BoardState {
  settlements: Record<string, Building>
  roads: Record<string, number>
}

export const initialBoardState: BoardState = {
  settlements: {},
  roads: {},
}

export type BoardAction =
  | { type: 'BUILD_SETTLEMENT'; vertexId: string; playerId: number }
  | { type: 'BUILD_CITY'; vertexId: string; playerId: number }

export function reduceBoard(state: BoardState, action: BoardAction): BoardState {
  switch (action.type) {
    case 'BUILD_SETTLEMENT':
      return {
        ...state,
        settlements: { ...state.settlements, [action.vertexId]: { ownerId: action.playerId, type: 'settlement' } },
      }
    case 'BUILD_CITY':
      return {
        ...state,
        settlements: { ...state.settlements, [action.vertexId]: { ownerId: action.playerId, type: 'city' } },
      }
    default:
      return state
  }
}
