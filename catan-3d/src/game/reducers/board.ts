import type { Building, Player, Resources } from '../types'
import type { SfxKey } from '../../audio/sfx'
import type { GameAction, GameState } from '../gameState'

export interface BoardState {
  settlements: Record<string, Building>
  roads: Record<string, number>
  ships: Record<string, number> // edge id -> owning player id, same shape as roads
  // Edge ids a ship was built on THIS turn — a ship can't be moved the same
  // turn it was built (CN3083 p.2). Cleared on TURN_ADVANCED.
  shipsBuiltThisTurn: string[]
  // At most 1 ship move per turn (CN3083 p.2). Cleared on TURN_ADVANCED.
  hasMovedShipThisTurn: boolean
}

export const initialBoardState: BoardState = {
  settlements: {},
  roads: {},
  ships: {},
  shipsBuiltThisTurn: [],
  hasMovedShipThisTurn: false,
}

export type BoardAction =
  | { type: 'BUILD_SETTLEMENT'; vertexId: string; playerId: number; isSetup: boolean }
  | { type: 'BUILD_CITY'; vertexId: string; playerId: number; costOverride?: Partial<Resources> }
  | { type: 'BUILD_ROAD'; edgeId: string; playerId: number; isSetup: boolean; isFreeRoad: boolean }
  | { type: 'BUILD_SHIP'; edgeId: string; playerId: number; isSetup: boolean; isFreeShip: boolean }
  | { type: 'PILLAGE_CITY'; vertexId: string; playerId: number }
  | { type: 'REMOVE_ROAD'; edgeId: string }
  | { type: 'MOVE_SHIP'; fromEdgeId: string; toEdgeId: string; playerId: number }
  | { type: 'RESET_BOARD' }
  | {
      type: 'RESTORE_BOARD'
      settlements: Record<string, Building>
      roads: Record<string, number>
      ships: Record<string, number>
      shipsBuiltThisTurn: string[]
      hasMovedShipThisTurn: boolean
    }

export function reduceBoard(state: BoardState, action: GameAction, _fullState: GameState): BoardState {
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
    case 'BUILD_ROAD':
      return { ...state, roads: { ...state.roads, [action.edgeId]: action.playerId } }
    case 'BUILD_SHIP':
      return {
        ...state,
        ships: { ...state.ships, [action.edgeId]: action.playerId },
        shipsBuiltThisTurn: [...state.shipsBuiltThisTurn, action.edgeId],
      }
    case 'PILLAGE_CITY': {
      const building = state.settlements[action.vertexId]
      if (!building || building.type !== 'city' || building.ownerId !== action.playerId) return state
      return {
        ...state,
        settlements: { ...state.settlements, [action.vertexId]: { ownerId: action.playerId, type: 'settlement' } },
      }
    }
    case 'REMOVE_ROAD': {
      if (!(action.edgeId in state.roads)) return state
      const roads = { ...state.roads }
      delete roads[action.edgeId]
      return { ...state, roads }
    }
    case 'MOVE_SHIP': {
      if (!(action.fromEdgeId in state.ships)) return state
      const ships = { ...state.ships }
      delete ships[action.fromEdgeId]
      ships[action.toEdgeId] = action.playerId
      return { ...state, ships, hasMovedShipThisTurn: true }
    }
    case 'TURN_ADVANCED':
      return { ...state, shipsBuiltThisTurn: [], hasMovedShipThisTurn: false }
    case 'RESET_BOARD':
      // A fresh object every reset, not the shared `initialBoardState`
      // singleton — nothing mutates settlements/roads in place today, but
      // aliasing the module-level object into live state costs nothing to
      // avoid.
      return { settlements: {}, roads: {}, ships: {}, shipsBuiltThisTurn: [], hasMovedShipThisTurn: false }
    case 'RESTORE_BOARD':
      return {
        settlements: action.settlements,
        roads: action.roads,
        ships: action.ships,
        shipsBuiltThisTurn: action.shipsBuiltThisTurn,
        hasMovedShipThisTurn: action.hasMovedShipThisTurn,
      }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full
      // GameAction union (every slice's actions), not just BoardAction, so
      // most of that union — including every players-only action — is
      // legitimately unhandled here. reduceBoard only owns the 7 cases
      // above, same as any combineReducers-style slice reducer.
      return state
  }
}

export function describeBoardAction(
  action: GameAction,
  playerById: Map<number, Player>,
): { message: string | null; sfx: SfxKey | null } {
  switch (action.type) {
    case 'BUILD_SETTLEMENT':
    case 'BUILD_CITY':
      return { message: null, sfx: 'placement' }
    case 'BUILD_ROAD':
      return { message: null, sfx: 'roadPlacement' }
    case 'BUILD_SHIP':
      return { message: null, sfx: 'roadPlacement' }
    case 'MOVE_SHIP':
      return { message: null, sfx: null }
    case 'PILLAGE_CITY': {
      const owner = playerById.get(action.playerId)
      return {
        message: owner ? `${owner.name}'s city was pillaged and reduced to a settlement.` : null,
        sfx: null,
      }
    }
    case 'REMOVE_ROAD':
    case 'RESET_BOARD':
    case 'RESTORE_BOARD':
      // No banner/sfx for any of these — REMOVE_ROAD's banner is handled at
      // its own call site (App.tsx applyDiplomacyRemoval), and
      // RESET_BOARD/RESTORE_BOARD bypass dispatchGameAction entirely (see
      // its comment in App.tsx), so this function is never actually called
      // with either in practice. Listed explicitly rather than falling
      // through to default so the intent is documented, not implicit.
      return { message: null, sfx: null }
    default:
      // Same reasoning as reduceBoard's default: not exhaustive over the
      // full GameAction union, only over BoardAction's own cases.
      return { message: null, sfx: null }
  }
}
