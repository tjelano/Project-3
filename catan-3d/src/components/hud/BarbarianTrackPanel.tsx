import { BARBARIAN_TRACK_LENGTH, resolveBarbarianAttack } from '../../game/knights'
import type { Building, Player } from '../../game/types'

export interface BarbarianTrackPanelProps {
  position: number // 0 to BARBARIAN_TRACK_LENGTH - 1
  players: Player[]
  settlements: Record<string, Building>
}

export function BarbarianTrackPanel({ position, players, settlements }: BarbarianTrackPanelProps) {
  // Reuses Task 2's resolveBarbarianAttack for the live strength preview
  // rather than re-deriving the same strength math here — the modal
  // (Task 5) and this HUD must never be able to disagree on these two
  // numbers. Called fresh on every render (2-arg call — this component has
  // no metropolisVertexIds and doesn't need it, since barbarianStrength/
  // defenderStrength are both computed before metropolis filtering even
  // starts, see resolveBarbarianAttack's own comment), purely for its two
  // strength totals; its pillage/winner fields are unused here (no attack
  // is actually happening yet). Cheap, pure function, no memoization
  // needed at this scale.
  const { barbarianStrength, defenderStrength } = resolveBarbarianAttack(players, settlements)
  const eventsUntilAttack = BARBARIAN_TRACK_LENGTH - 1 - position

  return (
    <div className="pointer-events-none flex flex-col items-center gap-1 rounded-2xl border border-glass-border bg-glass px-4 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex gap-1">
        {Array.from({ length: BARBARIAN_TRACK_LENGTH }, (_, i) => {
          const state = i < position ? 'passed' : i === position ? 'current' : 'upcoming'
          const color = state === 'passed' ? '#3fae5a' : state === 'current' ? '#f2c14e' : '#8a4545'
          return (
            <div
              key={i}
              className="flex h-8 w-8 items-center justify-center rounded-md font-body text-xs text-white"
              style={{ backgroundColor: color }}
            >
              {state === 'current' ? '\u{1F6E5}' : i + 1}
            </div>
          )
        })}
      </div>
      <span className="font-body text-[11px] text-white/70">
        Barbarian Strength: {barbarianStrength} · Defenders: {defenderStrength}
      </span>
      <span className="font-body text-[11px] text-white/50">Next attack in {eventsUntilAttack} events</span>
    </div>
  )
}
