import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import regionSelectMenuUrl from '../../assets/menu/region-select-menu.png'
import shieldRegionSelectionUrl from '../../assets/menu/shield-region-selection.png'
import selectorBorderUrl from '../../assets/menu/selector-border.png'
import { BoardShapeEditor } from './BoardShapeEditor'
import { useHoverActive } from './useHoverActive'
import { saveCustomBoardShape, type CustomBoardShape } from '../../data/customBoardShapes'
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
import type { BoardShapeId } from '../../data/hexBoard'

interface RegionOption {
  id: BoardShapeId
  name: string
  left: number
  top: number
  width: number
  height: number
}

// left/top/width/height are % of the panel image; left/top are re-centered
// on each banner's actual painted position (measured off the rendered map)
// so the shield overlay's centered inset lands on the label, not beside it.
const REGIONS: RegionOption[] = [
  { id: 'apocalypse', name: "Mystvale", left: 33, top: 68.4, width: 15, height: 9 },
  { id: 'bigBasic', name: "Falcon's Nest", left: 56.1, top: 28.2, width: 14, height: 9 },
  { id: 'newIsland', name: 'Azure Coast', left: 73, top: 56.7, width: 15, height: 9 },
  { id: 'newfoundland', name: 'Eldrich Woods', left: 35.4, top: 34.4, width: 18, height: 9 },
  { id: 'northAmerica', name: 'Ironstone Peaks', left: 69.2, top: 28.6, width: 17, height: 9 },
  { id: 'peanut', name: "Serpent's Rest", left: 56.3, top: 71.2, width: 17, height: 9 },
  { id: 'southAmerica', name: 'Ironstone Mine', left: 68.5, top: 39.9, width: 15, height: 9 },
  { id: 'standard', name: "Orion's Keep", left: 54.6, top: 47.7, width: 17, height: 9 },
  { id: 'bigPeanut', name: 'Serpentine River', left: 40.8, top: 51.8, width: 22, height: 10 },
]

const REGION_ICON_URLS = [
  regionIcon01Url,
  regionIcon02Url,
  regionIcon03Url,
  regionIcon04Url,
  regionIcon05Url,
  regionIcon06Url,
  regionIcon07Url,
  regionIcon08Url,
  regionIcon09Url,
  regionIcon10Url,
]

const CUSTOM_MAPS_NAME = 'Custom Maps'

const REGION_LIST_ENTRIES = [
  ...REGIONS.map((region, index) => ({ region, iconUrl: REGION_ICON_URLS[index], name: region.name })),
  { region: null, iconUrl: regionIcon10Url, name: CUSTOM_MAPS_NAME },
]

// Row height is an aspect-ratio (row width : row height), not a fixed px
// value — a row's WIDTH always resolves against the definite, panel-derived
// list container width, so an aspect-ratio keeps every row's height (and
// therefore the scroll pitch) exactly proportional to the panel at any
// render size. Fixed px rows only matched the artwork's real slot spacing
// at one specific panel width (~1152px, Tailwind's max-w-6xl cap) — at any
// other size the pitch silently drifted, compounding a little more with
// every row, which is why only the first few rows ever lined up and
// scrolling further always broke down no matter how much a row was nudged.
// Ratio and gap % measured directly off region-select-menu.png's own
// painted slots (~109px pitch in its native 1536-wide canvas).
const REGION_LIST_LAYOUT = {
  left: '7%',
  top: '24%',
  width: '21%',
  height: '53%',
  // width : height.
  rowAspectRatio: '3.78',
  // % of a row's own (definite) width — vertical margin percentages resolve
  // against the containing block's WIDTH per spec, so this scales exactly
  // like rowAspectRatio does, regardless of the row's own height being
  // auto/indefinite.
  rowGapPercent: '8.0%',
  // Icon width as a % of the row's own width, paired with a 1:1 aspect
  // ratio so height derives automatically — deliberately larger than the
  // row (matches the reference art's medallion icons overlapping their
  // frame).
  iconWidthPercent: '31%',
  labelOffsetX: '-5px',
  labelOffsetY: '10px',
} as const

// Per-region px nudges for the shield-on-the-map overlay, ordered like
// REGIONS — each banner sits at a different spot with different surrounding
// art, so the shield's base position (see the img below) doesn't land right
// on every one of them by default. Edit these directly and check the result
// in the browser, same as REGION_ICON_OFFSETS/REGION_LABEL_OFFSETS below.
const REGION_SHIELD_OFFSETS: { x: number; y: number }[] = [
  { x: 5, y: 0 }, // apocalypse / Mystvale
  { x: 0, y: 25 }, // bigBasic / Falcon's Nest
  { x: 0, y: 25 }, // newIsland / Azure Coast
  { x: 0, y: 25 }, // newfoundland / Eldrich Woods
  { x: 0, y: 25 }, // northAmerica / Ironstone Peaks
  { x: 5, y: 25 }, // peanut / Serpent's Rest
  { x: -15, y: 30 }, // southAmerica / Ironstone Mine
  { x: 0, y: 25 }, // standard / Orion's Keep
  { x: -5, y: 50 }, // bigPeanut / Serpentine River
]

// Adjust the selected-row frame independently from the row, icon, and text.
// These values are percentages of the selected region row's own (now
// definite, aspect-ratio-derived) box.
const REGION_SELECTOR_LAYOUT = {
  left: '-1%',
  top: '-45%',
  width: '105%',
  height: '220%',
} as const

// How far selector-border.png extends past the confirm button's own edges,
// in % of the button's own size — same "primary action" glow highlight
// used elsewhere (GameSetupMenu's Game Mode buttons, JoinRoomModal's Join
// button).
const CONFIRM_BUTTON_SELECTOR_INSET = { x: -19.6, y: 35 }
// Nudges the glow frame itself (px, on top of the inset above) without
// resizing it — positive x moves right, positive y moves down.
const CONFIRM_BUTTON_SELECTOR_OFFSET = { x: -50, y: -9 }
// Opacity at rest vs. while hovered/focused.
const CONFIRM_BUTTON_GLOW_IDLE_OPACITY = 0
const CONFIRM_BUTTON_GLOW_ACTIVE_OPACITY = 1

function selectorOverlayStyle(insetXPct: number, insetYPct: number) {
  return {
    left: `-${insetXPct}%`,
    top: `-${insetYPct}%`,
    width: `calc(100% + ${insetXPct * 2}%)`,
    height: `calc(100% + ${insetYPct * 2}%)`,
    maxWidth: 'none',
  }
}

// How far REGION_SELECTOR_LAYOUT's frame extends past a row's own BOTTOM
// edge, expressed as a % of a row's own WIDTH (percentage padding always
// resolves against width regardless of axis, so this scales exactly like
// the rows themselves) — reserved permanently at the end of the scrollable
// content. Without it, selecting the LAST row grows the list's true
// scrollHeight only while it's selected (every other row's overflow is
// absorbed by the row below it; the last one has nothing below it to
// absorb into), and the browser then clamps/re-settles scrollTop against
// that new, larger max, shifting every row above it out of alignment.
// 21.6% is measured, not derived from the frame's own -45%/220% numbers —
// a naive height-vs-aspect-ratio calc landed near 19.8% but still left a
// small measurable scrollHeight delta (~4px) between the last row and any
// other row selected; 21.6% is the value that actually zeroed it out
// (verified directly: compare scrollBox.scrollHeight with the last row
// selected vs. any other row — they must be identical). If this ever
// drifts again, re-measure the same way rather than recomputing from the
// frame's insets.
const REGION_LIST_BOTTOM_RESERVE_PERCENT = '21.6%'

// Per-row px nudges, ordered like REGION_LIST_ENTRIES — the row pitch
// itself is already correct (see REGION_LIST_LAYOUT above), these are just
// small manual touch-ups for an individual icon/label that sits slightly
// off within its own row.
const REGION_ICON_OFFSETS = [
  { x: 0, y: 5 },
  { x: 0, y: 5 },
  { x: 0, y: 5 },
  { x: 0, y: 5 },
  { x: 0, y: 5 },
  { x: 0, y: 20 },
  { x: 0, y: 20 },
  { x: 0, y: 20 },
  { x: 0, y: 20 },
  { x: 0, y: 20 },
] as const

const REGION_LABEL_OFFSETS = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
  { x: 0, y: 0 },
] as const

function percentRect(region: RegionOption) {
  return {
    left: `${region.left}%`,
    top: `${region.top}%`,
    width: `${region.width}%`,
    height: `${region.height}%`,
  }
}

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
  const confirmButtonGlow = useHoverActive()
  const [selectedId, setSelectedId] = useState<BoardShapeId>(initialShape)
  // True once the Custom Maps row is picked — takes over the sidebar
  // highlight and the bottom confirm button from the normal map regions,
  // rather than adding a whole separate confirm flow alongside them.
  const [isCustomSelected, setIsCustomSelected] = useState(false)
  const [isEditorOpen, setIsEditorOpen] = useState(false)
  // Spectator mode has no click of its own to update selectedId from — it
  // reads directly off the live initialShape prop instead, so it tracks
  // whatever the host is currently highlighting without needing its own
  // state sync.
  const selected = REGIONS.find((region) => region.id === (readOnly ? initialShape : selectedId)) ?? REGIONS[0]
  const listRef = useRef<HTMLDivElement>(null)

  // Picking the last row (Custom Maps) is the one case REGION_LIST_BOTTOM_RESERVE_PERCENT
  // can't fully solve on its own: that reserve keeps scrollHeight constant
  // across selections (so nothing resizes), but it also means the raw
  // scrollable max sits past where the last row's own box actually ends —
  // real scrollable dead space. Left alone, the browser's own focus-driven
  // scroll lands somewhere in that dead space instead of flush with the
  // row (scroll-padding-bottom was tried first and didn't reliably close
  // the gap). Forcing scrollTop to the row's own true bottom-minus-viewport
  // position is what actually lines it up — but setting it synchronously
  // (useLayoutEffect, right after the row commits) gets clobbered: Chrome's
  // own focus-driven scroll-into-view runs on a LATER frame, after our
  // effect, and wins. Deferring one animation frame runs our correction
  // after that native scroll has already settled, so it's the final word
  // instead of the first (confirmed by direct scrollTop measurement — the
  // synchronous version reliably landed ~20px short of the target).
  useLayoutEffect(() => {
    if (!isCustomSelected) return
    const frame = requestAnimationFrame(() => {
      const scrollBox = listRef.current
      if (!scrollBox) return
      const rows = scrollBox.querySelectorAll('button')
      const lastRow = rows[rows.length - 1] as HTMLElement | undefined
      if (!lastRow) return
      scrollBox.scrollTop = lastRow.offsetTop + lastRow.offsetHeight - scrollBox.clientHeight
    })
    return () => cancelAnimationFrame(frame)
  }, [isCustomSelected])

  // The reserve is still real, reachable scroll range as far as the browser
  // is concerned (that's what keeps scrollHeight constant) — so on top of
  // the click-triggered correction above, a manual scroll (wheel, drag,
  // keyboard) can push past the last row's true end into that dead space.
  // Correcting on every 'scroll' event (fired continuously while a gesture
  // is still in flight, including trackpad momentum) fought the browser's
  // own scroll physics — snapping scrollTop back mid-gesture ate the first
  // chunk of the next scroll-up attempt, which is what read as "stuck."
  // 'scrollend' fires once, only after the browser considers scrolling
  // (including momentum) fully settled, so this only corrects the final
  // rest position instead of interfering with an active gesture.
  useEffect(() => {
    const scrollBox = listRef.current
    if (!scrollBox) return
    const clampToTrueEnd = () => {
      const rows = scrollBox.querySelectorAll('button')
      const lastRow = rows[rows.length - 1] as HTMLElement | undefined
      if (!lastRow) return
      const trueMax = lastRow.offsetTop + lastRow.offsetHeight - scrollBox.clientHeight
      if (scrollBox.scrollTop > trueMax) scrollBox.scrollTop = trueMax
    }
    scrollBox.addEventListener('scrollend', clampToTrueEnd)
    return () => scrollBox.removeEventListener('scrollend', clampToTrueEnd)
  }, [])

  return (
    <div className="relative mx-auto w-full max-w-6xl animate-victory-in">
      <div className="relative w-full" style={{ aspectRatio: '1536 / 1024' }}>
        <img src={regionSelectMenuUrl} alt="World map region selection" className="absolute inset-0 h-full w-full select-none" draggable={false} />

        <div
          className="absolute snap-y snap-mandatory overflow-x-hidden overflow-y-auto pr-[1%] scrollbar-thin scrollbar-thumb-gold/60 scrollbar-track-transparent"
          style={{
            left: REGION_LIST_LAYOUT.left,
            top: REGION_LIST_LAYOUT.top,
            width: REGION_LIST_LAYOUT.width,
            height: REGION_LIST_LAYOUT.height,
            scrollPaddingTop: '0px',
          }}
          ref={listRef}
        >
          <div className="flex flex-col" style={{ paddingBottom: REGION_LIST_BOTTOM_RESERVE_PERCENT }}>
            {REGION_LIST_ENTRIES.map(({ region, iconUrl, name }, index) => {
            const isSelected = region ? !isCustomSelected && selected.id === region.id : isCustomSelected
            const iconOffset = REGION_ICON_OFFSETS[index]
            const labelOffset = REGION_LABEL_OFFSETS[index]
            return (
              <button
                key={region?.id ?? CUSTOM_MAPS_NAME}
                type="button"
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
                className="relative flex w-full shrink-0 items-center px-2 text-left font-display text-sm tracking-[0.08em] text-gold uppercase outline-none focus-visible:outline-2 focus-visible:outline-gold"
                style={{
                  aspectRatio: REGION_LIST_LAYOUT.rowAspectRatio,
                  // Skipped on the very last entry — a trailing gap past the
                  // real end of the list let the browser's own
                  // scroll-into-view-on-focus (triggered by clicking this
                  // row's button) snap past the true content end, revealing
                  // dead space and shifting every row above it out of
                  // alignment with the painted artwork.
                  marginBottom: index === REGION_LIST_ENTRIES.length - 1 ? undefined : REGION_LIST_LAYOUT.rowGapPercent,
                  scrollSnapAlign: 'start',
                  scrollSnapStop: 'always',
                  isolation: 'isolate',
                }}
              >
                {isSelected && (
                  <img
                    src={selectorBorderUrl}
                    alt=""
                    className="pointer-events-none absolute z-0 max-w-none object-fill"
                    style={{ ...REGION_SELECTOR_LAYOUT, pointerEvents: 'none' }}
                    draggable={false}
                  />
                )}
                <img
                  src={iconUrl}
                  alt=""
                  className="relative z-10 shrink-0 object-contain"
                  style={{
                    width: REGION_LIST_LAYOUT.iconWidthPercent,
                    aspectRatio: '1 / 1',
                    transform: `translate(${iconOffset.x}px, ${iconOffset.y}px)`,
                  }}
                  draggable={false}
                />
                <span
                  className="relative z-10 whitespace-nowrap text-[11px]"
                  style={{
                    transform: `translate(calc(${REGION_LIST_LAYOUT.labelOffsetX} + ${labelOffset.x}px), calc(${REGION_LIST_LAYOUT.labelOffsetY} + ${labelOffset.y}px))`,
                  }}
                >
                  {name}
                </span>
              </button>
            )
            })}
          </div>
        </div>

        {REGIONS.map((region, index) => {
          const isSelected = !isCustomSelected && selected.id === region.id
          const shieldOffset = REGION_SHIELD_OFFSETS[index]
          return (
            <button
              key={region.id}
              type="button"
              onClick={() => {
                if (readOnly) return
                setSelectedId(region.id)
                setIsCustomSelected(false)
                onSelectionChange?.(region.id)
              }}
              aria-label={`Select ${region.name}`}
              className="absolute outline-none focus-visible:outline-2 focus-visible:outline-gold"
              style={percentRect(region)}
            >
              {isSelected && (
                // Anchored ABOVE the box (bottom-full) rather than centered
                // over it — centering covered the banner's own label text.
                <img
                  src={shieldRegionSelectionUrl}
                  alt=""
                  className="pointer-events-none absolute bottom-full left-1/2 max-w-none object-contain opacity-90"
                  style={{
                    width: '85%',
                    height: '140%',
                    transform: `translate(calc(-50% + ${shieldOffset.x}px), calc(-6% + ${shieldOffset.y}px))`,
                  }}
                  draggable={false}
                />
              )}
            </button>
          )
        })}

        {!readOnly && (
          <button
            type="button"
            onClick={() => {
              if (isCustomSelected) {
                setIsEditorOpen(true)
                return
              }
              onConfirm(selected.id)
            }}
            aria-label={isCustomSelected ? 'Design a custom map' : `Select ${selected.name}`}
            className="absolute left-[41%] top-[88%] h-[8%] w-[44%] outline-none focus-visible:outline-2 focus-visible:outline-gold"
            {...confirmButtonGlow.handlers}
          >
            {/* Scaled on the IMAGE itself, not the button — the button
                scaling would grow the border around the BUTTON's center,
                but CONFIRM_BUTTON_SELECTOR_OFFSET moves the border off that
                center, so a button-level scale grew the far edge (left)
                more than the near edge on hover. Scaling here instead grows
                the border symmetrically around its own (offset) center. */}
            <img
              src={selectorBorderUrl}
              alt=""
              className="pointer-events-none absolute transition-[opacity,scale]"
              style={{
                ...selectorOverlayStyle(CONFIRM_BUTTON_SELECTOR_INSET.x, CONFIRM_BUTTON_SELECTOR_INSET.y),
                opacity: confirmButtonGlow.isActive ? CONFIRM_BUTTON_GLOW_ACTIVE_OPACITY : CONFIRM_BUTTON_GLOW_IDLE_OPACITY,
                translate: `${CONFIRM_BUTTON_SELECTOR_OFFSET.x}px ${CONFIRM_BUTTON_SELECTOR_OFFSET.y}px`,
                scale: confirmButtonGlow.isActive ? '1.02' : '1',
              }}
              draggable={false}
            />
          </button>
        )}
        {/* Kept visible even in readOnly (spectator) mode — a joiner
            watching the host browse maps still needs a way to leave the
            room, not just the host's own "back to lobby" affordance. */}
        <button
          type="button"
          onClick={onBack}
          aria-label={readOnly ? 'Leave room' : 'Back to setup'}
          className="absolute left-[3%] top-[3%] h-[10%] w-[8%] outline-none focus-visible:outline-2 focus-visible:outline-gold"
        />

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
    </div>
  )
}
