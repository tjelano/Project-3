import { COMMODITY_LABELS, COMMODITY_ORDER, type CommodityType } from '../../game/types'
import { useModalDialog } from '../../hooks/useModalDialog'
import { CommodityIcon } from './CommodityIcon'

interface DevCardCommodityPickerProps {
  title: string
  subtitle: string
  onComplete: (pick: CommodityType) => void
}

// Sibling to DevCardResourcePicker — same shape (same modal chrome, same
// "click 1 icon" flow), but over COMMODITY_ORDER/CommodityIcon instead of
// RESOURCE_ORDER/ResourceIcon. Kept as a separate component rather than
// generalizing DevCardResourcePicker over both types, since that
// component's existing 2 callers (Year of Plenty, Monopoly) have no need
// for the extra type-parameter complexity this would add to working code.
// Trade Monopoly only ever announces 1 commodity type (unlike Year of
// Plenty's 2-resource pick), so pickCount is fixed at 1 here rather than
// exposed as a prop — the single click both records the pick and resolves
// the picker immediately, so there's no running picks array to track.
export function DevCardCommodityPicker({ title, subtitle, onComplete }: DevCardCommodityPickerProps) {
  // No onClose: this is a forced pick (Trade Monopoly) with no cancel
  // path, same as DevCardResourcePicker.
  const dialogRef = useModalDialog<HTMLDialogElement>()

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="dev-card-commodity-picker-title"
      className="pointer-events-auto m-auto w-80 rounded-2xl border border-glass-border bg-glass p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl backdrop:bg-board-navy/80 backdrop:backdrop-blur-md"
    >
      <p
        id="dev-card-commodity-picker-title"
        className="font-body text-xs tracking-[0.25em] text-gold/80 uppercase"
      >
        {title}
      </p>
      <p className="mt-2 font-body text-sm text-white/70">{subtitle}</p>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {COMMODITY_ORDER.map((commodity) => (
          <button
            key={commodity}
            type="button"
            onClick={() => onComplete(commodity)}
            title={COMMODITY_LABELS[commodity]}
            className="flex flex-col items-center gap-1 rounded-lg border border-glass-border bg-white/5 py-2.5 transition-colors hover:border-gold/50 hover:bg-white/10"
          >
            <CommodityIcon commodity={commodity} className="h-5 w-5 text-white/85" />
          </button>
        ))}
      </div>
    </dialog>
  )
}
