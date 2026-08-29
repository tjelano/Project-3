import {
  COMMODITY_LABELS,
  COMMODITY_ORDER,
  RESOURCE_LABELS,
  RESOURCE_ORDER,
  type Commodities,
  type CommodityType,
  type Resources,
  type ResourceType,
} from '../../game/types'
import { HAND_STACK_THRESHOLD } from '../PlayerHand3D'

// Shown while gamePhase === 'discard' (a natural 7 caught someone with more
// than 7 cards). Frosted/dimmed like the other modals, but deliberately
// NOT a full pointer-events-auto blocker: the whole board and the 3D hand
// underneath stay live and clickable, since discarding is done by clicking
// the actual 3D cards, not this panel — this is just the counter + confirm.
export function DiscardPanel({
  isMyDiscardTurn,
  discardingPlayerName,
  requiredCount,
  selectedCount,
  onConfirm,
  resources,
  commodities,
  discardSelection,
  onToggleDiscard,
}: {
  isMyDiscardTurn: boolean
  discardingPlayerName: string
  requiredCount: number
  selectedCount: number
  onConfirm: () => void
  resources: Resources
  commodities: Commodities
  discardSelection: string[]
  onToggleDiscard: (cardId: string) => void
}) {
  const remaining = requiredCount - selectedCount

  // Mirrors PlayerHand3D's own buildCardSlots threshold — past this many
  // resource+commodity cards, the 3D hand collapses each type into one
  // sprite, so clicking a specific card there no longer works as a
  // selection gesture. These +/- steppers pick specific "<type>-<index>"
  // ids on the player's behalf instead, via the exact same onToggleDiscard
  // PlayerHand3D's own card clicks already call.
  const tradeableTotal =
    RESOURCE_ORDER.reduce((sum, r) => sum + resources[r], 0) + COMMODITY_ORDER.reduce((sum, c) => sum + commodities[c], 0)
  const stacked = tradeableTotal > HAND_STACK_THRESHOLD

  const stepperRow = (type: ResourceType | CommodityType, label: string, total: number) => {
    if (total === 0) return null
    const selectedOfType = discardSelection.filter((id) => id.startsWith(`${type}-`)).length
    const addOne = () => {
      for (let i = 0; i < total; i++) {
        const id = `${type}-${i}`
        if (!discardSelection.includes(id)) {
          onToggleDiscard(id)
          return
        }
      }
    }
    const removeOne = () => {
      for (let i = total - 1; i >= 0; i--) {
        const id = `${type}-${i}`
        if (discardSelection.includes(id)) {
          onToggleDiscard(id)
          return
        }
      }
    }
    return (
      <div key={type} className="flex items-center justify-between gap-2 text-xs text-white/80">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={selectedOfType === 0}
            onClick={removeOne}
            className="h-5 w-5 rounded bg-white/10 font-display text-sm leading-none hover:bg-white/20 disabled:opacity-30"
          >
            −
          </button>
          <span className="w-8 text-center font-data">
            {selectedOfType}/{total}
          </span>
          <button
            type="button"
            disabled={selectedOfType >= total}
            onClick={addOne}
            className="h-5 w-5 rounded bg-white/10 font-display text-sm leading-none hover:bg-white/20 disabled:opacity-30"
          >
            +
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Dims/frosts the board, fading out smoothly toward the bottom of the
          viewport rather than stopping at a hard edge — a flat cutoff line
          reads as a bug, not a vignette. A backdrop-blur affects everything
          rendered behind it regardless of pointer-events, and the 3D hand
          (where the discard-flagging actually happens) sits at the bottom
          of the screen, so full-height coverage was blurring the very
          cards the player needs to read clearly. The mask fades it to
          nothing well above where the hand renders. */}
      <div
        className="pointer-events-none absolute inset-0 z-30 bg-board-navy/45 backdrop-blur-[2px]"
        style={{
          maskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 78%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 0%, black 45%, transparent 78%)',
        }}
      />
      <div className="pointer-events-auto absolute top-28 left-1/2 z-30 w-72 -translate-x-1/2 rounded-2xl border border-glass-border bg-glass px-6 py-5 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        {isMyDiscardTurn ? (
          <>
            <p className="font-body text-[10px] tracking-[0.25em] text-player-1/80 uppercase">
              Rolled a 7 — Over the Limit
            </p>
            <p className="mt-2 font-display text-lg text-white">
              {remaining > 0 ? `Select ${remaining} more card${remaining === 1 ? '' : 's'} to discard` : 'Ready to discard'}
            </p>
            {stacked && (
              <div className="mt-3 flex flex-col gap-1.5 text-left">
                {RESOURCE_ORDER.map((resource) => stepperRow(resource, RESOURCE_LABELS[resource], resources[resource]))}
                {COMMODITY_ORDER.map((commodity) => stepperRow(commodity, COMMODITY_LABELS[commodity], commodities[commodity]))}
              </div>
            )}
            <button
              type="button"
              disabled={remaining !== 0}
              onClick={onConfirm}
              className="mt-4 w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
            >
              Confirm Discard
            </button>
          </>
        ) : (
          <p className="font-body text-sm text-white/70">Waiting for {discardingPlayerName} to discard…</p>
        )}
      </div>
    </>
  )
}
