import * as THREE from 'three'

// Matches the Canvas's own initial `camera` prop in App.tsx and
// OrbitControls' `target` — every camera mode's own R-reset uses these SAME
// two vectors so they can never drift out of sync with each other. A plain
// constants module (not exported alongside a component) so Fast Refresh
// doesn't choke on FreeCameraControls/OrbitTargetPan re-exporting them.
export const START_POSITION = new THREE.Vector3(0, 9, 7)
export const START_TARGET = new THREE.Vector3(0, 0, 0)
