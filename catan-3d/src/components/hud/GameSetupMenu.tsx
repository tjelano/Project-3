import { useState } from 'react'
import mainMenuUrl from '../../assets/menu/main-menu.png'
import selectorPlayerUrl from '../../assets/menu/selector-player.png'
import selectorBorderUrl from '../../assets/menu/selector-border.png'
import boxJoinHostUrl from '../../assets/menu/box-join-host.png'
import houseRulesDropdownUrl from '../../assets/menu/house-rules-dropdown.png'
import textGameLocalUrl from '../../assets/menu/text-game-local.png'
import textGameOnlineUrl from '../../assets/menu/text-game-online.png'
import textGameStandardRulesUrl from '../../assets/menu/text-game-standard-rules.png'
import { DEFAULT_GAME_RULES } from './HouseRulesEditor'
import { JoinRoomModal } from './JoinRoomModal'
import { useHoverActive } from './useHoverActive'
import type { GameStartInfo } from './StartScreen'
import type { GameRules } from '../../game/types'

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
  houseRulesBar: { left: 14, top: 69.8, width: 72.3, height: 12.3 } satisfies Rect,
  startGameButton: { left: 36.2, top: 84.5, width: 28.4, height: 9 } satisfies Rect,
  // Anchors the house-rules-dropdown.png overlay: left/top line its top-left
  // corner up with the collapsed bar above. width is bigger than the bar's
  // own 72.3 because the dropdown art's painted frame only fills the left
  // ~64% of its own canvas (the rest is transparent padding) — width here
  // is sized against that painted portion, not the full image edge to edge.
  houseRulesDropdown: { left: 16, top: 65, width: 68 } satisfies Omit<Rect, 'height'>,
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

// Nudges the "Join Existing Game" label off its default centered position
// (px, positive x = right, positive y = down).
const JOIN_EXISTING_GAME_TEXT_OFFSET = { x: 0, y: -4 }

function rectStyle({ left, top, width, height }: Rect) {
  return { left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }
}

// house-rules-dropdown.png's own 1230x1278 canvas, painted content only
// (see LAYOUT.houseRulesDropdown's comment on the transparent right padding).
const HOUSE_RULES_DROPDOWN_ASPECT = '1230 / 1278'

// Maps GameRules' 5 checkboxes + 1 number field onto the dropdown art's 6
// icon rows (book, swords, coins, dice, crown, gear, top to bottom) — paired
// by closest thematic fit to each icon. Not confirmed with the user yet:
// reorder this array if a different pairing reads better — the row
// positions in HOUSE_RULE_ROW_Y don't need to change to do that.
const HOUSE_RULE_ORDER: (
  | { key: 'friendlyRobber' | 'noSevensFirstTwoRolls' | 'allowAdjacentSettlements' | 'coastalOnlySetupPlacement' | 'doublesRerollRule'; label: string; type: 'checkbox' }
  | { key: 'victoryPointTarget'; label: string; type: 'number' }
)[] = [
  { key: 'allowAdjacentSettlements', label: 'Adjacent settlements allowed', type: 'checkbox' },
  { key: 'friendlyRobber', label: 'Friendly robber', type: 'checkbox' },
  { key: 'coastalOnlySetupPlacement', label: 'Coastal setup only', type: 'checkbox' },
  { key: 'noSevensFirstTwoRolls', label: 'No 7s on first 2 rolls', type: 'checkbox' },
  { key: 'victoryPointTarget', label: 'Victory point target', type: 'number' },
  { key: 'doublesRerollRule', label: 'Doubles reroll (3 in a row)', type: 'checkbox' },
]

// One entry per HOUSE_RULE_ORDER row, top to bottom, in % of the dropdown
// art's own canvas — read off the painted row bars via the grid overlay tool.
const HOUSE_RULE_ROW_Y = [
  { top: 22, height: 10 },
  { top: 32.5, height: 10 },
  { top: 42.5, height: 10 },
  { top: 53.5, height: 10 },
  { top: 64.5, height: 10 },
  { top: 74.5, height: 10 },
]
// Every row's blank text bar sits at the same x range.
const HOUSE_RULE_ROW_X = { left: 30, width: 50 }

// The chevron box baked into the dropdown art's upper-right header — the
// hitbox covers the full framed button so it is easy to click.
const HOUSE_RULES_CLOSE_BUTTON = { left: 82, top: 1, width: 16, height: 18 } satisfies Rect

const SETUP_TEXT_IMAGE_CLASS = 'pointer-events-none absolute max-w-none select-none'
// Tune each baked label independently: width controls its size, while left
// and top move the standalone artwork inside its button.
const SETUP_TEXT_LAYOUT = {
  local: { width: '120%', left: '5%', top: '8%' },
  online: { width: '125%', left: '5%', top: '8%' },
  standardRules: { width: '50%', left: '25%', top: '5%' },
} as const

const VP_TARGET_MIN = 3
const VP_TARGET_MAX = 50

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
  // A separate live draft for the VP-target field — committing every
  // keystroke straight to gameRules.victoryPointTarget let an in-progress
  // edit (e.g. an empty field while retyping, or a leading digit under
  // VP_TARGET_MIN) briefly become the REAL target, which ends the match
  // immediately once anyone reaches that many points. Only clamped +
  // committed on blur; free to type anything in between.
  const [vpTargetDraft, setVpTargetDraft] = useState(String(DEFAULT_GAME_RULES.victoryPointTarget))

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

        {/* House Rules — the whole painted bar toggles the panel below. */}
        <button
          type="button"
          onClick={() => setIsHouseRulesOpen((prev) => !prev)}
          aria-expanded={isHouseRulesOpen}
          aria-label="House rules"
          className={HIT_TARGET_CLASS}
          style={rectStyle(LAYOUT.houseRulesBar)}
        >
          <span className="pointer-events-none absolute inset-0 overflow-visible">
            <img
              src={textGameStandardRulesUrl}
              alt=""
              className={SETUP_TEXT_IMAGE_CLASS}
              style={SETUP_TEXT_LAYOUT.standardRules}
            />
          </span>
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
            layout) on top of house-rules-dropdown.png, anchored to the
            collapsed bar above it. */}
        {isHouseRulesOpen && (
          <div
            className="absolute z-20 animate-house-rules-in"
            style={{
              left: `${LAYOUT.houseRulesDropdown.left}%`,
              top: `${LAYOUT.houseRulesDropdown.top}%`,
              width: `${LAYOUT.houseRulesDropdown.width}%`,
            }}
          >
            <div className="relative w-full" style={{ aspectRatio: HOUSE_RULES_DROPDOWN_ASPECT }}>
              <img
                src={houseRulesDropdownUrl}
                alt=""
                className="absolute inset-0 h-full w-full select-none"
                draggable={false}
              />

              {/* Chevron in the dropdown's own header — closes it back down. */}
              <button
                type="button"
                onClick={() => setIsHouseRulesOpen(false)}
                aria-label="Close house rules"
                className={HIT_TARGET_CLASS}
                style={rectStyle(HOUSE_RULES_CLOSE_BUTTON)}
              />

              {HOUSE_RULE_ORDER.map((rule, index) => {
                const row = HOUSE_RULE_ROW_Y[index]
                return (
                  <label
                    key={rule.key}
                    className="absolute flex cursor-pointer items-center justify-between gap-2 px-2"
                    style={{
                      left: `${HOUSE_RULE_ROW_X.left}%`,
                      top: `${row.top}%`,
                      width: `${HOUSE_RULE_ROW_X.width}%`,
                      height: `${row.height}%`,
                    }}
                  >
                    <span className="truncate font-body text-[11px] text-white/80">{rule.label}</span>
                    {rule.type === 'checkbox' ? (
                      <input
                        type="checkbox"
                        checked={gameRules[rule.key]}
                        onChange={(event) => setGameRules({ ...gameRules, [rule.key]: event.target.checked })}
                        className="h-4 w-4 shrink-0 accent-gold"
                      />
                    ) : (
                      <input
                        type="number"
                        min={VP_TARGET_MIN}
                        max={VP_TARGET_MAX}
                        value={vpTargetDraft}
                        onChange={(event) => setVpTargetDraft(event.target.value)}
                        onBlur={() => {
                          const parsed = Number(vpTargetDraft)
                          const clamped = Number.isNaN(parsed)
                            ? gameRules.victoryPointTarget
                            : Math.min(VP_TARGET_MAX, Math.max(VP_TARGET_MIN, parsed))
                          setGameRules({ ...gameRules, victoryPointTarget: clamped })
                          setVpTargetDraft(String(clamped))
                        }}
                        onClick={(event) => event.stopPropagation()}
                        className="w-12 shrink-0 rounded-md border border-glass-border bg-white/5 px-1 text-center font-body text-xs text-white focus:outline-none"
                      />
                    )}
                  </label>
                )
              })}
            </div>
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
