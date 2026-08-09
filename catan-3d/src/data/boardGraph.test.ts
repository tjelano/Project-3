import { describe, expect, it } from 'vitest'
import { assignPorts, buildBoardGraph, buildVertexAdjacency, type BoardEdge, type BoardGraph } from './boardGraph'
import { buildHexBoard } from './hexBoard'

describe('assignPorts', () => {
  it('returns exactly 9 ports on a standard board', () => {
    const tiles = buildHexBoard()
    const graph = buildBoardGraph(tiles)
    const ports = assignPorts(graph)

    expect(ports).toHaveLength(9)
  })

  it('assigns the correct port types in order', () => {
    const tiles = buildHexBoard()
    const graph = buildBoardGraph(tiles)
    const ports = assignPorts(graph)

    const expectedSequence = ['ore', '3:1', 'wool', '3:1', 'grain', '3:1', 'lumber', '3:1', 'brick']
    const portTypes = ports.map(p => p.type)

    expect(portTypes).toEqual(expectedSequence)
  })

  it('assigns ports to boundary edges only (tested on a 1-tile board)', () => {
    const tiles = [
      { id: '0-0', col: 0, row: 0, x: 0, z: 0, biome: 'fields' as const, number: 5 }
    ]
    const graph = buildBoardGraph(tiles)
    const ports = assignPorts(graph)

    // For a single tile board, there are 6 edges and they are all boundary edges.
    // assignPorts will still map the 9 port types to these edges.
    expect(ports).toHaveLength(9)

    for (const port of ports) {
      // Each port's edge must be a boundary edge. For a 1-tile board, all edges are boundary.
      const edge = graph.edges.find(e => e.id === port.edgeId)
      expect(edge).toBeDefined()
    }
  })

  it('returns an empty array for a graph with no edges', () => {
    const emptyGraph: BoardGraph = {
      vertices: [],
      edges: [],
      vertexById: new Map(),
      tileVertexIds: new Map(),
      vertexTileIds: new Map(),
      vertexEdgeIds: new Map(),
    }
    const ports = assignPorts(emptyGraph)
    expect(ports).toEqual([])
  })
})

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
