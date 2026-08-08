import { describe, expect, it } from 'vitest'
import { buildVertexAdjacency, type BoardEdge } from './boardGraph'

describe('buildVertexAdjacency', () => {
  it('returns an empty map for empty edges', () => {
    const result = buildVertexAdjacency([])
    expect(result.size).toBe(0)
  })

  it('handles a single edge correctly', () => {
    const edges: BoardEdge[] = [
      { id: 'v1|v2', a: 'v1', b: 'v2', x: 0, z: 0 },
    ]
    const result = buildVertexAdjacency(edges)
    expect(result.get('v1')).toEqual(['v2'])
    expect(result.get('v2')).toEqual(['v1'])
    expect(result.size).toBe(2)
  })

  it('handles multiple edges from a single vertex (star topology)', () => {
    const edges: BoardEdge[] = [
      { id: 'v1|v2', a: 'v1', b: 'v2', x: 0, z: 0 },
      { id: 'v1|v3', a: 'v1', b: 'v3', x: 0, z: 0 },
      { id: 'v1|v4', a: 'v1', b: 'v4', x: 0, z: 0 },
    ]
    const result = buildVertexAdjacency(edges)
    expect(result.get('v1')).toEqual(['v2', 'v3', 'v4'])
    expect(result.get('v2')).toEqual(['v1'])
    expect(result.get('v3')).toEqual(['v1'])
    expect(result.get('v4')).toEqual(['v1'])
    expect(result.size).toBe(4)
  })

  it('handles closed loops (triangle topology)', () => {
    const edges: BoardEdge[] = [
      { id: 'v1|v2', a: 'v1', b: 'v2', x: 0, z: 0 },
      { id: 'v2|v3', a: 'v2', b: 'v3', x: 0, z: 0 },
      { id: 'v3|v1', a: 'v3', b: 'v1', x: 0, z: 0 },
    ]
    const result = buildVertexAdjacency(edges)
    expect(result.get('v1')).toEqual(['v2', 'v3']) // From first edge b, and third edge a
    expect(result.get('v2')).toEqual(['v1', 'v3']) // From first edge a, and second edge b
    expect(result.get('v3')).toEqual(['v2', 'v1']) // From second edge a, and third edge b
    expect(result.size).toBe(3)
  })

  it('handles disconnected graphs', () => {
    const edges: BoardEdge[] = [
      { id: 'v1|v2', a: 'v1', b: 'v2', x: 0, z: 0 },
      { id: 'v3|v4', a: 'v3', b: 'v4', x: 0, z: 0 },
    ]
    const result = buildVertexAdjacency(edges)
    expect(result.get('v1')).toEqual(['v2'])
    expect(result.get('v2')).toEqual(['v1'])
    expect(result.get('v3')).toEqual(['v4'])
    expect(result.get('v4')).toEqual(['v3'])
    expect(result.size).toBe(4)
  })
})
