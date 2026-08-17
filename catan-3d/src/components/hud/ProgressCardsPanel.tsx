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
  // Gates the Play buttons the same way GameHud's own canPlayDevCards
  // gates ResourcePanel's dev-card buttons — every play handler this panel
  // dispatches to acts on players[currentPlayerIndex] with no further
  // turn check of its own (see playIrrigation/playMining/playAlchemy in
  // App.tsx), so without this a non-turn viewer could play a card off
  // THEIR OWN hand display and have it silently resolve against whoever's
  // turn it actually is. Deliberately NOT applied while discardActive —
  // that flow already has its own independent turn concept
  // (isMyProgressDiscardTurn), unrelated to whose roll/build turn it is.
  isMyTurn: boolean
  discardActive?: boolean
  // Indices into `progressCards`, not card types — a hand can hold 2 copies
  // of the same type (crane: 2 in the deck composition, etc.), so selection
  // has to identify a specific ARRAY INDEX to let either instance be
  // selected/discarded independently (Task 6).
  discardSelection?: number[]
  onToggleDiscard?: (index: number) => void
}

export function ProgressCardsPanel({
  progressCards, deckCounts, playHandlers, isMyTurn, discardActive, discardSelection, onToggleDiscard,
}: ProgressCardsPanelProps) {
  if (progressCards.length === 0) return null
  // Distinct 4-card hand-limit indicator, called for in the design spec
  // (docs/superpowers/specs/2026-08-16-cities-knights-progress-cards-design.md,
  // "Hand Limit") but never actually surfaced here — before this, a player
  // couldn't see how close their hand was to the limit until the discard
  // prompt (App.tsx's progressCardOverLimitPlayerIds queue) already fired.
  // Same "non-VP cards only" rule as progressCardHandExcess (game/discard.ts
  // — this component doesn't need the excess math, just the raw count).
  const nonVpCount = progressCards.filter((card) => !PROGRESS_CARD_VP_TYPES.has(card)).length
  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <span className="font-body text-[10px] tracking-[0.2em] text-white/60 uppercase">Progress Cards</span>
        <span className={`font-body text-[10px] ${nonVpCount > 4 ? 'text-red-400' : 'text-white/40'}`}>
          {nonVpCount}/4
        </span>
      </div>
      <div className="flex items-center justify-end">
        <span className="font-body text-[10px] text-white/40">
          Sci {deckCounts.science} · Trd {deckCounts.trade} · Pol {deckCounts.politics}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {progressCards.map((card, index) => {
          const isVp = PROGRESS_CARD_VP_TYPES.has(card)
          const selected = discardSelection?.includes(index)
          return (
            <button
              key={`${card}-${index}`}
              type="button"
              disabled={isVp || (!discardActive && (!isMyTurn || !playHandlers[card]))}
              onClick={() => (discardActive ? onToggleDiscard?.(index) : playHandlers[card]?.())}
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
