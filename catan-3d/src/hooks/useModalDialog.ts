import { useEffect, useRef } from 'react'

/**
 * Opens a native <dialog> as a modal on mount, closes it on unmount.
 * Replaces useModalFocusTrap — a native <dialog> shown via showModal()
 * already traps Tab/Shift+Tab within itself, focuses the first focusable
 * descendant (or itself, if none), and restores focus to whatever had it
 * on close, all without any hand-rolled listener code.
 *
 * onClose fires when the dialog closes via native Escape handling (the
 * 'cancel' event). Omit it for a forced-choice dialog with no dismiss path
 * — Escape is then a no-op instead of closing the dialog out from under
 * whatever's waiting on a real answer.
 *
 * onClose is read through a ref (same technique the old hook used for
 * onEscape) so passing a fresh closure each render doesn't re-run the
 * mount effect and call showModal() again.
 */
export function useModalDialog<T extends HTMLDialogElement>(onClose?: () => void) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  const dialogRef = useRef<T>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    dialog.showModal()

    const handleCancel = (event: Event) => {
      // No onClose means this is a forced pick with no cancel path —
      // suppress the native close-on-Escape instead of silently dismissing
      // a dialog nothing else is prepared to have vanish.
      if (!onCloseRef.current) event.preventDefault()
    }
    const handleClose = () => onCloseRef.current?.()

    dialog.addEventListener('cancel', handleCancel)
    dialog.addEventListener('close', handleClose)
    return () => {
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('close', handleClose)
      // Deliberately does NOT call dialog.close() here. React Strict
      // Mode's synthetic mount->cleanup->mount cycle runs this cleanup
      // WITHOUT actually removing the node from the DOM -- calling
      // close() in that case fires a real 'close' event that (if the
      // browser delivers it as a deferred microtask rather than
      // synchronously) lands on the SECOND effect's freshly-attached
      // listener instead of vanishing with the first, incorrectly
      // triggering onClose and unmounting the dialog moments after it
      // opens (caught live: JoinRoomModal closed itself on every mount
      // in dev). On a REAL unmount, removing the node from the document
      // already runs the browser's own dialog "removing steps," which
      // clear its top-layer/modal state automatically -- nothing here
      // needs to close it by hand.
    }
  }, [])

  return dialogRef
}
