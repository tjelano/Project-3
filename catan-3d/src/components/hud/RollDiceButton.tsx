function DiceIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <rect x="2" y="2" width="9" height="9" rx="1.5" />
      <circle cx="6.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      <rect x="13" y="13" width="9" height="9" rx="1.5" />
      <circle cx="15.7" cy="15.7" r="1" fill="currentColor" stroke="none" />
      <circle cx="17.5" cy="17.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="19.3" cy="19.3" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

function EndTurnIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M4 12h14" strokeLinecap="round" />
      <path d="M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function RollDiceButton({
  lastRoll,
  onRoll,
  onEndTurn,
  hasRolledThisTurn,
  disabled,
  playerLabel,
}: {
  lastRoll: number | null
  onRoll: () => void
  onEndTurn: () => void
  // Once the current player has rolled, this SAME button slot morphs from
  // Roll Dice into End Turn — turn advancement only ever happens from this
  // explicit click, never automatically when the dice settle.
  hasRolledThisTurn: boolean
  disabled?: boolean
  playerLabel: string
}) {
  // Anchored bottom-RIGHT rather than bottom-centre: the 3D card fan now
  // occupies the centre of the lower viewport, and a button there would sit
  // on top of the player's hand. This keeps it clear of the fan's outermost
  // card while staying in the natural place the eye goes for a primary action.
  return (
    <div className="pointer-events-auto absolute right-8 bottom-10">
      <button
        type="button"
        onClick={hasRolledThisTurn ? onEndTurn : onRoll}
        disabled={disabled}
        className="group relative flex h-28 w-32 flex-col items-center justify-center gap-0.5 border border-gold/30 bg-gradient-to-b from-gold to-gold-deep text-board-navy glow-gold-lift transition-transform duration-200 hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale disabled:hover:scale-100 disabled:active:scale-100"
        style={{ clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }}
      >
        {hasRolledThisTurn ? <EndTurnIcon className="h-6 w-6" /> : <DiceIcon className="h-6 w-6" />}
        <span className="font-body text-[10px] font-semibold tracking-wide text-board-navy/75">{playerLabel}</span>
        <span className="font-display text-sm font-semibold tracking-wide">
          {hasRolledThisTurn ? 'End Turn' : 'Roll Dice'}
        </span>
      </button>

      {lastRoll !== null && (
        <div className="pointer-events-none absolute -top-3 -right-3 flex h-9 w-9 items-center justify-center rounded-full border border-gold/60 bg-board-navy font-data text-sm text-gold glow-gold">
          {lastRoll}
        </div>
      )}
    </div>
  )
}
