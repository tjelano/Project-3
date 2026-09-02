import { useState } from 'react'
import { RESOURCE_LABELS, RESOURCE_ORDER, type ResourceType } from '../../game/types'
import { useModalDialog } from '../../hooks/useModalDialog'
import { ResourceIcon } from './ResourceIcon'

interface DevCardResourcePickerProps {
  title: string
  subtitle: string
  pickCount: number
  onComplete: (picks: ResourceType[]) => void
}

// Shared "click N resource icons" picker for Year of Plenty (pickCount 2)
// and Monopoly (pickCount 1) — auto-resolves the instant enough picks land,
// no separate confirm step needed.
export function DevCardResourcePicker({ title, subtitle, pickCount, onComplete }: DevCardResourcePickerProps) {
  const [picks, setPicks] = useState<ResourceType[]>([])
  // No onClose: this is a forced pick (Year of Plenty / Monopoly) with no
  // cancel path, so Escape is intentionally left as a no-op here.
  const dialogRef = useModalDialog<HTMLDialogElement>()

  const pick = (resource: ResourceType) => {
    const next = [...picks, resource]
    if (next.length >= pickCount) {
      onComplete(next)
    } else {
      setPicks(next)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="dev-card-picker-title"
      className="m-auto w-80 rounded-2xl border border-glass-border bg-glass p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl backdrop:bg-board-navy/80 backdrop:backdrop-blur-md"
    >
      <p id="dev-card-picker-title" className="font-body text-xs tracking-[0.25em] text-gold/80 uppercase">
        {title}
      </p>
      <p className="mt-2 font-body text-sm text-white/70">{subtitle}</p>

      <div className="mt-5 grid grid-cols-5 gap-2">
        {RESOURCE_ORDER.map((resource) => (
          <button
            key={resource}
            type="button"
            onClick={() => pick(resource)}
            title={RESOURCE_LABELS[resource]}
            className="flex flex-col items-center gap-1 rounded-lg border border-glass-border bg-white/5 py-2.5 transition-colors hover:border-gold/50 hover:bg-white/10"
          >
            <ResourceIcon resource={resource} className="h-5 w-5 text-white/85" />
          </button>
        ))}
      </div>

      <div className="mt-5 flex items-center justify-center gap-1.5">
        {Array.from({ length: pickCount }).map((_, index) => (
          <span
            key={index}
            className={`h-2 w-2 rounded-full ${index < picks.length ? 'bg-gold' : 'bg-white/15'}`}
          />
        ))}
      </div>
    </dialog>
  )
}
