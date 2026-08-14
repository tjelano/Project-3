import type { BoardCell } from './hexBoard'

export interface CustomBoardShape {
  id: string
  name: string
  cells: BoardCell[]
}

// Namespaced so it can't collide with any other app sharing this origin —
// matches LocalSetup.tsx's own localStorage key convention.
const STORAGE_KEY = 'catan3d.customBoardShapes'

// Only checks the fields actually read downstream without a fallback —
// buildHexBoardFromCells (hexBoard.ts) does cells.length immediately once a
// shape is picked, so a malformed/legacy entry with a missing or
// non-array `cells` would otherwise throw the instant that shape was
// selected, not when it was loaded.
function isPlausibleCustomBoardShape(value: unknown): value is CustomBoardShape {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  return typeof s.id === 'string' && typeof s.name === 'string' && Array.isArray(s.cells)
}

// Not exported — the only external callers this had (OnlineSetup.tsx/
// LocalSetup.tsx) were removed as dead code; saveCustomBoardShape below is
// now the sole caller, in this same file.
function loadCustomBoardShapes(): CustomBoardShape[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isPlausibleCustomBoardShape)
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
