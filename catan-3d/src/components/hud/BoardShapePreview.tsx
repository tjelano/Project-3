import { useMemo } from 'react'
import { BOARD_SHAPES, cellPosition, HEX_RADIUS, type BoardShapeId } from '../../data/hexBoard'

// Flat-top hexagon vertex angles (matches hexBoard.ts's own
// COLUMN_SPACING/ROW_SPACING derivation — 0/60/120/180/240/300, not the
// pointy-top 30/90/.../330 set).
const HEX_ANGLES = [0, 60, 120, 180, 240, 300].map((deg) => (deg * Math.PI) / 180)

function hexPoints(cx: number, cy: number, r: number): string {
  return HEX_ANGLES.map((angle) => `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`).join(' ')
}

// Renders the actual hex-grid shape (silhouette only, no biome/number data —
// that's randomized per match by buildHexBoard) using the exact same
// cellPosition math the real 3D board and BoardShapeEditor's 2D canvas use,
// so a picked shape here can never silently drift from what's actually built.
export function BoardShapePreview({ shapeId }: { shapeId: BoardShapeId }) {
  const { hexes, viewBox } = useMemo(() => {
    const positions = (BOARD_SHAPES[shapeId] ?? []).map((cell) => cellPosition(cell))
    const padding = HEX_RADIUS * 1.2
    const minX = Math.min(...positions.map((p) => p.x)) - padding
    const maxX = Math.max(...positions.map((p) => p.x)) + padding
    const minZ = Math.min(...positions.map((p) => p.z)) - padding
    const maxZ = Math.max(...positions.map((p) => p.z)) + padding
    return { hexes: positions, viewBox: `${minX} ${minZ} ${maxX - minX} ${maxZ - minZ}` }
  }, [shapeId])

  return (
    <svg viewBox={viewBox} className="h-full w-full" role="img" aria-label="Board layout preview">
      {hexes.map((pos, index) => (
        <polygon
          key={index}
          points={hexPoints(pos.x, pos.z, HEX_RADIUS * 0.94)}
          className="fill-gold/15 stroke-gold/60"
          strokeWidth={0.04}
        />
      ))}
    </svg>
  )
}
