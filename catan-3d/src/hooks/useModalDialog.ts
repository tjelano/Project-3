import { useCallback, useRef } from 'react'

/**
 * Opens a native <dialog> as a modal when its ref attaches, closes it when
 * the ref detaches. Replaces useModalFocusTrap -- native showModal() already
 * traps Tab/Shift+Tab within itself and focuses the first focusable
 * descendant (or itself, if none); this hook's own deferred close() call on
 * detach restores focus to whatever had it before, matching the old hook's
 * behavior exactly.
 *
 * A CALLBACK ref, not a plain useRef (CodeRabbit review, PR #107) -- some
 * callers (GameHud's Guild Dues/Espionage dialogs) call this hook once when
 * the OWNING component mounts, but the <dialog> element itself only renders
 * later, once some piece of state goes truthy. A plain useRef's mount
 * effect (empty deps) would already have run and no-opped by then, and
 * would never fire again -- the dialog would never open (confirmed live).
 * A callback ref fires exactly when the node actually attaches, whenever
 * that happens relative to the owning component's own lifecycle -- the
 * same reason the ORIGINAL useModalFocusTrap hook used one.
 *
 * Escape is suppressed (preventDefault on the native 'cancel' event) but
 * does NOT close anything or call onClose (2026-09-02, deliberate --
 * onClose is currently unused; see below). Dismissal only works via
 * whatever explicit button each dialog provides (Back/Cancel).
 *
 * WHY the suppression exists at all: a bare dialog with zero listeners
 * lets Escape close it via the browser's own default handling -- but that
 * closes the dialog's INTERNAL state (its `open` property, its top-layer
 * membership) without React ever finding out, since nothing tells React
 * to stop rendering the <dialog> JSX. React still believes the dialog
 * should be open. The first subsequent interaction that makes React
 * actually unmount that same, already-natively-closed node (e.g.
 * clicking Back afterward) crashed the renderer outright -- confirmed
 * reproducible, consistently, in both headless AND headed real Chromium.
 * Preventing the native close keeps the dialog's own internal state in
 * sync with what React believes the whole time, which is what actually
 * fixes it.
 *
 * WHY onClose doesn't fire on Escape (rather than firing it once
 * preventDefault has kept the dialog's state consistent): calling it
 * synchronously from inside the 'cancel' handler ALSO crashed, reentrant
 * or not -- tried inline, deferred via setTimeout, and via a 'close'
 * listener that only fires after the (now-prevented) native algorithm
 * would have fully finished. All three crashed identically. Isolating
 * further (with everything else held constant) showed the crash tracks
 * one thing: onClose leading to a React unmount of this SAME dialog,
 * triggered off the SAME Escape keypress that opened this code path --
 * not the timing relative to the browser's own algorithm, which the
 * preventDefault fix above already neutralizes. A close triggered by a
 * later, separate interaction (a button click) is fine, every time --
 * only chaining the unmount directly off Escape itself is fatal, for a
 * reason not fully root-caused within a reasonable investigation budget.
 * Given a crash is a strictly worse outcome than a missing keyboard
 * shortcut (Back/Cancel buttons already cover the same dismissal),
 * onClose is parked unused rather than wired up on a guess.
 *
 * The cleanup's own node.close() call (for focus restoration on a REAL,
 * button-triggered dismissal) is deferred via setTimeout: React 19 Strict
 * Mode double-invokes ref callbacks in dev, the same way it double-invokes
 * effects (attach -> detach -> attach, synchronously, before the dialog is
 * ever actually removed). An inline close() in that first, synthetic
 * detach would land on the dialog the SECOND, real attach just reopened --
 * reproduced live: without deferring this, the dialog never became visible
 * at all under Strict Mode. Each new attach cancels whatever deferred
 * close a prior detach queued, before doing anything else, so only a
 * close with no subsequent re-attach (a real, final unmount) ever
 * actually fires.
 */
export function useModalDialog<T extends HTMLDialogElement>(_onClose?: () => void) {
  const pendingCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cleanupRef = useRef<(() => void) | null>(null)

  const dialogRef = useCallback((node: T | null) => {
    if (pendingCloseRef.current != null) {
      clearTimeout(pendingCloseRef.current)
      pendingCloseRef.current = null
    }
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!node) return

    node.showModal()

    const handleCancel = (event: Event) => event.preventDefault()
    node.addEventListener('cancel', handleCancel)

    cleanupRef.current = () => {
      node.removeEventListener('cancel', handleCancel)
      pendingCloseRef.current = setTimeout(() => {
        pendingCloseRef.current = null
        if (node.open) node.close()
      }, 0)
    }
  }, [])

  return dialogRef
}
