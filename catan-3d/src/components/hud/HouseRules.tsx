import type { CSSProperties } from 'react'
import { ToggleSwitch } from './ToggleSwitch'
import type { GameRules } from '../../game/types'

type RuleKey = keyof Pick<
  GameRules,
  'allowAdjacentSettlements' | 'friendlyRobber' | 'coastalOnlySetupPlacement' | 'noSevensFirstTwoRolls' | 'doublesRerollRule'
>

// Split left/right explicitly (not one list auto-flowed into a 2-col grid)
// so each side can be positioned independently against the book's two
// physical pages — same pairing as everything else in GameSetupMenu.tsx's
// LAYOUT, just applied to this component's own internal rows too.
const LEFT_RULES: { key: RuleKey; label: string }[] = [
  { key: 'allowAdjacentSettlements', label: 'Adjacent settlements allowed' },
  { key: 'coastalOnlySetupPlacement', label: 'Coastal setup only' },
  { key: 'doublesRerollRule', label: 'Doubles reroll (3 in a row)' },
]
const RIGHT_RULES: { key: RuleKey; label: string }[] = [
  { key: 'friendlyRobber', label: 'Friendly robber' },
  { key: 'noSevensFirstTwoRolls', label: 'No 7s on first 2 rolls' },
]

const HIDDEN_TILES_MODE_OPTIONS: { value: Exclude<GameRules['hiddenTiles'], 'off'>; label: string }[] = [
  { value: 'numbers', label: 'Numbers' },
  { value: 'resources', label: 'Resources' },
  { value: 'both', label: 'Both' },
]

function RuleRow({
  rule,
  checked,
  onToggle,
}: {
  rule: { key: RuleKey; label: string }
  checked: boolean
  onToggle: (key: RuleKey, value: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 border-b border-[#8a6d47]/30 py-1.5 last:border-b-0">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onToggle(rule.key, event.target.checked)}
        className="sr-only"
      />
      <span className="font-body text-sm text-[#4a3722]">{rule.label}</span>
      <ToggleSwitch checked={checked} />
    </label>
  )
}

export function HouseRules({
  rules,
  onToggle,
  leftStyle,
  rightStyle,
  hiddenTilesStyle,
}: {
  rules: GameRules
  onToggle: (key: keyof GameRules, value: GameRules[keyof GameRules]) => void
  leftStyle: CSSProperties
  rightStyle: CSSProperties
  hiddenTilesStyle: CSSProperties
}) {
  return (
    <>
      <div style={leftStyle} className="flex flex-col">
        {LEFT_RULES.map((rule) => (
          <RuleRow key={rule.key} rule={rule} checked={rules[rule.key]} onToggle={onToggle} />
        ))}
      </div>
      <div style={rightStyle} className="flex flex-col">
        {RIGHT_RULES.map((rule) => (
          <RuleRow key={rule.key} rule={rule} checked={rules[rule.key]} onToggle={onToggle} />
        ))}
      </div>

      {/* Hidden tiles — its own 4-way segmented control (not boolean, so it
          doesn't fit the toggle rows above). One row: label, mode buttons,
          switch. justify-between, not shrink-to-fit: text buttons refuse
          to shrink below their own content width regardless of flex-
          shrink (CSS's default min-width:auto on flex items), so trying to
          make width "compress" this row doesn't work — justify-between
          instead spreads the fixed-size children across whatever width IS
          set, so width does something real: it controls how far the
          switch sits from the buttons. */}
      <div style={hiddenTilesStyle} className="flex items-center justify-between gap-3">
        <span className="font-body text-sm text-[#4a3722]">Hidden tiles</span>
        <div className="flex gap-1.5">
          {HIDDEN_TILES_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle('hiddenTiles', rules.hiddenTiles === option.value ? 'off' : option.value)}
              aria-pressed={rules.hiddenTiles === option.value}
              className={`rounded-md border px-2 py-1 font-body text-xs transition-colors ${
                rules.hiddenTiles === option.value
                  ? 'border-[#7a3b1e] bg-[#7a3b1e]/15 text-[#7a3b1e]'
                  : 'border-[#8a6d47]/40 bg-[#8a6d47]/5 text-[#6b5540] hover:border-[#8a6d47]'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {/* Was off-only (always set 'off', never on) — fine while it was
            bundled with the "Hidden tiles" label as one combined unit, but
            now that it's a standalone control next to the mode buttons it
            reads as — and needs to behave like — a real two-way toggle.
            Defaults to "both" on the off→on flip, same as picking the most
            inclusive mode button directly; the exact specific mode is
            still whatever the buttons above last set. */}
        <button
          type="button"
          onClick={() => onToggle('hiddenTiles', rules.hiddenTiles === 'off' ? 'both' : 'off')}
          aria-label={rules.hiddenTiles === 'off' ? 'Turn on hidden tiles' : 'Turn off hidden tiles'}
          className="flex cursor-pointer items-center"
        >
          <ToggleSwitch checked={rules.hiddenTiles !== 'off'} />
        </button>
      </div>
    </>
  )
}
