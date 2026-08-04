import { useEffect, useRef, useState } from 'react'
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from '@supabase/supabase-js'
import { getSupabaseClient } from '../lib/supabaseClient'

export interface RoomPlayer {
  name: string
  isHost: boolean
  // Only meaningful on the host's own presence entry — the lobby size every
  // other client reads to know when the room is full.
  targetCount?: number
}

export type RoomConnectionStatus = 'connecting' | 'connected' | 'error'

interface GameStartedPayload {
  names: string[]
}

/**
 * Binds to one Supabase Realtime channel per room code, combining two of its
 * primitives for two different jobs:
 *
 *  - Presence tracks WHO is currently in the room. A fresh joiner sees the
 *    full existing roster immediately on sync, unlike Broadcast, whose
 *    messages only reach clients that were already subscribed when sent —
 *    Broadcast alone would silently drop anyone who joined late.
 *  - Broadcast is the general "send/receive live game payload events" wire
 *    the brief asked for. Used here for the host's game-started signal; the
 *    same channel is what later phases would layer dice-roll / building-
 *    placement events onto, rather than opening a second connection.
 */
export function useRoomChannel(
  roomCode: string | null,
  self: RoomPlayer | null,
  onGameStarted: (names: string[]) => void,
) {
  const [players, setPlayers] = useState<RoomPlayer[]>([])
  const [status, setStatus] = useState<RoomConnectionStatus>('connecting')
  const channelRef = useRef<RealtimeChannel | null>(null)

  // Ref rather than a dependency: onGameStarted is a fresh closure every
  // render in the caller, and re-subscribing the channel on every render
  // would drop and re-join presence constantly. Updated in its own effect —
  // mutating a ref during render (rather than in an effect or handler) is
  // unsafe, since render can be discarded or re-run by React at any time.
  const onGameStartedRef = useRef(onGameStarted)
  useEffect(() => {
    onGameStartedRef.current = onGameStarted
  })

  useEffect(() => {
    if (!roomCode || !self) return

    // Reset synchronously so the lobby never shows a stale roster from a
    // previous room while the new subscription is still connecting.
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
      onGameStartedRef.current(payload.names)
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

  return { players, status, broadcastGameStarted }
}
