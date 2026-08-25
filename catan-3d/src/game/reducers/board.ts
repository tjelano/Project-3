import type { Building, Player, Resources, StolenItem } from '../types'
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
  robberTileId: string
  // null = parked on the frame — a legal "off the board" state the robber
  // never has (CN3083). Set once the pirate first activates; there is no
  // meaningful "initial" tile for it the way the robber starts on desert.
  pirateTileId: string | null
  // Cities & Knights robber activation — starts inert (robber behaves as
  // base-game: always movable on a rolled 7). Permanently flips true the
  // first time a barbarian attack resolves, regardless of outcome — CN3087
  // p.7: "The robber does not activate until after it has been placed on
  // the desert following the first barbarian attack." Never reset back to
  // false except by a full game reset (RESET_BOARD).
  robberActive: boolean
  // Cities & Knights Merchant board piece — same category as
  // robberTileId/pirateTileId just above, not a per-player field: the piece
  // sits on one tile and is controlled by at most one player at a time.
  // null until the card is first played and placed. Always set together,
  // via the single MERCHANT_MOVED action below — there is no case where
  // one changes without the other.
  merchantTileId: string | null
  merchantHolderId: number | null
}

export const initialBoardState: BoardState = {
  settlements: {},
  roads: {},
  ships: {},
  shipsBuiltThisTurn: [],
  hasMovedShipThisTurn: false,
  robberTileId: '',
  pirateTileId: null,
  robberActive: false,
  merchantTileId: null,
  merchantHolderId: null,
}

export type BoardAction =
  | { type: 'BUILD_SETTLEMENT'; vertexId: string; playerId: number; isSetup: boolean }
  | { type: 'BUILD_CITY'; vertexId: string; playerId: number; costOverride?: Partial<Resources> }
  | { type: 'BUILD_ROAD'; edgeId: string; playerId: number; isSetup: boolean; isFreeRoad: boolean }
  | { type: 'BUILD_SHIP'; edgeId: string; playerId: number; isSetup: boolean; isFreeShip: boolean }
  | { type: 'PILLAGE_CITY'; vertexId: string; playerId: number }
  | { type: 'REMOVE_ROAD'; edgeId: string }
  | { type: 'MOVE_SHIP'; fromEdgeId: string; toEdgeId: string; playerId: number }
  | { type: 'PIRATE_MOVED'; tileId: string | null; thiefId: number; victimId: number | null; stolenItem: StolenItem | null }
  | { type: 'ROBBER_ACTIVATED' }
  | { type: 'MERCHANT_MOVED'; tileId: string; holderId: number }
  | { type: 'RESET_BOARD'; robberTileId: string }
  | {
      type: 'RESTORE_BOARD'
      settlements: Record<string, Building>
      roads: Record<string, number>
      ships: Record<string, number>
      shipsBuiltThisTurn: string[]
      hasMovedShipThisTurn: boolean
      robberTileId: string
      pirateTileId: string | null
      robberActive: boolean
      merchantTileId: string | null
      merchantHolderId: number | null
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
        // A setup-placed ship isn't "built this turn" in the gameplay sense —
        // there is no turn yet during setup, and applyShipPlacement's setup
        // branch never dispatches TURN_ADVANCED on its way into real play, so
        // an entry added here would otherwise survive into the player's
        // actual first turn and wrongly block that same ship from being
        // moved on it.
        shipsBuiltThisTurn: action.isSetup ? state.shipsBuiltThisTurn : [...state.shipsBuiltThisTurn, action.edgeId],
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
    case 'ROBBER_MOVED':
      return { ...state, robberTileId: action.tileId }
    case 'TAXATION_RESOLVED':
      return { ...state, robberTileId: action.tileId }
    case 'PIRATE_MOVED':
      return { ...state, pirateTileId: action.tileId }
    case 'ROBBER_ACTIVATED':
      return { ...state, robberActive: true }
    case 'MERCHANT_MOVED':
      return { ...state, merchantTileId: action.tileId, merchantHolderId: action.holderId }
    case 'TURN_ADVANCED':
      return { ...state, shipsBuiltThisTurn: [], hasMovedShipThisTurn: false }
    case 'RESET_BOARD':
      // A fresh object every reset, not the shared `initialBoardState`
      // singleton — nothing mutates settlements/roads in place today, but
      // aliasing the module-level object into live state costs nothing to
      // avoid.
      return { settlements: {}, roads: {}, ships: {}, shipsBuiltThisTurn: [], hasMovedShipThisTurn: false, robberTileId: action.robberTileId, pirateTileId: null, robberActive: false, merchantTileId: null, merchantHolderId: null }
    case 'RESTORE_BOARD':
      return {
        settlements: action.settlements,
        roads: action.roads,
        ships: action.ships,
        shipsBuiltThisTurn: action.shipsBuiltThisTurn,
        hasMovedShipThisTurn: action.hasMovedShipThisTurn,
        robberTileId: action.robberTileId,
        pirateTileId: action.pirateTileId,
        robberActive: action.robberActive,
        merchantTileId: action.merchantTileId,
        merchantHolderId: action.merchantHolderId,
      }
    default:
      // Not a `never`-exhaustiveness default: `action` is the full
      // GameAction union (every slice's actions), not just BoardAction, so
      // most of that union — including every players-only action — is
      // legitimately unhandled here. reduceBoard only owns the 10 cases
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
    case 'ROBBER_MOVED':
    case 'TAXATION_RESOLVED':
      // No banner/sfx here — App.tsx's applyRobberMove/applyTaxationResolved
      // already build their own richer `inform(...)` message (steal outcome,
      // biome name) and play their own sfx directly, bypassing
      // describeBoardAction entirely for these two actions, same as
      // RESET_BOARD/RESTORE_BOARD already do (see that case's own comment).
      return { message: null, sfx: null }
    case 'PIRATE_MOVED':
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
