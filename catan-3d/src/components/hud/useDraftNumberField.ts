import { useState } from 'react'

/**
 * A controlled number input whose value doesn't commit until blur — a field
 * tied directly to a clamped number can't ever show an empty or
 * single-digit-in-progress string while typing, since Number('') is 0, not
 * NaN, so clamping on every keystroke snaps straight back to the minimum
 * the instant the field is cleared, before a new value can be typed.
 *
 * Re-syncs its draft text from `value` during render (React's "adjusting
 * state when a prop changes" pattern, avoiding the extra render pass a
 * useEffect-based sync would cost) whenever the committed value changes out
 * from under it — e.g. an online lobby's host broadcasting a new GameRules
 * object.
 */
export function useDraftNumberField({
  value,
  min,
  max,
  onCommit,
}: {
  value: number
  min: number
  max: number
  onCommit: (value: number) => void
}) {
  const [text, setText] = useState(String(value))
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setText(String(value))
  }

  const commit = () => {
    const parsed = Number(text)
    const clamped = Number.isNaN(parsed) ? value : Math.min(max, Math.max(min, Math.round(parsed)))
    setText(String(clamped))
    if (clamped !== value) onCommit(clamped)
  }

  return { text, setText, commit }
}
