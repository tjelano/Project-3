import * as THREE from 'three'

// Single source of truth for "what a die looks like and what its faces
// mean" — shared between Dice3D.tsx (the closed-form, always-lands-right
// tumble used for everyone watching a roll that isn't theirs) and
// PhysicsDice3D.tsx (the real Rapier simulation used by whoever's actually
// rolling). Both need to agree on the exact same size/pip layout and the
// exact same "which orientation shows which value" convention, or the two
// systems would silently disagree about what a die even looks like.
export const DIE_SIZE = 0.34

// Absolute rest orientation for each face value, derived from a standard die
// (opposite faces sum to 7) with +Y=1, -Y=6, +Z=2, -Z=5, +X=3, -X=4. Used to
// set up the closed-form tumble's target orientation.
export const REST_EULER: Record<number, [number, number, number]> = {
  1: [0, 0, 0],
  2: [-Math.PI / 2, 0, 0],
  3: [0, 0, Math.PI / 2],
  4: [0, 0, -Math.PI / 2],
  5: [Math.PI / 2, 0, 0],
  6: [Math.PI, 0, 0],
}

// The inverse of REST_EULER: which face VALUE is showing, given an
// arbitrary orientation — used to read the result off a physics
// simulation's actual final rotation, which (unlike the closed-form
// system) will never land on an exact REST_EULER angle. Each entry is the
// local axis direction that shows this value when it points up.
const FACE_UP_AXES: { axis: THREE.Vector3; value: number }[] = [
  { axis: new THREE.Vector3(0, 1, 0), value: 1 },
  { axis: new THREE.Vector3(0, 0, 1), value: 2 },
  { axis: new THREE.Vector3(1, 0, 0), value: 3 },
  { axis: new THREE.Vector3(-1, 0, 0), value: 4 },
  { axis: new THREE.Vector3(0, 0, -1), value: 5 },
  { axis: new THREE.Vector3(0, -1, 0), value: 6 },
]

// Scratch vector reused across calls — this runs every frame while a
// physics roll is settling, so it must not allocate.
const SCRATCH_AXIS = new THREE.Vector3()

// Whichever of the die's 6 local face-normals ends up MOST aligned with
// world-up (the largest dot product against +Y, which for a unit vector
// is just its world-space Y component) is the face reading as "up" — the
// same principle as reading a real die, and robust to a physics result
// that's only ever approximately axis-aligned, not exact.
export function faceValueFromQuaternion(quaternion: THREE.Quaternion): number {
  let bestValue = 1
  let bestY = -Infinity
  for (const { axis, value } of FACE_UP_AXES) {
    SCRATCH_AXIS.copy(axis).applyQuaternion(quaternion)
    if (SCRATCH_AXIS.y > bestY) {
      bestY = SCRATCH_AXIS.y
      bestValue = value
    }
  }
  return bestValue
}
