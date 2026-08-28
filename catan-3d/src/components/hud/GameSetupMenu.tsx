import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useGLTF } from '@react-three/drei'
import hiddenTileUrl from '../../assets/models/hidden-tile.glb'
import conquerLogoUrl from '../../assets/menu/conquer-logo.png'
import openBookUrl from '../../assets/menu/open-book.png'
import { ExpansionSelector } from './ExpansionSelector'
import { HouseRules } from './HouseRules'
import { JoinRoomModal } from './JoinRoomModal'
import { INK_MUTED } from './parchmentTheme'
import type { GameStartInfo } from './StartScreen'
import { DEFAULT_GAME_RULES, WINNING_SCORE, type GameRules } from '../../game/types'

type GameMode = 'local' | 'host'
type SetupTab = 'expansions' | 'houseRules'

// A %-of-panel box, absolutely positioned against the open-book art. %, not
// px: a rect stays put (same spot on the page) if panelWidthPx/panelHeightPx
// below change, since the book box itself scales via aspect-ratio.
interface Rect {
  left: number
  top: number
  width: number
  height: number
}

const rectStyle = ({ left, top, width, height }: Rect): CSSProperties => ({
  position: 'absolute',
  left: `${left}%`,
  top: `${top}%`,
  width: `${width}%`,
  height: `${height}%`,
})

// Hand-tune directly and save — the dev server hot-reloads, no live editor
// needed. Replaces an earlier version of this config that only exposed a
// few global widths/paddings: not enough to line content up against a hand-
// drawn book (corner brackets, spine, two physical pages), which needs each
// piece placed independently. Every row below has a Left and a Right rect
// instead of one spanning row — the art is two pages either side of a
// spine, so paired controls (players 1-3/4-6, Local Play/Host Online,
// Join/Start) split the same way, one rect per page.
const LAYOUT = {
  // Book panel size, px — width AND height independently adjustable. The
  // book box uses width/height as an aspect-ratio (not a fixed height), so
  // it still shrinks cleanly on narrow viewports; the open-book art
  // stretches to fit via background-size: 100% 100%.
  panelWidthPx: 1150,
  panelHeightPx: 732,
  // Conquer wordmark width above the panel, px.
  logoWidthPx: 356,
  // Player-count tile numbers (1-6), px.
  playersNumberFontSizePx: 22,

  // "Players" label, spanning both pages above the two tile groups below.
  playersLabel: { left: 19, top: 9.5, width: 60, height: 4 } as Rect,
  playersLeft: { left: 17.5, top: 12, width: 23.2, height: 11 } as Rect, // tiles 1-3, left page
  playersRight: { left: 59, top: 12, width: 23.2, height: 11 } as Rect, // tiles 4-6, right page

  localPlay: { left: 17, top: 24, width: 25.2, height: 10 } as Rect,
  hostOnline: { left: 57.5, top: 24, width: 25.2, height: 10 } as Rect,

  // Expansions/House Rules tab labels — independent rects, one per page,
  // same pairing as everything else above.
  expansionsTab: { left: 16.8, top: 38, width: 30.2, height: 5 } as Rect,
  houseRulesTab: { left: 53, top: 38, width: 30.2, height: 5 } as Rect,
  // Expansion cards — independently movable/resizable, one per page.
  expansionCardLeft: { left: 16.5, top: 43, width: 30.5, height: 20.5 } as Rect, // Seafarers
  expansionCardRight: { left: 53, top: 43, width: 30.2, height: 20.5 } as Rect, // Cities & Knights
  // House Rules — left/right rule columns and the Hidden Tiles widget are
  // independent rects (not one shared panel with an internal grid), same
  // "every distinct piece gets its own box" pattern as the rest of LAYOUT.
  // Hidden Tiles sits on the left page, below the left rule column, not
  // spread edge-to-edge across both pages.
  houseRulesLeft: { left: 17.8, top: 43, width: 28.2, height: 13 } as Rect,
  houseRulesRight: { left: 53.8, top: 43, width: 29.2, height: 13 } as Rect,
  houseRulesHiddenTiles: { left: 53.8, top: 52, width: 29.2, height: 5 } as Rect,

  // Victory Points — label plaque and the −/value/+ counter widget are
  // independent rects (same "every distinct piece gets its own box"
  // pattern as the rest of LAYOUT), not one combined row.
  vpLabel: { left: 17.8, top: 63, width: 14, height: 8 } as Rect,
  vpCounter: { left: 31.5, top: 63.2, width: 16, height: 8 } as Rect,
  // The counter's number, positioned as a %-of-vpCounter box (vpCounter is
  // itself position:absolute, so it's a valid containing block for this
  // too) — independent of the −/+ hit zones below, which just split the
  // box in half and don't need their own tunable position.
  vpCounterValue: { left: 35, top: 10, width: 30, height: 80 } as Rect,

  joinGame: { left: 17.8, top: 71, width: 30.2, height: 10 } as Rect,
  startGame: { left: 53, top: 70.5, width: 30.2, height: 11 } as Rect,
} as const

const VP_TARGET_MIN = 3
const VP_TARGET_MAX = 50
const VP_TARGET_STEP = 1

export function GameSetupMenu({
  onStart,
  onHost,
  onJoinLobby,
}: {
  onStart: (info: GameStartInfo) => void
  onHost: (config: { playerCount: number; gameRules: GameRules }) => void
  onJoinLobby: (seed: { roomCode: string; selfName: string }) => void
}) {
  const [playerCount, setPlayerCount] = useState(2)
  const [mode, setMode] = useState<GameMode>('local')
  const [activeTab, setActiveTab] = useState<SetupTab>('expansions')
  const [gameRules, setGameRules] = useState<GameRules>(DEFAULT_GAME_RULES)
  const [isJoinOpen, setIsJoinOpen] = useState(false)

  // Conquer logo hover — JS-driven discrete steps (0-8), not a CSS
  // transition + steps(): a transition's steps(8, end) assumes the FULL
  // 8-frame distance every time, but rapid hover on/off interrupts it
  // mid-flight, so the NEXT transition covers a shorter distance while
  // still dividing it into 8 equal parts — landing off the 256px frame
  // grid and reproducing the exact "sliding" artifact steps() was meant to
  // fix. Stepping one frame at a time in JS always lands on an exact
  // multiple of 256px, however often it's interrupted and reversed.
  const [logoFrame, setLogoFrame] = useState(0)
  // Mirrors logoFrame synchronously — stepLogoTo needs to read the CURRENT
  // frame the instant it's called (to decide snap-vs-step), and state set
  // via the setter is only visible next render, not to code running in the
  // same tick.
  const logoFrameRef = useRef(0)
  const setLogoFrameBoth = (value: number) => {
    logoFrameRef.current = value
    setLogoFrame(value)
  }
  const logoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logoHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const LOGO_STEP_MS = 62 // ~500ms / 8 steps, matching the old transition's pace
  const stepLogoTo = (target: number) => {
    if (logoIntervalRef.current) clearInterval(logoIntervalRef.current)
    // Reversing after only a step or two still looks like a blink even
    // with the debounce below (a genuinely fast — not instant — swipe can
    // clear the debounce window, take 1-2 steps, then reverse): snapping
    // straight to idle instead of animating back down from a near-zero
    // frame removes the flash entirely rather than just shortening it.
    if (target === 0 && logoFrameRef.current <= 2) {
      setLogoFrameBoth(0)
      return
    }
    if (logoFrameRef.current === target) return
    logoIntervalRef.current = setInterval(() => {
      const next = logoFrameRef.current < target ? logoFrameRef.current + 1 : logoFrameRef.current - 1
      setLogoFrameBoth(next)
      if (next === target && logoIntervalRef.current) {
        clearInterval(logoIntervalRef.current)
        logoIntervalRef.current = null
      }
    }, LOGO_STEP_MS)
  }
  // A quick pass-over fires mouseenter+mouseleave within a few ms of each
  // other — each call to stepLogoTo restarts the interval from wherever it
  // currently sits, and a handful of these in quick succession reads as a
  // flash/flicker rather than a clean reveal. Debouncing means only a
  // hover that actually holds for a moment commits to stepping at all; a
  // pure pass-through never gets far enough to visibly change anything.
  // 180ms, not 100ms — a genuinely fast (not instant) swipe was still
  // occasionally clearing a 100ms window, triggering a step or two before
  // the reversal caught up.
  const requestLogoStep = (target: number) => {
    if (logoHoverTimeoutRef.current) clearTimeout(logoHoverTimeoutRef.current)
    logoHoverTimeoutRef.current = setTimeout(() => stepLogoTo(target), 180)
  }
  useEffect(() => () => {
    if (logoIntervalRef.current) clearInterval(logoIntervalRef.current)
    if (logoHoverTimeoutRef.current) clearTimeout(logoHoverTimeoutRef.current)
  }, [])

  // hidden-tile.glb is 46MB of baked mist texture — the one model in this
  // codebase deliberately NOT preloaded at module scope, since most sessions
  // never switch Hidden Tiles on and would pay the download for nothing.
  // Picking a mode here is the first honest signal it WILL be needed, and it
  // starts the fetch while the player is still setting up rather than at the
  // board mount that needs it: R3F wraps every Canvas child in ONE Suspense
  // boundary, so a cold first mist mount suspends the whole scene, not just
  // the fogged tile. useGLTF.preload is idempotent, so re-firing on each mode
  // change costs nothing.
  useEffect(() => {
    if (gameRules.hiddenTiles === 'off') return
    useGLTF.preload(hiddenTileUrl)
  }, [gameRules.hiddenTiles])

  // Shared by the House Rules tab pane — see HouseRulesDropdown's original
  // comment this carries forward: turning Knights off force-clears
  // Barbarians (which hard-depends on it) rather than leaving an invalid
  // combination.
  const setRule = <K extends keyof GameRules>(key: K, value: GameRules[K]) => {
    if (key === 'citiesAndKnightsKnights' && value === false) {
      setGameRules({ ...gameRules, citiesAndKnightsKnights: false, citiesAndKnightsBarbarians: false })
      return
    }
    setGameRules({ ...gameRules, [key]: value })
  }

  // Seafarers has no GameRules flag — see ExpansionSelector's own comment.
  // Purely local, cosmetic state until board-shape filtering is built.
  const [seafarersSelected, setSeafarersSelected] = useState(false)

  // The real board game exposes ONE Cities & Knights choice, not the 4
  // separate build-phase flags this project happens to model it with — this
  // toggle drives all 4 together. Pre-fills VP target to 13 (the standard
  // C&K winning score) only while the target is still untouched at its
  // default, same rule the old per-flag toggle carried.
  const citiesAndKnightsEnabled = gameRules.citiesAndKnightsCommodities
  const toggleCitiesAndKnights = (value: boolean) => {
    setGameRules({
      ...gameRules,
      citiesAndKnightsCommodities: value,
      citiesAndKnightsProgressCards: value,
      citiesAndKnightsKnights: value,
      citiesAndKnightsBarbarians: value,
      victoryPointTarget: value && gameRules.victoryPointTarget === WINNING_SCORE ? 13 : gameRules.victoryPointTarget,
    })
  }

  const setVpTarget = (next: number) => {
    setRule('victoryPointTarget', Math.min(VP_TARGET_MAX, Math.max(VP_TARGET_MIN, next)))
  }

  const activeExpansionCount = [seafarersSelected, citiesAndKnightsEnabled].filter(Boolean).length

  const handleStart = () => {
    if (mode === 'host') {
      onHost({ playerCount, gameRules })
      return
    }
    onStart({
      playerCount,
      names: Array.from({ length: playerCount }, (_, i) => `Player ${i + 1}`),
      gameRules,
      boardShapeId: 'standard',
    })
  }

  return (
    <div className="animate-victory-in">
      {/* Conquer wordmark — a 9-frame sprite sheet (crown lights up); hover
          steps forward one frame at a time (logoFrame state above), un-
          hover steps back down. tabIndex+focus give it the same reveal on
          keyboard focus, not just mouse hover. */}
      <button
        type="button"
        tabIndex={0}
        aria-label="Conquer"
        onMouseEnter={() => requestLogoStep(8)}
        onMouseLeave={() => requestLogoStep(0)}
        onFocus={() => requestLogoStep(8)}
        onBlur={() => requestLogoStep(0)}
        className="mx-auto mb-4 block h-auto cursor-default bg-no-repeat outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        style={{
          width: LAYOUT.logoWidthPx,
          aspectRatio: '917 / 449',
          backgroundImage: `url(${conquerLogoUrl})`,
          backgroundSize: '900% 100%',
          // Each frame is exactly one element-width wide (backgroundSize is
          // 900% = 9 frames), so the per-step offset must track logoWidthPx
          // directly — a hardcoded px value here only lands on frame
          // boundaries for whatever width happened to be current when it
          // was written, and silently drifts (visible as sliding/scrolling
          // instead of stepping) the next time logoWidthPx changes.
          backgroundPositionX: `${-logoFrame * LAYOUT.logoWidthPx}px`,
          imageRendering: 'pixelated',
        }}
      />
      {/*
        THESIS: An open storybook, not an app panel — configuration reads
        as filling in a rulebook's own character sheet, not a settings
        screen. OWN-WORLD: leather cover with gold corner brackets, cream
        parchment pages (pixellab, 2026-08-26, page texture hand-cleaned by
        the user in Aseprite), warm ink-brown text and tan parchment
        buttons — replaces the dark-navy/gold chrome used everywhere else
        in the pre-game flow, since gold-on-dark reads as invisible on a
        light page. STORY: unchanged from the tabbed-panel version — player
        count, mode, expansions/house rules, VP target, start or join.
        FIRST VIEWPORT: a wide two-page spread (not the narrower single
        tabbed panel), content placed per-page against the physical book art
        (LAYOUT above), expansion cards landing one per page. FORM: two-page
        book spread, chosen over the tabbed panel after the user's own
        reference mockup. FINISH: unreviewed and undocumented is unfinished;
        this build ends with the finish review, the verdict, and DESIGN.md.
      */}
      <div
        className="relative mx-auto"
        style={{
          width: '100%',
          maxWidth: LAYOUT.panelWidthPx,
          aspectRatio: `${LAYOUT.panelWidthPx} / ${LAYOUT.panelHeightPx}`,
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${openBookUrl})`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
            imageRendering: 'pixelated',
          }}
        />

        {/* Player count — always visible, not tabbed away (a single trivial
            choice). Split 1-3/4-6 across the two pages, not one 6-wide row. */}
        <span
          style={rectStyle(LAYOUT.playersLabel)}
          className={`font-body text-[11px] tracking-[0.15em] uppercase ${INK_MUTED}`}
        >
          Players
        </span>
        <div style={rectStyle(LAYOUT.playersLeft)} className="grid grid-cols-3 items-start gap-1.5">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPlayerCount(n)}
              aria-pressed={playerCount === n}
              aria-label={`${n} player${n === 1 ? '' : 's'}`}
              style={{ fontSize: LAYOUT.playersNumberFontSizePx }}
              className={`player-tile flex items-center justify-center font-display text-[#f1e0be] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                playerCount === n ? 'is-selected' : ''
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div style={rectStyle(LAYOUT.playersRight)} className="grid grid-cols-3 items-start gap-1.5">
          {[4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPlayerCount(n)}
              aria-pressed={playerCount === n}
              aria-label={`${n} player${n === 1 ? '' : 's'}`}
              style={{ fontSize: LAYOUT.playersNumberFontSizePx }}
              className={`player-tile flex items-center justify-center font-display text-[#f1e0be] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                playerCount === n ? 'is-selected' : ''
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        {/* Local vs. Host — the primary branch point, so it stays a top-level
            toggle, not a tab. Labels are baked into the button art itself (no
            text overlay needed); the "pressed" variant doubles as the
            persistent selected-state look, not just an :active flash. Split
            across the two pages same as the player tiles above. */}
        {/* rectStyle applied directly to the button, not a centering
            wrapper — .btn-local-play's own aspect-ratio only holds while
            one CSS dimension is left auto; setting BOTH width and height
            here overrides it (spec behavior, not a bug), so the rect's
            height actually resizes the button instead of just shifting
            where a width-driven box gets vertically centered. The art
            itself doesn't stretch: background-size: contain (index.css)
            letterboxes it to fit whatever box this is without distorting. */}
        <button
          type="button"
          onClick={() => setMode('local')}
          aria-pressed={mode === 'local'}
          aria-label="Local Play"
          style={rectStyle(LAYOUT.localPlay)}
          className={`btn-local-play focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${mode === 'local' ? 'is-selected' : ''}`}
        />
        <button
          type="button"
          onClick={() => setMode('host')}
          aria-pressed={mode === 'host'}
          aria-label="Host Online"
          style={rectStyle(LAYOUT.hostOnline)}
          className={`btn-host-online focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${mode === 'host' ? 'is-selected' : ''}`}
        />

        {/* Expansions / House Rules — wood plaque tabs, gold-rimmed pressed
            art doubles as the selected state (.is-selected), same
            convention as the Local Play/Host Online toggle. Independent
            rects, not a shared row, same fix as Local Play/Host Online:
            the rect goes straight on the button, not a flex wrapper. */}
        {(
          [
            { id: 'expansions' as const, label: 'Expansions', badge: activeExpansionCount, rect: LAYOUT.expansionsTab },
            { id: 'houseRules' as const, label: 'House Rules', badge: 0, rect: LAYOUT.houseRulesTab },
          ]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            aria-pressed={activeTab === tab.id}
            style={rectStyle(tab.rect)}
            className={`tab-banner relative flex items-center justify-center gap-1.5 font-display text-sm tracking-[0.05em] text-[#f1e0be] ${
              activeTab === tab.id ? 'is-selected' : ''
            }`}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span className="rounded-full bg-[#f1e0be]/20 px-1.5 py-0.5 font-body text-[10px] text-[#f1e0be]">
                {tab.badge}
              </span>
            )}
          </button>
        ))}

        {/* Expansion cards and House Rules each get their own rect (not one
            shared box) — only one tab shows at a time, but they hold very
            different content and need independent position/size. */}
        {activeTab === 'expansions' ? (
          <ExpansionSelector
            seafarersSelected={seafarersSelected}
            onToggleSeafarers={setSeafarersSelected}
            citiesAndKnightsEnabled={citiesAndKnightsEnabled}
            onToggleCitiesAndKnights={toggleCitiesAndKnights}
            leftCardStyle={rectStyle(LAYOUT.expansionCardLeft)}
            rightCardStyle={rectStyle(LAYOUT.expansionCardRight)}
          />
        ) : (
          <HouseRules
            rules={gameRules}
            onToggle={setRule}
            leftStyle={rectStyle(LAYOUT.houseRulesLeft)}
            rightStyle={rectStyle(LAYOUT.houseRulesRight)}
            hiddenTilesStyle={rectStyle(LAYOUT.houseRulesHiddenTiles)}
          />
        )}

        {/* Victory point target — reachable from either tab, not buried in a
            dropdown row. .vp-counter bakes the −/value/+ housing into one
            image (rotated 180° so − reads left/+ reads right, matching the
            handlers below) with no separate button sprites, so the actual
            hit targets are plain transparent halves of the box, not
            individually drawn buttons. The number is a separate absolutely-
            positioned overlay (its own tunable rect), not a flex child —
            pointer-events-none so clicks pass through to whichever half
            it's sitting on top of. */}
        <div
          style={rectStyle(LAYOUT.vpLabel)}
          className="vp-label flex items-center justify-center font-body text-[10px] tracking-[0.1em] uppercase text-black"
        >
          Victory Points
        </div>
        <div style={rectStyle(LAYOUT.vpCounter)} className="vp-counter flex items-stretch">
          <button
            type="button"
            onClick={() => setVpTarget(gameRules.victoryPointTarget - VP_TARGET_STEP)}
            aria-label="Decrease victory point target"
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => setVpTarget(gameRules.victoryPointTarget + VP_TARGET_STEP)}
            aria-label="Increase victory point target"
            className="flex-1"
          />
          <span
            style={rectStyle(LAYOUT.vpCounterValue)}
            className="pointer-events-none flex items-center justify-center font-data text-sm text-[#f1e0be]"
          >
            {gameRules.victoryPointTarget}
          </span>
        </div>

        {/* Join Existing Game / Start Game — both real buttons on the panel,
            not a ghost link floating below it. Labels baked into the art;
            :active swaps to the hand-drawn pressed sprite (index.css) for
            real click feedback, not a CSS scale trick. */}
        <button
          type="button"
          onClick={() => setIsJoinOpen(true)}
          aria-label="Join Existing Game"
          style={rectStyle(LAYOUT.joinGame)}
          className="btn-join-game focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        />
        <button
          type="button"
          onClick={handleStart}
          aria-label="Start Game"
          style={rectStyle(LAYOUT.startGame)}
          className="btn-start-game focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        />
      </div>

      {isJoinOpen && <JoinRoomModal onClose={() => setIsJoinOpen(false)} onStart={onStart} onJoinLobby={onJoinLobby} />}
    </div>
  )
}
