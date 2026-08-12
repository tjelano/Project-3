import { useMemo } from 'react'
import * as THREE from 'three'
import {
  BASIN_Y,
  FRAME_DEPTH,
  FRAME_INNER,
  FRAME_RADIUS,
  FRAME_TOP_Y,
  computeFrameOuterSize,
} from '../three/layout'
import { BASIN_MATERIAL, BRASS_MATERIAL, WALNUT_MATERIAL } from '../three/materials'

/**
 * The physical object the game sits inside: a bevelled walnut tray with a
 * brass inlay line around the waterline, and an opaque basin floor beneath
 * the sea.
 *
 * Built with ExtrudeGeometry over a rounded-rectangle Shape carrying a
 * rounded-rectangle hole. Two things make it read as manufactured rather
 * than as a box:
 *
 *  - The bevel. A chamfered edge catches a continuous specular line all the
 *    way around the rim; a hard 90° edge catches nothing and looks CG.
 *  - The rectilinear frame against the hex grid inside. Echoing the hexes
 *    would have been the safe choice, but the contrast is what makes the
 *    island read as *content* placed in a *product*.
 */

// Bevel is deliberately small relative to the rim: a wide bevel starts to
// look like a soft plastic tray instead of milled hardwood.
const BEVEL = 0.055

const INLAY_INSET = 0.16 // gap between the opening and the brass line
const INLAY_WIDTH = 0.11
const INLAY_PROUD = 0.014 // how far the inlay stands above the walnut

function traceRoundedRect(path: THREE.Shape | THREE.Path, size: number, radius: number) {
  const half = size / 2
  const r = Math.min(radius, half)
  path.moveTo(-half + r, -half)
  path.lineTo(half - r, -half)
  path.quadraticCurveTo(half, -half, half, -half + r)
  path.lineTo(half, half - r)
  path.quadraticCurveTo(half, half, half - r, half)
  path.lineTo(-half + r, half)
  path.quadraticCurveTo(-half, half, -half, half - r)
  path.lineTo(-half, -half + r)
  path.quadraticCurveTo(-half, -half, -half + r, -half)
}

/**
 * Extrudes a flat ring (outer size with an inner hole) upward, then shifts
 * it so its TOP face sits exactly at y = 0. Anchoring to the top rather
 * than the centre means callers position by the visible surface and the
 * slab thickness can change without moving the rim.
 */
function buildRingGeometry(outer: number, inner: number, depth: number, bevel: number) {
  const shape = new THREE.Shape()
  traceRoundedRect(shape, outer, FRAME_RADIUS)

  const hole = new THREE.Path()
  traceRoundedRect(hole, inner, FRAME_RADIUS * 0.78)
  shape.holes.push(hole)

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: 0,
    bevelSegments: 3,
    curveSegments: 16,
  })

  // Extrusion runs along +Z; rotating -90° about X maps +Z onto +Y so the
  // slab stands upright in world space.
  geometry.rotateX(-Math.PI / 2)
  geometry.computeBoundingBox()
  geometry.translate(0, -(geometry.boundingBox?.max.y ?? 0), 0)
  geometry.computeVertexNormals()
  return geometry
}

export function BoardFrame({ innerSize = FRAME_INNER }: { innerSize?: number }) {
  const outerSize = computeFrameOuterSize(innerSize)

  const walnutGeometry = useMemo(
    () => buildRingGeometry(outerSize, innerSize, FRAME_DEPTH, BEVEL),
    [outerSize, innerSize],
  )

  const inlayGeometry = useMemo(
    () =>
      buildRingGeometry(
        innerSize + INLAY_INSET * 2 + INLAY_WIDTH * 2,
        innerSize + INLAY_INSET * 2,
        0.05,
        0.012,
      ),
    [innerSize],
  )

  const basinGeometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(innerSize, innerSize)
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [innerSize])

  return (
    <group>
      <mesh
        geometry={walnutGeometry}
        material={WALNUT_MATERIAL}
        position={[0, FRAME_TOP_Y, 0]}
        castShadow
        receiveShadow
      />
      <mesh
        geometry={inlayGeometry}
        material={BRASS_MATERIAL}
        position={[0, FRAME_TOP_Y + INLAY_PROUD, 0]}
        castShadow
        receiveShadow
      />
      {/* Opaque floor under the sea. Without it the water reads as a sheet
          of blue glass floating over the background instead of as depth. */}
      <mesh geometry={basinGeometry} material={BASIN_MATERIAL} position={[0, BASIN_Y, 0]} receiveShadow />
    </group>
  )
}
