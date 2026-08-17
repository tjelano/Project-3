import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { TILE_HEIGHT, STRUCTURE_ELEVATION } from '../data/hexBoard'
import type { BoardVertex } from '../data/boardGraph'
import { KNIGHT_STRENGTH_VALUE, PLAYER_COLORS, type KnightPiece, type PlayerColorToken } from '../game/types'

// Placeholder-first policy (this plan's Global Constraints): no bespoke
// model, primitive geometry recolored via PLAYER_COLORS — same technique
// MerchantLayer.tsx's cone placeholder already established for Cities &
// Knights pieces without commissioned art (Phase B, Task 13).
const KNIGHT_BASE_RADIUS = 0.1
const KNIGHT_BASE_HEIGHT = 0.22
// Taller per strength level so basic/strong/mighty read apart at a glance
// even before real art exists — matches CN3087's own physical tokens
// (1/2/3 rings stacked higher per level).
const KNIGHT_HEIGHT_PER_STRENGTH = 0.1
// An inactive knight lies flat in the physical game ("lay it down to show
// it is now inactive" — CN3087 p.9) — mirrored here as a dimmer, shorter
// silhouette rather than a literal rotation, which would make the piece
// much harder to read/click at this scale.
const KNIGHT_INACTIVE_OPACITY = 0.55

const RECRUIT_TARGET_COLOR = '#f2c14e' // same "you can place this" gold TileSwapLayer uses
const MOVE_TARGET_COLOR = '#7fe7ff' // same cyan BoardInteractions' own settlement ghost uses
const DISPLACE_TARGET_COLOR = '#d64545' // same "this is a threat" red RobberLayer uses

function KnightToken({ knight, colorToken }: { knight: KnightPiece; colorToken: PlayerColorToken }) {
  const height = KNIGHT_BASE_HEIGHT + KNIGHT_HEIGHT_PER_STRENGTH * (KNIGHT_STRENGTH_VALUE[knight.strength] - 1)
  const color = PLAYER_COLORS[colorToken]
  return (
    <mesh position={[0, height / 2, 0]}>
      <coneGeometry args={[KNIGHT_BASE_RADIUS, height, 8]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={knight.active ? 0.5 : 0.15}
        transparent={!knight.active}
        opacity={knight.active ? 1 : KNIGHT_INACTIVE_OPACITY}
      />
    </mesh>
  )
}

function VertexTarget({
  vertex,
  color,
  onSelect,
}: {
  vertex: BoardVertex
  color: string
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <group position={[vertex.x, TILE_HEIGHT / 2 + STRUCTURE_ELEVATION, vertex.z]}>
      <mesh
        onPointerOver={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(true)
        }}
        onPointerOut={(event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          setHovered(false)
        }}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation()
          onSelect()
        }}
      >
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh visible={hovered}>
        <sphereGeometry args={[0.14, 12, 12]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} transparent opacity={0.5} />
      </mesh>
    </group>
  )
}

export interface KnightLayerProps {
  knights: KnightPiece[]
  colorTokenByPlayerId: Map<number, PlayerColorToken>
  vertexById: Map<string, BoardVertex>
  // Non-null while the LOCAL viewer has one of these picker modes armed —
  // mutually exclusive in practice (App.tsx never arms more than one at a
  // time), each rendered as its own target set/color.
  recruitTargets: ReadonlySet<string> | null
  moveTargets: ReadonlySet<string> | null
  displaceTargets: KnightPiece[] | null
  onSelectVertex: (vertexId: string) => void
  onSelectKnight: (knightId: string) => void
}

export function KnightLayer({
  knights,
  colorTokenByPlayerId,
  vertexById,
  recruitTargets,
  moveTargets,
  displaceTargets,
  onSelectVertex,
  onSelectKnight,
}: KnightLayerProps) {
  return (
    <group>
      {knights.map((knight) => {
        const vertex = vertexById.get(knight.vertexId)
        if (!vertex) return null
        const colorToken = colorTokenByPlayerId.get(knight.ownerId) ?? 'player-1'
        return (
          <group key={knight.id} position={[vertex.x, TILE_HEIGHT / 2 + STRUCTURE_ELEVATION, vertex.z]}>
            <KnightToken knight={knight} colorToken={colorToken} />
          </group>
        )
      })}

      {recruitTargets &&
        [...recruitTargets].map((vertexId) => {
          const vertex = vertexById.get(vertexId)
          if (!vertex) return null
          return (
            <VertexTarget
              key={vertexId}
              vertex={vertex}
              color={RECRUIT_TARGET_COLOR}
              onSelect={() => onSelectVertex(vertexId)}
            />
          )
        })}

      {moveTargets &&
        [...moveTargets].map((vertexId) => {
          const vertex = vertexById.get(vertexId)
          if (!vertex) return null
          return (
            <VertexTarget
              key={vertexId}
              vertex={vertex}
              color={MOVE_TARGET_COLOR}
              onSelect={() => onSelectVertex(vertexId)}
            />
          )
        })}

      {displaceTargets &&
        displaceTargets.map((target) => {
          const vertex = vertexById.get(target.vertexId)
          if (!vertex) return null
          return (
            <VertexTarget
              key={target.id}
              vertex={vertex}
              color={DISPLACE_TARGET_COLOR}
              onSelect={() => onSelectKnight(target.id)}
            />
          )
        })}
    </group>
  )
}
