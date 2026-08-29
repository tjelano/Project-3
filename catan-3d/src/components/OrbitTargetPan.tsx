import { useEffect, useRef, type ElementRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { OrbitControls } from '@react-three/drei'
import { START_POSITION, START_TARGET } from './cameraStartPose'

// Units/sec — same order of magnitude as FreeCameraControls' own MOVE_SPEED,
// so panning the orbit anchor doesn't feel jarringly faster/slower than
// flying around in free-cam.
const PAN_SPEED = 8

const scratchForward = new THREE.Vector3()
const scratchRight = new THREE.Vector3()
const scratchMove = new THREE.Vector3()

/**
 * WASD pans OrbitControls' own orbit target — and the camera along with it,
 * so the view slides rather than just re-aiming at a new point. An
 * alternative to drag-panning, which stays disabled on OrbitControls
 * (enablePan={false}) so an accidental right-click-drag can't yank the
 * board out of frame; this gives players a deliberate way to recenter
 * instead. R resets back to START_POSITION/START_TARGET — the same reset
 * pose FreeCameraControls' own R gives, just applied to OrbitControls.
 * Both WASD and R are disabled while free-cam (F) is active — that mode
 * already has its own WASD/R handling via FreeCameraControls' own listener.
 */
export function OrbitTargetPan({
  controlsRef,
  enabled,
}: {
  controlsRef: RefObject<ElementRef<typeof OrbitControls> | null>
  enabled: boolean
}) {
  const { camera } = useThree()
  const keysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // Never hijack typing in a text field — same guard FreeCameraControls
      // uses for its own WASD/R listener.
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return
      const key = event.key.toLowerCase()
      if (key === 'r') {
        const controls = controlsRef.current
        camera.position.copy(START_POSITION)
        if (controls) {
          controls.target.copy(START_TARGET)
          controls.update()
        }
        return
      }
      if (key === 'w' || key === 'a' || key === 's' || key === 'd') keysRef.current.add(key)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key.toLowerCase())
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    const keys = keysRef.current
    return () => {
      keys.clear()
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [enabled, camera, controlsRef])

  useFrame((_, delta) => {
    if (!enabled) return
    const keys = keysRef.current
    if (keys.size === 0) return
    const controls = controlsRef.current
    if (!controls) return

    // Ground-plane forward/right derived from the camera's CURRENT look
    // direction (not a tracked yaw, unlike FreeCameraControls — OrbitControls
    // owns orientation itself), flattened to Y=0 so panning slides the
    // anchor across the board rather than tilting it up/down. Same
    // forward-cross-up sign convention FreeCameraControls' own comment
    // already worked out (the flipped version is camera-left, not right).
    const forward = camera.getWorldDirection(scratchForward)
    forward.y = 0
    forward.normalize()
    const right = scratchRight.set(-forward.z, 0, forward.x)

    const move = scratchMove.set(0, 0, 0)
    if (keys.has('w')) move.add(forward)
    if (keys.has('s')) move.sub(forward)
    if (keys.has('d')) move.add(right)
    if (keys.has('a')) move.sub(right)
    if (move.lengthSq() === 0) return
    move.normalize().multiplyScalar(PAN_SPEED * delta)

    camera.position.add(move)
    controls.target.add(move)
    controls.update()
  })

  return null
}
