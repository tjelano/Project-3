import { useMemo, useState } from 'react'
import hostMenuUrl from '../../assets/menu/host-menu.png'
import hostroomPlayerIconsUrl from '../../assets/menu/hostroom-player-icons.png'
import selectorBorderUrl from '../../assets/menu/selector-border.png'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { generateRoomCode, normalizePlayerName } from '../../multiplayer/roomCode'
import { useRoomChannel, type PresencePlayer, type RoomPlayer } from '../../multiplayer/useRoomChannel'
import { EyeIcon } from './EyeIcon'
import { CopyIcon } from './CopyIcon'
import { RegionSelectMenu } from './RegionSelectMenu'
import { useHoverActive } from './useHoverActive'
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
// Matches the "Player N" convention LocalSetup/GameSetupMenu already use
// for their own default names.
const DEFAULT_HOST_NAME = 'Player 1'

// Caps how wide the whole panel renders (px) — raise this to make the panel
// (and everything painted on it) bigger on screen. 768 matches Tailwind's
// own max-w-3xl, which this replaces so the size is a plain editable number
// instead of a fixed class.
const PANEL_MAX_WIDTH_PX = 1436

// The panel's own shape — host-menu.png is natively 1536x1024, but these
// don't have to match that: raise PANEL_HEIGHT (or lower PANEL_WIDTH) to
// stretch the panel taller than the image's own proportions, e.g. to open
// up more room around the 6 player rows. Every LAYOUT box below is still a
// % of THIS box, so hit-targets stay lined up with wherever the art itself
// ends up at any ratio — no need to touch them too. Currently set to the
// image's own native size (no stretch, no cap below its real resolution).
const PANEL_WIDTH = 1536
const PANEL_HEIGHT = 1024

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

// Every number here is a % of host-menu.png's own 1536x1024 canvas — edit
// directly to line a hit-target/overlay up with the art. No live editor —
// just change the numbers and check the result in the browser. This art
// (the "FinalHostroomMenu" export) bakes in 6 numbered slots as a 3-column
// x 2-row grid (1/2/3 on top, 4/5/6 below), each with its own painted
// number badge (static, no overlay needed), a circle for the color icon,
// and a blank bar for the name — only `targetCount` of the 6 actually
// render; the rest just aren't needed for this room.
const LAYOUT = {
  roomCodeEyeToggle: { left: 32, top: 24, width: 5, height: 6 } satisfies Rect,
  roomCodeDigits: { left: 25, top: 24, width: 30, height: 6 } satisfies Rect,
  roomCodeCopy: { left: 43, top: 24, width: 5, height: 6 } satisfies Rect,
  playersCountNumbers: { left: 34, top: 29.3, width: 12, height: 4 } satisfies Rect,
  // One {circle, name} pair per player slot, ordered 1-6 (row-major: top-left
  // to top-right, then bottom-left to bottom-right) — nudge a slot's own
  // circle/name individually if it drifts off its painted box.
  playerRows: [
    { circle: { left: 14, top: 38.8, width: 7, height: 10.5 }, name: { left: 21.5, top: 39.5, width: 13, height: 8 } },
    { circle: { left: 42.1, top: 38.8, width: 7, height: 10.5 }, name: { left: 50, top: 39.5, width: 13, height: 8 } },
    { circle: { left: 69.6, top: 38.8, width: 7, height: 10.5 }, name: { left: 78, top: 39.5, width: 13, height: 8 } },
    { circle: { left: 14, top: 53.3, width: 7, height: 10.5 }, name: { left: 21.5, top: 54, width: 13, height: 8 } },
    { circle: { left: 42.1, top: 53.3, width: 7, height: 10.5 }, name: { left: 50, top: 54, width: 13, height: 8 } },
    { circle: { left: 69.6, top: 53.3, width: 7, height: 10.5 }, name: { left: 78, top: 54, width: 13, height: 8 } },
  ] satisfies { circle: Rect; name: Rect }[],
  startGameButton: { left: 19, top: 65, width: 62, height: 14 } satisfies Rect,
  // Was sitting a bit below the painted "BACK" label — nudged up.
  backButton: { left: 38, top: 79, width: 24, height: 7 } satisfies Rect,
} as const

// How far selector-border.png extends past the Start Game button's own
// edges, in % of the button's own size — same "primary action" glow
// highlight used on RegionSelectMenu's confirm button / JoinRoomModal's
// Join button, shown on hover/focus only.
const START_GAME_SELECTOR_INSET = { x: 0, y: 30 }
// Nudges the glow frame itself (px, on top of the inset above) without
// resizing it — positive x moves right, positive y moves down.
const START_GAME_SELECTOR_OFFSET = { x: -2, y: -10 }
// Opacity at rest vs. while hovered/focused — 0/1 is invisible-until-hover;
// raise GLOW_IDLE_OPACITY for an always-partly-visible glow instead.
const START_GAME_GLOW_IDLE_OPACITY = 0
const START_GAME_GLOW_ACTIVE_OPACITY = 1

function selectorOverlayStyle(insetXPct: number, insetYPct: number) {
  return {
    left: `-${insetXPct}%`,
    top: `-${insetYPct}%`,
    width: `calc(100% + ${insetXPct * 2}%)`,
    height: `calc(100% + ${insetYPct * 2}%)`,
    maxWidth: 'none',
  }
}

// Nudges a whole GROUP of elements together (% of the panel), rather than
// needing to move the eye toggle/digits/copy — or every player row — one at
// a time. Positive x moves right, positive y moves down.
const ROOM_CODE_OFFSET = { x: 10, y: -3.5 }
const PLAYER_ROWS_OFFSET = { x: 0, y: -3 }
const PLAYERS_COUNT_OFFSET = { x: -25, y: -18 }

function groupOffsetStyle(offset: { x: number; y: number }) {
  return { transform: `translate(${offset.x}%, ${offset.y}%)` }
}

function rectStyle({ left, top, width, height }: Rect) {
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }
}

// hostroom-player-icons.png is a 3-column x 2-row sprite sheet, one hooded
// medallion per color, in the exact same order as ALL_COLOR_TOKENS (red,
// blue, purple, teal, orange, pink — row-major, matching PLAYER_COLORS).
// background-position as a % naturally picks a cell out of an N-cell sprite
// when background-size is N*100% in that axis: col 0/1/2 -> 0%/50%/100%,
// row 0/1 -> 0%/100%.
function playerIconStyle(token: PlayerColorToken) {
  const index = ALL_COLOR_TOKENS.indexOf(token)
  const col = index % 3
  const row = Math.floor(index / 3)
  return {
    backgroundImage: `url(${hostroomPlayerIconsUrl})`,
    backgroundSize: '300% 200%',
    backgroundPositionX: `${(col / 2) * 100}%`,
    backgroundPositionY: `${row * 100}%`,
  }
}

// Player name text size (px) — self's input and every other joined
// player's name share this one number.
const PLAYER_NAME_FONT_SIZE_PX = 17

// "N / M" players-count text size (px).
const PLAYERS_COUNT_FONT_SIZE_PX = 22

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

type RoomLobbyProps =
  | {
      role: 'host'
      targetCount: number
      gameRules: GameRules
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
 * Built directly on host-menu.png, same "real image as canvas" strategy as
 * GameSetupMenu.tsx/JoinRoomModal.tsx/RegionSelectMenu.tsx — the art already
 * bakes in 6 empty row slots (see LAYOUT.playerRows), so this is a single
 * fixed-size panel, not a growing one. Serves BOTH sides of a room: the host
 * (who generates the room code and can start the game / re-open the map
 * picker) and every joiner (who connects to an already-live room and just
 * waits, picking their own name/color) render through this exact same
 * screen — a joiner used to see a separate, plainer lobby (OnlineSetup.tsx's
 * own 'lobby' mode), which is why that screen's board-shape/name-entry UI is
 * now dead code; it's kept around unreferenced rather than deleted.
 */
export function RoomLobby(props: RoomLobbyProps) {
  const { onStart, onBack } = props
  const isHostRole = props.role === 'host'
  const startGameGlow = useHoverActive()

  const [roomCode] = useState(() => (isHostRole ? generateRoomCode() : props.roomCode))
  const [selfName, setSelfName] = useState(isHostRole ? DEFAULT_HOST_NAME : props.selfName)
  const [myColor, setMyColor] = useState<PlayerColorToken>('player-1')
  // Defaults hidden — protects against a code getting sniped off a
  // stream/screen-share.
  const [isRoomCodeVisible, setIsRoomCodeVisible] = useState(false)
  const [justCopiedRoomCode, setJustCopiedRoomCode] = useState(false)

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
    onGameStarted: (names, hostName, receivedBoardShapeId, receivedGameRules, receivedCustomCells, receivedCustomName) => {
      onStart({
        playerCount: names.length,
        names,
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
  // While previewing fake players, show all 6 slots regardless of
  // targetCount — otherwise whatever player count happened to be picked on
  // the earlier screen (e.g. 2) would hide most of TEMP_TEST_PLAYERS behind
  // a loop that only renders `targetCount` slots. Falls back to 6 while
  // targetCount is still unknown (a joiner, briefly, before the host's own
  // presence entry has synced in) so the panel doesn't render zero rows.
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
    const names = [selfName, ...otherPlayers.map((p) => p.name)]
    broadcastGameStarted(
      names,
      selfName,
      currentBoardShapeId ?? 'standard',
      props.gameRules,
      currentCustomBoardShape?.cells,
      currentCustomBoardShape?.name,
    )
    onStart({
      playerCount: names.length,
      names,
      colorTokens: names.map((name, index) => {
        if (normalizePlayerName(name) === normalizePlayerName(selfName)) return myColor
        return otherPlayers.find((p) => p.name === name)?.colorToken ?? ALL_COLOR_TOKENS[index % ALL_COLOR_TOKENS.length]
      }),
      gameRules: props.gameRules,
      boardShapeId: currentBoardShapeId,
      customBoardCells: currentCustomBoardShape?.cells,
      customBoardName: currentCustomBoardShape?.name,
      online: { roomCode, localPlayerName: selfName, isHost: true },
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
    <div className="relative mx-auto w-full animate-victory-in" style={{ maxWidth: `${PANEL_MAX_WIDTH_PX}px` }}>
      <div className="relative w-full" style={{ aspectRatio: `${PANEL_WIDTH} / ${PANEL_HEIGHT}` }}>
        <img src={hostMenuUrl} alt="Host game" className="absolute inset-0 h-full w-full select-none" draggable={false} />

        {/* Eye toggle / digits / copy move together — see ROOM_CODE_OFFSET.
            pointer-events-none on the wrapper (it's a full-panel inset-0
            box) keeps it from blocking clicks to anything UNDER it;
            pointer-events-auto restores it on the two real buttons inside. */}
        <div className="pointer-events-none absolute inset-0" style={groupOffsetStyle(ROOM_CODE_OFFSET)}>
          <button
            type="button"
            onClick={() => setIsRoomCodeVisible((prev) => !prev)}
            aria-label={isRoomCodeVisible ? 'Hide room code' : 'Show room code'}
            className="pointer-events-auto absolute flex items-center justify-center outline-none focus-visible:outline-2 focus-visible:outline-gold"
            style={rectStyle(LAYOUT.roomCodeEyeToggle)}
          >
            <EyeIcon open={isRoomCodeVisible} className="h-1/2 w-1/2 text-gold" />
          </button>

          {/* Room code — 4 dots when hidden, the real code when visible. */}
          <div className="absolute flex items-center justify-center" style={rectStyle(LAYOUT.roomCodeDigits)}>
            {isRoomCodeVisible ? (
              <span className="font-data text-lg font-bold tracking-[0.5em] text-gold">{roomCode}</span>
            ) : (
              <span className="flex gap-3">
                {roomCode.split('').map((_, index) => (
                  <span key={index} className="h-2.5 w-2.5 rounded-full bg-gold" />
                ))}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopyRoomCode}
            aria-label="Copy room code"
            className="pointer-events-auto absolute flex items-center justify-center outline-none focus-visible:outline-2 focus-visible:outline-gold"
            style={rectStyle(LAYOUT.roomCodeCopy)}
          >
            <CopyIcon copied={justCopiedRoomCode} className="h-1/2 w-1/2 text-gold" />
          </button>
        </div>

        {/* Player count — sits in the blank gap right before the baked
            "PLAYERS" word, rendering just "N / M" rather than the whole
            phrase. */}
        <div
          className="pointer-events-none absolute flex items-center justify-end font-display font-bold tracking-[0.15em] text-gold"
          style={{
            ...rectStyle(LAYOUT.playersCountNumbers),
            ...groupOffsetStyle(PLAYERS_COUNT_OFFSET),
            fontSize: `${PLAYERS_COUNT_FONT_SIZE_PX}px`,
          }}
        >
          {joinedCount} / {targetCount ?? '…'}
        </div>

        {/* Player rows — self is always slot 0 (an editable name input plus
            a clickable color icon — a joiner's name starts pre-filled from
            JoinRoomModal but stays editable here too, same field either
            way), followed by whoever else has joined, one slot per
            LAYOUT.playerRows entry up to targetCount. Every slot's own
            number badge (1-6) is already painted into the art — only the
            circle (color icon) and name need overlays. All slots move
            together — see PLAYER_ROWS_OFFSET. pointer-events-none on the
            wrapper (a full-panel inset-0 box) keeps it from blocking clicks
            to anything under it — was silently swallowing clicks to the
            room-code buttons above it, since it renders later in the DOM
            and covers the whole panel regardless of where its own content
            actually sits; pointer-events-auto restores it on the self color
            button + name input. */}
        <div className="pointer-events-none absolute inset-0" style={groupOffsetStyle(PLAYER_ROWS_OFFSET)}>
        {Array.from({ length: rowSlotCount }, (_, index) => {
          const slot = LAYOUT.playerRows[index]
          if (!slot) return null

          if (index === selfSlotIndex) {
            return (
              <div key="self">
                <button
                  type="button"
                  onClick={cycleMyColor}
                  aria-label={`Your color: ${myColor}`}
                  className="pointer-events-auto absolute rounded-full bg-cover bg-center outline-none focus-visible:outline-2 focus-visible:outline-gold"
                  style={{ ...rectStyle(slot.circle), ...playerIconStyle(myColor) }}
                />
                <div className="pointer-events-auto absolute flex items-center gap-2 px-2" style={rectStyle(slot.name)}>
                  <input
                    type="text"
                    value={selfName}
                    onChange={(event) => setSelfName(event.target.value)}
                    // Selects the seeded DEFAULT_HOST_NAME on first focus so
                    // typing replaces it outright, rather than the host
                    // having to manually clear "Player 1" first.
                    onFocus={(event) => event.target.select()}
                    placeholder="Your name"
                    maxLength={20}
                    className="min-w-0 flex-1 bg-transparent font-body text-white placeholder:text-white/30 focus:outline-none"
                    style={{ fontSize: `${PLAYER_NAME_FONT_SIZE_PX}px` }}
                  />
                  {isHostRole && <span className="shrink-0 font-body text-[9px] tracking-[0.1em] text-gold/70 uppercase">Host</span>}
                </div>
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
            <div key={key}>
              {player?.colorToken && (
                <div
                  aria-label={`${player.name}'s color: ${player.colorToken}`}
                  className="absolute rounded-full bg-cover bg-center"
                  style={{ ...rectStyle(slot.circle), ...playerIconStyle(player.colorToken) }}
                />
              )}
              {player && (
                <div className="absolute flex items-center gap-2 px-2" style={rectStyle(slot.name)}>
                  <span
                    className="min-w-0 flex-1 truncate font-body text-white"
                    style={{ fontSize: `${PLAYER_NAME_FONT_SIZE_PX}px` }}
                  >
                    {player.name}
                  </span>
                  {'isHost' in player && player.isHost && (
                    <span className="shrink-0 font-body text-[9px] tracking-[0.1em] text-gold/70 uppercase">Host</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
        </div>

        {/* Start Game — the glowing pill baked into the frame. Host-only;
            a joiner has no action here (they wait for onGameStarted), so
            no hit-target is rendered for them at all — the painted pill
            just sits there inert. */}
        {isHostRole && (
          <button
            type="button"
            disabled={!isFull}
            onClick={handleStart}
            aria-label="Start game"
            className="absolute outline-none focus-visible:outline-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-50"
            style={rectStyle(LAYOUT.startGameButton)}
            {...startGameGlow.handlers}
          >
            {/* Scaled on the IMAGE itself, not the button — a button-level
                scale grows the glow around the BUTTON's center, but
                START_GAME_SELECTOR_OFFSET moves the glow off that center,
                so it would grow the far edge more than the near edge on
                hover (same bug already fixed on RegionSelectMenu's confirm
                button). Scaling here instead grows it symmetrically around
                its own (offset) center. */}
            <img
              src={selectorBorderUrl}
              alt=""
              className="pointer-events-none absolute transition-[opacity,scale]"
              style={{
                ...selectorOverlayStyle(START_GAME_SELECTOR_INSET.x, START_GAME_SELECTOR_INSET.y),
                opacity: startGameGlow.isActive ? START_GAME_GLOW_ACTIVE_OPACITY : START_GAME_GLOW_IDLE_OPACITY,
                translate: `${START_GAME_SELECTOR_OFFSET.x}px ${START_GAME_SELECTOR_OFFSET.y}px`,
                scale: startGameGlow.isActive ? '1.02' : '1',
              }}
              draggable={false}
            />
          </button>
        )}

        {/* Back — for the host, the painted "BACK" label reopens the map
            picker in place (see the isChangingMap branch above), not
            onBack: the room stays live the whole time, so this doesn't
            leave/kick anyone. A joiner has no map picker to reopen, so
            their Back genuinely leaves the room. */}
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
          aria-label={isHostRole ? 'Change map' : 'Leave room'}
          className="absolute outline-none focus-visible:outline-2 focus-visible:outline-gold"
          style={rectStyle(LAYOUT.backButton)}
        />
      </div>
    </div>
  )
}
