import { describe, expect, it } from 'vitest'
import {
  nextKnightStrength,
  canRecruitKnight,
  canActivateKnight,
  canPromoteKnight,
  canBuildCityWall,
  recruitableVertices,
  knightMoveTargets,
  knightDisplaceTargets,
} from './knights'
import { createInitialPlayers, emptyResources, type Building, type KnightPiece } from './types'
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
  return { vertices: [], edges, vertexById: new Map(), tileVertexIds: new Map(), vertexTileIds: new Map(), vertexEdgeIds, tileCenters: new Map() }
}

function ownedBy(playerId: number, edges: BoardEdge[]): Record<string, number> {
  return Object.fromEntries(edges.map((e) => [e.id, playerId]))
}

function knightsByVertexOf(knights: KnightPiece[]): Map<string, KnightPiece> {
  return new Map(knights.map((k) => [k.vertexId, k]))
}

describe('nextKnightStrength', () => {
  it('promotes basic to strong, strong to mighty, and mighty to nothing', () => {
    expect(nextKnightStrength('basic')).toBe('strong')
    expect(nextKnightStrength('strong')).toBe('mighty')
    expect(nextKnightStrength('mighty')).toBeNull()
  })
})

describe('canRecruitKnight', () => {
  it('requires both a basic knight in supply and the resource cost', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 1, ore: 1 }
    expect(canRecruitKnight(player)).toBe(true)

    const noSupply = { ...player, knightSupply: { basic: 0, strong: 0, mighty: 0 } }
    expect(canRecruitKnight(noSupply)).toBe(false)

    const noResources = { ...player, resources: emptyResources() }
    expect(canRecruitKnight(noResources)).toBe(false)
  })
})

describe('canActivateKnight', () => {
  it('requires the knight to be inactive and the player to afford 1 grain', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), grain: 1 }
    const inactive: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'basic', active: false, vertexId: 'A' }
    const active: KnightPiece = { ...inactive, active: true }
    expect(canActivateKnight(player, inactive)).toBe(true)
    expect(canActivateKnight(player, active)).toBe(false)
    expect(canActivateKnight({ ...player, resources: emptyResources() }, inactive)).toBe(false)
  })
})

describe('canPromoteKnight', () => {
  it('basic to strong needs supply + resources, no track requirement', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 1, ore: 1 }
    player.knightSupply = { basic: 1, strong: 1, mighty: 1 }
    const basic: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'basic', active: false, vertexId: 'A' }
    expect(canPromoteKnight(player, basic)).toBe(true)
  })

  it('strong to mighty additionally requires Politics level 3', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 1, ore: 1 }
    player.knightSupply = { basic: 1, strong: 1, mighty: 1 }
    const strong: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'strong', active: false, vertexId: 'A' }
    expect(canPromoteKnight(player, strong)).toBe(false)
    player.cityImprovements = { ...player.cityImprovements, politics: 3 }
    expect(canPromoteKnight(player, strong)).toBe(true)
  })

  it('mighty knights cannot be promoted further', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 1, ore: 1 }
    player.knightSupply = { basic: 1, strong: 1, mighty: 1 }
    const mighty: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'mighty', active: false, vertexId: 'A' }
    expect(canPromoteKnight(player, mighty)).toBe(false)
  })

  it('cannot promote if the next-strength supply is exhausted', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 1, ore: 1 }
    player.knightSupply = { basic: 1, strong: 0, mighty: 1 }
    const basic: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'basic', active: false, vertexId: 'A' }
    expect(canPromoteKnight(player, basic)).toBe(false)
  })
})

describe('canBuildCityWall', () => {
  it('requires an owned city, no existing wall there, and under the board-wide cap', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), brick: 2 }
    const settlements: Record<string, Building> = { V1: { ownerId: player.id, type: 'city' } }
    expect(canBuildCityWall(player, 'V1', settlements, 0)).toBe(true)
    expect(canBuildCityWall(player, 'V1', settlements, 3)).toBe(false) // board-wide cap hit
    player.cityWalls = ['V1']
    expect(canBuildCityWall(player, 'V1', settlements, 1)).toBe(false) // already walled
  })

  it('rejects a settlement (not yet a city) or a vertex owned by someone else', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), brick: 2 }
    const settlements: Record<string, Building> = {
      V1: { ownerId: player.id, type: 'settlement' },
      V2: { ownerId: 999, type: 'city' },
    }
    expect(canBuildCityWall(player, 'V1', settlements, 0)).toBe(false)
    expect(canBuildCityWall(player, 'V2', settlements, 0)).toBe(false)
  })
})

describe('recruitableVertices', () => {
  it('returns empty vertices touching any of the player road, excluding occupied ones', () => {
    const edges = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const settlements: Record<string, Building> = { C: { ownerId: 1, type: 'settlement' } }
    const targets = recruitableVertices(1, graph, roads, settlements, new Map())
    expect(targets).toEqual(new Set(['A', 'B'])) // C excluded — occupied
  })
})

describe('knightMoveTargets', () => {
  it('reaches empty vertices along the owner continuous route, passing through own pieces', () => {
    const edges = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C'), edge('CD', 'C', 'D')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const knight: KnightPiece = { id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'A' }
    // Own knight sits at B — passable, not a stopping point.
    const knightsByVertex = knightsByVertexOf([knight, { id: 'k2', ownerId: 1, strength: 'basic', active: false, vertexId: 'B' }])
    const targets = knightMoveTargets(knight, graph, roads, {}, knightsByVertex)
    expect(targets).toEqual(new Set(['C', 'D']))
  })

  it('cannot pass through or land on an intersection with an opponent piece', () => {
    const edges = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const knight: KnightPiece = { id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'A' }
    const settlements: Record<string, Building> = { B: { ownerId: 2, type: 'settlement' } }
    const targets = knightMoveTargets(knight, graph, roads, settlements, new Map())
    expect(targets).toEqual(new Set()) // B blocks, C unreachable
  })
})

describe('knightDisplaceTargets', () => {
  it('finds reachable opponent knights strictly weaker than the mover', () => {
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const mover: KnightPiece = { id: 'k1', ownerId: 1, strength: 'strong', active: true, vertexId: 'A' }
    const weaker: KnightPiece = { id: 'k2', ownerId: 2, strength: 'basic', active: false, vertexId: 'B' }
    const targets = knightDisplaceTargets(mover, graph, roads, {}, knightsByVertexOf([mover, weaker]))
    expect(targets).toEqual([weaker])
  })

  it('excludes opponent knights that are equal or stronger', () => {
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const mover: KnightPiece = { id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'A' }
    const equal: KnightPiece = { id: 'k2', ownerId: 2, strength: 'basic', active: false, vertexId: 'B' }
    const targets = knightDisplaceTargets(mover, graph, roads, {}, knightsByVertexOf([mover, equal]))
    expect(targets).toEqual([])
  })
})
