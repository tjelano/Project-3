import { describe, expect, it } from 'vitest'
import {
  LARGEST_ARMY_VP,
  LONGEST_ROAD_VP,
  STARTING_CITIES,
  STARTING_ROADS,
  STARTING_SETTLEMENTS,
  STARTING_SHIPS,
  WINNING_SCORE,
  IMPROVEMENT_TRACK_ORDER,
  PROGRESS_CARD_ORDER,
  PROGRESS_CARD_DECK_COMPOSITION,
  PROGRESS_CARD_TRACK,
  KNIGHT_STARTING_SUPPLY,
  buildDevCardDeck,
  buildSetupOrder,
  canAfford,
  createInitialPlayers,
  deductCost,
  emptyCommodities,
  getPlayerScore,
  getPublicScore,
  getScoreBreakdown,
  removeOne,
  totalResourceCount,
  totalCommodityCount,
  type Building,
  type MetropolisHolders,
  type Player,
  type ProgressCardType,
} from './types'

function playerWith(overrides: Partial<Player> = {}): Player {
  return { ...createInitialPlayers(1)[0], ...overrides }
}

const NO_TROPHIES = [null, null] as const
const NO_METROPOLIS_HOLDERS: MetropolisHolders = { science: null, trade: null, politics: null }
// Cities & Knights Merchant (Task 13) — getScoreBreakdown/getPlayerScore/
// getPublicScore all gained a trailing merchantHolderId parameter; every
// pre-existing call site below is indifferent to it (none of those tests
// are about the Merchant), so they all just pass "nobody holds it."
const NO_MERCHANT_HOLDER: number | null = null

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
  it('matches the standard 25-card distribution at the default target', () => {
    const deck = buildDevCardDeck()
    const count = (t: string) => deck.filter((c) => c === t).length
    expect(deck).toHaveLength(25)
    expect(count('knight')).toBe(14)
    expect(count('victoryPoint')).toBe(5)
    expect(count('roadBuilding')).toBe(2)
    expect(count('yearOfPlenty')).toBe(2)
    expect(count('monopoly')).toBe(2)
  })

  it('scales every card type up proportionally for a higher victory point target', () => {
    const deck = buildDevCardDeck(WINNING_SCORE * 2)
    const count = (t: string) => deck.filter((c) => c === t).length
    expect(count('knight')).toBe(28)
    expect(count('victoryPoint')).toBe(10)
    expect(count('roadBuilding')).toBe(4)
    expect(count('yearOfPlenty')).toBe(4)
    expect(count('monopoly')).toBe(4)
  })

  it('never shrinks the deck below standard for a target below WINNING_SCORE', () => {
    const deck = buildDevCardDeck(3)
    expect(deck).toHaveLength(25)
  })
})

describe('getScoreBreakdown', () => {
  const settlements: Record<string, Building> = {
    v1: { ownerId: 1, type: 'settlement' },
    v2: { ownerId: 1, type: 'city' },
    v3: { ownerId: 2, type: 'settlement' },
  }

  it('scores 1 per settlement and 2 per city, counting only its own buildings', () => {
    const score = getScoreBreakdown(playerWith({ id: 1 }), settlements, ...NO_TROPHIES, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER)
    expect(score.settlements).toBe(1)
    expect(score.cities).toBe(1)
    expect(score.total).toBe(3)
  })

  it('adds hidden Victory Point cards to the true total', () => {
    const player = playerWith({ id: 1, devCards: ['victoryPoint', 'knight', 'victoryPoint'] })
    const score = getScoreBreakdown(player, settlements, ...NO_TROPHIES, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER)
    expect(score.victoryPointCards).toBe(2)
    expect(score.total).toBe(5) // 1 settlement + 2 city + 2 cards
  })

  it('adds the trophy bonuses only to their holders', () => {
    const p1 = playerWith({ id: 1 })
    expect(getScoreBreakdown(p1, settlements, 1, null, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER).longestRoad).toBe(LONGEST_ROAD_VP)
    expect(getScoreBreakdown(p1, settlements, null, 1, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER).largestArmy).toBe(LARGEST_ARMY_VP)
    expect(getScoreBreakdown(p1, settlements, 2, 2, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER).longestRoad).toBe(0)
    expect(getScoreBreakdown(p1, settlements, 1, 1, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER).total).toBe(
      3 + LONGEST_ROAD_VP + LARGEST_ARMY_VP,
    )
  })

  it('keeps getPlayerScore in step with the breakdown total', () => {
    const player = playerWith({ id: 1, devCards: ['victoryPoint'] })
    expect(getPlayerScore(player, settlements, 1, null, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER)).toBe(
      getScoreBreakdown(player, settlements, 1, null, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER).total,
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
    expect(getPublicScore(player, settlements, ...NO_TROPHIES, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER)).toBe(3)
    expect(getPlayerScore(player, settlements, ...NO_TROPHIES, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER)).toBe(5)
  })

  it('still counts buildings and both trophies, which are public information', () => {
    const player = playerWith({ id: 1, devCards: ['victoryPoint'] })
    expect(getPublicScore(player, settlements, 1, 1, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER)).toBe(
      3 + LONGEST_ROAD_VP + LARGEST_ARMY_VP,
    )
  })

  it('matches the true score for a player holding no Victory Point cards', () => {
    const player = playerWith({ id: 1, devCards: ['knight', 'monopoly'] })
    expect(getPublicScore(player, settlements, ...NO_TROPHIES, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER)).toBe(
      getPlayerScore(player, settlements, ...NO_TROPHIES, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER),
    )
  })

  it('can hide a win in progress — public 9 while the true score is already 10', () => {
    const nine: Record<string, Building> = Object.fromEntries(
      Array.from({ length: 9 }, (_, i) => [`v${i}`, { ownerId: 1, type: 'settlement' as const }]),
    )
    const player = playerWith({ id: 1, devCards: ['victoryPoint'] })
    expect(getPublicScore(player, nine, ...NO_TROPHIES, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER)).toBe(9)
    expect(getPlayerScore(player, nine, ...NO_TROPHIES, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER)).toBe(WINNING_SCORE)
  })
})

describe('emptyCommodities', () => {
  it('returns all three commodities at zero', () => {
    expect(emptyCommodities()).toEqual({ paper: 0, cloth: 0, coin: 0 })
  })
})

describe('resource helpers', () => {
  it('canAfford requires every line of the cost', () => {
    const wallet = { lumber: 1, brick: 1, wool: 0, grain: 1, ore: 0 }
    expect(canAfford(wallet, { lumber: 1, brick: 1 })).toBe(true)
    expect(canAfford(wallet, { lumber: 1, brick: 1, wool: 1 })).toBe(false)
  })

  it('canAfford returns true for exact cost', () => {
    const wallet = { lumber: 1, brick: 1, wool: 0, grain: 0, ore: 0 }
    expect(canAfford(wallet, { lumber: 1, brick: 1 })).toBe(true)
  })

  it('canAfford returns true for an empty cost', () => {
    const wallet = { lumber: 1, brick: 0, wool: 0, grain: 0, ore: 0 }
    expect(canAfford(wallet, {})).toBe(true)
  })

  it('canAfford handles negative amounts gracefully', () => {
    const wallet = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }
    expect(canAfford(wallet, { lumber: -1 })).toBe(true) // Math is math
  })

  it('deductCost subtracts without mutating the original wallet', () => {
    const wallet = { lumber: 2, brick: 2, wool: 0, grain: 0, ore: 0 }
    const after = deductCost(wallet, { lumber: 1, brick: 1 })
    expect(after).toEqual({ lumber: 1, brick: 1, wool: 0, grain: 0, ore: 0 })
    expect(wallet.lumber).toBe(2)
  })

  it('deductCost handles empty cost correctly', () => {
    const wallet = { lumber: 2, brick: 2, wool: 0, grain: 0, ore: 0 }
    const after = deductCost(wallet, {})
    expect(after).toEqual({ lumber: 2, brick: 2, wool: 0, grain: 0, ore: 0 })
    expect(wallet).not.toBe(after) // It should be a new object
  })

  it('removeOne drops a single instance and leaves the rest in order', () => {
    expect(removeOne(['knight', 'monopoly', 'knight'], 'knight')).toEqual(['monopoly', 'knight'])
    expect(removeOne(['knight'], 'monopoly')).toEqual(['knight'])
  })

  it('totalResourceCount sums all resources correctly', () => {
    const wallet = { lumber: 1, brick: 2, wool: 3, grain: 4, ore: 5 }
    expect(totalResourceCount(wallet)).toBe(15)
  })

  it('totalResourceCount returns 0 for an empty wallet', () => {
    const wallet = { lumber: 0, brick: 0, wool: 0, grain: 0, ore: 0 }
    expect(totalResourceCount(wallet)).toBe(0)
  })

  it('totalCommodityCount sums all commodities correctly', () => {
    const commodities = { paper: 1, cloth: 2, coin: 3 }
    expect(totalCommodityCount(commodities)).toBe(6)
  })

  it('totalCommodityCount returns 0 for an empty wallet', () => {
    const commodities = { paper: 0, cloth: 0, coin: 0 }
    expect(totalCommodityCount(commodities)).toBe(0)
  })
})

describe('getScoreBreakdown metropolis VP', () => {
  it('adds 2 VP per track the player holds the Metropolis for', () => {
    const player = playerWith({ id: 1 })
    const holders: MetropolisHolders = { science: 1, trade: 1, politics: 2 }
    const breakdown = getScoreBreakdown(player, {}, null, null, holders, NO_MERCHANT_HOLDER)
    expect(breakdown.metropolis).toBe(4) // science + trade, not politics
  })

  it('gives 0 metropolis VP when the player holds none', () => {
    const player = playerWith({ id: 1 })
    const holders: MetropolisHolders = { science: null, trade: null, politics: null }
    const breakdown = getScoreBreakdown(player, {}, null, null, holders, NO_MERCHANT_HOLDER)
    expect(breakdown.metropolis).toBe(0)
  })
})

describe('getScoreBreakdown merchant VP', () => {
  it('adds 1 VP for the player holding the Merchant', () => {
    const player = playerWith({ id: 1 })
    const breakdown = getScoreBreakdown(player, {}, null, null, NO_METROPOLIS_HOLDERS, 1)
    expect(breakdown.merchantVP).toBe(1)
    expect(breakdown.total).toBe(1)
  })

  it('gives 0 merchant VP to everyone else, including nobody holding it', () => {
    const player = playerWith({ id: 1 })
    expect(getScoreBreakdown(player, {}, null, null, NO_METROPOLIS_HOLDERS, 2).merchantVP).toBe(0)
    expect(getScoreBreakdown(player, {}, null, null, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER).merchantVP).toBe(0)
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

  it('grants standard piece counts at the default victory point target', () => {
    for (const player of createInitialPlayers(4)) {
      expect(player.settlementsRemaining).toBe(STARTING_SETTLEMENTS)
      expect(player.roadsRemaining).toBe(STARTING_ROADS)
      expect(player.citiesRemaining).toBe(STARTING_CITIES)
    }
  })

  it('scales piece counts up proportionally for a higher victory point target', () => {
    for (const player of createInitialPlayers(4, undefined, undefined, WINNING_SCORE * 2)) {
      expect(player.settlementsRemaining).toBe(STARTING_SETTLEMENTS * 2)
      expect(player.roadsRemaining).toBe(STARTING_ROADS * 2)
      expect(player.citiesRemaining).toBe(STARTING_CITIES * 2)
    }
  })

  it('never grants fewer than standard piece counts for a target below WINNING_SCORE', () => {
    for (const player of createInitialPlayers(4, undefined, undefined, 3)) {
      expect(player.settlementsRemaining).toBe(STARTING_SETTLEMENTS)
      expect(player.roadsRemaining).toBe(STARTING_ROADS)
      expect(player.citiesRemaining).toBe(STARTING_CITIES)
    }
  })

  it('gives every player STARTING_SHIPS ships, scaled the same way roads are', () => {
    const players = createInitialPlayers(2)
    expect(players[0].shipsRemaining).toBe(STARTING_SHIPS)
    expect(players[1].shipsRemaining).toBe(STARTING_SHIPS)
  })
})

describe('progress card deck composition', () => {
  it('each deck sums to exactly 18 physical cards', () => {
    for (const track of IMPROVEMENT_TRACK_ORDER) {
      const total = Object.values(PROGRESS_CARD_DECK_COMPOSITION[track]).reduce((sum, qty) => sum + (qty ?? 0), 0)
      expect(total).toBe(18)
    }
  })

  it('every ProgressCardType appears in exactly one deck', () => {
    const seen = new Set<ProgressCardType>()
    for (const track of IMPROVEMENT_TRACK_ORDER) {
      for (const type of Object.keys(PROGRESS_CARD_DECK_COMPOSITION[track]) as ProgressCardType[]) {
        expect(seen.has(type)).toBe(false)
        expect(PROGRESS_CARD_TRACK[type]).toBe(track)
        seen.add(type)
      }
    }
    expect(seen.size).toBe(PROGRESS_CARD_ORDER.length)
  })
})

describe('getScoreBreakdown progress card VP', () => {
  it('counts printing and constitution as 1 VP each, other cards as 0', () => {
    const player = { ...playerWith(), id: 1, progressCards: ['printing', 'constitution', 'crane'] as ProgressCardType[] }
    const breakdown = getScoreBreakdown(player, {}, null, null, { science: null, trade: null, politics: null }, NO_MERCHANT_HOLDER)
    expect(breakdown.progressCardVP).toBe(2)
  })
})

describe('getPublicScore does not hide progress card VP', () => {
  it('includes progressCardVP in the public score, unlike hidden devCard VP', () => {
    const player = playerWith({
      id: 1,
      devCards: ['victoryPoint'],
      progressCards: ['printing'] as ProgressCardType[],
    })
    const holders = { science: null, trade: null, politics: null }
    const publicScore = getPublicScore(player, {}, null, null, holders, NO_MERCHANT_HOLDER)
    const trueScore = getPlayerScore(player, {}, null, null, holders, NO_MERCHANT_HOLDER)
    expect(trueScore - publicScore).toBe(1) // only the hidden devCard VP is subtracted, not printing
  })
})

describe('createInitialPlayers — knights & city walls', () => {
  it('gives every player the starting knight supply, no knights on board, and no city walls', () => {
    const players = createInitialPlayers(3)
    for (const player of players) {
      expect(player.knightSupply).toEqual(KNIGHT_STARTING_SUPPLY)
      expect(player.knightPieces).toEqual([])
      expect(player.cityWalls).toEqual([])
    }
  })
})

describe('createInitialPlayers — defenderOfCatanCount', () => {
  it('starts every player at 0 Defender of Catan tokens', () => {
    const players = createInitialPlayers(3)
    for (const player of players) {
      expect(player.defenderOfCatanCount).toBe(0)
    }
  })
})

describe('getScoreBreakdown — defenderOfCatanVP', () => {
  it('counts defenderOfCatanCount as public VP, unmodified', () => {
    const player = playerWith({ defenderOfCatanCount: 2 })
    const breakdown = getScoreBreakdown(player, {}, null, null, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER)
    expect(breakdown.defenderOfCatanVP).toBe(2)
    // Exact, not a lower bound — toBeGreaterThanOrEqual would also pass if
    // defenderOfCatanVP got double-counted into total (CodeRabbit catch).
    // With empty settlements, no trophies, and no cards, total is exactly 2.
    expect(breakdown.total).toBe(2)
    const publicScore = getPublicScore(player, {}, null, null, NO_METROPOLIS_HOLDERS, NO_MERCHANT_HOLDER)
    expect(publicScore).toBe(2) // NOT subtracted, unlike hidden dev-card VP
  })
})
