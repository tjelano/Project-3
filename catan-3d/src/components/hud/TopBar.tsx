import type { Player, PlayerColorToken } from '../../game/types'

const PLAYER_STYLES: Record<PlayerColorToken, { dot: string; label: string; activePill: string }> = {
  'player-1': {
    dot: 'bg-player-1',
    label: 'text-player-1',
    activePill: 'bg-player-1/15 ring-1 ring-player-1/70',
  },
  'player-2': {
    dot: 'bg-player-2',
    label: 'text-player-2',
    activePill: 'bg-player-2/15 ring-1 ring-player-2/70',
  },
  'player-3': {
    dot: 'bg-player-3',
    label: 'text-player-3',
    activePill: 'bg-player-3/15 ring-1 ring-player-3/70',
  },
  'player-4': {
    dot: 'bg-player-4',
    label: 'text-player-4',
    activePill: 'bg-player-4/15 ring-1 ring-player-4/70',
  },
}

function RestartIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <polyline points="21 3 21 9 15 9" />
    </svg>
  )
}

export function TopBar({
  players,
  currentPlayerIndex,
  statusLabel,
  onRestart,
}: {
  players: Player[]
  currentPlayerIndex: number
  statusLabel: string
  onRestart: () => void
}) {
  return (
    <div className="pointer-events-auto absolute top-4 left-1/2 flex -translate-x-1/2 items-center gap-4 rounded-2xl border border-glass-border bg-glass px-5 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex items-center gap-2">
        {players.map((player, index) => {
          const active = index === currentPlayerIndex
          const styles = PLAYER_STYLES[player.colorToken]
          return (
            <div
              key={player.id}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1 transition-all duration-300 ${
                active ? styles.activePill : 'opacity-45'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${styles.dot}`} />
              <span className={`font-display text-sm tracking-wide ${active ? styles.label : 'text-white/70'}`}>
                {player.name}
              </span>
            </div>
          )
        })}
      </div>
      <div className="h-5 w-px bg-white/10" />
      <span className="font-body text-xs tracking-[0.2em] text-gold/90 uppercase">{statusLabel}</span>
      <div className="h-5 w-px bg-white/10" />
      <button
        type="button"
        onClick={onRestart}
        title="Restart game"
        className="flex items-center gap-1.5 rounded-full border border-glass-border bg-white/5 px-3 py-1 text-white/70 transition-colors hover:border-gold/50 hover:text-gold"
      >
        <RestartIcon className="h-3.5 w-3.5" />
        <span className="font-body text-[10px] tracking-[0.15em] uppercase">New Game</span>
      </button>
    </div>
  )
}
