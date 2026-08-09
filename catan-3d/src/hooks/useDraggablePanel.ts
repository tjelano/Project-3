import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react'

// Kept visible on every edge so a panel dragged into a corner never loses
// its whole self off-screen — there's always something left to grab.
const EDGE_MARGIN = 8

function clampRange(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/**
 * Drag-to-reposition for a HUD panel, driven from its header only. The
 * panel keeps its normal CSS-anchored position; dragging just adds a
 * translate3d() offset on top of it, clamped so the whole panel always
 * stays on-screen.
 *
 * Deliberately NOT React state: an earlier version tracked the offset with
 * useState and set it on every pointermove, which re-renders the panel's
 * whole subtree for every pixel of mouse movement — dozens of renders a
 * second fighting the WebGL canvas for frame time, and it showed (choppy,
 * stuttery dragging). The offset now lives in a plain ref and is written
 * straight to the DOM element's own style on every move, via
 * translate3d — a GPU-composited transform React's reconciler never sees.
 *
 * Usage: attach `panelRef` to the panel's outer element, then spread
 * `onPointerDown={onHeaderPointerDown}` on whichever inner element is the
 * drag handle (a title bar, not the whole panel — buttons and inputs
 * inside it should stay clickable). No offset value to wire into a style
 * prop — the hook owns the transform directly.
 */
export function useDraggablePanel<T extends HTMLElement>() {
  const panelRef = useRef<T>(null)
  const offsetRef = useRef({ x: 0, y: 0 })

  const onHeaderPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const el = panelRef.current
    if (!el) return
    // Let header buttons (e.g. a close "x") keep working instead of
    // starting a drag underneath the click.
    if ((event.target as HTMLElement).closest('button, a, input')) return

    const startClientX = event.clientX
    const startClientY = event.clientY
    const startOffsetX = offsetRef.current.x
    const startOffsetY = offsetRef.current.y
    const startRect = el.getBoundingClientRect()

    // Fresh closures per gesture, added and removed as the same pair —
    // avoids a stable-across-renders ref just to let the up-handler
    // unsubscribe itself.
    const handlePointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startClientX
      const deltaY = moveEvent.clientY - startClientY

      const nextLeft = clampRange(startRect.left + deltaX, EDGE_MARGIN, window.innerWidth - startRect.width - EDGE_MARGIN)
      const nextTop = clampRange(startRect.top + deltaY, EDGE_MARGIN, window.innerHeight - startRect.height - EDGE_MARGIN)

      const nextX = startOffsetX + (nextLeft - startRect.left)
      const nextY = startOffsetY + (nextTop - startRect.top)
      offsetRef.current = { x: nextX, y: nextY }
      el.style.transform = `translate3d(${nextX}px, ${nextY}px, 0)`
    }

    const handlePointerUp = () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
  }, [])

  return { panelRef, onHeaderPointerDown }
}
