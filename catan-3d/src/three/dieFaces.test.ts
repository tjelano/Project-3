import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { faceValueFromQuaternion, REST_EULER } from './dieFaces'

describe('faceValueFromQuaternion', () => {
  it('correctly identifies the exact rest orientations for all faces', () => {
    for (let value = 1; value <= 6; value++) {
      const [x, y, z] = REST_EULER[value]
      const euler = new THREE.Euler(x, y, z, 'XYZ')
      const quaternion = new THREE.Quaternion().setFromEuler(euler)

      const readValue = faceValueFromQuaternion(quaternion)
      expect(readValue).toBe(value)
    }
  })

  it('correctly identifies faces even with slight rotations (physics slop)', () => {
    // 20 degrees in radians
    const slop = THREE.MathUtils.degToRad(20)

    for (let value = 1; value <= 6; value++) {
      const [x, y, z] = REST_EULER[value]

      // Rotate a bit around X
      const eulerX = new THREE.Euler(x + slop, y, z, 'XYZ')
      const quatX = new THREE.Quaternion().setFromEuler(eulerX)
      expect(faceValueFromQuaternion(quatX)).toBe(value)

      // Rotate a bit around Y
      const eulerY = new THREE.Euler(x, y + slop, z, 'XYZ')
      const quatY = new THREE.Quaternion().setFromEuler(eulerY)
      expect(faceValueFromQuaternion(quatY)).toBe(value)

      // Rotate a bit around Z
      const eulerZ = new THREE.Euler(x, y, z + slop, 'XYZ')
      const quatZ = new THREE.Quaternion().setFromEuler(eulerZ)
      expect(faceValueFromQuaternion(quatZ)).toBe(value)
    }
  })

  it('handles arbitrary orientations safely without crashing', () => {
    // A 45-degree angle around all axes (pointing exactly at a corner)
    const euler = new THREE.Euler(Math.PI / 4, Math.PI / 4, Math.PI / 4, 'XYZ')
    const quaternion = new THREE.Quaternion().setFromEuler(euler)

    const value = faceValueFromQuaternion(quaternion)

    // It should return a valid die face
    expect(value).toBeGreaterThanOrEqual(1)
    expect(value).toBeLessThanOrEqual(6)
    expect(Number.isInteger(value)).toBe(true)
  })
})
