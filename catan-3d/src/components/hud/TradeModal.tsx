import { useState } from 'react'
import { PLAYER_COLORS, RESOURCE_ORDER, type Player, type ResourceType, type Resources } from '../../game/types'
import { useDraggablePanel } from '../../hooks/useDraggablePanel'
import { ResourceIcon } from './ResourceIcon'

interface TradeModalProps {
  resources: Resources
  rates: Record<ResourceType, number>
  onTrade: (give: ResourceType, receive: ResourceType) => void
  otherPlayers: Player[]
  onProposeTrade: (toPlayerId: number, offerResource: ResourceType, wantResource: ResourceType) => void
  onClose: () => void
}

type TradeMode = 'bank' | 'player'

export function TradeModal({ resources, rates, onTrade, otherPlayers, onProposeTrade, onClose }: TradeModalProps) {
  const [mode, setMode] = useState<TradeMode>('bank')
  const [give, setGive] = useState<ResourceType | null>(null)
  const [receive, setReceive] = useState<ResourceType | null>(null)
  const [targetPlayerId, setTargetPlayerId] = useState<number | null>(otherPlayers[0]?.id ?? null)
  const { panelRef, onHeaderPointerDown } = useDraggablePanel<HTMLDivElement>()

  const rate = give ? rates[give] : null
  const canConfirmBank = give != null && receive != null && give !== receive && rate != null && resources[give] >= rate
  const canProposePlayer =
    give != null && receive != null && give !== receive && targetPlayerId != null && resources[give] >= 1

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

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto absolute top-96 right-4 w-56 rounded-2xl border border-glass-border bg-glass p-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-xl"
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
              className={`flex items-center justify-center rounded-lg border py-1.5 transition-colors ${
                selected ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/5 text-white/85'
              } ${disabled ? 'cursor-not-allowed opacity-30' : ''}`}
            >
              <ResourceIcon resource={resource} className="h-4 w-4" />
            </button>
          )
        })}
      </div>

      {mode === 'bank' ? (
        <button
          type="button"
          disabled={!canConfirmBank}
          onClick={confirmBankTrade}
          className="w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2 font-display text-sm font-semibold text-board-navy transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
        >
          {rate ? `Confirm Trade (${rate}:1)` : 'Confirm Trade'}
        </button>
      ) : (
        <button
          type="button"
          disabled={!canProposePlayer}
          onClick={proposeTrade}
          className="w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2 font-display text-sm font-semibold text-board-navy transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
        >
          Propose Trade
        </button>
      )}
    </div>
  )
}
