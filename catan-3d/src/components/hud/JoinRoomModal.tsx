import { useState } from 'react'
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap'
import { loadMatchSnapshot, type MatchSnapshot } from '../../multiplayer/matchSnapshot'
import { normalizePlayerName, normalizeRoomCode } from '../../multiplayer/roomCode'
import type { GameStartInfo } from './StartScreen'

/**
 * Component-based rebuild — real inputs/buttons in a glass panel, matching
 * GameSetupMenu's visual language, instead of transparent hit-targets
 * positioned over join-room-menu.png's painted fields.
 */
export function JoinRoomModal({
  onClose,
  onStart,
  onJoinLobby,
}: {
  onClose: () => void
  onStart: (info: GameStartInfo) => void
  // A code with no in-progress match falls back to waiting in RoomLobby's
  // joiner view — see StartScreen.tsx.
  onJoinLobby: (seed: { roomCode: string; selfName: string }) => void
}) {
  const [name, setName] = useState('')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [checking, setChecking] = useState(false)
  // Set only when the typed name doesn't match any player already in an
  // in-progress match at that code — same reconnect ambiguity OnlineSetup's
  // own join flow handles, kept here as a small unstyled bridge rather than
  // a new mock nobody's asked for yet.
  const [reconnectPicker, setReconnectPicker] = useState<{ roomCode: string; snapshot: MatchSnapshot } | null>(null)
  // Escape steps back one level in the reconnect picker (matching its own
  // "Back" button) before closing the whole modal, same as the main form.
  const dialogRef = useModalFocusTrap<HTMLDivElement>(reconnectPicker ? () => setReconnectPicker(null) : onClose)

  const canSubmit = name.trim().length > 0 && roomCodeInput.length === 4 && !checking

  const handleJoin = async () => {
    if (!canSubmit) return
    setChecking(true)
    // A match already saved under this code means the game is already
    // running (or was, before everyone disconnected) — resume straight into
    // it instead of dropping the reconnecting player into an empty lobby.
    const snapshot = await loadMatchSnapshot(roomCodeInput)
    setChecking(false)
    if (snapshot) {
      const matchesExisting = snapshot.playerNames.some(
        (candidate) => normalizePlayerName(candidate) === normalizePlayerName(name),
      )
      if (!matchesExisting) {
        setReconnectPicker({ roomCode: roomCodeInput, snapshot })
        return
      }
      onStart({
        playerCount: snapshot.playerNames.length,
        names: snapshot.playerNames,
        online: {
          roomCode: roomCodeInput,
          localPlayerName: name,
          isHost: normalizePlayerName(name) === normalizePlayerName(snapshot.hostName),
        },
        snapshot,
      })
      return
    }
    onJoinLobby({ roomCode: roomCodeInput, selfName: name })
  }

  // No dim/blur overlay — GameSetupMenu underneath stays fully visible,
  // just covered where this modal's own panel sits on top of it.
  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center animate-veil-in">
      {reconnectPicker ? (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="join-room-reconnect-heading"
          tabIndex={-1}
          className="w-80 rounded-2xl border border-glass-border bg-board-navy/95 p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-victory-in"
        >
          <p id="join-room-reconnect-heading" className="font-body text-xs text-white/70">
            No one named &ldquo;{name}&rdquo; is in this room. Which player are you?
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {reconnectPicker.snapshot.playerNames.map((playerName) => (
              <button
                key={playerName}
                type="button"
                onClick={() => {
                  const snapshot = reconnectPicker.snapshot
                  onStart({
                    playerCount: snapshot.playerNames.length,
                    names: snapshot.playerNames,
                    online: {
                      roomCode: reconnectPicker.roomCode,
                      localPlayerName: playerName,
                      isHost: normalizePlayerName(playerName) === normalizePlayerName(snapshot.hostName),
                    },
                    snapshot,
                  })
                }}
                className="w-full rounded-lg border border-glass-border bg-white/5 py-2.5 font-display text-sm font-semibold text-white transition-colors hover:border-gold/50 hover:text-gold"
              >
                {playerName}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReconnectPicker(null)}
            className="mt-4 font-body text-[10px] tracking-[0.15em] text-white/40 uppercase hover:text-white/70"
          >
            Back
          </button>
        </div>
      ) : (
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-label="Join room"
          tabIndex={-1}
          className="glow-gold-lift w-full max-w-sm animate-victory-in rounded-2xl border border-glass-border bg-board-navy/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        >
          <h2 className="text-center font-display text-base tracking-[0.2em] text-gold uppercase">Join Existing Game</h2>
          <div className="mx-auto mt-3 h-px w-16 bg-gold/40" />

          <div className="mt-5 flex flex-col gap-3">
            <label className="block">
              <span className="font-body text-[11px] tracking-[0.15em] text-white/40 uppercase">Your Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                aria-label="Your name"
                maxLength={20}
                className="mt-1 w-full rounded-lg border border-glass-border bg-white/5 px-3 py-2.5 font-body text-sm text-white placeholder:text-white/30 focus:border-gold/50 focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="font-body text-[11px] tracking-[0.15em] text-white/40 uppercase">Room Code</span>
              <input
                type="text"
                value={roomCodeInput}
                onChange={(event) => setRoomCodeInput(normalizeRoomCode(event.target.value))}
                placeholder="B7F3"
                aria-label="Room code"
                maxLength={4}
                className="mt-1 w-full rounded-lg border border-glass-border bg-white/5 px-3 py-2.5 text-center font-data text-lg tracking-[0.4em] text-white uppercase placeholder:text-white/30 focus:border-gold/50 focus:outline-none"
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-glass-border py-2.5 font-display text-sm tracking-[0.1em] text-white/70 uppercase transition-colors hover:border-gold/40 hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleJoin}
              className="glow-gold rounded-lg border border-gold/60 bg-gold/20 py-2.5 font-display text-sm tracking-[0.15em] text-gold uppercase transition-transform hover:scale-[1.02] hover:bg-gold/30 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
            >
              {checking ? 'Checking…' : 'Join'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
