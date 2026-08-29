import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildProgressCardDeck,
  isEligibleToDraw,
  resolveEventDieDraws,
  progressCardHandExcess,
  rollEventDie,
} from './progressCards'
import type { EventDieFace } from '../components/Dice3D'
import type { ImprovementTrack, ProgressCardType } from './types'

describe('rollEventDie', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('only ever returns one of the 4 valid event-die faces', () => {
    const valid: EventDieFace[] = ['ship', 'science', 'trade', 'politics']
    for (let i = 0; i < 500; i++) expect(valid).toContain(rollEventDie())
  })

  it('is a 6-face die distributed 3 ship : 1 science : 1 trade : 1 politics', () => {
    // Math.random values chosen so Math.floor(value * 6) sweeps 0,1,2,3,4,5
    // exactly once each — i/6 can't be used directly, since 1/6 * 6 lands on
    // 0.9999999999999999 and would floor back to index 0.
    const sweep = [0.01, 0.2, 0.35, 0.51, 0.7, 0.9]
    const randomSpy = vi.spyOn(Math, 'random')
    for (const value of sweep) randomSpy.mockReturnValueOnce(value)

    const counts: Record<string, number> = {}
    for (let i = 0; i < sweep.length; i++) {
      const face = rollEventDie()
      counts[face] = (counts[face] ?? 0) + 1
    }

    expect(counts).toEqual({ ship: 3, science: 1, trade: 1, politics: 1 })
  })

  it('holds that 3:1:1:1 ratio over a large unmocked sample', () => {
    const samples = 60_000
    const counts: Record<string, number> = { ship: 0, science: 0, trade: 0, politics: 0 }
    for (let i = 0; i < samples; i++) counts[rollEventDie()] += 1

    // Half of all rolls should be ship (3 of 6 faces), a sixth each for the
    // three tracks. A generous tolerance keeps this from flaking while still
    // failing loudly on any actually-different distribution (e.g. a uniform
    // 1:1:1:1 would put ship at 25%, far outside this band).
    expect(counts.ship / samples).toBeGreaterThan(0.46)
    expect(counts.ship / samples).toBeLessThan(0.54)
    for (const track of ['science', 'trade', 'politics'] as const) {
      expect(counts[track] / samples).toBeGreaterThan(0.14)
      expect(counts[track] / samples).toBeLessThan(0.19)
    }
  })
})

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

  it('handles missing quantity in composition (defaults to 0)', async () => {
    // PROGRESS_CARD_DECK_COMPOSITION is a plain const export — overridden
    // here via a getter spy (Vitest's supported way to stub a readonly ESM
    // export) rather than mutating the real object, to verify the `?? 0`
    // fallback on a composition entry that's missing its quantity.
    const types = await import('./types')
    const originalDeckComposition = types.PROGRESS_CARD_DECK_COMPOSITION

    const mockComposition = {
      ...originalDeckComposition,
      science: {
        ...originalDeckComposition.science,
        alchemy: undefined as unknown as number,
      },
    }

    vi.spyOn(types, 'PROGRESS_CARD_DECK_COMPOSITION', 'get').mockReturnValue(mockComposition)

    const deck = buildProgressCardDeck('science')
    expect(deck.filter((c) => c === 'alchemy')).toHaveLength(0)

    vi.restoreAllMocks()
  })
})

describe('isEligibleToDraw', () => {
  it('negative levels never draw, handling edge cases', () => {
    for (let redDie = 1; redDie <= 6; redDie++) expect(isEligibleToDraw(-1, redDie)).toBe(false)
  })

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

  it('ignores missing players from turnOrderIds without crashing', () => {
    const players = [{ id: 1, cityImprovements: { science: 5, trade: 0, politics: 0 } }]
    // turnOrderIds contains 99, which is not in the players array
    const result = resolveEventDieDraws(players, 'science', 1, ['alchemy'], [99, 1])
    expect(result.draws).toEqual([{ playerId: 1, card: 'alchemy' }])
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
