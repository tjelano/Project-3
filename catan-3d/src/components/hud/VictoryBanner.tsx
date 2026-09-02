import {
  getScoreBreakdown,
  type Building,
  type MetropolisHolders,
  type Player,
  type PlayerColorToken,
} from '../../game/types'
import { useModalDialog } from '../../hooks/useModalDialog'

const WINNER_TEXT_CLASS: Record<PlayerColorToken, string> = {
  'player-1': 'text-player-1',
  'player-2': 'text-player-2',
  'player-3': 'text-player-3',
  'player-4': 'text-player-4',
  'player-5': 'text-player-5',
  'player-6': 'text-player-6',
}

const DOT_CLASS: Record<PlayerColorToken, string> = {
  'player-1': 'bg-player-1',
  'player-2': 'bg-player-2',
  'player-3': 'bg-player-3',
  'player-4': 'bg-player-4',
  'player-5': 'bg-player-5',
  'player-6': 'bg-player-6',
}

interface VictoryBannerProps {
  winner: Player
  players: Player[]
  settlements: Record<string, Building>
  longestRoadHolderId: number | null
  largestArmyHolderId: number | null
  metropolisHolders: MetropolisHolders
  // Cities & Knights Merchant (Task 13) — who currently controls the
  // Merchant piece, same category as metropolisHolders above, needed here
  // since getScoreBreakdown's signature now requires it.
  merchantHolderId: number | null
  onReturnToMenu: () => void
}

export function VictoryBanner({
  winner,
  players,
  settlements,
  longestRoadHolderId,
  largestArmyHolderId,
  metropolisHolders,
  merchantHolderId,
  onReturnToMenu,
}: VictoryBannerProps) {
  const ranked = [...players]
    .map((player) => ({
      player,
      score: getScoreBreakdown(
        player,
        settlements,
        longestRoadHolderId,
        largestArmyHolderId,
        metropolisHolders,
        merchantHolderId,
      ),
    }))
    .sort((a, b) => b.score.total - a.score.total)
  const winnerScore = ranked.find((row) => row.player.id === winner.id)?.score.total ?? 0
  // No onClose: the only action here (return to menu) is significant
  // enough that it shouldn't fire from an accidental Escape press.
  const dialogRef = useModalDialog<HTMLDialogElement>()

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="victory-banner-heading"
      className="animate-victory-in pointer-events-auto m-auto w-full max-w-lg rounded-3xl border border-glass-border bg-glass px-8 py-10 text-center shadow-[0_30px_90px_rgba(0,0,0,0.6)] backdrop-blur-2xl backdrop:animate-veil-in backdrop:bg-board-navy/80 backdrop:backdrop-blur-md sm:px-10"
    >
      <p className="font-body text-xs tracking-[0.35em] text-gold/80 uppercase">Victory</p>
      <h1
        id="victory-banner-heading"
        className={`mt-3 font-display text-3xl leading-tight font-semibold sm:text-4xl ${WINNER_TEXT_CLASS[winner.colorToken]}`}
      >
        Victory! {winner.name} Has Conquered the Island!
      </h1>
      <p className="mt-3 font-body text-sm text-white/60">Final Score: {winnerScore} Victory Points</p>

      <div className="mt-8 overflow-x-auto rounded-xl border border-glass-border">
        <div className="grid min-w-[35.5rem] grid-cols-[1.5rem_1fr_2rem_2rem_2rem_1.75rem_1.75rem_2.25rem_2rem_2rem_2rem_2.75rem] items-center gap-x-2 bg-white/5 px-4 py-2 font-body text-[10px] tracking-[0.15em] text-white/40 uppercase">
          <span />
          <span className="text-left">Player</span>
          <span>Set</span>
          <span>City</span>
          <span>VP</span>
          <span title="Longest Road">LR</span>
          <span title="Largest Army">LA</span>
          {/* Without this column a Metropolis holder's visible columns
                simply don't add up to their own Score — the 2 VP per held
                track is already in score.total (see getScoreBreakdown). */}
          <span title="Metropolis">Met</span>
          {/* Same reasoning as Met above, for the 2 Cities & Knights VP
                sources added later (Tasks 1 and 13): both are already in
                score.total, so they need their own columns or the row
                stops adding up to the shown Score. */}
          <span title="Progress Card Victory Points">Prog</span>
          <span title="Merchant">Mrch</span>
          {/* Same reasoning again, for Defender of Catan (Task 1/9): the
                barbarian-attack soloist's VP is already in score.total. */}
          <span title="Defender of Catan">DoC</span>
          <span>Score</span>
        </div>
        {ranked.map(({ player, score }, index) => {
          const isWinner = player.id === winner.id
          return (
            <div
              key={player.id}
              className={`grid min-w-[35.5rem] grid-cols-[1.5rem_1fr_2rem_2rem_2rem_1.75rem_1.75rem_2.25rem_2rem_2rem_2rem_2.75rem] items-center gap-x-2 border-t border-glass-border px-4 py-2.5 font-body text-sm ${
                isWinner ? 'bg-gold/10' : ''
              }`}
            >
              <span className={`font-display text-xs ${isWinner ? 'text-gold' : 'text-white/40'}`}>
                {index + 1}
              </span>
              <span className="flex items-center gap-2 text-left">
                <span className={`h-2 w-2 shrink-0 rounded-full ${DOT_CLASS[player.colorToken]}`} />
                <span className={isWinner ? 'text-white' : 'text-white/70'}>{player.name}</span>
              </span>
              <span className="text-white/60">{score.settlements}</span>
              <span className="text-white/60">{score.cities}</span>
              <span className="text-white/60">{score.victoryPointCards}</span>
              <span className={score.longestRoad ? 'text-gold' : 'text-white/25'}>
                {score.longestRoad ? `+${score.longestRoad}` : '–'}
              </span>
              <span className={score.largestArmy ? 'text-gold' : 'text-white/25'}>
                {score.largestArmy ? `+${score.largestArmy}` : '–'}
              </span>
              <span className={score.metropolis ? 'text-gold' : 'text-white/25'}>
                {score.metropolis ? `+${score.metropolis}` : '–'}
              </span>
              <span className={score.progressCardVP ? 'text-gold' : 'text-white/25'}>
                {score.progressCardVP ? `+${score.progressCardVP}` : '–'}
              </span>
              <span className={score.merchantVP ? 'text-gold' : 'text-white/25'}>
                {score.merchantVP ? `+${score.merchantVP}` : '–'}
              </span>
              <span className={score.defenderOfCatanVP ? 'text-gold' : 'text-white/25'}>
                {score.defenderOfCatanVP ? `+${score.defenderOfCatanVP}` : '–'}
              </span>
              <span className={`font-display font-semibold ${isWinner ? 'text-gold' : 'text-white/80'}`}>
                {score.total}
              </span>
            </div>
          )
        })}
      </div>

      <button
        type="button"
        onClick={onReturnToMenu}
        className="animate-gold-pulse mt-9 w-full rounded-xl bg-gradient-to-b from-gold to-gold-deep py-3.5 font-display text-base font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95"
      >
        Return to Main Menu
      </button>
    </dialog>
  )
}
