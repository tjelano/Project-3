import { useState } from 'react'
import mainMenuUrl from '../../assets/menu/main-menu.png'
import selectorPlayerUrl from '../../assets/menu/selector-player.png'
import selectorBorderUrl from '../../assets/menu/selector-border.png'
import boxJoinHostUrl from '../../assets/menu/box-join-host.png'
import textGameLocalUrl from '../../assets/menu/text-game-local.png'
import textGameOnlineUrl from '../../assets/menu/text-game-online.png'
import bookIconUrl from '../../assets/menu/house-rules/hr-book-icon.png'
import headerBarUrl from '../../assets/menu/house-rules/hr-header-bar.png'
import chevronButtonUrl from '../../assets/menu/house-rules/hr-chevron-button.png'
import { HouseRulesDropdown } from './HouseRulesDropdown'
import { JoinRoomModal } from './JoinRoomModal'
import { useHoverActive } from './useHoverActive'
import type { GameStartInfo } from './StartScreen'
import { DEFAULT_GAME_RULES, type GameRules } from '../../game/types'

type GameMode = 'local' | 'host'

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

// The panel's own shape — main-menu.png is natively 1536x1024, but these
// don't have to match that: change the ratio between them to stretch the
// whole panel (e.g. raise PANEL_WIDTH or lower PANEL_HEIGHT to go wider and
// less tall). Every LAYOUT box below is still a % of THIS box, so hit-targets
// stay lined up with the art automatically — no need to touch them too.
const PANEL_WIDTH = 1536
const PANEL_HEIGHT = 1024

// Every number here is a % of the panel box above — edit directly to line a
// hit-target up with the art (left/top/width/height are the box itself; the
// art re-scales with the panel at any size since these are percentages, not
// pixels). No live editor — just change the numbers and check the result in
// the browser.
const LAYOUT = {
  // One box per player-count number, 1 through 6.
  playerCount: [
    { left: 14.5, top: 26.5, width: 9.9, height: 14.5 },
    { left: 26.7, top: 26.5, width: 9.9, height: 14.5 },
    { left: 38.8, top: 26.5, width: 9.9, height: 14.5 },
    { left: 51.1, top: 26.5, width: 9.9, height: 14.5 },
    { left: 63.3, top: 26.5, width: 9.9, height: 14.5 },
    { left: 75.6, top: 26.5, width: 9.9, height: 14.5 },
  ] satisfies Rect[],
  // [Local, Host].
  gameMode: [
    { left: 21.5, top: 49.8, width: 19.5, height: 11 },
    { left: 59, top: 49.8, width: 19.5, height: 11 },
  ] satisfies Rect[],
  // The empty box hand-placed in main-menu.png for this — measured off the
  // art's own pixel grid (left 276 / top 710 / right 1258 / bottom 818 of
  // its 1536x1024 canvas). Always shows the book+bar+chevron header; click
  // toggles the rows panel below it.
  houseRulesBar: { left: 17.50, top: 70.34, width: 65.3, height: 10.80 } satisfies Rect,
  startGameButton: { left: 36.2, top: 84.5, width: 28.4, height: 9 } satisfies Rect,
  // Anchors HouseRulesDropdown just under houseRulesBar, re-centered on the
  // same midpoint now that it's wider than the header above it. top must
  // stay at or below houseRulesBar's own bottom edge (70.34 + 10.80 =
  // 81.14) — any higher and the dropdown's own (unclickable) top padding
  // overlaps the header's clickable area, since the dropdown wrapper sits
  // at a higher z-index and silently eats clicks meant for the header.
  // This panel sizes itself from its own content (no fixed aspect ratio
  // needed), so only left/top/width are used here — width is real layout,
  // not a CSS scale(), so it stays sharp at any value (see
  // HouseRulesDropdown.tsx).
  houseRulesDropdown: { left: -4.9, top: 81.2, width: 110 } satisfies Omit<Rect, 'height'>,
  // How far selector-player.png / selector-border.png extend past their
  // box's own edges, in % of that box's own size (a negative inset) — these
  // are frame art meant to wrap AROUND the box, not fill it exactly. X
  // (left/right) and Y (top/bottom) are separate so the border can be sized
  // wider/shorter independently of how tall or wide its box is.
  playerCountSelectorInsetXPct: 7,
  playerCountSelectorInsetYPct: 6,
  gameModeSelectorInsetXPct: 50,
  gameModeSelectorInsetYPct: 70,
  // Same idea, for the hover-only glow on Start Game — see
  // START_GAME_GLOW_IDLE_OPACITY/START_GAME_GLOW_ACTIVE_OPACITY below for
  // its opacity at rest vs. hovered/focused.
  startGameSelectorInsetXPct: -1,
  startGameSelectorInsetYPct: 55,
}

const START_GAME_GLOW_IDLE_OPACITY = 0
const START_GAME_GLOW_ACTIVE_OPACITY = 1

// House Rules header row sizing — one group for the header composite's own
// internal layout, separate from LAYOUT.houseRulesBar (which positions the
// button itself). The book icon and chevron both fill the button's full
// height directly (h-full); only the header bar and label need their own
// numbers here.
const HOUSE_RULES_HEADER = {
  // % of the button's own height — bigger than 100 lets the bar's art
  // overhang the button box slightly, matching its painted border weight.
  barHeightPct: 110,
  // How far the "Standard Rules" label sits from the button's left edge —
  // needs to clear the book icon (pinned to that same edge, on top of the
  // bar now that the bar is a full-width background rather than a separate
  // middle segment).
  labelLeftPx: 64,
  labelFontSizePx: 18,
}

// Nudges the "Join Existing Game" label off its default centered position
// (px, positive x = right, positive y = down).
const JOIN_EXISTING_GAME_TEXT_OFFSET = { x: 0, y: -4 }

function rectStyle({ left, top, width, height }: Rect) {
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }
}

const SETUP_TEXT_IMAGE_CLASS = 'pointer-events-none absolute max-w-none select-none'
// Tune each baked label independently: width controls its size, while left
// and top move the standalone artwork inside its button.
const SETUP_TEXT_LAYOUT = {
  local: { width: '120%', left: '5%', top: '8%' },
  online: { width: '125%', left: '5%', top: '8%' },
} as const

// Every hit-target here is a transparent <button> with no visible chrome of
// its own — the art underneath IS the button — so the browser's default
// focus outline (a plain dark 1px ring, shown on every click, not just
// keyboard nav) reads as an unexplained black border around whichever one
// was last pressed. Swapping to a gold ring, and only for focus-visible
// (keyboard/assistive nav, not mouse clicks), keeps the accessibility cue
// without that stray border on every click.
const HIT_TARGET_CLASS = 'absolute outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold'

// A selector-frame image tag (selector-player.png / selector-border.png)
// needs an EXPLICIT width/height to actually stretch to size — `inset`
// alone leaves width/height at their default `auto`, which for a replaced
// element like an image just renders it at the source file's own natural
// pixel size and repositions that fixed-size box, never resizing it.
// Computing an explicit box from the X/Y insets is what makes those numbers
// control size.
//
// mixBlendMode 'screen': these PNGs aren't cleanly cut out — sampling
// selector-player.png found ~24% of its canvas sitting at low-but-nonzero
// alpha (not the fully-transparent 0 a clean export would have), which
// reads as a faint dark border/background once composited. 'screen'
// blending makes black/dark content contribute nothing to the result
// (screen of black = the backdrop unchanged) while the bright gold stays
// fully visible — the standard fix for a glow-style asset exported against
// black instead of with real alpha, without needing to touch the PNG itself.
function selectorOverlayStyle(insetXPct: number, insetYPct: number) {
  return {
    left: `-${insetXPct}%`,
    top: `-${insetYPct}%`,
    width: `calc(100% + ${insetXPct * 2}%)`,
    height: `calc(100% + ${insetYPct * 2}%)`,
    // Tailwind's Preflight resets every image tag to `max-width: 100%` — a
    // SEPARATE property from `width` that still clamps it even though the
    // `width` above wins the cascade, since one doesn't override the other.
    // Without this, X insets past a certain point silently stopped growing
    // the image (capped at the button's own width) while Y kept working,
    // since Preflight has no matching max-height rule to fight.
    maxWidth: 'none',
    mixBlendMode: 'screen' as const,
  }
}

/**
 * Built directly on MainMenu.png — no hand-recreated chrome. Every
 * interactive element is a transparent hit-target absolutely positioned (in
 * % of the source image's own 1536x1024 canvas, see LAYOUT above) over the
 * painted slot it corresponds to, so it scales with the image at any width.
 * Board shape and player names/colors are deliberately NOT here — shape
 * selection is a separate screen (not yet built), and names/colors default
 * silently for now (per the "skip for now, default names" call).
 */
export function GameSetupMenu({
  onStart,
  onHost,
  onJoinLobby,
}: {
  onStart: (info: GameStartInfo) => void
  onHost: (config: { playerCount: number; gameRules: GameRules }) => void
  onJoinLobby: (seed: { roomCode: string; selfName: string }) => void
}) {
  const startGameGlow = useHoverActive()
  const [playerCount, setPlayerCount] = useState(2)
  const [mode, setMode] = useState<GameMode>('local')
  const [gameRules, setGameRules] = useState<GameRules>(DEFAULT_GAME_RULES)
  const [isHouseRulesOpen, setIsHouseRulesOpen] = useState(false)
  const [isJoinOpen, setIsJoinOpen] = useState(false)

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
    <div className="relative mx-auto w-full max-w-3xl animate-victory-in">
      <div className="relative w-full" style={{ aspectRatio: `${PANEL_WIDTH} / ${PANEL_HEIGHT}` }}>
        <img src={mainMenuUrl} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />

        {/* Player Count — one independently-positioned box per number.
            "1" is currently just a selectable slot that behaves like 2
            (reserved for a future dedicated single-player testing mode). */}
        {LAYOUT.playerCount.map((rect, index) => {
          const n = index + 1
          return (
            <button
              key={n}
              type="button"
              onClick={() => setPlayerCount(n)}
              aria-pressed={playerCount === n}
              aria-label={`${n} player${n === 1 ? '' : 's'}`}
              className={HIT_TARGET_CLASS}
              style={rectStyle(rect)}
            >
              {playerCount === n && (
                <img
                  src={selectorPlayerUrl}
                  alt=""
                  className="pointer-events-none absolute"
                  style={selectorOverlayStyle(
                    LAYOUT.playerCountSelectorInsetXPct,
                    LAYOUT.playerCountSelectorInsetYPct,
                  )}
                  draggable={false}
                />
              )}
            </button>
          )
        })}

        {/* Game Mode — [Local, Host]. */}
        {(['local', 'host'] as const).map((value, index) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            aria-pressed={mode === value}
            aria-label={value === 'local' ? 'Local pass-and-play' : 'Host online game'}
            className={HIT_TARGET_CLASS}
            style={rectStyle(LAYOUT.gameMode[index])}
          >
            <span className="pointer-events-none absolute inset-0 overflow-visible">
              <img
                src={index === 0 ? textGameLocalUrl : textGameOnlineUrl}
                alt=""
                className={SETUP_TEXT_IMAGE_CLASS}
                style={index === 0 ? SETUP_TEXT_LAYOUT.local : SETUP_TEXT_LAYOUT.online}
              />
            </span>
            {mode === value && (
              <img
                src={selectorBorderUrl}
                alt=""
                className="pointer-events-none absolute"
                style={selectorOverlayStyle(LAYOUT.gameModeSelectorInsetXPct, LAYOUT.gameModeSelectorInsetYPct)}
                draggable={false}
              />
            )}
          </button>
        ))}

        {/* House Rules — always-visible header row. hr-header-bar.png is now
            a full-width BACKGROUND for the whole row (not a middle segment
            squeezed between the icon and chevron) — book icon and chevron
            sit on top of it, pinned to the left/right edges. Clicking it
            toggles the rows panel; the chevron rotates to match. */}
        <button
          type="button"
          onClick={() => setIsHouseRulesOpen((prev) => !prev)}
          aria-expanded={isHouseRulesOpen}
          aria-label="House rules"
          className={`${HIT_TARGET_CLASS} relative`}
          style={rectStyle(LAYOUT.houseRulesBar)}
        >
          <img
            src={headerBarUrl}
            alt=""
            className="absolute left-0 top-1/2 w-full -translate-y-1/2 select-none"
            style={{ height: `${HOUSE_RULES_HEADER.barHeightPct}%` }}
            draggable={false}
          />
          <img
            src={bookIconUrl}
            alt=""
            className="absolute left-0 top-1/2 h-full -translate-y-1/2 select-none"
            draggable={false}
          />
          <span
            className="absolute inset-0 flex items-center font-display tracking-[0.1em] text-gold uppercase"
            style={{ fontSize: HOUSE_RULES_HEADER.labelFontSizePx, paddingLeft: HOUSE_RULES_HEADER.labelLeftPx }}
          >
            Standard Rules
          </span>
          <img
            src={chevronButtonUrl}
            alt=""
            className={`absolute right-0 top-1/2 h-full -translate-y-1/2 select-none transition-transform duration-300 ease-out ${isHouseRulesOpen ? 'rotate-180' : ''}`}
            draggable={false}
          />
        </button>

        {/* Start Game — the glowing pill at the bottom of the frame. */}
        <button
          type="button"
          onClick={handleStart}
          aria-label="Start game"
          className={`${HIT_TARGET_CLASS} transition-transform hover:scale-[1.02] active:scale-95`}
          style={rectStyle(LAYOUT.startGameButton)}
          {...startGameGlow.handlers}
        >
          <img
            src={selectorBorderUrl}
            alt=""
            className="pointer-events-none absolute transition-opacity"
            style={{
              ...selectorOverlayStyle(LAYOUT.startGameSelectorInsetXPct, LAYOUT.startGameSelectorInsetYPct),
              opacity: startGameGlow.isActive ? START_GAME_GLOW_ACTIVE_OPACITY : START_GAME_GLOW_IDLE_OPACITY,
            }}
            draggable={false}
          />
        </button>

        {/* House Rules dropdown — pops out OVER the panel (not pushing
            layout), anchored to the collapsed bar above it. */}
        {isHouseRulesOpen && (
          <div
            className="absolute z-20"
            style={{
              left: `${LAYOUT.houseRulesDropdown.left}%`,
              top: `${LAYOUT.houseRulesDropdown.top}%`,
              width: `${LAYOUT.houseRulesDropdown.width}%`,
            }}
          >
            <HouseRulesDropdown rules={gameRules} onChange={setGameRules} />
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={() => setIsJoinOpen(true)}
        className="relative mx-auto mt-3 block aspect-[2172/724] w-[55%] outline-none transition-transform hover:scale-[1.02] active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
      >
        <img src={boxJoinHostUrl} alt="" className="absolute inset-0 h-full w-full select-none" draggable={false} />
        <span
          className="absolute inset-0 flex items-center justify-center font-display text-sm tracking-[0.15em] text-gold uppercase"
          style={{ transform: `translate(${JOIN_EXISTING_GAME_TEXT_OFFSET.x}px, ${JOIN_EXISTING_GAME_TEXT_OFFSET.y}px)` }}
        >
          Join Existing Game
        </span>
      </button>

      {isJoinOpen && <JoinRoomModal onClose={() => setIsJoinOpen(false)} onStart={onStart} onJoinLobby={onJoinLobby} />}
    </div>
  )
}
