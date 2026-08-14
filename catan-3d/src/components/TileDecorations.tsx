import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createLabelTexture } from '../three/textLabels'

// The chit digit's world size — matches the troika fontSize this replaces.
const CHIT_FONT_WORLD_SIZE = 0.27

// ---------------------------------------------------------------------------
// NUMBER LABEL — the white chit disc itself is now sculpted into each
// biome's own model (CatanBoard.tsx), so this only floats the number.
// ---------------------------------------------------------------------------
// Terrain-local space (y = 0 is the nominal tile top, matching every other
// decoration) — just enough to clear the model's own chit surface and
// avoid z-fighting, since this now lies flush against it rather than
// floating above as an upright card.
const TOKEN_LABEL_Y = 0.012

// Reused every frame instead of allocating a new Vector3 per token per
// frame — there can be up to 18 of these live at once.
const WORLD_POS = new THREE.Vector3()

export function NumberToken({ value, yOffset = 0 }: { value: number; yOffset?: number }) {
  const isHot = value === 6 || value === 8
  const yawRef = useRef<THREE.Group>(null)

  const label = useMemo(
    () => createLabelTexture(String(value), { fontPx: 96, color: isHot ? '#a32020' : '#2b2b2b' }),
    [value, isHot],
  )
  const labelScale = CHIT_FONT_WORLD_SIZE / label.fontPx

  // Lies flat on the chit's own surface (like a number actually painted on
  // it) instead of standing up as a camera-facing card — the outer group
  // only ever yaws around the true vertical axis, so the plane itself
  // never tilts out of flat; only which way the digit reads changes as the
  // camera moves. Two nested transforms rather than one: rotating this
  // group directly around Y, with the plane's own flattening rotation
  // baked into a child instead of combined into one Euler, is what keeps
  // the yaw purely horizontal — composing both into a single rotation
  // would have the flattening tilt bleed into the "facing" axis instead of
  // staying the true world-up one.
  useFrame(({ camera }) => {
    const yawGroup = yawRef.current
    if (!yawGroup) return
    yawGroup.getWorldPosition(WORLD_POS)
    yawGroup.rotation.y = Math.atan2(camera.position.x - WORLD_POS.x, camera.position.z - WORLD_POS.z)
  })

  return (
    <group ref={yawRef} position={[0, TOKEN_LABEL_Y + yOffset, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[label.width * labelScale, label.height * labelScale]} />
        <meshBasicMaterial map={label.texture} transparent depthWrite={false} />
      </mesh>
    </group>
  )
}
