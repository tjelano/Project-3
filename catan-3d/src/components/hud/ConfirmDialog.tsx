import { useModalFocusTrap } from '../../hooks/useModalFocusTrap'

// Shared by LocalSetup.tsx and OnlineSetup.tsx for the "delete this map?"
// prompt — same glass-card-over-dimmed-backdrop language StartScreen.tsx
// itself uses, rather than the browser's native window.confirm().
export function ConfirmDialog({
  message,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel,
}: {
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  const dialogRef = useModalFocusTrap<HTMLDivElement>(onCancel)

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-board-navy/80 backdrop-blur-sm">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-message"
        tabIndex={-1}
        className="w-80 rounded-2xl border border-glass-border bg-glass p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      >
        <p id="confirm-dialog-message" className="font-body text-sm text-white">
          {message}
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-glass-border bg-white/5 py-2 font-body text-xs tracking-[0.1em] text-white/70 uppercase transition-colors hover:bg-white/10 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-player-1 py-2 font-body text-xs font-semibold tracking-[0.1em] text-white uppercase transition-transform hover:scale-[1.02] active:scale-95"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
