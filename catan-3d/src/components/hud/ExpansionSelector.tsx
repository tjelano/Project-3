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
}: {
  seafarersSelected: boolean
  onToggleSeafarers: (value: boolean) => void
  citiesAndKnightsEnabled: boolean
  onToggleCitiesAndKnights: (value: boolean) => void
}) {
  const checkedFor = (id: (typeof EXPANSIONS)[number]['id']) =>
    id === 'seafarers' ? seafarersSelected : citiesAndKnightsEnabled
  const onToggleFor = (id: (typeof EXPANSIONS)[number]['id']) =>
    id === 'seafarers' ? onToggleSeafarers : onToggleCitiesAndKnights

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {EXPANSIONS.map((expansion) => {
        const checked = checkedFor(expansion.id)
        return (
          <label
            key={expansion.id}
            className={`ui-button flex cursor-pointer items-start gap-3 px-3 py-2.5 transition-colors ${checked ? 'glow-gold-sm bg-gold/[0.06]' : ''}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={(event) => onToggleFor(expansion.id)(event.target.checked)}
              className="sr-only"
            />
            <div className="min-w-0 flex-1">
              <div className="font-display text-sm text-gold">{expansion.name}</div>
              <p className="mt-0.5 font-body text-xs leading-snug text-white/50">{expansion.description}</p>
            </div>
            <ToggleSwitch checked={checked} />
          </label>
        )
      })}
    </div>
  )
}
