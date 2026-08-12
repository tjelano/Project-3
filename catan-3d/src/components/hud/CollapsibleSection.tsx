import { useState, type ReactNode } from 'react'

interface CollapsibleSectionProps {
  icon: string
  label: string
  children: ReactNode
  defaultOpen?: boolean
}

/**
 * Shared accordion header+body for the sidebar panels — Building Costs,
 * Rankings/Trophies, and the dev-card "Play a Card" list all use this SAME
 * wrapper so their open/close behaviour stays identical everywhere instead
 * of drifting across three independently-tuned copies of the same
 * transition CSS.
 */
export function CollapsibleSection({ icon, label, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 font-body text-[10px] tracking-[0.25em] text-white/50 uppercase transition-colors hover:text-gold"
      >
        <span>
          {icon} {label}
        </span>
        <span
          className={`font-data text-[9px] text-white/40 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>
      <div className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-[500px]' : 'max-h-0'}`}>
        <div className="pt-2">{children}</div>
      </div>
    </div>
  )
}
