import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useClonedModel } from '../hooks/useClonedModel'
import hiddenTileUrl from '../assets/models/hidden-tile.glb'

// See Task 5 in the Hidden Tiles implementation plan for how these were
// measured (gltf-transform inspect against mountains-tile.glb, the tallest
// existing biome) — a 90° authoring-orientation fix (the same situation
// CatanBoard.tsx's BIOME_MODEL_ROTATION_Y already documents for
// hills-tile.glb) plus a uniform scale to match the standard tile footprint
// while keeping height comfortably above the tallest tile.
const HIDDEN_TILE_ROTATION_Y = Math.PI / 2
const HIDDEN_TILE_SCALE = 0.94

// How long the dissolve-away takes once a tile reveals, in seconds.
// Exported because CatanBoard has to keep a revealed tile's mist mounted
// for exactly this long for the animation below to get any frames at all
// (see useDissolvingTileIds) — two independent copies of this number would
// drift into either a clipped dissolve or a mist that lingers after it has
// already shrunk to nothing.
export const REVEAL_FADE_SECONDS = 0.4

// Same swirling-noise technique as Ocean.tsx's WAVE_GLSL — summed sine waves
// at incommensurate directions, frequencies and speeds, the established
// "alive without a real noise texture" trick already used in this codebase,
// just reused here to modulate fragment brightness (a roiling mist density)
// instead of vertex height.
//
// Time arrives as a parameter rather than being read from uTime in here, so
// that this block declares no uniforms of its own: the injection site below
// is then the single place uTime is declared, and a GLSL redefinition error
// is impossible by construction.
const MIST_GLSL = /* glsl */ `
  float catanMistDensity(vec2 p, float t) {
    float n = 0.0;
    n += sin(dot(p, vec2( 1.7,  0.6)) * 3.1 + t * 0.35) * 0.5;
    n += sin(dot(p, vec2(-0.9,  1.3)) * 4.7 - t * 0.51) * 0.3;
    n += sin(dot(p, vec2( 0.4, -1.8)) * 6.2 + t * 0.72) * 0.2;
    return n * 0.5 + 0.5; // remap [-1, 1] -> [0, 1]
  }
`

// Every mounted MistTile injects byte-identical shader source, and three.js
// keys its program cache on `onBeforeCompile.toString()` — so all of them
// share ONE compiled WebGLProgram. A link failure is therefore a fact about
// the whole feature rather than about one tile, which is exactly why this
// flag can't be per-component `useState`: only whichever instance installed
// `gl.debug.onShaderError` last would ever hear the failure, and the other
// eighteen hidden tiles would sit there invisible with nothing to catch.
// One module-level store lets every mounted tile fall back together.
let mistShaderFailed = false
const mistShaderFailureListeners = new Set<() => void>()

function subscribeToMistShaderFailure(listener: () => void) {
  mistShaderFailureListeners.add(listener)
  return () => {
    mistShaderFailureListeners.delete(listener)
  }
}

function getMistShaderFailed() {
  return mistShaderFailed
}

function reportMistShaderFailure() {
  if (mistShaderFailed) return
  mistShaderFailed = true
  mistShaderFailureListeners.forEach((listener) => listener())
}

/**
 * The hidden-terrain mist for a Hidden Tiles ('resources'/'both' mode) tile
 * that hasn't been revealed yet. Static shape (hidden-tile.glb) + animated
 * fragment shader (this file) are deliberately separate concerns — see the
 * design spec. `revealed` plays a scale-down dissolve rather than an instant
 * pop: CatanBoard keeps this component mounted, with `revealed` set, for
 * REVEAL_FADE_SECONDS after the tile lands in revealedTileIds (the real
 * terrain is already drawn underneath by then) and only unmounts it once
 * the shrink has finished.
 */
export function MistTile({ revealed }: { revealed: boolean }) {
  const instance = useClonedModel(hiddenTileUrl)
  const groupRef = useRef<THREE.Group>(null)
  const shaderRef = useRef<THREE.WebGLProgramParametersWithUniforms | null>(null)
  const { gl } = useThree()

  // Same reasoning as Ocean.tsx: a broken shader must fall back to the
  // model's own plain baked material (still fully opaque — still
  // successfully hides the tile, just without the swirl) rather than
  // rendering nothing. Shader link failures don't throw a catchable JS
  // exception in three.js; onShaderError is the one hook it exposes.
  const shaderFailed = useSyncExternalStore(subscribeToMistShaderFailure, getMistShaderFailed)

  useEffect(() => {
    // Once the program is known bad there is nothing left to listen for —
    // the fallback path below never compiles anything again.
    if (shaderFailed) return

    const previous = gl.debug.onShaderError
    // gl is a raw Three.js WebGLRenderer — an imperative, non-React-owned
    // object useThree() merely hands back a reference to, not React state.
    // onShaderError is the ONE hook three.js exposes for this; there's no
    // non-mutating alternative to assign it through.
    // eslint-disable-next-line react-hooks/immutability
    gl.debug.onShaderError = (context, program, vertexShader, fragmentShader) => {
      console.error(
        '[Catan] Hidden-tile mist shader failed to compile/link — falling back to a static mist mesh.',
        {
          vertexLog: context.getShaderInfoLog(vertexShader),
          fragmentLog: context.getShaderInfoLog(fragmentShader),
          programLog: context.getProgramInfoLog(program),
        },
      )
      reportMistShaderFailure()
    }
    return () => {
      gl.debug.onShaderError = previous
    }
  }, [gl, shaderFailed])

  // Materials on a cloned GLTF scene are shared BY REFERENCE with useGLTF's
  // cached original (Object3D.clone() shallow-copies them), so injecting
  // straight into child.material would rewrite the material every other
  // MistTile is also pointing at, leaving them all fighting over one uTime.
  // Cloning per instance gives this tile its own material and its own
  // uniform set. Textures stay shared by reference — this duplicates a small
  // property object per tile, not the 46MB of baked texture data.
  //
  // Layout, not passive: the swap has to land before three.js first draws
  // this mesh, or frame one compiles a second, uninjected program for the
  // pristine material and throws it away again.
  useLayoutEffect(() => {
    const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
    const injected: THREE.Material[] = []

    instance.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return
      originals.set(child, child.material)
      if (shaderFailed) return

      const material = (child.material as THREE.Material).clone()
      // three.js defines USE_UV nowhere in its own renderer — it is purely
      // the caller's opt-in for the plain `vUv` varying, whose declaration
      // in uv_pars_fragment sits behind exactly this define. Without it the
      // injection below fails to compile on an undeclared `vUv`. Preferred
      // over reaching for `vMapUv`, which only exists for as long as this
      // model happens to carry a base colour map.
      material.defines = { ...material.defines, USE_UV: '' }
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uTime = { value: 0 }
        shader.fragmentShader = shader.fragmentShader
          // three.js has not expanded its #include directives yet at
          // onBeforeCompile time, so both anchors below still occur exactly
          // once in the source and these string replaces are unambiguous.
          .replace('void main() {', `uniform float uTime;\n${MIST_GLSL}\nvoid main() {`)
          // map_fragment is where the baked base colour lands in
          // diffuseColor, so modulating just after it lets the swirl go
          // through the normal lighting pipeline rather than being pasted
          // flat on top of the lit result.
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
             float catanDensity = catanMistDensity(vUv * 3.0, uTime);
             diffuseColor.rgb *= mix(0.75, 1.15, catanDensity);`,
          )
        shaderRef.current = shader
      }
      child.material = material
      injected.push(material)
    })

    return () => {
      // Putting the pristine shared materials back is what makes the
      // fallback real: when shaderFailed flips, this cleanup restores the
      // plain baked material before the re-run declines to inject again.
      // Without it the meshes would keep the material carrying the broken
      // program and quietly draw nothing at all.
      originals.forEach((material, mesh) => {
        mesh.material = material
      })
      // Nothing can reach these clones once the meshes point back at the
      // originals, and R3F's auto-dispose only covers objects it created
      // itself — the same reasoning as Ocean.tsx's geometry cleanup.
      // Material.dispose() leaves textures alone, and these are still the
      // originals' shared textures.
      injected.forEach((material) => material.dispose())
      shaderRef.current = null
    }
  }, [instance, shaderFailed])

  useFrame(({ clock }, delta) => {
    const shader = shaderRef.current
    if (shader) shader.uniforms.uTime.value = clock.elapsedTime

    // Dissolve-away on reveal: linear shrink to 0 over REVEAL_FADE_SECONDS
    // rather than vanishing instantly.
    const group = groupRef.current
    if (!group) return
    if (!revealed) {
      // The shrink is one-way, so an instance that survives `revealed`
      // going back to false would sit at whatever scale it stopped at —
      // possibly 0, i.e. a hidden tile wearing no mist at all. Reachable:
      // starting a New Game inside the dissolve window re-hides a tile
      // whose HexTile (keyed by tile id) never unmounted. Cheap to just
      // hold the resting scale here rather than have CatanBoard force a
      // remount to get it back.
      if (group.scale.x !== HIDDEN_TILE_SCALE) group.scale.setScalar(HIDDEN_TILE_SCALE)
      return
    }
    const step = (HIDDEN_TILE_SCALE / REVEAL_FADE_SECONDS) * delta
    group.scale.setScalar(Math.max(0, group.scale.x - step))
  })

  return (
    <group ref={groupRef} rotation={[0, HIDDEN_TILE_ROTATION_Y, 0]} scale={HIDDEN_TILE_SCALE}>
      <primitive object={instance} />
    </group>
  )
}
