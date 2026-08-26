// Real CSS pill toggle — replaces the painted hr-toggle-on/off.png pair from
// the old overlay-on-image HouseRulesDropdown. Same visual language as every
// other control in the rebuilt setup flow: glass/gold tokens, no baked art.
export function ToggleSwitch({ checked, disabled }: { checked: boolean; disabled?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors ${
        checked ? 'border-gold/60 bg-gold/30' : 'border-glass-border bg-white/5'
      } ${disabled ? 'opacity-40' : ''}`}
    >
      <span
        className={`absolute h-3.5 w-3.5 rounded-full transition-transform ${
          checked ? 'translate-x-[18px] bg-gold' : 'translate-x-1 bg-white/50'
        }`}
      />
    </span>
  )
}
