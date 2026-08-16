import { useState } from 'react'
import {
  COMMODITY_LABELS,
  COMMODITY_ORDER,
  PLAYER_COLORS,
  RESOURCE_ORDER,
  type Commodities,
  type CommodityType,
  type Player,
  type ResourceType,
  type Resources,
} from '../../game/types'
import { useDraggablePanel } from '../../hooks/useDraggablePanel'
import { ResourceIcon } from './ResourceIcon'
import { CommodityIcon } from './CommodityIcon'

interface TradeModalProps {
  resources: Resources
  rates: Record<ResourceType, number>
  onTrade: (give: ResourceType, receive: ResourceType) => void
  otherPlayers: Player[]
  onProposeTrade: (toPlayerId: number, offerResource: ResourceType, wantResource: ResourceType) => void
  onClose: () => void
  // Stays mounted across a turn change now (GameHud.tsx only unmounts it on
  // an explicit Close) — this is what disables the actual trade actions
  // while it's not the viewer's turn, rather than the window vanishing.
  isMyTurn: boolean
  // Cities & Knights Trade level 3 — 2:1 commodity trading. commodities is
  // always passed (harmless while the tab itself stays hidden below trade
  // level 3); canTradeCommodities is what actually gates rendering the tab.
  commodities: Commodities
  canTradeCommodities: boolean
  onTradeCommodity: (give: CommodityType, receive: ResourceType | CommodityType) => void
}

type TradeMode = 'bank' | 'player' | 'commodity'

export function TradeModal({
  resources,
  rates,
  onTrade,
  otherPlayers,
  onProposeTrade,
  onClose,
  isMyTurn,
  commodities,
  canTradeCommodities,
  onTradeCommodity,
}: TradeModalProps) {
  const [mode, setMode] = useState<TradeMode>('bank')
  const [give, setGive] = useState<ResourceType | null>(null)
  const [receive, setReceive] = useState<ResourceType | null>(null)
  const [targetPlayerId, setTargetPlayerId] = useState<number | null>(otherPlayers[0]?.id ?? null)
  // Kept as their own state (not folded into give/receive above) — those two
  // are strictly ResourceType, and widening them to include CommodityType
  // would let a stale commodity selection leak into the bank/player pickers'
  // ResourceType-only logic (rates[give], resources[give], etc.) the instant
  // a player switches tabs.
  const [commodityGive, setCommodityGive] = useState<CommodityType | null>(null)
  const [commodityReceive, setCommodityReceive] = useState<ResourceType | CommodityType | null>(null)
  const { panelRef, onHeaderPointerDown } = useDraggablePanel<HTMLDivElement>()

  const rate = give ? rates[give] : null
  const canConfirmBank =
    isMyTurn && give != null && receive != null && give !== receive && rate != null && resources[give] >= rate
  const canProposePlayer =
    isMyTurn && give != null && receive != null && give !== receive && targetPlayerId != null && resources[give] >= 1
  // Fixed 2:1 rate — this ability, unlike bank trades, never varies by port,
  // so there's no rates[] lookup here at all.
  const canConfirmCommodity =
    isMyTurn &&
    commodityGive != null &&
    commodityReceive != null &&
    commodityGive !== commodityReceive &&
    commodities[commodityGive] >= 2

  const confirmBankTrade = () => {
    if (!give || !receive) return
    onTrade(give, receive)
    setGive(null)
    setReceive(null)
  }

  const proposeTrade = () => {
    if (!give || !receive || targetPlayerId == null) return
    onProposeTrade(targetPlayerId, give, receive)
    setGive(null)
    setReceive(null)
  }

  const confirmCommodityTrade = () => {
    if (!commodityGive || !commodityReceive) return
    onTradeCommodity(commodityGive, commodityReceive)
    setCommodityGive(null)
    setCommodityReceive(null)
  }

  return (
    <div
      ref={panelRef}
      // Starting spot is beside ResourcePanel (top-20 right-4 w-52), not
      // overlapping it or ChatBoxPanel's own right-4 column further down —
      // still fully draggable from here via the header below.
      className="pointer-events-auto absolute top-20 right-60 w-56 rounded-2xl border border-glass-border bg-glass p-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl"
    >
      <div
        onPointerDown={onHeaderPointerDown}
        className="mb-3 flex cursor-grab items-center justify-between select-none active:cursor-grabbing"
      >
        <span className="font-display text-sm text-white">Trade</span>
        <button type="button" onClick={onClose} className="text-white/50 hover:text-white" aria-label="Close">
          ✕
        </button>
      </div>

      {!isMyTurn && (
        <p className="mb-3 rounded-lg border border-glass-border bg-white/5 px-2.5 py-1.5 text-center font-body text-[10px] tracking-[0.1em] text-white/50 uppercase">
          Waiting for your turn…
        </p>
      )}

      <div className="mb-3 flex rounded-lg border border-glass-border bg-white/5 p-0.5">
        <button
          type="button"
          onClick={() => setMode('bank')}
          className={`flex-1 rounded-md py-1 font-body text-[10px] tracking-[0.1em] uppercase transition-colors ${
            mode === 'bank' ? 'bg-gold/20 text-gold' : 'text-white/60'
          }`}
        >
          Bank
        </button>
        <button
          type="button"
          onClick={() => setMode('player')}
          disabled={otherPlayers.length === 0}
          className={`flex-1 rounded-md py-1 font-body text-[10px] tracking-[0.1em] uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
            mode === 'player' ? 'bg-gold/20 text-gold' : 'text-white/60'
          }`}
        >
          Players
        </button>
        {/* Only shown once Trade level 3 is actually reached — same
            conditional-rendering pattern the citiesAndKnightsCommodities
            house rule already uses elsewhere (CityImprovementsPanel,
            ResourcePanel's commodity row), so a player below level 3 never
            even sees this ability exists. */}
        {canTradeCommodities && (
          <button
            type="button"
            onClick={() => setMode('commodity')}
            className={`flex-1 rounded-md py-1 font-body text-[10px] tracking-[0.1em] uppercase transition-colors ${
              mode === 'commodity' ? 'bg-gold/20 text-gold' : 'text-white/60'
            }`}
          >
            Commodities
          </button>
        )}
      </div>

      {mode === 'player' && (
        <>
          <span className="mb-1 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">
            Trade With
          </span>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {otherPlayers.map((player) => {
              const selected = targetPlayerId === player.id
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => setTargetPlayerId(player.id)}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-body text-[11px] transition-colors ${
                    selected ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/5 text-white/75'
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: PLAYER_COLORS[player.colorToken] }}
                  />
                  {player.name}
                </button>
              )
            })}
          </div>
        </>
      )}

      {mode !== 'commodity' && (
        <>
          <span className="mb-1 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">
            {mode === 'bank' ? 'Give' : 'You Offer'}
          </span>
          <div className="mb-3 grid grid-cols-5 gap-1.5">
            {RESOURCE_ORDER.map((resource) => {
              const minNeeded = mode === 'bank' ? rates[resource] : 1
              const affordable = resources[resource] >= minNeeded
              const selected = give === resource
              return (
                <button
                  key={resource}
                  type="button"
                  disabled={!affordable}
                  onClick={() => setGive(resource)}
                  title={mode === 'bank' ? `${resource} (${rates[resource]}:1)` : resource}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border py-1.5 transition-colors ${
                    selected ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/5 text-white/85'
                  } ${affordable ? '' : 'cursor-not-allowed opacity-30'}`}
                >
                  <ResourceIcon resource={resource} className="h-4 w-4" />
                  {mode === 'bank' && <span className="font-data text-[9px]">{rates[resource]}:1</span>}
                </button>
              )
            })}
          </div>

          <span className="mb-1 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">
            {mode === 'bank' ? 'Receive' : 'You Want'}
          </span>
          <div className="mb-4 grid grid-cols-5 gap-1.5">
            {RESOURCE_ORDER.map((resource) => {
              const selected = receive === resource
              const disabled = resource === give
              return (
                <button
                  key={resource}
                  type="button"
                  disabled={disabled}
                  onClick={() => setReceive(resource)}
                  title={resource}
                  className={`flex items-center justify-center rounded-lg border py-1.5 transition-colors ${
                    selected ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/5 text-white/85'
                  } ${disabled ? 'cursor-not-allowed opacity-30' : ''}`}
                >
                  <ResourceIcon resource={resource} className="h-4 w-4" />
                </button>
              )
            })}
          </div>
        </>
      )}

      {mode === 'commodity' && (
        <>
          {/* Fixed 2:1 rate — this ability, unlike Bank mode, never varies by
              port, so there's no per-icon rate lookup/label the way Bank's
              Give grid has. */}
          <span className="mb-1 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">
            Give (2:1)
          </span>
          <div className="mb-3 grid grid-cols-5 gap-1.5">
            {COMMODITY_ORDER.map((commodity) => {
              const affordable = commodities[commodity] >= 2
              const selected = commodityGive === commodity
              return (
                <button
                  key={commodity}
                  type="button"
                  disabled={!affordable}
                  onClick={() => setCommodityGive(commodity)}
                  title={`${COMMODITY_LABELS[commodity]} (2:1)`}
                  className={`flex flex-col items-center gap-0.5 rounded-lg border py-1.5 transition-colors ${
                    selected ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/5 text-white/85'
                  } ${affordable ? '' : 'cursor-not-allowed opacity-30'}`}
                >
                  <CommodityIcon commodity={commodity} className="h-4 w-4" />
                </button>
              )
            })}
          </div>

          {/* Receive covers BOTH resources and commodities — the rulebook
              lets Trade level 3 exchange a commodity for either — so the two
              card types are split into their own labeled rows rather than
              merged into one ambiguous grid. */}
          <span className="mb-1 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">Receive</span>
          <span className="mb-1 block font-body text-[9px] tracking-[0.15em] text-white/35 uppercase">Resources</span>
          <div className="mb-2 grid grid-cols-5 gap-1.5">
            {RESOURCE_ORDER.map((resource) => {
              const selected = commodityReceive === resource
              return (
                <button
                  key={resource}
                  type="button"
                  onClick={() => setCommodityReceive(resource)}
                  title={resource}
                  className={`flex items-center justify-center rounded-lg border py-1.5 transition-colors ${
                    selected ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/5 text-white/85'
                  }`}
                >
                  <ResourceIcon resource={resource} className="h-4 w-4" />
                </button>
              )
            })}
          </div>
          <span className="mb-1 block font-body text-[9px] tracking-[0.15em] text-white/35 uppercase">Commodities</span>
          <div className="mb-4 grid grid-cols-5 gap-1.5">
            {COMMODITY_ORDER.map((commodity) => {
              const selected = commodityReceive === commodity
              const disabled = commodity === commodityGive
              return (
                <button
                  key={commodity}
                  type="button"
                  disabled={disabled}
                  onClick={() => setCommodityReceive(commodity)}
                  title={COMMODITY_LABELS[commodity]}
                  className={`flex items-center justify-center rounded-lg border py-1.5 transition-colors ${
                    selected ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/5 text-white/85'
                  } ${disabled ? 'cursor-not-allowed opacity-30' : ''}`}
                >
                  <CommodityIcon commodity={commodity} className="h-4 w-4" />
                </button>
              )
            })}
          </div>
        </>
      )}

      {mode === 'bank' ? (
        <button
          type="button"
          disabled={!canConfirmBank}
          onClick={confirmBankTrade}
          className="w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2 font-display text-sm font-semibold text-board-navy transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
        >
          {rate ? `Confirm Trade (${rate}:1)` : 'Confirm Trade'}
        </button>
      ) : mode === 'player' ? (
        <button
          type="button"
          disabled={!canProposePlayer}
          onClick={proposeTrade}
          className="w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2 font-display text-sm font-semibold text-board-navy transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
        >
          Propose Trade
        </button>
      ) : (
        <button
          type="button"
          disabled={!canConfirmCommodity}
          onClick={confirmCommodityTrade}
          className="w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2 font-display text-sm font-semibold text-board-navy transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
        >
          Confirm Trade (2:1)
        </button>
      )}
    </div>
  )
}
