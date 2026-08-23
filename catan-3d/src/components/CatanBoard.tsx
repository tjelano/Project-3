import { memo, useEffect, useRef, useState } from 'react'
import { useGLTF } from '@react-three/drei'
import { TILE_HEIGHT, BIOME_ELEVATION, type Biome, type HexTileData } from '../data/hexBoard'
import { NumberToken } from './TileDecorations'
import { createSeededRandom } from '../utils/seededRandom'
import { useClonedModel } from '../hooks/useClonedModel'
import { ModelErrorBoundary } from './ModelErrorBoundary'
import { MistTile, REVEAL_FADE_SECONDS } from './MistTile'
import { hidesResourceMesh } from '../game/hiddenTiles'
import type { GameRules } from '../game/types'
import forestTileModelUrl from '../assets/models/forest-tile.glb'
import hillsTileModelUrl from '../assets/models/hills-tile.glb'
import mountainsTileModelUrl from '../assets/models/mountains-tile.glb'
import fieldsTileModelUrl from '../assets/models/fields-tile.glb'
import pastureTileModelUrl from '../assets/models/pasture-tile.glb'
import desertTileModelUrl from '../assets/models/desert-tile.glb'
import waterTileModelUrl from '../assets/models/water-tile.glb'

const BIOME_MODEL_URLS: Record<Biome, string> = {
  forest: forestTileModelUrl,
  hills: hillsTileModelUrl,
  mountains: mountainsTileModelUrl,
  fields: fieldsTileModelUrl,
  pasture: pastureTileModelUrl,
  desert: desertTileModelUrl,
  sea: waterTileModelUrl,
  // PLACEHOLDER — no gold-field model exists yet, reusing fields' own model
  // (see this plan's Global Constraints). Swap for real gold-field art once
  // it exists; nothing else needs to change when that happens, this is the
  // only line that names the model.
  gold: fieldsTileModelUrl,
}

// hills-tile.glb was authored with X and Z swapped relative to the other
// five (its bounding box is ~0.84 wide by ~0.95 deep, where every other
// tile — and this game's hex grid — is ~0.95 wide by ~0.84 deep). A 90°
// spin puts it back in line without needing the source file re-exported.
const BIOME_MODEL_ROTATION_Y: Partial<Record<Biome, number>> = {
  hills: Math.PI / 2,
}

// Edit these directly to nudge a biome's number chit up (positive) or down
// (negative) — each model sculpts its own chit surface at a different
// height (mountains' model is nearly 3x taller than fields/pasture), so
// NumberToken's own base height can't land flush on all of them at once.
// Not listed here = 0 (uses NumberToken's own default, already correct).
const BIOME_CHIT_Y_OFFSET: Partial<Record<Biome, number>> = {
  mountains: -0.185,
  hills: -0.05,
  forest: -0.05,
}

// Every hidden tile's mist sits at this ONE elevation — deliberately NOT
// the real biome's BIOME_ELEVATION, which ranges from 0.12 (pasture) to
// 0.31 (mountains). Parking the mist at its tile's own elevation would
// float a hidden mountains tile's fog 0.19 higher than a hidden pasture's,
// letting anyone read the hidden biome straight off the fog's height —
// exactly the leak the design spec rules out ("nothing about which mist
// instance is showing leaks the biome underneath").
//
// The value is measured the same way every BIOME_ELEVATION was: a
// triangle-area-weighted histogram of upward-facing faces, isolating the
// model's own ground plateau. hidden-tile.glb's plateau sits at local
// y = -0.255 once HIDDEN_TILE_SCALE is applied, so 0.345 lands it at
// 0.09 — the exact plateau height all six biome tiles are already aligned
// to, which is what makes a fogged tile sit flush in the board rather than
// hovering above it or sinking into it.
const HIDDEN_TILE_ELEVATION = 0.345

// The mist is a solid dome, not a thin veil: it stays at least 0.44 wide
// (radius) from its ground plateau all the way up to its crown at local
// y = +0.409, so it completely seals the tile centre where the chit lives.
// A number left at terrain height would therefore be buried inside the fog
// and 'resources' mode ("number chit visible, terrain disguised behind the
// mist" — design spec) would render indistinguishably from 'both'. This
// floats the chit just clear of the dome's crown instead.
//
// NumberToken adds its own TOKEN_LABEL_Y (0.012) on top of this, putting
// the chit at 0.432 — 0.023 above the crown. Tune here if the number reads
// as floating too high once it is on screen.
const MIST_CHIT_Y_OFFSET = 0.42

// One of the 6 rotations a flat-top hexagon can sit at without its
// silhouette changing — any other angle would leave gaps or overlaps at
// the seams with neighboring tiles, since a hexagon only tiles with
// itself under 60° multiples. Seeded per-tile (not per-biome) so every
// forest tile, say, doesn't show the identical tree/rock arrangement.
const HEX_ROTATION_STEP = Math.PI / 3

function randomHexRotation(tileId: string): number {
  const random = createSeededRandom(`${tileId}-rotation`)
  return Math.floor(random() * 6) * HEX_ROTATION_STEP
}

for (const url of Object.values(BIOME_MODEL_URLS)) useGLTF.preload(url)

const NO_TILES: ReadonlySet<string> = new Set()

/**
 * The ids of tiles whose mist is currently peeling away, which is
 * deliberately NOT the same thing as "just revealed".
 *
 * A tile's `hideResource` drops on the very render `revealedTileIds`
 * grows, so left alone the mist would be unmounted and swapped for terrain
 * in that same commit — MistTile's scale-down dissolve would never get a
 * single frame to play. Holding each newly-revealed id here for
 * REVEAL_FADE_SECONDS keeps its mist mounted (now with `revealed`, so it
 * shrinks) while the real terrain is already drawn underneath, so the fog
 * visibly peels off the tile it was covering instead of popping out of
 * existence.
 */
function useDissolvingTileIds(revealedTileIds: ReadonlySet<string>): ReadonlySet<string> {
  const [dissolvingTileIds, setDissolvingTileIds] = useState<ReadonlySet<string>>(NO_TILES)
  // Seeded with whatever was already revealed at mount rather than an
  // empty set: a snapshot restore or an online reconnect arrives with
  // tiles already revealed, and those should simply be terrain. Replaying
  // nineteen dissolves on reconnect would not read as a reveal.
  const settledTileIds = useRef(revealedTileIds)
  const pendingTimers = useRef(new Set<ReturnType<typeof setTimeout>>())

  useEffect(() => {
    const justRevealed = [...revealedTileIds].filter((id) => !settledTileIds.current.has(id))
    settledTileIds.current = revealedTileIds
    if (justRevealed.length === 0) return
    setDissolvingTileIds((previous) => new Set([...previous, ...justRevealed]))
    // Each batch owns its own timer instead of one shared timer this
    // effect replaces on every run: two settlements landing less than
    // REVEAL_FADE_SECONDS apart (the two setup placements, or a remote
    // placement arriving mid-animation) would otherwise have the second
    // batch cancel the first's, stranding those tiles as permanently
    // "dissolving" — an already-shrunk, invisible mist that never
    // unmounts and never stops ticking useFrame.
    const timer = setTimeout(() => {
      pendingTimers.current.delete(timer)
      setDissolvingTileIds((previous) => {
        const next = new Set(previous)
        for (const id of justRevealed) next.delete(id)
        return next
      })
    }, REVEAL_FADE_SECONDS * 1000)
    pendingTimers.current.add(timer)
  }, [revealedTileIds])

  // Unmount-only, for the reason above — a per-run cleanup would be the
  // very cancellation this hook is structured to avoid.
  useEffect(() => {
    const timers = pendingTimers.current
    return () => {
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  return dissolvingTileIds
}

// All six tiles are authored models now, each already sculpting its own
// terrain and decorations (sheep, trees, ore veins, ...) into the mesh —
// replacing the old procedural terrain geometry AND scattered decoration
// components (MountainPeaks, HillBumps, etc. — since removed from
// TileDecorations.tsx as dead code) in one piece. Hover/click hit-testing
// (RobberLayer's own overlay geometry) and vertex/edge placement targets
// never read from this mesh, so swapping it doesn't touch board
// interaction. useGLTF caches by URL and returns the SAME scene graph on
// every call; cloning is what lets multiple tiles of the same biome each
// have their own instance instead of fighting over one shared object's
// transform.
function BiomeTileModel({ tile }: { tile: HexTileData }) {
  const instance = useClonedModel(BIOME_MODEL_URLS[tile.biome])
  // The biome fix (if any) corrects the model's own authoring quirks first;
  // the per-tile random step is layered on top of that corrected baseline,
  // not in place of it.
  const rotationY = (BIOME_MODEL_ROTATION_Y[tile.biome] ?? 0) + randomHexRotation(tile.id)
  return <primitive object={instance} rotation={[0, rotationY, 0]} />
}

const HexTile = memo(function HexTile({
  tile,
  hideResource,
  hideNumber,
  dissolving,
}: {
  tile: HexTileData
  // The real terrain is not rendered at all while this is set, rather than
  // being rendered and covered up. That is what makes the house rule
  // leak-proof by construction: there is no hidden mesh to catch a glimpse
  // of through a seam, at a grazing camera angle, or for one frame if the
  // mist model ever fails to load.
  hideResource: boolean
  hideNumber: boolean
  // Terrain is showing AND the mist is still shrinking away on top of it —
  // see useDissolvingTileIds.
  dissolving: boolean
}) {
  const elevation = BIOME_ELEVATION[tile.biome]
  return (
    <group position={[tile.x, 0, tile.z]}>
      {/* Local y = 0 here is the nominal tile top (matching every model's
          own authored scale — see BIOME_MODEL_URLS) — lifting by
          TILE_HEIGHT/2 keeps this group at the same reference height the
          old procedural terrain used, so every vertex/edge/port coordinate
          in boardGraph stays valid. BIOME_ELEVATION adds on top of that,
          per-biome. Decorations report their Y in this same terrain-local
          space, which is why the chit still mounts in this group (and
          rises with its tile) too. */}
      <group position={[0, TILE_HEIGHT / 2 + elevation, 0]}>
        {!hideResource && (
          <ModelErrorBoundary label={`${tile.biome} tile`}>
            <BiomeTileModel tile={tile} />
          </ModelErrorBoundary>
        )}
        {tile.number !== null && !hideResource && (
          <NumberToken value={tile.number} yOffset={BIOME_CHIT_Y_OFFSET[tile.biome] ?? 0} hidden={hideNumber} />
        )}
      </group>
      {/* Its own group at a fixed height, deliberately outside the
          per-biome elevation above — see HIDDEN_TILE_ELEVATION. Stays
          mounted across the reveal (hideResource false, dissolving true)
          so MistTile animates instead of remounting and re-cloning its
          46MB-textured model mid-dissolve. Its own error boundary, per
          ModelErrorBoundary's own "one boundary per model" note: during a
          dissolve the terrain is a sibling, and a mist that fails to load
          must not take the revealed terrain down with it. */}
      {(hideResource || dissolving) && (
        <group position={[0, TILE_HEIGHT / 2 + HIDDEN_TILE_ELEVATION, 0]}>
          <ModelErrorBoundary label="hidden tile mist">
            <MistTile revealed={dissolving} />
          </ModelErrorBoundary>
          {/* Not rendered during the dissolve: the terrain's own chit is
              already back by then, and two chits for one tile would
              double up. */}
          {tile.number !== null && hideResource && (
            <NumberToken value={tile.number} yOffset={MIST_CHIT_Y_OFFSET} hidden={hideNumber} />
          )}
        </group>
      )}
    </group>
  )
})

export const CatanBoard = memo(function CatanBoard({
  tiles,
  hiddenTilesMode,
  revealedTileIds,
}: {
  tiles: HexTileData[]
  hiddenTilesMode: GameRules['hiddenTiles']
  revealedTileIds: ReadonlySet<string>
}) {
  const dissolvingTileIds = useDissolvingTileIds(revealedTileIds)
  const hidesResource = hidesResourceMesh(hiddenTilesMode)
  const hidesNumber = hiddenTilesMode === 'numbers' || hiddenTilesMode === 'both'
  return (
    <group>
      {tiles.map((tile) => {
        const isRevealed = revealedTileIds.has(tile.id)
        return (
          <HexTile
            key={tile.id}
            tile={tile}
            hideResource={hidesResource && !isRevealed}
            hideNumber={hidesNumber && !isRevealed}
            // Gated on hidesResource so the modes that never put fog on
            // the board ('off', 'numbers') can't mount a mist purely to
            // dissolve it the moment someone builds.
            // isRevealed as well as the dissolving set: a restart can put a
            // tile back into hiding while its id is still inside its own
            // REVEAL_FADE_SECONDS window, and hideResource + dissolving both
            // true at once would shrink the mist away off a hidden tile.
            dissolving={hidesResource && isRevealed && dissolvingTileIds.has(tile.id)}
          />
        )
      })}
    </group>
  )
})
