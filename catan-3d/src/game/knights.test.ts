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
  reachableOpponentKnights,
  selectSmithingPromotions,
  resolveBarbarianAttack,
  BARBARIAN_TRACK_LENGTH,
} from './knights'
import { createInitialPlayers, emptyResources, type Building, type KnightPiece, type Player } from './types'
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
  return { vertices: [], edges, vertexById: new Map(), tileVertexIds: new Map(), vertexTileIds: new Map(), vertexEdgeIds, tileCenters: new Map(), edgeTileIds: new Map(), tileEdgeIds: new Map() }
}

function ownedBy(playerId: number, edges: BoardEdge[]): Record<string, number> {
  return Object.fromEntries(edges.map((e) => [e.id, playerId]))
}

function knightsByVertexOf(knights: KnightPiece[]): Map<string, KnightPiece> {
  return new Map(knights.map((k) => [k.vertexId, k]))
}

function playerWithCities(id: number, activeKnights: KnightPiece[] = []): Player {
  const [p] = createInitialPlayers(1)
  return { ...p, id, knightPieces: activeKnights }
}

function settlementsFor(entries: { vertexId: string; ownerId: number; type: 'city' | 'settlement' }[]): Record<string, Building> {
  return Object.fromEntries(entries.map((e) => [e.vertexId, { ownerId: e.ownerId, type: e.type }]))
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
    const noWater = new Set<string>()
    expect(canBuildCityWall(player, 'V1', settlements, 0, noWater)).toBe(true)
    expect(canBuildCityWall(player, 'V1', settlements, 3, noWater)).toBe(false) // board-wide cap hit
    player.cityWalls = ['V1']
    expect(canBuildCityWall(player, 'V1', settlements, 1, noWater)).toBe(false) // already walled
  })

  it('rejects a settlement (not yet a city) or a vertex owned by someone else', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), brick: 2 }
    const settlements: Record<string, Building> = {
      V1: { ownerId: player.id, type: 'settlement' },
      V2: { ownerId: 999, type: 'city' },
    }
    const noWater = new Set<string>()
    expect(canBuildCityWall(player, 'V1', settlements, 0, noWater)).toBe(false)
    expect(canBuildCityWall(player, 'V2', settlements, 0, noWater)).toBe(false)
  })

  it('rejects a city on a vertex that touches water', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), brick: 2 }
    const settlements: Record<string, Building> = { V1: { ownerId: player.id, type: 'city' } }
    expect(canBuildCityWall(player, 'V1', settlements, 0, new Set(['V1']))).toBe(false)
  })
})

describe('selectSmithingPromotions', () => {
  it('selects up to 2 eligible knights in order, skipping ones already promoted this turn', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 999, ore: 999 }
    player.knightSupply = { basic: 0, strong: 3, mighty: 3 }
    const k1: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'basic', active: false, vertexId: 'A' }
    const k2: KnightPiece = { id: 'k2', ownerId: player.id, strength: 'basic', active: false, vertexId: 'B' }
    const k3: KnightPiece = { id: 'k3', ownerId: player.id, strength: 'basic', active: false, vertexId: 'C' }
    player.knightPieces = [k1, k2, k3]
    // k2 already promoted this turn (e.g. via a separate promoteKnight call
    // earlier this same turn) — skipped even though otherwise eligible.
    const selected = selectSmithingPromotions(player, new Set(['k2']))
    expect(selected.map((k) => k.id)).toEqual(['k1', 'k3'])
  })

  it('does not select two same-tier-eligible knights off a single remaining supply slot (regression)', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 999, ore: 999 }
    // Only 1 'strong' piece left in supply — e.g. after 2 were already
    // recruited/promoted onto the board and 1 was returned to supply by a
    // Displace action.
    player.knightSupply = { basic: 0, strong: 1, mighty: 3 }
    const k1: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'basic', active: false, vertexId: 'A' }
    const k2: KnightPiece = { id: 'k2', ownerId: player.id, strength: 'basic', active: false, vertexId: 'B' }
    player.knightPieces = [k1, k2]
    // Both k1 and k2 individually pass canPromoteKnight's own check (it
    // reads knightSupply.strong === 1, unchanged, for either call in
    // isolation) — only selecting BOTH into the same Smithing play would be
    // wrong, since there's just one 'strong' supply slot to cover it.
    expect(canPromoteKnight(player, k1)).toBe(true)
    expect(canPromoteKnight(player, k2)).toBe(true)
    const selected = selectSmithingPromotions(player, new Set())
    expect(selected.map((k) => k.id)).toEqual(['k1'])
  })

  it('caps at 2 promotions per play even with more eligible knights and ample supply', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 999, ore: 999 }
    player.knightSupply = { basic: 0, strong: 3, mighty: 3 }
    player.knightPieces = ['k1', 'k2', 'k3'].map((id, i) => ({
      id,
      ownerId: player.id,
      strength: 'basic' as const,
      active: false,
      vertexId: String.fromCharCode(65 + i),
    }))
    const selected = selectSmithingPromotions(player, new Set())
    expect(selected).toHaveLength(2)
  })

  it('excludes knights already at mighty (no next strength) and respects the politics-level gate', () => {
    const [player] = createInitialPlayers(1)
    player.resources = { ...emptyResources(), wool: 999, ore: 999 }
    player.knightSupply = { basic: 0, strong: 3, mighty: 3 }
    const mighty: KnightPiece = { id: 'k1', ownerId: player.id, strength: 'mighty', active: false, vertexId: 'A' }
    const strong: KnightPiece = { id: 'k2', ownerId: player.id, strength: 'strong', active: false, vertexId: 'B' } // needs Politics 3 to reach mighty
    player.knightPieces = [mighty, strong]
    expect(selectSmithingPromotions(player, new Set())).toEqual([])
    player.cityImprovements = { ...player.cityImprovements, politics: 3 }
    expect(selectSmithingPromotions(player, new Set()).map((k) => k.id)).toEqual(['k2'])
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

  it('skips edges not owned by the player', () => {
    const edges = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C')]
    const graph = graphOf(edges)
    const roads = { ...ownedBy(1, [edges[0]]), ...ownedBy(2, [edges[1]]) }
    const targets = recruitableVertices(1, graph, roads, {}, new Map())
    expect(targets).toEqual(new Set(['A', 'B'])) // Only vertices from edge AB
  })

  it('excludes vertices already occupied by a knight', () => {
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const knight: KnightPiece = { id: 'k1', ownerId: 1, strength: 'basic', active: false, vertexId: 'A' }
    const knightsByVertex = knightsByVertexOf([knight])
    const targets = recruitableVertices(1, graph, roads, {}, knightsByVertex)
    expect(targets).toEqual(new Set(['B'])) // A is occupied
  })
})

describe('knightMoveTargets', () => {
  it('skips edges not owned by the player in adjacency', () => {
    const edges = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C')]
    const graph = graphOf(edges)
    const roads = { ...ownedBy(1, [edges[0]]), ...ownedBy(2, [edges[1]]) }
    const knight: KnightPiece = { id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'A' }
    const targets = knightMoveTargets(knight, graph, roads, {}, new Map())
    expect(targets).toEqual(new Set(['B']))
  })

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

  it('handles isolated knight with no roads correctly', () => {
    const graph = graphOf([])
    const knight: KnightPiece = { id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'A' }
    const targets = knightMoveTargets(knight, graph, {}, {}, new Map())
    expect(targets).toEqual(new Set()) // No roads, nowhere to move
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

describe('reachableOpponentKnights', () => {
  it('finds reachable opponent knights of ANY strength, including one that would be excluded by strength-relative filtering', () => {
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    // A 'mighty' opponent knight sitting where a same-strength mover (or a
    // virtual 'mighty' one, per Intrigue's own reachability check in
    // App.tsx) would otherwise be excluded by knightDisplaceTargets' own
    // strictly-weaker-than filter (mighty >= mighty is NOT < , so it's
    // excluded there) — but Intrigue has no strength restriction at all
    // (CN3087), so this is exactly the case that was silently wrong before
    // this function was factored out.
    const mightyOpponent: KnightPiece = { id: 'k2', ownerId: 2, strength: 'mighty', active: true, vertexId: 'B' }
    const targets = reachableOpponentKnights('A', 1, graph, roads, {}, knightsByVertexOf([mightyOpponent]))
    expect(targets).toEqual([mightyOpponent])

    // Confirms the contrast directly: the SAME mighty opponent, from the
    // SAME origin, IS excluded by knightDisplaceTargets when the mover is
    // also 'mighty' (a tie) — this is the bug reachableOpponentKnights was
    // extracted to let Intrigue route around.
    const mover: KnightPiece = { id: 'k1', ownerId: 1, strength: 'mighty', active: true, vertexId: 'A' }
    const strengthFiltered = knightDisplaceTargets(mover, graph, roads, {}, knightsByVertexOf([mover, mightyOpponent]))
    expect(strengthFiltered).toEqual([])
  })

  it('excludes own knights and unreachable/non-knight vertices, same as the reachability half of knightDisplaceTargets', () => {
    const edges = [edge('AB', 'A', 'B'), edge('BC', 'B', 'C')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const own: KnightPiece = { id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'B' }
    const opponent: KnightPiece = { id: 'k2', ownerId: 2, strength: 'basic', active: false, vertexId: 'C' }
    const targets = reachableOpponentKnights('A', 1, graph, roads, {}, knightsByVertexOf([own, opponent]))
    expect(targets).toEqual([opponent])
  })

  it('knightDisplaceTargets still produces identical results to before the refactor (regression)', () => {
    const edges = [edge('AB', 'A', 'B')]
    const graph = graphOf(edges)
    const roads = ownedBy(1, edges)
    const mover: KnightPiece = { id: 'k1', ownerId: 1, strength: 'strong', active: true, vertexId: 'A' }
    const weaker: KnightPiece = { id: 'k2', ownerId: 2, strength: 'basic', active: false, vertexId: 'B' }
    expect(knightDisplaceTargets(mover, graph, roads, {}, knightsByVertexOf([mover, weaker]))).toEqual([weaker])
  })
})

describe('BARBARIAN_TRACK_LENGTH', () => {
  it('is 7, per CN3087\'s own component art', () => {
    expect(BARBARIAN_TRACK_LENGTH).toBe(7)
  })
})

describe('resolveBarbarianAttack', () => {
  it('barbarians win when strictly stronger; weakest non-immune contributor is pillaged', () => {
    const p1 = playerWithCities(1, [{ id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'X' }]) // strength 1
    const p2 = playerWithCities(2, []) // strength 0 — weakest, has 0 active knights
    const settlements = settlementsFor([
      { vertexId: 'A', ownerId: 1, type: 'city' },
      { vertexId: 'B', ownerId: 2, type: 'city' },
      { vertexId: 'C', ownerId: 2, type: 'city' },
    ])
    const result = resolveBarbarianAttack([p1, p2], settlements)
    expect(result.barbarianStrength).toBe(3)
    expect(result.defenderStrength).toBe(1)
    expect(result.defendersWin).toBe(false)
    expect(result.pillageTargets).toEqual([{ playerId: 2, eligibleCityVertexIds: ['B', 'C'] }])
    expect(result.winners).toEqual([])
  })

  it('defenders win on a tie; single highest contributor gets the VP', () => {
    const p1 = playerWithCities(1, [{ id: 'k1', ownerId: 1, strength: 'mighty', active: true, vertexId: 'X' }]) // 3
    const p2 = playerWithCities(2, [{ id: 'k2', ownerId: 2, strength: 'basic', active: true, vertexId: 'Y' }]) // 1
    const settlements = settlementsFor([{ vertexId: 'A', ownerId: 1, type: 'city' }, { vertexId: 'B', ownerId: 1, type: 'city' }, { vertexId: 'C', ownerId: 1, type: 'city' }, { vertexId: 'D', ownerId: 1, type: 'city' }]) // 4 cities === 4 defense? no, defense is 3+1=4, barbarian=4, tie -> defenders win
    const result = resolveBarbarianAttack([p1, p2], settlements)
    expect(result.barbarianStrength).toBe(4)
    expect(result.defenderStrength).toBe(4)
    expect(result.defendersWin).toBe(true)
    expect(result.pillageTargets).toEqual([])
    expect(result.winners).toEqual([{ playerId: 1, tied: false }])
  })

  it('a tie for highest contributor awards no VP — both are marked tied, each draws a card instead', () => {
    const p1 = playerWithCities(1, [{ id: 'k1', ownerId: 1, strength: 'strong', active: true, vertexId: 'X' }]) // 2
    const p2 = playerWithCities(2, [{ id: 'k2', ownerId: 2, strength: 'strong', active: true, vertexId: 'Y' }]) // 2
    const settlements = settlementsFor([
      { vertexId: 'A', ownerId: 1, type: 'city' },
      { vertexId: 'B', ownerId: 2, type: 'settlement' },
    ]) // barbarian strength 1, defense 4, defenders win easily, settlement B is ignored
    const result = resolveBarbarianAttack([p1, p2], settlements)
    expect(result.defendersWin).toBe(true)
    expect(result.winners).toEqual(
      expect.arrayContaining([
        { playerId: 1, tied: true },
        { playerId: 2, tied: true },
      ]),
    )
  })

  it('nobody wins when no player fielded an active knight, even though defenders technically "win"', () => {
    // Degenerate but reachable: the 7th 'ship' roll can land before anyone
    // has built a city, so barbarianStrength is 0 and 0 >= 0 is a
    // defenders' win — but with every player at 0 active knights there is
    // no contributor to reward, so winners must be empty rather than an
    // all-tied list handing everyone a free progress card.
    const p1 = playerWithCities(1, [])
    const p2 = playerWithCities(2, [{ id: 'k2', ownerId: 2, strength: 'mighty', active: false, vertexId: 'Y' }])
    const result = resolveBarbarianAttack([p1, p2], settlementsFor([]))
    expect(result.barbarianStrength).toBe(0)
    expect(result.defenderStrength).toBe(0)
    expect(result.defendersWin).toBe(true)
    expect(result.pillageTargets).toEqual([])
    expect(result.winners).toEqual([])
  })

  it('inactive knights do not count toward defender strength', () => {
    const p1 = playerWithCities(1, [{ id: 'k1', ownerId: 1, strength: 'mighty', active: false, vertexId: 'X' }])
    const settlements = settlementsFor([{ vertexId: 'A', ownerId: 1, type: 'city' }])
    const result = resolveBarbarianAttack([p1], settlements)
    expect(result.defenderStrength).toBe(0)
    expect(result.barbarianStrength).toBe(1)
    expect(result.defendersWin).toBe(false)
  })

  it('a player with 0 active knights automatically counts as lowest, even with cities', () => {
    const p1 = playerWithCities(1, [{ id: 'k1', ownerId: 1, strength: 'basic', active: true, vertexId: 'X' }])
    const p2 = playerWithCities(2, []) // 0 active knights
    const settlements = settlementsFor([
      { vertexId: 'A', ownerId: 1, type: 'city' },
      { vertexId: 'B', ownerId: 2, type: 'city' },
      { vertexId: 'C', ownerId: 2, type: 'settlement' }, // Settlement should not be pillageable
    ])
    const result = resolveBarbarianAttack([p1, p2], settlements)
    expect(result.pillageTargets).toEqual([{ playerId: 2, eligibleCityVertexIds: ['B'] }]) // C is ignored
  })

  it('skips a metropolis-only or cityless player when they are the lowest tier, cascading to the next tier', () => {
    // p1: cityless, 0 active knights (would be "lowest" but immune — the
    // rule text treats "no cities" and "only metropolises" identically,
    // and cityless is simpler to construct than a metropolis fixture,
    // since this module has no metropolis concept of its own).
    // p2: 1 basic active knight (strength 1), 2 cities — the next-lowest
    // tier, non-immune, gets pillaged (both of its cities are eligible).
    // p3: 1 mighty active knight (strength 3), 3 cities — strongest
    // defender, must NOT appear in pillageTargets even though non-immune,
    // since it's a higher tier than p2's.
    // Total board cities (5) must exceed total defender strength (4) for
    // barbarians to win at all — with only p2/p3's original 1 city each
    // (2 total) defenders would win outright (4 >= 2) and pillageTargets
    // would be empty before the tier-cascade logic ever runs; the extra
    // cities below exist purely to make the arithmetic reach that branch.
    const p1 = playerWithCities(1, [])
    const p2 = playerWithCities(2, [{ id: 'k2', ownerId: 2, strength: 'basic', active: true, vertexId: 'Y' }])
    const p3 = playerWithCities(3, [{ id: 'k3', ownerId: 3, strength: 'mighty', active: true, vertexId: 'Z' }])
    const settlements = settlementsFor([
      { vertexId: 'B1', ownerId: 2, type: 'city' },
      { vertexId: 'B2', ownerId: 2, type: 'city' },
      { vertexId: 'C1', ownerId: 3, type: 'city' },
      { vertexId: 'C2', ownerId: 3, type: 'city' },
      { vertexId: 'C3', ownerId: 3, type: 'city' },
    ])
    const result = resolveBarbarianAttack([p1, p2, p3], settlements)
    expect(result.barbarianStrength).toBe(5)
    expect(result.defenderStrength).toBe(4)
    expect(result.defendersWin).toBe(false)
    // p1 has 0 cities (immune, skipped even though "lowest" at 0 active knights).
    // p2 is next-lowest among the REMAINING (non-immune) players and is pillaged.
    // p3, though non-immune, is a separate (higher) tier and is untouched.
    expect(result.pillageTargets).toEqual([{ playerId: 2, eligibleCityVertexIds: ['B1', 'B2'] }])
  })

  it('a metropolis-only player is immune even though they own a city', () => {
    // p1 owns exactly 1 city, which is ALSO their metropolis — immune, 0
    // active knights (would be "lowest" but skipped). p2 is the next tier.
    const p1 = playerWithCities(1, [])
    const p2 = playerWithCities(2, [{ id: 'k2', ownerId: 2, strength: 'basic', active: true, vertexId: 'Y' }])
    const settlements = settlementsFor([
      { vertexId: 'M', ownerId: 1, type: 'city' }, // p1's metropolis
      { vertexId: 'B1', ownerId: 2, type: 'city' },
      { vertexId: 'B2', ownerId: 2, type: 'city' },
    ])
    // 3 cities total (M, B1, B2) vs. defense 0+1=1 — barbarians win easily.
    const result = resolveBarbarianAttack([p1, p2], settlements, new Set(['M']))
    expect(result.barbarianStrength).toBe(3) // metropolis STILL counts here
    expect(result.pillageTargets).toEqual([{ playerId: 2, eligibleCityVertexIds: ['B1', 'B2'] }])
  })
})
