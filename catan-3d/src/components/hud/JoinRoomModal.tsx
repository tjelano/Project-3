import { useState } from 'react'
import { useModalDialog } from '../../hooks/useModalDialog'
import { loadMatchSnapshot, type MatchSnapshot } from '../../multiplayer/matchSnapshot'
import { normalizePlayerName, normalizeRoomCode } from '../../multiplayer/roomCode'
import { INK, INK_MUTED, PARCHMENT_INPUT, PARCHMENT_BUTTON } from './parchmentTheme'
import type { GameStartInfo } from './StartScreen'

// Prototype: reusing the existing .expansion-card parchment-panel art
// (PanelforExpansionAndHouserules.png) as this modal's whole panel, instead
// of drawing bespoke book art for every remaining pre-game screen — see if
// the same card frame reads fine stretched to a bigger, denser panel before
// committing more art production to RegionSelectMenu/RoomLobby.

/**
 * Component-based rebuild — real inputs/buttons in a panel, matching
 * GameSetupMenu's open-book/parchment visual language, instead of
 * transparent hit-targets positioned over join-room-menu.png's painted
 * fields (or, before that, the dark-navy/gold glass panel this project's
 * other not-yet-migrated screens still use).
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
  const [reconnectPicker, setReconnectPicker] = useState<{ roomCode: string; snapshot: MatchSnapshot } | null>(
    null,
  )
  // Escape steps back one level in the reconnect picker (matching its own
  // "Back" button) before closing the whole modal, same as the main form.
  // A single dialog persists across the reconnectPicker toggle below — only
  // its CONTENT swaps, not the element itself, so useModalDialog's
  // showModal()-once-on-mount effect never needs to re-fire (the old
  // per-hook doc comment about needing a callback ref for this exact swap
  // no longer applies once the swap happens inside the dialog, not to it).
  const dialogRef = useModalDialog<HTMLDialogElement>(reconnectPicker ? () => setReconnectPicker(null) : onClose)

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
  // just covered where this modal's own panel sits on top of it. Explicit
  // backdrop:bg-transparent since a native <dialog>'s default UA backdrop
  // isn't transparent (a faint dim in most browsers) — border-0/bg-
  // transparent/p-0 strip the dialog element's own default chrome too,
  // since all real styling comes from expansion-card on the content below.
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={reconnectPicker ? 'join-room-reconnect-heading' : undefined}
      aria-label={reconnectPicker ? undefined : 'Join room'}
      className="animate-veil-in m-auto border-0 bg-transparent p-0 backdrop:bg-transparent"
    >
      {reconnectPicker ? (
        <div className="expansion-card animate-victory-in w-80 px-5 py-5 text-center">
          <p id="join-room-reconnect-heading" className={`font-body text-xs ${INK_MUTED}`}>
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
                className={`${PARCHMENT_BUTTON} w-full py-2.5 font-display text-sm font-semibold`}
              >
                {playerName}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setReconnectPicker(null)}
            className={`mt-4 font-body text-[10px] tracking-[0.15em] uppercase ${INK_MUTED} hover:text-[#2b1810]`}
          >
            Back
          </button>
        </div>
      ) : (
        <div className="expansion-card animate-victory-in w-full max-w-sm px-6 py-6">
          <h2 className={`text-center font-display text-base tracking-[0.2em] uppercase ${INK}`}>
            Join Existing Game
          </h2>
          <div className="mx-auto mt-3 h-px w-16 bg-[#8a6d47]/40" />

          <div className="mt-5 flex flex-col gap-3">
            <label className="block">
              <span className={`font-body text-[11px] tracking-[0.15em] uppercase ${INK_MUTED}`}>Your Name</span>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                aria-label="Your name"
                maxLength={20}
                className={PARCHMENT_INPUT}
              />
            </label>
            <label className="block">
              <span className={`font-body text-[11px] tracking-[0.15em] uppercase ${INK_MUTED}`}>Room Code</span>
              <input
                type="text"
                value={roomCodeInput}
                onChange={(event) => setRoomCodeInput(normalizeRoomCode(event.target.value))}
                placeholder="B7F3"
                aria-label="Room code"
                maxLength={4}
                className={`${PARCHMENT_INPUT} room-code-font text-center text-lg tracking-[0.4em] uppercase`}
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onClose}
              className={`${PARCHMENT_BUTTON} py-2.5 font-display text-sm tracking-[0.1em] uppercase`}
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleJoin}
              className={`${PARCHMENT_BUTTON} py-2.5 font-display text-sm tracking-[0.15em] uppercase disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {checking ? 'Checking…' : 'Join'}
            </button>
          </div>
        </div>
      )}
    </dialog>
  )
}
