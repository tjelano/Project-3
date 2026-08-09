import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

interface Offset {
  x: number
  y: number
}

// Kept visible on every edge so a panel dragged into a corner never loses
// its whole self off-screen — there's always something left to grab.
const EDGE_MARGIN = 8

function clampRange(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Drag-to-reposition for a HUD panel, driven from its header only. The
 * panel keeps its normal CSS-anchored position; dragging just adds a
 * translate() offset on top of it, clamped so the whole panel always stays
 * on-screen.
 *
 * Usage: attach `panelRef` to the panel's outer element and `offset` to its
 * inline transform, then spread `onPointerDown={onHeaderPointerDown}` on
 * whichever inner element is the drag handle (a title bar, not the whole
 * panel — buttons and inputs inside it should stay clickable).
 */
export function useDraggablePanel<T extends HTMLElement>() {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
  const panelRef = useRef<T>(null)

  const onHeaderPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const el = panelRef.current
      if (!el) return
      // Let header buttons (e.g. a close "x") keep working instead of
      // starting a drag underneath the click.
      if ((event.target as HTMLElement).closest('button, a, input')) return

      const startClientX = event.clientX
      const startClientY = event.clientY
      const startOffsetX = offset.x
      const startOffsetY = offset.y
      const startRect = el.getBoundingClientRect()

      // Fresh closures per gesture, added and removed as the same pair —
      // avoids a stable-across-renders ref just to let the up-handler
      // unsubscribe itself.
      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startClientX
        const deltaY = moveEvent.clientY - startClientY

        const nextLeft = clampRange(startRect.left + deltaX, EDGE_MARGIN, window.innerWidth - startRect.width - EDGE_MARGIN)
        const nextTop = clampRange(startRect.top + deltaY, EDGE_MARGIN, window.innerHeight - startRect.height - EDGE_MARGIN)

        setOffset({
          x: startOffsetX + (nextLeft - startRect.left),
          y: startOffsetY + (nextTop - startRect.top),
        })
      }

      const handlePointerUp = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
    },
    [offset],
  )

  return { panelRef, offset, onHeaderPointerDown }
}
