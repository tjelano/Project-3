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
