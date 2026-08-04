import { useEffect, useRef, useState } from 'react'
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabaseClient'
import type { ResourceType } from '../game/types'

export interface RoomPlayer {
  name: string
  isHost: boolean
  // Only meaningful on the host's own presence entry — the lobby size every
  // other client reads to know when the room is full.
  targetCount?: number
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
  // Whether this move should end the mover's turn. False when it came from
  // playing a Knight card (not broadcast in this phase either) — without
  // this, a receiving client's own robberMoveFromKnight flag would be
  // wrong and it would end the actor's turn when it shouldn't have.
  endsTurn: boolean
}

interface GameStartedPayload {
  names: string[]
}

export interface RoomChannelHandlers {
  onGameStarted?: (names: string[]) => void
  onDiceRolled?: (payload: DiceRolledPayload) => void
  onTurnPassed?: (payload: TurnPassedPayload) => void
  onSettlementBuilt?: (payload: SettlementBuiltPayload) => void
  onCityBuilt?: (payload: CityBuiltPayload) => void
  onRoadBuilt?: (payload: RoadBuiltPayload) => void
  onRobberMoved?: (payload: RobberMovedPayload) => void
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
    // a previous subscription while this one is still connecting.
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
      handlersRef.current.onGameStarted?.(payload.names)
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

  const broadcastGameStarted = (names: string[]) => {
    void channelRef.current?.send({ type: 'broadcast', event: 'game-started', payload: { names } })
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
  }
}
