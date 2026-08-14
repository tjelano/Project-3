import * as THREE from 'three'
import { HEX_RADIUS, TILE_HEIGHT, type Biome } from '../data/hexBoard'
import { createSeededRandom } from '../utils/seededRandom'

/**
 * SCULPTED HEX TERRAIN
 *
 * Each tile stops being a flat cylinder and becomes a small carved
 * landscape: a hex-conformal polar mesh whose top surface is displaced by a
 * per-biome height field, wrapped in a raised stone rim and hollowed by a
 * circular recess that the number chit nests into.
 *
 * The height field is the single source of truth. The mesh is built from
 * it, AND the scatter decorations sample it to sit exactly on the ground —
 * so a pine never floats above a dune or sinks into a terrace.
 *
 * Local space: y = 0 is the nominal tile top, terrain rises from there, and
 * the prism runs down to y = -TILE_HEIGHT. The mesh is placed at world
 * y = TILE_HEIGHT/2, which reproduces the original tile footprint exactly.
 */

// Angular / radial resolution. 54 is a multiple of 6, so ring vertices land
// exactly on the hexagon's corners and the silhouette stays crisp.
const ANGULAR_SEGMENTS = 54
const RADIAL_RINGS = 9

// --- Sculpt profile -------------------------------------------------------
/** Normalised radius (0 centre, 1 hex edge) where the rim starts rising. */
const RIM_START = 0.84
/** Height of the raised perimeter border above the nominal tile top. */
export const RIM_HEIGHT = 0.055
/**
 * Normalised radius of the flat chit recess floor.
 *
 * Must comfortably exceed the chit's own normalised radius. The chit is
 * TOKEN_RADIUS (0.26) in world units and the hexagon's tightest direction is
 * its apothem (0.866), so the disc reaches nr = 0.26/0.866 ≈ 0.30 — this
 * sits clear of that so no part of the chit overhangs sloped ground.
 */
const RECESS_RADIUS = 0.34
/** How far the chit recess is carved BELOW the nominal tile top. */
export const RECESS_DEPTH = 0.045

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

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

type HeightField = (x: number, z: number) => number

/**
 * Per-biome landform, before the rim and recess are applied. Each is an
 * analytic combination chosen to read as that terrain type at a glance:
 * ridged absolute-sine for rock, quantised steps for terraces, a skewed
 * power curve for dunes, gentle multi-octave for grass.
 */
function biomeLandform(biome: Biome, seed: string): HeightField {
  const random = createSeededRandom(`${seed}-landform`)
  const ox = random() * 12
  const oz = random() * 12
  const dir = random() * Math.PI * 2
  const dx = Math.cos(dir)
  const dz = Math.sin(dir)

  switch (biome) {
    case 'mountains':
      // Foothills only — the actual peaks are separate cones placed on top,
      // and this is the mass they rise out of. Ridged noise (1 - |sin|)
      // gives sharp crest lines instead of smooth blobs.
      return (x, z) => {
        const r1 = 1 - Math.abs(Math.sin(x * 1.55 + ox))
        const r2 = 1 - Math.abs(Math.sin((x * 0.5 + z * 1.45) * 1.1 + oz))
        const ridged = Math.pow(r1 * 0.55 + r2 * 0.45, 1.5)
        return ridged * 0.11 + Math.sin(x * 2.3 + ox) * Math.cos(z * 2.1 + oz) * 0.018
      }

    case 'hills':
      // Jagged terraced outcrop. Two ideas stacked:
      //  1. ANGULAR WARP — the field is sampled against a radius that wobbles
      //     with angle, so the quantised shelves break into irregular
      //     polygonal ledges instead of neat concentric rings.
      //  2. QUANTISATION — flooring into 5 bands is what turns a smooth
      //     slope into actual cliff steps. The discreteness IS the terracing.
      return (x, z) => {
        const angle = Math.atan2(z, x)
        const warp = Math.sin(angle * 3 + ox) * 0.19 + Math.sin(angle * 5 - oz) * 0.11
        const ridged = Math.hypot(x, z) + warp
        const field = Math.sin(ridged * 3.2 + ox) * 0.55 + Math.cos(x * 1.25 + z * 1.7 + oz) * 0.45
        const n = (field + 1) * 0.5
        const steps = 5
        const terraced = Math.floor(n * steps) / (steps - 1)
        return terraced * 0.155
      }

    case 'desert':
      // Dunes: a low-frequency travelling crest raised to a power > 1, which
      // flattens the troughs and sharpens the crests into sweeping ridges.
      return (x, z) => {
        const along = x * dx + z * dz
        const across = x * -dz + z * dx
        // Primary sweep plus a slower crossing set, so crests fork and
        // merge the way real dune fields do rather than marching in parallel.
        const primary = Math.pow((Math.sin(along * 1.0 + ox) + 1) * 0.5, 1.8)
        const crossing = Math.pow((Math.sin(across * 0.72 - oz) + 1) * 0.5, 2.1)
        return primary * 0.105 + crossing * 0.045 + Math.sin(across * 2.6 + oz) * 0.012
      }

    case 'fields':
      // Ploughed corduroy: gentle roll plus a high-frequency ripple along a
      // single axis, so the wheat rows have furrows to sit in.
      return (x, z) => {
        const along = x * dx + z * dz
        const across = x * -dz + z * dx
        return Math.sin(across * 1.6 + ox) * 0.022 + Math.sin(along * 8.5) * 0.011
      }

    case 'forest':
      return (x, z) =>
        Math.sin(x * 1.7 + ox) * 0.024 + Math.cos(z * 1.9 + oz) * 0.018 + Math.sin((x + z) * 3.1) * 0.008

    case 'pasture':
    default:
      return (x, z) => Math.sin(x * 1.45 + ox) * 0.02 + Math.cos(z * 1.6 + oz) * 0.016
  }
}

/**
 * Full surface height: landform, hollowed by the chit recess at the centre
 * and lifted into the raised border at the perimeter. Both blends use
 * smoothstep so the transitions are sculpted ramps, not visible steps.
 */
function buildHeightField(biome: Biome, seed: string): HeightField {
  const landform = biomeLandform(biome, seed)

  return (x, z) => {
    const radius = Math.hypot(x, z)
    const theta = Math.atan2(x, z) // matches the (sinθ, cosθ) corner convention
    const edge = hexRadiusAtAngle(theta)
    const nr = edge > 0 ? radius / edge : 0

    let h = landform(x, z)

    // Recess: flat floor at the centre, ramping out to the landform.
    const outOfRecess = smoothstep(RECESS_RADIUS, RECESS_RADIUS + 0.14, nr)
    h = lerp(-RECESS_DEPTH, h, outOfRecess)

    // Rim: ramp up to a constant border height at the hexagon boundary.
    const intoRim = smoothstep(RIM_START, 0.995, nr)
    h = lerp(h, RIM_HEIGHT, intoRim)

    return h
  }
}

function buildGeometry(height: HeightField): THREE.BufferGeometry {
  const positions: number[] = []
  const indices: number[] = []

  const push = (x: number, y: number, z: number) => {
    positions.push(x, y, z)
    return positions.length / 3 - 1
  }

  // --- top surface: centre vertex + RADIAL_RINGS rings ---
  const centre = push(0, height(0, 0), 0)

  const ringStart: number[] = []
  for (let j = 1; j <= RADIAL_RINGS; j++) {
    ringStart[j] = positions.length / 3
    const t = j / RADIAL_RINGS
    for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
      const theta = (i / ANGULAR_SEGMENTS) * Math.PI * 2
      const r = t * hexRadiusAtAngle(theta)
      const x = r * Math.sin(theta)
      const z = r * Math.cos(theta)
      push(x, height(x, z), z)
    }
  }

  const ringVertex = (j: number, i: number) => ringStart[j] + (i % ANGULAR_SEGMENTS)

  // Fan from the centre out to the first ring. Winding (centre, i, i+1) with
  // increasing θ yields a +Y normal under the (sinθ, cosθ) convention.
  for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
    indices.push(centre, ringVertex(1, i), ringVertex(1, i + 1))
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

  // --- side wall: outer ring down to the prism base ---
  const wallTopStart = positions.length / 3
  for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
    const theta = (i / ANGULAR_SEGMENTS) * Math.PI * 2
    const r = hexRadiusAtAngle(theta)
    const x = r * Math.sin(theta)
    const z = r * Math.cos(theta)
    push(x, height(x, z), z)
  }
  const wallBottomStart = positions.length / 3
  for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
    const theta = (i / ANGULAR_SEGMENTS) * Math.PI * 2
    const r = hexRadiusAtAngle(theta)
    push(r * Math.sin(theta), -TILE_HEIGHT, r * Math.cos(theta))
  }
  for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
    const next = (i + 1) % ANGULAR_SEGMENTS
    const t0 = wallTopStart + i
    const t1 = wallTopStart + next
    const b0 = wallBottomStart + i
    const b1 = wallBottomStart + next
    indices.push(t0, b0, b1, t0, b1, t1)
  }

  // --- base cap (never seen under the constrained camera, but keeps the
  // solid closed so shadows and AO behave) ---
  const baseCentre = push(0, -TILE_HEIGHT, 0)
  for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
    const next = (i + 1) % ANGULAR_SEGMENTS
    indices.push(baseCentre, wallBottomStart + next, wallBottomStart + i)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

interface TileTerrain {
  geometry: THREE.BufferGeometry
  /** Surface height at a local (x, z), relative to the nominal tile top. */
  heightAt: HeightField
}

// Built once per tile and shared between every overlay that samples it, so
// they all read the identical surface. Keyed by biome+seed because the
// board reshuffles on every new game. Not exported — the only external
// consumer this had (TileDecorations.tsx's scatter components) was removed
// as dead code; getTileOverlay/getTileEdgeOverlay below are now the sole
// callers, both in this same file.
const cache = new Map<string, TileTerrain>()

function getTileTerrain(biome: Biome, seed: string): TileTerrain {
  const key = `${biome}:${seed}`
  const cached = cache.get(key)
  if (cached) return cached

  const heightAt = buildHeightField(biome, seed)
  const terrain: TileTerrain = { geometry: buildGeometry(heightAt), heightAt }
  cache.set(key, terrain)
  return terrain
}

// Overlay meshes (the Robber's tile picker) need to lie ON the sculpted
// surface, not on a flat plane at some averaged height — a flat disc either
// floats over the rim or sinks into the terraces. This rebuilds just the TOP
// surface of the tile, lifted a hair, so the highlight follows every fold.
const overlayCache = new Map<string, THREE.BufferGeometry>()

export function getTileOverlay(biome: Biome, seed: string, lift = 0.014): THREE.BufferGeometry {
  const key = `${biome}:${seed}:${lift}`
  const cached = overlayCache.get(key)
  if (cached) return cached

  const { heightAt } = getTileTerrain(biome, seed)
  const positions: number[] = []
  const indices: number[] = []

  positions.push(0, heightAt(0, 0) + lift, 0)

  for (let j = 1; j <= RADIAL_RINGS; j++) {
    const t = j / RADIAL_RINGS
    for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
      const theta = (i / ANGULAR_SEGMENTS) * Math.PI * 2
      const r = t * hexRadiusAtAngle(theta)
      const x = r * Math.sin(theta)
      const z = r * Math.cos(theta)
      positions.push(x, heightAt(x, z) + lift, z)
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

// Same terrain-conforming technique as getTileOverlay above, but only the
// OUTERMOST radial band — a thin ring tracing the tile's raised rim, rather
// than covering the whole face. Sits entirely within RIM_START..1.0 (the
// rim is already fully raised there), so it reads as the border itself
// lighting up rather than a highlight sitting on top of the whole tile.
const edgeOverlayCache = new Map<string, THREE.BufferGeometry>()

export function getTileEdgeOverlay(biome: Biome, seed: string, lift = 0.014): THREE.BufferGeometry {
  const key = `${biome}:${seed}:${lift}`
  const cached = edgeOverlayCache.get(key)
  if (cached) return cached

  const { heightAt } = getTileTerrain(biome, seed)
  const positions: number[] = []
  const indices: number[] = []

  const pushRing = (t: number) => {
    const start = positions.length / 3
    for (let i = 0; i < ANGULAR_SEGMENTS; i++) {
      const theta = (i / ANGULAR_SEGMENTS) * Math.PI * 2
      const r = t * hexRadiusAtAngle(theta)
      const x = r * Math.sin(theta)
      const z = r * Math.cos(theta)
      positions.push(x, heightAt(x, z) + lift, z)
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

