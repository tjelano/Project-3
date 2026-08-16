import { PROGRESS_CARD_LABELS, PROGRESS_CARD_VP_TYPES, type ProgressCardType } from '../../game/types'

// Card art: catan-3d/src/assets/cards/<Name>_progress.png, one per
// ProgressCardType, keyed by the same PascalCase name PROGRESS_CARD_LABELS
// stores (spaces stripped) — see Step 1's processing pass.
const PROGRESS_CARD_ART: Record<ProgressCardType, string> = {
  alchemy: new URL('../../assets/cards/Alchemy_progress.png', import.meta.url).href,
  crane: new URL('../../assets/cards/Crane_progress.png', import.meta.url).href,
  engineering: new URL('../../assets/cards/Engineering_progress.png', import.meta.url).href,
  invention: new URL('../../assets/cards/Invention_progress.png', import.meta.url).href,
  irrigation: new URL('../../assets/cards/Irrigation_progress.png', import.meta.url).href,
  medicine: new URL('../../assets/cards/Medicine_progress.png', import.meta.url).href,
  mining: new URL('../../assets/cards/Mining_progress.png', import.meta.url).href,
  progressRoadBuilding: new URL('../../assets/cards/RoadBuilding_progress.png', import.meta.url).href,
  smithing: new URL('../../assets/cards/Smithing_progress.png', import.meta.url).href,
  printing: new URL('../../assets/cards/Printing_progress.png', import.meta.url).href,
  commercialHarbor: new URL('../../assets/cards/CommercialHarbor_progress.png', import.meta.url).href,
  guildDues: new URL('../../assets/cards/GuildDues_progress.png', import.meta.url).href,
  merchant: new URL('../../assets/cards/Merchant_progress.png', import.meta.url).href,
  merchantFleet: new URL('../../assets/cards/MerchantFleet_progress.png', import.meta.url).href,
  resourceMonopoly: new URL('../../assets/cards/ResourceMonopoly_progress.png', import.meta.url).href,
  tradeMonopoly: new URL('../../assets/cards/TradeMonopoly_progress.png', import.meta.url).href,
  diplomacy: new URL('../../assets/cards/Diplomacy_progress.png', import.meta.url).href,
  encouragement: new URL('../../assets/cards/Encouragement_progress.png', import.meta.url).href,
  espionage: new URL('../../assets/cards/Espionage_progress.png', import.meta.url).href,
  intrigue: new URL('../../assets/cards/Intrigue_progress.png', import.meta.url).href,
  sabotage: new URL('../../assets/cards/Sabotage_progress.png', import.meta.url).href,
  taxation: new URL('../../assets/cards/Taxation_progress.png', import.meta.url).href,
  treason: new URL('../../assets/cards/Treason_progress.png', import.meta.url).href,
  constitution: new URL('../../assets/cards/Constitution_progress.png', import.meta.url).href,
  wedding: new URL('../../assets/cards/Wedding_progress.png', import.meta.url).href,
}

// Cards with no Play handler wired yet (the 6 knight-dependent no-ops,
// Tasks 8-16 fill in the rest) show this instead of a working button.
// Deliberately a Partial — VP cards (printing/constitution) get NO entry
// at all here, same "no play action, held silently for score" precedent
// as DEV_CARD_PLAY_LABELS omitting victoryPoint (game/types.ts).
export type ProgressCardPlayHandlers = Partial<Record<ProgressCardType, () => void>>

export interface ProgressCardsPanelProps {
  progressCards: ProgressCardType[]
  deckCounts: Record<'science' | 'trade' | 'politics', number>
  playHandlers: ProgressCardPlayHandlers
  discardActive?: boolean
  discardSelection?: ProgressCardType[]
  onToggleDiscard?: (card: ProgressCardType, index: number) => void
}

export function ProgressCardsPanel({
  progressCards, deckCounts, playHandlers, discardActive, discardSelection, onToggleDiscard,
}: ProgressCardsPanelProps) {
  if (progressCards.length === 0) return null
  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <span className="font-body text-[10px] tracking-[0.2em] text-white/60 uppercase">Progress Cards</span>
        <span className="font-body text-[10px] text-white/40">
          Sci {deckCounts.science} · Trd {deckCounts.trade} · Pol {deckCounts.politics}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {progressCards.map((card, index) => {
          const isVp = PROGRESS_CARD_VP_TYPES.has(card)
          const selected = discardSelection?.includes(card) // see Task 6 note below on index-vs-value selection
          return (
            <button
              key={`${card}-${index}`}
              type="button"
              disabled={isVp || (!discardActive && !playHandlers[card])}
              onClick={() => (discardActive ? onToggleDiscard?.(card, index) : playHandlers[card]?.())}
              className={`relative overflow-hidden rounded-lg border transition ${
                selected ? 'border-red-400 ring-2 ring-red-400/60' : 'border-white/20'
              } ${isVp ? 'opacity-70' : 'hover:border-white/50'}`}
              title={PROGRESS_CARD_LABELS[card]}
            >
              <img src={PROGRESS_CARD_ART[card]} alt={PROGRESS_CARD_LABELS[card]} className="aspect-[432/578] w-full object-cover" />
              {isVp && (
                <span className="absolute right-1 top-1 rounded bg-black/60 px-1 text-[9px] text-yellow-300">+1 VP</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
