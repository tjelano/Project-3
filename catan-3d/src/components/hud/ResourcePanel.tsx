import {
  COMMODITY_COLORS,
  COMMODITY_LABELS,
  COMMODITY_ORDER,
  type Commodities,
  type DevCardType,
  type Resources,
} from '../../game/types'
import { discardHandSize, discardThreshold } from '../../game/discard'
import { CommodityIcon } from './CommodityIcon'

// City Walls moved to its own CityWallsPanel — see that file's own
// comment. Buy Dev Card stays here.
export function ResourcePanel({
  resources,
  commodities,
  countsCommodities,
  canTrade,
  onOpenTrade,
  devCards,
  canBuyDevCard,
  onBuyDevCard,
  citiesAndKnightsKnights,
  cityWallCount,
}: {
  resources: Resources
  // Commodities (Cities & Knights house rule) — counted toward the
  // discard-risk hand size AND broken out as their own per-type row, both
  // only when countsCommodities is true. Always passed down the same way
  // resources already is.
  commodities: Commodities
  countsCommodities: boolean
  canTrade: boolean
  onOpenTrade: () => void
  devCards: DevCardType[]
  canBuyDevCard: boolean
  onBuyDevCard: () => void
  // Cities & Knights city walls (Task 12) — gates whether cityWallCount
  // below applies to the discard threshold, same "derived from GameRules,
  // not folded into an existing flag" precedent citiesAndKnightsKnights'
  // own sibling flags keep elsewhere (see e.g. citiesAndKnightsCommodities'
  // comment in GameHud.tsx).
  citiesAndKnightsKnights: boolean
  // Cities & Knights city walls (Task 12) — the viewer's OWN wall count
  // (viewer.cityWalls.length, GameHud.tsx), used to raise the "cards in
  // hand" discard-risk threshold below via discardThreshold. Only ever
  // applied while citiesAndKnightsKnights is on (see atDiscardRisk), same
  // "flag gates whether the derived value even applies" split every other
  // Cities & Knights prop pair in this file already keeps.
  cityWallCount: number
}) {
  // Same single rule App.tsx's discard pipeline measures against — see
  // discardHandSize (game/discard.ts) on why this must not be re-inlined.
  const handSize = discardHandSize(resources, commodities, countsCommodities)
  // Catan discards half your hand on a 7 once you hold more than seven —
  // but CN3087 p.8 raises that threshold by 2 per city wall the viewer
  // owns, so this must read the SAME discardThreshold (game/discard.ts)
  // the actual forced-discard enforcement elsewhere in the app measures
  // against, not a hardcoded 7, or this indicator falsely flags "at risk"
  // for a walled player who isn't. Wall count only counts while
  // citiesAndKnightsKnights is on, matching every other call site's own
  // "pass 0 when the house rule is off" convention (discardThreshold's own
  // comment).
  const threshold = discardThreshold(citiesAndKnightsKnights ? cityWallCount : 0)
  const atDiscardRisk = handSize > threshold

  return (
    <div className="pointer-events-auto flex w-full flex-col gap-2 rounded-2xl border border-glass-border bg-glass p-3 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
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
        <span className="px-1 font-body text-[10px] text-player-1/80">
          Over {threshold} — a rolled 7 costs you half.
        </span>
      )}

      {/* Same reasoning as the "Cards in hand" total above: the commodity
          cards themselves live in the 3D hand, but "how much paper do I have"
          is a number you need constantly (every City Improvements cost is
          quoted in one specific commodity) and counting a fanned hand by eye
          is exactly what a HUD should spare you. Gated on countsCommodities
          so base-game matches, which can never hold any, don't get a row of
          three permanent zeroes. */}
      {countsCommodities && (
        <div className="flex items-center gap-1">
          {COMMODITY_ORDER.map((commodity) => (
            // Tinted per commodity from the same palette the 3D board reads
            // (COMMODITY_COLORS). Set on the chip rather than the icon
            // because CommodityIcon fills from currentColor and takes no
            // style prop — the count below re-declares its own color, so it
            // doesn't inherit the tint.
            <div
              key={commodity}
              title={COMMODITY_LABELS[commodity]}
              style={{ color: COMMODITY_COLORS[commodity] }}
              className="flex flex-1 items-center justify-center gap-1 rounded-full bg-white/5 py-1 ring-1 ring-glass-border"
            >
              <CommodityIcon commodity={commodity} className="h-3 w-3 shrink-0" />
              <span className="font-data text-xs tabular-nums text-white/80">{commodities[commodity]}</span>
            </div>
          ))}
        </div>
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
    </div>
  )
}
