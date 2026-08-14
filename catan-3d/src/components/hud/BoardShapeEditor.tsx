import { useMemo, useState } from 'react'
import { cellNeighbors, cellPosition, type BoardCell, type Biome, BIOME_COLORS } from '../../data/hexBoard'
import type { CustomBoardShape } from '../../data/customBoardShapes'
import { useModalFocusTrap } from '../../hooks/useModalFocusTrap'

// Generous enough for anything from a tight single island to a sprawling
// peanut/archipelago-style shape, without the grid itself becoming
// unwieldy to click through.
const COL_RANGE = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]
const ROW_RANGE = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]

const HEX_PIXEL_RADIUS = 22
const CORNER_ANGLES_DEG = [30, 90, 150, 210, 270, 330]

const BIOME_PALETTE: Biome[] = ['forest', 'pasture', 'fields', 'hills', 'mountains', 'desert']

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
  const [paintedBiomes, setPaintedBiomes] = useState<Map<string, Biome>>(new Map())
  const [name, setName] = useState('')
  const [activeBrush, setActiveBrush] = useState<Biome | 'erase' | null>(null)
  const dialogRef = useModalFocusTrap<HTMLDivElement>(onClose)

  const toggleCell = (cell: BoardCell) => {
    const key = cellKey(cell)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Water tile: adds it to the shape, no biome painted. Land tile with a
  // biome brush active: paints that biome (stays in the shape either way).
  // Land tile with the eraser active: clears any painted biome, stays in
  // the shape. Land tile with no brush selected: the original toggle-off —
  // removes it from the shape, and clears any paint on it too, so a tile
  // that's re-added later doesn't resurrect stale paint from a previous edit.
  const handleTileClick = (cell: BoardCell) => {
    const key = cellKey(cell)
    const isLand = selected.has(key)
    if (!isLand) {
      toggleCell(cell)
      return
    }
    if (activeBrush === null) {
      toggleCell(cell)
      setPaintedBiomes((prev) => {
        if (!prev.has(key)) return prev
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      return
    }
    if (activeBrush === 'erase') {
      setPaintedBiomes((prev) => {
        if (!prev.has(key)) return prev
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      return
    }
    setPaintedBiomes((prev) => new Map(prev).set(key, activeBrush))
  }

  const connected = useMemo(() => isSingleConnectedGroup(selected), [selected])
  const canSave = selected.size >= 3 && connected && name.trim().length > 0

  const handleSave = () => {
    if (!canSave) return
    const cells: BoardCell[] = [...selected].map((key) => {
      const [col, row] = key.split(':').map(Number)
      return { col, row }
    })
    // Re-keyed from BoardShapeEditor's own colon-separated cellKey format
    // (safely parseable back into numbers, including negatives, via split(':'))
    // to the hyphen format HexTileData.id/buildHexBoardFromCells use
    // (`${col}-${row}`) — that format is write/lookup-only everywhere it's
    // consumed, never split apart, which is exactly why it's safe there but
    // NOT safe for this component's own selected-cells bookkeeping (a
    // negative coordinate like col=-1 makes "-1--2" ambiguous to split on
    // '-', which is why cellKey uses ':' instead).
    const biomeOverrides: Record<string, Biome> = {}
    for (const [key, biome] of paintedBiomes) {
      if (!selected.has(key)) continue
      const [col, row] = key.split(':').map(Number)
      biomeOverrides[`${col}-${row}`] = biome
    }
    onSave({
      id: `custom-${Date.now()}`,
      name: name.trim(),
      cells,
      ...(Object.keys(biomeOverrides).length > 0 ? { biomeOverrides } : {}),
    })
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-board-navy/90 backdrop-blur-md">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="board-shape-editor-heading"
        tabIndex={-1}
        className="flex max-h-[90vh] w-[760px] flex-col rounded-2xl border border-glass-border bg-glass p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-xl"
      >
        <h2 id="board-shape-editor-heading" className="font-display text-xl text-white">
          Draw a Board Shape
        </h2>
        <p className="mt-1 font-body text-xs text-white/60">
          Click hexes to mark land. Paint a biome onto a tile to fix it — leave tiles unpainted to keep them random. Numbers always shuffle fresh every game.
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
                const paintedBiome = paintedBiomes.get(key)
                return (
                  <polygon
                    key={key}
                    points={hexPolygonPoints(cx, cy, HEX_PIXEL_RADIUS - 1.5)}
                    onClick={() => handleTileClick(cell)}
                    className={`cursor-pointer stroke-white/15 transition-colors ${
                      !isSelected ? 'fill-white/5 hover:fill-white/15' : paintedBiome ? '' : 'fill-gold/80 hover:fill-gold'
                    }`}
                    style={paintedBiome ? { fill: BIOME_COLORS[paintedBiome] } : undefined}
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

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="font-body text-[11px] tracking-[0.1em] text-white/50 uppercase">Paint biome</span>
          {BIOME_PALETTE.map((biome) => (
            <button
              key={biome}
              type="button"
              onClick={() => setActiveBrush((prev) => (prev === biome ? null : biome))}
              aria-label={`Paint ${biome}`}
              aria-pressed={activeBrush === biome}
              title={biome}
              className={`h-6 w-6 rounded-full border-2 transition-transform ${
                activeBrush === biome ? 'scale-110 border-white' : 'border-white/30 hover:border-white/60'
              }`}
              style={{ backgroundColor: BIOME_COLORS[biome] }}
            />
          ))}
          <button
            type="button"
            onClick={() => setActiveBrush((prev) => (prev === 'erase' ? null : 'erase'))}
            aria-label="Clear painted biome"
            aria-pressed={activeBrush === 'erase'}
            className={`rounded-lg border px-2 py-1 font-body text-[10px] tracking-[0.05em] uppercase transition-colors ${
              activeBrush === 'erase' ? 'border-gold text-gold' : 'border-glass-border text-white/50 hover:text-white'
            }`}
          >
            Erase
          </button>
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
            onClick={() => {
              setSelected(new Set())
              setPaintedBiomes(new Map())
            }}
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
