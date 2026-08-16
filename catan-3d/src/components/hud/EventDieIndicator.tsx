import type { EventDieFace } from '../Dice3D'

const EVENT_DIE_ICON: Record<EventDieFace, string> = {
  ship: '⛵',
  science: '🧪',
  trade: '⚖️',
  politics: '🤝',
}

const EVENT_DIE_LABEL: Record<EventDieFace, string> = {
  ship: 'Ship — barbarians advance',
  science: 'Science — progress card draw',
  trade: 'Trade — progress card draw',
  politics: 'Politics — progress card draw',
}

// Placeholder 2D treatment, deliberately not a 3rd physics die (see the
// Phase B design spec's Global Constraints) — the existing 2 dice already
// require custom 3D geometry/textures this project isn't taking on for a
// differently-faced 3rd die yet.
export function EventDieIndicator({ face }: { face: EventDieFace | null }) {
  if (!face) return null
  return (
    <div
      className="pointer-events-none flex items-center gap-1.5 rounded-full border border-glass-border bg-glass px-3 py-1 text-sm text-white/90 shadow-[0_4px_16px_rgba(0,0,0,0.3)] backdrop-blur-xl"
      title={EVENT_DIE_LABEL[face]}
    >
      <span aria-hidden="true">{EVENT_DIE_ICON[face]}</span>
      <span className="font-body text-[10px] tracking-[0.15em] text-white/60 uppercase">{face}</span>
    </div>
  )
}
