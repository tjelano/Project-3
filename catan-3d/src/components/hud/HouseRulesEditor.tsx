import { useState } from 'react'
import { DEFAULT_GAME_RULES, type GameRules } from '../../game/types'

const VP_TARGET_MIN = 3
const VP_TARGET_MAX = 50

const CHECKBOX_ROW =
  'flex items-center justify-between gap-2 rounded-lg border border-glass-border bg-white/5 px-3 py-2'
const CHECKBOX_LABEL = 'font-body text-xs text-white/80'
const CHECKBOX_CLASS = 'h-4 w-4 accent-gold'

/**
 * Shared by LocalSetup.tsx and OnlineSetup.tsx (host only, there) — one
 * definition of the house-rules form so the two setup flows can never drift
 * out of sync with each other or with GameRules itself.
 */
export function HouseRulesEditor({
  rules,
  onChange,
}: {
  rules: GameRules
  onChange: (rules: GameRules) => void
}) {
  const setRule = <K extends keyof GameRules>(key: K, value: GameRules[K]) => {
    onChange({ ...rules, [key]: value })
  }

  // Decoupled from rules.victoryPointTarget while typing — a controlled
  // input tied directly to a clamped number can't ever show an empty or
  // single-digit-in-progress string (Number('') is 0, not NaN, so clamping
  // on every keystroke snaps straight back to the minimum the instant the
  // field is cleared, before a new value can be typed). Only commits back
  // out on blur.
  const [vpText, setVpText] = useState(String(rules.victoryPointTarget))
  // Re-syncs from an external prop change (e.g. an online lobby's host
  // editing rules broadcasts a whole new GameRules object) during render,
  // per React's "adjusting state when a prop changes" pattern — avoids an
  // extra render pass a useEffect-based sync would cost here.
  const [prevTarget, setPrevTarget] = useState(rules.victoryPointTarget)
  if (rules.victoryPointTarget !== prevTarget) {
    setPrevTarget(rules.victoryPointTarget)
    setVpText(String(rules.victoryPointTarget))
  }

  return (
    <div className="flex flex-col gap-2">
      <label className={CHECKBOX_ROW}>
        <span className={CHECKBOX_LABEL}>Friendly Robber (can't steal from 2 VP or fewer)</span>
        <input
          type="checkbox"
          checked={rules.friendlyRobber}
          onChange={(event) => setRule('friendlyRobber', event.target.checked)}
          className={CHECKBOX_CLASS}
        />
      </label>
      <label className={CHECKBOX_ROW}>
        <span className={CHECKBOX_LABEL}>No 7s on the first two rolls</span>
        <input
          type="checkbox"
          checked={rules.noSevensFirstTwoRolls}
          onChange={(event) => setRule('noSevensFirstTwoRolls', event.target.checked)}
          className={CHECKBOX_CLASS}
        />
      </label>
      <label className={CHECKBOX_ROW}>
        <span className={CHECKBOX_LABEL}>Allow settlements built closer together</span>
        <input
          type="checkbox"
          checked={rules.allowAdjacentSettlements}
          onChange={(event) => setRule('allowAdjacentSettlements', event.target.checked)}
          className={CHECKBOX_CLASS}
        />
      </label>
      <label className={CHECKBOX_ROW}>
        <span className={CHECKBOX_LABEL}>Setup settlements must touch the coast</span>
        <input
          type="checkbox"
          checked={rules.coastalOnlySetupPlacement}
          onChange={(event) => setRule('coastalOnlySetupPlacement', event.target.checked)}
          className={CHECKBOX_CLASS}
        />
      </label>
      <label className={CHECKBOX_ROW}>
        <span className={CHECKBOX_LABEL}>Doubles reroll (3 in a row loses your hand)</span>
        <input
          type="checkbox"
          checked={rules.doublesRerollRule}
          onChange={(event) => setRule('doublesRerollRule', event.target.checked)}
          className={CHECKBOX_CLASS}
        />
      </label>
      <label className={CHECKBOX_ROW}>
        <span className={CHECKBOX_LABEL}>Players can move their own card holder</span>
        <input
          type="checkbox"
          checked={rules.moveableCardHolders}
          onChange={(event) => setRule('moveableCardHolders', event.target.checked)}
          className={CHECKBOX_CLASS}
        />
      </label>
      <div className={CHECKBOX_ROW}>
        <span className={CHECKBOX_LABEL}>Victory point target</span>
        <input
          type="number"
          min={VP_TARGET_MIN}
          max={VP_TARGET_MAX}
          value={vpText}
          onChange={(event) => setVpText(event.target.value)}
          onBlur={() => {
            const parsed = Number(vpText)
            const clamped = Number.isNaN(parsed)
              ? rules.victoryPointTarget
              : Math.min(VP_TARGET_MAX, Math.max(VP_TARGET_MIN, Math.round(parsed)))
            setVpText(String(clamped))
            if (clamped !== rules.victoryPointTarget) setRule('victoryPointTarget', clamped)
          }}
          className="w-16 rounded-md border border-glass-border bg-white/5 px-2 py-1 text-center font-body text-xs text-white focus:border-gold/60 focus:outline-none"
        />
      </div>
    </div>
  )
}

export { DEFAULT_GAME_RULES }
