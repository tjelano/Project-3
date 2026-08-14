import { useState } from 'react'
import joinRoomMenuUrl from '../../assets/menu/join-room-menu.png'
import selectorBorderUrl from '../../assets/menu/selector-border.png'
import { useHoverActive } from './useHoverActive'
import { loadMatchSnapshot, type MatchSnapshot } from '../../multiplayer/matchSnapshot'
import { normalizePlayerName, normalizeRoomCode } from '../../multiplayer/roomCode'
import type { GameStartInfo } from './StartScreen'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

// Every number here is a % of join-room-menu.png's own 1536x1024 canvas —
// edit directly to line a field up with the art. No live editor — just
// change the numbers and check the result in the browser.
const LAYOUT = {
  nameField: { left: 14, top: 20, width: 72, height: 13 } satisfies Rect,
  roomCodeField: { left: 14, top: 44, width: 72, height: 14 } satisfies Rect,
  joinButton: { left: 16, top: 63.3, width: 68, height: 16 } satisfies Rect,
  backButton: { left: 38, top: 78, width: 24, height: 8 } satisfies Rect,
  // How far the glow frame around the Join button extends past its own
  // edges, in % of the button's own size — same selector-border.png asset
  // used elsewhere as a "this is the primary action" highlight.
  joinButtonSelectorInsetXPct: 3,
  joinButtonSelectorInsetYPct: 40,
}

// Opacity at rest vs. while hovered/focused.
const JOIN_BUTTON_GLOW_IDLE_OPACITY = 0
const JOIN_BUTTON_GLOW_ACTIVE_OPACITY = 1

function rectStyle({ left, top, width, height }: Rect) {
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }
}

// Extends selector-border.png past its own box's edges by the given %, same
// pattern GameSetupMenu.tsx's selector overlays use — `inset` alone doesn't
// resize a replaced image element, only repositions it, so this computes
// explicit left/top/width/height instead.
function selectorOverlayStyle(insetXPct: number, insetYPct: number) {
  return {
    left: `-${insetXPct}%`,
    top: `-${insetYPct}%`,
    width: `calc(100% + ${insetXPct * 2}%)`,
    height: `calc(100% + ${insetYPct * 2}%)`,
    maxWidth: 'none',
  }
}

/**
 * Ornate popup built directly on JoinRoomMenu.png — real inputs/buttons sit
 * as transparent hit-targets positioned (in % of the image, see LAYOUT
 * above) over the painted fields, rather than recreating the frame in CSS.
 * Same asset strategy as GameSetupMenu.tsx.
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
  const joinButtonGlow = useHoverActive()
  const [name, setName] = useState('')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [checking, setChecking] = useState(false)
  // Set only when the typed name doesn't match any player already in an
  // in-progress match at that code — same reconnect ambiguity OnlineSetup's
  // own join flow handles, kept here as a small unstyled bridge rather than
  // a new mock nobody's asked for yet.
  const [reconnectPicker, setReconnectPicker] = useState<{ roomCode: string; snapshot: MatchSnapshot } | null>(null)

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

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md animate-veil-in"
      style={{
        background: 'radial-gradient(circle at center, rgba(12,12,14,0.55) 0%, rgba(12,12,14,0.4) 40%, rgba(12,12,14,0) 72%)',
        maskImage: 'radial-gradient(circle at center, black 0%, black 40%, transparent 72%)',
        WebkitMaskImage: 'radial-gradient(circle at center, black 0%, black 40%, transparent 72%)',
      }}
    >
      {reconnectPicker ? (
        <div className="w-80 rounded-2xl border border-glass-border bg-glass p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl animate-victory-in">
          <p className="font-body text-xs text-white/70">
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
        <div className="relative w-full max-w-md animate-victory-in">
          <div className="relative aspect-[1536/1024] w-full">
            <img src={joinRoomMenuUrl} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />

            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              maxLength={20}
              className="absolute bg-transparent text-center font-body text-sm text-white placeholder:text-white/30 focus:outline-none"
              style={rectStyle(LAYOUT.nameField)}
            />
            <input
              type="text"
              value={roomCodeInput}
              onChange={(event) => setRoomCodeInput(normalizeRoomCode(event.target.value))}
              placeholder="B7F3"
              maxLength={4}
              className="absolute bg-transparent text-center font-data text-lg tracking-[0.4em] text-white uppercase placeholder:text-white/30 focus:outline-none"
              style={rectStyle(LAYOUT.roomCodeField)}
            />
            <button
              type="button"
              disabled={!canSubmit}
              onClick={handleJoin}
              className="absolute outline-none transition-transform hover:scale-[1.02] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              style={rectStyle(LAYOUT.joinButton)}
              {...joinButtonGlow.handlers}
            >
              <img
                src={selectorBorderUrl}
                alt=""
                className="pointer-events-none absolute transition-opacity"
                style={{
                  ...selectorOverlayStyle(LAYOUT.joinButtonSelectorInsetXPct, LAYOUT.joinButtonSelectorInsetYPct),
                  opacity: joinButtonGlow.isActive ? JOIN_BUTTON_GLOW_ACTIVE_OPACITY : JOIN_BUTTON_GLOW_IDLE_OPACITY,
                }}
                draggable={false}
              />
              {checking && (
                <span className="absolute inset-0 flex items-center justify-center font-display text-sm tracking-[0.1em] text-gold uppercase">
                  Checking…
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="absolute outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
              style={rectStyle(LAYOUT.backButton)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
