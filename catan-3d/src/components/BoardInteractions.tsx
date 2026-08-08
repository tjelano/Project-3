import { useMemo, useState, memo } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
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

      {/* ghost settlement: a translucent glowing house silhouette */}
      {hovered && (
        <group>
          <mesh position={[0, 0.07, 0]}>
            <boxGeometry args={[0.14, 0.14, 0.14]} />
            <meshStandardMaterial
              color={SETTLEMENT_GLOW}
              emissive={SETTLEMENT_GLOW}
              emissiveIntensity={0.7}
              transparent
              opacity={0.5}
              depthWrite={false}
            />
          </mesh>
          <mesh position={[0, 0.17, 0]}>
            <coneGeometry args={[0.11, 0.13, 4]} />
            <meshStandardMaterial
              color={SETTLEMENT_GLOW}
              emissive={SETTLEMENT_GLOW}
              emissiveIntensity={0.7}
              transparent
              opacity={0.5}
              depthWrite={false}
            />
          </mesh>
        </group>
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

      {/* ghost road: a translucent glowing bar along the edge */}
      {hovered && (
        <mesh position={[0, 0.06, 0]}>
          <boxGeometry args={[0.09, 0.06, length * (EDGE_LENGTH_SCALE - 0.05)]} />
          <meshStandardMaterial
            color={ROAD_GLOW}
            emissive={ROAD_GLOW}
            emissiveIntensity={0.7}
            transparent
            opacity={0.5}
            depthWrite={false}
          />
        </mesh>
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
