import { describe, expect, it } from 'vitest'
import { autoDiscardCounts, applyDiscardCounts } from './discard'
import { emptyResources, emptyCommodities } from './types'

describe('autoDiscardCounts', () => {
  it('falls through to commodities when resources alone cannot satisfy required', () => {
    // Commodity-heavy, resource-poor hand: only 2 resources total but a
    // required of 5 — this is exactly the scenario the original
    // stuck-discard concern was about (a disconnected commodity-heavy
    // player whose auto-discard could empty their resources and still
    // leave them stuck over the limit forever).
    const resources = { ...emptyResources(), lumber: 2 }
    const commodities = { ...emptyCommodities(), paper: 3, cloth: 2 }
    const required = 5

    const counts = autoDiscardCounts(resources, commodities, required)

    const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)
    expect(total).toBe(required)
    // Both resource and commodity types must be represented — resources
    // exhausted first (all 2 lumber), then commodities pick up the rest.
    expect(counts.lumber).toBe(2)
    const commodityTaken = (counts.paper ?? 0) + (counts.cloth ?? 0)
    expect(commodityTaken).toBe(3)
  })

  it('behaves as before for a resources-only hand (no commodities)', () => {
    const resources = { ...emptyResources(), grain: 4, ore: 3 }
    const commodities = emptyCommodities()
    const required = 5

    const counts = autoDiscardCounts(resources, commodities, required)

    const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)
    expect(total).toBe(required)
    // Greedy by held-count descending: grain (4) taken fully, then 1 from ore.
    expect(counts.grain).toBe(4)
    expect(counts.ore).toBe(1)
    expect(counts.paper).toBeUndefined()
    expect(counts.cloth).toBeUndefined()
    expect(counts.coin).toBeUndefined()
  })

  it('does not over-take when the hand holds more of both than required needs', () => {
    const resources = { ...emptyResources(), lumber: 10, brick: 10 }
    const commodities = { ...emptyCommodities(), paper: 10 }
    const required = 3

    const counts = autoDiscardCounts(resources, commodities, required)

    const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)
    expect(total).toBe(required)
    // Resources alone (20 held) already exceed required, so commodities
    // should never be touched.
    expect(counts.paper).toBeUndefined()
  })
})

describe('applyDiscardCounts', () => {
  it('deducts BOTH resources and commodities from a mixed counts object (regression: pre-Task-10 confirmDiscard only recognized ResourceType prefixes and silently dropped commodity selections)', () => {
    // Before the Task 10 fix, confirmDiscard's card-id-prefix parser only
    // validated against RESOURCE_ORDER, so a player selecting 2 resources +
    // 2 commodities to satisfy a required-4 discard would build a `counts`
    // object missing the commodity entries entirely — applyDiscard would
    // then only ever see (and deduct) the resource half, silently leaving
    // the player still over the limit while marked done discarding. This
    // test builds the counts object a CORRECT parser produces (both keys
    // present) and asserts both totals drop by exactly the right amounts —
    // it would fail if this function only handled resource keys.
    const resources = { ...emptyResources(), lumber: 3, brick: 2 }
    const commodities = { ...emptyCommodities(), paper: 2, cloth: 1 }
    const counts = { lumber: 1, brick: 1, paper: 2, cloth: 1 }

    const result = applyDiscardCounts(resources, commodities, counts)

    expect(result.resources.lumber).toBe(2)
    expect(result.resources.brick).toBe(1)
    expect(result.commodities.paper).toBe(0)
    expect(result.commodities.cloth).toBe(0)

    const resourceTotal = Object.values(result.resources).reduce((sum, n) => sum + n, 0)
    const commodityTotal = Object.values(result.commodities).reduce((sum, n) => sum + n, 0)
    expect(resourceTotal).toBe(3) // was 5, discarded 2
    expect(commodityTotal).toBe(0) // was 3, discarded 3
  })

  it('does not mutate the inputs', () => {
    const resources = { ...emptyResources(), wool: 3 }
    const commodities = { ...emptyCommodities(), coin: 2 }
    const counts = { wool: 1, coin: 1 }

    applyDiscardCounts(resources, commodities, counts)

    expect(resources.wool).toBe(3)
    expect(commodities.coin).toBe(2)
  })

  it('ignores an unrecognized key without touching valid entries', () => {
    const resources = { ...emptyResources(), ore: 2 }
    const commodities = emptyCommodities()
    const counts = { ore: 1, bogus: 5 } as unknown as Parameters<typeof applyDiscardCounts>[2]

    const result = applyDiscardCounts(resources, commodities, counts)

    expect(result.resources.ore).toBe(1)
  })
})
