import { useMemo, memo } from 'react'
import { useGLTF } from '@react-three/drei'
import { TILE_HEIGHT, BIOME_ELEVATION, type Biome, type HexTileData } from '../data/hexBoard'
import { NumberToken } from './TileDecorations'
import { createSeededRandom } from '../utils/seededRandom'
import forestTileModelUrl from '../assets/models/forest-tile.glb'
import hillsTileModelUrl from '../assets/models/hills-tile.glb'
import mountainsTileModelUrl from '../assets/models/mountains-tile.glb'
import fieldsTileModelUrl from '../assets/models/fields-tile.glb'
import pastureTileModelUrl from '../assets/models/pasture-tile.glb'
import desertTileModelUrl from '../assets/models/desert-tile.glb'

const BIOME_MODEL_URLS: Record<Biome, string> = {
  forest: forestTileModelUrl,
  hills: hillsTileModelUrl,
  mountains: mountainsTileModelUrl,
  fields: fieldsTileModelUrl,
  pasture: pastureTileModelUrl,
  desert: desertTileModelUrl,
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

// All six tiles are authored models now, each already sculpting its own
// terrain and decorations (sheep, trees, ore veins, ...) into the mesh —
// replacing the procedural terrain geometry AND the old scattered
// decoration components (MountainPeaks, HillBumps, etc. — still exported
// from TileDecorations.tsx, just unused here now) in one piece. Hover/click
// hit-testing (RobberLayer's own overlay geometry) and vertex/edge
// placement targets never read from this mesh, so swapping it doesn't
// touch board interaction. useGLTF caches by URL and returns the SAME
// scene graph on every call; cloning is what lets multiple tiles of the
// same biome each have their own instance instead of fighting over one
// shared object's transform.
function BiomeTileModel({ tile }: { tile: HexTileData }) {
  const { scene } = useGLTF(BIOME_MODEL_URLS[tile.biome])
  const instance = useMemo(() => scene.clone(), [scene])
  // The biome fix (if any) corrects the model's own authoring quirks first;
  // the per-tile random step is layered on top of that corrected baseline,
  // not in place of it.
  const rotationY = (BIOME_MODEL_ROTATION_Y[tile.biome] ?? 0) + randomHexRotation(tile.id)
  return <primitive object={instance} rotation={[0, rotationY, 0]} />
}

const HexTile = memo(function HexTile({ tile }: { tile: HexTileData }) {
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
        <BiomeTileModel tile={tile} />
        {tile.number !== null && (
          <NumberToken value={tile.number} yOffset={BIOME_CHIT_Y_OFFSET[tile.biome] ?? 0} />
        )}
      </group>
    </group>
  )
})

export const CatanBoard = memo(function CatanBoard({ tiles }: { tiles: HexTileData[] }) {
  return (
    <group>
      {tiles.map((tile) => (
        <HexTile key={tile.id} tile={tile} />
      ))}
    </group>
  )
})
