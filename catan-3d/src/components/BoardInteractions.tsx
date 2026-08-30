import { useLayoutEffect, useMemo, useRef, useState, memo, type ReactNode } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_HEIGHT, STRUCTURE_ELEVATION, TILE_OVERLAY_ELEVATION_SEA } from '../data/hexBoard'
import type { BoardEdge, BoardGraph, BoardVertex } from '../data/boardGraph'
import {
  IMPROVEMENT_TRACK_ORDER,
  PLAYER_COLORS,
  type Building,
  type ImprovementTrack,
  type Player,
  type PlayerColorToken,
} from '../game/types'
import { CityModel, RoadModel, ShipModel, SettlementModel } from './GamePieces'
import type { HoverChangedPayload } from '../multiplayer/useRoomChannel'

// What a vertex/edge slot reports on hover — vertexId/edgeId are mutually
// exclusive, both null means "no longer hovering anything".
type HoverTarget = Pick<HoverChangedPayload, 'vertexId' | 'edgeId'>

const VERTEX_HITBOX_RADIUS = 0.16
const EDGE_HITBOX_WIDTH = 0.16
const EDGE_HITBOX_HEIGHT = 0.14
// Shrink edge hitboxes so they don't reach all the way to the vertex
// hitboxes at either end — keeps hover/click targets from overlapping.
const EDGE_LENGTH_SCALE = 0.82

// City wall placeholder — a stone-colored ring standing up around the city
// model's base, per this plan's Global Constraints (placeholder art before
// commissioned art). Bumped taller/bluer than the original placeholder,
// which sat mostly buried below the base (offset -HEIGHT/2, so only a
// ~2.5cm-equivalent sliver poked above ground) and read as invisible from
// a normal camera angle — a real, reported bug, not a design choice.
const CITY_WALL_COLOR = '#7d8fa3'
const CITY_WALL_RADIUS = 0.26
const CITY_WALL_HEIGHT = 0.16

const SETTLEMENT_GLOW = '#7fe7ff'
const ROAD_GLOW = '#ffd27f'
const SHIP_GLOW = '#7fe7ff'
// A ship sits over water, not land — TILE_HEIGHT/2 + STRUCTURE_ELEVATION
// (every other piece's height) is calibrated against the tallest LAND
// biome and would float a ship well above the real water surface. A small
// lift above TILE_OVERLAY_ELEVATION_SEA (the water surface's own measured
// height) keeps it looking like it's actually floating.
const SHIP_ELEVATION = TILE_OVERLAY_ELEVATION_SEA + 0.03

// A ghost preview needs SOME piece geometry to borrow — GhostModel below
// immediately overwrites every mesh's material with the shared hologram
// tint, so which colour variant supplies that geometry is irrelevant (all
// six are identical meshes with different roof textures, per GamePieces.tsx).
const GHOST_GEOMETRY_COLOR: PlayerColorToken = 'player-1'

// One shared translucent material per glow colour — a hover happens often
// enough that allocating a fresh material per frame would be wasteful.
const hologramCache = new Map<string, THREE.MeshStandardMaterial>()
function hologramMaterial(color: string): THREE.MeshStandardMaterial {
  const cached = hologramCache.get(color)
  if (cached) return cached
  const created = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.6,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  })
  hologramCache.set(color, created)
  return created
}

// Renders a real GamePieces model (SettlementModel/CityModel/RoadModel) as a
// holographic preview by swapping every one of its meshes' materials for the
// SAME shared hologram instance above. Deliberately NOT done by mutating the
// model's own pre-textured material in place: GamePieces clones its scene
// per instance but useGLTF still caches the SOURCE scene/materials per URL,
// so mutating a mesh's material object directly (rather than reassigning the
// pointer) could bleed into every other piece loaded from that same GLB.
// Traversing and reassigning each mesh's OWN .material pointer instead
// touches nothing shared.
function GhostModel({ color, children }: { color: string; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const material = hologramMaterial(color)
    ref.current?.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = material
        // A hologram shouldn't anchor itself with a normal opaque shadow.
        child.castShadow = false
        child.receiveShadow = false
      }
    })
  }, [color])
  return <group ref={ref}>{children}</group>
}

const VertexSlot = memo(function VertexSlot({
  vertex,
  building,
  ownerColorToken,
  isMetropolis,
  hasWall,
  onBuild,
  locked,
  remoteHighlighted,
  remoteColor,
  onHoverChange,
}: {
  vertex: BoardVertex
  building: Building | undefined
  ownerColorToken: PlayerColorToken | undefined
  isMetropolis: boolean
  hasWall: boolean
  onBuild: (vertexId: string) => void
  locked: boolean
  remoteHighlighted: boolean
  remoteColor: string | undefined
  onHoverChange: (target: HoverTarget) => void
}) {
  const [hovered, setHovered] = useState(false)

  // A settlement or city has already been built here — render it
  // permanently in the owner's color. It stays clickable (a bigger hitbox
  // than the base model) so the owner can click their own settlement to
  // upgrade it into a city.
  if (building) {
    // Falls back to player-1's model only if a building somehow references a
    // playerId not present in `players` — a data-integrity edge case that
    // shouldn't happen, not a real "no owner" state.
    const colorToken = ownerColorToken ?? 'player-1'
    return (
      <group position={[vertex.x, TILE_HEIGHT / 2 + STRUCTURE_ELEVATION, vertex.z]}>
        <mesh
          onClick={
            locked
              ? undefined
              : (event: ThreeEvent<MouseEvent>) => {
                  event.stopPropagation()
                  onBuild(vertex.id)
                }
          }
        >
          <sphereGeometry args={[VERTEX_HITBOX_RADIUS * 1.3, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
        {building.type === 'city' ? (
          <CityModel colorToken={colorToken} isMetropolis={isMetropolis} />
        ) : (
          <SettlementModel colorToken={colorToken} />
        )}
        {hasWall && building.type === 'city' && (
          <mesh position={[0, CITY_WALL_HEIGHT / 2, 0]}>
            <cylinderGeometry args={[CITY_WALL_RADIUS, CITY_WALL_RADIUS, CITY_WALL_HEIGHT, 8, 1, true]} />
            <meshStandardMaterial color={CITY_WALL_COLOR} side={2 /* THREE.DoubleSide */} />
          </mesh>
        )}
      </group>
    )
  }

  return (
    <group position={[vertex.x, TILE_HEIGHT / 2 + STRUCTURE_ELEVATION, vertex.z]}>
      <mesh
        onPointerOver={
          locked
            ? undefined
            : (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation()
                setHovered(true)
                onHoverChange({ vertexId: vertex.id, edgeId: null })
              }
        }
        onPointerOut={
          locked
            ? undefined
            : (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation()
                setHovered(false)
                onHoverChange({ vertexId: null, edgeId: null })
              }
        }
        onClick={
          locked
            ? undefined
            : (event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation()
                onBuild(vertex.id)
              }
        }
      >
        <sphereGeometry args={[VERTEX_HITBOX_RADIUS, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* ghost settlement: the real cottage model, holographic — cyan for
          your own hover, the active player's own color when it's someone
          else's (broadcasts never echo back to their own sender, so these
          two branches never both fire on the same client). */}
      {hovered && (
        <GhostModel color={SETTLEMENT_GLOW}>
          <SettlementModel colorToken={GHOST_GEOMETRY_COLOR} />
        </GhostModel>
      )}
      {remoteHighlighted && (
        <GhostModel color={remoteColor ?? SETTLEMENT_GLOW}>
          <SettlementModel colorToken={GHOST_GEOMETRY_COLOR} />
        </GhostModel>
      )}
    </group>
  )
})

const EdgeSlot = memo(function EdgeSlot({
  edge,
  a,
  b,
  ownerId,
  ownerColorToken,
  isSeaEdge,
  onBuild,
  locked,
  pickerActive,
  remoteHighlighted,
  remoteColor,
  onHoverChange,
}: {
  edge: BoardEdge
  a: BoardVertex
  b: BoardVertex
  ownerId: number | undefined
  ownerColorToken: PlayerColorToken | undefined
  // An edge bordering at least one Sea tile needs a ship instead of a road
  // (CN3083) — App.tsx's seaEdgeIds decides this once per edge, not
  // per-render here, since it needs the board's own tile biomes to answer.
  isSeaEdge: boolean
  onBuild: (edgeId: string) => void
  locked: boolean
  // Cities & Knights Diplomacy — true while the LOCAL viewer has an active
  // road-picker open (App.tsx's pendingDiplomacyRemoval). Ordinary road
  // building never needs to click an ALREADY-BUILT road, so the "owner
  // exists" branch below normally renders with no hitbox at all; this prop
  // re-opens exactly that one hitbox for Diplomacy's pick, reusing the same
  // onBuild callback ordinary road placement already uses rather than a
  // second callback prop. Diplomacy only ever targets a ROAD (CN3087), so
  // this never applies on a sea edge regardless of what pickerActive says.
  pickerActive: boolean
  remoteHighlighted: boolean
  remoteColor: string | undefined
  onHoverChange: (target: HoverTarget) => void
}) {
  const [hovered, setHovered] = useState(false)
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  const angle = Math.atan2(b.x - a.x, b.z - a.z)
  const elevation = isSeaEdge ? SHIP_ELEVATION : TILE_HEIGHT / 2 + STRUCTURE_ELEVATION
  const glowColor = isSeaEdge ? SHIP_GLOW : ROAD_GLOW
  const PieceModel = isSeaEdge ? ShipModel : RoadModel

  // A road/ship has already been built here — render it permanently in the
  // owner's color instead of a hoverable hitbox, UNLESS a Diplomacy pick is
  // active on a LAND edge, in which case it also gets an (invisible)
  // clickable hitbox so App.tsx's buildRoadRaw can route the click to
  // playDiplomacy instead of the ordinary build flow.
  if (ownerId != null) {
    // Same data-integrity-only fallback as VertexSlot above.
    const colorToken = ownerColorToken ?? 'player-1'
    return (
      <group position={[edge.x, elevation, edge.z]} rotation={[0, angle, 0]}>
        <PieceModel colorToken={colorToken} span={length * (EDGE_LENGTH_SCALE - 0.05)} />
        {pickerActive && !isSeaEdge && !locked && (
          <mesh
            onClick={(event: ThreeEvent<MouseEvent>) => {
              event.stopPropagation()
              onBuild(edge.id)
            }}
          >
            <boxGeometry args={[EDGE_HITBOX_WIDTH, EDGE_HITBOX_HEIGHT, length * EDGE_LENGTH_SCALE]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
      </group>
    )
  }

  return (
    <group position={[edge.x, elevation, edge.z]} rotation={[0, angle, 0]}>
      <mesh
        onPointerOver={
          locked
            ? undefined
            : (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation()
                setHovered(true)
                onHoverChange({ vertexId: null, edgeId: edge.id })
              }
        }
        onPointerOut={
          locked
            ? undefined
            : (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation()
                setHovered(false)
                onHoverChange({ vertexId: null, edgeId: null })
              }
        }
        onClick={
          locked
            ? undefined
            : (event: ThreeEvent<MouseEvent>) => {
                event.stopPropagation()
                onBuild(edge.id)
              }
        }
      >
        <boxGeometry args={[EDGE_HITBOX_WIDTH, EDGE_HITBOX_HEIGHT, length * EDGE_LENGTH_SCALE]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {/* ghost road/ship: the real model, holographic — same
          own-hover-vs-active-player-color split as VertexSlot above. */}
      {hovered && (
        <GhostModel color={glowColor}>
          <PieceModel colorToken={GHOST_GEOMETRY_COLOR} span={length * (EDGE_LENGTH_SCALE - 0.05)} />
        </GhostModel>
      )}
      {remoteHighlighted && (
        <GhostModel color={remoteColor ?? glowColor}>
          <PieceModel colorToken={GHOST_GEOMETRY_COLOR} span={length * (EDGE_LENGTH_SCALE - 0.05)} />
        </GhostModel>
      )}
    </group>
  )
})

interface BoardInteractionsProps {
  graph: BoardGraph
  settlements: Record<string, Building>
  roads: Record<string, number>
  players: Player[]
  // Which specific city vertex (if any) is currently flying each track's
  // Metropolis marker — Task 6's App.tsx state, threaded down one more hop
  // so VertexSlot can render the visual on the exact right city.
  metropolisVertexIds: Record<ImprovementTrack, string | null>
  // Cities & Knights City Walls — vertex ids of every city currently
  // carrying a wall. Threaded down one more hop so VertexSlot can render
  // the ring on the exact right city, same shape as metropolisVertexIds
  // just above.
  cityWalls: ReadonlySet<string>
  // CN3083 ships — a separate piece type from roads, restricted to edges
  // bordering the sea (seaEdgeIds below decides which). Both maps use the
  // same "edge id -> owning player id" shape; an edge is only ever a key in
  // ONE of the two, never both.
  ships: Record<string, number>
  // Which edges border at least one Sea tile — App.tsx's own precomputed
  // Set (needs the board's tile biomes, not available here). Decides per
  // edge whether it renders/builds as a ship or a road.
  seaEdgeIds: ReadonlySet<string>
  // Subset of seaEdgeIds that ALSO borders land — the actual coastline,
  // distinct from open ocean (both flanking tiles are sea, no land at
  // all). A coastal edge defaults to a road here — open ocean is the only
  // case that forces a ship.
  coastalEdgeIds: ReadonlySet<string>
  onBuildSettlement: (vertexId: string) => void
  onBuildRoad: (edgeId: string) => void
  onBuildShip: (edgeId: string) => void
  locked?: boolean
  // Cities & Knights Diplomacy — see EdgeSlot's own `pickerActive` comment.
  // Scoped to the LOCAL viewer only (App.tsx passes
  // pendingDiplomacyRemoval?.playerId === localPlayer.id), same "only the
  // acting client's own screen enters picker mode" reasoning TileSwapLayer's
  // `active` prop already uses for Invention.
  roadPickerActive?: boolean
  // The active player's live hover, mirrored from another online client
  // (App.tsx), and the callback that broadcasts THIS client's own hover in
  // the other direction — see the HoverTarget type above.
  remoteHover: HoverChangedPayload
  onHoverChange: (target: HoverTarget) => void
}

export const BoardInteractions = memo(function BoardInteractions({
  graph,
  settlements,
  roads,
  ships,
  seaEdgeIds,
  coastalEdgeIds,
  players,
  metropolisVertexIds,
  cityWalls,
  onBuildSettlement,
  onBuildRoad,
  onBuildShip,
  locked = false,
  roadPickerActive = false,
  remoteHover,
  onHoverChange,
}: BoardInteractionsProps) {
  // colorToken picks which pre-textured GLB a real piece loads (see
  // GamePieces.tsx); the hex derived from it below is only for the ghost
  // hologram tint, which has no colorToken of its own to work with.
  const colorTokenByPlayerId = useMemo(
    () => new Map(players.map((player) => [player.id, player.colorToken])),
    [players],
  )
  const remoteColorToken = colorTokenByPlayerId.get(remoteHover.playerId)
  const remoteColor = remoteColorToken ? PLAYER_COLORS[remoteColorToken] : undefined

  return (
    <group>
      {graph.vertices.map((vertex) => (
        <VertexSlot
          key={vertex.id}
          vertex={vertex}
          building={settlements[vertex.id]}
          ownerColorToken={
            settlements[vertex.id]?.ownerId != null
              ? colorTokenByPlayerId.get(settlements[vertex.id].ownerId!)
              : undefined
          }
          isMetropolis={IMPROVEMENT_TRACK_ORDER.some((track) => metropolisVertexIds[track] === vertex.id)}
          hasWall={cityWalls.has(vertex.id)}
          onBuild={onBuildSettlement}
          locked={locked}
          remoteHighlighted={remoteHover.vertexId === vertex.id}
          remoteColor={remoteColor}
          onHoverChange={onHoverChange}
        />
      ))}
      {graph.edges.map((edge) => {
        // Open ocean (touches sea, no land at all) is the only case that
        // forces a ship — a coastal edge (touches both) defaults straight
        // to a road, same as a land-only edge. isBuildableAsShip, not the
        // broader "touches any sea tile," is what should drive both the
        // click routing AND the hover-ghost/ownership lookup below: a
        // coastal edge holding a road (the new default) still needs
        // `roads[edge.id]` checked, not `ships[edge.id]`, or an actually-
        // built road there would render as if the edge were still empty.
        const isBuildableAsShip = seaEdgeIds.has(edge.id) && !coastalEdgeIds.has(edge.id)
        const shipOwnerId = ships[edge.id]
        const roadOwnerId = roads[edge.id]
        const ownerId = roadOwnerId ?? shipOwnerId
        const onBuild = isBuildableAsShip ? onBuildShip : onBuildRoad
        // A coastal edge can end up holding either piece (a road by
        // default, or a ship relocated onto it — ship movement still
        // allows any sea-touching edge, coastal included). Once occupied,
        // render whichever piece is ACTUALLY there rather than what an
        // empty click would build; only fall back to the click-outcome
        // guess for the hover-ghost on a still-empty edge.
        const rendersAsShip = ownerId != null ? shipOwnerId != null : isBuildableAsShip
        return (
          <EdgeSlot
            key={edge.id}
            edge={edge}
            a={graph.vertexById.get(edge.a)!}
            b={graph.vertexById.get(edge.b)!}
            ownerId={ownerId}
            ownerColorToken={ownerId != null ? colorTokenByPlayerId.get(ownerId) : undefined}
            isSeaEdge={rendersAsShip}
            onBuild={onBuild}
            locked={locked}
            pickerActive={roadPickerActive}
            remoteHighlighted={remoteHover.edgeId === edge.id}
            remoteColor={remoteColor}
            onHoverChange={onHoverChange}
          />
        )
      })}
    </group>
  )
})
