import { describe, expect, it } from 'vitest'
import { hasPlayerShipAt, isShipPlacementConnected } from './shipEligibility'
import type { Building } from './types'
import type { BoardEdge, BoardGraph } from '../data/boardGraph'

function edge(id: string, a: string, b: string): BoardEdge {
  return { id, a, b, x: 0, z: 0 }
}

function graphOf(edges: BoardEdge[]): BoardGraph {
  const vertexEdgeIds = new Map<string, string[]>()
  for (const e of edges) {
    for (const v of [e.a, e.b]) {
      const list = vertexEdgeIds.get(v)
      if (list) list.push(e.id)
      else vertexEdgeIds.set(v, [e.id])
    }
  }
  return {
    vertices: [],
    edges,
    vertexById: new Map(),
    tileVertexIds: new Map(),
    vertexTileIds: new Map(),
    vertexEdgeIds,
    tileCenters: new Map(),
    edgeTileIds: new Map(),
    tileEdgeIds: new Map(),
  }
}

function edgeMap(edges: BoardEdge[]): Map<string, BoardEdge> {
  return new Map(edges.map((e) => [e.id, e]))
}

describe('hasPlayerShipAt', () => {
  it('finds an owned ship touching the vertex', () => {
    const graph = graphOf([edge('AB', 'A', 'B')])
    expect(hasPlayerShipAt(graph, { AB: 1 }, 'A', 1)).toBe(true)
  })

  it('ignores an opponent-owned ship', () => {
    const graph = graphOf([edge('AB', 'A', 'B')])
    expect(hasPlayerShipAt(graph, { AB: 2 }, 'A', 1)).toBe(false)
  })

  it('excludeEdgeId makes it ignore that specific edge, even if owned', () => {
    const graph = graphOf([edge('AB', 'A', 'B')])
    expect(hasPlayerShipAt(graph, { AB: 1 }, 'A', 1, 'AB')).toBe(false)
  })

  it('still finds a DIFFERENT owned ship at the same vertex when one is excluded', () => {
    const graph = graphOf([edge('AB', 'A', 'B'), edge('AC', 'A', 'C')])
    expect(hasPlayerShipAt(graph, { AB: 1, AC: 1 }, 'A', 1, 'AB')).toBe(true)
  })
})

describe('isShipPlacementConnected', () => {
  it('connects via an owned settlement at either endpoint', () => {
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    const settlements: Record<string, Building> = { A: { ownerId: 1, type: 'settlement' } }
    expect(isShipPlacementConnected(graph, edgeMap(edges), settlements, {}, 'AB', 1)).toBe(true)
  })

  it('connects via an owned ship at either endpoint', () => {
    const edges = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C')]
    const graph = graphOf(edges)
    expect(isShipPlacementConnected(graph, edgeMap(edges), {}, { AB: 1 }, 'BC', 1)).toBe(true)
  })

  it('does not connect via a vertex with neither a settlement nor a ship', () => {
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    expect(isShipPlacementConnected(graph, edgeMap(edges), {}, {}, 'AB', 1)).toBe(false)
  })

  it('the bug this fix closes: excludeEdgeId prevents a ship from anchoring its own destination when moving', () => {
    // Player has settlement at A, ship A-B. Moving that ship to B-X should
    // NOT be considered connected — without excludeEdgeId, hasPlayerShipAt(B)
    // would find the ship being moved (still present in pre-move state) and
    // wrongly approve a move that orphans the ship.
    const edges = [edge('AB', 'A', 'B'), edge('BX', 'B', 'X')]
    const graph = graphOf(edges)
    const ships = { AB: 1 }
    expect(isShipPlacementConnected(graph, edgeMap(edges), {}, ships, 'BX', 1, 'AB')).toBe(false)
  })

  it('a legitimate pivot still connects when a DIFFERENT own ship anchors the shared vertex', () => {
    // Ships A-B (settlement at A) and B-C, both owned. Moving B-C to B-D
    // should still connect via B, because A-B independently anchors B —
    // excluding B-C (the ship being moved) from the scan still leaves A-B.
    const edges = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C'), edge('BD', 'B', 'D')]
    const graph = graphOf(edges)
    const settlements: Record<string, Building> = { A: { ownerId: 1, type: 'settlement' } }
    const ships = { AB: 1, BC: 1 }
    expect(isShipPlacementConnected(graph, edgeMap(edges), settlements, ships, 'BD', 1, 'BC')).toBe(true)
  })

  it('returns false for a nonexistent edge id', () => {
    const graph = graphOf([])
    expect(isShipPlacementConnected(graph, new Map(), {}, {}, 'ZZ', 1)).toBe(false)
  })
})
