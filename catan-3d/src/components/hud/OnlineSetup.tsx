import { useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { generateRoomCode, normalizeRoomCode } from '../../multiplayer/roomCode'
import { useRoomChannel, type RoomPlayer } from '../../multiplayer/useRoomChannel'
import type { GameStartInfo } from './StartScreen'

type OnlineMode = 'choose' | 'host' | 'join' | 'lobby'

const FIELD_CLASS =
  'w-full rounded-lg border border-glass-border bg-white/5 px-3 py-2 text-center font-body text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none'
const PRIMARY_BUTTON_CLASS =
  'w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100'
const SECONDARY_BUTTON_CLASS =
  'mt-1 font-body text-[10px] tracking-[0.15em] text-white/40 uppercase hover:text-white/70'

export function OnlineSetup({ onStart }: { onStart: (info: GameStartInfo) => void }) {
  const [mode, setMode] = useState<OnlineMode>('choose')
  const [selfName, setSelfName] = useState('')
  const [targetCount, setTargetCount] = useState(3)
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)

  // Only becomes non-null once a room is actually chosen — presence tracking
  // (and therefore the Realtime connection itself) only opens at that point.
  // Memoized so its reference only changes when a field actually does —
  // useRoomChannel depends on this object directly, and a fresh object every
  // render would reconnect to Realtime on every render.
  const self: RoomPlayer | null = useMemo(
    () => (mode === 'lobby' && roomCode ? { name: selfName, isHost, targetCount: isHost ? targetCount : undefined } : null),
    [mode, roomCode, selfName, isHost, targetCount],
  )

  const { players, status, broadcastGameStarted } = useRoomChannel(roomCode, self, {
    onGameStarted: (names) => {
      if (!roomCode) return
      onStart({ playerCount: names.length, names, online: { roomCode, localPlayerName: selfName } })
    },
  })

  if (!isSupabaseConfigured()) {
    return (
      <div className="mt-8 rounded-lg border border-player-1/40 bg-player-1/10 px-4 py-3 text-left">
        <p className="font-body text-xs text-player-1/90">
          Online Multiplayer isn't configured yet — set <span className="font-data">VITE_SUPABASE_URL</span> in{' '}
          <span className="font-data">.env.local</span> to enable it.
        </p>
      </div>
    )
  }

  if (mode === 'choose') {
    return (
      <div className="mt-8 flex flex-col gap-3">
        <button type="button" onClick={() => setMode('host')} className={PRIMARY_BUTTON_CLASS}>
          Host Game
        </button>
        <button
          type="button"
          onClick={() => setMode('join')}
          className="w-full rounded-lg border border-glass-border bg-white/5 py-2.5 font-display text-sm font-semibold text-white transition-colors hover:border-gold/50 hover:text-gold"
        >
          Join Game
        </button>
      </div>
    )
  }

  if (mode === 'host') {
    return (
      <div className="mt-8 flex flex-col gap-3 text-left">
        <label className="font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">Your Name</label>
        <input
          type="text"
          value={selfName}
          onChange={(event) => setSelfName(event.target.value)}
          placeholder="Your name"
          maxLength={20}
          className={FIELD_CLASS}
        />
        <label className="mt-2 font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">Player Count</label>
        <select
          value={targetCount}
          onChange={(event) => setTargetCount(Number(event.target.value))}
          className={FIELD_CLASS}
        >
          <option value={2} className="bg-board-navy">
            2 Players
          </option>
          <option value={3} className="bg-board-navy">
            3 Players
          </option>
          <option value={4} className="bg-board-navy">
            4 Players
          </option>
        </select>
        <button
          type="button"
          disabled={!selfName.trim()}
          onClick={() => {
            setRoomCode(generateRoomCode())
            setIsHost(true)
            setMode('lobby')
          }}
          className={`mt-2 ${PRIMARY_BUTTON_CLASS}`}
        >
          Create Room
        </button>
        <button type="button" onClick={() => setMode('choose')} className={SECONDARY_BUTTON_CLASS}>
          Back
        </button>
      </div>
    )
  }

  if (mode === 'join') {
    return (
      <div className="mt-8 flex flex-col gap-3 text-left">
        <label className="font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">Your Name</label>
        <input
          type="text"
          value={selfName}
          onChange={(event) => setSelfName(event.target.value)}
          placeholder="Your name"
          maxLength={20}
          className={FIELD_CLASS}
        />
        <label className="mt-2 font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">Room Code</label>
        <input
          type="text"
          value={roomCodeInput}
          onChange={(event) => setRoomCodeInput(normalizeRoomCode(event.target.value))}
          placeholder="B7F3"
          maxLength={4}
          className={`${FIELD_CLASS} font-data text-lg tracking-[0.4em] uppercase`}
        />
        <button
          type="button"
          disabled={!selfName.trim() || roomCodeInput.length !== 4}
          onClick={() => {
            setRoomCode(roomCodeInput)
            setIsHost(false)
            setMode('lobby')
          }}
          className={`mt-2 ${PRIMARY_BUTTON_CLASS}`}
        >
          Join Room
        </button>
        <button type="button" onClick={() => setMode('choose')} className={SECONDARY_BUTTON_CLASS}>
          Back
        </button>
      </div>
    )
  }

  // mode === 'lobby'
  // Only the host knows the target count directly (it set it) — everyone
  // else reads it back out of the host's own presence entry.
  const knownTargetCount = isHost ? targetCount : players.find((p) => p.isHost)?.targetCount
  const isFull = knownTargetCount != null && players.length === knownTargetCount

  return (
    <div className="mt-8 flex flex-col gap-3 text-left">
      <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-center">
        <p className="font-body text-[10px] tracking-[0.2em] text-gold/70 uppercase">Room Code</p>
        <p className="font-display text-3xl tracking-[0.3em] text-gold">{roomCode}</p>
      </div>
      <p className="text-center font-body text-[10px] tracking-[0.15em] text-white/40 uppercase">
        {status === 'connecting' && 'Connecting…'}
        {status === 'error' && 'Connection error — check your Supabase configuration.'}
        {status === 'connected' &&
          (knownTargetCount != null ? `${players.length} / ${knownTargetCount} players` : 'Waiting for host…')}
      </p>
      <div className="flex flex-col gap-1.5">
        {players.map((player) => (
          <div key={player.name} className="flex items-center justify-between rounded-full bg-white/5 px-3 py-1.5">
            <span className="font-body text-sm text-white">{player.name}</span>
            {player.isHost && (
              <span className="font-body text-[9px] tracking-[0.1em] text-gold/70 uppercase">Host</span>
            )}
          </div>
        ))}
      </div>
      {isHost ? (
        <button
          type="button"
          disabled={!isFull}
          onClick={() => {
            const names = players.map((player) => player.name)
            broadcastGameStarted(names)
            onStart({ playerCount: names.length, names, online: { roomCode: roomCode!, localPlayerName: selfName } })
          }}
          className={`mt-1 ${PRIMARY_BUTTON_CLASS}`}
        >
          Start Game
        </button>
      ) : (
        <p className="mt-1 text-center font-body text-[10px] tracking-[0.1em] text-white/40 uppercase">
          Waiting for the host to start…
        </p>
      )}
    </div>
  )
}
