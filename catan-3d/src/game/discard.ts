import {
  COMMODITY_ORDER,
  RESOURCE_ORDER,
  totalCommodityCount,
  totalResourceCount,
  type Commodities,
  type CommodityType,
  type ResourceType,
  type Resources,
} from './types'

// The hand size the 7-card discard rule is measured against. Official
// Cities & Knights counts resource AND commodity cards together ("resource
// cards + commodity cards", CN3087); base Catan counts resources only, so
// commodities fold in exactly when the citiesAndKnightsCommodities house
// rule is on — that's what `countsCommodities` carries.
//
// A RULE, not an incidental expression: it was previously inlined at ~8
// separate sites (the 7-roll over-limit check, the discard-queue self-heal,
// the selection cap, the confirm check, the auto-discard timeout, the
// snapshot restore, and the HUD's own hand-size/discard-risk indicator).
// Every one of those has to agree — a single site drifting means a player
// is asked to discard on one screen and not another, or selects a cap that
// doesn't match what confirm requires. One definition here instead.
export function discardHandSize(
  resources: Resources,
  commodities: Commodities,
  countsCommodities: boolean,
): number {
  return totalResourceCount(resources) + (countsCommodities ? totalCommodityCount(commodities) : 0)
}

// Deterministic forced discard for a player who never confirmed one in
// time — greedily takes from whichever resource they're holding the most
// of first, so the loss is spread across their hand rather than wiping out
// a single resource type. Only needs to be deterministic, not "smart": this
// only ever runs as a fallback for someone who wasn't there to choose.
// Resources are exhausted first, then commodities pick up the remainder —
// without this second pass, a commodity-heavy hand with too few resources
// could hit `remaining > 0` forever with nothing left for the resource loop
// to take, since applyDiscard (App.tsx) only ever removes what this
// function reports.
export function autoDiscardCounts(
  resources: Resources,
  commodities: Commodities,
  required: number,
): Partial<Record<ResourceType | CommodityType, number>> {
  const counts: Partial<Record<ResourceType | CommodityType, number>> = {}
  let remaining = required
  const byHeldResourceCount = [...RESOURCE_ORDER].sort((a, b) => resources[b] - resources[a])
  for (const type of byHeldResourceCount) {
    if (remaining <= 0) break
    const take = Math.min(resources[type], remaining)
    if (take > 0) {
      counts[type] = take
      remaining -= take
    }
  }
  const byHeldCommodityCount = [...COMMODITY_ORDER].sort((a, b) => commodities[b] - commodities[a])
  for (const type of byHeldCommodityCount) {
    if (remaining <= 0) break
    const take = Math.min(commodities[type], remaining)
    if (take > 0) {
      counts[type] = take
      remaining -= take
    }
  }
  return counts
}

// Pure "counts -> resulting resources/commodities" computation used by
// App.tsx's applyDiscard, the single trusted-apply path both the local
// discarding actor and online onDiscardConfirmed receivers funnel through.
// Extracted so it's unit-testable without React state/setPlayers.
//
// Each key in `counts` is branched on RESOURCE_ORDER/COMMODITY_ORDER
// membership, not on a shared object, so a resource-only counts parser
// (the pre-Task-10 bug in confirmDiscard's id prefix check) would silently
// drop any commodity keys before they ever reached this function — this
// function itself has always applied both correctly once given a proper
// counts object; the regression lived upstream in how `counts` got built.
export function applyDiscardCounts(
  resources: Resources,
  commodities: Commodities,
  counts: Partial<Record<ResourceType | CommodityType, number>>,
): { resources: Resources; commodities: Commodities } {
  const nextResources = { ...resources }
  const nextCommodities = { ...commodities }
  for (const [type, count] of Object.entries(counts)) {
    // Broadcast-sourced on the receiving end (the local path only ever
    // produces valid ResourceType/CommodityType keys and finite counts from
    // the player's own confirmed card selection) — validated here too since
    // this function is the one trusted-apply computation both sides funnel
    // through. A bogus key/count would otherwise write NaN into a real
    // count permanently.
    if (!Number.isFinite(count)) {
      console.error('[Catan] Ignoring invalid discard entry:', type, count)
      continue
    }
    if (RESOURCE_ORDER.includes(type as ResourceType)) {
      nextResources[type as ResourceType] -= count as number
    } else if (COMMODITY_ORDER.includes(type as CommodityType)) {
      nextCommodities[type as CommodityType] -= count as number
    } else {
      console.error('[Catan] Ignoring invalid discard entry:', type, count)
    }
  }
  return { resources: nextResources, commodities: nextCommodities }
}
