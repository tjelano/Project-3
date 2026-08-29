import { useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { generateRoomCode, normalizePlayerName } from '../../multiplayer/roomCode'
import { useRoomChannel, type PresencePlayer, type RoomPlayer } from '../../multiplayer/useRoomChannel'
import { EyeIcon } from './EyeIcon'
import { CopyIcon } from './CopyIcon'
import { RegionSelectMenu } from './RegionSelectMenu'
import { INK, INK_MUTED, PARCHMENT_BUTTON } from './parchmentTheme'
import type { GameRules, PlayerColorToken } from '../../game/types'
import type { CustomBoardShape } from '../../data/customBoardShapes'
import type { BoardShapeId } from '../../data/hexBoard'
import type { GameStartInfo } from './StartScreen'

const ALL_COLOR_TOKENS: PlayerColorToken[] = [
  'player-1',
  'player-2',
  'player-3',
  'player-4',
  'player-5',
  'player-6',
]

// How long the copy button shows its checkmark before reverting.
const COPIED_FEEDBACK_MS = 1500

// A host's name field used to start genuinely empty, which meant self
// stayed null (untracked) until they typed something — so a joiner
// connecting in that window saw no host at all, not even a placeholder
// row. Seeding it with a real, already-editable name instead means the
// host is visible and trackable from the moment they land here, same as a
// joiner (who always arrives with a name already chosen in JoinRoomModal).
// Matches the "Player N" convention GameSetupMenu already uses for its own
// default names.
const DEFAULT_HOST_NAME = 'Player 1'

// Testing aid — fills the other slots with fake players so every slot's
// icon/name layout can be checked at once, without needing a second real
// browser joined to the same room. Only ever active in dev builds, and only
// shown when nobody real has actually joined yet, so it can never be
// mistaken for (or interfere with) a real lobby. Add/remove entries or
// clear the array to turn it off.
const TEMP_TEST_PLAYERS: { name: string; colorToken: PlayerColorToken }[] = []

// Every viewer has to place the SAME person in the SAME numbered slot —
// previously each client just pinned ITS OWN presence entry to slot 1, so
// the host saw themselves first and the joiner second, while the joiner
// saw the exact opposite. Host always leads (a fixed anchor everyone
// agrees on), then everyone else sorts by their own stable clientId —
// arbitrary, but identical on every client since presence state converges
// to the same set of ids everywhere.
function comparePlayers(a: { isHost: boolean; id: string }, b: { isHost: boolean; id: string }) {
  if (a.isHost !== b.isHost) return a.isHost ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function playerColorStyle(token: PlayerColorToken) {
  return { backgroundColor: `var(--color-${token})` }
}

type RoomLobbyProps =
  | {
      role: 'host'
      targetCount: number
      gameRules: GameRules
      seafarers: boolean
      boardShapeId?: BoardShapeId
      customBoardShape?: CustomBoardShape
      onStart: (info: GameStartInfo) => void
      onBack: () => void
    }
  | {
      role: 'joiner'
      roomCode: string
      selfName: string
      onStart: (info: GameStartInfo) => void
      onBack: () => void
    }

/**
 * Component-based rebuild — real inputs/buttons in a glass panel, matching
 * GameSetupMenu/RegionSelectMenu/JoinRoomModal, instead of transparent
 * hit-targets positioned over host-menu.png's painted 6-slot grid. Player
 * color swatches are plain circles reading the same --color-player-N tokens
 * the 3D board's own materials use, instead of hostroom-player-icons.png's
 * baked medallion sprite sheet. Serves BOTH sides of a room: the host (who
 * generates the room code and can start the game / re-open the map picker)
 * and every joiner (who connects to an already-live room and just waits,
 * picking their own name/color) render through this exact same component.
 */
export function RoomLobby(props: RoomLobbyProps) {
  const { onStart, onBack } = props
  const isHostRole = props.role === 'host'

  const [roomCode] = useState(() => (isHostRole ? generateRoomCode() : props.roomCode))
  const [selfName, setSelfName] = useState(isHostRole ? DEFAULT_HOST_NAME : props.selfName)
  const [myColor, setMyColor] = useState<PlayerColorToken>('player-1')
  // Defaults hidden — protects against a code getting sniped off a
  // stream/screen-share.
  const [isRoomCodeVisible, setIsRoomCodeVisible] = useState(false)
  const [justCopiedRoomCode, setJustCopiedRoomCode] = useState(false)
  // Guards the name field's select-all-on-focus (below) to only its very
  // first focus — without this it fired on every refocus, so fixing a typo
  // by clicking back into an already-typed name re-selected the whole thing.
  const hasAutoSelectedNameRef = useRef(false)

  // The CURRENT board pick — host-only, seeded from the props RegionSelectMenu
  // handed over, but owned here (not just read from props) so Back can
  // reopen the picker and update it in place without unmounting this
  // component (which would drop the Realtime connection below and kick
  // everyone out). A joiner never sets these; they only ever read the
  // equivalent host-broadcast fields off the host's own presence entry.
  const [currentBoardShapeId, setCurrentBoardShapeId] = useState(isHostRole ? props.boardShapeId : undefined)
  const [currentCustomBoardShape, setCurrentCustomBoardShape] = useState<CustomBoardShape | undefined>(
    isHostRole ? props.customBoardShape : undefined,
  )
  // True while the HOST has re-opened the region picker to change the map
  // without leaving the room — Back toggles this instead of calling onBack.
  // Always false for a joiner (they mirror the host's own flag instead, off
  // the host's presence entry, further down).
  const [isChangingMap, setIsChangingMap] = useState(false)
  // The region currently highlighted while isChangingMap is true, live —
  // broadcast below via self.previewBoardShapeId so everyone else's
  // read-only RegionSelectMenu mirrors it as the host browses, not just
  // the final confirmed pick.
  const [previewShapeId, setPreviewShapeId] = useState<BoardShapeId | undefined>(currentBoardShapeId)

  const self: RoomPlayer | null = useMemo(
    () =>
      selfName.trim()
        ? {
            name: selfName,
            isHost: isHostRole,
            targetCount: isHostRole ? props.targetCount : undefined,
            colorToken: myColor,
            isChoosingMap: isHostRole ? isChangingMap : undefined,
            previewBoardShapeId: isHostRole && isChangingMap ? previewShapeId : undefined,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- isHostRole/props.targetCount come from `props`, which is a fresh reference every render regardless; selfName/myColor/isChangingMap/previewShapeId are the real reactive inputs.
    [selfName, myColor, isChangingMap, previewShapeId],
  )

  const { players, clientId, broadcastGameStarted } = useRoomChannel(roomCode, self, {
    // Only meaningful for a joiner — the host is the one calling
    // broadcastGameStarted below, never the receiver of its own broadcast.
    onGameStarted: (
      names,
      hostName,
      receivedBoardShapeId,
      receivedSeafarers,
      receivedGameRules,
      receivedCustomCells,
      receivedCustomName,
      receivedClientIds,
      receivedColorTokens,
      receivedCustomBiomeOverrides,
    ) => {
      onStart({
        playerCount: names.length,
        names,
        // Prefer the host's own authoritative array when the broadcast
        // carries one — every receiver resolving colors independently off
        // its own local presence snapshot (the old behavior, kept below as
        // a fallback for an older/mismatched build) is exactly what let two
        // clients start the same match with two different colors on the
        // same seat: track() is debounced 400ms, so that local snapshot can
        // be stale at the instant this broadcast lands.
        colorTokens:
          receivedColorTokens ??
          names.map((name, index) => {
            const matchId = receivedClientIds?.[index]
            const match = matchId ? players.find((p) => p.id === matchId) : players.find((p) => p.name === name)
            return match?.colorToken ?? ALL_COLOR_TOKENS[index % ALL_COLOR_TOKENS.length]
          }),
        gameRules: receivedGameRules,
        boardShapeId: receivedBoardShapeId,
        seafarers: receivedSeafarers,
        customBoardCells: receivedCustomCells,
        customBoardName: receivedCustomName,
        customBoardBiomeOverrides: receivedCustomBiomeOverrides,
        online: {
          roomCode,
          localPlayerName: selfName,
          isHost: normalizePlayerName(selfName) === normalizePlayerName(hostName),
          // Lets App.tsx resolve "which seat am I" by stable clientId
          // instead of re-matching selfName against `names` — the host's
          // own view of this name can still be stale (track() is
          // debounced) the instant they click Start Game, which used to
          // permanently lock a fast-typing joiner out of their own turn.
          localClientId: clientId,
          clientIds: receivedClientIds,
          hostName,
        },
      })
    },
  })

  const takenByOthers = new Set(
    players
      .filter((p) => p.id !== clientId)
      .map((p) => p.colorToken)
      .filter((c): c is PlayerColorToken => c != null),
  )

  // Auto-reassigns myColor the instant it collides with someone who OUTRANKS
  // me in the same canonical order comparePlayers uses for slot ordering
  // (host, then lower clientId) — applied directly during render (not a
  // useEffect): the has() check below is its own self-terminating guard.
  // Deliberately narrower than takenByOthers above: if it deferred to
  // EVERY other color, two clients whose defaults happened to collide could
  // both detect it off the same sync and both reassign at once — sometimes
  // landing on each other's new pick and cycling instead of settling. With
  // a fixed priority order, only the lower-priority side ever has to move.
  const priorityTaken = new Set(
    players
      .filter(
        (p) => p.id !== clientId && comparePlayers({ isHost: p.isHost, id: p.id }, { isHost: isHostRole, id: clientId }) < 0,
      )
      .map((p) => p.colorToken)
      .filter((c): c is PlayerColorToken => c != null),
  )
  if (priorityTaken.has(myColor)) {
    const free = ALL_COLOR_TOKENS.find((token) => !priorityTaken.has(token))
    if (free) setMyColor(free)
  }

  // Clicking your own icon cycles to the next color not already taken by
  // someone else in the room — replaces a dropdown with a single click,
  // since the icon itself is now the only visible control.
  const cycleMyColor = () => {
    const currentIndex = ALL_COLOR_TOKENS.indexOf(myColor)
    for (let step = 1; step <= ALL_COLOR_TOKENS.length; step++) {
      const candidate = ALL_COLOR_TOKENS[(currentIndex + step) % ALL_COLOR_TOKENS.length]
      if (!takenByOthers.has(candidate)) {
        setMyColor(candidate)
        return
      }
    }
  }

  const otherPlayers = players.filter((p) => p.id !== clientId)
  const joinedCount = self ? otherPlayers.length + 1 : otherPlayers.length
  // Only the host knows the target count directly (it picked it, upstream) —
  // a joiner reads it back off the host's own presence entry instead.
  const hostPlayer = otherPlayers.find((p) => p.isHost) ?? (isHostRole ? undefined : players.find((p) => p.isHost))
  const targetCount = isHostRole ? props.targetCount : hostPlayer?.targetCount
  // >= rather than === — a stray extra join (e.g. two clients racing into
  // the last open slot) would otherwise leave joinedCount permanently past
  // targetCount, making Start Game impossible to ever enable again.
  const isFull = targetCount != null && joinedCount >= targetCount
  // Specifically "was the room already full from EVERYONE ELSE, before I
  // even joined" — otherPlayers already excludes self, so this is true
  // only for a genuinely extra joiner. JoinRoomModal has no way to check
  // room size before joining (that data only exists once connected, here),
  // so without this a joiner past capacity used to land in a slot index
  // beyond rowSlotCount that simply never renders — no name field, no
  // color, no sign they're connected — while the host's own isFull (based
  // only on otherPlayers, unaffected by this extra join) still read as
  // already full and let them start with one more player than configured.
  const isOverCapacityJoiner = !isHostRole && targetCount != null && otherPlayers.length >= targetCount

  // Nothing before this stopped two players from picking the same name —
  // Start Game resolves everyone's numeric seat by matching typed names
  // against the broadcast roster (see findPlayerIndexByName in App.tsx),
  // so a collision silently merged two people into one seat (both
  // controlling the same player), and if the collision matched the host's
  // own name, both clients independently computed isHost: true too. Gating
  // Start Game itself on this categorically prevents that no matter how
  // the collision arose, rather than trying to police every place a name
  // could be typed.
  const hasDuplicateNames = (() => {
    const seen = new Set<string>()
    for (const name of [selfName, ...otherPlayers.map((p) => p.name)]) {
      const normalized = normalizePlayerName(name)
      if (!normalized || seen.has(normalized)) return true
      seen.add(normalized)
    }
    return false
  })()

  // Real players (self + everyone else actually in the room) in the one
  // canonical order every client agrees on — see comparePlayers above.
  // Self is placed here by isHostRole/clientId alone, NOT gated on `self`
  // being non-null (built from local selfName/myColor instead of `self` or
  // its echo back through `players` so typing your own name updates your
  // row immediately, without waiting on a server round trip) — clearing
  // the name field makes `self` briefly null, and excluding it from this
  // list then meant no slot index ever matched clientId, hiding the
  // editable row entirely, AND meant ordering started from whoever else
  // was actually present instead of always ranking the host first.
  const hasRealOthers = otherPlayers.length > 0
  const selfPlaceholder: PresencePlayer = { id: clientId, name: selfName, isHost: isHostRole, colorToken: myColor }
  const orderedRealPlayers: PresencePlayer[] = [selfPlaceholder, ...otherPlayers].sort(comparePlayers)
  const selfSlotIndex = orderedRealPlayers.findIndex((p) => p.id === clientId)

  // Falls back to TEMP_TEST_PLAYERS purely for what gets drawn in the row
  // slots below when nobody real else has joined yet. isFull/joinedCount/
  // handleStart all stay on the real otherPlayers above, so a stray Start
  // Game click can never fire with fake names.
  const rowSlotCount = !hasRealOthers && TEMP_TEST_PLAYERS.length > 0 ? 6 : (targetCount ?? 6)

  const handleCopyRoomCode = () => {
    void navigator.clipboard.writeText(roomCode)
    setJustCopiedRoomCode(true)
    setTimeout(() => setJustCopiedRoomCode(false), COPIED_FEEDBACK_MS)
  }

  // Host-only — a joiner never has a Start Game action; they wait for the
  // onGameStarted handler above instead.
  const handleStart = () => {
    if (!isHostRole) return
    // Defense-in-depth — the button is already disabled for this, but
    // handleStart shouldn't trust that alone.
    if (hasDuplicateNames) return
    const names = [selfName, ...otherPlayers.map((p) => p.name)]
    // Parallel to `names` — see the clientIds comment on GameStartedPayload
    // for why every receiver resolves itself (and everyone else's color)
    // by this instead of by name-matching.
    const clientIds = [clientId, ...otherPlayers.map((p) => p.id)]
    // Resolved ONCE, here, off the host's own local view — then broadcast
    // as-is (see the colorTokens comment on GameStartedPayload) so every
    // client starts the match with the exact same array instead of each
    // re-deriving it from its own, possibly-stale, presence snapshot.
    const colorTokens = clientIds.map((matchId, index) => {
      if (matchId === clientId) return myColor
      return otherPlayers.find((p) => p.id === matchId)?.colorToken ?? ALL_COLOR_TOKENS[index % ALL_COLOR_TOKENS.length]
    })
    broadcastGameStarted(
      names,
      selfName,
      currentBoardShapeId ?? 'standard',
      props.seafarers,
      props.gameRules,
      currentCustomBoardShape?.cells,
      currentCustomBoardShape?.name,
      clientIds,
      colorTokens,
      currentCustomBoardShape?.biomeOverrides,
    )
    onStart({
      playerCount: names.length,
      names,
      colorTokens,
      gameRules: props.gameRules,
      boardShapeId: currentBoardShapeId,
      seafarers: props.seafarers,
      customBoardCells: currentCustomBoardShape?.cells,
      customBoardName: currentCustomBoardShape?.name,
      customBoardBiomeOverrides: currentCustomBoardShape?.biomeOverrides,
      online: { roomCode, localPlayerName: selfName, isHost: true, localClientId: clientId, clientIds, hostName: selfName },
    })
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="mx-auto w-96 rounded-lg border border-player-1/40 bg-player-1/10 px-4 py-3 text-left">
        <p className="font-body text-xs text-player-1/90">
          Online Multiplayer isn't configured yet — set <span className="font-data">VITE_SUPABASE_URL</span> in{' '}
          <span className="font-data">.env.local</span> to enable it.
        </p>
        <button type="button" onClick={onBack} className="mt-3 font-body text-[10px] tracking-[0.15em] text-white/40 uppercase hover:text-white/70">
          Back
        </button>
      </div>
    )
  }

  if (isOverCapacityJoiner) {
    return (
      <div className="mx-auto w-96 rounded-lg border border-player-1/40 bg-player-1/10 px-4 py-3 text-left">
        <p className="font-body text-xs text-player-1/90">
          This room is already full ({targetCount} / {targetCount} players) — the host needs to raise the player
          count before you can join.
        </p>
        <button type="button" onClick={onBack} className="mt-3 font-body text-[10px] tracking-[0.15em] text-white/40 uppercase hover:text-white/70">
          Back
        </button>
      </div>
    )
  }

  // Re-picking the map without leaving the room — this component (and its
  // useRoomChannel connection above) never unmounts, it just swaps which
  // screen it renders, so nobody gets kicked. previewShapeId keeps
  // broadcasting live via self.previewBoardShapeId as the host browses.
  if (isChangingMap) {
    return (
      <RegionSelectMenu
        initialShape={currentBoardShapeId ?? 'standard'}
        onSelectionChange={setPreviewShapeId}
        onConfirm={(shapeId) => {
          setCurrentBoardShapeId(shapeId)
          setCurrentCustomBoardShape(undefined)
          setIsChangingMap(false)
        }}
        onConfirmCustom={(shape) => {
          setCurrentBoardShapeId(undefined)
          setCurrentCustomBoardShape(shape)
          setIsChangingMap(false)
        }}
        onBack={() => setIsChangingMap(false)}
      />
    )
  }

  // The host re-opened the map picker without leaving the room — mirror it
  // here read-only instead of the normal lobby view below, live-updating as
  // they browse (see RoomPlayer.isChoosingMap/previewBoardShapeId). Never
  // true for the host themselves; they render the interactive branch above.
  if (!isHostRole && hostPlayer?.isChoosingMap) {
    return (
      <RegionSelectMenu
        initialShape={hostPlayer.previewBoardShapeId ?? 'standard'}
        readOnly
        onConfirm={() => {}}
        onConfirmCustom={() => {}}
        onBack={() => {}}
      />
    )
  }

  return (
    <div className="mx-auto w-full max-w-lg animate-victory-in">
      {/* Same prototype as JoinRoomModal/RegionSelectMenu — reusing
          .expansion-card's parchment panel art rather than bespoke book art
          for this screen. */}
      <div className="expansion-card p-6">
        <div className="text-center">
          <h1 className={`font-display text-lg tracking-[0.3em] uppercase ${INK}`}>Room Lobby</h1>
          <div className="mx-auto mt-3 h-px w-16 bg-[#8a6d47]/40" />
        </div>

        <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-[#8a6d47]/30 bg-[#f1e0be]/30 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsRoomCodeVisible((prev) => !prev)}
              aria-label={isRoomCodeVisible ? 'Hide room code' : 'Show room code'}
              className={`flex h-7 w-7 items-center justify-center rounded-md ${INK_MUTED} hover:text-[#2b1810]`}
            >
              <EyeIcon open={isRoomCodeVisible} className="h-4 w-4" />
            </button>
            {isRoomCodeVisible ? (
              <span className={`room-code-font text-lg font-bold tracking-[0.4em] ${INK}`}>{roomCode}</span>
            ) : (
              <span className="flex gap-2 pl-1">
                {roomCode.split('').map((_, index) => (
                  <span key={index} className="h-2 w-2 rounded-full bg-[#8a6d47]/60" />
                ))}
              </span>
            )}
            <button
              type="button"
              onClick={handleCopyRoomCode}
              aria-label="Copy room code"
              className={`flex h-7 w-7 items-center justify-center rounded-md ${INK_MUTED} hover:text-[#2b1810]`}
            >
              <CopyIcon copied={justCopiedRoomCode} className="h-4 w-4" />
            </button>
          </div>
          <span className={`font-display text-sm font-bold tracking-[0.1em] ${INK}`}>
            {joinedCount} / {targetCount ?? '…'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {Array.from({ length: rowSlotCount }, (_, index) => {
            if (index === selfSlotIndex) {
              return (
                <div
                  key="self"
                  className="flex items-center gap-2 rounded-lg border border-[#7a3b1e]/30 bg-[#7a3b1e]/[0.06] px-2.5 py-2"
                >
                  <button
                    type="button"
                    onClick={cycleMyColor}
                    aria-label={`Your color: ${myColor}`}
                    className="h-6 w-6 shrink-0 rounded-full ring-2 ring-[#2b1810]/20 transition-transform hover:scale-110"
                    style={playerColorStyle(myColor)}
                  />
                  <input
                    type="text"
                    value={selfName}
                    onChange={(event) => setSelfName(event.target.value)}
                    // Selects the seeded DEFAULT_HOST_NAME on the field's
                    // very first focus only (see hasAutoSelectedNameRef)
                    // so typing replaces it outright, rather than the host
                    // having to manually clear "Player 1" first.
                    onFocus={(event) => {
                      if (hasAutoSelectedNameRef.current) return
                      hasAutoSelectedNameRef.current = true
                      event.target.select()
                    }}
                    placeholder="Your name"
                    aria-label="Your name"
                    maxLength={20}
                    className={`min-w-0 flex-1 bg-transparent font-body text-sm ${INK} placeholder:text-[#7a6248] focus:outline-none`}
                  />
                  {isHostRole && <span className="shrink-0 font-body text-[9px] tracking-[0.1em] text-[#7a3b1e]/80 uppercase">Host</span>}
                </div>
              )
            }

            // Real others sit at their own index within orderedRealPlayers
            // (self already occupies its own slot in that same array, so no
            // -1 offset is needed); the fallback preview fakes are indexed
            // relative to slot 0, same as before.
            const player = hasRealOthers ? orderedRealPlayers[index] : TEMP_TEST_PLAYERS[index - 1]
            const key = !player ? `empty-${index}` : 'id' in player ? player.id : player.name
            return (
              <div key={key} className="flex items-center gap-2 rounded-lg border border-[#8a6d47]/30 px-2.5 py-2">
                {player?.colorToken && (
                  <span
                    aria-label={`${player.name}'s color`}
                    className="h-6 w-6 shrink-0 rounded-full ring-2 ring-[#2b1810]/10"
                    style={playerColorStyle(player.colorToken)}
                  />
                )}
                {player && (
                  <>
                    <span className={`min-w-0 flex-1 truncate font-body text-sm ${INK}`}>{player.name}</span>
                    {'isHost' in player && player.isHost && (
                      <span className="shrink-0 font-body text-[9px] tracking-[0.1em] text-[#7a3b1e]/80 uppercase">Host</span>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* Only reason Start Game can stay disabled once the room is full —
            everything else about isFull is self-explanatory from the N / M
            count above, but a name collision needs its own callout or the
            host has no way to tell why the button won't light up. */}
        {isHostRole && isFull && hasDuplicateNames && (
          <p className="mt-3 text-center font-body text-[11px] text-player-1">
            Two players have the same name — one needs to change it before you can start.
          </p>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[#8a6d47]/30 pt-4">
          {/* For the host, Back reopens the map picker in place (see the
              isChangingMap branch above), not onBack: the room stays live
              the whole time, so this doesn't leave/kick anyone. A joiner
              has no map picker to reopen, so their Back genuinely leaves
              the room. */}
          <button
            type="button"
            onClick={() => {
              if (isHostRole) {
                setPreviewShapeId(currentBoardShapeId)
                setIsChangingMap(true)
                return
              }
              onBack()
            }}
            className={`${PARCHMENT_BUTTON} py-2.5 font-display text-sm tracking-[0.1em] uppercase`}
          >
            {isHostRole ? 'Change Map' : 'Leave Room'}
          </button>
          {isHostRole ? (
            <button
              type="button"
              disabled={!isFull || hasDuplicateNames}
              onClick={handleStart}
              aria-label={hasDuplicateNames ? 'Start game (two players have the same name)' : 'Start game'}
              className={`${PARCHMENT_BUTTON} py-2.5 font-display text-sm tracking-[0.15em] uppercase disabled:cursor-not-allowed disabled:opacity-50`}
            >
              Start Game
            </button>
          ) : (
            <div className={`flex items-center justify-center font-body text-xs tracking-[0.1em] ${INK_MUTED} uppercase`}>
              Waiting for host…
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
