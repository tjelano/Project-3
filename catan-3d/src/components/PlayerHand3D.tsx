import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import {
  DEV_CARD_ORDER,
  DEV_CARD_PLAY_LABELS,
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
import brickArt from '../assets/cards/Brick_resource.png'
import grainArt from '../assets/cards/Grain_resource.png'
import lumberArt from '../assets/cards/Lumber_resource.png'
import oreArt from '../assets/cards/Ore_resource.png'
import woolArt from '../assets/cards/Wool_resource.png'
import knightArt from '../assets/cards/Knight_development.png'
import monopolyArt from '../assets/cards/Monopoly_development.png'
import roadBuildingArt from '../assets/cards/Road_Building_development.png'
import victoryPointArt from '../assets/cards/Victory_Point_development.png'
import yearOfPlentyArt from '../assets/cards/Year_of_Plenty_development.png'
import backArt from '../assets/cards/backside_design.png'

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

// The background-removal crop wasn't pixel-tight — a residual band of
// fully transparent padding surrounds the actual card shape inside every
// one of these images. Measured directly off the real alpha channel (not
// eyeballed): on a 432x578 canvas, ~47-48px on the left/right, ~43-46px on
// top, ~39-41px on the bottom, consistent across every card except Year of
// Plenty (tighter at 36/39/31) — so these numbers, padded a little for
// safety, cover all eleven images without cutting into any card's real
// content. With alphaTest cutting fully-transparent pixels away entirely,
// that padding doesn't render as a border AT the card's edge — it renders
// as a gap of nothing floating well outside it, since the mesh face is
// sized to the image's full bounds. Cropping the UVs in past the padding
// is what actually removes the gap, without needing to re-export the
// source art tighter. Asymmetric on Y because the measured top/bottom
// margins aren't equal (and texture V=0 is the image's BOTTOM edge, so the
// crop fractions below are swapped relative to the top/bottom pixel
// margins they correspond to).
const CARD_ART_CROP_X = 328 / 432 // 52px margin each side
const CARD_ART_OFFSET_X = 52 / 432
const CARD_ART_CROP_Y = 483 / 578 // 50px top margin, 45px bottom margin
const CARD_ART_OFFSET_Y = 45 / 578

function loadCardTexture(url: string): THREE.Texture {
  const cached = textureCache.get(url)
  if (cached) return cached
  const texture = loader.load(url)
  // Art is authored in sRGB; without this three treats it as linear and the
  // cards render washed out and pale.
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  texture.repeat.set(CARD_ART_CROP_X, CARD_ART_CROP_Y)
  texture.offset.set(CARD_ART_OFFSET_X, CARD_ART_OFFSET_Y)
  // premultiplyAlpha fixes a SEPARATE, smaller issue at the card's own
  // rounded-corner cutout edge (inside the crop above): background-removal
  // leaves a thin semi-transparent fringe there whose RGB still carries a
  // trace of the original background colour even near-zero alpha.
  // Mipmapping averages that straight-alpha fringe with its neighbours at
  // lower detail levels and bleeds the colour in; weighting RGB by alpha
  // before the GPU builds those mips means a near-transparent pixel
  // contributes almost nothing to the average instead.
  texture.premultiplyAlpha = true
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

// Card stock. Width is derived from the source art's 432x578 (tightly
// cropped to the card's own silhouette, transparent background removed) so
// the illustrations are never stretched.
const CARD_H = 0.42
const CARD_ASPECT = 432 / 578
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

// Tactical hover-zoom: a PLAYABLE dev card's hover response is deliberately
// much larger than a resource card's — the point isn't just to recognize
// it, it's to actually read its rules text before deciding to click. Same
// hover -> click mechanism as always (no separate "zoomed" state), just a
// bigger target for the existing lerp: lifted well clear of the fan and
// scaled way up. The SCALE alone is what makes it readable — DEV_HOVER_Z
// is deliberately small (not the dramatic pull-toward-the-lens an earlier
// pass tried), since stacking a big Z pull on top of a big scale compounds
// into a card that reads as "way too zoomed in" rather than just "held up
// closer." tiltX is deliberately 0, NOT a tilt-back — cards are already
// authored face-on to the camera at rest in this camera-space rig (the
// group's own JSX rotation is only ever [0, 0, rotZ]), so any nonzero X
// tilt here doesn't "flatten" it, it tips it AWAY from flat and exposes a
// sliver of the card's thin edge material (the pale cardboard-stock color
// on the box's side faces) along one side. Truly flat (tiltX = 0, and
// rotZ zeroed too, cancelling the fan's own spread-tilt) is what actually
// keeps the edge hidden AND squares the card dead-on.
const DEV_HOVER_LIFT = 0.75
const DEV_HOVER_Z = 0.25
const DEV_HOVER_TILT_X = 0
const DEV_HOVER_SCALE = 2.2

// Click-to-play: where an activated dev card animates TO, in the same
// camera-space coordinates as the fan itself — closer to the lens and
// centred, reading as "held up to be played." Position is driven by
// progress directly (not the exponential lerp the idle hover uses above),
// since this is a one-shot animation with a real start and end rather than
// a continuously-retargeted response to a live input.
const PLAY_TARGET_X = 0
const PLAY_TARGET_Y = 0.22
const PLAY_TARGET_Z = -1.05
const PLAY_SCALE = 1.35
const PLAY_DURATION = 0.5 // seconds — slide + 180 degree flip
const PLAYABLE_IDLE_GLOW = 0.16

// Discard selection (7-roll, over the limit): flagged resource cards lift
// clear of the fan and grow a pulsating red outline, so a selection reads
// unambiguously even in a crowded hand.
const SELECTED_LIFT = 0.16
const SELECTED_OUTLINE_SCALE = 1.14
const SELECTED_PULSE_SPEED = 4.5
const SELECTED_PULSE_MIN = 0.35
const SELECTED_PULSE_RANGE = 0.35

interface CardSlot {
  id: string
  key: CardKey
}

// One card object per physical card held. Resources first in fixed order,
// then development cards, so a hand doesn't reshuffle as counts change — a
// card you were about to hover shouldn't jump out from under the cursor.
function buildCardSlots(resources: Resources, devCards: DevCardType[]): CardSlot[] {
  const out: CardSlot[] = []
  for (const resource of RESOURCE_ORDER) {
    for (let i = 0; i < resources[resource]; i++) out.push({ id: `${resource}-${i}`, key: resource })
  }
  for (const dev of DEV_CARD_ORDER) {
    const count = devCards.filter((card) => card === dev).length
    for (let i = 0; i < count; i++) out.push({ id: `${dev}-${i}`, key: dev })
  }
  return out
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
  isOpponent = false,
  playable = false,
  onPlay,
  selected = false,
  onToggleSelect,
  layoutOverride,
}: {
  cardKey: CardKey
  index: number
  total: number
  backTexture: THREE.Texture
  // Table-seat holders use a straight row (see straightLayoutFor) instead
  // of the fanned-hand arc computed below — passed in fully-formed rather
  // than another mode flag, since the caller already knows which scheme it
  // wants.
  layoutOverride?: CardLayout
  // Authoritative texture gating: true for every hand except the local
  // player's own. The real cardKey is still used for layout/count — only
  // the material swaps — so an opponent's hand SIZE stays honest (public
  // information in Catan) while its CONTENTS never touch a real texture,
  // on any face, from any angle a spun camera could catch.
  isOpponent?: boolean
  // True only for a legally-playable dev card in the LOCAL player's own
  // hand — resource cards, Victory Points, and every opponent card are
  // never clickable.
  playable?: boolean
  onPlay?: () => void
  // Flagged for discard during a 7-roll's over-limit phase.
  selected?: boolean
  // Present only for a resource card while a discard is actually active on
  // this screen — mutually exclusive with onPlay, since dev cards can't be
  // discarded and playing/discarding are never both live at once (they're
  // gated on different gamePhases).
  onToggleSelect?: () => void
}) {
  const ref = useRef<THREE.Group>(null)
  // The big tactical zoom is a SEPARATE floating copy, not the card in your
  // hand moving — hovering a Knight shouldn't leave a gap in the fan where
  // it used to be. Always mounted (while playable) rather than conditional
  // on `hovered`, collapsed to a speck via scale when idle: a continuous
  // lerp toward "collapsed" or "zoomed" handles both grow-in and shrink-
  // back-out symmetrically, with no separate exit-animation/unmount timing
  // to coordinate.
  const previewRef = useRef<THREE.Group>(null)
  const [hovered, setHovered] = useState(false)
  const glowRef = useRef(0)
  const outlineMaterialRef = useRef<THREE.MeshBasicMaterial | null>(null)
  // A ref, not a direct index into the memoized `materials` array — mutating
  // a value straight off a useMemo return is flagged (react-hooks/
  // immutability) even though animating a Three.js material's own property
  // every frame is exactly the imperative pattern R3F's useFrame exists
  // for. Routing the same mutation through a ref satisfies both: the
  // material itself is still touched imperatively at 60fps, with no React
  // state and no re-render, while the value that's actually MUTATED is a
  // ref's .current — React's own sanctioned mutable escape hatch.
  const glowMaterialRef = useRef<THREE.MeshStandardMaterial | null>(null)

  // Click-to-play animation state. progress is null while idle; once a
  // click arms it, useFrame takes over the group's transform completely
  // (skipping the hover lerp below) until it reaches 1, animating from
  // wherever the card actually was at the moment of the click — not from
  // its resting fan position — so a card that was mid-hover-lift doesn't
  // visibly snap before flying off.
  const playProgressRef = useRef<number | null>(null)
  const playStartRef = useRef<{ x: number; y: number; z: number; rotX: number; rotY: number; rotZ: number } | null>(
    null,
  )
  const playFiredRef = useRef(false)

  const layout = useMemo(() => layoutOverride ?? layoutFor(index, total), [layoutOverride, index, total])

  // Materials are per-card instances (sharing only the cached textures) so
  // the hover glow lights ONE card rather than every card of that type.
  const materials = useMemo(() => {
    // The art has real alpha now (background-removed PNGs, rounded card
    // silhouette) — alphaTest cuts fully-transparent pixels out of the
    // rendered shape entirely, rather than blending them. Deliberately NOT
    // `transparent: true`: that blends and requires depth-sorting, which
    // is exactly the "invisible geometry still writes depth and produces a
    // seam" pitfall already hit once this session (the discard-selection
    // outline). A cutout keeps normal opaque depth writes for every pixel
    // that survives the test, so there's nothing to sort.
    const back = new THREE.MeshStandardMaterial({
      map: backTexture,
      roughness: 0.5,
      metalness: 0.08,
      // Higher than the usual 0.5 cutoff, deliberately: the fringe pixels
      // right at the cut edge aren't fully transparent OR fully opaque,
      // they're a blend that still carries a trace of the original
      // background colour in their RGB — passing at alpha 0.5 let those
      // partially-blended pixels render at full opacity, which is what
      // read as a faint border. 0.92 only lets through pixels the removal
      // tool was confident were actually card.
      alphaTest: 0.92,
    })
    // Card edge: the pale core you see on cut card stock.
    const edge = new THREE.MeshStandardMaterial({ color: '#e8e2d2', roughness: 0.6 })
    // BoxGeometry group order: +X, -X, +Y, -Y, +Z, -Z.
    if (isOpponent) {
      // Both the "face" (+Z) and "back" (-Z) slots get the SAME back
      // texture — there is no material index left holding the real
      // artwork, so no viewing angle can ever reveal it.
      return [edge, edge, edge, edge, back, back]
    }
    const face = new THREE.MeshStandardMaterial({
      map: loadCardTexture(CARD_ART[cardKey]),
      roughness: 0.42,
      metalness: 0.05,
      emissive: new THREE.Color('#c8a93e'),
      emissiveIntensity: 0,
      // Higher than the usual 0.5 cutoff, deliberately: the fringe pixels
      // right at the cut edge aren't fully transparent OR fully opaque,
      // they're a blend that still carries a trace of the original
      // background colour in their RGB — passing at alpha 0.5 let those
      // partially-blended pixels render at full opacity, which is what
      // read as a faint border. 0.92 only lets through pixels the removal
      // tool was confident were actually card.
      alphaTest: 0.92,
    })
    return [edge, edge, edge, edge, face, back]
  }, [cardKey, backTexture, isOpponent])

  useEffect(() => {
    glowMaterialRef.current = materials[4] as THREE.MeshStandardMaterial
  }, [materials])

  useFrame((state, delta) => {
    const group = ref.current
    if (!group) return

    if (playProgressRef.current != null) {
      const start = playStartRef.current
      if (!start) return
      playProgressRef.current = Math.min(1, playProgressRef.current + delta / PLAY_DURATION)
      const p = playProgressRef.current
      const eased = 1 - Math.pow(1 - p, 3) // ease-out cubic: quick departure, gentle arrival

      group.position.x = start.x + (PLAY_TARGET_X - start.x) * eased
      group.position.y = start.y + (PLAY_TARGET_Y - start.y) * eased
      group.position.z = start.z + (PLAY_TARGET_Z - start.z) * eased
      group.rotation.x = start.rotX * (1 - eased)
      group.rotation.z = start.rotZ * (1 - eased)
      // The flip: a full 180 degree spin on the vertical axis as it travels.
      group.rotation.y = start.rotY + Math.PI * eased
      group.scale.setScalar(1 + (PLAY_SCALE - 1) * eased)

      if (p >= 1 && !playFiredRef.current) {
        playFiredRef.current = true
        onPlay?.()
      }
      // The card itself is now the thing flying/flipping toward the play
      // target — the zoom preview (if it was showing) collapses instantly
      // rather than lerping, since attention has already shifted to the
      // base card's own animation.
      previewRef.current?.scale.setScalar(0.001)
      return
    }

    // Frame-rate independent easing: the same visual response at 30 or 144fps.
    const k = 1 - Math.exp(-LERP_RATE * delta)

    // The card in your hand always gets just the ordinary modest hover
    // lift — dev or resource, doesn't matter. The big tactical zoom for a
    // playable dev card is the SEPARATE preview updated below; the card's
    // own fan position never moves for it, so the hand never looks like
    // it's missing a card just because you're reading one.
    const targetY = layout.y + (hovered ? HOVER_LIFT : 0) + (selected ? SELECTED_LIFT : 0)
    const targetZ = layout.z + (hovered ? 0.09 : 0)
    const targetTilt = hovered ? HOVER_TILT : 0
    const targetScale = hovered ? HOVER_SCALE : 1
    // A faint glow on every playable card even at rest — the "this is
    // clickable" affordance, since there's no cursor change to lean on in
    // a 3D scene the way a 2D button gets one for free.
    const targetGlow = hovered ? HOVER_GLOW : playable ? PLAYABLE_IDLE_GLOW : 0

    group.position.x += (layout.x - group.position.x) * k
    group.position.y += (targetY - group.position.y) * k
    group.position.z += (targetZ - group.position.z) * k
    group.rotation.x += (targetTilt - group.rotation.x) * k
    group.rotation.z += (layout.rotZ - group.rotation.z) * k
    const s = group.scale.x + (targetScale - group.scale.x) * k
    group.scale.setScalar(s)

    glowRef.current += (targetGlow - glowRef.current) * k
    if (glowMaterialRef.current) glowMaterialRef.current.emissiveIntensity = glowRef.current

    if (outlineMaterialRef.current) {
      const pulse = SELECTED_PULSE_MIN + SELECTED_PULSE_RANGE * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * SELECTED_PULSE_SPEED))
      outlineMaterialRef.current.opacity = selected ? pulse : 0
    }

    // Tactical zoom preview: grows out of the hand toward DEV_HOVER_* when
    // this card is hovered and playable, collapses back to a speck
    // otherwise. Always facing the camera dead-on (no tilt, no fan-spread
    // roll), regardless of where this card sits in the fan.
    if (previewRef.current) {
      const preview = previewRef.current
      const devZoom = hovered && playable
      const previewTargetY = devZoom ? layout.y + DEV_HOVER_LIFT : layout.y
      const previewTargetZ = devZoom ? layout.z + DEV_HOVER_Z : layout.z
      const previewTargetScale = devZoom ? DEV_HOVER_SCALE : 0.001

      preview.position.x += (layout.x - preview.position.x) * k
      preview.position.y += (previewTargetY - preview.position.y) * k
      preview.position.z += (previewTargetZ - preview.position.z) * k
      preview.rotation.x += (DEV_HOVER_TILT_X - preview.rotation.x) * k
      preview.rotation.z += (0 - preview.rotation.z) * k
      const ps = preview.scale.x + (previewTargetScale - preview.scale.x) * k
      preview.scale.setScalar(ps)
    }
  })

  return (
    <>
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
        onClick={(event: ThreeEvent<MouseEvent>) => {
          if (onToggleSelect) {
            event.stopPropagation()
            onToggleSelect()
            return
          }
          if (!playable || !onPlay || playProgressRef.current != null) return
          event.stopPropagation()
          const group = ref.current
          if (!group) return
          playStartRef.current = {
            x: group.position.x,
            y: group.position.y,
            z: group.position.z,
            rotX: group.rotation.x,
            rotY: group.rotation.y,
            rotZ: group.rotation.z,
          }
          playFiredRef.current = false
          playProgressRef.current = 0
        }}
      >
        <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
      </mesh>
      {/* Discard-selection outline: a slightly larger backface-only shell,
          permanently present (so the ref survives selection toggling) but
          only opaque while selected — pulsed via outlineMaterialRef in
          useFrame above. Excluded from raycasting so it never shadows the
          real card's own click/hover handlers. */}
      <mesh scale={SELECTED_OUTLINE_SCALE} raycast={() => null}>
        <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
        <meshBasicMaterial
          ref={outlineMaterialRef}
          color="#e5484d"
          side={THREE.BackSide}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
    {playable && onPlay && (
      // The zoom preview — a second, independent copy of the same card
      // (shares the `materials` array with the one above, so texture and
      // glow stay in sync). Non-interactive: the small card in the hand
      // above remains the one true hitbox for hover/click throughout, so
      // there's no dual hit-testing to reconcile between the two copies.
      <group ref={previewRef} position={[layout.x, layout.y, layout.z]} scale={0.001}>
        <mesh material={materials} raycast={() => null}>
          <boxGeometry args={[CARD_W, CARD_H, CARD_T]} />
        </mesh>
      </group>
    )}
    </>
  )
}

export function PlayerHand3D({
  resources,
  devCards,
  devCardsBoughtThisTurn,
  canPlayDevCards,
  onPlayDevCard,
  discardActive,
  discardSelection,
  onToggleDiscard,
}: {
  resources: Resources
  devCards: DevCardType[]
  // A card bought THIS turn can't be played yet — mirrors the same rule
  // App.tsx's playableDevCardCount enforces for the 2D sidebar buttons.
  devCardsBoughtThisTurn?: DevCardType[]
  canPlayDevCards?: boolean
  onPlayDevCard?: (type: DevCardType) => void
  // True only while THIS player is the one currently owed a discard (a
  // 7-roll caught them over 7 cards) — makes their resource cards (never
  // dev cards) clickable to flag for discard instead of playable.
  discardActive?: boolean
  discardSelection?: string[]
  onToggleDiscard?: (cardId: string) => void
}) {
  const rootRef = useRef<THREE.Group>(null)
  const backTexture = useMemo(() => loadCardTexture(backArt), [])

  const cards = useMemo(() => buildCardSlots(resources, devCards), [resources, devCards])

  // Which specific card instances (by id) are legal to click right now.
  // Instance identity doesn't matter beyond count — any two Knights are
  // interchangeable — so this just marks the first (total - bought) copies
  // of each playable type as clickable and leaves the rest inert.
  const playableIds = useMemo(() => {
    if (!canPlayDevCards) return new Set<string>()
    const remaining = new Map<DevCardType, number>()
    for (const type of Object.keys(DEV_CARD_PLAY_LABELS) as DevCardType[]) {
      const total = devCards.filter((c) => c === type).length
      const bought = (devCardsBoughtThisTurn ?? []).filter((c) => c === type).length
      remaining.set(type, Math.max(0, total - bought))
    }
    const ids = new Set<string>()
    for (const card of cards) {
      const left = remaining.get(card.key as DevCardType)
      if (left) {
        ids.add(card.id)
        remaining.set(card.key as DevCardType, left - 1)
      }
    }
    return ids
  }, [cards, devCards, devCardsBoughtThisTurn, canPlayDevCards])

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
      {cards.map((card, i) => {
        const isResourceCard = (RESOURCE_ORDER as readonly CardKey[]).includes(card.key)
        return (
          <HandCard
            key={card.id}
            cardKey={card.key}
            index={i}
            total={cards.length}
            backTexture={backTexture}
            playable={playableIds.has(card.id)}
            onPlay={() => onPlayDevCard?.(card.key as DevCardType)}
            selected={!!discardSelection?.includes(card.id)}
            onToggleSelect={discardActive && isResourceCard ? () => onToggleDiscard?.(card.id) : undefined}
          />
        )
      })}
    </group>
  )
}
