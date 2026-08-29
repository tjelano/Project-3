import { useState, type ReactNode } from 'react'

interface CollapsibleSectionProps {
  icon: string
  label: string
  children: ReactNode
  defaultOpen?: boolean
  // A sibling of the toggle button, not a child of it — a panel like
  // KnightsPanel needs its own header-row action (Cancel) that can't nest
  // inside another interactive <button> without breaking click handling.
  headerExtra?: ReactNode
}

/**
 * Shared accordion header+body for the sidebar panels — Building Costs,
 * Rankings/Trophies, City Improvements, Knights, and the dev-card "Play a
 * Card" list all use this SAME wrapper so their open/close behaviour stays
 * identical everywhere instead of drifting across independently-tuned
 * copies of the same transition CSS.
 */
export function CollapsibleSection({ icon, label, children, defaultOpen = false, headerExtra }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div>
      <div className="flex w-full items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          className="flex flex-1 items-center justify-between gap-2 rounded-lg px-1 py-1 font-body text-[10px] tracking-[0.2em] text-white/50 uppercase transition-colors hover:text-gold"
        >
          <span className="whitespace-nowrap">
            {icon} {label}
          </span>
          <span
            className={`font-data text-[9px] text-white/40 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          >
            ▾
          </span>
        </button>
        {headerExtra}
      </div>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[500px]' : 'max-h-0'}`}>
        <div className="pt-2">{children}</div>
      </div>
    </div>
  )
}
