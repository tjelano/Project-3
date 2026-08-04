import { useMemo } from 'react'
import { Billboard } from '@react-three/drei'
import { type Biome } from '../data/hexBoard'
import { createSeededRandom } from '../utils/seededRandom'
import { RECESS_DEPTH, getTileTerrain, scatterPoint, terrainPoint, type TileTerrain } from '../three/hexTerrain'
import {
  SHEEP_FACE_MATERIAL,
  SHEEP_WOOL_MATERIAL,
  SNOW_MATERIAL,
  TOKEN_MATERIAL,
  TRUNK_MATERIAL,
  decorMaterial,
} from '../three/materials'
import { createLabelTexture } from '../three/textLabels'

// The chit digit's world size — matches the troika fontSize this replaces.
const CHIT_FONT_WORLD_SIZE = 0.27

/**
 * Scatter assets for the sculpted tiles.
 *
 * Every component samples the SAME height field the tile mesh was built
 * from (via getTileTerrain), so each asset is planted on the ground rather
 * than floating at a fixed offset. All local Y values below are therefore
 * "ground height at this x/z" plus the asset's own base.
 */

interface DecorProps {
  seed: string
}

const useTerrain = (biome: Biome, seed: string): TileTerrain =>
  useMemo(() => getTileTerrain(biome, seed), [biome, seed])

// ---------------------------------------------------------------------------
// MOUNTAINS — an overlapping range, not isolated cones.
// ---------------------------------------------------------------------------
const PEAK_COLORS = ['#46555d', '#5a7280', '#6d8794', '#3d4a52']
const SNOW_CAP_FRACTION = 0.38

export function MountainPeaks({ seed }: DecorProps) {
  const terrain = useTerrain('mountains', seed)

  const peaks = useMemo(() => {
    const random = createSeededRandom(`${seed}-peaks`)
    const start = random() * Math.PI * 2
    const count = 9

    return Array.from({ length: count }, (_, i) => {
      // Arranged as a RING around the tile rather than a line through it.
      // The old ridge ran through the centre, which is why cones buried the
      // number chit. Angles are unevenly spaced so the range still has
      // saddles and shoulders instead of reading as a fence.
      const theta = start + (i / count) * Math.PI * 2 + (random() - 0.5) * 0.42
      // Ring band chosen so the widest cone base still clears the chit:
      // at nr 0.62 the world radius is ~0.54, minus a 0.21 base leaves 0.33,
      // comfortably outside the 0.26 chit.
      const nr = 0.62 + random() * 0.18
      const p = terrainPoint(terrain, theta, nr)
      const height = 0.18 + random() * 0.18
      return {
        ...p,
        height,
        radius: 0.13 + random() * 0.08,
        rotationY: random() * Math.PI,
        // Lean outward, away from the centre, never over the numbers.
        tilt: 0.04 + random() * 0.05,
        color: PEAK_COLORS[Math.floor(random() * PEAK_COLORS.length)],
        snow: height > 0.28,
      }
    }).sort((a, b) => b.height - a.height)
  }, [seed, terrain])

  return (
    <group>
      {peaks.map((peak, i) => (
        <group key={i} position={[peak.x, peak.y, peak.z]} rotation={[0, peak.theta, peak.tilt]}>
          <mesh
            position={[0, peak.height / 2, 0]}
            rotation={[0, peak.rotationY, 0]}
            material={decorMaterial(peak.color)}
            castShadow
            receiveShadow
          >
            <coneGeometry args={[peak.radius, peak.height, 5]} />
          </mesh>
          {peak.snow && (
            <mesh
              position={[0, peak.height - (peak.height * SNOW_CAP_FRACTION) / 2, 0]}
              rotation={[0, peak.rotationY, 0]}
              material={SNOW_MATERIAL}
              castShadow
            >
              <coneGeometry args={[peak.radius * SNOW_CAP_FRACTION * 1.12, peak.height * SNOW_CAP_FRACTION, 5]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// HILLS — boulders scattered across the terraces.
// ---------------------------------------------------------------------------
const HILL_COLORS = ['#c1682b', '#a8571f', '#d67f3c', '#8f4718']

export function HillBumps({ seed }: DecorProps) {
  const terrain = useTerrain('hills', seed)

  const bumps = useMemo(() => {
    const random = createSeededRandom(`${seed}-bumps`)
    // The terraced cliffs now live in the tile MESH (see hexTerrain's
    // 'hills' landform), so these are only scree accents catching light on
    // the shelf edges — smaller and fewer than when they carried the whole
    // look on their own.
    return Array.from({ length: 7 }, () => {
      const p = scatterPoint(terrain, random, 0.54, 0.82)
      const radius = 0.06 + random() * 0.07
      return {
        ...p,
        radius,
        squash: 0.6 + random() * 0.35,
        rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI] as [number, number, number],
        color: HILL_COLORS[Math.floor(random() * HILL_COLORS.length)],
      }
    })
  }, [terrain])

  return (
    <group>
      {bumps.map((bump, i) => (
        <mesh
          key={i}
          position={[bump.x, bump.y + bump.radius * bump.squash * 0.55, bump.z]}
          rotation={bump.rotation}
          scale={[1, bump.squash, 1]}
          material={decorMaterial(bump.color)}
          castShadow
          receiveShadow
        >
          <icosahedronGeometry args={[bump.radius, 0]} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// FOREST — a dense stand of pines at mixed heights, some two-tier.
// ---------------------------------------------------------------------------
const FOLIAGE_COLORS = ['#17491b', '#1b5e20', '#256d29', '#2e7d32', '#35853a']

export function ForestTrees({ seed }: DecorProps) {
  const terrain = useTerrain('forest', seed)

  const trees = useMemo(() => {
    const random = createSeededRandom(`${seed}-trees`)

    // Woodland grows in stands, not on a uniform grid. Seeding a handful of
    // cluster centres and packing trees tightly around each one produces
    // overlapping canopy and open glades between — the thing that reads as
    // "forest" rather than "scattered cones".
    const clusters = Array.from({ length: 5 }, () => scatterPoint(terrain, random, 0.54, 0.78))

    const out: {
      x: number
      z: number
      y: number
      trunkHeight: number
      foliageHeight: number
      foliageRadius: number
      tiered: boolean
      lean: number
      rotationY: number
      color: string
    }[] = []

    for (const cluster of clusters) {
      const members = 3 + Math.floor(random() * 3)
      for (let k = 0; k < members; k++) {
        const angle = random() * Math.PI * 2
        const dist = random() * 0.19
        const x = cluster.x + Math.cos(angle) * dist
        const z = cluster.z + Math.sin(angle) * dist
        if (Math.hypot(x, z) > 0.8) continue
        // Wide height spread within a stand: mature trees beside saplings is
        // what gives the canopy depth.
        const scale = 0.6 + random() * 0.85
        out.push({
          x,
          z,
          y: terrain.heightAt(x, z),
          trunkHeight: (0.09 + random() * 0.05) * scale,
          foliageHeight: (0.25 + random() * 0.2) * scale,
          foliageRadius: (0.095 + random() * 0.05) * scale,
          tiered: random() > 0.3,
          lean: (random() - 0.5) * 0.14,
          rotationY: random() * Math.PI,
          color: FOLIAGE_COLORS[Math.floor(random() * FOLIAGE_COLORS.length)],
        })
      }
    }
    // Tallest first so the silhouette layers back-to-front sensibly.
    return out.sort((a, b) => b.foliageHeight - a.foliageHeight)
  }, [terrain])

  return (
    <group>
      {trees.map((tree, i) => (
        <group key={i} position={[tree.x, tree.y, tree.z]} rotation={[tree.lean, tree.rotationY, tree.lean * 0.7]}>
          <mesh position={[0, tree.trunkHeight / 2, 0]} material={TRUNK_MATERIAL} castShadow receiveShadow>
            <cylinderGeometry args={[0.016, 0.026, tree.trunkHeight, 5]} />
          </mesh>
          <mesh
            position={[0, tree.trunkHeight + tree.foliageHeight / 2, 0]}
            material={decorMaterial(tree.color)}
            castShadow
            receiveShadow
          >
            <coneGeometry args={[tree.foliageRadius, tree.foliageHeight, 6]} />
          </mesh>
          {tree.tiered && (
            <mesh
              position={[0, tree.trunkHeight + tree.foliageHeight * 0.9, 0]}
              material={decorMaterial(tree.color)}
              castShadow
            >
              <coneGeometry args={[tree.foliageRadius * 0.66, tree.foliageHeight * 0.6, 6]} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// PASTURE — a fuller flock.
// ---------------------------------------------------------------------------
export function PastureSheep({ seed }: DecorProps) {
  const terrain = useTerrain('pasture', seed)

  const flock = useMemo(() => {
    const random = createSeededRandom(`${seed}-sheep`)
    return Array.from({ length: 7 }, () => {
      const p = scatterPoint(terrain, random, 0.34, 0.8)
      const bodyRadius = 0.075 + random() * 0.04
      const faceAngle = random() * Math.PI * 2
      return {
        ...p,
        bodyRadius,
        rotationY: random() * Math.PI,
        faceX: Math.cos(faceAngle) * bodyRadius * 0.85,
        faceZ: Math.sin(faceAngle) * bodyRadius * 0.85,
      }
    })
  }, [terrain])

  return (
    <group>
      {flock.map((sheep, i) => (
        <group
          key={i}
          position={[sheep.x, sheep.y + sheep.bodyRadius * 0.72, sheep.z]}
          rotation={[0, sheep.rotationY, 0]}
        >
          <mesh scale={[1, 0.8, 1.15]} material={SHEEP_WOOL_MATERIAL} castShadow receiveShadow>
            <icosahedronGeometry args={[sheep.bodyRadius, 0]} />
          </mesh>
          <mesh
            position={[sheep.faceX, -sheep.bodyRadius * 0.12, sheep.faceZ]}
            material={SHEEP_FACE_MATERIAL}
            castShadow
          >
            <icosahedronGeometry args={[sheep.bodyRadius * 0.42, 0]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// FIELDS — ordered rows of sheaves, aligned to the ploughed furrows.
// ---------------------------------------------------------------------------
const WHEAT_COLORS = ['#f4c430', '#e8b923', '#d4a017', '#c99612']

export function FieldsWheat({ seed }: DecorProps) {
  const terrain = useTerrain('fields', seed)

  const sheaves = useMemo(() => {
    const random = createSeededRandom(`${seed}-wheat`)
    // One shared row direction for the whole tile — the regimentation is
    // what makes it read as cultivated land instead of weeds. The rows run
    // ALONG the ploughed furrows carved into the tile mesh, so the crop sits
    // in the troughs rather than across them.
    const rowAngle = random() * Math.PI * 2
    const ax = Math.sin(rowAngle)
    const az = Math.cos(rowAngle)

    const out: {
      x: number
      z: number
      y: number
      height: number
      radius: number
      rotationY: number
      color: string
    }[] = []

    const rows = 7
    for (let r = 0; r < rows; r++) {
      const offset = (r / (rows - 1) - 0.5) * 1.42
      // Rows nearer the tile edge are shorter, so the block of crop follows
      // the hexagon instead of overrunning it as a square.
      const halfLength = Math.sqrt(Math.max(0, 0.78 * 0.78 - offset * offset * 0.62))
      const perRow = 6
      for (let sIdx = 0; sIdx < perRow; sIdx++) {
        const along = (sIdx / (perRow - 1) - 0.5) * 2 * halfLength
        const x = ax * along - az * offset
        const z = az * along + ax * offset
        const radial = Math.hypot(x, z)
        // Keep the crop out of the chit recess and off the raised rim.
        if (radial > 0.8 || radial < 0.36) continue
        out.push({
          x,
          z,
          y: terrain.heightAt(x, z),
          height: 0.13 + random() * 0.06,
          radius: 0.042 + random() * 0.014,
          rotationY: random() * Math.PI,
          color: WHEAT_COLORS[Math.floor(random() * WHEAT_COLORS.length)],
        })
      }
    }
    return out
  }, [seed, terrain])

  return (
    <group>
      {sheaves.map((stalk, i) => (
        <mesh
          key={i}
          position={[stalk.x, stalk.y + stalk.height / 2, stalk.z]}
          rotation={[0, stalk.rotationY, 0]}
          material={decorMaterial(stalk.color)}
          castShadow
          receiveShadow
        >
          <coneGeometry args={[stalk.radius, stalk.height, 4]} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// DESERT — sparse sun-bleached rocks between the dunes. (Previously the
// desert had no decoration at all and read as an empty disc.)
// ---------------------------------------------------------------------------
const DESERT_ROCK_COLORS = ['#c9ac74', '#b8965c', '#d8c48f']

export function DesertRocks({ seed }: DecorProps) {
  const terrain = useTerrain('desert', seed)

  const rocks = useMemo(() => {
    const random = createSeededRandom(`${seed}-rocks`)
    return Array.from({ length: 5 }, () => {
      const p = scatterPoint(terrain, random, 0.4, 0.78)
      const radius = 0.055 + random() * 0.06
      return {
        ...p,
        radius,
        squash: 0.45 + random() * 0.3,
        rotation: [random() * Math.PI, random() * Math.PI, random() * Math.PI] as [number, number, number],
        color: DESERT_ROCK_COLORS[Math.floor(random() * DESERT_ROCK_COLORS.length)],
      }
    })
  }, [terrain])

  return (
    <group>
      {rocks.map((rock, i) => (
        <mesh
          key={i}
          position={[rock.x, rock.y + rock.radius * rock.squash * 0.5, rock.z]}
          rotation={rock.rotation}
          scale={[1, rock.squash, 1]}
          material={decorMaterial(rock.color)}
          castShadow
          receiveShadow
        >
          <icosahedronGeometry args={[rock.radius, 0]} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// NUMBER CHIT — nested into the carved recess.
// ---------------------------------------------------------------------------
// 0.26 rather than 0.29 so the whole disc fits inside the flat recess floor:
// the hexagon's tightest direction is its apothem (0.866), so this reaches
// nr = 0.26/0.866 ≈ 0.30, inside RECESS_RADIUS (0.34). At 0.29 the chit's rim
// overhung the slope and sat visibly tilted against the terrain.
const TOKEN_RADIUS = 0.26
const TOKEN_HEIGHT = 0.055

/**
 * Sits ON the recess floor rather than hovering above the tile. Terrain-local
 * space (y = 0 is the nominal tile top, matching every other decoration), so
 * the floor is at -RECESS_DEPTH and the disc's centre is half its thickness
 * above that. The surrounding terrain then rises past the chit's edge and it
 * reads as inlaid rather than stacked on.
 */
const TOKEN_Y = -RECESS_DEPTH + TOKEN_HEIGHT / 2

export function NumberToken({ value }: { value: number }) {
  const isHot = value === 6 || value === 8

  const label = useMemo(
    () => createLabelTexture(String(value), { fontPx: 96, color: isHot ? '#a32020' : '#2b2b2b' }),
    [value, isHot],
  )
  const labelScale = CHIT_FONT_WORLD_SIZE / label.fontPx

  return (
    <group position={[0, TOKEN_Y, 0]}>
      <mesh material={TOKEN_MATERIAL} castShadow receiveShadow>
        <cylinderGeometry args={[TOKEN_RADIUS, TOKEN_RADIUS * 0.94, TOKEN_HEIGHT, 28]} />
      </mesh>
      {/* Billboarded rather than flush-painted on the token's flat top: a
          fixed-flat chit reads upside down from the far side of the table
          the instant the camera swings to face another seat — expected for
          a real physical token, but exactly the readability problem the
          seating camera rig makes visible. Matches the port rate badge in
          PortMarkers.tsx, which was already billboarded for the same
          reason. Lifted slightly higher than the old flush offset (0.004)
          to clear the token's curved rim now that it's not flat against it. */}
      <Billboard position={[0, TOKEN_HEIGHT / 2 + 0.03, 0]}>
        <mesh>
          <planeGeometry args={[label.width * labelScale, label.height * labelScale]} />
          <meshBasicMaterial map={label.texture} transparent depthWrite={false} />
        </mesh>
      </Billboard>
    </group>
  )
}
