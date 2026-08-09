import { describe, expect, it } from 'vitest'
import { assignPorts, buildBoardGraph, buildVertexAdjacency, type BoardEdge, type BoardGraph } from './boardGraph'
import { buildHexBoard, type HexTileData } from './hexBoard'

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

describe('buildBoardGraph', () => {
  it('returns empty graph for empty tiles', () => {
    const graph = buildBoardGraph([])
    expect(graph.vertices.length).toBe(0)
    expect(graph.edges.length).toBe(0)
    expect(graph.vertexById.size).toBe(0)
  })

  it('builds correct graph for a single tile', () => {
    const tile: HexTileData = { id: '0-0', col: 0, row: 0, x: 0, z: 0, biome: 'fields', number: 5 }
    const graph = buildBoardGraph([tile])

    expect(graph.vertices.length).toBe(6)
    expect(graph.edges.length).toBe(6)

    const tileVertices = graph.tileVertexIds.get('0-0')
    expect(tileVertices?.length).toBe(6)

    // Each vertex should belong to this single tile
    for (const vertex of graph.vertices) {
      expect(graph.vertexTileIds.get(vertex.id)).toEqual(['0-0'])
      // Each vertex in a single hex connects to 2 edges
      expect(graph.vertexEdgeIds.get(vertex.id)?.length).toBe(2)
    }
  })

  it('builds correct graph for two adjacent tiles', () => {
    // Tiles adjacent on x-axis offset by 1.5 and z-axis by sqrt(3)/2
    const tile1: HexTileData = { id: 't1', col: 0, row: 0, x: 0, z: 0, biome: 'fields', number: 5 }
    const tile2: HexTileData = { id: 't2', col: 1, row: 0, x: 1.5, z: Math.sqrt(3) / 2, biome: 'forest', number: 6 }
    const graph = buildBoardGraph([tile1, tile2])

    // Two isolated hexes would be 12 vertices, 12 edges
    // Adjacent hexes share 2 vertices and 1 edge, so:
    // Vertices: 12 - 2 = 10
    // Edges: 12 - 1 = 11
    expect(graph.vertices.length).toBe(10)
    expect(graph.edges.length).toBe(11)

    // Check that there are exactly two shared vertices
    const sharedVertices = graph.vertices.filter(v => graph.vertexTileIds.get(v.id)?.length === 2)
    expect(sharedVertices.length).toBe(2)

    for (const v of sharedVertices) {
      expect(graph.vertexTileIds.get(v.id)).toContain('t1')
      expect(graph.vertexTileIds.get(v.id)).toContain('t2')
      // Shared vertices connect to 3 edges
      expect(graph.vertexEdgeIds.get(v.id)?.length).toBe(3)
    }
  })

  it('builds correct graph for three mutually adjacent tiles', () => {
    const tile1: HexTileData = { id: 't1', col: 0, row: 0, x: 0, z: 0, biome: 'fields', number: 5 }
    const tile2: HexTileData = { id: 't2', col: 1, row: 0, x: 1.5, z: Math.sqrt(3) / 2, biome: 'forest', number: 6 }
    const tile3: HexTileData = { id: 't3', col: 1, row: 1, x: 1.5, z: -Math.sqrt(3) / 2, biome: 'hills', number: 8 }
    const graph = buildBoardGraph([tile1, tile2, tile3])

    // 3 hexes forming a triangle:
    // One central vertex shared by all 3 tiles.
    // 3 pairs of shared edges.
    expect(graph.vertices.length).toBe(13)
    expect(graph.edges.length).toBe(15)

    // Verify central shared vertex
    const centralVertices = graph.vertices.filter(v => graph.vertexTileIds.get(v.id)?.length === 3)
    expect(centralVertices.length).toBe(1)

    const centralVertex = centralVertices[0]
    const tilesForCentral = graph.vertexTileIds.get(centralVertex.id)
    expect(tilesForCentral).toContain('t1')
    expect(tilesForCentral).toContain('t2')
    expect(tilesForCentral).toContain('t3')

    // Central vertex connects to 3 edges
    expect(graph.vertexEdgeIds.get(centralVertex.id)?.length).toBe(3)
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
