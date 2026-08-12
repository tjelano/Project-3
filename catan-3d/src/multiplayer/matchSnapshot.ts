import { getSupabaseClient } from '../lib/supabaseClient'
import type { Building, DevCardType, GameRules, Player } from '../game/types'
import type { BoardCell, BoardShapeId } from '../data/hexBoard'
import type { GamePhase, SetupStage } from '../App'

const TABLE = 'match_snapshots'

/**
 * Everything needed to fully re-derive game state on another browser —
 * deliberately NOT everything App.tsx holds. tiles/graph/ports are omitted
 * on purpose: they're already a pure, deterministic function of the room
 * code (buildHexBoard(roomCode)), so persisting them would just be a second
 * copy of the same bytes that could theoretically drift from the real
 * source of truth. Recomputing them locally on restore is both smaller and
 * safer than trusting a stored copy.
 */
export interface MatchSnapshot {
  hostName: string
  // Optional because snapshots saved before board shapes existed won't have
  // it — restoreFromSnapshot in App.tsx falls back to 'standard' when absent.
  boardShapeId?: BoardShapeId
  // Set together, only when the match was started on a player-drawn shape.
  customBoardCells?: BoardCell[]
  // Optional for the same reason boardShapeId is — snapshots saved before
  // house rules existed default to DEFAULT_GAME_RULES on restore. Player
  // colors need no separate field: they're already on each Player below.
  gameRules?: GameRules
  // Optional for the same reason — absent on pre-house-rules snapshots,
  // which restoreFromSnapshot treats as 0 (safe: at worst it re-protects a
  // handful of already-past rolls from the noSevensFirstTwoRolls check).
  totalRollsThisGame?: number
  // Same optional/backward-compatible treatment — absent snapshots restore
  // to 0, which is always correct at the start of whatever turn is current
  // on restore (a genuinely mid-streak reconnect just loses that streak's
  // memory, not a correctness bug — the streak resets every new turn anyway).
  consecutiveDoublesThisTurn?: number
  // Optional for the same reason — absent on snapshots saved before who-goes-
  // first was randomized, which restoreFromSnapshot treats as 0 (seat 0),
  // matching those matches' actual original behavior.
  startingPlayerIndex?: number
  playerNames: string[]
  players: Player[]
  settlements: Record<string, Building>
  roads: Record<string, number>
  currentPlayerIndex: number
  robberTileId: string
  gamePhase: GamePhase
  setupStepIndex: number
  setupStage: SetupStage
  setupSettlementVertexId: string | null
  lastRoll: number | null
  devDeck: DevCardType[]
  winner: Player | null
  longestRoadHolderId: number | null
  largestArmyHolderId: number | null
  devCardPlayedThisTurn: boolean
  freeRoadsRemaining: number
  // Whether the current player has already rolled this turn — restored so a
  // reconnect mid-turn can't be tricked into rolling (and generating
  // resources) a second time via the Roll Dice button.
  hasRolledThisTurn: boolean
}

/**
 * Fire-and-forget by design: a failed save (table not created yet, a
 * network hiccup) must never interrupt the game the host is actively
 * playing. Errors are logged, not thrown or surfaced to the player.
 */
export function saveMatchSnapshot(roomCode: string, snapshot: MatchSnapshot): void {
  let client
  try {
    client = getSupabaseClient()
  } catch (err) {
    console.error('[Catan] Supabase not configured, skipping snapshot save:', err)
    return
  }
  void client
    .from(TABLE)
    .upsert({ room_code: roomCode, snapshot, updated_at: new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.error('[Catan] Failed to save match snapshot:', error)
    })
}

/**
 * Returns null on ANY failure — missing table, RLS not configured, no row
 * for this code, network error — rather than throwing. The caller's
 * fallback in every case is the same: fall through to the normal lobby
 * flow, which already handles "this is a brand new room" correctly.
 */
export async function loadMatchSnapshot(roomCode: string): Promise<MatchSnapshot | null> {
  let client
  try {
    client = getSupabaseClient()
  } catch (err) {
    console.error('[Catan] Supabase not configured, cannot check for an existing match:', err)
    return null
  }
  const { data, error } = await client.from(TABLE).select('snapshot').eq('room_code', roomCode).maybeSingle()
  if (error) {
    console.error('[Catan] Failed to look up an existing match snapshot:', error)
    return null
  }
  return (data?.snapshot as MatchSnapshot | undefined) ?? null
}
