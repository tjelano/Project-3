import { describe, expect, it } from 'vitest'
import { activeQueueEntry, dequeueOne } from './pendingQueue'

const byId = (id: number) => id

describe('activeQueueEntry', () => {
  it('online: returns the entry matching localPlayerId when present', () => {
    expect(activeQueueEntry([3, 5, 7], byId, 5)).toBe(5)
  })

  it('online: returns null when localPlayerId is not in the queue', () => {
    expect(activeQueueEntry([3, 5, 7], byId, 9)).toBeNull()
  })

  it('local pass-and-play (localPlayerId null): returns the front of the queue', () => {
    expect(activeQueueEntry([3, 5, 7], byId, null)).toBe(3)
  })

  it('local pass-and-play: returns null for an empty queue', () => {
    expect(activeQueueEntry([], byId, null)).toBeNull()
  })

  it('online: returns null for an empty queue even with a real localPlayerId', () => {
    expect(activeQueueEntry([], byId, 5)).toBeNull()
  })

  it('works with a richer element type via a custom accessor', () => {
    const queue = [{ playerId: 1, vertexId: 'V1' }, { playerId: 2, vertexId: 'V2' }]
    expect(activeQueueEntry(queue, (t) => t.playerId, 2)).toEqual({ playerId: 2, vertexId: 'V2' })
  })
})

describe('dequeueOne', () => {
  it('removes exactly the first matching entry', () => {
    expect(dequeueOne([1, 2, 3], byId, 2)).toEqual([1, 3])
  })

  it('removes only ONE occurrence, leaving a duplicate entry for the same id intact', () => {
    expect(dequeueOne([1, 1, 2], byId, 1)).toEqual([1, 2])
  })

  it('returns the exact same array reference when nothing matches (no-op)', () => {
    const queue = [1, 2, 3]
    expect(dequeueOne(queue, byId, 9)).toBe(queue)
  })

  it('handles an empty queue', () => {
    expect(dequeueOne([], byId, 1)).toEqual([])
  })

  it('works with a richer element type via a custom accessor', () => {
    const queue = [{ playerId: 1, vertexId: 'V1' }, { playerId: 2, vertexId: 'V2' }]
    expect(dequeueOne(queue, (t) => t.playerId, 1)).toEqual([{ playerId: 2, vertexId: 'V2' }])
  })
})
