import { describe, expect, it } from 'vitest'
import {
  improvementLevelCost,
  canAffordImprovement,
  buyImprovementLevel,
  metropolisHolderAfterPurchase,
  purchaseClaimsMetropolis,
} from './cityImprovements'
import { emptyCommodities } from './types'

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
