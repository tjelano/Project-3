import { describe, expect, it } from 'vitest'
import { isPirateEligibleTile, pirateVictimShipOwners } from './pirateEligibility'
import type { HexTileData } from '../data/hexBoard'
import type { BoardGraph } from '../data/boardGraph'

function tile(id: string, biome: HexTileData['biome']): HexTileData {
  return { id, col: 0, row: 0, x: 0, z: 0, biome, number: null }
}

function tileById(tiles: HexTileData[]): Map<string, HexTileData> {
  return new Map(tiles.map((t) => [t.id, t]))
}

// pirateVictimShipOwners only reads graph.tileEdgeIds — a bare edge-id list
// per tile is enough, no need to build full BoardEdge/vertex fixtures the
// way shipEligibility.test.ts's graphOf does for its edge-endpoint checks.
function graphOf(tileEdges: Record<string, string[]>): BoardGraph {
  return {
    vertices: [],
    edges: [],
    vertexById: new Map(),
    tileVertexIds: new Map(),
    vertexTileIds: new Map(),
    vertexEdgeIds: new Map(),
    tileCenters: new Map(),
    edgeTileIds: new Map(),
    tileEdgeIds: new Map(Object.entries(tileEdges)),
  }
}

describe('isPirateEligibleTile', () => {
  it('returns true for a sea tile', () => {
    const tiles = tileById([tile('S1', 'sea')])
    expect(isPirateEligibleTile(tiles, 'S1')).toBe(true)
  })

  it('returns false for a land tile', () => {
    const tiles = tileById([tile('D1', 'desert')])
    expect(isPirateEligibleTile(tiles, 'D1')).toBe(false)
  })

  it('returns false for an unknown tile id', () => {
    const tiles = tileById([tile('S1', 'sea')])
    expect(isPirateEligibleTile(tiles, 'nope')).toBe(false)
  })
})

describe('pirateVictimShipOwners', () => {
  it('finds a distinct ship owner touching one of the tile edges', () => {
    const graph = graphOf({ S1: ['AB', 'BC'] })
    const ships = { AB: 2 }
    expect(pirateVictimShipOwners(graph, ships, 'S1', 1)).toEqual([2])
  })

  it("excludes the thief's own ship", () => {
    const graph = graphOf({ S1: ['AB'] })
    const ships = { AB: 1 }
    expect(pirateVictimShipOwners(graph, ships, 'S1', 1)).toEqual([])
  })

  it('dedupes when the same owner has multiple ships touching the tile', () => {
    const graph = graphOf({ S1: ['AB', 'BC', 'CD'] })
    const ships = { AB: 2, BC: 2, CD: 3 }
    expect(pirateVictimShipOwners(graph, ships, 'S1', 1)).toEqual([2, 3])
  })

  it('returns an empty array when no ships touch the tile', () => {
    const graph = graphOf({ S1: ['AB', 'BC'] })
    expect(pirateVictimShipOwners(graph, {}, 'S1', 1)).toEqual([])
  })
})
