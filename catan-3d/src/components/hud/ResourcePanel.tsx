import {
  DEV_CARD_ORDER,
  DEV_CARD_PLAY_LABELS,
  totalResourceCount,
  type DevCardType,
  type Resources,
} from '../../game/types'

export function ResourcePanel({
  resources,
  canTrade,
  onOpenTrade,
  devCards,
  devCardsBoughtThisTurn,
  knightsPlayed,
  canBuyDevCard,
  onBuyDevCard,
  canPlayDevCards,
  onPlayDevCard,
}: {
  resources: Resources
  canTrade: boolean
  onOpenTrade: () => void
  devCards: DevCardType[]
  devCardsBoughtThisTurn: DevCardType[]
  knightsPlayed: number
  canBuyDevCard: boolean
  onBuyDevCard: () => void
  canPlayDevCards: boolean
  onPlayDevCard: (type: DevCardType) => void
}) {
  const handSize = totalResourceCount(resources)
  // Catan discards half your hand on a 7 once you hold more than seven.
  const atDiscardRisk = handSize > 7

  const devCardCounts = DEV_CARD_ORDER.map((type) => ({
    type,
    count: devCards.filter((card) => card === type).length,
    playable:
      devCards.filter((card) => card === type).length -
      devCardsBoughtThisTurn.filter((card) => card === type).length,
  }))

  return (
    <div className="pointer-events-auto absolute top-20 right-4 flex w-52 flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      {/* The cards themselves now live in the 3D hand, but the TOTAL still
          belongs here: a player has to know when they are over seven, since
          a rolled 7 discards half. Counting a fanned hand by eye is exactly
          the thing a HUD should do for you. */}
      <div
        className={`flex items-center justify-between rounded-full px-3 py-1.5 ring-1 ${
          atDiscardRisk
            ? 'bg-player-1/15 text-player-1 ring-player-1/60'
            : 'bg-white/5 text-white/80 ring-glass-border'
        }`}
      >
        <span className="font-body text-[10px] tracking-[0.2em] uppercase">Cards in hand</span>
        <span className="font-data text-sm tabular-nums">{handSize}</span>
      </div>
      {atDiscardRisk && (
        <span className="px-1 font-body text-[10px] text-player-1/80">Over 7 — a rolled 7 costs you half.</span>
      )}

      <button
        type="button"
        disabled={!canTrade}
        onClick={onOpenTrade}
        className="mt-1 rounded-full border border-glass-border bg-white/5 py-1.5 font-body text-[10px] tracking-[0.15em] text-white/70 uppercase transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-glass-border disabled:hover:text-white/70"
      >
        Trade
      </button>
      <button
        type="button"
        disabled={!canBuyDevCard}
        onClick={onBuyDevCard}
        className="flex items-center justify-center gap-1.5 rounded-full border border-glass-border bg-white/5 py-1.5 font-body text-[10px] tracking-[0.15em] text-white/70 uppercase transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-glass-border disabled:hover:text-white/70"
      >
        Buy Dev Card
        <span className="font-data text-[9px] text-white/50">({devCards.length})</span>
      </button>

      <span className="mt-2 px-1 font-body text-[10px] tracking-[0.25em] text-white/50 uppercase">
        Play a Card
      </span>
      <div className="flex flex-col gap-1.5 rounded-xl border border-glass-border bg-white/5 p-2">
        {devCardCounts.map(({ type, playable }) => {
          const playLabel = DEV_CARD_PLAY_LABELS[type]
          if (!playLabel) return null
          return (
            <button
              key={type}
              type="button"
              disabled={!canPlayDevCards || playable <= 0}
              onClick={() => onPlayDevCard(type)}
              className="flex items-center justify-between rounded-full border border-glass-border bg-white/5 px-2.5 py-1 font-body text-[9px] tracking-[0.08em] text-white/70 uppercase transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-glass-border disabled:hover:text-white/70"
            >
              <span>{playLabel}</span>
              {playable > 0 && <span className="font-data text-[9px] text-gold/80">{playable}</span>}
            </button>
          )
        })}
        {knightsPlayed > 0 && (
          <span className="px-1 font-data text-[9px] text-white/40">{knightsPlayed} knights played</span>
        )}
      </div>
    </div>
  )
}
