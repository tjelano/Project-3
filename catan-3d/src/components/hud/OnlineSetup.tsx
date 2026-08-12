import { useMemo, useState } from 'react'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { generateRoomCode, normalizePlayerName, normalizeRoomCode } from '../../multiplayer/roomCode'
import { useRoomChannel, type RoomPlayer } from '../../multiplayer/useRoomChannel'
import { loadMatchSnapshot, type MatchSnapshot } from '../../multiplayer/matchSnapshot'
import { BOARD_SHAPE_LABELS, type BoardShapeId } from '../../data/hexBoard'
import { loadCustomBoardShapes, saveCustomBoardShape, type CustomBoardShape } from '../../data/customBoardShapes'
import { BoardShapeEditor } from './BoardShapeEditor'
import { HouseRulesEditor, DEFAULT_GAME_RULES } from './HouseRulesEditor'
import { CollapsibleSection } from './CollapsibleSection'
import { PLAYER_COLORS, type GameRules, type PlayerColorToken } from '../../game/types'
import type { GameStartInfo } from './StartScreen'

const CREATE_SHAPE_VALUE = '__create__'
const ALL_COLOR_TOKENS: PlayerColorToken[] = [
  'player-1',
  'player-2',
  'player-3',
  'player-4',
  'player-5',
  'player-6',
]

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
  // Either a built-in BoardShapeId, or a saved custom shape's own id —
  // resolved against customShapes when the host actually starts the game.
  const [selectedShapeValue, setSelectedShapeValue] = useState<string>('standard')
  const [customShapes, setCustomShapes] = useState<CustomBoardShape[]>(() => loadCustomBoardShapes())
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  const [gameRules, setGameRules] = useState<GameRules>(DEFAULT_GAME_RULES)
  // The LOCAL player's own pick — every other seat's color comes back
  // through their own presence entry (RoomPlayer.colorToken), same as
  // their name does. Defaults to the first color; changed live from the
  // lobby screen once a room exists.
  const [myColor, setMyColor] = useState<PlayerColorToken>('player-1')
  const [roomCodeInput, setRoomCodeInput] = useState('')
  const [roomCode, setRoomCode] = useState<string | null>(null)
  const [isHost, setIsHost] = useState(false)
  // True while checking whether roomCodeInput already has a match in
  // progress — a real network round-trip, so Join Room needs its own
  // pending state rather than assuming the check is instant.
  const [joinChecking, setJoinChecking] = useState(false)
  // Set only when Join Room finds a match already in progress AND the typed
  // name doesn't match any of its players — e.g. a reconnecting player who
  // no longer remembers the exact name they originally joined with. Typing
  // a name that doesn't match resolves to no player at all downstream
  // (findPlayerIndexByName in App.tsx), silently locking them out of ever
  // taking their own turn. Picking from the room's actual names sidesteps
  // that entirely instead of asking them to somehow type it correctly.
  const [reconnectPicker, setReconnectPicker] = useState<{ roomCode: string; snapshot: MatchSnapshot } | null>(null)

  // Only becomes non-null once a room is actually chosen — presence tracking
  // (and therefore the Realtime connection itself) only opens at that point.
  // Memoized so its reference only changes when a field actually does —
  // useRoomChannel depends on this object directly, and a fresh object every
  // render would reconnect to Realtime on every render.
  const self: RoomPlayer | null = useMemo(
    () =>
      mode === 'lobby' && roomCode
        ? { name: selfName, isHost, targetCount: isHost ? targetCount : undefined, colorToken: myColor }
        : null,
    [mode, roomCode, selfName, isHost, targetCount, myColor],
  )

  const { players, status, broadcastGameStarted } = useRoomChannel(roomCode, self, {
    onGameStarted: (names, hostName, receivedBoardShapeId, receivedGameRules, receivedCustomCells, receivedCustomName) => {
      if (!roomCode) return
      onStart({
        playerCount: names.length,
        names,
        // Falls back by seat order if a player somehow started the match
        // without ever picking (shouldn't happen — myColor always defaults
        // to 'player-1' — but createInitialPlayers needs a real token for
        // every seat regardless).
        colorTokens: names.map(
          (name, index) => players.find((p) => p.name === name)?.colorToken ?? ALL_COLOR_TOKENS[index % ALL_COLOR_TOKENS.length],
        ),
        gameRules: receivedGameRules,
        boardShapeId: receivedBoardShapeId,
        customBoardCells: receivedCustomCells,
        customBoardName: receivedCustomName,
        online: { roomCode, localPlayerName: selfName, isHost: normalizePlayerName(selfName) === normalizePlayerName(hostName) },
      })
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

  if (reconnectPicker) {
    const { roomCode: pickedRoomCode, snapshot } = reconnectPicker
    return (
      <div className="mt-8 flex flex-col gap-3 text-left">
        <p className="text-center font-body text-xs text-white/70">
          No one named "{selfName}" is in this room. Which player are you?
        </p>
        <div className="flex flex-col gap-2">
          {snapshot.playerNames.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                onStart({
                  playerCount: snapshot.playerNames.length,
                  names: snapshot.playerNames,
                  online: {
                    roomCode: pickedRoomCode,
                    localPlayerName: name,
                    isHost: normalizePlayerName(name) === normalizePlayerName(snapshot.hostName),
                  },
                  snapshot,
                })
              }}
              className="w-full rounded-lg border border-glass-border bg-white/5 py-2.5 font-display text-sm font-semibold text-white transition-colors hover:border-gold/50 hover:text-gold"
            >
              {name}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setReconnectPicker(null)} className={SECONDARY_BUTTON_CLASS}>
          Back
        </button>
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
          <option value={5} className="bg-board-navy">
            5 Players
          </option>
          <option value={6} className="bg-board-navy">
            6 Players
          </option>
        </select>
        <label className="mt-2 font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">Board Shape</label>
        <select
          value={selectedShapeValue}
          onChange={(event) => {
            if (event.target.value === CREATE_SHAPE_VALUE) {
              setIsEditorOpen(true)
              return
            }
            setSelectedShapeValue(event.target.value)
          }}
          className={FIELD_CLASS}
        >
          {Object.entries(BOARD_SHAPE_LABELS).map(([id, label]) => (
            <option key={id} value={id} className="bg-board-navy">
              {label}
            </option>
          ))}
          {customShapes.map((shape) => (
            <option key={shape.id} value={shape.id} className="bg-board-navy">
              {shape.name}
            </option>
          ))}
          <option value={CREATE_SHAPE_VALUE} className="bg-board-navy text-gold">
            + Create Custom Shape…
          </option>
        </select>
        {isEditorOpen && (
          <BoardShapeEditor
            onClose={() => setIsEditorOpen(false)}
            onSave={(shape) => {
              const next = saveCustomBoardShape(shape)
              setCustomShapes(next)
              setSelectedShapeValue(shape.id)
              setIsEditorOpen(false)
            }}
          />
        )}
        <CollapsibleSection icon="📜" label="House Rules">
          <HouseRulesEditor rules={gameRules} onChange={setGameRules} />
        </CollapsibleSection>
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
          disabled={!selfName.trim() || roomCodeInput.length !== 4 || joinChecking}
          onClick={async () => {
            setJoinChecking(true)
            // A match already saved under this code means the game is
            // already running (or was, before everyone disconnected) — skip
            // the lobby entirely and resume straight into it, rather than
            // dropping the reconnecting player into an empty "waiting for
            // host" screen for a host who already started playing.
            const snapshot = await loadMatchSnapshot(roomCodeInput)
            setJoinChecking(false)
            if (snapshot) {
              const matchesExisting = snapshot.playerNames.some(
                (candidate) => normalizePlayerName(candidate) === normalizePlayerName(selfName),
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
                  localPlayerName: selfName,
                  isHost: normalizePlayerName(selfName) === normalizePlayerName(snapshot.hostName),
                },
                snapshot,
              })
              return
            }
            setRoomCode(roomCodeInput)
            setIsHost(false)
            setMode('lobby')
          }}
          className={`mt-2 ${PRIMARY_BUTTON_CLASS}`}
        >
          {joinChecking ? 'Checking…' : 'Join Room'}
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
        {players.map((player) => {
          const isSelf = normalizePlayerName(player.name) === normalizePlayerName(selfName)
          const takenByOther = new Set(
            players.filter((p) => p !== player).map((p) => p.colorToken).filter((c): c is PlayerColorToken => c != null),
          )
          return (
            <div key={player.name} className="flex items-center justify-between gap-2 rounded-full bg-white/5 px-3 py-1.5">
              <span className="font-body text-sm text-white">{player.name}</span>
              <div className="flex items-center gap-2">
                {player.isHost && (
                  <span className="font-body text-[9px] tracking-[0.1em] text-gold/70 uppercase">Host</span>
                )}
                {isSelf ? (
                  <select
                    value={myColor}
                    onChange={(event) => setMyColor(event.target.value as PlayerColorToken)}
                    style={{ color: PLAYER_COLORS[myColor] }}
                    className="rounded-md border border-glass-border bg-white/5 px-1.5 py-0.5 font-body text-xs font-semibold focus:border-gold/60 focus:outline-none"
                  >
                    {ALL_COLOR_TOKENS.map((token) => (
                      <option
                        key={token}
                        value={token}
                        disabled={takenByOther.has(token)}
                        className="bg-board-navy"
                        style={{ color: PLAYER_COLORS[token] }}
                      >
                        ●
                      </option>
                    ))}
                  </select>
                ) : (
                  player.colorToken && (
                    <span
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: PLAYER_COLORS[player.colorToken] }}
                    />
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>
      {isHost ? (
        <button
          type="button"
          disabled={!isFull}
          onClick={() => {
            const names = players.map((player) => player.name)
            const customShape = customShapes.find((shape) => shape.id === selectedShapeValue)
            const boardShapeId = customShape ? undefined : (selectedShapeValue as BoardShapeId)
            broadcastGameStarted(names, selfName, boardShapeId ?? 'standard', gameRules, customShape?.cells, customShape?.name)
            onStart({
              playerCount: names.length,
              names,
              colorTokens: names.map(
                (name, index) => players.find((p) => p.name === name)?.colorToken ?? ALL_COLOR_TOKENS[index % ALL_COLOR_TOKENS.length],
              ),
              gameRules,
              boardShapeId,
              customBoardCells: customShape?.cells,
              customBoardName: customShape?.name,
              online: { roomCode: roomCode!, localPlayerName: selfName, isHost: true },
            })
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
