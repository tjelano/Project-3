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
}

// Metropolis eligibility/claiming is deliberately NOT in this component —
// Task 6 reconciles how a level-4/5 purchase interacts with "requires a
// spare city," and may extend this component's props at that point. Don't
// add a metropolisEligibleTracks/onClaimMetropolis prop pair here; Task 6
// owns that decision.
export function CityImprovementsPanel({ commodities, cityImprovements, canBuy, onBuy }: CityImprovementsPanelProps) {
  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <span className="font-body text-[10px] tracking-[0.2em] text-white/60 uppercase">City Improvements</span>
      {IMPROVEMENT_TRACK_ORDER.map((track) => {
        const level = cityImprovements[track]
        const nextName = level < 5 ? IMPROVEMENT_TRACK_NAMES[track][level] : null
        const cost = level < 5 ? improvementLevelCost(level + 1) : null
        const affordable = canBuy && level < 5 && canAffordImprovement(commodities, track, level)
        return (
          <div key={track} className="flex flex-col gap-1 rounded-xl border border-glass-border bg-white/5 p-2">
            <div className="flex items-center justify-between">
              <span className="font-body text-xs text-white/80">{IMPROVEMENT_TRACK_LABELS[track]}</span>
              <span className="font-data text-xs tabular-nums text-gold/80">Lv {level}</span>
            </div>
            {nextName && (
              <button
                type="button"
                disabled={!affordable}
                onClick={() => onBuy(track)}
                className="flex items-center justify-between rounded-full border border-glass-border bg-white/5 px-2.5 py-1 font-body text-[10px] text-white/70 uppercase transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
              >
                <span>{nextName}</span>
                <span className="flex items-center gap-1 font-data text-[10px] text-white/50">
                  {cost}
                  <CommodityIcon commodity={COMMODITY_FOR_TRACK[track]} className="h-3 w-3" />
                </span>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
