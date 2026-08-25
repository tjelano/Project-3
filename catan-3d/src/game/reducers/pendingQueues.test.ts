import { describe, expect, it } from 'vitest'
import { reducePendingQueues, initialPendingQueuesState } from './pendingQueues'
import { initialGameState } from '../gameState'
import type { BarbarianPillageTarget } from '../knights'

describe('reducePendingQueues — DISCARD_PLAYERS_SET', () => {
  it('replaces discardPlayerIds with the given array', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'DISCARD_PLAYERS_SET', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result).toEqual({ ...initialPendingQueuesState, discardPlayerIds: [1, 2] })
  })

  it('replaces even when the field already has entries (overwrite, not merge)', () => {
    const dirty = { ...initialPendingQueuesState, discardPlayerIds: [9] }
    const result = reducePendingQueues(dirty, { type: 'DISCARD_PLAYERS_SET', playerIds: [1, 2] }, initialGameState)
    expect(result.discardPlayerIds).toEqual([1, 2])
  })
})

describe('reducePendingQueues — DISCARD_PLAYER_REMOVED', () => {
  it('removes only the matching id, preserves order of the rest', () => {
    const dirty = { ...initialPendingQueuesState, discardPlayerIds: [1, 2, 3] }
    const result = reducePendingQueues(dirty, { type: 'DISCARD_PLAYER_REMOVED', playerId: 2 }, initialGameState)
    expect(result.discardPlayerIds).toEqual([1, 3])
  })

  it('returns the same array reference when the id is not present', () => {
    const dirty = { ...initialPendingQueuesState, discardPlayerIds: [1, 3] }
    const result = reducePendingQueues(dirty, { type: 'DISCARD_PLAYER_REMOVED', playerId: 2 }, initialGameState)
    expect(result.discardPlayerIds).toBe(dirty.discardPlayerIds)
  })
})

describe('reducePendingQueues — SCIENCE_FREE_RESOURCE_PLAYERS_ADDED', () => {
  it('adds new ids to an empty queue', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'SCIENCE_FREE_RESOURCE_PLAYERS_ADDED', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result.scienceFreeResourcePlayerIds).toEqual([1, 2])
  })

  it('dedupes against an already-present id rather than adding a second copy', () => {
    const dirty = { ...initialPendingQueuesState, scienceFreeResourcePlayerIds: [1] }
    const result = reducePendingQueues(
      dirty,
      { type: 'SCIENCE_FREE_RESOURCE_PLAYERS_ADDED', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result.scienceFreeResourcePlayerIds).toEqual([1, 2])
  })
})

describe('reducePendingQueues — SCIENCE_FREE_RESOURCE_PLAYER_REMOVED', () => {
  it('removes only the matching id', () => {
    const dirty = { ...initialPendingQueuesState, scienceFreeResourcePlayerIds: [1, 2] }
    const result = reducePendingQueues(
      dirty,
      { type: 'SCIENCE_FREE_RESOURCE_PLAYER_REMOVED', playerId: 1 },
      initialGameState,
    )
    expect(result.scienceFreeResourcePlayerIds).toEqual([2])
  })
})

describe('reducePendingQueues — SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED', () => {
  it('clears the queue to empty', () => {
    const dirty = { ...initialPendingQueuesState, scienceFreeResourcePlayerIds: [1, 2] }
    const result = reducePendingQueues(dirty, { type: 'SCIENCE_FREE_RESOURCE_PLAYERS_CLEARED' }, initialGameState)
    expect(result.scienceFreeResourcePlayerIds).toEqual([])
  })
})

describe('reducePendingQueues — GOLD_FIELD_RESOURCE_PLAYERS_ADDED', () => {
  it('adds new ids to an empty queue', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'GOLD_FIELD_RESOURCE_PLAYERS_ADDED', playerIds: [1] },
      initialGameState,
    )
    expect(result.goldFieldResourcePlayerIds).toEqual([1])
  })

  it('preserves duplicates — unlike science, the same player id can appear twice (2 Gold Field picks)', () => {
    const dirty = { ...initialPendingQueuesState, goldFieldResourcePlayerIds: [1] }
    const result = reducePendingQueues(
      dirty,
      { type: 'GOLD_FIELD_RESOURCE_PLAYERS_ADDED', playerIds: [1] },
      initialGameState,
    )
    expect(result.goldFieldResourcePlayerIds).toEqual([1, 1])
  })
})

describe('reducePendingQueues — GOLD_FIELD_RESOURCE_PLAYER_REMOVED', () => {
  it('removes only ONE matching entry, leaving a second duplicate in place', () => {
    const dirty = { ...initialPendingQueuesState, goldFieldResourcePlayerIds: [1, 1, 2] }
    const result = reducePendingQueues(
      dirty,
      { type: 'GOLD_FIELD_RESOURCE_PLAYER_REMOVED', playerId: 1 },
      initialGameState,
    )
    expect(result.goldFieldResourcePlayerIds).toEqual([1, 2])
  })
})

describe('reducePendingQueues — GOLD_FIELD_RESOURCE_PLAYERS_CLEARED', () => {
  it('clears the queue to empty', () => {
    const dirty = { ...initialPendingQueuesState, goldFieldResourcePlayerIds: [1, 1] }
    const result = reducePendingQueues(dirty, { type: 'GOLD_FIELD_RESOURCE_PLAYERS_CLEARED' }, initialGameState)
    expect(result.goldFieldResourcePlayerIds).toEqual([])
  })
})

describe('reducePendingQueues — PILLAGE_QUEUE_SET', () => {
  const targets: BarbarianPillageTarget[] = [{ playerId: 1, eligibleCityVertexIds: ['V1', 'V2'] }]

  it('replaces pillageQueue with the given targets', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'PILLAGE_QUEUE_SET', targets },
      initialGameState,
    )
    expect(result.pillageQueue).toEqual(targets)
  })
})

describe('reducePendingQueues — PILLAGE_QUEUE_ENTRY_REMOVED', () => {
  it('removes the entry matching playerId via the custom (t) => t.playerId accessor', () => {
    const dirty = {
      ...initialPendingQueuesState,
      pillageQueue: [
        { playerId: 1, eligibleCityVertexIds: ['V1'] },
        { playerId: 2, eligibleCityVertexIds: ['V2'] },
      ] as BarbarianPillageTarget[],
    }
    const result = reducePendingQueues(dirty, { type: 'PILLAGE_QUEUE_ENTRY_REMOVED', playerId: 1 }, initialGameState)
    expect(result.pillageQueue).toEqual([{ playerId: 2, eligibleCityVertexIds: ['V2'] }])
  })
})

describe('reducePendingQueues — WINNER_DRAW_QUEUE_SET', () => {
  it('replaces winnerDrawQueue with the given player ids', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'WINNER_DRAW_QUEUE_SET', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result.winnerDrawQueue).toEqual([1, 2])
  })
})

describe('reducePendingQueues — WINNER_DRAW_QUEUE_ENTRY_REMOVED', () => {
  it('removes only the matching id', () => {
    const dirty = { ...initialPendingQueuesState, winnerDrawQueue: [1, 2] }
    const result = reducePendingQueues(
      dirty,
      { type: 'WINNER_DRAW_QUEUE_ENTRY_REMOVED', playerId: 1 },
      initialGameState,
    )
    expect(result.winnerDrawQueue).toEqual([2])
  })
})

describe('reducePendingQueues — PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED', () => {
  it('adds new ids to an empty queue', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED', playerIds: [1] },
      initialGameState,
    )
    expect(result.progressCardOverLimitPlayerIds).toEqual([1])
  })

  it('dedupes against an already-present id', () => {
    const dirty = { ...initialPendingQueuesState, progressCardOverLimitPlayerIds: [1] }
    const result = reducePendingQueues(
      dirty,
      { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_ADDED', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result.progressCardOverLimitPlayerIds).toEqual([1, 2])
  })
})

describe('reducePendingQueues — PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED', () => {
  it('removes only the matching id', () => {
    const dirty = { ...initialPendingQueuesState, progressCardOverLimitPlayerIds: [1, 2] }
    const result = reducePendingQueues(
      dirty,
      { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYER_REMOVED', playerId: 1 },
      initialGameState,
    )
    expect(result.progressCardOverLimitPlayerIds).toEqual([2])
  })
})

describe('reducePendingQueues — PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET', () => {
  it('replaces progressCardOverLimitPlayerIds with the given array (reset/restore only)', () => {
    const dirty = { ...initialPendingQueuesState, progressCardOverLimitPlayerIds: [9] }
    const result = reducePendingQueues(
      dirty,
      { type: 'PROGRESS_CARD_OVER_LIMIT_PLAYERS_SET', playerIds: [1, 2] },
      initialGameState,
    )
    expect(result.progressCardOverLimitPlayerIds).toEqual([1, 2])
  })
})

describe('reducePendingQueues — TILES_REVEALED', () => {
  it('unions new tile ids into revealedTileIds rather than replacing it', () => {
    const dirty = { ...initialPendingQueuesState, revealedTileIds: new Set(['A1']) }
    const result = reducePendingQueues(dirty, { type: 'TILES_REVEALED', tileIds: ['B2', 'C3'] }, initialGameState)
    expect(result.revealedTileIds).toEqual(new Set(['A1', 'B2', 'C3']))
  })
})

describe('reducePendingQueues — REVEALED_TILES_SET', () => {
  it('replaces revealedTileIds rather than unioning', () => {
    const dirty = { ...initialPendingQueuesState, revealedTileIds: new Set(['A1', 'B2']) }
    const result = reducePendingQueues(dirty, { type: 'REVEALED_TILES_SET', tileIds: ['C3'] }, initialGameState)
    expect(result.revealedTileIds).toEqual(new Set(['C3']))
  })
})

describe('reducePendingQueues — action not owned by this reducer', () => {
  it('returns the same state reference unchanged', () => {
    const result = reducePendingQueues(
      initialPendingQueuesState,
      { type: 'RESET_BOARD', robberTileId: 'D1' },
      initialGameState,
    )
    expect(result).toBe(initialPendingQueuesState)
  })
})
