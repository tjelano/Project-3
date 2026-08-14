import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

// useGLTF caches by URL and returns the SAME scene graph on every call;
// cloning is what lets multiple instances of the same model (tiles, ports,
// the robber, game pieces) each have their own transform instead of
// fighting over one shared object's. Every mesh is also flagged to
// cast/receive shadows here, once, since imported GLTF meshes don't do
// either by default.
export function useClonedModel(url: string) {
  const { scene } = useGLTF(url)
  return useMemo(() => {
    const clone = scene.clone()
    clone.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return clone
  }, [scene])
}
