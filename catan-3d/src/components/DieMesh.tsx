import { DIE_MATERIAL, PIP_MATERIAL } from '../three/materials'
import { DIE_SIZE } from '../three/dieFaces'

// Pip positions in unit-cube space (half-size 0.5), one block per face,
// matching the same face/value assignment as REST_EULER above.
const FACE_PIP_UNITS: [number, number, number][] = [
  [0, 0.47, 0], // +Y: 1
  [-0.27, -0.47, -0.27],
  [0.27, -0.47, -0.27],
  [-0.27, -0.47, 0],
  [0.27, -0.47, 0],
  [-0.27, -0.47, 0.27],
  [0.27, -0.47, 0.27], // -Y: 6
  [-0.27, 0.27, 0.47],
  [0.27, -0.27, 0.47], // +Z: 2
  [-0.27, 0.27, -0.47],
  [0.27, 0.27, -0.47],
  [0, 0, -0.47],
  [-0.27, -0.27, -0.47],
  [0.27, -0.27, -0.47], // -Z: 5
  [0.47, 0.27, -0.27],
  [0.47, 0, 0],
  [0.47, -0.27, 0.27], // +X: 3
  [-0.47, 0.27, 0.27],
  [-0.47, 0.27, -0.27],
  [-0.47, -0.27, 0.27],
  [-0.47, -0.27, -0.27], // -X: 4
]

export function DieMesh() {
  return (
    <group>
      <mesh material={DIE_MATERIAL} castShadow receiveShadow>
        <boxGeometry args={[DIE_SIZE, DIE_SIZE, DIE_SIZE]} />
      </mesh>
      {FACE_PIP_UNITS.map((pos, i) => (
        <mesh
          key={i}
          position={[pos[0] * DIE_SIZE, pos[1] * DIE_SIZE, pos[2] * DIE_SIZE]}
          material={PIP_MATERIAL}
          castShadow
          receiveShadow
        >
          <sphereGeometry args={[0.085 * DIE_SIZE, 8, 6]} />
        </mesh>
      ))}
    </group>
  )
}
