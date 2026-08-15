import type { GameRules } from './types'

/**
 * Whether a hiddenTiles mode puts an opaque mist mesh on the board at all
 * ('numbers' only blanks the chit and leaves real terrain visible, so it
 * doesn't count). CatanBoard and RobberLayer both need this same boolean —
 * CatanBoard to decide whether to mount the mist mesh, RobberLayer to decide
 * whether the robber figurine needs lifting clear of it — and a hand-copied
 * `mode === 'resources' || mode === 'both'` in both files would silently
 * drift the moment either changes without the other.
 */
export function hidesResourceMesh(mode: GameRules['hiddenTiles']): boolean {
  return mode === 'resources' || mode === 'both'
}

/**
 * A tile reveals permanently the instant a settlement lands on any vertex
 * touching it — including setup-phase placements. City upgrades need no
 * separate call: a city can only replace an existing settlement, whose
 * tiles are already revealed by the time that happens.
 *
 * Always returns a NEW Set (never mutates revealedTileIds) so callers can
 * use it directly as a useState updater — the exact same by-reference-
 * change contract every other piece of board state in this codebase
 * (settlements, roads) already relies on for React to notice the update.
 */
export function revealTilesForVertex(
  revealedTileIds: ReadonlySet<string>,
  vertexId: string,
  vertexTileIds: Map<string, string[]>,
): Set<string> {
  const touchedTiles = vertexTileIds.get(vertexId) ?? []
  const next = new Set(revealedTileIds)
  for (const tileId of touchedTiles) next.add(tileId)
  return next
}
