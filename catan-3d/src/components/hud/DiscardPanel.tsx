// Shown while gamePhase === 'discard' (a natural 7 caught someone with more
// than 7 cards). Frosted/dimmed like the other modals, but deliberately
// NOT a full pointer-events-auto blocker: the whole board and the 3D hand
// underneath stay live and clickable, since discarding is done by clicking
// the actual 3D cards, not this panel — this is just the counter + confirm.
export function DiscardPanel({
  isMyDiscardTurn,
  discardingPlayerName,
  requiredCount,
  selectedCount,
  onConfirm,
}: {
  isMyDiscardTurn: boolean
  discardingPlayerName: string
  requiredCount: number
  selectedCount: number
  onConfirm: () => void
}) {
  const remaining = requiredCount - selectedCount

  return (
    <>
      {/* Dims/frosts the board, fading out smoothly toward the bottom of the
          viewport rather than stopping at a hard edge — a flat cutoff line
          reads as a bug, not a vignette. A backdrop-blur affects everything
          rendered behind it regardless of pointer-events, and the 3D hand
          (where the discard-flagging actually happens) sits at the bottom
          of the screen, so full-height coverage was blurring the very
          cards the player needs to read clearly. The mask fades it to
          nothing well above where the hand renders. */}
      <div
        className="pointer-events-none absolute inset-0 z-30 bg-board-navy/45 backdrop-blur-[2px]"
        style={{
          maskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 78%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 78%)',
        }}
      />
      <div className="pointer-events-auto absolute top-28 left-1/2 z-30 w-72 -translate-x-1/2 rounded-2xl border border-glass-border bg-glass px-6 py-5 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        {isMyDiscardTurn ? (
          <>
            <p className="font-body text-[10px] tracking-[0.25em] text-player-1/80 uppercase">
              Rolled a 7 — Over the Limit
            </p>
            <p className="mt-2 font-display text-lg text-white">
              {remaining > 0 ? `Select ${remaining} more card${remaining === 1 ? '' : 's'} to discard` : 'Ready to discard'}
            </p>
            <button
              type="button"
              disabled={remaining !== 0}
              onClick={onConfirm}
              className="mt-4 w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
            >
              Confirm Discard
            </button>
          </>
        ) : (
          <p className="font-body text-sm text-white/70">Waiting for {discardingPlayerName} to discard…</p>
        )}
      </div>
    </>
  )
}
