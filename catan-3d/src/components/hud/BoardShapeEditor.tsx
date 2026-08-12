import { useMemo, useState } from 'react'
import { cellNeighbors, cellPosition, type BoardCell } from '../../data/hexBoard'
import type { CustomBoardShape } from '../../data/customBoardShapes'

// Generous enough for anything from a tight single island to a sprawling
// peanut/archipelago-style shape, without the grid itself becoming
// unwieldy to click through.
const COL_RANGE = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]
const ROW_RANGE = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]

const HEX_PIXEL_RADIUS = 22
const CORNER_ANGLES_DEG = [30, 90, 150, 210, 270, 330]

function cellKey(cell: BoardCell): string {
  return `${cell.col}:${cell.row}`
}

function hexPolygonPoints(cx: number, cy: number, r: number): string {
  return CORNER_ANGLES_DEG.map((deg) => {
    const rad = (deg * Math.PI) / 180
    return `${cx + r * Math.sin(rad)},${cy + r * Math.cos(rad)}`
  }).join(' ')
}

// BFS over the selected set using the real odd-q adjacency (cellNeighbors)
// — tells the player, before they save, whether their shape is one
// connected landmass. assignPorts' boundary-walk (boardGraph.ts) assumes
// exactly that, the same property the built-in shapes are designed to hold.
function isSingleConnectedGroup(selected: Set<string>): boolean {
  if (selected.size === 0) return false
  const cells = [...selected].map((key) => {
    const [col, row] = key.split(':').map(Number)
    return { col, row }
  })
  const visited = new Set<string>()
  const queue = [cells[0]]
  visited.add(cellKey(cells[0]))
  while (queue.length > 0) {
    const current = queue.pop()!
    for (const neighbor of cellNeighbors(current)) {
      const key = cellKey(neighbor)
      if (selected.has(key) && !visited.has(key)) {
        visited.add(key)
        queue.push(neighbor)
      }
    }
  }
  return visited.size === selected.size
}

export function BoardShapeEditor({
  onSave,
  onClose,
}: {
  onSave: (shape: CustomBoardShape) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [name, setName] = useState('')

  const toggleCell = (cell: BoardCell) => {
    const key = cellKey(cell)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const connected = useMemo(() => isSingleConnectedGroup(selected), [selected])
  const canSave = selected.size >= 3 && connected && name.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    const cells: BoardCell[] = [...selected].map((key) => {
      const [col, row] = key.split(':').map(Number)
      return { col, row }
    })
    onSave({ id: `custom-${Date.now()}`, name: name.trim(), cells })
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-board-navy/90 backdrop-blur-md">
      <div className="flex max-h-[90vh] w-[760px] flex-col rounded-2xl border border-glass-border bg-glass p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl">
        <h2 className="font-display text-xl text-white">Draw a Board Shape</h2>
        <p className="mt-1 font-body text-xs text-white/60">
          Click hexes to mark land. Biomes and numbers still shuffle fresh every game — only the coastline is fixed.
        </p>

        <div className="mt-4 flex-1 overflow-auto rounded-xl border border-glass-border bg-board-navy/60 p-3">
          <svg
            viewBox="-320 -280 640 560"
            className="mx-auto block h-auto w-full max-w-[680px]"
          >
            {COL_RANGE.flatMap((col) =>
              ROW_RANGE.map((row) => {
                const cell = { col, row }
                const key = cellKey(cell)
                const { x, z } = cellPosition(cell)
                const cx = x * HEX_PIXEL_RADIUS
                const cy = z * HEX_PIXEL_RADIUS
                const isSelected = selected.has(key)
                return (
                  <polygon
                    key={key}
                    points={hexPolygonPoints(cx, cy, HEX_PIXEL_RADIUS - 1.5)}
                    onClick={() => toggleCell(cell)}
                    className={`cursor-pointer stroke-white/15 transition-colors ${
                      isSelected ? 'fill-gold/80 hover:fill-gold' : 'fill-white/5 hover:fill-white/15'
                    }`}
                    strokeWidth={1}
                  />
                )
              }),
            )}
          </svg>
        </div>

        <div className="mt-3 flex items-center justify-between font-body text-[11px] text-white/50">
          <span>{selected.size} tiles selected</span>
          {selected.size > 0 && !connected && (
            <span className="text-player-1">Not all connected — every tile needs a land neighbor.</span>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name this shape"
            maxLength={30}
            className="min-w-0 flex-1 rounded-lg border border-glass-border bg-white/5 px-3 py-2 font-body text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-lg border border-glass-border bg-white/5 px-3 py-2 font-body text-[11px] tracking-[0.1em] text-white/60 uppercase transition-colors hover:border-player-1/50 hover:text-player-1"
          >
            Clear
          </button>
        </div>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-glass-border bg-white/5 py-2.5 font-display text-sm font-semibold text-white transition-colors hover:border-white/30"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="flex-1 rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
          >
            Save Shape
          </button>
        </div>
      </div>
    </div>
  )
}
