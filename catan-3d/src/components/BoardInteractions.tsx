import { useLayoutEffect, useMemo, useRef, useState, memo, type ReactNode } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_HEIGHT, STRUCTURE_ELEVATION } from '../data/hexBoard'
import type { BoardEdge, BoardGraph, BoardVertex } from '../data/boardGraph'
import {
  IMPROVEMENT_TRACK_ORDER,
  PLAYER_COLORS,
  type Building,
  type ImprovementTrack,
  type Player,
  type PlayerColorToken,
} from '../game/types'
import { CityModel, RoadModel, SettlementModel } from './GamePieces'
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

const SETTLEMENT_GLOW = '#7fe7ff'
const ROAD_GLOW = '#ffd27f'

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
  onBuild,
  locked,
  remoteHighlighted,
  remoteColor,
  onHoverChange,
}: {
  edge: BoardEdge
  a: BoardVertex
  b: BoardVertex
  ownerId: number | undefined
  ownerColorToken: PlayerColorToken | undefined
  onBuild: (edgeId: string) => void
  locked: boolean
  remoteHighlighted: boolean
  remoteColor: string | undefined
  onHoverChange: (target: HoverTarget) => void
}) {
  const [hovered, setHovered] = useState(false)
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  const angle = Math.atan2(b.x - a.x, b.z - a.z)

  // A road has already been built here — render it permanently in the
  // owner's color instead of a hoverable hitbox.
  if (ownerId != null) {
    // Same data-integrity-only fallback as VertexSlot above.
    const colorToken = ownerColorToken ?? 'player-1'
    return (
      <group position={[edge.x, TILE_HEIGHT / 2 + STRUCTURE_ELEVATION, edge.z]} rotation={[0, angle, 0]}>
        <RoadModel colorToken={colorToken} span={length * (EDGE_LENGTH_SCALE - 0.05)} />
      </group>
    )
  }

  return (
    <group position={[edge.x, TILE_HEIGHT / 2 + STRUCTURE_ELEVATION, edge.z]} rotation={[0, angle, 0]}>
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

      {/* ghost road: the real timber-log model, holographic — same
          own-hover-vs-active-player-color split as VertexSlot above. */}
      {hovered && (
        <GhostModel color={ROAD_GLOW}>
          <RoadModel colorToken={GHOST_GEOMETRY_COLOR} span={length * (EDGE_LENGTH_SCALE - 0.05)} />
        </GhostModel>
      )}
      {remoteHighlighted && (
        <GhostModel color={remoteColor ?? ROAD_GLOW}>
          <RoadModel colorToken={GHOST_GEOMETRY_COLOR} span={length * (EDGE_LENGTH_SCALE - 0.05)} />
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
  onBuildSettlement: (vertexId: string) => void
  onBuildRoad: (edgeId: string) => void
  locked?: boolean
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
  players,
  metropolisVertexIds,
  onBuildSettlement,
  onBuildRoad,
  locked = false,
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
          onBuild={onBuildSettlement}
          locked={locked}
          remoteHighlighted={remoteHover.vertexId === vertex.id}
          remoteColor={remoteColor}
          onHoverChange={onHoverChange}
        />
      ))}
      {graph.edges.map((edge) => (
        <EdgeSlot
          key={edge.id}
          edge={edge}
          a={graph.vertexById.get(edge.a)!}
          b={graph.vertexById.get(edge.b)!}
          ownerId={roads[edge.id]}
          ownerColorToken={roads[edge.id] != null ? colorTokenByPlayerId.get(roads[edge.id]!) : undefined}
          onBuild={onBuildRoad}
          locked={locked}
          remoteHighlighted={remoteHover.edgeId === edge.id}
          remoteColor={remoteColor}
          onHoverChange={onHoverChange}
        />
      ))}
    </group>
  )
})
