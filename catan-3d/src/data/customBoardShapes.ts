import type { BoardCell } from './hexBoard'

export interface CustomBoardShape {
  id: string
  name: string
  cells: BoardCell[]
}

// Namespaced so it can't collide with any other app sharing this origin —
// matches LocalSetup.tsx's own localStorage key convention.
const STORAGE_KEY = 'catan3d.customBoardShapes'

export function loadCustomBoardShapes(): CustomBoardShape[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CustomBoardShape[]) : []
  } catch {
    // Storage can throw in private-browsing modes or when disabled, or hold
    // corrupted JSON from a previous version — either way, treat it as "no
    // saved shapes yet" rather than crashing the setup screen.
    return []
  }
}

export function saveCustomBoardShape(shape: CustomBoardShape): CustomBoardShape[] {
  const next = [...loadCustomBoardShapes().filter((existing) => existing.id !== shape.id), shape]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Same non-fatal storage failure as above — the shape still works for
    // the rest of this session, it just won't persist to the next visit.
  }
  return next
}

export function deleteCustomBoardShape(id: string): CustomBoardShape[] {
  const next = loadCustomBoardShapes().filter((existing) => existing.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Same non-fatal storage failure as above.
  }
  return next
}
