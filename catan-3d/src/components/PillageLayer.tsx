import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { TILE_HEIGHT, STRUCTURE_ELEVATION } from '../data/hexBoard'
import type { BoardVertex } from '../data/boardGraph'

const PILLAGE_TARGET_COLOR = '#d64545' // same "this is a threat" red RobberLayer uses — reduces a city, a real threat

export interface PillageLayerProps {
  eligibleVertexIds: string[]
  vertexById: Map<string, BoardVertex>
  onSelectVertex: (vertexId: string) => void
}

function PillageTarget({ vertex, onSelect }: { vertex: BoardVertex; onSelect: () => void }) {
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
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh visible={hovered}>
        <sphereGeometry args={[0.16, 12, 12]} />
        <meshStandardMaterial color={PILLAGE_TARGET_COLOR} emissive={PILLAGE_TARGET_COLOR} emissiveIntensity={0.8} transparent opacity={0.55} />
      </mesh>
    </group>
  )
}

export function PillageLayer({ eligibleVertexIds, vertexById, onSelectVertex }: PillageLayerProps) {
  return (
    <group>
      {eligibleVertexIds.map((vertexId) => {
        const vertex = vertexById.get(vertexId)
        if (!vertex) return null
        return <PillageTarget key={vertexId} vertex={vertex} onSelect={() => onSelectVertex(vertexId)} />
      })}
    </group>
  )
}
