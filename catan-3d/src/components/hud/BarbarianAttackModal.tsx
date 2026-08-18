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
  // True while ANY player still owes a pillage-target choice. The pillage
  // picker (PillageLayer) lives in the 3D Canvas UNDERNEATH this component,
  // so the usual full-viewport backdrop below would swallow every click
  // meant for it — a player with 2+ eligible cities (i.e. one the auto-skip
  // effect doesn't resolve for them) could never actually pick, and the
  // modal has no dismiss button until both queues empty, so the table
  // soft-locked. While this is true the component renders as a small,
  // pointer-events-none banner instead (the design spec's own wording:
  // "the modal shrinks to a small 'Choose which city to pillage' banner
  // while a board overlay highlights only that player's own eligible
  // cities for a direct click").
  pillageChoicePending: boolean
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
// shouldn't fire from an accidental Escape press — EXCEPT while a pillage
// choice is outstanding, when it collapses to a non-blocking banner (see
// pillageChoicePending above).
export function BarbarianAttackModal({
  result,
  players,
  pendingChoiceLabel,
  pillageChoicePending,
  winnerDrawActive,
  onDrawFromTrack,
}: BarbarianAttackModalProps) {
  const outcomeText = result.defendersWin
    ? // Empty winners on a defenders' win means nobody fielded an active
      // knight at all (resolveBarbarianAttack's maxStrength === 0 case) —
      // the attack was repelled by an empty board, so there's no Defender
      // of Catan to name.
      result.winners.length === 0
      ? 'Catan was spared — but not one knight took the field, so no one is the Defender of Catan.'
      : result.winners.some((w) => w.tied)
        ? 'The knights held — but no single defender stood out. Tied contributors each draw a progress card.'
        : `The knights held! ${players.find((p) => p.id === result.winners[0]?.playerId)?.name ?? 'A player'} is the Defender of Catan.`
    : 'The barbarians are victorious. Catan will be pillaged.'
  // Called unconditionally (hooks rules) even in the banner branch below,
  // which never attaches the ref — a focus trap on a non-modal banner that
  // deliberately leaves the board interactive would be wrong anyway.
  const dialogRef = useModalFocusTrap<HTMLDivElement>()

  // Banner branch — deliberately borrows EventBanner's own positioning and
  // glass-panel classes rather than inventing new ones, dropped two slots
  // down the centre column (top-44) so it clears both EventBanner's own
  // top-20 — applyPillage's inform() raises one at exactly this moment —
  // and GameHud's top-32 event-die indicator. pointer-events-none is the
  // whole point: every click has to reach PillageLayer's spheres in the
  // Canvas below.
  if (pillageChoicePending) {
    return (
      <div
        role="status"
        className="pointer-events-none absolute top-44 left-1/2 z-40 -translate-x-1/2 rounded-xl border border-glass-border bg-glass px-4 py-2 text-center font-body text-xs text-white/90 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl"
      >
        {pendingChoiceLabel ?? 'Choose which city to pillage'}
      </div>
    )
  }

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
