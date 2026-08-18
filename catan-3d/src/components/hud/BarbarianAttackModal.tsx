import type { BarbarianAttackResult } from '../../game/knights'
import { IMPROVEMENT_TRACK_LABELS, IMPROVEMENT_TRACK_ORDER, type ImprovementTrack, type Player } from '../../game/types'
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap'

export interface BarbarianAttackModalProps {
  result: BarbarianAttackResult
  players: Player[]
  // Non-null while a pillage or draw choice is still pending — Task 6's
  // pillage picker renders as a sibling (a board overlay, PillageLayer in
  // App.tsx), not inside this component, since it needs very different
  // layout. The winner-draw deck picker below IS a modal-shaped widget
  // though, so Task 7 renders it right here instead.
  pendingChoiceLabel: string | null
  // True while it's the LOCAL player's own turn to pick a progress-card
  // deck to draw from (a tied Defender-of-Catan winner) — gated on
  // App.tsx's activeWinnerDrawPlayerId, never winnerDrawQueue.length, for
  // the same ownership reason PillageLayer's own render gate uses
  // activePillageTarget rather than pillageQueue.length (Task 5's IMPORTANT
  // note): online, winnerDrawQueue.length > 0 is true for every connected
  // client for as long as ANY tied winner still hasn't picked, not just the
  // one whose turn it actually is.
  winnerDrawActive: boolean
  onDrawFromTrack: (track: ImprovementTrack) => void
}

// Shown the instant a barbarian attack resolves (Task 4's event-die 'ship'
// handling calls into applyBarbarianAttackResult, which sets the state this
// reads). Same full-screen dialog treatment as TradeOfferPrompt/
// VictoryBanner — role="dialog"/aria-modal + useModalFocusTrap, no onEscape
// since (like VictoryBanner) the only way out is significant enough that it
// shouldn't fire from an accidental Escape press.
export function BarbarianAttackModal({
  result,
  players,
  pendingChoiceLabel,
  winnerDrawActive,
  onDrawFromTrack,
}: BarbarianAttackModalProps) {
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
        {winnerDrawActive && (
          <div className="mt-4 flex justify-center gap-2">
            {IMPROVEMENT_TRACK_ORDER.map((track) => (
              <button
                key={track}
                type="button"
                onClick={() => onDrawFromTrack(track)}
                className="rounded-full border border-glass-border bg-white/5 px-4 py-2 font-body text-sm text-white/80 hover:border-gold/50 hover:text-gold"
              >
                {IMPROVEMENT_TRACK_LABELS[track]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
