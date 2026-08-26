import { ToggleSwitch } from './ToggleSwitch'
import type { GameRules } from '../../game/types'

// The misc-variant remainder of the old flat 9-checkbox HouseRulesDropdown,
// once the 4 Cities & Knights expansion phases move to ExpansionSelector.
// hiddenTiles and victoryPointTarget are NOT here: hiddenTiles keeps its own
// segmented row below (it's 4-way, not boolean), and victoryPointTarget is
// promoted to GameSetupMenu's persistent footer instead of buried in a tab.
const RULES: { key: keyof Pick<GameRules, 'allowAdjacentSettlements' | 'friendlyRobber' | 'coastalOnlySetupPlacement' | 'noSevensFirstTwoRolls' | 'doublesRerollRule'>; label: string }[] = [
  { key: 'allowAdjacentSettlements', label: 'Adjacent settlements allowed' },
  { key: 'friendlyRobber', label: 'Friendly robber' },
  { key: 'coastalOnlySetupPlacement', label: 'Coastal setup only' },
  { key: 'noSevensFirstTwoRolls', label: 'No 7s on first 2 rolls' },
  { key: 'doublesRerollRule', label: 'Doubles reroll (3 in a row)' },
]

const HIDDEN_TILES_MODE_OPTIONS: { value: Exclude<GameRules['hiddenTiles'], 'off'>; label: string }[] = [
  { value: 'numbers', label: 'Numbers' },
  { value: 'resources', label: 'Resources' },
  { value: 'both', label: 'Both' },
]

export function HouseRules({
  rules,
  onToggle,
}: {
  rules: GameRules
  onToggle: (key: keyof GameRules, value: GameRules[keyof GameRules]) => void
}) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-x-6">
        {RULES.map((rule) => (
          <label
            key={rule.key}
            className="flex cursor-pointer items-center justify-between gap-3 border-b border-glass-border py-2 last:border-b-0 sm:last:border-b sm:[&:nth-last-child(-n+2)]:border-b-0"
          >
            <input
              type="checkbox"
              checked={rules[rule.key]}
              onChange={(event) => onToggle(rule.key, event.target.checked)}
              className="sr-only"
            />
            <span className="font-body text-sm text-white/80">{rule.label}</span>
            <ToggleSwitch checked={rules[rule.key]} />
          </label>
        ))}
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 border-t border-glass-border pt-3">
        <button
          type="button"
          onClick={() => onToggle('hiddenTiles', 'off')}
          aria-label="Turn off hidden tiles"
          className="flex cursor-pointer items-center gap-3"
        >
          <ToggleSwitch checked={rules.hiddenTiles !== 'off'} />
          <span className="font-body text-sm text-white/80">Hidden tiles</span>
        </button>
        <div className="flex shrink-0 gap-1.5">
          {HIDDEN_TILES_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onToggle('hiddenTiles', rules.hiddenTiles === option.value ? 'off' : option.value)}
              aria-pressed={rules.hiddenTiles === option.value}
              className={`rounded-md border px-2 py-1 font-body text-xs transition-colors ${
                rules.hiddenTiles === option.value
                  ? 'border-gold bg-gold/20 text-gold'
                  : 'border-glass-border bg-white/5 text-white/60 hover:border-gold/25'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
