import { describe, expect, it } from 'vitest'
import {
  improvementLevelCost,
  canAffordImprovement,
  buyImprovementLevel,
  evaluateMetropolisPurchase,
  hasSpareMetropolisCity,
  metropolisHolderAfterPurchase,
  metropolisHolderLevel,
  ownCityVertexIds,
  purchaseClaimsMetropolis,
  unresolvedMetropolisClaimTrack,
  type MetropolisPlayerView,
  type MetropolisVertexIds,
} from './cityImprovements'
import { emptyCommodities, type Building, type CityImprovements, type MetropolisHolders } from './types'

describe('improvementLevelCost', () => {
  it('costs N commodities to reach level N', () => {
    expect(improvementLevelCost(1)).toBe(1)
    expect(improvementLevelCost(2)).toBe(2)
    expect(improvementLevelCost(5)).toBe(5)
  })
})

describe('canAffordImprovement', () => {
  it('is true when the player has enough of the matching commodity for the next level', () => {
    const commodities = { ...emptyCommodities(), paper: 2 }
    expect(canAffordImprovement(commodities, 'science', 1)).toBe(true) // level 1->2 costs 2
  })

  it('is false when short on the matching commodity', () => {
    const commodities = { ...emptyCommodities(), paper: 1 }
    expect(canAffordImprovement(commodities, 'science', 1)).toBe(false) // needs 2
  })

  it('is false at max level (5)', () => {
    const commodities = { ...emptyCommodities(), paper: 99 }
    expect(canAffordImprovement(commodities, 'science', 5)).toBe(false)
  })

  it('checks the correct commodity per track', () => {
    const commodities = { ...emptyCommodities(), cloth: 1 }
    expect(canAffordImprovement(commodities, 'trade', 0)).toBe(true) // level 0->1 costs 1 cloth
    expect(canAffordImprovement(commodities, 'science', 0)).toBe(false) // has no paper
  })
})

describe('buyImprovementLevel', () => {
  it('deducts the cost and increments the level', () => {
    const commodities = { ...emptyCommodities(), coin: 3 }
    const cityImprovements = { science: 0, trade: 0, politics: 2 }
    const result = buyImprovementLevel(commodities, cityImprovements, 'politics')
    expect(result.commodities.coin).toBe(0) // 3 - 3 (level 2->3 costs 3)
    expect(result.cityImprovements.politics).toBe(3)
  })

  it('does not mutate the inputs', () => {
    const commodities = { ...emptyCommodities(), paper: 1 }
    const cityImprovements = { science: 0, trade: 0, politics: 0 }
    buyImprovementLevel(commodities, cityImprovements, 'science')
    expect(commodities.paper).toBe(1)
    expect(cityImprovements.science).toBe(0)
  })

  it('leaves other tracks and other commodities untouched', () => {
    const commodities = { paper: 1, cloth: 5, coin: 5 }
    const cityImprovements = { science: 0, trade: 2, politics: 4 }
    const result = buyImprovementLevel(commodities, cityImprovements, 'science')
    expect(result.commodities).toEqual({ paper: 0, cloth: 5, coin: 5 })
    expect(result.cityImprovements).toEqual({ science: 1, trade: 2, politics: 4 })
  })
})

describe('metropolisHolderAfterPurchase', () => {
  it('a first-ever level-4 purchase claims the (previously unclaimed) metropolis', () => {
    expect(metropolisHolderAfterPurchase(null, 0, /* buyerId */ 3, /* newLevel */ 4)).toBe(3)
  })

  it('a purchase below level 4 never changes the holder', () => {
    expect(metropolisHolderAfterPurchase(null, 0, 3, 3)).toBe(null)
    expect(metropolisHolderAfterPurchase(1, 4, 3, 3)).toBe(1)
  })

  it('a second player reaching level 4 does NOT displace the existing level-4 holder', () => {
    expect(metropolisHolderAfterPurchase(1, 4, /* buyerId */ 2, /* newLevel */ 4)).toBe(1)
  })

  it('a different player reaching level 5 takes over from a level-4-only holder', () => {
    expect(metropolisHolderAfterPurchase(1, 4, /* buyerId */ 2, /* newLevel */ 5)).toBe(2)
  })

  it('the existing level-4 holder reaching level 5 themselves keeps control (now permanent)', () => {
    expect(metropolisHolderAfterPurchase(1, 4, /* buyerId */ 1, /* newLevel */ 5)).toBe(1)
  })

  it('a second player reaching level 5 does NOT displace an existing level-5 holder', () => {
    expect(metropolisHolderAfterPurchase(1, 5, /* buyerId */ 2, /* newLevel */ 5)).toBe(1)
  })
})

describe('purchaseClaimsMetropolis', () => {
  it('is false below level 4 — no Metropolis involved yet', () => {
    expect(purchaseClaimsMetropolis(null, 0, 3, 3)).toBe(false)
  })

  it('is true for a first-ever level-4 claim on an unclaimed track', () => {
    expect(purchaseClaimsMetropolis(null, 0, 3, 4)).toBe(true)
  })

  it('is false for a second player merely matching an existing level-4 holder — the incumbent keeps control', () => {
    expect(purchaseClaimsMetropolis(1, 4, 2, 4)).toBe(false)
  })

  it('is true for a different player overtaking a level-4-only holder by reaching level 5', () => {
    expect(purchaseClaimsMetropolis(1, 4, 2, 5)).toBe(true)
  })

  it('is false when the buyer already holds this track and is only leveling up further — nothing about the marker changes', () => {
    expect(purchaseClaimsMetropolis(1, 4, 1, 5)).toBe(false)
  })

  it('is false for a second player reaching level 5 against an existing level-5 holder', () => {
    expect(purchaseClaimsMetropolis(1, 5, 2, 5)).toBe(false)
  })
})

// --- Shared derivations (App.tsx's gate + GameHud's disabled state) --------

const NO_HOLDERS: MetropolisHolders = { science: null, trade: null, politics: null }
const NO_VERTEX_IDS: MetropolisVertexIds = { science: null, trade: null, politics: null }

const improvements = (partial: Partial<CityImprovements> = {}): CityImprovements => ({
  science: 0,
  trade: 0,
  politics: 0,
  ...partial,
})

const player = (id: number, partial: Partial<CityImprovements> = {}): MetropolisPlayerView => ({
  id,
  cityImprovements: improvements(partial),
})

const city = (ownerId: number): Building => ({ ownerId, type: 'city' })
const settlement = (ownerId: number): Building => ({ ownerId, type: 'settlement' })

describe('ownCityVertexIds', () => {
  it('returns only the given owner\'s CITY vertices, not their settlements or anyone else\'s', () => {
    const settlements: Record<string, Building> = {
      a: city(1),
      b: settlement(1),
      c: city(2),
      d: city(1),
    }
    expect(ownCityVertexIds(settlements, 1)).toEqual(['a', 'd'])
  })

  it('is empty for a player with no cities', () => {
    expect(ownCityVertexIds({ a: settlement(1) }, 1)).toEqual([])
  })
})

describe('hasSpareMetropolisCity', () => {
  it('is false with no cities at all', () => {
    expect(hasSpareMetropolisCity({ a: settlement(1) }, NO_VERTEX_IDS, 'science', 1)).toBe(false)
  })

  it('is true for any city when the track has no marker placed yet', () => {
    expect(hasSpareMetropolisCity({ a: city(1) }, NO_VERTEX_IDS, 'science', 1)).toBe(true)
  })

  it('is false when the player\'s only city already flies THIS track\'s Metropolis', () => {
    expect(hasSpareMetropolisCity({ a: city(1) }, { ...NO_VERTEX_IDS, science: 'a' }, 'science', 1)).toBe(false)
  })

  it('is true when a city already flies a DIFFERENT track\'s Metropolis — one per track per city is legal', () => {
    expect(hasSpareMetropolisCity({ a: city(1) }, { ...NO_VERTEX_IDS, trade: 'a' }, 'science', 1)).toBe(true)
  })

  it('is true when a second city is still free', () => {
    expect(
      hasSpareMetropolisCity({ a: city(1), b: city(1) }, { ...NO_VERTEX_IDS, science: 'a' }, 'science', 1),
    ).toBe(true)
  })
})

describe('metropolisHolderLevel', () => {
  it('is 0 when nobody holds the track', () => {
    expect(metropolisHolderLevel([player(1, { science: 4 })], NO_HOLDERS, 'science')).toBe(0)
  })

  it('reads the CURRENT holder\'s own level on that track', () => {
    const players = [player(1, { science: 5 }), player(2, { science: 4 })]
    expect(metropolisHolderLevel(players, { ...NO_HOLDERS, science: 1 }, 'science')).toBe(5)
  })

  it('is 0 when the holder id names nobody in the list', () => {
    expect(metropolisHolderLevel([player(1, { science: 4 })], { ...NO_HOLDERS, science: 99 }, 'science')).toBe(0)
  })
})

describe('evaluateMetropolisPurchase', () => {
  it('is neither a claim nor blocked for an ordinary low-level purchase', () => {
    const players = [player(1, { science: 1 })]
    expect(
      evaluateMetropolisPurchase(players, { a: city(1) }, NO_HOLDERS, NO_VERTEX_IDS, 'science', 1),
    ).toEqual({ claimsMetropolis: false, blocked: false })
  })

  it('claims (and is not blocked) when a level-3 player with a spare city buys level 4', () => {
    const players = [player(1, { science: 3 })]
    expect(
      evaluateMetropolisPurchase(players, { a: city(1) }, NO_HOLDERS, NO_VERTEX_IDS, 'science', 1),
    ).toEqual({ claimsMetropolis: true, blocked: false })
  })

  it('claims but IS blocked when that same player has no city to put the marker on', () => {
    const players = [player(1, { science: 3 })]
    expect(
      evaluateMetropolisPurchase(players, { a: settlement(1) }, NO_HOLDERS, NO_VERTEX_IDS, 'science', 1),
    ).toEqual({ claimsMetropolis: true, blocked: true })
  })

  it('derives the incumbent holder\'s level itself: a level-5 takeover claims, a matching level-4 does not', () => {
    const players = [player(1, { science: 4 }), player(2, { science: 3 }), player(3, { science: 4 })]
    const holders: MetropolisHolders = { ...NO_HOLDERS, science: 1 }
    const settlements: Record<string, Building> = { a: city(1), b: city(2), c: city(3) }
    // p2 buying level 4 only MATCHES the incumbent — no claim, so no gate.
    expect(
      evaluateMetropolisPurchase(players, settlements, holders, { ...NO_VERTEX_IDS, science: 'a' }, 'science', 2),
    ).toEqual({ claimsMetropolis: false, blocked: false })
    // p3 buying level 5 unseats a level-4-only incumbent.
    expect(
      evaluateMetropolisPurchase(players, settlements, holders, { ...NO_VERTEX_IDS, science: 'a' }, 'science', 3),
    ).toEqual({ claimsMetropolis: true, blocked: false })
  })

  it('does not re-gate the existing holder leveling their own track further', () => {
    const players = [player(1, { science: 4 })]
    // Their only city already flies this marker — without the "already holds
    // it" early-out this would read as blocked and refuse a legal purchase.
    expect(
      evaluateMetropolisPurchase(
        players,
        { a: city(1) },
        { ...NO_HOLDERS, science: 1 },
        { ...NO_VERTEX_IDS, science: 'a' },
        'science',
        1,
      ),
    ).toEqual({ claimsMetropolis: false, blocked: false })
  })
})

describe('unresolvedMetropolisClaimTrack', () => {
  it('is null when nobody has reached level 4 anywhere', () => {
    const players = [player(1, { science: 3, trade: 2 })]
    expect(
      unresolvedMetropolisClaimTrack(players, { a: city(1) }, NO_HOLDERS, NO_VERTEX_IDS, 1),
    ).toBe(null)
  })

  it('finds a level-4 purchase that was never placed', () => {
    const players = [player(1, { science: 4 })]
    expect(
      unresolvedMetropolisClaimTrack(players, { a: city(1) }, NO_HOLDERS, NO_VERTEX_IDS, 1),
    ).toBe('science')
  })

  it('is null once that claim has resolved', () => {
    const players = [player(1, { science: 4 })]
    expect(
      unresolvedMetropolisClaimTrack(
        players,
        { a: city(1) },
        { ...NO_HOLDERS, science: 1 },
        { ...NO_VERTEX_IDS, science: 'a' },
        1,
      ),
    ).toBe(null)
  })

  it('finds an unplaced level-5 takeover — the case with no "just buy it again" recovery', () => {
    const players = [player(1, { politics: 4 }), player(2, { politics: 5 })]
    expect(
      unresolvedMetropolisClaimTrack(
        players,
        { a: city(1), b: city(2) },
        { ...NO_HOLDERS, politics: 1 },
        { ...NO_VERTEX_IDS, politics: 'a' },
        2,
      ),
    ).toBe('politics')
  })

  it('is null for a second player who merely matched the incumbent at level 4', () => {
    const players = [player(1, { trade: 4 }), player(2, { trade: 4 })]
    expect(
      unresolvedMetropolisClaimTrack(
        players,
        { a: city(1), b: city(2) },
        { ...NO_HOLDERS, trade: 1 },
        { ...NO_VERTEX_IDS, trade: 'a' },
        2,
      ),
    ).toBe(null)
  })

  it('is null when the claim could not actually be placed — an unsatisfiable prompt would freeze End Turn', () => {
    const players = [player(1, { science: 4 })]
    expect(
      unresolvedMetropolisClaimTrack(players, { a: settlement(1) }, NO_HOLDERS, NO_VERTEX_IDS, 1),
    ).toBe(null)
  })

  it('is null for a player who is not in the list at all', () => {
    expect(
      unresolvedMetropolisClaimTrack([player(1, { science: 4 })], { a: city(1) }, NO_HOLDERS, NO_VERTEX_IDS, 9),
    ).toBe(null)
  })

  it('reports in IMPROVEMENT_TRACK_ORDER when more than one track somehow qualifies', () => {
    const players = [player(1, { science: 4, trade: 4 })]
    expect(
      unresolvedMetropolisClaimTrack(players, { a: city(1), b: city(1) }, NO_HOLDERS, NO_VERTEX_IDS, 1),
    ).toBe('science')
  })
})
