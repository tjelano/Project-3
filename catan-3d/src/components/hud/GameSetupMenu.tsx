import { useEffect, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import hiddenTileUrl from '../../assets/models/hidden-tile.glb'
import conquerLogoUrl from '../../assets/menu/conquer-logo.png'
import { ExpansionSelector } from './ExpansionSelector'
import { HouseRules } from './HouseRules'
import { JoinRoomModal } from './JoinRoomModal'
import type { GameStartInfo } from './StartScreen'
import { DEFAULT_GAME_RULES, WINNING_SCORE, type GameRules } from '../../game/types'

type GameMode = 'local' | 'host'
type SetupTab = 'expansions' | 'houseRules'

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
  const logoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const logoHoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const LOGO_STEP_MS = 62 // ~500ms / 8 steps, matching the old transition's pace
  const stepLogoTo = (target: number) => {
    if (logoIntervalRef.current) clearInterval(logoIntervalRef.current)
    logoIntervalRef.current = setInterval(() => {
      setLogoFrame((prev) => {
        const next = prev < target ? prev + 1 : prev - 1
        if (next === target && logoIntervalRef.current) {
          clearInterval(logoIntervalRef.current)
          logoIntervalRef.current = null
        }
        return next
      })
    }, LOGO_STEP_MS)
  }
  // A quick pass-over fires mouseenter+mouseleave within a few ms of each
  // other — each call to stepLogoTo restarts the interval from wherever it
  // currently sits, and a handful of these in quick succession reads as a
  // flash/flicker rather than a clean reveal. Debouncing means only a
  // hover that actually holds for a moment commits to stepping at all; a
  // pure pass-through never gets far enough to visibly change anything.
  const requestLogoStep = (target: number) => {
    if (logoHoverTimeoutRef.current) clearTimeout(logoHoverTimeoutRef.current)
    logoHoverTimeoutRef.current = setTimeout(() => stepLogoTo(target), 100)
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
    <div className="mx-auto w-full max-w-lg animate-victory-in">
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
        className="mx-auto mb-4 block h-auto w-64 cursor-default bg-no-repeat outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
        style={{
          aspectRatio: '917 / 449',
          backgroundImage: `url(${conquerLogoUrl})`,
          backgroundSize: '900% 100%',
          backgroundPositionX: `${-logoFrame * 256}px`,
          imageRendering: 'pixelated',
        }}
      />
      {/*
        THESIS: Replace the painted-overlay pre-game screen with a real,
        componentized settings panel — configuration reads as a clean game
        launcher, not a static illustration with invisible hotspots.
        OWN-WORLD: Dark glass panel (--color-glass/--color-glass-border)
        with gold accents (--color-gold) on Georgia display type; underline
        tabs, toggle-switch cards, a persistent gold Start bar — inherited
        from the existing medieval/gold token system, executed at lower
        intensity than the previous painted-PNG screens.
        STORY: A returning Catan player picks player count and mode, opens
        Expansions/House Rules tabs to fine-tune, sees VP target and a live
        summary always available, and starts or joins in one click.
        FIRST VIEWPORT: Centered panel (~32rem), gold wordmark header,
        player count + mode row beneath it, two-tab content pane, persistent
        footer (VP stepper row, then Join Existing Game and Start Game as
        two real buttons side by side).
        FORM: Tabbed Panel (standing exit / category standard),
        user-selected over the assigned Radial Table Hub and the Origami
        Assembly challenger; seed key 1cdc4f88.
        FINISH: unreviewed and undocumented is unfinished; this build ends
        with the finish review, the verdict, and DESIGN.md.
      */}
      <div className="ui-panel glow-gold-lift bg-glass p-6 backdrop-blur-xl">
        {/* Player count — always visible, not tabbed away (a single trivial choice). */}
        <div>
          <span className="font-body text-[11px] tracking-[0.15em] text-white/40 uppercase">Players</span>
          <div className="mt-1.5 grid grid-cols-6 gap-1.5">
            {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setPlayerCount(n)}
                aria-pressed={playerCount === n}
                aria-label={`${n} player${n === 1 ? '' : 's'}`}
                className={`ui-square py-2 font-display text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                  playerCount === n ? 'glow-gold-sm bg-gold/10 text-gold' : 'text-white/60 hover:text-gold'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {/* Local vs. Host — the primary branch point, so it stays a top-level toggle, not a tab. */}
        <div className="mt-4 grid grid-cols-2 gap-1.5">
          {(['local', 'host'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              aria-pressed={mode === value}
              className={`ui-button py-2 font-display text-sm tracking-[0.1em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                mode === value ? 'glow-gold-sm bg-gold/10 text-gold' : 'text-white/60 hover:text-gold'
              }`}
            >
              {value === 'local' ? 'Local Play' : 'Host Online'}
            </button>
          ))}
        </div>

        {/* Expansions / House Rules — underline tabs, the two categories with enough
            items to be worth hiding behind a click. */}
        <div className="mt-5">
          <div className="flex gap-5 border-b border-glass-border">
            {(
              [
                { id: 'expansions' as const, label: 'Expansions', badge: activeExpansionCount },
                { id: 'houseRules' as const, label: 'House Rules', badge: 0 },
              ]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-pressed={activeTab === tab.id}
                className={`relative -mb-px flex items-center gap-1.5 border-b-2 pb-2 font-display text-sm tracking-[0.05em] transition-colors ${
                  activeTab === tab.id ? 'border-gold text-gold' : 'border-transparent text-white/50 hover:text-white/80'
                }`}
              >
                {tab.label}
                {tab.badge > 0 && (
                  <span className="rounded-full bg-gold/20 px-1.5 py-0.5 font-body text-[10px] text-gold">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>
          <div className="pt-3">
            {activeTab === 'expansions' ? (
              <ExpansionSelector
                seafarersSelected={seafarersSelected}
                onToggleSeafarers={setSeafarersSelected}
                citiesAndKnightsEnabled={citiesAndKnightsEnabled}
                onToggleCitiesAndKnights={toggleCitiesAndKnights}
              />
            ) : (
              <HouseRules rules={gameRules} onToggle={setRule} />
            )}
          </div>
        </div>

        {/* Persistent footer — VP target promoted here (no longer buried in a
            dropdown row), reachable from either tab. Start Game and Join
            Existing Game are both real buttons on the panel now, not a
            ghost link floating below it. */}
        <div className="mt-5 border-t border-glass-border pt-4">
          <div className="flex items-center gap-2">
            <span className="font-body text-[11px] tracking-[0.1em] text-white/40 uppercase">Victory Points</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setVpTarget(gameRules.victoryPointTarget - VP_TARGET_STEP)}
                aria-label="Decrease victory point target"
                className="ui-square flex h-6 w-6 items-center justify-center font-body text-white/70 hover:text-gold"
              >
                −
              </button>
              <span className="w-6 text-center font-data text-sm text-gold">{gameRules.victoryPointTarget}</span>
              <button
                type="button"
                onClick={() => setVpTarget(gameRules.victoryPointTarget + VP_TARGET_STEP)}
                aria-label="Increase victory point target"
                className="ui-square flex h-6 w-6 items-center justify-center font-body text-white/70 hover:text-gold"
              >
                +
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setIsJoinOpen(true)}
              className="ui-button py-2 font-display text-sm tracking-[0.1em] text-white/70 uppercase transition-colors hover:text-gold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
            >
              Join Existing Game
            </button>
            <button
              type="button"
              onClick={handleStart}
              className="ui-button glow-gold py-2 font-display text-sm tracking-[0.15em] text-gold uppercase transition-transform hover:scale-[1.02] active:scale-95"
            >
              Start Game
            </button>
          </div>
        </div>
      </div>

      {isJoinOpen && <JoinRoomModal onClose={() => setIsJoinOpen(false)} onStart={onStart} onJoinLobby={onJoinLobby} />}
    </div>
  )
}
