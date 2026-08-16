import { describe, expect, it } from 'vitest'
import {
  buildProgressCardDeck,
  isEligibleToDraw,
  resolveEventDieDraws,
  progressCardHandExcess,
} from './progressCards'
import type { ImprovementTrack, ProgressCardType } from './types'

describe('buildProgressCardDeck', () => {
  it('builds exactly 18 cards per track, matching PROGRESS_CARD_DECK_COMPOSITION', () => {
    for (const track of ['science', 'trade', 'politics'] as ImprovementTrack[]) {
      expect(buildProgressCardDeck(track)).toHaveLength(18)
    }
  })

  it('science deck contains exactly 2 alchemy and exactly 1 engineering', () => {
    const deck = buildProgressCardDeck('science')
    expect(deck.filter((c) => c === 'alchemy')).toHaveLength(2)
    expect(deck.filter((c) => c === 'engineering')).toHaveLength(1)
  })
})

describe('isEligibleToDraw', () => {
  it('level 0 never draws, regardless of red die', () => {
    for (let redDie = 1; redDie <= 6; redDie++) expect(isEligibleToDraw(0, redDie)).toBe(false)
  })

  it('level 1 draws on red die 1-2, not 3+', () => {
    expect(isEligibleToDraw(1, 1)).toBe(true)
    expect(isEligibleToDraw(1, 2)).toBe(true)
    expect(isEligibleToDraw(1, 3)).toBe(false)
  })

  it('level 5 always draws (red die 1-6)', () => {
    for (let redDie = 1; redDie <= 6; redDie++) expect(isEligibleToDraw(5, redDie)).toBe(true)
  })

  it('matches the exact rulebook worked example: level 2 draws on 1, 2, or 3', () => {
    expect(isEligibleToDraw(2, 1)).toBe(true)
    expect(isEligibleToDraw(2, 3)).toBe(true)
    expect(isEligibleToDraw(2, 4)).toBe(false)
  })
})

describe('resolveEventDieDraws', () => {
  it('draws exactly 1 card per eligible player, in the given turn order, none for ineligible players', () => {
    const players = [
      { id: 1, cityImprovements: { science: 2, trade: 0, politics: 0 } },
      { id: 2, cityImprovements: { science: 0, trade: 0, politics: 0 } }, // level 0, never eligible
      { id: 3, cityImprovements: { science: 5, trade: 0, politics: 0 } },
    ]
    const deck: ProgressCardType[] = ['alchemy', 'crane', 'engineering']
    const result = resolveEventDieDraws(players, 'science', /* redDie */ 1, deck, /* turnOrderIds */ [3, 1, 2])
    expect(result.draws).toEqual([
      { playerId: 3, card: 'alchemy' },
      { playerId: 1, card: 'crane' },
    ])
    expect(result.remainingDeck).toEqual(['engineering'])
  })

  it('stops drawing (no-op, not a crash) once the deck is empty', () => {
    const players = [{ id: 1, cityImprovements: { science: 5, trade: 0, politics: 0 } }]
    const result = resolveEventDieDraws(players, 'science', 1, [], [1])
    expect(result.draws).toEqual([])
    expect(result.remainingDeck).toEqual([])
  })
})

describe('progressCardHandExcess', () => {
  it('is 0 at or under the 4-card limit', () => {
    expect(progressCardHandExcess(['alchemy', 'crane', 'engineering', 'invention'])).toBe(0)
  })

  it('counts only non-VP cards toward the limit', () => {
    // 4 non-VP + 2 VP = 6 total, but VP cards never count
    expect(progressCardHandExcess(['alchemy', 'crane', 'engineering', 'invention', 'printing', 'constitution'])).toBe(0)
  })

  it('is the amount over 4 for non-VP cards only', () => {
    expect(progressCardHandExcess(['alchemy', 'crane', 'engineering', 'invention', 'irrigation', 'printing'])).toBe(1)
  })
})
