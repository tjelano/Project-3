import { useState } from 'react'
import {
  COMMODITY_LABELS,
  COMMODITY_ORDER,
  PROGRESS_CARD_LABELS,
  PROGRESS_CARD_VP_TYPES,
  RESOURCE_LABELS,
  RESOURCE_ORDER,
  type CommodityType,
  type Player,
  type ResourceType,
} from '../../game/types'
import { ResourceIcon } from './ResourceIcon'
import { CommodityIcon } from './CommodityIcon'

export interface OpponentHandPickerProps {
  target: Player
  mode: 'resourcesAndCommodities' | 'progressCards'
  maxPicks: number
  onConfirm: (picks: (ResourceType | CommodityType)[] | number[]) => void // number[] = progressCards indices, mirrors Task 6's index-based selection
  onCancel: () => void
}

// Cities & Knights Guild Dues (mode: 'resourcesAndCommodities') and
// Espionage (mode: 'progressCards') — both "look at a targeted opponent's
// hand and take some of it" cards, sharing this one picker. Reads props
// only: `target` is already the caller's own live copy of that player's
// state (players state is fully synced to every client, just never
// RENDERED for a non-viewer — see this task's own brief), so there's no
// fetch/broadcast needed to populate this, only the eventual take itself
// needs a trusted-apply broadcast (handled by the caller, not here).
//
// No outer modal chrome (backdrop, title, dialog role) — the caller
// composes this alongside a PlayerTargetPicker inside its own dialog
// shell (see GameHud.tsx), the same way TradeModal composes
// PlayerTargetPicker inside its own single box rather than each picker
// owning a competing full-screen wrapper.
export function OpponentHandPicker({ target, mode, maxPicks, onConfirm, onCancel }: OpponentHandPickerProps) {
  // Resource/commodity picks: a flat list of TYPES (repeats allowed), not
  // instance ids — a resource/commodity card has no natural per-instance
  // identity the way a progress card index does, so "picked 2 lumber" is
  // just the string 'lumber' appearing twice in this array. Guild Dues'
  // applyGuildDuesTake (App.tsx) consumes this shape directly.
  const [resourcePicks, setResourcePicks] = useState<(ResourceType | CommodityType)[]>([])
  // Progress-card picks: indices into target.progressCards, mirroring
  // Task 6's progressDiscardSelection — see nonVpEntries below for why the
  // index must be the ORIGINAL array index, not a position after filtering.
  const [cardPicks, setCardPicks] = useState<number[]>([])

  const totalAvailable =
    RESOURCE_ORDER.reduce((sum, resource) => sum + target.resources[resource], 0) +
    COMMODITY_ORDER.reduce((sum, commodity) => sum + target.commodities[commodity], 0)
  // Guild Dues: "take any 2 cards... from them" — mandatory 2, UNLESS the
  // target holds fewer than 2 total, in which case take all of them. Same
  // Math.min(2, handSize) shape applyWeddingEffect already uses in App.tsx
  // for the identical "take up to N, or fewer if they don't have N" rule.
  const requiredResourcePicks = Math.min(maxPicks, totalAvailable)

  const heldCount = (type: ResourceType | CommodityType): number =>
    (RESOURCE_ORDER as readonly string[]).includes(type)
      ? target.resources[type as ResourceType]
      : target.commodities[type as CommodityType]

  // Capped both per-type (can't pick more of one type than the target
  // actually holds) and in total (can't exceed requiredResourcePicks) —
  // same two-layer cap shape toggleDiscardSelection (App.tsx) already uses
  // for "pick up to a required count, never more than what's actually
  // there."
  const addResourcePick = (type: ResourceType | CommodityType) => {
    if (resourcePicks.length >= requiredResourcePicks) return
    const pickedCount = resourcePicks.filter((pick) => pick === type).length
    if (pickedCount >= heldCount(type)) return
    setResourcePicks((prev) => [...prev, type])
  }
  const removeResourcePick = (type: ResourceType | CommodityType) => {
    setResourcePicks((prev) => {
      const index = prev.lastIndexOf(type)
      if (index === -1) return prev
      return [...prev.slice(0, index), ...prev.slice(index + 1)]
    })
  }

  // Progress-card entries paired with their ORIGINAL index into
  // target.progressCards — filtering the array down to non-VP cards FIRST
  // and then keying off the filtered position would renumber every entry
  // after a removed VP card, and Espionage's applyEspionageTake (App.tsx)
  // reads straight off target.progressCards[cardIndex], so a renumbered
  // index would silently resolve to the wrong card (or the wrong-but-
  // adjacent one) on confirm. Mapping first, filtering second keeps each
  // entry's `index` pinned to its real position.
  const nonVpEntries = target.progressCards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => !PROGRESS_CARD_VP_TYPES.has(card))
  const cardPickCap = Math.min(maxPicks, nonVpEntries.length)

  const toggleCardPick = (index: number) => {
    setCardPicks((prev) => {
      if (prev.includes(index)) return prev.filter((i) => i !== index)
      if (prev.length >= cardPickCap) return prev
      return [...prev, index]
    })
  }

  // Guild Dues' take is mandatory (exactly requiredResourcePicks, which is
  // already capped to "as many as they have" above) — Confirm stays
  // disabled until that exact count is reached. Espionage's take is
  // OPTIONAL ("you may take 1") — Confirm is always available; 0 selected
  // just means "looked, took nothing," and cardPickCap above already stops
  // more than maxPicks (1) from ever being selected.
  const resourcesReady = resourcePicks.length === requiredResourcePicks
  const canConfirm = mode === 'resourcesAndCommodities' ? resourcesReady : true

  const handleConfirm = () => {
    if (!canConfirm) return
    onConfirm(mode === 'resourcesAndCommodities' ? resourcePicks : cardPicks)
  }

  return (
    <>
      {mode === 'resourcesAndCommodities' ? (
        totalAvailable === 0 ? (
          <p className="mb-3 text-center font-body text-xs text-white/50">{target.name} has no cards to take.</p>
        ) : (
          <>
            <p className="mb-2 text-center font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">
              {target.name}&rsquo;s hand — choose {requiredResourcePicks}
            </p>
            <div className="mb-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {RESOURCE_ORDER.filter((resource) => target.resources[resource] > 0).map((resource) => {
                const picked = resourcePicks.filter((pick) => pick === resource).length
                const held = target.resources[resource]
                return (
                  <div
                    key={resource}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <ResourceIcon resource={resource} className="h-4 w-4 text-white/85" />
                      <span className="font-body text-[11px] text-white/75">{RESOURCE_LABELS[resource]}</span>
                      <span className="font-data text-[10px] text-white/40">×{held}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={picked === 0}
                        onClick={() => removeResourcePick(resource)}
                        aria-label={`Take one fewer ${RESOURCE_LABELS[resource]}`}
                        className="h-5 w-5 rounded-full border border-white/20 text-white/70 transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="w-4 text-center font-data text-xs tabular-nums text-gold">{picked}</span>
                      <button
                        type="button"
                        disabled={picked >= held || resourcePicks.length >= requiredResourcePicks}
                        onClick={() => addResourcePick(resource)}
                        aria-label={`Take one more ${RESOURCE_LABELS[resource]}`}
                        className="h-5 w-5 rounded-full border border-white/20 text-white/70 transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
              {COMMODITY_ORDER.filter((commodity) => target.commodities[commodity] > 0).map((commodity) => {
                const picked = resourcePicks.filter((pick) => pick === commodity).length
                const held = target.commodities[commodity]
                return (
                  <div
                    key={commodity}
                    className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <CommodityIcon commodity={commodity} className="h-4 w-4 text-white/85" />
                      <span className="font-body text-[11px] text-white/75">{COMMODITY_LABELS[commodity]}</span>
                      <span className="font-data text-[10px] text-white/40">×{held}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={picked === 0}
                        onClick={() => removeResourcePick(commodity)}
                        aria-label={`Take one fewer ${COMMODITY_LABELS[commodity]}`}
                        className="h-5 w-5 rounded-full border border-white/20 text-white/70 transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="w-4 text-center font-data text-xs tabular-nums text-gold">{picked}</span>
                      <button
                        type="button"
                        disabled={picked >= held || resourcePicks.length >= requiredResourcePicks}
                        onClick={() => addResourcePick(commodity)}
                        aria-label={`Take one more ${COMMODITY_LABELS[commodity]}`}
                        className="h-5 w-5 rounded-full border border-white/20 text-white/70 transition-colors hover:border-gold/50 hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )
      ) : nonVpEntries.length === 0 ? (
        <p className="mb-3 text-center font-body text-xs text-white/50">{target.name} has no progress cards to take.</p>
      ) : (
        <>
          <p className="mb-2 text-center font-body text-[10px] tracking-[0.2em] text-white/50 uppercase">
            {target.name}&rsquo;s progress cards
          </p>
          <div className="mb-3 grid grid-cols-2 gap-1.5">
            {nonVpEntries.map(({ card, index }) => {
              const selected = cardPicks.includes(index)
              return (
                <button
                  key={`${card}-${index}`}
                  type="button"
                  onClick={() => toggleCardPick(index)}
                  disabled={!selected && cardPicks.length >= cardPickCap}
                  className={`rounded-lg border px-2 py-2.5 text-center font-body text-[11px] transition-colors ${
                    selected ? 'border-gold bg-gold/15 text-gold' : 'border-white/10 bg-white/5 text-white/75 hover:border-white/30'
                  } disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {PROGRESS_CARD_LABELS[card]}
                </button>
              )
            })}
          </div>
        </>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-glass-border bg-white/5 py-2 font-body text-[10px] tracking-[0.15em] text-white/70 uppercase transition-colors hover:border-white/30"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!canConfirm}
          onClick={handleConfirm}
          className="flex-1 rounded-lg bg-gradient-to-b from-gold to-gold-deep py-2 font-display text-xs font-semibold text-board-navy transition-opacity disabled:cursor-not-allowed disabled:opacity-30"
        >
          Confirm
        </button>
      </div>
    </>
  )
}
