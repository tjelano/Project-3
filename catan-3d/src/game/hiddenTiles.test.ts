import { describe, expect, it } from 'vitest'
import { revealTilesForVertex } from './hiddenTiles'

function graphWith(entries: [string, string[]][]): Map<string, string[]> {
  return new Map(entries)
}

describe('revealTilesForVertex', () => {
  it('adds every tile touching the vertex to the revealed set', () => {
    const graph = graphWith([['v1', ['t1', 't2', 't3']]])
    const result = revealTilesForVertex(new Set(), 'v1', graph)
    expect(result).toEqual(new Set(['t1', 't2', 't3']))
  })

  it('keeps tiles already revealed and does not duplicate them', () => {
    const graph = graphWith([['v1', ['t1', 't2']]])
    const result = revealTilesForVertex(new Set(['t1', 't9']), 'v1', graph)
    expect(result).toEqual(new Set(['t1', 't2', 't9']))
  })

  it('returns an unchanged copy for a vertex with no tiles', () => {
    const graph = graphWith([])
    const before = new Set(['t1'])
    const result = revealTilesForVertex(before, 'unknown-vertex', graph)
    expect(result).toEqual(new Set(['t1']))
    expect(result).not.toBe(before) // always a new Set, never the input mutated
  })

  it('never mutates the input set', () => {
    const graph = graphWith([['v1', ['t1']]])
    const before = new Set<string>()
    revealTilesForVertex(before, 'v1', graph)
    expect(before.size).toBe(0)
  })
})
