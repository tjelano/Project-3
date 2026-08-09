import { useLayoutEffect, useMemo, useRef, useState, memo, type ReactNode } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { TILE_HEIGHT } from '../data/hexBoard'
import type { BoardEdge, BoardGraph, BoardVertex } from '../data/boardGraph'
import { PLAYER_COLORS, type Building, type Player } from '../game/types'
import { CityModel, RoadModel, SettlementModel } from './GamePieces'

const VERTEX_HITBOX_RADIUS = 0.16
const EDGE_HITBOX_WIDTH = 0.16
const EDGE_HITBOX_HEIGHT = 0.14
// Shrink edge hitboxes so they don't reach all the way to the vertex
// hitboxes at either end — keeps hover/click targets from overlapping.
const EDGE_LENGTH_SCALE = 0.82

const SETTLEMENT_GLOW = '#7fe7ff'
const ROAD_GLOW = '#ffd27f'

// One shared translucent material per glow colour, cached the same way
// GamePieces' own pieceMaterial/shadeMaterial are — a hover happens often
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
// SAME shared hologram instance above. Deliberately NOT done by passing a
// translucent colour straight into the model: GamePieces caches its
// pieceMaterial/shadeMaterial per colour and shares those instances across
// every ALREADY-BUILT piece of that colour on the board — mutating one
// in place would make every real settlement of that colour go translucent
// too. Traversing and reassigning each mesh's OWN .material pointer instead
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
  ownerColor,
  onBuild,
  locked,
}: {
  vertex: BoardVertex
  building: Building | undefined
  ownerColor: string | undefined
  onBuild: (vertexId: string) => void
  locked: boolean
}) {
  const [hovered, setHovered] = useState(false)

  // A settlement or city has already been built here — render it
  // permanently in the owner's color. It stays clickable (a bigger hitbox
  // than the base model) so the owner can click their own settlement to
  // upgrade it into a city.
  if (building) {
    const color = ownerColor ?? '#ffffff'
    return (
      <group position={[vertex.x, TILE_HEIGHT / 2, vertex.z]}>
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
        {building.type === 'city' ? <CityModel color={color} /> : <SettlementModel color={color} />}
      </group>
    )
  }

  return (
    <group position={[vertex.x, TILE_HEIGHT / 2, vertex.z]}>
      <mesh
        onPointerOver={
          locked
            ? undefined
            : (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation()
                setHovered(true)
              }
        }
        onPointerOut={
          locked
            ? undefined
            : (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation()
                setHovered(false)
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

      {/* ghost settlement: the real cottage model, holographic */}
      {hovered && (
        <GhostModel color={SETTLEMENT_GLOW}>
          <SettlementModel color={SETTLEMENT_GLOW} />
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
  ownerColor,
  onBuild,
  locked,
}: {
  edge: BoardEdge
  a: BoardVertex
  b: BoardVertex
  ownerId: number | undefined
  ownerColor: string | undefined
  onBuild: (edgeId: string) => void
  locked: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const length = Math.hypot(b.x - a.x, b.z - a.z)
  const angle = Math.atan2(b.x - a.x, b.z - a.z)

  // A road has already been built here — render it permanently in the
  // owner's color instead of a hoverable hitbox.
  if (ownerId != null) {
    const color = ownerColor ?? '#ffffff'
    return (
      <group position={[edge.x, TILE_HEIGHT / 2, edge.z]} rotation={[0, angle, 0]}>
        <RoadModel color={color} span={length * (EDGE_LENGTH_SCALE - 0.05)} />
      </group>
    )
  }

  return (
    <group position={[edge.x, TILE_HEIGHT / 2, edge.z]} rotation={[0, angle, 0]}>
      <mesh
        onPointerOver={
          locked
            ? undefined
            : (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation()
                setHovered(true)
              }
        }
        onPointerOut={
          locked
            ? undefined
            : (event: ThreeEvent<PointerEvent>) => {
                event.stopPropagation()
                setHovered(false)
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

      {/* ghost road: the real timber-log model, holographic */}
      {hovered && (
        <GhostModel color={ROAD_GLOW}>
          <RoadModel color={ROAD_GLOW} span={length * (EDGE_LENGTH_SCALE - 0.05)} />
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
  onBuildSettlement: (vertexId: string) => void
  onBuildRoad: (edgeId: string) => void
  locked?: boolean
}

export const BoardInteractions = memo(function BoardInteractions({
  graph,
  settlements,
  roads,
  players,
  onBuildSettlement,
  onBuildRoad,
  locked = false,
}: BoardInteractionsProps) {
  const colorByPlayerId = useMemo(
    () => new Map(players.map((player) => [player.id, PLAYER_COLORS[player.colorToken]])),
    [players],
  )

  return (
    <group>
      {graph.vertices.map((vertex) => (
        <VertexSlot
          key={vertex.id}
          vertex={vertex}
          building={settlements[vertex.id]}
          ownerColor={settlements[vertex.id]?.ownerId != null ? colorByPlayerId.get(settlements[vertex.id].ownerId!) : undefined}
          onBuild={onBuildSettlement}
          locked={locked}
        />
      ))}
      {graph.edges.map((edge) => (
        <EdgeSlot
          key={edge.id}
          edge={edge}
          a={graph.vertexById.get(edge.a)!}
          b={graph.vertexById.get(edge.b)!}
          ownerId={roads[edge.id]}
          ownerColor={roads[edge.id] != null ? colorByPlayerId.get(roads[edge.id]!) : undefined}
          onBuild={onBuildRoad}
          locked={locked}
        />
      ))}
    </group>
  )
})
