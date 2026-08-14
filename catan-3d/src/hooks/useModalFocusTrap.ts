import { useCallback, useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Focus trap + initial focus + optional Escape dismissal for a full-screen
 * modal. Returns a callback ref — attach it to the modal's own dialog
 * element (the one carrying role="dialog"/aria-modal). Tab/Shift+Tab cycle
 * within the modal's focusable elements instead of leaking to whatever's
 * behind it (the 3D canvas, other HUD panels); focus returns to whatever
 * had it before the modal opened once the modal unmounts.
 *
 * A callback ref (not useEffect on a useRef) because JoinRoomModal swaps
 * between two mutually-exclusive dialog elements (main form vs. reconnect
 * picker) while staying mounted — only a ref callback re-fires when the
 * underlying DOM node itself changes, not just on component mount.
 *
 * onEscape is read through a ref so passing a fresh closure each render
 * (the common case — most callers pass an inline arrow) doesn't reset the
 * trap or steal focus back to the first field on every keystroke elsewhere
 * in the modal.
 */
export function useModalFocusTrap<T extends HTMLElement>(onEscape?: () => void) {
  const onEscapeRef = useRef(onEscape)
  useEffect(() => {
    onEscapeRef.current = onEscape
  })

  const cleanupRef = useRef<(() => void) | null>(null)

  const setContainer = useCallback((node: T | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!node) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    ;(focusables()[0] ?? node).focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (onEscapeRef.current) {
          event.preventDefault()
          onEscapeRef.current()
        }
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }

    node.addEventListener('keydown', handleKeyDown)
    cleanupRef.current = () => {
      node.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus?.()
    }
  }, [])

  return setContainer
}
