import type { BarbarianAttackResult } from '../../game/knights'
import type { Player } from '../../game/types'
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap'

export interface BarbarianAttackModalProps {
  result: BarbarianAttackResult
  players: Player[]
  // Non-null while a pillage or draw choice is still pending — Tasks 6-7
  // render the actual picker UI as siblings, not inside this component,
  // since one is a board overlay and the other is a deck-choice widget
  // with very different layout needs.
  pendingChoiceLabel: string | null
}

// Shown the instant a barbarian attack resolves (Task 4's event-die 'ship'
// handling calls into applyBarbarianAttackResult, which sets the state this
// reads). Same full-screen dialog treatment as TradeOfferPrompt/
// VictoryBanner — role="dialog"/aria-modal + useModalFocusTrap, no onEscape
// since (like VictoryBanner) the only way out is significant enough that it
// shouldn't fire from an accidental Escape press.
export function BarbarianAttackModal({ result, players, pendingChoiceLabel }: BarbarianAttackModalProps) {
  const outcomeText = result.defendersWin
    ? result.winners.some((w) => w.tied)
      ? 'The knights held — but no single defender stood out. Tied contributors each draw a progress card.'
      : `The knights held! ${players.find((p) => p.id === result.winners[0]?.playerId)?.name ?? 'A player'} is the Defender of Catan.`
    : 'The barbarians are victorious. Catan will be pillaged.'
  const dialogRef = useModalFocusTrap<HTMLDivElement>()

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-board-navy/70 backdrop-blur-md">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="barbarian-attack-heading"
        tabIndex={-1}
        className="mx-4 w-full max-w-md rounded-2xl border border-glass-border bg-glass px-8 py-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
      >
        <p className="font-body text-[10px] tracking-[0.25em] text-white/50 uppercase">Barbarian Attack</p>
        <h2 id="barbarian-attack-heading" className="mt-3 font-display text-lg text-white">
          Barbarian strength {result.barbarianStrength} vs. Defender strength {result.defenderStrength}
        </h2>
        <p className="mt-4 font-body text-sm text-white/70">{outcomeText}</p>
        {pendingChoiceLabel && (
          <p className="mt-4 font-body text-[11px] tracking-[0.15em] text-gold uppercase">{pendingChoiceLabel}</p>
        )}
      </div>
    </div>
  )
}
