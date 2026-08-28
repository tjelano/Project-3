import { useState } from 'react'
import regionIcon01Url from '../../assets/menu/region-icon-01.png'
import regionIcon02Url from '../../assets/menu/region-icon-02.png'
import regionIcon03Url from '../../assets/menu/region-icon-03.png'
import regionIcon04Url from '../../assets/menu/region-icon-04.png'
import regionIcon05Url from '../../assets/menu/region-icon-05.png'
import regionIcon06Url from '../../assets/menu/region-icon-06.png'
import regionIcon07Url from '../../assets/menu/region-icon-07.png'
import regionIcon08Url from '../../assets/menu/region-icon-08.png'
import regionIcon09Url from '../../assets/menu/region-icon-09.png'
import regionIcon10Url from '../../assets/menu/region-icon-10.png'
import { BoardShapeEditor } from './BoardShapeEditor'
import { BoardShapePreview } from './BoardShapePreview'
import { INK, INK_MUTED, PARCHMENT_BUTTON } from './parchmentTheme'
import { saveCustomBoardShape, type CustomBoardShape } from '../../data/customBoardShapes'
import type { BoardShapeId } from '../../data/hexBoard'

interface RegionOption {
  id: BoardShapeId
  name: string
  iconUrl: string
}

// Icon is attached directly to each region (rather than matched by array
// position) so reordering this list — e.g. to lead with the default map —
// can never accidentally reshuffle which icon shows next to which name.
// Orion's Keep leads: it's the default board shape (`standard`), so it's
// the first thing a player sees rather than buried 8th in the list.
const REGIONS: RegionOption[] = [
  { id: 'standard', name: "Orion's Keep", iconUrl: regionIcon08Url },
  { id: 'apocalypse', name: 'Mystvale', iconUrl: regionIcon01Url },
  { id: 'bigBasic', name: "Falcon's Nest", iconUrl: regionIcon02Url },
  { id: 'newIsland', name: 'Azure Coast', iconUrl: regionIcon03Url },
  { id: 'newfoundland', name: 'Eldrich Woods', iconUrl: regionIcon04Url },
  { id: 'northAmerica', name: 'Ironstone Peaks', iconUrl: regionIcon05Url },
  { id: 'peanut', name: "Serpent's Rest", iconUrl: regionIcon06Url },
  { id: 'southAmerica', name: 'Ironstone Mine', iconUrl: regionIcon07Url },
  { id: 'bigPeanut', name: 'Serpentine River', iconUrl: regionIcon09Url },
]

const CUSTOM_MAPS_NAME = 'Custom Maps'

const REGION_LIST_ENTRIES = [
  ...REGIONS.map((region) => ({ region, iconUrl: region.iconUrl, name: region.name })),
  { region: null, iconUrl: regionIcon10Url, name: CUSTOM_MAPS_NAME },
]

/**
 * Component-based rebuild — a real scrollable list (icon + name, selection
 * as a border/background highlight) instead of transparent hit-targets
 * positioned over region-select-menu.png's painted world map and banners.
 * No board-shape preview image exists per-region, so the list itself is the
 * whole picker now, matching GameSetupMenu/JoinRoomModal's panel language.
 */
export function RegionSelectMenu({
  initialShape,
  onConfirm,
  onConfirmCustom,
  onBack,
  onSelectionChange,
  readOnly,
}: {
  initialShape: BoardShapeId
  onConfirm: (shape: BoardShapeId) => void
  onConfirmCustom: (shape: CustomBoardShape) => void
  onBack: () => void
  // Fired every time the highlighted region changes, including before
  // confirming — lets a caller (HostMenu, while re-picking the map without
  // leaving the room) live-broadcast what's currently highlighted so
  // spectators can mirror it via the readOnly mode below.
  onSelectionChange?: (shape: BoardShapeId) => void
  // Spectator mode for everyone but the host while they're re-picking the
  // map: every click becomes a no-op and `initialShape` turns into a live
  // controlled value (kept in sync via the effect below) instead of just
  // the starting point, so this component mirrors whatever the host is
  // currently highlighting. Doesn't cover Custom Maps — a spectator just
  // keeps showing the last real region preview if the host browses there,
  // since the custom-shape drawing canvas itself isn't synced.
  readOnly?: boolean
}) {
  const [selectedId, setSelectedId] = useState<BoardShapeId>(initialShape)
  // True once the Custom Maps row is picked — takes over the confirm
  // button's label/action rather than adding a whole separate confirm flow
  // alongside it.
  const [isCustomSelected, setIsCustomSelected] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  // Spectator mode has no click of its own to update selectedId from — it
  // reads directly off the live initialShape prop instead, so it tracks
  // whatever the host is currently highlighting without needing its own
  // state sync.
  const selected = REGIONS.find((region) => region.id === (readOnly ? initialShape : selectedId)) ?? REGIONS[0]

  return (
    <div className="mx-auto w-full max-w-2xl animate-victory-in">
      {/* Same prototype as JoinRoomModal — reusing .expansion-card's
          parchment panel art rather than bespoke book art for this screen. */}
      <div className="expansion-card p-6">
        <div className="text-center">
          <h1 className={`font-display text-lg tracking-[0.3em] uppercase ${INK}`}>Choose Your Realm</h1>
          <div className="mx-auto mt-3 h-px w-16 bg-[#8a6d47]/40" />
        </div>

        {/* Preview column sized generously (18rem, ~1:1 with the panel's
            square-ish list height) — a bigger, steadier canvas means the
            same relative size swing between a small shape (Eldrich Woods)
            and a large one (Serpentine River) reads as less of a jump than
            it would cramped into a small box. */}
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_18rem] gap-3">
          <div className="max-h-80 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-[#8a6d47]/60 scrollbar-track-transparent">
            <div className="flex flex-col gap-1.5">
              {REGION_LIST_ENTRIES.map(({ region, iconUrl, name }) => {
                const isSelected = region ? !isCustomSelected && selected.id === region.id : isCustomSelected
                return (
                  <button
                    key={region?.id ?? CUSTOM_MAPS_NAME}
                    type="button"
                    disabled={readOnly}
                    onClick={() => {
                      if (readOnly) return
                      if (region) {
                        setSelectedId(region.id)
                        setIsCustomSelected(false)
                        onSelectionChange?.(region.id)
                      } else {
                        setIsCustomSelected(true)
                      }
                    }}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold ${
                      isSelected
                        ? 'border-[#7a3b1e] bg-[#7a3b1e]/10'
                        : readOnly
                          ? 'cursor-default border-[#8a6d47]/30'
                          : 'border-[#8a6d47]/30 hover:border-[#8a6d47]/60'
                    }`}
                  >
                    <img src={iconUrl} alt="" className="h-8 w-8 shrink-0 select-none object-contain" draggable={false} />
                    <span
                      className={`font-display text-sm tracking-[0.05em] uppercase ${isSelected ? INK : INK_MUTED}`}
                    >
                      {name}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Live shape preview — the actual hex-grid layout the picked
              region builds, not a location on a painted map. Custom Maps
              has no fixed layout to preview (the player draws their own in
              BoardShapeEditor), so it gets an explanatory placeholder
              instead of an empty box. */}
          <div className="flex h-80 flex-col items-center justify-center rounded-lg border border-[#8a6d47]/30 bg-[#f1e0be]/30 p-3">
            {isCustomSelected ? (
              <p className={`text-center font-body text-xs leading-snug ${INK_MUTED}`}>Design your own layout</p>
            ) : (
              <BoardShapePreview shapeId={selected.id} />
            )}
          </div>
        </div>

        {!readOnly && (
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[#8a6d47]/30 pt-4">
            <button
              type="button"
              onClick={onBack}
              className={`${PARCHMENT_BUTTON} py-2.5 font-display text-sm tracking-[0.1em] uppercase`}
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (isCustomSelected) {
                  setIsEditorOpen(true)
                  return
                }
                onConfirm(selected.id)
              }}
              className={`${PARCHMENT_BUTTON} py-2.5 font-display text-sm tracking-[0.15em] uppercase`}
            >
              {isCustomSelected ? 'Design Map' : `Select ${selected.name}`}
            </button>
          </div>
        )}
        {/* Kept visible even in readOnly (spectator) mode — a joiner
            watching the host browse maps still needs a way to leave the
            room, not just the host's own Back affordance. */}
        {readOnly && (
          <div className="mt-5 border-t border-[#8a6d47]/30 pt-4">
            <button type="button" onClick={onBack} className={`${PARCHMENT_BUTTON} w-full py-2.5 font-display text-sm tracking-[0.1em] uppercase`}>
              Leave Room
            </button>
          </div>
        )}
      </div>

      {isEditorOpen && (
        <BoardShapeEditor
          onClose={() => setIsEditorOpen(false)}
          onSave={(shape) => {
            saveCustomBoardShape(shape)
            setIsEditorOpen(false)
            onConfirmCustom(shape)
          }}
        />
      )}
    </div>
  )
}
