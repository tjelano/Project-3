import {
  COMMODITY_FOR_TRACK,
  IMPROVEMENT_TRACK_LABELS,
  IMPROVEMENT_TRACK_NAMES,
  IMPROVEMENT_TRACK_ORDER,
  type Commodities,
  type CityImprovements,
  type ImprovementTrack,
} from '../../game/types'
import { canAffordImprovement, improvementLevelCost } from '../../game/cityImprovements'
import { CommodityIcon } from './CommodityIcon'

interface CityImprovementsPanelProps {
  commodities: Commodities
  cityImprovements: CityImprovements
  canBuy: boolean // false when it's not this player's turn/action phase, mirrors other build buttons
  onBuy: (track: ImprovementTrack) => void
  // Set the instant a purchase actually claims a Metropolis — that track's
  // row swaps to a "click a city" prompt instead of its normal buy button
  // until the selection resolves (App.tsx's buildSettlementRaw,
  // pendingMetropolisClaim branch). Never true for more than one track at
  // once, and only ever passed non-null to the claim's OWN player.
  pendingMetropolisTrack: ImprovementTrack | null
  // Per track: true when buying the viewer's NEXT level would both actually
  // claim that track's Metropolis (a second player merely matching an
  // existing level-4 holder needs nothing) AND the viewer currently lacks a
  // spare city to place it on. Computed in GameHud via the shared
  // evaluateMetropolisPurchase helper (which needs the full player list), not
  // here — this component just reads the final verdict.
  metropolisPurchaseBlocked: Record<ImprovementTrack, boolean>
}

export function CityImprovementsPanel({
  commodities,
  cityImprovements,
  canBuy,
  onBuy,
  pendingMetropolisTrack,
  metropolisPurchaseBlocked,
}: CityImprovementsPanelProps) {
  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <span className="font-body text-[10px] tracking-[0.2em] text-white/60 uppercase">City Improvements</span>
      {IMPROVEMENT_TRACK_ORDER.map((track) => {
        const level = cityImprovements[track]
        const nextName = level < 5 ? IMPROVEMENT_TRACK_NAMES[track][level] : null
        const cost = level < 5 ? improvementLevelCost(level + 1) : null
        const blockedByMetropolis = metropolisPurchaseBlocked[track]
        const affordable = canBuy && level < 5 && canAffordImprovement(commodities, track, level) && !blockedByMetropolis
        const isPendingSelection = pendingMetropolisTrack === track
        return (
          <div key={track} className="flex flex-col gap-1 rounded-xl border border-glass-border bg-white/5 p-2">
            <div className="flex items-center justify-between">
              <span className="font-body text-xs text-white/80">{IMPROVEMENT_TRACK_LABELS[track]}</span>
              <span className="font-data text-xs tabular-nums text-gold/80">Lv {level}</span>
            </div>
            {isPendingSelection ? (
              <div className="animate-gold-pulse flex items-center justify-center rounded-full border border-gold/60 bg-gold/10 px-2.5 py-1 font-body text-[10px] text-gold uppercase">
                Select a city on the board
              </div>
            ) : (
              nextName && (
                <button
                  type="button"
                  disabled={!affordable}
                  onClick={() => onBuy(track)}
                  title={blockedByMetropolis ? 'Needs a spare city for the Metropolis' : undefined}
                  className="flex items-center justify-between rounded-full border border-glass-border bg-white/5 px-2.5 py-1 font-body text-[10px] text-white/70 uppercase transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <span>{nextName}</span>
                  <span className="flex items-center gap-1 font-data text-[10px] text-white/50">
                    {cost}
                    <CommodityIcon commodity={COMMODITY_FOR_TRACK[track]} className="h-3 w-3" />
                  </span>
                </button>
              )
            )}
          </div>
        )
      })}
    </div>
  )
}
