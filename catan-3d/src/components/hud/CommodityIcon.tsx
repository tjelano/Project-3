import type { CommodityType } from '../../game/types'

// Placeholder geometry, not final art — per this expansion's asset policy
// (docs/superpowers/specs/2026-08-15-cities-knights-commodities-design.md),
// every visual ships as a placeholder before real art is commissioned.
// Mirrors ResourceIcon.tsx's inline-SVG, zero-new-asset approach exactly.
// NOTE: this is a separate, small inline-SVG icon for compact display (e.g.
// cost labels below) — NOT the same thing as the real commodity card art
// (paper/cloth/coin PNGs) already wired into PlayerHand3D for the hand.
export function CommodityIcon({ commodity, className }: { commodity: CommodityType; className?: string }) {
  switch (commodity) {
    case 'paper':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <rect x="4" y="3" width="16" height="18" rx="1" />
          {/* Matches --color-board-navy (index.css) for the punched-out
              inner shape, same convention RESOURCE_COLORS documents. */}
          <rect x="7" y="7" width="10" height="1.5" fill="#0b1220" />
          <rect x="7" y="11" width="10" height="1.5" fill="#0b1220" />
          <rect x="7" y="15" width="6" height="1.5" fill="#0b1220" />
        </svg>
      )
    case 'cloth':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <path d="M4 6 Q8 3, 12 6 T20 6 V18 Q16 21, 12 18 T4 18 Z" />
        </svg>
      )
    case 'coin':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor">
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5.5" fill="#0b1220" />
        </svg>
      )
    default: {
      // Exhaustiveness check: a CommodityType added without a matching case
      // above fails to compile here, instead of silently rendering nothing
      // at runtime.
      const unhandled: never = commodity
      console.error('[Catan] No icon for commodity type:', unhandled)
      return null
    }
  }
}
