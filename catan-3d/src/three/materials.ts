import * as THREE from 'three'
import { BIOME_COLORS, type Biome } from '../data/hexBoard'

/**
 * ART DIRECTION — "Vitrine at dusk"
 *
 * The board is a collector's artifact sitting in a gallery case, not a
 * cartoon. Every material below is chosen against that thesis:
 *
 *  - Terrain reads as hand-painted resin: very high roughness, zero metal,
 *    plus a SHEEN layer. Sheen is the fabric/velvet lobe — it adds a soft
 *    grazing-angle falloff at silhouette edges, which is precisely what
 *    separates "premium matte" from "flat untextured". This is the single
 *    most important material decision in the scene.
 *  - Chits are lacquered ivory: mid roughness with a thin CLEARCOAT, so
 *    they catch one crisp highlight the terrain never does.
 *  - Hardware (port poles, inlay) is real metal: metalness ~1 and low
 *    roughness, so it renders almost entirely from the environment map.
 *    Metal is what makes an IBL rig visibly worth having.
 *  - Water is near-black and nearly smooth — it earns its beauty from
 *    reflection and wave geometry, not from base colour.
 *
 * Materials are module-level singletons, shared across every mesh that
 * uses them. Beyond art direction this collapses the ~430 one-off material
 * instances the audit flagged (S2-1) down to roughly a dozen.
 */

// --- Palette --------------------------------------------------------------
export const PALETTE = {
  walnut: '#3a2418',
  walnutDark: '#241309',
  brass: '#c8a93e',
  ivory: '#f4ead2',
  ink: '#241c14',
  seaDeep: '#071c33',
} as const

// Warm sheen tint shared by the terrain — a cool sheen would fight the key
// light and make the clay read plastic.
const TERRAIN_SHEEN_COLOR = new THREE.Color('#ffd9b0')

function terrainMaterial(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.92,
    metalness: 0,
    sheen: 0.55,
    sheenRoughness: 0.75,
    sheenColor: TERRAIN_SHEEN_COLOR,
    flatShading: true,
  })
}

// One material per biome rather than one per tile: 6 instead of 19. The hex
// prisms stay smooth-shaded so they read as a clean machined cut, while the
// scatter decorations on top keep flat shading for crisp facets.
export const TILE_MATERIALS: Record<Biome, THREE.MeshPhysicalMaterial> = Object.fromEntries(
  (Object.keys(BIOME_COLORS) as Biome[]).map((biome) => {
    const material = terrainMaterial(BIOME_COLORS[biome])
    material.flatShading = false
    return [biome, material]
  }),
) as Record<Biome, THREE.MeshPhysicalMaterial>

// --- Decoration materials -------------------------------------------------
// Scatter decorations pick from small colour palettes, so cache by colour:
// every tree across all four forest tiles shares one material instead of
// allocating its own. Turns ~140 decoration materials into ~10.
const decorCache = new Map<string, THREE.MeshPhysicalMaterial>()

export function decorMaterial(color: string): THREE.MeshPhysicalMaterial {
  const cached = decorCache.get(color)
  if (cached) return cached
  const created = terrainMaterial(color)
  decorCache.set(color, created)
  return created
}

export const SNOW_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: '#eef3f7',
  roughness: 0.6,
  metalness: 0,
  sheen: 0.9,
  sheenRoughness: 0.4,
  sheenColor: new THREE.Color('#cfe4ff'),
  flatShading: true,
})

export const TRUNK_MATERIAL = terrainMaterial('#4a2f21')

export const SHEEP_WOOL_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: '#f8f5ee',
  roughness: 0.95,
  metalness: 0,
  // Wool gets the strongest sheen in the scene — it's literally fabric.
  sheen: 1,
  sheenRoughness: 0.9,
  sheenColor: new THREE.Color('#fff0dc'),
  flatShading: true,
})

export const SHEEP_FACE_MATERIAL = terrainMaterial('#3a2c20')

// --- Chits ----------------------------------------------------------------
// Lacquered ivory: the clearcoat is what makes these read as printed discs
// resting ON the landscape rather than modelled out of the same clay.
export const TOKEN_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: PALETTE.ivory,
  roughness: 0.45,
  metalness: 0,
  clearcoat: 0.6,
  clearcoatRoughness: 0.35,
})

export const DIE_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: '#faf4e4',
  roughness: 0.28,
  metalness: 0.02,
  clearcoat: 0.8,
  clearcoatRoughness: 0.18,
  flatShading: true,
})

export const PIP_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: PALETTE.ink,
  roughness: 0.35,
  metalness: 0,
  clearcoat: 0.5,
})

// --- Sea ------------------------------------------------------------------
/**
 * The sea material lives here with the rest of the art direction, even though
 * Ocean.tsx attaches the wave displacement to it — so all surface tuning is
 * in one file.
 *
 * Retuned away from a mirror finish: at roughness 0.14 with clearcoat 1.0 the
 * surface returned the studio lights as a single searing highlight. Raising
 * roughness spreads that energy over a wide, soft sheen instead, and the
 * clearcoat is now a hint of surface tension rather than a second mirror.
 */
export function createSeaMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: PALETTE.seaDeep,
    // Broad, scattered specular — the difference between "wet" and "chrome".
    // Nudged down from 0.40 now that the studio lights are dimmer: enough
    // definition for each facet to catch its own glint as the swell rolls,
    // still far from the mirror finish that was causing the glare.
    roughness: 0.34,
    // Mostly dielectric now; high metalness was amplifying the reflection.
    metalness: 0.12,
    envMapIntensity: 0.75,
    clearcoat: 0.25,
    clearcoatRoughness: 0.5,
    flatShading: true,
  })
}

// --- Hardware -------------------------------------------------------------
export const BRASS_MATERIAL = new THREE.MeshStandardMaterial({
  color: PALETTE.brass,
  metalness: 1,
  roughness: 0.3,
  envMapIntensity: 0.9,
})

export const WALNUT_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: PALETTE.walnut,
  roughness: 0.52,
  metalness: 0,
  clearcoat: 0.35,
  clearcoatRoughness: 0.55,
  sheen: 0.25,
  sheenRoughness: 0.6,
  sheenColor: new THREE.Color('#8a5a3a'),
})

export const BASIN_MATERIAL = new THREE.MeshStandardMaterial({
  color: PALETTE.walnutDark,
  roughness: 0.9,
  metalness: 0,
})

export const DOCK_WOOD_MATERIAL = terrainMaterial('#6a4a30')

// Robber: near-black felted stone, deliberately the least reflective object
// on the board so it reads as a void moving across the landscape.
export const ROBBER_MATERIAL = new THREE.MeshPhysicalMaterial({
  color: '#15151a',
  roughness: 0.95,
  metalness: 0,
  sheen: 0.4,
  sheenRoughness: 0.8,
  sheenColor: new THREE.Color('#4a5a7a'),
  flatShading: true,
})
