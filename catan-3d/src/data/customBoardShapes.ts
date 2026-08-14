import type { Biome, BoardCell } from './hexBoard'
import { BIOME_COLORS } from './hexBoard'

export interface CustomBoardShape {
  id: string
  name: string
  cells: BoardCell[]
  // Sparse — only painted tiles appear here, keyed the same way
  // HexTileData.id already is (`${col}-${row}`). Absent entirely on shapes
  // saved before this feature, which is what keeps them working exactly as
  // before (fully random) with zero migration needed.
  biomeOverrides?: Record<string, Biome>
}

// Namespaced so it can't collide with any other app sharing this origin —
// matches LocalSetup.tsx's own localStorage key convention.
const STORAGE_KEY = 'catan3d.customBoardShapes'

function isPlausibleBiomeOverrides(value: unknown): value is Record<string, Biome> {
  if (typeof value !== 'object' || value === null) return false
  // BIOME_COLORS is a Record<Biome, string> — its own keys ARE exactly the
  // valid Biome values, so `in` doubles as the validity check without
  // needing a separate exported list of biome names.
  return Object.values(value).every((biome) => typeof biome === 'string' && biome in BIOME_COLORS)
}

// Only checks the fields actually read downstream without a fallback —
// buildHexBoardFromCells (hexBoard.ts) does cells.length immediately once a
// shape is picked, so a malformed/legacy entry with a missing or
// non-array `cells` would otherwise throw the instant that shape was
// selected, not when it was loaded.
function isPlausibleCustomBoardShape(value: unknown): value is CustomBoardShape {
  if (typeof value !== 'object' || value === null) return false
  const s = value as Record<string, unknown>
  if (typeof s.id !== 'string' || typeof s.name !== 'string' || !Array.isArray(s.cells)) return false
  if (s.biomeOverrides !== undefined && !isPlausibleBiomeOverrides(s.biomeOverrides)) return false
  return true
}

export function loadCustomBoardShapes(): CustomBoardShape[] {
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

export function deleteCustomBoardShape(id: string): CustomBoardShape[] {
  const next = loadCustomBoardShapes().filter((existing) => existing.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Same non-fatal storage failure as above.
  }
  return next
}
