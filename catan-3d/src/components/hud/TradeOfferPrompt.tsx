import { RESOURCE_LABELS, type Player, type ResourceType } from '../../game/types'
import { useDraggablePanel } from '../../hooks/useDraggablePanel'
import { ResourceIcon } from './ResourceIcon'

export interface PendingTrade {
  fromPlayerId: number
  toPlayerId: number
  offerResource: ResourceType
  wantResource: ResourceType
}

export function TradeOfferPrompt({
  trade,
  players,
  onAccept,
  onDecline,
}: {
  trade: PendingTrade
  players: Player[]
  onAccept: () => void
  onDecline: () => void
}) {
  const fromPlayer = players.find((p) => p.id === trade.fromPlayerId)
  const toPlayer = players.find((p) => p.id === trade.toPlayerId)
  const { panelRef, onHeaderPointerDown } = useDraggablePanel<HTMLDivElement>()
  if (!fromPlayer || !toPlayer) return null

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-board-navy/70 backdrop-blur-md">
      <div
        ref={panelRef}
        className="mx-4 w-full max-w-sm rounded-2xl border border-glass-border bg-glass px-8 py-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-2xl"
      >
        <div onPointerDown={onHeaderPointerDown} className="cursor-grab select-none active:cursor-grabbing">
          <p className="font-body text-[10px] tracking-[0.25em] text-white/50 uppercase">Trade Offer</p>
          <p className="mt-3 font-display text-lg text-white">
            {toPlayer.name}, {fromPlayer.name} proposes:
          </p>
        </div>

        <div className="mt-5 flex items-center justify-center gap-4">
          <div className="flex flex-col items-center gap-1">
            <ResourceIcon resource={trade.offerResource} className="h-8 w-8 text-white" />
            <span className="font-body text-xs text-white/70">You get</span>
            <span className="font-data text-sm text-white">1 {RESOURCE_LABELS[trade.offerResource]}</span>
          </div>
          <span className="font-display text-xl text-gold">⇄</span>
          <div className="flex flex-col items-center gap-1">
            <ResourceIcon resource={trade.wantResource} className="h-8 w-8 text-white" />
            <span className="font-body text-xs text-white/70">You give</span>
            <span className="font-data text-sm text-white">1 {RESOURCE_LABELS[trade.wantResource]}</span>
          </div>
        </div>

        <div className="mt-7 flex gap-3">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 rounded-lg border border-glass-border bg-white/5 py-2.5 font-body text-sm text-white/80 transition-colors hover:border-player-1/60 hover:text-player-1"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="flex-1 rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  )
}
