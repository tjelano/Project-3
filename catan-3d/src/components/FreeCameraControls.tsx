import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// Units/sec — tuned against OrbitControls' own min/maxDistance (6-24ish),
// so a full traverse of the board at default speed takes a few seconds,
// not an instant snap or a crawl.
const MOVE_SPEED = 8
const VERTICAL_SPEED = 6
// Radians per pixel of mouse movement while pointer-locked.
const MOUSE_SENSITIVITY = 0.0025
// Just under straight up/down — avoids the look direction flipping
// through the pole (gimbal flip) at exactly +-90 degrees pitch.
const MAX_PITCH = Math.PI / 2 - 0.01

// Matches the Canvas's own initial `camera` prop in App.tsx and
// OrbitControls' `target` — R resets back to exactly this pose, not
// wherever OrbitControls last left the camera.
const START_POSITION = new THREE.Vector3(0, 9, 7)
const START_TARGET = new THREE.Vector3(0, 0, 0)

function yawPitchFromDirection(direction: THREE.Vector3) {
  return {
    yaw: Math.atan2(-direction.x, -direction.z),
    pitch: Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1)),
  }
}

/**
 * Opt-in fly-camera, toggled with F — WASD moves relative to look
 * direction (yaw only, so looking up/down doesn't fly you into the board
 * or the sky), Space/Shift move straight up/down in world space, mouse
 * looks around via the Pointer Lock API, R snaps back to START_POSITION.
 * Mounted once inside the Canvas alongside OrbitControls; App.tsx disables
 * OrbitControls (`enabled={!isActive}`) via onActiveChange so the two
 * never fight over the same mouse input.
 */
export function FreeCameraControls({ onActiveChange }: { onActiveChange?: (active: boolean) => void }) {
  const { camera, gl } = useThree()
  const activeRef = useRef(false)
  const keysRef = useRef<Set<string>>(new Set())
  const yawRef = useRef(0)
  const pitchRef = useRef(0)

  useEffect(() => {
    const { yaw, pitch } = yawPitchFromDirection(new THREE.Vector3().subVectors(START_TARGET, START_POSITION).normalize())
    yawRef.current = yaw
    pitchRef.current = pitch
  }, [])

  useEffect(() => {
    const canvasEl = gl.domElement

    const setActive = (next: boolean) => {
      if (activeRef.current === next) return
      activeRef.current = next
      onActiveChange?.(next)
      if (next) {
        canvasEl.requestPointerLock()
      } else {
        keysRef.current.clear()
        if (document.pointerLockElement === canvasEl) document.exitPointerLock()
      }
    }

    const resetCamera = () => {
      camera.position.copy(START_POSITION)
      const { yaw, pitch } = yawPitchFromDirection(new THREE.Vector3().subVectors(START_TARGET, START_POSITION).normalize())
      yawRef.current = yaw
      pitchRef.current = pitch
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Never hijack typing in a text field (lobby name fields, an
      // in-match chat box, etc.) — this listener is global (window), not
      // scoped to the canvas, since F has to work to ENTER free-cam mode
      // too, before the canvas itself has any special focus.
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return

      if (event.key.toLowerCase() === 'f' && !event.repeat) {
        setActive(!activeRef.current)
        return
      }
      if (!activeRef.current) return
      if (event.key.toLowerCase() === 'r') {
        resetCamera()
        return
      }
      keysRef.current.add(event.key.toLowerCase())
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key.toLowerCase())
    }
    const handleMouseMove = (event: MouseEvent) => {
      if (!activeRef.current || document.pointerLockElement !== canvasEl) return
      yawRef.current -= event.movementX * MOUSE_SENSITIVITY
      pitchRef.current = THREE.MathUtils.clamp(pitchRef.current - event.movementY * MOUSE_SENSITIVITY, -MAX_PITCH, MAX_PITCH)
    }
    // The browser releases pointer lock on its own on Escape (and on
    // alt-tab, etc.) without going through setActive — without this,
    // free-cam mode would stay "on" internally (WASD/R still doing
    // things) with no visible cursor feedback that it's even active.
    const handlePointerLockChange = () => {
      if (activeRef.current && document.pointerLockElement !== canvasEl) {
        activeRef.current = false
        keysRef.current.clear()
        onActiveChange?.(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('pointerlockchange', handlePointerLockChange)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('pointerlockchange', handlePointerLockChange)
    }
  }, [camera, gl, onActiveChange])

  useFrame((_, delta) => {
    if (!activeRef.current) return

    camera.quaternion.setFromEuler(new THREE.Euler(pitchRef.current, yawRef.current, 0, 'YXZ'))

    const keys = keysRef.current
    const forward = new THREE.Vector3(-Math.sin(yawRef.current), 0, -Math.cos(yawRef.current))
    const right = new THREE.Vector3(forward.z, 0, -forward.x)
    const move = new THREE.Vector3()
    if (keys.has('w')) move.add(forward)
    if (keys.has('s')) move.sub(forward)
    if (keys.has('d')) move.add(right)
    if (keys.has('a')) move.sub(right)
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(MOVE_SPEED * delta)
    if (keys.has(' ')) move.y += VERTICAL_SPEED * delta
    if (keys.has('shift')) move.y -= VERTICAL_SPEED * delta

    camera.position.add(move)
  })

  return null
}
