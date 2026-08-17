import { useEffect, useRef, useState } from 'react'
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabaseClient'
import { debugLog } from '../utils/debugLog'
import type { CommodityType, DevCardType, GameRules, ImprovementTrack, KnightPiece, PlayerColorToken, ProgressCardType, ResourceType, Resources } from '../game/types'
import type { BoardCell, BoardShapeId, Biome } from '../data/hexBoard'
import type { EventDieFace } from '../components/Dice3D'

export interface RoomPlayer {
  // Only ever present on entries the HOOK hands back via `players` (set
  // from the presence key at sync time) — never set it on the `self` object
  // passed in for tracking, the hook doesn't read it back off `self`.
  id?: string
  name: string
  isHost: boolean
  // Only meaningful on the host's own presence entry — the lobby size every
  // other client reads to know when the room is full.
  targetCount?: number
  // Each player's own pick, live in the lobby — everyone else's presence
  // entries are what a joiner checks to avoid picking an already-taken color.
  colorToken?: PlayerColorToken
  // Both only meaningful on the host's own presence entry — true while the
  // host has re-opened the region picker to change the map (without leaving
  // the room), with previewBoardShapeId tracking whichever built-in region
  // is currently highlighted so every other client can mirror it live.
  // Absent/false once the host confirms and returns to the lobby. Doesn't
  // cover picking/drawing a custom shape — that stays host-only, unsynced.
  isChoosingMap?: boolean
  previewBoardShapeId?: BoardShapeId
}

// What `players` below actually holds — the hook always attaches `id` (see
// the presence sync handler), so callers reading FROM `players` get it
// guaranteed, even though a caller WRITING `self` never sets it themselves.
export type PresencePlayer = RoomPlayer & { id: string }

export type RoomConnectionStatus = 'connecting' | 'connected' | 'error'

// crypto.randomUUID only works in a secure context (HTTPS or localhost) —
// testing over a LAN IP on plain HTTP (a real setup for this app, playing
// across devices on one network) would throw here. getRandomValues doesn't
// have that restriction, and a last-resort Math.random fallback covers any
// environment lacking the Crypto API at all — this id only needs to be
// unique enough to key one browser tab's presence entry, not unguessable.
function generateClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID()
    } catch {
      // Falls through to the getRandomValues path below.
    }
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16))
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

export interface DiceRolledPayload {
  dice: [number, number]
  eventDie: EventDieFace
  total: number
  playerId: number
}

export interface TurnPassedPayload {
  nextPlayerIndex: number
}

export interface SettlementBuiltPayload {
  vertexId: string
  playerId: number
}

export interface CityBuiltPayload {
  vertexId: string
  playerId: number
  // Cities & Knights Medicine — set only when this city was upgraded at
  // Medicine's discounted 1 Wheat + 2 Ore price instead of the normal
  // CITY_COST. The acting client's own pendingMedicineUse flag is local-only
  // (a one-shot per-client UI state, not broadcast on its own), so a
  // receiver has no way to independently know "why was this city cheaper" —
  // telling it the exact cost actually paid keeps every client's copy of the
  // builder's resources in sync without a separate Medicine-play broadcast.
  costOverride?: Partial<Resources>
}

export interface RoadBuiltPayload {
  edgeId: string
  playerId: number
  // Whether this road came from a free-placement effect (a Road Building
  // card) rather than being paid for. Dev-card plays aren't broadcast in
  // this phase, so a receiving client's own freeRoadsRemaining count can't
  // be trusted to answer this — the actor has to say so explicitly, or a
  // receiver could wrongly charge (or fail to charge) the builder.
  isFreeRoad: boolean
}

export interface RobberMovedPayload {
  tileId: string
  thiefId: number
  victimId: number | null
  stolenResource: ResourceType | null
}

export interface KnightPlayedPayload {
  playerId: number
}

export interface RoadBuildingPlayedPayload {
  playerId: number
}

export interface PlentyPlayedPayload {
  playerId: number
  picks: ResourceType[]
}

export interface MonopolyPlayedPayload {
  playerId: number
  resource: ResourceType
}

// Cities & Knights Resource Monopoly — same payload SHAPE as
// MonopolyPlayedPayload (announcer + the announced resource type), kept as
// its own interface/event rather than reusing MONOPOLY_PLAYED so the event
// log / receiving clients can tell which card was actually played; the
// resource-steal math itself (applyMonopolyEffect) is identical either way.
export interface ResourceMonopolyPlayedPayload {
  playerId: number
  resource: ResourceType
}

// Cities & Knights Trade Monopoly — the commodity equivalent of
// ResourceMonopolyPlayedPayload just above (announces a CommodityType
// instead of a ResourceType; applyTradeMonopolyEffect takes 1 per player
// instead of Resource Monopoly's take-all).
export interface TradeMonopolyPlayedPayload {
  playerId: number
  commodity: CommodityType
}

export interface TradePayload {
  fromPlayerId: number
  toPlayerId: number
  offerResource: ResourceType
  wantResource: ResourceType
}

export interface TradeCancelledPayload {
  reason: string
}

export interface DevCardBoughtPayload {
  playerId: number
  // The exact card drawn — each client shuffles its own devDeck
  // independently (unseeded), so a receiver can't reliably reproduce
  // "whichever card the buyer's own deck happened to draw" on its own;
  // it has to be told. The receiver still pops one card off its OWN
  // devDeck to keep its count in sync (see onDevCardBought in App.tsx) —
  // which specific card that is doesn't matter, since a devDeck's
  // remaining contents are never shown to anyone.
  card: DevCardType
}

// Cities & Knights house rule — one commodity-funded level-up on one of the
// buyer's 3 improvement tracks. newLevel is carried for the receiver's own
// event-log message only — applyCityImprovementPurchase (App.tsx) recomputes
// the actual cost/level from THIS client's own copy of the buyer's current
// level (via buyImprovementLevel/improvementLevelCost) rather than trusting
// it over the wire, same trust model as every other trusted-apply function
// in this file.
export interface CityImprovementPurchasedPayload {
  playerId: number
  track: ImprovementTrack
  newLevel: number
  // Cities & Knights Crane — true when this purchase consumed the buyer's
  // pay-full-then-refund-1 discount. craneDiscountPlayerId (App.tsx) is
  // local-only state, never broadcast on its own (unlike Medicine's
  // pendingMedicineUse, Crane's discount doesn't gate WHICH click resolves
  // it — it's folded straight into this existing purchase broadcast
  // instead), so without this flag every OTHER client would apply
  // applyCityImprovementPurchase's full, undiscounted deduction and never
  // issue the matching 1-commodity refund the acting client gave itself —
  // a permanent, silent commodity-count desync between clients.
  craneDiscount?: boolean
}

// Cities & Knights progress cards — sent once per event-die trigger with a
// non-'ship' face, batching every eligible player's draw for that track in
// one payload. card is the exact draw for each player: like
// DevCardBoughtPayload.card, a receiver can't reproduce which card a
// draw resolved to from its own independently-shuffled deck copy, so the
// roller has to say so explicitly. The receiver still pops the SAME COUNT
// off its own progressCardDecks[track] to keep its remaining-deck length in
// sync (see onProgressCardsDrawn in App.tsx) — which specific cards remain
// doesn't matter, since a deck's remaining contents are never shown to
// anyone.
export interface ProgressCardsDrawnPayload {
  track: ImprovementTrack
  draws: { playerId: number; card: ProgressCardType }[]
}

// Shared, generic payload for every "no-target, no-picker, self-only
// effect" progress card (Irrigation, Mining here; Task 14's Merchant Fleet
// reuses this same shape) — unlike ProgressCardsDrawnPayload above, no
// card-identity trust issue exists here: both clients compute the SAME
// deterministic effect from the SAME public board state, so the payload
// only has to say WHO played WHICH card, not what the effect resolved to.
export interface ProgressCardPlayedPayload {
  playerId: number
  card: ProgressCardType
}

// Cities & Knights Metropolis — sent once a player's city-selection click
// (App.tsx's buildSettlementRaw, pendingMetropolisTrack branch) resolves
// which of their cities gets the marker. Every OTHER client trusts this
// resolution outright (playerId is the ALREADY-RESOLVED next holder, not
// just "who clicked") rather than re-running metropolisHolderAfterPurchase
// itself — same trust model broadcastTrophyUpdated already uses for trophy
// state, since correctly resolving control depends on knowing every
// player's current level at the exact moment of purchase, which only the
// purchasing client's local state is guaranteed fresh for at that instant.
export interface MetropolisClaimedPayload {
  track: ImprovementTrack
  playerId: number
  vertexId: string
}

// Cities & Knights Invention — swaps 2 number tokens on the board. Unlike
// every other progress-card effect in this file, this one is deterministic
// given only the 2 tile ids (no player-specific state involved at all — the
// board itself is the only thing that changes), so it gets its own tiny
// payload/broadcast pair rather than reusing the generic
// ProgressCardPlayedPayload shape: that shape only carries WHO played WHICH
// card, and Invention's actual effect needs to say WHICH 2 tiles.
export interface InventionSwappedPayload {
  tileAId: string
  tileBId: string
}

export interface BankTradePayload {
  playerId: number
  give: ResourceType
  receive: ResourceType
  // The exchange rate actually applied — sent explicitly, trusted-apply,
  // rather than re-derived from the receiver's own copy of the trader's
  // port access (same reasoning as RoadBuiltPayload.isFreeRoad below).
  rate: number
}

// Cities & Knights Trade level 3 — 2:1 commodity trading. Unlike
// BankTradePayload, the rate is never sent: it's always fixed at 2:1 by
// this ability (no port/rate lookup, see TradeModal's own 'commodity' mode),
// so the receiver's applyCommodityTrade (App.tsx) can hardcode it too rather
// than trusting a value over the wire.
export interface CommodityTradedPayload {
  playerId: number
  give: CommodityType
  receive: ResourceType | CommodityType
}

// Cities & Knights Guild Dues (Task 11) — the announcer's own picks from a
// targeted opponent's hand. Unlike ProgressCardsDrawnPayload/DevCardBoughtPayload,
// there's no card-identity trust issue here: both clients already hold the
// IDENTICAL target hand (players state is fully synced to every client, just
// never rendered for a non-viewer — this task's own scope note), so the
// receiver applies these exact type picks directly via applyGuildDuesTake
// rather than re-deriving anything from its own state.
export interface GuildDuesTakenPayload {
  takerId: number
  targetId: number
  picks: (ResourceType | CommodityType)[]
}

// Cities & Knights Espionage (Task 11) — cardIndex is an index into the
// TARGET's progressCards array, not a card identity. Both clients already
// hold the identical array (no un-syncable local randomness involved, unlike
// a devDeck/progressCardDeck draw — see ProgressCardsDrawnPayload's own
// comment for that contrast), so the receiver re-derives the actual card
// from target.progressCards[cardIndex] itself (applyEspionageTake, App.tsx)
// rather than trusting a duplicated card-identity field over the wire that
// could disagree with what's actually at that index on this client.
export interface EspionageTakenPayload {
  takerId: number
  targetId: number
  cardIndex: number
}

// Cities & Knights Commercial Harbor (Task 12) — the plan's own sequential
// simplification (App.tsx's applyCommercialHarborEffect): one resource type,
// walked once across every other player in turn order. turnOrderIds is
// carried explicitly rather than re-derived from currentPlayerIndex on the
// receiver — the announcer's client computed it at a specific moment, and
// re-deriving independently risks a different currentPlayerIndex if a race
// with turn advancement occurs. Otherwise deterministic given just these 3
// values plus already-synced player resource/commodity state, so — like
// Irrigation/Mining/Sabotage/Wedding — this gets ONE broadcast, applied via
// the same applyCommercialHarborEffect function shared by the local actor
// and every receiver (no separate generic ProgressCardPlayedPayload needed
// first, unlike Invention/Guild Dues/Espionage's two-broadcast split).
export interface CommercialHarborPlayedPayload {
  playerId: number
  resource: ResourceType
  turnOrderIds: number[]
}

// Cities & Knights Diplomacy (Task 12) — removes one open road (see
// isOpenRoad's own comment in App.tsx for the plan's directly-computable-half
// simplification). ownerId is the road's owner BEFORE removal (the announcer,
// for their own road, or an opponent) — sent explicitly, trusted-apply, same
// reasoning as MetropolisClaimedPayload/GuildDuesTakenPayload above: the
// receiver's applyDiplomacyRemoval returns the road to the right player's
// supply (or grants the announcer's own free rebuild) directly from this
// value plus already-synced roads/player state, no independent re-resolution
// needed.
export interface DiplomacyPlayedPayload {
  playerId: number
  edgeId: string
  ownerId: number
}

// Cities & Knights Merchant (Task 13) — moves the Merchant piece to a new
// land hex adjacent to one of the placing player's buildings. Like
// MetropolisClaimedPayload above, this is sent ALREADY-RESOLVED: the acting
// client only ever offers this tile as a click target once it's already
// confirmed land+adjacency locally (MerchantLayer's own filtered tile set),
// so every other client just applies tileId/holderId directly — same
// trusted-apply model, no independent re-validation.
export interface MerchantMovedPayload {
  tileId: string
  holderId: number
}

// Cities & Knights knight recruit (Task 7) — sent ALREADY-RESOLVED, same
// trusted-apply model MerchantMovedPayload's own comment above describes:
// the acting client already validated cost/supply/target locally
// (canRecruitKnight + recruitableVertices) before ever broadcasting, so
// every other client just applies the fully-formed KnightPiece directly.
export interface KnightRecruitedPayload {
  knight: KnightPiece
}

export interface NewGamePayload {
  // Every client independently calls buildHexBoard(boardSeed) instead of
  // buildHexBoard(roomCode) — reusing the room code would reshuffle to the
  // exact SAME layout every restart, since it's a deterministic seed. A
  // fresh random seed, generated once by the host and broadcast, gives
  // everyone the same NEW board instead.
  boardSeed: string
}

export interface ChatMessagePayload {
  senderId: number
  senderName: string
  text: string
  timestamp: number
}

export interface HoverChangedPayload {
  playerId: number
  // Exactly one of these is set (the other null) while hovering, or both
  // null on pointer-out — never persisted, purely "what is the active
  // player currently pointing at" for spectators to see live.
  vertexId: string | null
  edgeId: string | null
}

export interface TrophyUpdatedPayload {
  longestRoadHolderId: number | null
  largestArmyHolderId: number | null
}

export interface DiscardConfirmedPayload {
  playerId: number
  // Resource/commodity -> quantity tally, not a full resources/commodities
  // object — the receiver subtracts these from its OWN copy of the
  // player's holdings (trusted apply), the same shape every other
  // resource-mutating broadcast in this file uses. Commodity keys only
  // ever appear here when the Cities & Knights commodities house rule is
  // on (see PlayerHand3D's discard-selection gate and App.tsx's
  // confirmDiscard/autoDiscardCounts).
  counts: Partial<Record<ResourceType | CommodityType, number>>
}

// Cities & Knights progress-card hand limit (4 cards) — mirrors
// DiscardConfirmedPayload above, but indices into the discarding player's
// progressCards array rather than a type -> quantity tally, since progress
// cards aren't fungible the same way resources are (a hand can hold 2
// copies of the same type). See applyProgressDiscard (App.tsx) for why
// sorting descending before splicing on the receiving end is safe.
export interface ProgressDiscardConfirmedPayload {
  playerId: number
  indices: number[]
}

// Science level 3's per-roll bonus: a player who received zero production
// on a non-7 roll gets to pick 1 free resource. Unlike DiscardConfirmedPayload,
// this can fire for ANY player regardless of whose turn it is — see the
// scienceFreeResourcePlayerIds queue in App.tsx.
export interface ScienceFreeResourcePickedPayload {
  playerId: number
  resource: ResourceType
}

interface GameStartedPayload {
  names: string[]
  // Carried explicitly rather than inferred (e.g. "names[0]") so every
  // client — not just the host — knows definitively who the host is from
  // the moment the match starts. That identity gets persisted into every
  // match snapshot, which is what lets a reloaded host still be recognized
  // as host after rejoining through the ordinary Join flow, where they'd
  // otherwise look like just another player.
  hostName: string
  // The host's own pick — every OTHER client has to be told, since
  // buildHexBoard's shape argument isn't derivable from the room code the
  // way the seed fallback is.
  boardShapeId: BoardShapeId
  // Set together, only when the host picked a player-drawn shape — carried
  // as raw cells rather than an id, since other clients have no way to
  // look a custom shape up from their own localStorage.
  customBoardCells?: BoardCell[]
  customBoardName?: string
  gameRules: GameRules
  // Parallel to `names` — each entry is that seat's stable presence
  // clientId. A receiver resolves ITS OWN seat by finding its own clientId
  // in here, not by matching its freshly-typed name against `names`: the
  // sender's own view of a fast-typing joiner's name can still be stale
  // (track() is debounced) at the exact moment Start Game is clicked, and
  // a name mismatch after normalization used to permanently lock that
  // player out of ever taking their own turn. Optional so an older/
  // mismatched build still degrades to the previous name-matching path
  // instead of failing to parse the payload at all.
  clientIds?: string[]
  // Also parallel to `names` — the host's OWN view of every seat's color at
  // the instant Start Game is clicked, resolved once and broadcast as a
  // single authoritative array. Previously left uncarried on the theory
  // that re-broadcasting would just be "a second copy that could drift" —
  // backwards in practice: each receiver instead independently re-resolved
  // colors against its OWN local presence snapshot (RoomPlayer.colorToken),
  // and track() being debounced 400ms means that snapshot can be stale at
  // the exact moment a game-started broadcast lands, so two clients could
  // start the match with two different colors assigned to the same seat.
  // Optional for the same backward-compatibility reason as clientIds above.
  colorTokens?: PlayerColorToken[]
  // Also parallel to `names`/`cells` — the specific biome painted onto each
  // tile of a custom shape, if any. Sparse (only painted tiles are keys) and
  // keyed the same way HexTileData.id already is. Absent whenever the match
  // isn't on a custom shape, or the custom shape has no painted tiles.
  customBoardBiomeOverrides?: Record<string, Biome>
}

export interface RoomChannelHandlers {
  onGameStarted?: (
    names: string[],
    hostName: string,
    boardShapeId: BoardShapeId,
    gameRules: GameRules,
    customBoardCells?: BoardCell[],
    customBoardName?: string,
    clientIds?: string[],
    colorTokens?: PlayerColorToken[],
    customBoardBiomeOverrides?: Record<string, Biome>,
  ) => void
  onDiceRolled?: (payload: DiceRolledPayload) => void
  onTurnPassed?: (payload: TurnPassedPayload) => void
  onSettlementBuilt?: (payload: SettlementBuiltPayload) => void
  onCityBuilt?: (payload: CityBuiltPayload) => void
  onRoadBuilt?: (payload: RoadBuiltPayload) => void
  onRobberMoved?: (payload: RobberMovedPayload) => void
  onKnightPlayed?: (payload: KnightPlayedPayload) => void
  onRoadBuildingPlayed?: (payload: RoadBuildingPlayedPayload) => void
  onPlentyPlayed?: (payload: PlentyPlayedPayload) => void
  onMonopolyPlayed?: (payload: MonopolyPlayedPayload) => void
  // Cities & Knights Resource/Trade Monopoly — see ResourceMonopolyPlayedPayload/
  // TradeMonopolyPlayedPayload's own comments above for why these are
  // separate events rather than reusing onMonopolyPlayed/onProgressCardPlayed.
  onResourceMonopolyPlayed?: (payload: ResourceMonopolyPlayedPayload) => void
  onTradeMonopolyPlayed?: (payload: TradeMonopolyPlayedPayload) => void
  // Sent to the target player when someone proposes a trade.
  onTradeOffered?: (payload: TradePayload) => void
  // Sent by the target when they accept — every client receives it, but only
  // the host's own listener acts on it (see resolveTradeAsHost in App.tsx).
  onTradeAcceptRequest?: (payload: TradePayload) => void
  // The host's authoritative outcome: apply the resource swap, trusted, no
  // re-validation.
  onTradeResolved?: (payload: TradePayload) => void
  // A decline (from the target) or a host rejection (stale resource counts)
  // — either way, every client just clears its pending trade and shows why.
  onTradeCancelled?: (payload: TradeCancelledPayload) => void
  // A single over-limit player's confirmed discard after a 7-roll. Every
  // over-limit player discards independently on their own screen — this
  // fires once per player, not once for the whole table.
  onDiscardConfirmed?: (payload: DiscardConfirmedPayload) => void
  // Cities & Knights progress-card hand-limit discard — same "fires once
  // per over-limit player, not once for the whole table" shape as
  // onDiscardConfirmed above.
  onProgressDiscardConfirmed?: (payload: ProgressDiscardConfirmedPayload) => void
  // Science level 3's free-resource queue — fires once per eligible player
  // per roll, same "independent per-player queue" shape as discard above.
  onScienceFreeResourcePicked?: (payload: ScienceFreeResourcePickedPayload) => void
  // Longest Road / Largest Army are sticky on ties (see pickTrophyHolder in
  // game/trophies.ts) — inherently path-dependent, not just a function of
  // the CURRENT board, so every client computing this independently risks
  // permanent divergence if two clients ever observed an intermediate
  // roads/knights state in a different order (ordinary broadcast-arrival
  // jitter). Host-authoritative instead: only the effective host computes
  // it and broadcasts the result; everyone else just applies it.
  onTrophyUpdated?: (payload: TrophyUpdatedPayload) => void
  // Host-only action: everyone resets to a fresh board and starting state,
  // same players and room.
  onNewGame?: (payload: NewGamePayload) => void
  onDevCardBought?: (payload: DevCardBoughtPayload) => void
  onCityImprovementPurchased?: (payload: CityImprovementPurchasedPayload) => void
  onProgressCardsDrawn?: (payload: ProgressCardsDrawnPayload) => void
  // Generic receiver for every self-only, no-picker progress card play (see
  // ProgressCardPlayedPayload above) — App.tsx dispatches on payload.card to
  // the matching applyXEffect(playerId) function.
  onProgressCardPlayed?: (payload: ProgressCardPlayedPayload) => void
  // Trusted-apply — see MetropolisClaimedPayload's own comment above for why
  // receivers apply payload.playerId directly instead of re-resolving it.
  onMetropolisClaimed?: (payload: MetropolisClaimedPayload) => void
  // Cities & Knights Invention — see InventionSwappedPayload's own comment
  // above. Every client (actor and receivers alike) applies this via the
  // exact same applyInventionSwap function.
  onInventionSwapped?: (payload: InventionSwappedPayload) => void
  onBankTrade?: (payload: BankTradePayload) => void
  onCommodityTraded?: (payload: CommodityTradedPayload) => void
  // Cities & Knights Guild Dues/Espionage (Task 11) — fire once the acting
  // client has confirmed their own picks in OpponentHandPicker; the card
  // itself was already spent (and every client already removed it from the
  // taker's hand) via the earlier, generic onProgressCardPlayed broadcast —
  // same two-broadcast split onInventionSwapped uses relative to
  // onProgressCardPlayed's 'invention' branch.
  onGuildDuesTaken?: (payload: GuildDuesTakenPayload) => void
  onEspionageTaken?: (payload: EspionageTakenPayload) => void
  // Cities & Knights Commercial Harbor/Diplomacy (Task 12) — each is its own
  // single, self-contained broadcast (see CommercialHarborPlayedPayload/
  // DiplomacyPlayedPayload's own comments above for why neither needs a
  // separate preceding onProgressCardPlayed broadcast the way Invention/
  // Guild Dues/Espionage do).
  onCommercialHarborPlayed?: (payload: CommercialHarborPlayedPayload) => void
  onDiplomacyPlayed?: (payload: DiplomacyPlayedPayload) => void
  // Cities & Knights Merchant (Task 13) — see MerchantMovedPayload's own
  // comment above for the trusted-apply reasoning.
  onMerchantMoved?: (payload: MerchantMovedPayload) => void
  // Cities & Knights knight recruit (Task 7) — see KnightRecruitedPayload's
  // own comment above for the trusted-apply reasoning.
  onKnightRecruited?: (payload: KnightRecruitedPayload) => void
  // The active player's live vertex/edge hover, so spectators can see what
  // they're considering building before they commit to it.
  onHoverChanged?: (payload: HoverChangedPayload) => void
  onChatMessage?: (payload: ChatMessagePayload) => void
}

/**
 * Binds to one Supabase Realtime channel per room code, combining two of its
 * primitives for two different jobs:
 *
 *  - Presence tracks WHO is currently in the room. A fresh joiner sees the
 *    full existing roster immediately on sync, unlike Broadcast, whose
 *    messages only reach clients that were already subscribed when sent —
 *    Broadcast alone would silently drop anyone who joined late.
 *  - Broadcast is the general "send/receive live game payload events" wire:
 *    used by the lobby for the host's game-started signal, and now by the
 *    match itself for DICE_ROLLED / TURN_PASSED — the same channel and
 *    connection handle every phase of a room's life.
 *
 * One instance of this hook is used in the lobby (OnlineSetup) and a SEPARATE
 * instance is used for the whole match (App, once gameStarted flips true) —
 * both bind to the identical `room:<code>` topic, so the second subscription
 * picks up exactly where the first left off. This is deliberate, not an
 * oversight: handing a live channel reference down from an unmounting lobby
 * component into App would need much more machinery than briefly
 * resubscribing to the same topic, which Realtime supports natively.
 */
export function useRoomChannel(roomCode: string | null, self: RoomPlayer | null, handlers: RoomChannelHandlers) {
  const [players, setPlayers] = useState<PresencePlayer[]>([])
  const [status, setStatus] = useState<RoomConnectionStatus>('connecting')
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Ref rather than a dependency: handlers is a fresh object every render in
  // the caller, and re-subscribing the channel on every render would drop
  // and re-join presence constantly. Updated in its own effect — mutating a
  // ref during render (rather than in an effect or handler) is unsafe, since
  // render can be discarded or re-run by React at any time.
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  })

  // A presence entry's KEY has to stay stable for the life of one connection
  // — self.name can't be used for it (some callers, like HostMenu's own name
  // field, update it live on every keystroke before Start Game, not just
  // once up front). A random per-tab id, generated once (lazy useState
  // initializer, same pattern HostMenu's own roomCode uses) and never
  // touched again, decouples "which browser tab is this" (the key) from
  // "what did they type" (name — just a normal field on the track()'d
  // payload now, same as colorToken already was). useState rather than a
  // ref specifically so it's safe to read during render for the return
  // value below.
  const [clientId] = useState(generateClientId)

  // Bumped to force the subscribe effect below to tear down and retry after
  // a connection error — without this, a channel that ever hits
  // CHANNEL_ERROR/TIMED_OUT (a dropped connection, a momentary Realtime
  // hiccup) leaves status stuck at 'error' forever, since nothing else in
  // this hook re-triggers a subscribe attempt; every other client would see
  // that player silently, permanently vanish with no way back short of a
  // full page reload.
  const [retryToken, setRetryToken] = useState(0)
  useEffect(() => {
    if (status !== 'error') return
    const timer = setTimeout(() => setRetryToken((t) => t + 1), 2000)
    return () => clearTimeout(timer)
  }, [status])

  useEffect(() => {
    if (!roomCode) return

    // Reset synchronously so a new room's UI never shows a stale roster from
    // a previous subscription while this one is still connecting. This is
    // the canonical "synchronize with an external system" Effect React's own
    // docs describe (starting a Realtime channel subscription) — there's no
    // render-time value to derive these resets from, so the lint rule's
    // usual fix (compute during render) doesn't apply here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStatus('connecting')
    setPlayers([])

    let client
    try {
      client = getSupabaseClient()
    } catch (err) {
      console.error('[Catan] Supabase not configured:', err)
      setStatus('error')
      return
    }

    const channel = client.channel(`room:${roomCode}`, {
      config: { presence: { key: clientId, enabled: true } },
    })
    channelRef.current = channel

    // Ignores any status callback that arrives after THIS channel has
    // already been torn down (see the cleanup below) — removeChannel's own
    // server round trip can still deliver a late CLOSED for the OLD channel
    // after a retry has already moved on to a new one; without this guard
    // that stale callback would call setStatus('error') and clobber the new
    // channel's already-'connected' status.
    let isCurrent = true

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<RoomPlayer>()
      // Presence is keyed by the stable per-tab clientId now (not name — see
      // clientId above), but can briefly hold more than one meta under the
      // same key during a reconnect race (a leave the server hasn't acked
      // yet, overlapping a fresh join) — each key's LAST meta is the current
      // one; keeping only that instead of flatMap-ing every meta stops a
      // mid-race sync from rendering the same player twice. `id` is attached
      // here (not part of what a caller tracks) so callers can identify
      // "which entry is me" by key instead of comparing names — matching by
      // name is racy the instant a name can change while connected (a local
      // edit and the server echo of the previous value can briefly disagree,
      // making a caller's own entry look like a second, different player).
      setPlayers(Object.entries(state).map(([id, entries]) => ({ ...entries[entries.length - 1], id })))
    })

    channel.on<GameStartedPayload>('broadcast', { event: 'game-started' }, ({ payload }) => {
      handlersRef.current.onGameStarted?.(
        payload.names,
        payload.hostName,
        payload.boardShapeId,
        payload.gameRules,
        payload.customBoardCells,
        payload.customBoardName,
        payload.clientIds,
        payload.colorTokens,
        payload.customBoardBiomeOverrides,
      )
    })
    channel.on<DiceRolledPayload>('broadcast', { event: 'DICE_ROLLED' }, ({ payload }) => {
      handlersRef.current.onDiceRolled?.(payload)
    })
    channel.on<TurnPassedPayload>('broadcast', { event: 'TURN_PASSED' }, ({ payload }) => {
      handlersRef.current.onTurnPassed?.(payload)
    })
    channel.on<SettlementBuiltPayload>('broadcast', { event: 'SETTLEMENT_BUILT' }, ({ payload }) => {
      handlersRef.current.onSettlementBuilt?.(payload)
    })
    channel.on<CityBuiltPayload>('broadcast', { event: 'CITY_BUILT' }, ({ payload }) => {
      handlersRef.current.onCityBuilt?.(payload)
    })
    channel.on<RoadBuiltPayload>('broadcast', { event: 'ROAD_BUILT' }, ({ payload }) => {
      handlersRef.current.onRoadBuilt?.(payload)
    })
    channel.on<RobberMovedPayload>('broadcast', { event: 'ROBBER_MOVED' }, ({ payload }) => {
      handlersRef.current.onRobberMoved?.(payload)
    })
    channel.on<KnightPlayedPayload>('broadcast', { event: 'KNIGHT_PLAYED' }, ({ payload }) => {
      handlersRef.current.onKnightPlayed?.(payload)
    })
    channel.on<RoadBuildingPlayedPayload>('broadcast', { event: 'ROAD_BUILDING_PLAYED' }, ({ payload }) => {
      handlersRef.current.onRoadBuildingPlayed?.(payload)
    })
    channel.on<PlentyPlayedPayload>('broadcast', { event: 'PLENTY_PLAYED' }, ({ payload }) => {
      handlersRef.current.onPlentyPlayed?.(payload)
    })
    channel.on<MonopolyPlayedPayload>('broadcast', { event: 'MONOPOLY_PLAYED' }, ({ payload }) => {
      handlersRef.current.onMonopolyPlayed?.(payload)
    })
    channel.on<ResourceMonopolyPlayedPayload>('broadcast', { event: 'RESOURCE_MONOPOLY_PLAYED' }, ({ payload }) => {
      handlersRef.current.onResourceMonopolyPlayed?.(payload)
    })
    channel.on<TradeMonopolyPlayedPayload>('broadcast', { event: 'TRADE_MONOPOLY_PLAYED' }, ({ payload }) => {
      handlersRef.current.onTradeMonopolyPlayed?.(payload)
    })
    channel.on<TradePayload>('broadcast', { event: 'TRADE_OFFERED' }, ({ payload }) => {
      handlersRef.current.onTradeOffered?.(payload)
    })
    channel.on<TradePayload>('broadcast', { event: 'TRADE_ACCEPT_REQUEST' }, ({ payload }) => {
      handlersRef.current.onTradeAcceptRequest?.(payload)
    })
    channel.on<TradePayload>('broadcast', { event: 'TRADE_RESOLVED' }, ({ payload }) => {
      handlersRef.current.onTradeResolved?.(payload)
    })
    channel.on<TradeCancelledPayload>('broadcast', { event: 'TRADE_CANCELLED' }, ({ payload }) => {
      handlersRef.current.onTradeCancelled?.(payload)
    })
    channel.on<DiscardConfirmedPayload>('broadcast', { event: 'DISCARD_CONFIRMED' }, ({ payload }) => {
      handlersRef.current.onDiscardConfirmed?.(payload)
    })
    channel.on<ProgressDiscardConfirmedPayload>('broadcast', { event: 'PROGRESS_DISCARD_CONFIRMED' }, ({ payload }) => {
      handlersRef.current.onProgressDiscardConfirmed?.(payload)
    })
    channel.on<ScienceFreeResourcePickedPayload>('broadcast', { event: 'SCIENCE_FREE_RESOURCE_PICKED' }, ({ payload }) => {
      handlersRef.current.onScienceFreeResourcePicked?.(payload)
    })
    channel.on<TrophyUpdatedPayload>('broadcast', { event: 'TROPHY_UPDATED' }, ({ payload }) => {
      handlersRef.current.onTrophyUpdated?.(payload)
    })
    channel.on<NewGamePayload>('broadcast', { event: 'NEW_GAME' }, ({ payload }) => {
      handlersRef.current.onNewGame?.(payload)
    })
    channel.on<DevCardBoughtPayload>('broadcast', { event: 'DEV_CARD_BOUGHT' }, ({ payload }) => {
      handlersRef.current.onDevCardBought?.(payload)
    })
    channel.on<CityImprovementPurchasedPayload>('broadcast', { event: 'CITY_IMPROVEMENT_PURCHASED' }, ({ payload }) => {
      handlersRef.current.onCityImprovementPurchased?.(payload)
    })
    channel.on<ProgressCardsDrawnPayload>('broadcast', { event: 'PROGRESS_CARDS_DRAWN' }, ({ payload }) => {
      handlersRef.current.onProgressCardsDrawn?.(payload)
    })
    channel.on<ProgressCardPlayedPayload>('broadcast', { event: 'PROGRESS_CARD_PLAYED' }, ({ payload }) => {
      handlersRef.current.onProgressCardPlayed?.(payload)
    })
    channel.on<MetropolisClaimedPayload>('broadcast', { event: 'METROPOLIS_CLAIMED' }, ({ payload }) => {
      handlersRef.current.onMetropolisClaimed?.(payload)
    })
    channel.on<InventionSwappedPayload>('broadcast', { event: 'INVENTION_SWAPPED' }, ({ payload }) => {
      handlersRef.current.onInventionSwapped?.(payload)
    })
    channel.on<BankTradePayload>('broadcast', { event: 'BANK_TRADE' }, ({ payload }) => {
      handlersRef.current.onBankTrade?.(payload)
    })
    channel.on<CommodityTradedPayload>('broadcast', { event: 'COMMODITY_TRADED' }, ({ payload }) => {
      handlersRef.current.onCommodityTraded?.(payload)
    })
    channel.on<GuildDuesTakenPayload>('broadcast', { event: 'GUILD_DUES_TAKEN' }, ({ payload }) => {
      handlersRef.current.onGuildDuesTaken?.(payload)
    })
    channel.on<EspionageTakenPayload>('broadcast', { event: 'ESPIONAGE_TAKEN' }, ({ payload }) => {
      handlersRef.current.onEspionageTaken?.(payload)
    })
    channel.on<CommercialHarborPlayedPayload>('broadcast', { event: 'COMMERCIAL_HARBOR_PLAYED' }, ({ payload }) => {
      handlersRef.current.onCommercialHarborPlayed?.(payload)
    })
    channel.on<DiplomacyPlayedPayload>('broadcast', { event: 'DIPLOMACY_PLAYED' }, ({ payload }) => {
      handlersRef.current.onDiplomacyPlayed?.(payload)
    })
    channel.on<MerchantMovedPayload>('broadcast', { event: 'MERCHANT_MOVED' }, ({ payload }) => {
      handlersRef.current.onMerchantMoved?.(payload)
    })
    channel.on<KnightRecruitedPayload>('broadcast', { event: 'KNIGHT_RECRUITED' }, ({ payload }) => {
      handlersRef.current.onKnightRecruited?.(payload)
    })
    channel.on<HoverChangedPayload>('broadcast', { event: 'HOVER_CHANGED' }, ({ payload }) => {
      handlersRef.current.onHoverChanged?.(payload)
    })
    channel.on<ChatMessagePayload>('broadcast', { event: 'CHAT_MESSAGE' }, ({ payload }) => {
      handlersRef.current.onChatMessage?.(payload)
    })

    channel.subscribe((subStatus, err) => {
      if (!isCurrent) return
      if (subStatus === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        setStatus('connected')
      } else if (
        subStatus === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
        subStatus === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
        subStatus === REALTIME_SUBSCRIBE_STATES.CLOSED
      ) {
        // CLOSED fires for a server-initiated close too (e.g. Realtime
        // rate-limiting a channel that got hammered with too many presence
        // updates in a burst — see the debounce on track() below, which
        // exists specifically to stay under that) — not just our own
        // deliberate teardown, which sets isCurrent = false first and so
        // never reaches this branch.
        if (err) console.error('[Catan] Realtime subscribe error:', subStatus, err)
        setStatus('error')
      }
    })

    return () => {
      isCurrent = false
      void client.removeChannel(channel)
      channelRef.current = null
    }
    // Deliberately keyed on roomCode alone, not on self (or whether it
    // exists yet) — subscribing to the channel and being visibly PRESENT
    // in it are two different things (see the track/untrack effect below).
    // Tearing the whole channel down and rebuilding it just because self
    // went null (e.g. the host selecting-all and clearing their name field
    // mid-edit, not actually leaving) used to mean: no presence sync events
    // arrive at all while momentarily nameless, so a joiner connecting
    // during that window is invisible until the name is retyped — AND,
    // separately, this component's own render derives which numbered slot
    // to draw the (always-editable) name input in from where "self" ranks
    // among `players`; with the channel torn down self never appears in
    // that ordering while nameless, leaving no slot for the input to render
    // in at all. Subscribing once per room and never depending on self here
    // avoids both. retryToken is the one deliberate exception — see its own
    // comment above — bumping it forces exactly this teardown+resubscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, retryToken])

  // Keeps this tab's own presence entry in sync with `self` on the already-
  // joined channel from the effect above — track() to publish/update it in
  // place (name included, live on every keystroke), untrack() to remove it
  // without leaving the channel when self goes null (nameless — not "gone",
  // just not visibly present yet). Never a leave+rejoin: that pairing can
  // land the server-side leave and a later join out of order, briefly
  // leaving TWO presence metas under different keys for the same person —
  // the ghost duplicate-player/wrong-color bug this caused when a name
  // field updates self on every keystroke instead of once up front. Waits
  // for 'connected' so the very first call doesn't fire before the channel
  // has actually joined.
  //
  // track() itself is debounced: publishing on every single keystroke of a
  // live-editable name field sent a burst of several track() calls within
  // milliseconds while typing a whole name, and Realtime responded to that
  // burst by closing the channel outright (confirmed via the subscribe
  // callback's status — a genuine server-side rate limit, not something a
  // reconnect could just retry past, since retrying would immediately
  // trigger the same burst again). Waiting for a short pause in changes
  // before publishing keeps the update rate sane while still reading as
  // live once someone stops typing.
  const TRACK_DEBOUNCE_MS = 400
  const trackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (status !== 'connected') return
    if (trackTimerRef.current != null) {
      clearTimeout(trackTimerRef.current)
      trackTimerRef.current = null
    }
    if (self) {
      trackTimerRef.current = setTimeout(() => {
        void channelRef.current?.track(self)
      }, TRACK_DEBOUNCE_MS)
    } else {
      void channelRef.current?.untrack()
    }
    return () => {
      if (trackTimerRef.current != null) clearTimeout(trackTimerRef.current)
    }
  }, [self, status])

  const broadcastGameStarted = (
    names: string[],
    hostName: string,
    boardShapeId: BoardShapeId,
    gameRules: GameRules,
    customBoardCells?: BoardCell[],
    customBoardName?: string,
    clientIds?: string[],
    colorTokens?: PlayerColorToken[],
    customBoardBiomeOverrides?: Record<string, Biome>,
  ) => {
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'game-started',
      payload: {
        names,
        hostName,
        boardShapeId,
        gameRules,
        customBoardCells,
        customBoardName,
        clientIds,
        colorTokens,
        customBoardBiomeOverrides,
      },
    })
  }
  const broadcastDiceRolled = (payload: DiceRolledPayload) => {
    // Delivery result logged (not just discarded via `void` like every
    // other broadcast here) — chasing a rare stuck-discard-screen bug that
    // may trace back to a broadcast silently falling back to REST or timing
    // out. See debugLog.ts.
    void channelRef.current
      ?.send({ type: 'broadcast', event: 'DICE_ROLLED', payload })
      .then((result) => debugLog('broadcastDiceRolled result', { result, payload }))
  }
  const broadcastTurnPassed = (payload: TurnPassedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TURN_PASSED', payload })
  }
  const broadcastSettlementBuilt = (payload: SettlementBuiltPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'SETTLEMENT_BUILT', payload })
  }
  const broadcastCityBuilt = (payload: CityBuiltPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'CITY_BUILT', payload })
  }
  const broadcastRoadBuilt = (payload: RoadBuiltPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'ROAD_BUILT', payload })
  }
  const broadcastRobberMoved = (payload: RobberMovedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'ROBBER_MOVED', payload })
  }
  const broadcastKnightPlayed = (payload: KnightPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'KNIGHT_PLAYED', payload })
  }
  const broadcastRoadBuildingPlayed = (payload: RoadBuildingPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'ROAD_BUILDING_PLAYED', payload })
  }
  const broadcastPlentyPlayed = (payload: PlentyPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'PLENTY_PLAYED', payload })
  }
  const broadcastMonopolyPlayed = (payload: MonopolyPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'MONOPOLY_PLAYED', payload })
  }
  const broadcastResourceMonopolyPlayed = (payload: ResourceMonopolyPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'RESOURCE_MONOPOLY_PLAYED', payload })
  }
  const broadcastTradeMonopolyPlayed = (payload: TradeMonopolyPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TRADE_MONOPOLY_PLAYED', payload })
  }
  const broadcastTradeOffered = (payload: TradePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TRADE_OFFERED', payload })
  }
  const broadcastTradeAcceptRequest = (payload: TradePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TRADE_ACCEPT_REQUEST', payload })
  }
  const broadcastTradeResolved = (payload: TradePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TRADE_RESOLVED', payload })
  }
  const broadcastTradeCancelled = (payload: TradeCancelledPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TRADE_CANCELLED', payload })
  }
  const broadcastDiscardConfirmed = (payload: DiscardConfirmedPayload) => {
    // See broadcastDiceRolled above — same reasoning, same bug hunt.
    void channelRef.current
      ?.send({ type: 'broadcast', event: 'DISCARD_CONFIRMED', payload })
      .then((result) => debugLog('broadcastDiscardConfirmed result', { result, payload }))
  }
  const broadcastProgressDiscardConfirmed = (payload: ProgressDiscardConfirmedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'PROGRESS_DISCARD_CONFIRMED', payload })
  }
  const broadcastScienceFreeResourcePicked = (payload: ScienceFreeResourcePickedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'SCIENCE_FREE_RESOURCE_PICKED', payload })
  }
  const broadcastTrophyUpdated = (payload: TrophyUpdatedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'TROPHY_UPDATED', payload })
  }
  const broadcastNewGame = (payload: NewGamePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'NEW_GAME', payload })
  }
  const broadcastDevCardBought = (payload: DevCardBoughtPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'DEV_CARD_BOUGHT', payload })
  }
  const broadcastCityImprovementPurchased = (payload: CityImprovementPurchasedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'CITY_IMPROVEMENT_PURCHASED', payload })
  }
  const broadcastProgressCardsDrawn = (payload: ProgressCardsDrawnPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'PROGRESS_CARDS_DRAWN', payload })
  }
  const broadcastProgressCardPlayed = (payload: ProgressCardPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'PROGRESS_CARD_PLAYED', payload })
  }
  const broadcastMetropolisClaimed = (payload: MetropolisClaimedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'METROPOLIS_CLAIMED', payload })
  }
  const broadcastInventionSwapped = (payload: InventionSwappedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'INVENTION_SWAPPED', payload })
  }
  const broadcastBankTrade = (payload: BankTradePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'BANK_TRADE', payload })
  }
  const broadcastCommodityTraded = (payload: CommodityTradedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'COMMODITY_TRADED', payload })
  }
  const broadcastGuildDuesTaken = (payload: GuildDuesTakenPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'GUILD_DUES_TAKEN', payload })
  }
  const broadcastEspionageTaken = (payload: EspionageTakenPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'ESPIONAGE_TAKEN', payload })
  }
  const broadcastCommercialHarborPlayed = (payload: CommercialHarborPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'COMMERCIAL_HARBOR_PLAYED', payload })
  }
  const broadcastDiplomacyPlayed = (payload: DiplomacyPlayedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'DIPLOMACY_PLAYED', payload })
  }
  const broadcastMerchantMoved = (payload: MerchantMovedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'MERCHANT_MOVED', payload })
  }
  const broadcastKnightRecruited = (payload: KnightRecruitedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'KNIGHT_RECRUITED', payload })
  }
  const broadcastHoverChanged = (payload: HoverChangedPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'HOVER_CHANGED', payload })
  }
  const broadcastChatMessage = (payload: ChatMessagePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'CHAT_MESSAGE', payload })
  }

  return {
    players,
    status,
    // This tab's own stable presence key — matches the `id` the hook
    // attaches to each entry in `players` above, so a caller can find/filter
    // "which entry is me" via `p.id === clientId` instead of comparing
    // names (racy the instant a name can change while connected).
    clientId,
    broadcastGameStarted,
    broadcastDiceRolled,
    broadcastTurnPassed,
    broadcastSettlementBuilt,
    broadcastCityBuilt,
    broadcastRoadBuilt,
    broadcastRobberMoved,
    broadcastKnightPlayed,
    broadcastRoadBuildingPlayed,
    broadcastPlentyPlayed,
    broadcastMonopolyPlayed,
    broadcastResourceMonopolyPlayed,
    broadcastTradeMonopolyPlayed,
    broadcastTradeOffered,
    broadcastTradeAcceptRequest,
    broadcastTradeResolved,
    broadcastTradeCancelled,
    broadcastDiscardConfirmed,
    broadcastProgressDiscardConfirmed,
    broadcastScienceFreeResourcePicked,
    broadcastTrophyUpdated,
    broadcastNewGame,
    broadcastDevCardBought,
    broadcastCityImprovementPurchased,
    broadcastProgressCardsDrawn,
    broadcastProgressCardPlayed,
    broadcastMetropolisClaimed,
    broadcastInventionSwapped,
    broadcastBankTrade,
    broadcastCommodityTraded,
    broadcastGuildDuesTaken,
    broadcastEspionageTaken,
    broadcastCommercialHarborPlayed,
    broadcastDiplomacyPlayed,
    broadcastMerchantMoved,
    broadcastKnightRecruited,
    broadcastHoverChanged,
    broadcastChatMessage,
  }
}
