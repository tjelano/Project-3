import { useMemo, memo } from 'react'
import { useGLTF } from '@react-three/drei'
import { TILE_HEIGHT, type Biome, type HexTileData } from '../data/hexBoard'
import { NumberToken } from './TileDecorations'
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

// Ore/brick/wood/desert sit low enough to clip into the water at the
// shared TILE_HEIGHT/2 height every tile used to sit at — these four get
// an extra lift on top of that. Graduated rather than uniform: reads as
// real elevation (rocky peaks rising above flat farmland) instead of
// every tile just being nudged up by the same flat amount. Fields and
// pasture are left at 0 — they already sit correctly.
const BIOME_ELEVATION: Partial<Record<Biome, number>> = {
  mountains: 0.2,
  forest: 0.08,
  hills: 0.15,
  desert: 0.12,
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
function BiomeTileModel({ biome }: { biome: Biome }) {
  const { scene } = useGLTF(BIOME_MODEL_URLS[biome])
  const instance = useMemo(() => scene.clone(), [scene])
  const rotationY = BIOME_MODEL_ROTATION_Y[biome] ?? 0
  return <primitive object={instance} rotation={[0, rotationY, 0]} />
}

const HexTile = memo(function HexTile({ tile }: { tile: HexTileData }) {
  const elevation = BIOME_ELEVATION[tile.biome] ?? 0
  return (
    <group position={[tile.x, 0, tile.z]}>
      {/* Local y = 0 here is the nominal tile top (matching every model's
          own authored scale — see BIOME_MODEL_URLS) — lifting by
          TILE_HEIGHT/2 keeps this group at the same reference height the
          old procedural terrain used, so every vertex/edge/port coordinate
          in boardGraph stays valid. BIOME_ELEVATION adds on top of that
          per-biome. Decorations report their Y in this same terrain-local
          space, which is why the chit still mounts in this group (and
          rises with its tile) too. */}
      <group position={[0, TILE_HEIGHT / 2 + elevation, 0]}>
        <BiomeTileModel biome={tile.biome} />
        {tile.number !== null && <NumberToken value={tile.number} />}
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
