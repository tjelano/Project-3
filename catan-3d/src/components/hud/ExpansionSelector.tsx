import type { CSSProperties } from 'react'
import { ToggleSwitch } from './ToggleSwitch'

// Cities & Knights and Seafarers are the two REAL expansions a player thinks
// in terms of — the 4 separate GameRules.citiesAndKnights* flags were this
// project's own incremental build phases (Commodities, Progress Cards,
// Knights & City Walls, Barbarian Attacks), not something the physical board
// game exposes as 4 choices. One toggle here drives all 4 together.
//
// Seafarers has no GameRules flag at all — ships, gold fields, and the
// pirate are already fully implemented, but they activate automatically
// whenever the board shape (picked on the NEXT screen) has sea/gold tiles.
// This toggle is intentionally inert for now: it's a label, not a wire.
// Follow-up: carry `seafarersSelected` through to RegionSelectMenu and use
// it to filter/default toward Seafarers-compatible board shapes.
const EXPANSIONS = [
  {
    id: 'seafarers' as const,
    name: 'Seafarers',
    description: 'Ships, gold fields, and the pirate — pick a sea board shape next to include them.',
  },
  {
    id: 'citiesAndKnights' as const,
    name: 'Cities & Knights',
    description: 'Commodities, progress cards, knights, city walls, and barbarian attacks.',
  },
]

export function ExpansionSelector({
  seafarersSelected,
  onToggleSeafarers,
  citiesAndKnightsEnabled,
  onToggleCitiesAndKnights,
  leftCardStyle,
  rightCardStyle,
}: {
  seafarersSelected: boolean
  onToggleSeafarers: (value: boolean) => void
  citiesAndKnightsEnabled: boolean
  onToggleCitiesAndKnights: (value: boolean) => void
  // Positions each card independently against the book art (caller's Rect
  // system) — Seafarers always renders left/first, Cities & Knights right/
  // second, so index order alone decides which style applies.
  leftCardStyle: CSSProperties
  rightCardStyle: CSSProperties
}) {
  const checkedFor = (id: (typeof EXPANSIONS)[number]['id']) =>
    id === 'seafarers' ? seafarersSelected : citiesAndKnightsEnabled
  const onToggleFor = (id: (typeof EXPANSIONS)[number]['id']) =>
    id === 'seafarers' ? onToggleSeafarers : onToggleCitiesAndKnights
  const cardStyles = [leftCardStyle, rightCardStyle]

  return (
    <>
      {EXPANSIONS.map((expansion, index) => {
        const checked = checkedFor(expansion.id)
        return (
          <label
            key={expansion.id}
            style={cardStyles[index]}
            // Inset box-shadow, not a background tint — border-image's own
            // `fill` (index.css .expansion-card) paints the card's parchment
            // interior AFTER backgrounds in the CSS paint order, so a plain
            // bg-* class for the selected state would render invisibly
            // underneath it. box-shadow paints after border, so it shows.
            className={`expansion-card flex cursor-pointer items-start gap-3 px-3 py-2 transition-colors ${
              checked ? 'shadow-[inset_0_0_0_2px_#7a3b1e]' : ''
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => onToggleFor(expansion.id)(event.target.checked)}
              className="sr-only"
            />
            <div className="min-w-0 flex-1">
              <div className="font-display text-sm text-[#2b1810]">{expansion.name}</div>
              <p className="mt-0.5 font-body text-xs leading-snug text-[#6b5540]">{expansion.description}</p>
            </div>
            <ToggleSwitch checked={checked} />
          </label>
        )
      })}
    </>
  )
}
