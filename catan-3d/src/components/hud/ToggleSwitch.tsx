// Hand-made pixel-art toggle (user, Aseprite, 2026-08-28) — a 2-frame sheet
// (off/on, thumb left/right), swapped via background-position (.toggle-
// switch-sprite, index.css). Replaces the earlier plain-CSS pill.
export function ToggleSwitch({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`toggle-switch-sprite inline-block h-5 w-[37px] shrink-0 ${checked ? 'is-on' : ''} ${disabled ? 'opacity-40' : ''}`}
    />
  )
}
