import { useState } from 'react'
import type { GameStartInfo } from './StartScreen'
import { BOARD_SHAPE_LABELS, type BoardShapeId } from '../../data/hexBoard'
import {
  deleteCustomBoardShape,
  loadCustomBoardShapes,
  saveCustomBoardShape,
  type CustomBoardShape,
} from '../../data/customBoardShapes'
import { BoardShapeEditor } from './BoardShapeEditor'
import { TrashIcon } from './TrashIcon'
import { ConfirmDialog } from './ConfirmDialog'
import { HouseRulesEditor, DEFAULT_GAME_RULES } from './HouseRulesEditor'
import { CollapsibleSection } from './CollapsibleSection'
import { PLAYER_COLORS, type GameRules, type PlayerColorToken } from '../../game/types'

const CREATE_SHAPE_VALUE = '__create__'
const ALL_COLOR_TOKENS: PlayerColorToken[] = [
  'player-1',
  'player-2',
  'player-3',
  'player-4',
  'player-5',
  'player-6',
]

// Namespaced so it can't collide with any other app sharing this origin.
const LOCAL_PLAYER_NAME_KEY = 'catan3d.localPlayerName'

function readSavedLocalPlayerName(): string {
  try {
    return localStorage.getItem(LOCAL_PLAYER_NAME_KEY) ?? ''
  } catch {
    // Storage can throw in private-browsing modes or when disabled —
    // the form still works, it just won't remember the name next time.
    return ''
  }
}

export function LocalSetup({ onStart }: { onStart: (info: GameStartInfo) => void }) {
  const [playerCount, setPlayerCount] = useState(3)
  // Either a built-in BoardShapeId, or a saved custom shape's own id —
  // resolved against customShapes at start time.
  const [selectedShapeValue, setSelectedShapeValue] = useState<string>('standard')
  const [customShapes, setCustomShapes] = useState<CustomBoardShape[]>(() => loadCustomBoardShapes())
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  // Which custom shape the delete button targets — a real <select>, exactly
  // like Player Count/Board Shape above, gets the browser's own native
  // dropdown arrow and option-list styling for free. Falls back to the
  // first remaining shape whenever the stored id no longer exists (e.g.
  // right after a delete), computed during render rather than a
  // useEffect — same "adjust state during render" pattern used for
  // derived state elsewhere in this app.
  const [shapeToManage, setShapeToManage] = useState('')
  // Falls back to '' (the placeholder option) rather than the first shape's
  // id, so the box reads "Custom Islands" until something is actively
  // picked, instead of always defaulting to whichever shape happens to be
  // first in the list.
  const effectiveShapeToManage = customShapes.some((shape) => shape.id === shapeToManage) ? shapeToManage : ''
  // Set only while the "Delete Map" confirm dialog is open — holds the
  // exact shape it targets so a delete elsewhere in the meantime (there
  // isn't one today, but this keeps the dialog from ever acting on a
  // shape other than the one it was opened for) can't retarget it.
  const [pendingDeleteShapeId, setPendingDeleteShapeId] = useState<string | null>(null)
  const [gameRules, setGameRules] = useState<GameRules>(DEFAULT_GAME_RULES)
  const [colorTokens, setColorTokens] = useState<PlayerColorToken[]>(ALL_COLOR_TOKENS)
  // Sized to 4 regardless of the current count, so switching the dropdown
  // never discards a name already typed into a slot. Slot 0 is "this
  // device's" player — the only one worth remembering across visits.
  const [names, setNames] = useState<string[]>(() => {
    const saved = readSavedLocalPlayerName()
    return [saved, '', '', '', '', '']
  })

  const setName = (index: number, value: string) => {
    setNames((prev) => prev.map((n, i) => (i === index ? value : n)))
  }

  const setColor = (index: number, color: PlayerColorToken) => {
    setColorTokens((prev) => prev.map((c, i) => (i === index ? color : c)))
  }

  const handleDeleteShape = (id: string) => {
    const next = deleteCustomBoardShape(id)
    setCustomShapes(next)
    // The deleted shape can't remain selected — falls back to Standard
    // rather than leaving the form pointing at a shape that no longer
    // exists.
    if (selectedShapeValue === id) {
      setSelectedShapeValue('standard')
    }
  }

  const handleStart = () => {
    const activeNames = names.slice(0, playerCount)
    try {
      if (activeNames[0]?.trim()) {
        localStorage.setItem(LOCAL_PLAYER_NAME_KEY, activeNames[0].trim())
      }
    } catch {
      // Same non-fatal storage failure as above — proceed regardless.
    }
    const customShape = customShapes.find((shape) => shape.id === selectedShapeValue)
    onStart({
      playerCount,
      names: activeNames,
      colorTokens: colorTokens.slice(0, playerCount),
      gameRules,
      boardShapeId: customShape ? undefined : (selectedShapeValue as BoardShapeId),
      customBoardCells: customShape?.cells,
      customBoardName: customShape?.name,
    })
  }

  return (
    <div>
      <label className="mt-8 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase" htmlFor="player-count">
        Player Count
      </label>
      <select
        id="player-count"
        value={playerCount}
        onChange={(event) => setPlayerCount(Number(event.target.value))}
        className="mt-2 w-full rounded-lg border border-glass-border bg-white/5 px-3 py-2 text-center font-body text-sm text-white focus:border-gold/60 focus:outline-none"
      >
        <option value={2} className="bg-board-navy">
          2 Players
        </option>
        <option value={3} className="bg-board-navy">
          3 Players
        </option>
        <option value={4} className="bg-board-navy">
          4 Players
        </option>
        <option value={5} className="bg-board-navy">
          5 Players
        </option>
        <option value={6} className="bg-board-navy">
          6 Players
        </option>
      </select>

      <label className="mt-6 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase" htmlFor="board-shape">
        Board Shape
      </label>
      <select
        id="board-shape"
        value={selectedShapeValue}
        onChange={(event) => {
          if (event.target.value === CREATE_SHAPE_VALUE) {
            setIsEditorOpen(true)
            return
          }
          setSelectedShapeValue(event.target.value)
        }}
        className="mt-2 w-full rounded-lg border border-glass-border bg-white/5 px-3 py-2 text-center font-body text-sm text-white focus:border-gold/60 focus:outline-none"
      >
        {Object.entries(BOARD_SHAPE_LABELS).map(([id, label]) => (
          <option key={id} value={id} className="bg-board-navy">
            {label}
          </option>
        ))}
        {customShapes.map((shape) => (
          <option key={shape.id} value={shape.id} className="bg-board-navy">
            {shape.name}
          </option>
        ))}
        <option value={CREATE_SHAPE_VALUE} className="bg-board-navy text-gold">
          + Create Custom Shape…
        </option>
      </select>

      {customShapes.length > 0 && (
        <select
          value={effectiveShapeToManage}
          onChange={(event) => {
            if (event.target.value === CREATE_SHAPE_VALUE) {
              setIsEditorOpen(true)
              return
            }
            setShapeToManage(event.target.value)
          }}
          className="mt-2 w-full rounded-lg border border-glass-border bg-white/5 px-3 py-2 text-center font-body text-sm text-white focus:border-gold/60 focus:outline-none"
        >
          <option value="" disabled className="bg-board-navy">
            Custom Islands
          </option>
          {customShapes.map((shape) => (
            <option key={shape.id} value={shape.id} className="bg-board-navy">
              {shape.name}
            </option>
          ))}
          <option value={CREATE_SHAPE_VALUE} className="bg-board-navy text-gold">
            + Create Custom Shape…
          </option>
        </select>
      )}

      {isEditorOpen && (
        <BoardShapeEditor
          onClose={() => setIsEditorOpen(false)}
          onSave={(shape) => {
            const next = saveCustomBoardShape(shape)
            setCustomShapes(next)
            setSelectedShapeValue(shape.id)
            setIsEditorOpen(false)
          }}
        />
      )}

      <label className="mt-6 block font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">
        Player Names
      </label>
      <div className="mt-2 flex flex-col gap-2">
        {Array.from({ length: playerCount }, (_, i) => (
          <div key={i} className="flex gap-2">
            <input
              type="text"
              value={names[i]}
              onChange={(event) => setName(i, event.target.value)}
              placeholder={`Player ${i + 1}`}
              maxLength={20}
              className="min-w-0 flex-1 rounded-lg border border-glass-border bg-white/5 px-3 py-2 text-center font-body text-sm text-white placeholder:text-white/30 focus:border-gold/60 focus:outline-none"
            />
            <select
              value={colorTokens[i]}
              onChange={(event) => setColor(i, event.target.value as PlayerColorToken)}
              style={{ color: PLAYER_COLORS[colorTokens[i]] }}
              className="rounded-lg border border-glass-border bg-white/5 px-2 py-2 font-body text-sm font-semibold focus:border-gold/60 focus:outline-none"
            >
              {ALL_COLOR_TOKENS.map((token) => (
                <option
                  key={token}
                  value={token}
                  disabled={colorTokens.slice(0, playerCount).some((c, j) => c === token && j !== i)}
                  className="bg-board-navy"
                  style={{ color: PLAYER_COLORS[token] }}
                >
                  ●
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <CollapsibleSection icon="📜" label="House Rules">
          <HouseRulesEditor rules={gameRules} onChange={setGameRules} />
        </CollapsibleSection>
      </div>

      <button
        type="button"
        onClick={handleStart}
        className="mt-6 w-full rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2.5 font-display text-sm font-semibold text-board-navy transition-transform hover:scale-[1.02] active:scale-95"
      >
        Start Game
      </button>

      {customShapes.length > 0 && (
        <button
          type="button"
          onClick={() => setPendingDeleteShapeId(effectiveShapeToManage)}
          disabled={!effectiveShapeToManage}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-glass-border bg-white/5 py-2.5 font-body text-xs tracking-[0.1em] text-player-1/80 uppercase transition-all hover:scale-[1.02] hover:bg-player-1/10 hover:text-player-1 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-white/5 disabled:hover:text-player-1/80"
        >
          <TrashIcon className="h-3.5 w-3.5" />
          Delete Map
        </button>
      )}

      {pendingDeleteShapeId && (
        <ConfirmDialog
          message={`Delete "${customShapes.find((s) => s.id === pendingDeleteShapeId)?.name}"? This can't be undone.`}
          onConfirm={() => {
            handleDeleteShape(pendingDeleteShapeId)
            setPendingDeleteShapeId(null)
          }}
          onCancel={() => setPendingDeleteShapeId(null)}
        />
      )}
    </div>
  )
}
