import { useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import {
  DEV_CARD_ORDER,
  RESOURCE_ORDER,
  type DevCardType,
  type ResourceType,
  type Resources,
} from '../game/types'

// --- Card art -------------------------------------------------------------
// Imported statically rather than fetched by path string. Vite resolves each
// of these at BUILD time, hashes it, and — critically — fails the build if a
// file is missing or misnamed. A runtime path would instead 404 silently and
// leave a black card, which is exactly the failure you don't want to discover
// in the browser.
import brickArt from '../assets/cards/Brick_resource.jpeg'
import grainArt from '../assets/cards/Grain_resource.jpeg'
import lumberArt from '../assets/cards/Lumber_resource.jpeg'
import oreArt from '../assets/cards/Ore_resource.jpeg'
import woolArt from '../assets/cards/Wool_resource.jpeg'
import knightArt from '../assets/cards/Knight_development.jpeg'
import monopolyArt from '../assets/cards/Monopoly_development.jpeg'
import roadBuildingArt from '../assets/cards/Road_Building_development.jpeg'
import victoryPointArt from '../assets/cards/Victory_Point_development.jpeg'
import yearOfPlentyArt from '../assets/cards/Year_of_Plenty_development.jpeg'
import backArt from '../assets/cards/backside_design.jpeg'

type CardKey = ResourceType | DevCardType

const CARD_ART: Record<CardKey, string> = {
  lumber: lumberArt,
  brick: brickArt,
  wool: woolArt,
  grain: grainArt,
  ore: oreArt,
  knight: knightArt,
  victoryPoint: victoryPointArt,
  roadBuilding: roadBuildingArt,
  yearOfPlenty: yearOfPlentyArt,
  monopoly: monopolyArt,
}

// One loader and one cache for the whole app: eleven images shared across
// however many cards are in hand, decoded once each.
const loader = new THREE.TextureLoader()
const textureCache = new Map<string, THREE.Texture>()

function loadCardTexture(url: string): THREE.Texture {
  const cached = textureCache.get(url)
  if (cached) return cached
  const texture = loader.load(url)
  // Art is authored in sRGB; without this three treats it as linear and the
  // cards render washed out and pale.
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  textureCache.set(url, texture)
  return texture
}

/**
 * A physical hand of cards, held at the bottom of the viewport.
 *
 * Anchoring: rather than portalling into the camera (whose scene-graph
 * membership varies between R3F versions), the root group copies the
 * camera's position and quaternion every frame. Children are then authored
 * in CAMERA space — x right, y up, -z forward — so the fan stays pinned to
 * the bottom of the screen no matter how the board is orbited, while still
 * being a real object that raycasts and lights normally.
 */

// Card stock. Width is derived from the source art's 896x1200 so the
// illustrations are never stretched.
const CARD_H = 0.42
const CARD_ASPECT = 896 / 1200
const CARD_W = CARD_H * CARD_ASPECT
const CARD_T = 0.007

// Distance in front of the camera. With fov 50 this puts ~2.05 units of
// world height on screen, so a 0.42 card reads at about a fifth of the
// viewport — a hand you can read without it swallowing the board.
const HAND_Z = -2.2
const HAND_Y = -0.9

// Fan shape.
const MAX_SPAN = 2.0 // total width the fan may occupy
const MAX_SPACING = 0.17 // gap between adjacent cards when there are few
const MAX_SPREAD = 0.62 // total rotation across the fan, radians
const ARC_DEPTH = 0.055 // how far the outer cards dip below the centre

// Hover response.
const HOVER_LIFT = 0.1
const HOVER_TILT = -0.3
const HOVER_SCALE = 1.14
const HOVER_GLOW = 0.5
const LERP_RATE = 12 // higher = snappier; frame-rate corrected below

interface CardSlot {
  id: string
  key: CardKey
}

interface CardLayout {
  x: number
  y: number
  z: number
  rotZ: number
}

function layoutFor(index: number, total: number): CardLayout {
  // t runs -0.5 … +0.5 across the hand, 0 for a single card.
  const t = total > 1 ? index / (total - 1) - 0.5 : 0
  const spacing = Math.min(MAX_SPACING, MAX_SPAN / Math.max(total - 1, 1))
  return {
    x: t * spacing * (total - 1),
    // Outer cards dip, following the arc a real fanned hand makes.
    y: HAND_Y - Math.pow(Math.abs(t) * 2, 2) * ARC_DEPTH,
    // Each card sits a hair in front of the previous so the overlap order
    // is unambiguous and z-fighting is impossible.
    z: HAND_Z + index * 0.0016,
    rotZ: -t * MAX_SPREAD,
  }
}

function HandCard({
  cardKey,
  index,
  total,
  backTexture,
}: {
  cardKey: CardKey
  index: number
  total: number
  backTexture: THREE.Texture
}) {
  const ref = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const glowRef = useRef(0)

  const layout = useMemo(() => layoutFor(index, total), [index, total])

  // Materials are per-card instances (sharing only the cached textures) so
  // the hover glow lights ONE card rather than every card of that type.
  const materials = useMemo(() => {
    const face = new THREE.MeshStandardMaterial({
      map: loadCardTexture(CARD_ART[cardKey]),
      roughness: 0.42,
      metalness: 0.05,
      emissive: new THREE.Color('#c8a93e'),
      emissiveIntensity: 0,
    })
    const back = new THREE.MeshStandardMaterial({
      map: backTexture,
      roughness: 0.5,
      metalness: 0.08,
    })
    // Card edge: the pale core you see on cut card stock.
    const edge = new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.6 })
    // BoxGeometry group order: +X, -X, +Y, -Y, +Z, -Z.
    return [edge, edge, edge, edge, face, back]
  }, [cardKey, backTexture])

  useFrame((_, delta) => {
    const group = ref.current
    if (!group) return
    // Frame-rate independent easing: the same visual response at 30 or 144fps.
    const k = 1 - Math.exp(-LERP_RATE * delta)

    const targetY = layout.y + (hovered ? HOVER_LIFT : 0)
    const targetZ = layout.z + (hovered ? 0.09 : 0)
    const targetTilt = hovered ? HOVER_TILT : 0
    const targetScale = hovered ? HOVER_SCALE : 1
    const targetGlow = hovered ? HOVER_GLOW : 0

    group.position.x += (layout.x - group.position.x) * k
    group.position.y += (targetY - group.position.y) * k
    group.position.z += (targetZ - group.position.z) * k
    group.rotation.x += (targetTilt - group.rotation.x) * k
    group.rotation.z += (layout.rotZ - group.rotation.z) * k
    const s = group.scale.x + (targetScale - group.scale.x) * k
    group.scale.setScalar(s)

    glowRef.current += (targetGlow - glowRef.current) * k
    ;(materials[4] as THREE.MeshStandardMaterial).emissiveIntensity = glowRef.current
  })

  return (
    <group ref={ref} position={[layout.x, layout.y, layout.z]} rotation={[0, 0, layout.rotZ]}>
      <mesh
        material={materials}
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(false)
        }}
      >
        <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
      </mesh>
    </group>
  )
}

export function PlayerHand3D({ resources, devCards }: { resources: Resources; devCards: DevCardType[] }) {
  const rootRef = useRef<THREE.Group>(null)
  const backTexture = useMemo(() => loadCardTexture(backArt), [])

  // One card object per physical card held. Resources first in fixed order,
  // then development cards, so the hand doesn't reshuffle as counts change —
  // a card you were about to hover shouldn't jump out from under the cursor.
  const cards = useMemo<CardSlot[]>(() => {
    const out: CardSlot[] = []
    for (const resource of RESOURCE_ORDER) {
      for (let i = 0; i < resources[resource]; i++) out.push({ id: `${resource}-${i}`, key: resource })
    }
    for (const dev of DEV_CARD_ORDER) {
      const count = devCards.filter((card) => card === dev).length
      for (let i = 0; i < count; i++) out.push({ id: `${dev}-${i}`, key: dev })
    }
    return out
  }, [resources, devCards])

  useFrame(({ camera }) => {
    const root = rootRef.current
    if (!root) return
    // Ride the camera exactly, so the hand is fixed to the viewport.
    root.position.copy(camera.position)
    root.quaternion.copy(camera.quaternion)
  })

  if (cards.length === 0) return null

  return (
    <group ref={rootRef}>
      {/* Soft warm bounce so the card faces stay readable even when the board
          lighting is angled away from the viewer. */}
      <pointLight position={[0, HAND_Y + 0.5, HAND_Z + 0.9]} intensity={2.4} distance={3} color="#ffeed2" />
      {cards.map((card, i) => (
        <HandCard key={card.id} cardKey={card.key} index={i} total={cards.length} backTexture={backTexture} />
      ))}
    </group>
  )
}
