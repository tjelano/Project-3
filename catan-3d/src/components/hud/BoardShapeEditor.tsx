import { useMemo, useState } from 'react'
import { cellNeighbors, cellPosition, type BoardCell, type Biome, BIOME_COLORS } from '../../data/hexBoard'
import {
  deleteCustomBoardShape,
  loadCustomBoardShapes,
  saveCustomBoardShape,
  type CustomBoardShape,
} from '../../data/customBoardShapes'
import { useModalDialog } from '../../hooks/useModalDialog'

// Generous enough for anything from a tight single island to a sprawling
// peanut/archipelago-style shape, without the grid itself becoming
// unwieldy to click through.
const COL_RANGE = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]
const ROW_RANGE = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]

const HEX_PIXEL_RADIUS = 22
const CORNER_ANGLES_DEG = [30, 90, 150, 210, 270, 330]

// sea/gold are paint-only — buildHexBoardFromCells excludes both from
// BIOME_WEIGHTS (the random-draw pool for unpainted tiles), so an unpainted
// tile can never accidentally become one; a player has to choose them
// deliberately, same as the built-in seafarersBasic shape's own pinned
// sea ring/gold fields.
const BIOME_PALETTE: Biome[] = ['forest', 'pasture', 'fields', 'hills', 'mountains', 'desert', 'sea', 'gold']

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
  const [mode, setMode] = useState<'editing' | 'preview'>('editing')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savedShapes, setSavedShapes] = useState<CustomBoardShape[]>(() => loadCustomBoardShapes())
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)
  const dialogRef = useModalDialog<HTMLDialogElement>(onClose)

  const toggleCell = (cell: BoardCell) => {
    const key = cellKey(cell)
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Cell not yet in the shape: adds it. With a biome brush active, paints
  // it in the SAME click — previously this added the tile unpainted and
  // only applied the brush on a second click once the tile already existed,
  // which for a brush like Sea/Gold (never drawn randomly — see
  // BIOME_PALETTE's own comment) meant nothing visibly happened on the
  // first click at all. With no brush (or the eraser) selected, adds it
  // unpainted, same as before — unpainted draws randomly from the standard
  // land pool at build time. Cell already in the shape ("isLand" — a legacy
  // name from before sea/gold were paintable; it really means "in the
  // shape," not literally land) with a biome brush active: paints that
  // biome, stays in the shape either way. With the eraser active: clears
  // any painted biome, stays in the shape. With no brush selected: the
  // original toggle-off — removes it from the shape, and clears any paint
  // on it too, so a tile that's re-added later doesn't resurrect stale
  // paint from a previous edit.
  const handleTileClick = (cell: BoardCell) => {
    if (mode !== 'editing') return
    const key = cellKey(cell)
    const isLand = selected.has(key)
    if (!isLand) {
      toggleCell(cell)
      if (activeBrush !== null && activeBrush !== 'erase') {
        setPaintedBiomes((prev) => new Map(prev).set(key, activeBrush))
      }
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

  const resetToBlank = () => {
    setSelected(new Set())
    setPaintedBiomes(new Map())
    setName('')
    setEditingId(null)
    setActiveBrush(null)
    setMode('editing')
  }

  // shape.biomeOverrides is keyed by the hyphen format (`${col}-${row}`),
  // which is write/lookup-only and never safely split back into numbers
  // (see the comment on buildCurrentShape below for why). Looking each
  // override up FORWARD from shape.cells' own known col/row — instead of
  // trying to parse the override keys apart — sidesteps that entirely.
  const loadShapeIntoCanvas = (shape: CustomBoardShape) => {
    setSelected(new Set(shape.cells.map(cellKey)))
    const nextPainted = new Map<string, Biome>()
    for (const cell of shape.cells) {
      const override = shape.biomeOverrides?.[`${cell.col}-${cell.row}`]
      if (override) nextPainted.set(cellKey(cell), override)
    }
    setPaintedBiomes(nextPainted)
    setName(shape.name)
    setEditingId(shape.id)
    setActiveBrush(null)
    setMode('preview')
  }

  // Shared by the Save button (editing mode) and the Use This Map button
  // (preview mode) — in preview mode nothing can have changed since
  // loadShapeIntoCanvas ran (tile clicks are disabled outside 'editing'), so
  // this reproduces the exact loaded shape; in editing mode it captures
  // whatever's just been drawn/painted.
  const buildCurrentShape = (): CustomBoardShape => {
    const cells: BoardCell[] = [...selected].map((key) => {
      const [col, row] = key.split(':').map(Number)
      return { col, row }
    })
    // Re-keyed from this component's own colon-separated cellKey format
    // (safely parseable back into numbers, including negatives) to the
    // hyphen format HexTileData.id/buildHexBoardFromCells use — see
    // loadShapeIntoCanvas's own comment for why colon vs. hyphen matters here.
    const biomeOverrides: Record<string, Biome> = {}
    for (const [key, biome] of paintedBiomes) {
      if (!selected.has(key)) continue
      const [col, row] = key.split(':').map(Number)
      biomeOverrides[`${col}-${row}`] = biome
    }
    return {
      id: editingId ?? `custom-${Date.now()}`,
      name: name.trim(),
      cells,
      ...(Object.keys(biomeOverrides).length > 0 ? { biomeOverrides } : {}),
    }
  }

  // Persists only — does NOT call onSave, which is what actually closes
  // this dialog and starts a game. Save Shape used to call onSave directly,
  // so saving a map also instantly started playing it; now it just writes
  // to storage, refreshes the sidebar, and drops into preview mode so the
  // player can see what they saved and separately choose Use This Map when
  // they're actually ready to play.
  const handleSaveShape = () => {
    if (!canSave) return
    const shape = buildCurrentShape()
    setSavedShapes(saveCustomBoardShape(shape))
    setEditingId(shape.id)
    setMode('preview')
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="board-shape-editor-heading"
      className="m-auto flex max-h-[90vh] w-[960px] flex-col rounded-2xl border border-glass-border bg-glass p-6 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop:bg-board-navy/90 backdrop:backdrop-blur-md backdrop-blur-xl"
    >
      <h2 id="board-shape-editor-heading" className="font-display text-xl text-white">
        {mode === 'preview' ? 'Preview Board Shape' : 'Draw a Board Shape'}
      </h2>
      <p className="mt-1 font-body text-xs text-white/60">
        {mode === 'preview'
          ? 'This is a saved shape. Use it as-is, or Edit to change it.'
          : 'Click hexes to add them to the shape. Paint a biome onto a tile to fix it — leave tiles unpainted to draw randomly from the standard six. Sea and Gold Field never appear by chance; paint them deliberately. Numbers always shuffle fresh every game.'}
      </p>

      <div className="mt-4 flex min-h-0 flex-1 gap-4">
        <div className="flex w-48 shrink-0 flex-col gap-2 overflow-y-auto rounded-xl border border-glass-border bg-board-navy/60 p-2">
          <button
            type="button"
            onClick={resetToBlank}
            className="rounded-lg border border-glass-border bg-white/5 py-2 font-body text-[11px] tracking-[0.1em] text-gold uppercase transition-colors hover:border-gold/50"
          >
            + New Map
          </button>
          {savedShapes.length === 0 && (
            <p className="mt-2 px-1 font-body text-[11px] text-white/40">No saved maps yet.</p>
          )}
          {savedShapes.map((shape) => (
            <div
              key={shape.id}
              className={`flex items-center justify-between gap-1 rounded-lg border px-2 py-1.5 ${
                editingId === shape.id ? 'border-gold/60 bg-gold/10' : 'border-glass-border bg-white/5'
              }`}
            >
              <button
                type="button"
                onClick={() => loadShapeIntoCanvas(shape)}
                className="min-w-0 flex-1 truncate text-left font-body text-xs text-white hover:text-gold"
              >
                {shape.name}
                <span className="ml-1 text-white/40">({shape.cells.length})</span>
              </button>
              {pendingDeleteId === shape.id ? (
                <button
                  type="button"
                  onClick={() => {
                    setSavedShapes(deleteCustomBoardShape(shape.id))
                    if (editingId === shape.id) resetToBlank()
                    setPendingDeleteId(null)
                  }}
                  className="shrink-0 font-body text-[10px] font-semibold text-player-1 uppercase"
                >
                  Confirm?
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingDeleteId(shape.id)}
                  aria-label={`Delete ${shape.name}`}
                  className="shrink-0 font-body text-xs text-white/40 hover:text-player-1"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex-1 overflow-auto rounded-xl border border-glass-border bg-board-navy/60 p-3">
            <svg viewBox="-320 -280 640 560" className="mx-auto block h-auto w-full max-w-[680px]">
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
                      className={`stroke-white/15 transition-colors ${mode === 'editing' ? 'cursor-pointer' : 'cursor-default'} ${
                        !isSelected
                          ? 'fill-white/5 hover:fill-white/15'
                          : paintedBiome
                            ? ''
                            : 'fill-gold/80 hover:fill-gold'
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
              <span className="text-player-1">Not all connected — every tile needs a neighbor in the shape.</span>
            )}
          </div>

          {mode === 'editing' && (
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
                  activeBrush === 'erase'
                    ? 'border-gold text-gold'
                    : 'border-glass-border text-white/50 hover:text-white'
                }`}
              >
                Erase
              </button>
            </div>
          )}

          {mode === 'editing' && (
            <div className="mt-3 flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name this shape"
                aria-label="Shape name"
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
          )}

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-glass-border bg-white/5 py-2.5 font-display text-sm font-semibold text-white transition-colors hover:border-white/30"
            >
              Cancel
            </button>
            {mode === 'preview' ? (
              <>
                <button
                  type="button"
                  onClick={() => setMode('editing')}
                  className="flex-1 rounded-lg border border-gold/50 bg-white/5 py-2.5 font-display text-sm font-semibold text-gold transition-colors hover:border-gold"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onSave(buildCurrentShape())}
                  className="flex-1 rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95"
                >
                  Use This Map
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!canSave}
                onClick={handleSaveShape}
                className="flex-1 rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              >
                Save Shape
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  )
}
