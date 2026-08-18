import {
  COMMODITY_COLORS,
  COMMODITY_LABELS,
  COMMODITY_ORDER,
  DEV_CARD_ORDER,
  DEV_CARD_PLAY_LABELS,
  type Commodities,
  type DevCardType,
  type Resources,
} from '../../game/types'
import { discardHandSize } from '../../game/discard'
import { CollapsibleSection } from './CollapsibleSection'
import { CommodityIcon } from './CommodityIcon'

export function ResourcePanel({
  resources,
  commodities,
  countsCommodities,
  canTrade,
  onOpenTrade,
  devCards,
  devCardsBoughtThisTurn,
  knightsPlayed,
  canBuyDevCard,
  onBuyDevCard,
  canPlayDevCards,
  onPlayDevCard,
  citiesAndKnightsKnights,
  ownCities,
  canBuildWallAt,
  onBuildWall,
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
  devCardsBoughtThisTurn: DevCardType[]
  knightsPlayed: number
  canBuyDevCard: boolean
  onBuyDevCard: () => void
  canPlayDevCards: boolean
  onPlayDevCard: (type: DevCardType) => void
  // Cities & Knights city walls (Task 12) — gates whether the "City Walls"
  // button row below renders at all, same "derived from GameRules, not
  // folded into an existing flag" precedent citiesAndKnightsKnights' own
  // sibling flags keep elsewhere (see e.g. citiesAndKnightsCommodities'
  // comment in GameHud.tsx).
  citiesAndKnightsKnights: boolean
  // Vertex ids of every city the viewer owns — a wall can only ever go on
  // one of THEIR OWN cities, so each gets its own button rather than a
  // board picker.
  ownCities: string[]
  canBuildWallAt: (vertexId: string) => boolean
  onBuildWall: (vertexId: string) => void
}) {
  // Same single rule App.tsx's discard pipeline measures against — see
  // discardHandSize (game/discard.ts) on why this must not be re-inlined.
  const handSize = discardHandSize(resources, commodities, countsCommodities)
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

      {/* Cities & Knights city walls (Task 12) — no board picker: one button
          per city the viewer already owns, each independently gated by
          canBuildWallAt (ownership/no-existing-wall/board-wide cap/
          affordability, all checked in game/knights.ts's canBuildCityWall).
          Only rendered once the viewer actually has a city to wall, so a
          fresh match never shows an empty row. */}
      {citiesAndKnightsKnights && ownCities.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="font-body text-[10px] tracking-[0.2em] text-white/60 uppercase">City Walls</span>
          <div className="flex gap-1">
            {ownCities.map((vertexId) => (
              <button
                key={vertexId}
                type="button"
                disabled={!canBuildWallAt(vertexId)}
                onClick={() => onBuildWall(vertexId)}
                className="rounded bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide hover:bg-white/20 disabled:opacity-40"
              >
                Wall
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-2">
        <CollapsibleSection icon="🃏" label="Play a Card">
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
        </CollapsibleSection>
      </div>
    </div>
  )
}
