import * as THREE from 'three'

/**
 * ART DIRECTION — "Vitrine at dusk"
 *
 * The board is a collector's artifact sitting in a gallery case, not a
 * cartoon. What's left in this file, now that terrain/tokens/dock/robber
 * all render via GLB-baked materials instead:
 *
 *  - Dice are lacquered ceramic: mid roughness with a thin CLEARCOAT, so
 *    they catch one crisp highlight against the felt.
 *  - Hardware (port poles, inlay) is real metal: metalness ~1 and low
 *    roughness, so it renders almost entirely from the environment map.
 *    Metal is what makes an IBL rig visibly worth having.
 *  - Water is near-black and nearly smooth — it earns its beauty from
 *    reflection and wave geometry, not from base colour.
 *
 * Materials are module-level singletons, shared across every mesh that
 * uses them.
 */

// --- Palette --------------------------------------------------------------
// Not exported — every material below that needs a palette colour lives in
// this same file.
const PALETTE = {
  walnut: '#3a2418',
  walnutDark: '#241309',
  brass: '#c8a93e',
  ink: '#241c14',
  seaDeep: '#071c33',
} as const

// --- Dice -------------------------------------------------------------
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
