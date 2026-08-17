import toggleOffUrl from '../../assets/menu/house-rules/hr-toggle-off.png'
import toggleOnUrl from '../../assets/menu/house-rules/hr-toggle-on.png'
import panelBgUrl from '../../assets/menu/house-rules/hr-panel-bg.png'
import { useDraftNumberField } from './useDraftNumberField'
import { WINNING_SCORE, type GameRules } from '../../game/types'

const VP_TARGET_MIN = 3
const VP_TARGET_MAX = 50

// The 5 checkbox rules fill 5 of a 2x3 grid's 6 cells, leaving one open —
// add a 6th checkbox rule here and it drops straight into that last cell.
// A 7th+ rule extends the grid to 2x4 (bump GRID_ROW_COUNT accordingly).
const CHECKBOX_RULES: { key: 'friendlyRobber' | 'noSevensFirstTwoRolls' | 'allowAdjacentSettlements' | 'coastalOnlySetupPlacement' | 'doublesRerollRule' | 'citiesAndKnightsCommodities' | 'citiesAndKnightsProgressCards'; label: string }[] = [
  { key: 'allowAdjacentSettlements', label: 'Adjacent settlements allowed' },
  { key: 'friendlyRobber', label: 'Friendly robber' },
  { key: 'coastalOnlySetupPlacement', label: 'Coastal setup only' },
  { key: 'noSevensFirstTwoRolls', label: 'No 7s on first 2 rolls' },
  { key: 'doublesRerollRule', label: 'Doubles reroll (3 in a row)' },
  { key: 'citiesAndKnightsCommodities', label: 'Commodities & city improvements' },
  { key: 'citiesAndKnightsProgressCards', label: 'Progress cards' },
]

// hiddenTiles is 4-way, not a plain boolean — its own segmented-control row
// rather than a CHECKBOX_RULES entry. 'off' isn't a segmented button here;
// it's the row's own ring icon (filled when any mode is active, hollow
// when off), matching every other row's icon-means-current-state language
// instead of reading as a 4th equal option.
const HIDDEN_TILES_MODE_OPTIONS: { value: Exclude<GameRules['hiddenTiles'], 'off'>; label: string }[] = [
  { value: 'numbers', label: 'Numbers' },
  { value: 'resources', label: 'Resources' },
  { value: 'both', label: 'Both' },
]

// Plain rows now (no per-row bar image) — a ring + label, separated by a
// thin hairline border instead of painted chrome. One size/spacing group
// for the whole grid, not a control per row.
const ROW_FONT_SIZE_PX = 20
const ROW_VERTICAL_PADDING_PX = 8
const ROW_RING_SIZE_PX = 32
const ROW_RING_GAP_PX = 10
const GRID_GAP_X_PX = 40
const GRID_DIVIDER_COLOR = 'rgba(200, 169, 62, 0.25)'

// Outer frame padding — hr-panel-bg.png's own border needs room between
// itself and the content sitting on top of it.
const PANEL_PADDING_PX = 28

const STAGGER_STEP_MS = 60

// The panel's own position/size is fully owned by GameSetupMenu.tsx's
// LAYOUT.houseRulesDropdown (a layout %) — resize or nudge it there, not
// here. A local px-based transform would be a second, mismatched coordinate
// system for positioning the same object (px nudges don't scale the way the
// parent's % ones do if the panel is later resized) — see the CSS-scale()
// blur note in the git history for why a stretch transform isn't the fix
// for sizing either.

function RuleRow({
  label,
  checked,
  onToggle,
  showDivider,
  animationDelay,
}: {
  label: string
  checked: boolean
  onToggle: (checked: boolean) => void
  showDivider: boolean
  animationDelay: string
}) {
  return (
    <label
      className="flex cursor-pointer items-center animate-house-rules-row-in"
      style={{
        gap: ROW_RING_GAP_PX,
        paddingTop: ROW_VERTICAL_PADDING_PX,
        paddingBottom: ROW_VERTICAL_PADDING_PX,
        borderBottom: showDivider ? `1px solid ${GRID_DIVIDER_COLOR}` : undefined,
        animationDelay,
      }}
    >
      <input type="checkbox" checked={checked} onChange={(event) => onToggle(event.target.checked)} className="sr-only" />
      <img
        src={checked ? toggleOnUrl : toggleOffUrl}
        alt=""
        className="pointer-events-none shrink-0 select-none"
        style={{ width: ROW_RING_SIZE_PX, height: ROW_RING_SIZE_PX }}
        draggable={false}
      />
      <span
        className="truncate font-display text-gold"
        style={{ fontSize: ROW_FONT_SIZE_PX }}
      >
        {label}
      </span>
    </label>
  )
}

/**
 * Just the rules — the book/bar/chevron header now lives permanently in
 * GameSetupMenu.tsx (it always shows; this panel is what appears/disappears
 * underneath it). Plain rows (ring + label, hairline dividers) inside one
 * bordered frame (hr-panel-bg.png) rather than painted per-row bars — a
 * cleaner, more minimal look than the earlier painted-chrome version.
 * Rules lay out in a 2-column grid with the victory-point target as its own
 * full-width row below; each cascades in with a staggered delay instead of
 * the whole panel popping in at once.
 */
export function HouseRulesDropdown({
  rules,
  onChange,
}: {
  rules: GameRules
  onChange: (rules: GameRules) => void
}) {
  const setRule = <K extends keyof GameRules>(key: K, value: GameRules[K]) => {
    // Toggling Commodities & City Improvements on pre-fills the VP target to
    // 13 (the standard C&K winning score) — but only while the target is
    // still untouched at its default. A player who already customized
    // victoryPointTarget before toggling this on keeps their own value.
    if (key === 'citiesAndKnightsCommodities' && value === true && rules.victoryPointTarget === WINNING_SCORE) {
      onChange({ ...rules, citiesAndKnightsCommodities: true, victoryPointTarget: 13 })
      return
    }
    onChange({ ...rules, [key]: value })
  }

  const vpTarget = useDraftNumberField({
    value: rules.victoryPointTarget,
    min: VP_TARGET_MIN,
    max: VP_TARGET_MAX,
    onCommit: (clamped) => setRule('victoryPointTarget', clamped),
  })

  return (
    <div className="relative animate-house-rules-in shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
      <img
        src={panelBgUrl}
        alt=""
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
        style={{ objectFit: 'fill' }}
        draggable={false}
      />

      <div className="relative" style={{ padding: PANEL_PADDING_PX }}>
        <div className="grid grid-cols-2" style={{ columnGap: GRID_GAP_X_PX }}>
          {CHECKBOX_RULES.map((rule, index) => (
            <RuleRow
              key={rule.key}
              label={rule.label}
              checked={rules[rule.key]}
              onToggle={(checked) => setRule(rule.key, checked)}
              showDivider={index < CHECKBOX_RULES.length - 1}
              animationDelay={`${index * STAGGER_STEP_MS}ms`}
            />
          ))}
        </div>

        <div
          className="flex items-center justify-between animate-house-rules-row-in"
          style={{
            gap: ROW_RING_GAP_PX,
            paddingTop: ROW_VERTICAL_PADDING_PX,
            paddingBottom: ROW_VERTICAL_PADDING_PX,
            borderTop: `1px solid ${GRID_DIVIDER_COLOR}`,
            animationDelay: `${CHECKBOX_RULES.length * STAGGER_STEP_MS}ms`,
          }}
        >
          <button
            type="button"
            onClick={() => setRule('hiddenTiles', 'off')}
            aria-label="Turn off hidden tiles"
            className="flex cursor-pointer items-center"
            style={{ gap: ROW_RING_GAP_PX }}
          >
            <img
              src={rules.hiddenTiles === 'off' ? toggleOffUrl : toggleOnUrl}
              alt=""
              className="pointer-events-none shrink-0 select-none"
              style={{ width: ROW_RING_SIZE_PX, height: ROW_RING_SIZE_PX }}
              draggable={false}
            />
            <span className="truncate font-display text-gold" style={{ fontSize: ROW_FONT_SIZE_PX }}>
              Hidden tiles
            </span>
          </button>
          <div className="flex shrink-0" style={{ gap: ROW_RING_GAP_PX / 2 }}>
            {HIDDEN_TILES_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRule('hiddenTiles', rules.hiddenTiles === option.value ? 'off' : option.value)}
                aria-pressed={rules.hiddenTiles === option.value}
                className={`rounded-md border px-2 py-1 font-body text-xs transition-colors ${
                  rules.hiddenTiles === option.value
                    ? 'border-gold bg-gold/20 text-gold'
                    : 'border-glass-border bg-white/5 text-white/70'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex items-center justify-center animate-house-rules-row-in"
          style={{
            gap: ROW_RING_GAP_PX,
            paddingTop: ROW_VERTICAL_PADDING_PX,
            paddingBottom: ROW_VERTICAL_PADDING_PX,
            borderTop: `1px solid ${GRID_DIVIDER_COLOR}`,
            animationDelay: `${(CHECKBOX_RULES.length + 1) * STAGGER_STEP_MS}ms`,
          }}
        >
          <input
            type="number"
            min={VP_TARGET_MIN}
            max={VP_TARGET_MAX}
            value={vpTarget.text}
            onChange={(event) => vpTarget.setText(event.target.value)}
            onBlur={vpTarget.commit}
            className="w-14 shrink-0 rounded-md border border-glass-border bg-white/5 px-1 py-1 text-center font-body text-sm text-white focus:outline-none"
          />
          <span className="truncate font-display text-gold" style={{ fontSize: ROW_FONT_SIZE_PX }}>
            Victory point target
          </span>
        </div>
      </div>
    </div>
  )
}
