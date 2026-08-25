import { describe, expect, it } from 'vitest'
import { reduceDecks, initialDecksState } from './decks'
import { initialGameState } from '../gameState'
import type { DevCardType, ProgressCardType } from '../types'

describe('reduceDecks — DEV_CARD_DRAWN', () => {
  it('removes exactly the top card off devDeck', () => {
    const dirty = { ...initialDecksState, devDeck: ['knight', 'monopoly', 'roadBuilding'] as DevCardType[] }
    const result = reduceDecks(dirty, { type: 'DEV_CARD_DRAWN' }, initialGameState)
    expect(result.devDeck).toEqual(['monopoly', 'roadBuilding'])
  })

  it('leaves progressCardDecks untouched', () => {
    const dirty = { ...initialDecksState, devDeck: ['knight'] as DevCardType[] }
    const result = reduceDecks(dirty, { type: 'DEV_CARD_DRAWN' }, initialGameState)
    expect(result.progressCardDecks).toBe(dirty.progressCardDecks)
  })
})

describe('reduceDecks — DEV_DECK_SET', () => {
  it('replaces devDeck wholesale', () => {
    const newDeck: DevCardType[] = ['victoryPoint', 'victoryPoint']
    const result = reduceDecks(initialDecksState, { type: 'DEV_DECK_SET', deck: newDeck }, initialGameState)
    expect(result).toEqual({ ...initialDecksState, devDeck: newDeck })
  })
})

describe('reduceDecks — PROGRESS_CARD_DECK_SET', () => {
  it('replaces exactly one track, leaves the other two untouched', () => {
    const newScienceDeck: ProgressCardType[] = ['printing', 'printing']
    const result = reduceDecks(
      initialDecksState,
      { type: 'PROGRESS_CARD_DECK_SET', track: 'science', deck: newScienceDeck },
      initialGameState,
    )
    expect(result.progressCardDecks.science).toEqual(newScienceDeck)
    expect(result.progressCardDecks.trade).toBe(initialDecksState.progressCardDecks.trade)
    expect(result.progressCardDecks.politics).toBe(initialDecksState.progressCardDecks.politics)
  })

  it('leaves devDeck untouched', () => {
    const result = reduceDecks(
      initialDecksState,
      { type: 'PROGRESS_CARD_DECK_SET', track: 'trade', deck: [] },
      initialGameState,
    )
    expect(result.devDeck).toBe(initialDecksState.devDeck)
  })
})

describe('reduceDecks — PROGRESS_CARD_DECK_POPPED', () => {
  it('removes exactly count cards off the front of one track, computed against live state', () => {
    const dirty = {
      ...initialDecksState,
      progressCardDecks: {
        ...initialDecksState.progressCardDecks,
        science: ['printing', 'engineering', 'sabotage', 'irrigation'] as ProgressCardType[],
      },
    }
    const result = reduceDecks(dirty, { type: 'PROGRESS_CARD_DECK_POPPED', track: 'science', count: 2 }, initialGameState)
    expect(result.progressCardDecks.science).toEqual(['sabotage', 'irrigation'])
  })

  it('leaves the other two tracks and devDeck untouched', () => {
    const result = reduceDecks(
      initialDecksState,
      { type: 'PROGRESS_CARD_DECK_POPPED', track: 'trade', count: 2 },
      initialGameState,
    )
    expect(result.progressCardDecks.science).toBe(initialDecksState.progressCardDecks.science)
    expect(result.progressCardDecks.politics).toBe(initialDecksState.progressCardDecks.politics)
    expect(result.devDeck).toBe(initialDecksState.devDeck)
  })
})

describe('reduceDecks — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reduceDecks(initialDecksState, { type: 'RESET_BOARD', robberTileId: 'D1' }, initialGameState)
    expect(result).toBe(initialDecksState)
  })
})
