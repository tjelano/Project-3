import { getPublicScore, type Building, type Player, type PlayerColorToken } from '../../game/types'
import { CollapsibleSection } from './CollapsibleSection'

const DOT_CLASS: Record<PlayerColorToken, string> = {
  'player-1': 'bg-player-1',
  'player-2': 'bg-player-2',
  'player-3': 'bg-player-3',
  'player-4': 'bg-player-4',
  'player-5': 'bg-player-5',
  'player-6': 'bg-player-6',
}

interface RankingsPanelProps {
  players: Player[]
  settlements: Record<string, Building>
  // Whoever is actually LOOKING at this screen — for online, that's this
  // browser's own player, not whoever's turn it currently is (those two
  // only coincide during your own turn). Getting this wrong doesn't just
  // mislabel a hint: it leaks it, revealing the active player's hidden
  // Victory Point count to every OTHER connected screen during their turn.
  viewerPlayerId: number
  longestRoadHolderId: number | null
  longestRoadLengths: Map<number, number>
  largestArmyHolderId: number | null
}

export function RankingsPanel({
  players,
  settlements,
  viewerPlayerId,
  longestRoadHolderId,
  longestRoadLengths,
  largestArmyHolderId,
}: RankingsPanelProps) {
  // Public score only — Victory Point dev cards stay face-down, so this
  // board never reveals them. The viewer gets a private "+N" hint for
  // their OWN hidden cards, since they're allowed to know their own hand
  // (it's already itemised in their resource panel).
  const ranked = [...players]
    .map((player) => ({
      player,
      score: getPublicScore(player, settlements, longestRoadHolderId, largestArmyHolderId),
      hidden:
        player.id === viewerPlayerId
          ? player.devCards.filter((card) => card === 'victoryPoint').length
          : 0,
    }))
    .sort((a, b) => b.score - a.score)

  const longestRoadHolder = players.find((p) => p.id === longestRoadHolderId) ?? null
  const largestArmyHolder = players.find((p) => p.id === largestArmyHolderId) ?? null

  return (
    <div className="pointer-events-auto w-full rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <CollapsibleSection icon="🏆" label="Standings" defaultOpen>
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            {ranked.map(({ player, score, hidden }, index) => (
              <div
                key={player.id}
                className="flex items-center justify-between rounded-full bg-white/5 py-1 pr-2.5 pl-1.5"
              >
                <span className="flex items-center gap-1.5">
                  <span className="font-display text-[10px] text-white/40">{index + 1}</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[player.colorToken]}`} />
                  <span className="font-body text-[11px] text-white/80">{player.name}</span>
                </span>
                <span className="flex items-baseline gap-1">
                  {hidden > 0 && (
                    <span className="font-data text-[9px] text-gold/80" title="Your hidden Victory Point cards">
                      +{hidden}
                    </span>
                  )}
                  <span className="font-data text-xs tabular-nums text-white">{score}</span>
                </span>
              </div>
            ))}
          </div>

          <span className="mt-1 px-1 font-body text-[10px] tracking-[0.25em] text-white/50 uppercase">Trophies</span>
          <div className="flex flex-col gap-1.5">
            <div
              className={`rounded-lg border px-2.5 py-1.5 ${
                longestRoadHolder
                  ? 'border-gold/50 bg-gold/10 glow-gold-sm'
                  : 'border-glass-border bg-white/5'
              }`}
            >
              <div className="font-body text-[9px] tracking-[0.12em] text-gold/80 uppercase">Longest Road</div>
              <div className="font-body text-[11px] text-white/85">
                {longestRoadHolder
                  ? `${longestRoadHolder.name} (${longestRoadLengths.get(longestRoadHolder.id) ?? 0} Roads)`
                  : 'Unclaimed'}
              </div>
            </div>
            <div
              className={`rounded-lg border px-2.5 py-1.5 ${
                largestArmyHolder
                  ? 'border-gold/50 bg-gold/10 glow-gold-sm'
                  : 'border-glass-border bg-white/5'
              }`}
            >
              <div className="font-body text-[9px] tracking-[0.12em] text-gold/80 uppercase">Largest Army</div>
              <div className="font-body text-[11px] text-white/85">
                {largestArmyHolder ? `${largestArmyHolder.name} (${largestArmyHolder.knightsPlayed} Knights)` : 'Unclaimed'}
              </div>
            </div>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}
