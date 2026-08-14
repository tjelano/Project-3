import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { FRAME_INNER, WATER_OVERLAP, WATER_Y, WAVE_AMPLITUDE } from '../three/layout'
import { createSeaMaterial } from '../three/materials'

// ~0.19 units per facet. Fine enough that the swell reads as rolling water,
// coarse enough that individual triangles stay legible as facets.
const WATER_SEGMENTS = 64

/**
 * A living sea, displaced on the GPU.
 *
 * The technique that makes this work: the material keeps `flatShading: true`,
 * and three.js implements flat shading in the FRAGMENT stage —
 *
 *     vec3 fdx = dFdx(vViewPosition);
 *     vec3 fdy = dFdy(vViewPosition);
 *     vec3 normal = normalize(cross(fdx, fdy));
 *
 * — deriving each facet's normal from screen-space derivatives of the
 * interpolated view position. So if we displace vertices in the VERTEX
 * stage, the normals follow automatically and stay exactly perpendicular to
 * every tilted facet. No CPU vertex loop, no computeVertexNormals() per
 * frame, and no hand-written normal maths: the swell lights itself.
 *
 * We inject that displacement into the stock MeshPhysicalMaterial via
 * onBeforeCompile rather than writing a ShaderMaterial from scratch, which
 * means we keep the full PBR pipeline — IBL, clearcoat, tone mapping, fog,
 * shadows — and only add the motion.
 */

// Four travelling waves at incommensurate directions, frequencies and
// speeds. Because the periods never line up, the surface never visibly
// repeats — the cheapest way to buy "alive" without noise textures.
// The octave WEIGHTS below sum to exactly 1.0, and the whole sum is scaled
// by uAmplitude. That is what lets layout.ts reason about the worst-case
// crest height as a single number: |wave| can never exceed uAmplitude, for
// any position or phase, because |sin| ≤ 1 termwise.
const WAVE_GLSL = /* glsl */ `
  uniform float uAmplitude;

  float catanWaveHeight(vec2 p, float t) {
    float h = 0.0;
    h += sin(dot(p, vec2( 0.92,  0.39)) * 0.62 + t * 0.78) * 0.44;
    h += sin(dot(p, vec2(-0.45,  0.89)) * 0.94 - t * 0.61) * 0.31;
    h += sin(dot(p, vec2( 0.24, -0.97)) * 1.53 + t * 1.14) * 0.17;
    h += sin(dot(p, vec2( 0.79, -0.61)) * 2.61 - t * 1.63) * 0.08;
    return h * uAmplitude;
  }
`

export function Ocean({ innerSize = FRAME_INNER }: { innerSize?: number }) {
  const shaderRef = useRef<THREE.WebGLProgramParametersWithUniforms | null>(null)
  const { gl } = useThree()
  const waterSize = innerSize + WATER_OVERLAP

  // Shader compile/link failures in three.js do NOT throw a catchable JS
  // exception — the broken program is silently left in place and nothing
  // renders. `renderer.debug.onShaderError` is the one hook three exposes
  // for this exact case (WebGLProgram.js checks LINK_STATUS and calls it
  // instead of just logging, when it's set). If a driver ever rejects this
  // custom vertex shader, we drop to a plain, uninjected physical material
  // — a static but fully visible sea — rather than a permanently black
  // plane with no error a React error boundary could ever have caught.
  const [shaderFailed, setShaderFailed] = useState(false)

  useEffect(() => {
    const previous = gl.debug.onShaderError
    // gl is a raw Three.js WebGLRenderer — an imperative, non-React-owned
    // object useThree() merely hands back a reference to, not React state.
    // onShaderError is the ONE hook three.js exposes for this (see comment
    // above); there's no non-mutating alternative to assign it through.
    // eslint-disable-next-line react-hooks/immutability
    gl.debug.onShaderError = (context, program, vertexShader, fragmentShader) => {
      console.error(
        '[Catan] Ocean wave shader failed to compile/link — falling back to a static sea material.',
        {
          vertexLog: context.getShaderInfoLog(vertexShader),
          fragmentLog: context.getShaderInfoLog(fragmentShader),
          programLog: context.getProgramInfoLog(program),
        },
      )
      setShaderFailed(true)
    }
    return () => {
      gl.debug.onShaderError = previous
    }
  }, [gl])

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(waterSize, waterSize, WATER_SEGMENTS, WATER_SEGMENTS)
    geo.rotateX(-Math.PI / 2)
    return geo
  }, [waterSize])

  // A board-shape change swaps innerSize (hence waterSize), which recreates
  // this geometry via the useMemo above — the OLD one is otherwise never
  // freed, since it's built with `new`, not JSX, so React Three Fiber's own
  // auto-dispose (which only covers objects it creates and attaches itself)
  // never sees it.
  useEffect(() => {
    return () => geometry.dispose()
  }, [geometry])

  const material = useMemo(() => {
    // Surface properties live in three/materials.ts; this file only adds motion.
    const mat = createSeaMaterial()

    // Once a compile failure has been observed, skip the injection entirely
    // on every subsequent (re)compile — a "beautiful standard material
    // grid" per the fallback spec: same PBR surface, same flat-shaded
    // facets, just without the GPU-side vertex displacement.
    if (shaderFailed) return mat

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }
      shader.uniforms.uAmplitude = { value: WAVE_AMPLITUDE }

      shader.vertexShader = shader.vertexShader
        .replace('void main() {', `uniform float uTime;\n${WAVE_GLSL}\nvoid main() {`)
        // `transformed` is the local-space vertex three.js goes on to use
        // for the model-view transform, so displacing it here feeds the
        // correct position into vViewPosition — which the flat-shading
        // derivative then reads to build the facet normal.
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           transformed.y += catanWaveHeight(transformed.xz, uTime);
           // A little lateral drift so crests slide rather than merely
           // pulsing in place — the difference between water and jelly.
           transformed.x += sin(transformed.z * 0.42 + uTime * 0.55) * 0.022;
           transformed.z += cos(transformed.x * 0.37 - uTime * 0.48) * 0.022;`,
        )

      shaderRef.current = shader
    }

    return mat
  }, [shaderFailed])

  useFrame(({ clock }) => {
    const shader = shaderRef.current
    if (shader) shader.uniforms.uTime.value = clock.elapsedTime
  })

  return <mesh geometry={geometry} material={material} position={[0, WATER_Y, 0]} receiveShadow />
}
