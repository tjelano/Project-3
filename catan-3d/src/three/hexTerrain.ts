import * as THREE from 'three'
import { HEX_RADIUS, type Biome } from '../data/hexBoard'

/**
 * HEX OVERLAY GEOMETRY
 *
 * Flat hex-shaped overlays used by the Robber, Merchant, and TileSwap
 * highlight/hit-target meshes. These used to terrain-conform to a
 * procedural height-sculpt that stood in for the tile surface before real
 * authored GLB models existed (BiomeTileModel in CatanBoard.tsx) — once
 * those models replaced that procedural terrain, the sculpt no longer
 * matched what's actually rendered, so a "conforming" overlay built from it
 * floated or sank relative to the real tile depending on how far the two
 * had drifted apart. Flat is both simpler and more correct now:
 * BIOME_ELEVATION (hexBoard.ts) already aligns every biome's real model
 * plateau to a shared reference height, so a flat disc at the caller's own
 * group origin (which already sits at that height) lines up for every
 * biome with no per-tile sculpt needed.
 */

// Angular resolution — a multiple of 6 so ring vertices land exactly on the
// hexagon's corners and the silhouette stays crisp.
const ANGULAR_SEGMENTS = 54
const RADIAL_RINGS = 9

/**
 * Distance from centre to the hexagon boundary at angle θ.
 *
 * Corners sit at θ = 30° + k·60° to match CORNER_ANGLES in boardGraph.ts and
 * the Math.PI/6 rotation the original cylinder used. For a regular hexagon
 * of circumradius R and apothem a = R·cos(30°), the boundary distance is
 * a / cos(φ) where φ is the angle off the nearest edge normal — giving
 * exactly R at a corner and exactly a at an edge midpoint.
 */
function hexRadiusAtAngle(theta: number): number {
  const apothem = HEX_RADIUS * Math.cos(Math.PI / 6)
  const sector = Math.PI / 3
  let phi = (theta - Math.PI / 6) % sector
  if (phi < 0) phi += sector
  return apothem / Math.cos(phi - Math.PI / 6)
}

// Flat, so biome/seed no longer affect the geometry itself — kept in the
// call signature (and cache key) anyway so every caller (RobberLayer,
// MerchantLayer, TileSwapLayer) needed zero changes when this stopped
// terrain-conforming.
const overlayCache = new Map<string, THREE.BufferGeometry>()

export function getTileOverlay(biome: Biome, seed: string, lift = 0.014): THREE.BufferGeometry {
  const key = `${biome}:${seed}:${lift}`
  const cached = overlayCache.get(key)
  if (cached) return cached

  const positions: number[] = []
  const indices: number[] = []

  positions.push(0, lift, 0)

  for (let j = 1; j <= RADIAL_RINGS; j++) {
    const t = j / RADIAL_RINGS
    for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
      const theta = (i / ANGULAR_SEGMENTS) * Math.PI * 2
      const r = t * hexRadiusAtAngle(theta)
      positions.push(r * Math.sin(theta), lift, r * Math.cos(theta))
    }
  }

  const ringVertex = (j: number, i: number) => 1 + (j - 1) * ANGULAR_SEGMENTS + (i % ANGULAR_SEGMENTS)

  for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
    indices.push(0, ringVertex(1, i), ringVertex(1, i + 1))
  }
  for (let j = 1; j < RADIAL_RINGS; j++) {
    for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
      const a = ringVertex(j, i)
      const b = ringVertex(j + 1, i)
      const c = ringVertex(j + 1, i + 1)
      const d = ringVertex(j, i + 1)
      indices.push(a, b, c, a, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  overlayCache.set(key, geometry)
  return geometry
}

// Same flat technique as getTileOverlay above, but only the OUTERMOST
// radial band — a thin ring tracing the tile's edge, rather than covering
// the whole face.
const edgeOverlayCache = new Map<string, THREE.BufferGeometry>()

export function getTileEdgeOverlay(biome: Biome, seed: string, lift = 0.014): THREE.BufferGeometry {
  const key = `${biome}:${seed}:${lift}`
  const cached = edgeOverlayCache.get(key)
  if (cached) return cached

  const positions: number[] = []
  const indices: number[] = []

  const pushRing = (t: number) => {
    const start = positions.length / 3
    for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
      const theta = (i / ANGULAR_SEGMENTS) * Math.PI * 2
      const r = t * hexRadiusAtAngle(theta)
      positions.push(r * Math.sin(theta), lift, r * Math.cos(theta))
    }
    return start
  }

  const innerStart = pushRing((RADIAL_RINGS - 1) / RADIAL_RINGS)
  const outerStart = pushRing(1)

  for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
    const next = (i + 1) % ANGULAR_SEGMENTS
    const a = innerStart + i
    const b = outerStart + i
    const c = outerStart + next
    const d = innerStart + next
    indices.push(a, b, c, a, c, d)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  edgeOverlayCache.set(key, geometry)
  return geometry
}
