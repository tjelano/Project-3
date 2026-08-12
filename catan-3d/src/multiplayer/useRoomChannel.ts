import { useEffect, useRef, useState } from 'react'
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabaseClient'
import type { DevCardType, GameRules, PlayerColorToken, ResourceType } from '../game/types'
import type { BoardCell, BoardShapeId } from '../data/hexBoard'

export interface RoomPlayer {
  name: string
  isHost: boolean
  // Only meaningful on the host's own presence entry — the lobby size every
  // other client reads to know when the room is full.
  targetCount?: number
  // Each player's own pick, live in the lobby — everyone else's presence
  // entries are what a joiner checks to avoid picking an already-taken color.
  colorToken?: PlayerColorToken
}

export type RoomConnectionStatus = 'connecting' | 'connected' | 'error'

export interface DiceRolledPayload {
  dice: [number, number]
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

export interface BankTradePayload {
  playerId: number
  give: ResourceType
  receive: ResourceType
  // The exchange rate actually applied — sent explicitly, trusted-apply,
  // rather than re-derived from the receiver's own copy of the trader's
  // port access (same reasoning as RoadBuiltPayload.isFreeRoad below).
  rate: number
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

export interface DiscardConfirmedPayload {
  playerId: number
  // Resource -> quantity tally, not a full resources object — the receiver
  // subtracts these from its OWN copy of the player's resources (trusted
  // apply), the same shape every other resource-mutating broadcast in this
  // file uses.
  counts: Partial<Record<ResourceType, number>>
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
  // The host's house-rules pick. Player colors are NOT carried here —
  // they're already visible to every client via each player's own
  // presence entry (RoomPlayer.colorToken), so re-broadcasting them would
  // just be a second copy that could drift.
  gameRules: GameRules
}

export interface RoomChannelHandlers {
  onGameStarted?: (
    names: string[],
    hostName: string,
    boardShapeId: BoardShapeId,
    gameRules: GameRules,
    customBoardCells?: BoardCell[],
    customBoardName?: string,
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
  // Host-only action: everyone resets to a fresh board and starting state,
  // same players and room.
  onNewGame?: (payload: NewGamePayload) => void
  onDevCardBought?: (payload: DevCardBoughtPayload) => void
  onBankTrade?: (payload: BankTradePayload) => void
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
  const [players, setPlayers] = useState<RoomPlayer[]>([])
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

  useEffect(() => {
    if (!roomCode || !self) return

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
      config: { presence: { key: self.name, enabled: true } },
    })
    channelRef.current = channel

    channel.on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState<RoomPlayer>()
      setPlayers(Object.values(state).flatMap((entries) => entries))
    })

    channel.on<GameStartedPayload>('broadcast', { event: 'game-started' }, ({ payload }) => {
      handlersRef.current.onGameStarted?.(
        payload.names,
        payload.hostName,
        payload.boardShapeId,
        payload.gameRules,
        payload.customBoardCells,
        payload.customBoardName,
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
    channel.on<NewGamePayload>('broadcast', { event: 'NEW_GAME' }, ({ payload }) => {
      handlersRef.current.onNewGame?.(payload)
    })
    channel.on<DevCardBoughtPayload>('broadcast', { event: 'DEV_CARD_BOUGHT' }, ({ payload }) => {
      handlersRef.current.onDevCardBought?.(payload)
    })
    channel.on<BankTradePayload>('broadcast', { event: 'BANK_TRADE' }, ({ payload }) => {
      handlersRef.current.onBankTrade?.(payload)
    })
    channel.on<HoverChangedPayload>('broadcast', { event: 'HOVER_CHANGED' }, ({ payload }) => {
      handlersRef.current.onHoverChanged?.(payload)
    })
    channel.on<ChatMessagePayload>('broadcast', { event: 'CHAT_MESSAGE' }, ({ payload }) => {
      handlersRef.current.onChatMessage?.(payload)
    })

    channel.subscribe((subStatus) => {
      if (subStatus === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
        void channel.track(self)
        setStatus('connected')
      } else if (
        subStatus === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
        subStatus === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
      ) {
        setStatus('error')
      }
    })

    return () => {
      void client.removeChannel(channel)
      channelRef.current = null
    }
    // `self` must be reference-stable across renders that don't actually
    // change it (memoized by the caller) — otherwise this would reconnect
    // to Realtime on every render instead of only when the room identity
    // genuinely changes.
  }, [roomCode, self])

  const broadcastGameStarted = (
    names: string[],
    hostName: string,
    boardShapeId: BoardShapeId,
    gameRules: GameRules,
    customBoardCells?: BoardCell[],
    customBoardName?: string,
  ) => {
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'game-started',
      payload: { names, hostName, boardShapeId, gameRules, customBoardCells, customBoardName },
    })
  }
  const broadcastDiceRolled = (payload: DiceRolledPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'DICE_ROLLED', payload })
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
    void channelRef.current?.send({ type: 'broadcast', event: 'DISCARD_CONFIRMED', payload })
  }
  const broadcastNewGame = (payload: NewGamePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'NEW_GAME', payload })
  }
  const broadcastDevCardBought = (payload: DevCardBoughtPayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'DEV_CARD_BOUGHT', payload })
  }
  const broadcastBankTrade = (payload: BankTradePayload) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'BANK_TRADE', payload })
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
    broadcastTradeOffered,
    broadcastTradeAcceptRequest,
    broadcastTradeResolved,
    broadcastTradeCancelled,
    broadcastDiscardConfirmed,
    broadcastNewGame,
    broadcastDevCardBought,
    broadcastBankTrade,
    broadcastHoverChanged,
    broadcastChatMessage,
  }
}
