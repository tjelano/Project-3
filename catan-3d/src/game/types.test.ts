import { describe, expect, it } from 'vitest'
import {
  LARGEST_ARMY_VP,
  LONGEST_ROAD_VP,
  WINNING_SCORE,
  buildDevCardDeck,
  buildSetupOrder,
  canAfford,
  createInitialPlayers,
  deductCost,
  discardRandomHalf,
  getPlayerScore,
  getPublicScore,
  getScoreBreakdown,
  removeOne,
  totalResourceCount,
  type Building,
  type Player,
} from './types'

function playerWith(overrides: Partial<Player> = {}): Player {
  return { ...createInitialPlayers(1)[0], ...overrides }
}

const NO_TROPHIES = [null, null] as const

describe('buildSetupOrder', () => {
  it('produces the snake order for each supported player count', () => {
    expect(buildSetupOrder(2)).toEqual([0, 1, 1, 0])
    expect(buildSetupOrder(3)).toEqual([0, 1, 2, 2, 1, 0])
    expect(buildSetupOrder(4)).toEqual([0, 1, 2, 3, 3, 2, 1, 0])
  })

  it('gives every player exactly two placements', () => {
    for (const count of [2, 3, 4]) {
      const order = buildSetupOrder(count)
      expect(order).toHaveLength(count * 2)
      for (let i = 0; i < count; i++) {
        expect(order.filter((p) => p === i)).toHaveLength(2)
      }
    }
  })
})

describe('buildDevCardDeck', () => {
  it('matches the standard 25-card distribution', () => {
    const deck = buildDevCardDeck()
    const count = (t: string) => deck.filter((c) => c === t).length
    expect(deck).toHaveLength(25)
    expect(count('knight')).toBe(14)
    expect(count('victoryPoint')).toBe(5)
    expect(count('roadBuilding')).toBe(2)
    expect(count('yearOfPlenty')).toBe(2)
    expect(count('monopoly')).toBe(2)
  })
})

describe('getScoreBreakdown', () => {
  const settlements: Record<string, Building> = {
    v1: { ownerId: 1, type: 'settlement' },
    v2: { ownerId: 1, type: 'city' },
    v3: { ownerId: 2, type: 'settlement' },
  }

  it('scores 1 per settlement and 2 per city, counting only its own buildings', () => {
    const score = getScoreBreakdown(playerWith({ id: 1 }), settlements, ...NO_TROPHIES)
    expect(score.settlements).toBe(1)
    expect(score.cities).toBe(1)
    expect(score.total).toBe(3)
  })

  it('adds hidden Victory Point cards to the true total', () => {
    const player = playerWith({ id: 1, devCards: ['victoryPoint', 'knight', 'victoryPoint'] })
    const score = getScoreBreakdown(player, settlements, ...NO_TROPHIES)
    expect(score.victoryPointCards).toBe(2)
    expect(score.total).toBe(5) // 1 settlement + 2 city + 2 cards
  })

  it('adds the trophy bonuses only to their holders', () => {
    const p1 = playerWith({ id: 1 })
    expect(getScoreBreakdown(p1, settlements, 1, null).longestRoad).toBe(LONGEST_ROAD_VP)
    expect(getScoreBreakdown(p1, settlements, null, 1).largestArmy).toBe(LARGEST_ARMY_VP)
    expect(getScoreBreakdown(p1, settlements, 2, 2).longestRoad).toBe(0)
    expect(getScoreBreakdown(p1, settlements, 1, 1).total).toBe(3 + LONGEST_ROAD_VP + LARGEST_ARMY_VP)
  })

  it('keeps getPlayerScore in step with the breakdown total', () => {
    const player = playerWith({ id: 1, devCards: ['victoryPoint'] })
    expect(getPlayerScore(player, settlements, 1, null)).toBe(
      getScoreBreakdown(player, settlements, 1, null).total,
    )
  })
})

// --- S0-3 regression -----------------------------------------------------
// Victory Point cards are face-down in real Catan. The live HUD must never
// reveal them, or a hot-seat game leaks every opponent's hand.
describe('getPublicScore', () => {
  const settlements: Record<string, Building> = {
    v1: { ownerId: 1, type: 'settlement' },
    v2: { ownerId: 1, type: 'city' },
  }

  it('excludes hidden Victory Point cards', () => {
    const player = playerWith({ id: 1, devCards: ['victoryPoint', 'victoryPoint'] })
    expect(getPublicScore(player, settlements, ...NO_TROPHIES)).toBe(3)
    expect(getPlayerScore(player, settlements, ...NO_TROPHIES)).toBe(5)
  })

  it('still counts buildings and both trophies, which are public information', () => {
    const player = playerWith({ id: 1, devCards: ['victoryPoint'] })
    expect(getPublicScore(player, settlements, 1, 1)).toBe(3 + LONGEST_ROAD_VP + LARGEST_ARMY_VP)
  })

  it('matches the true score for a player holding no Victory Point cards', () => {
    const player = playerWith({ id: 1, devCards: ['knight', 'monopoly'] })
    expect(getPublicScore(player, settlements, ...NO_TROPHIES)).toBe(
      getPlayerScore(player, settlements, ...NO_TROPHIES),
    )
  })

  it('can hide a win in progress — public 9 while the true score is already 10', () => {
    const nine: Record<string, Building> = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`v${i}`, { ownerId: 1, type: 'settlement' as const }]),
    )
    const player = playerWith({ id: 1, devCards: ['victoryPoint'] })
    expect(getPublicScore(player, nine, ...NO_TROPHIES)).toBe(9)
    expect(getPlayerScore(player, nine, ...NO_TROPHIES)).toBe(WINNING_SCORE)
  })
})

describe('resource helpers', () => {
  it('canAfford requires every line of the cost', () => {
    const wallet = { lumber: 1, brick: 1, wool: 0, grain: 1, ore: 0 }
    expect(canAfford(wallet, { lumber: 1, brick: 1 })).toBe(true)
    expect(canAfford(wallet, { lumber: 1, brick: 1, wool: 1 })).toBe(false)
  })

  it('deductCost subtracts without mutating the original wallet', () => {
    const wallet = { lumber: 2, brick: 2, wool: 0, grain: 0, ore: 0 }
    const after = deductCost(wallet, { lumber: 1, brick: 1 })
    expect(after).toEqual({ lumber: 1, brick: 1, wool: 0, grain: 0, ore: 0 })
    expect(wallet.lumber).toBe(2)
  })

  it('removeOne drops a single instance and leaves the rest in order', () => {
    expect(removeOne(['knight', 'monopoly', 'knight'], 'knight')).toEqual(['monopoly', 'knight'])
    expect(removeOne(['knight'], 'monopoly')).toEqual(['knight'])
  })

  it('discardRandomHalf rounds down and never discards from a hand of 7 or fewer', () => {
    const seven = { lumber: 7, brick: 0, wool: 0, grain: 0, ore: 0 }
    expect(discardRandomHalf(seven).discarded).toBe(3)

    const nine = { lumber: 5, brick: 4, wool: 0, grain: 0, ore: 0 }
    const result = discardRandomHalf(nine)
    expect(result.discarded).toBe(4)
    expect(totalResourceCount(result.resources)).toBe(5)
  })

  it('discardRandomHalf never drives any resource negative', () => {
    for (let i = 0; i < 50; i++) {
      const hand = { lumber: 3, brick: 1, wool: 4, grain: 2, ore: 1 } // 11 cards
      const { resources, discarded } = discardRandomHalf(hand)
      expect(discarded).toBe(5)
      for (const amount of Object.values(resources)) expect(amount).toBeGreaterThanOrEqual(0)
      expect(totalResourceCount(resources)).toBe(6)
    }
  })
})

describe('createInitialPlayers', () => {
  it('starts every player empty-handed with no trophies in progress', () => {
    for (const player of createInitialPlayers(4)) {
      expect(totalResourceCount(player.resources)).toBe(0)
      expect(player.devCards).toEqual([])
      expect(player.devCardsBoughtThisTurn).toEqual([])
      expect(player.knightsPlayed).toBe(0)
    }
  })

  it('assigns distinct ids and colors', () => {
    const players = createInitialPlayers(4)
    expect(new Set(players.map((p) => p.id)).size).toBe(4)
    expect(new Set(players.map((p) => p.colorToken)).size).toBe(4)
  })
})
