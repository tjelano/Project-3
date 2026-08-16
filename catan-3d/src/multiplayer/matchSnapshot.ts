import { getSupabaseClient } from '../lib/supabaseClient'
import type { Building, DevCardType, GameRules, ImprovementTrack, MetropolisHolders, Player } from '../game/types'
import type { BoardCell, BoardShapeId, Biome } from '../data/hexBoard'
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
  customBoardBiomeOverrides?: Record<string, Biome>
  // Optional for the same reason boardShapeId is — snapshots saved before
  // house rules existed default to DEFAULT_GAME_RULES on restore. Player
  // colors need no separate field: they're already on each Player below.
  gameRules?: GameRules
  // Optional for the same reason boardShapeId is — snapshots saved before
  // Hidden Tiles existed won't have it. restoreFromSnapshot treats absent
  // as "nothing revealed yet," which only under-reveals a handful of
  // already-built tiles on a reconnect to an in-progress pre-feature
  // match — cosmetic only, self-corrects the moment anyone builds again.
  revealedTileIds?: string[]
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
  // Optional for the same reason boardShapeId is — snapshots saved before
  // Cities & Knights' Metropolis existed won't have either field.
  // restoreFromSnapshot (App.tsx) falls back to all-null on both, which is
  // always correct for a pre-feature match (nobody could have claimed a
  // Metropolis yet). pendingMetropolisTrack is deliberately NOT persisted
  // here — see its own declaration in App.tsx.
  metropolisHolders?: MetropolisHolders
  metropolisVertexIds?: Record<ImprovementTrack, string | null>
  devCardPlayedThisTurn: boolean
  freeRoadsRemaining: number
  // Whether the current player has already rolled this turn — restored so a
  // reconnect mid-turn can't be tricked into rolling (and generating
  // resources) a second time via the Roll Dice button.
  hasRolledThisTurn: boolean
}

// Serializes the actual network writes so a reordered/slow response can
// never let an OLDER snapshot's upsert land after a NEWER one's — App.tsx's
// autosave effect can fire saveMatchSnapshot several times in quick
// succession (a build, then a trade, then a turn pass, each a separate
// state change), and with plain fire-and-forget upserts, nothing guaranteed
// those requests would even ARRIVE at Supabase in the order they were sent,
// let alone complete in that order. Module-level state is fine here since
// only one match autosaves from a given tab at a time (this file's own
// single-module-instance textureCache-style pattern, used elsewhere in this
// codebase for the same "one shared thing per tab" reason). `pending` holds
// only the LATEST snapshot — any saves superseded before their turn comes
// up are silently coalesced away rather than sent at all, which is correct:
// only the newest state is ever worth persisting.
let activeSave: Promise<void> = Promise.resolve()
let pending: { roomCode: string; snapshot: MatchSnapshot } | null = null

async function runSave(roomCode: string, snapshot: MatchSnapshot): Promise<void> {
  let client
  try {
    client = getSupabaseClient()
  } catch (err) {
    console.error('[Catan] Supabase not configured, skipping snapshot save:', err)
    return
  }
  // Supabase's query builder is PromiseLike, not a real Promise (no
  // .catch/.finally) — awaiting it here, inside a real async function,
  // is what gives runSave itself a genuine Promise<void> to hand back to
  // the activeSave chain above.
  const { error } = await client
    .from(TABLE)
    .upsert({ room_code: roomCode, snapshot, updated_at: new Date().toISOString() })
  if (error) console.error('[Catan] Failed to save match snapshot:', error)
}

/**
 * Fire-and-forget by design: a failed save (table not created yet, a
 * network hiccup) must never interrupt the game the host is actively
 * playing. Errors are logged, not thrown or surfaced to the player. The
 * actual network request is queued behind whichever save (if any) is
 * already in flight — see activeSave/pending above.
 */
export function saveMatchSnapshot(roomCode: string, snapshot: MatchSnapshot): void {
  pending = { roomCode, snapshot }
  activeSave = activeSave.then(() => {
    if (!pending) return
    const next = pending
    pending = null
    return runSave(next.roomCode, next.snapshot)
  })
}

// Checks only the fields restoreFromSnapshot (App.tsx) reads WITHOUT a `??`
// fallback — i.e. the ones a missing/malformed value would actually crash
// on, not a full schema validation. This interface has already grown
// several optional fields over time as new features shipped (see their own
// comments above) precisely because old rows don't have them; a row from
// some future format change, or one that's been hand-edited, could just as
// easily be missing a REQUIRED field. Deliberately loose on element shape
// (e.g. doesn't verify every entry of `players` individually) — this is a
// crash guard at the boundary, not a full runtime schema.
function isPlausibleMatchSnapshot(value: unknown): value is MatchSnapshot {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return (
    typeof s.hostName === 'string' &&
    Array.isArray(s.playerNames) &&
    Array.isArray(s.players) &&
    typeof s.settlements === 'object' &&
    s.settlements !== null &&
    typeof s.roads === 'object' &&
    s.roads !== null &&
    typeof s.currentPlayerIndex === 'number' &&
    typeof s.robberTileId === 'string' &&
    typeof s.gamePhase === 'string' &&
    typeof s.setupStepIndex === 'number' &&
    typeof s.setupStage === 'string' &&
    Array.isArray(s.devDeck) &&
    typeof s.devCardPlayedThisTurn === 'boolean' &&
    typeof s.freeRoadsRemaining === 'number' &&
    typeof s.hasRolledThisTurn === 'boolean'
  )
}

/**
 * Returns null on ANY failure — missing table, RLS not configured, no row
 * for this code, a network error, or a row whose stored snapshot doesn't
 * actually look like a MatchSnapshot — rather than throwing. The caller's
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
  if (data?.snapshot == null) return null
  if (!isPlausibleMatchSnapshot(data.snapshot)) {
    console.error('[Catan] Stored match snapshot is missing required fields, ignoring it:', data.snapshot)
    return null
  }
  return data.snapshot
}
