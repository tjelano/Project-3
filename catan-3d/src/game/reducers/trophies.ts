import type { GameAction, GameState } from '../gameState'
import type { ImprovementTrack, MetropolisHolders } from '../types'
import type { MetropolisVertexIds } from '../cityImprovements'

export interface TrophiesState {
  longestRoadHolderId: number | null
  largestArmyHolderId: number | null
  metropolisHolders: MetropolisHolders
  metropolisVertexIds: MetropolisVertexIds
}

export const initialTrophiesState: TrophiesState = {
  longestRoadHolderId: null,
  largestArmyHolderId: null,
  metropolisHolders: { science: null, trade: null, politics: null },
  metropolisVertexIds: { science: null, trade: null, politics: null },
}

export type TrophiesAction =
  | { type: 'LONGEST_ROAD_HOLDER_SET'; playerId: number | null }
  | { type: 'LARGEST_ARMY_HOLDER_SET'; playerId: number | null }
  | { type: 'METROPOLIS_CLAIMED'; track: ImprovementTrack; playerId: number | null; vertexId: string | null }

export function reduceTrophies(state: TrophiesState, action: GameAction, _fullState: GameState): TrophiesState {
  switch (action.type) {
    case 'LONGEST_ROAD_HOLDER_SET':
      return { ...state, longestRoadHolderId: action.playerId }
    case 'LARGEST_ARMY_HOLDER_SET':
      return { ...state, largestArmyHolderId: action.playerId }
    case 'METROPOLIS_CLAIMED':
      return {
        ...state,
        metropolisHolders: { ...state.metropolisHolders, [action.track]: action.playerId },
        metropolisVertexIds: { ...state.metropolisVertexIds, [action.track]: action.vertexId },
      }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full GameAction
      // union (every slice's actions), not just TrophiesAction, so most of
      // that union is legitimately unhandled here. reduceTrophies only owns
      // the 3 dedicated cases above.
      return state
  }
}
