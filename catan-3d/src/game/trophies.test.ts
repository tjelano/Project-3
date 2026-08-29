import { describe, expect, it } from 'vitest'
import { calculateLongestRoad, pickTrophyHolder } from './trophies'
import { LARGEST_ARMY_MIN_KNIGHTS, LONGEST_ROAD_MIN_LENGTH, type Building } from './types'
import type { BoardEdge, BoardGraph } from '../data/boardGraph'

// calculateLongestRoad only reads graph.edges, so these fixtures build the
// minimum shape rather than a full 19-hex board — keeps each case readable
// and lets us construct topologies (forks, loops, blocked paths) that would
// be fiddly to arrange on the real board.
function edge(id: string, a: string, b: string): BoardEdge {
  return { id, a, b, x: 0, z: 0 }
}

function graphOf(edges: BoardEdge[]): BoardGraph {
  return { edges } as BoardGraph
}

function chain(...vertices: string[]): BoardEdge[] {
  return vertices.slice(1).map((v, i) => edge(`${vertices[i]}${v}`, vertices[i], v))
}

function ownedBy(playerId: number, edges: BoardEdge[]): Record<string, number> {
  return Object.fromEntries(edges.map((e) => [e.id, playerId]))
}

describe('calculateLongestRoad', () => {
  it('counts a simple unbroken chain', () => {
    const edges = chain('A', 'B', 'C', 'D', 'E', 'F') // 5 edges
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), {})).toBe(5)
  })

  it('returns 0 when the player owns no roads', () => {
    const edges = chain('A', 'B', 'C')
    expect(calculateLongestRoad(1, ownedBy(2, edges), graphOf(edges), {})).toBe(0)
  })

  it('takes the longest branch of a fork, not the total edge count', () => {
    // A-B-C-D plus a spur C-E. Four edges owned, but no simple path uses
    // more than 3 of them.
    const edges = [...chain('A', 'B', 'C', 'D'), edge('CE', 'C', 'E')]
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), {})).toBe(3)
  })

  it('never reuses an edge, so a closed loop counts each edge once', () => {
    const edges = [...chain('A', 'B', 'C', 'D'), edge('DA', 'D', 'A')]
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), {})).toBe(4)
  })

  it("ignores other players' roads", () => {
    const mine = chain('A', 'B', 'C')
    const theirs = [edge('CD', 'C', 'D'), edge('DE', 'D', 'E')]
    const roads = { ...ownedBy(1, mine), ...ownedBy(2, theirs) }
    expect(calculateLongestRoad(1, roads, graphOf([...mine, ...theirs]), {})).toBe(2)
  })

  it("breaks the path at an opponent's settlement", () => {
    const edges = chain('A', 'B', 'C', 'D', 'E') // 4 edges
    const settlements: Record<string, Building> = { C: { ownerId: 2, type: 'settlement' } }
    // Blocked mid-chain: the best remaining run is A-B-C or C-D-E.
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), settlements)).toBe(2)
  })

  it("breaks the path at an opponent's city too", () => {
    const edges = chain('A', 'B', 'C', 'D', 'E')
    const settlements: Record<string, Building> = { C: { ownerId: 2, type: 'city' } }
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), settlements)).toBe(2)
  })

  it('is not blocked by the road owner’s own settlement', () => {
    const edges = chain('A', 'B', 'C', 'D', 'E')
    const settlements: Record<string, Building> = { C: { ownerId: 1, type: 'settlement' } }
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), settlements)).toBe(4)
  })

  it('an opponent knight breaks the road the same way an opponent settlement does', () => {
    const edges = chain('A', 'B', 'C', 'D', 'E', 'F') // 5 edges, would be length 5
    const knightOwnerByVertex = new Map([['D', 2]]) // opponent's knight sits at D
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), {}, knightOwnerByVertex)).toBe(3) // A-B-C-D, blocked past D
  })

  it('the road owner own knight does not break their own road', () => {
    const edges = chain('A', 'B', 'C', 'D', 'E', 'F')
    const knightOwnerByVertex = new Map([['D', 1]]) // the SAME player's own knight
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), {}, knightOwnerByVertex)).toBe(5)
  })

  it('is not blocked by an unowned empty vertex', () => {
    const edges = chain('A', 'B', 'C', 'D', 'E', 'F') // 5 edges
    const settlements: Record<string, Building> = { C: undefined as unknown as Building } // explicitly undefined
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), settlements)).toBe(5)
  })

  it('is not blocked by an unowned empty knight vertex', () => {
    const edges = chain('A', 'B', 'C')
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), {}, new Map([['B', undefined as unknown as number]]))).toBe(2)
  })

  it('evaluates adjacency without crashing on disconnected vertices', () => {
    const edges = chain('A', 'B', 'C')
    // An extra, unowned edge elsewhere in the graph shouldn't affect (or
    // crash) the longest-road walk for the owned chain.
    const extraGraph = { edges: [...edges, edge('E', 'X', 'Y')] } as BoardGraph
    const roads = ownedBy(1, edges) // player doesn't own E
    expect(calculateLongestRoad(1, roads, extraGraph, {})).toBe(2)
  })

  it('with no knightOwnerByVertex argument, behaves exactly as before', () => {
    const edges = chain('A', 'B', 'C', 'D', 'E', 'F')
    expect(calculateLongestRoad(1, ownedBy(1, edges), graphOf(edges), {})).toBe(5)
  })

  it('counts ships the same as roads when there are no roads at all', () => {
    const edges = chain('A', 'B', 'C', 'D', 'E', 'F') // 5 edges
    expect(calculateLongestRoad(1, {}, graphOf(edges), {}, new Map(), ownedBy(1, edges))).toBe(5)
  })

  it('chains a road directly into a ship through an owned settlement', () => {
    // A-B-C is roads, C-D-E is ships, with a settlement at C (the junction).
    const roadEdges = chain('A', 'B', 'C')
    const shipEdges = chain('C', 'D', 'E')
    const roads = ownedBy(1, roadEdges)
    const ships = ownedBy(1, shipEdges)
    const settlements: Record<string, Building> = { C: { ownerId: 1, type: 'settlement' } }
    expect(calculateLongestRoad(1, roads, graphOf([...roadEdges, ...shipEdges]), settlements, new Map(), ships)).toBe(4)
  })

  it('breaks a road-to-ship transition at a vertex with no owned building', () => {
    // Same topology as above, but NO settlement at C — the junction vertex.
    const roadEdges = chain('A', 'B', 'C')
    const shipEdges = chain('C', 'D', 'E')
    const roads = ownedBy(1, roadEdges)
    const ships = ownedBy(1, shipEdges)
    // Longest run without crossing the type boundary: either A-B-C (2 roads) or C-D-E (2 ships).
    expect(calculateLongestRoad(1, roads, graphOf([...roadEdges, ...shipEdges]), {}, new Map(), ships)).toBe(2)
  })

  it('does not break a same-type continuation at a vertex with no owned building', () => {
    // All-ship chain through an un-owned vertex — no type mismatch, so it's never blocked.
    const shipEdges = chain('A', 'B', 'C', 'D', 'E')
    expect(calculateLongestRoad(1, {}, graphOf(shipEdges), {}, new Map(), ownedBy(1, shipEdges))).toBe(4)
  })

  it("still breaks at an opponent's building regardless of edge type", () => {
    const roadEdges = chain('A', 'B', 'C')
    const shipEdges = chain('C', 'D', 'E')
    const roads = ownedBy(1, roadEdges)
    const ships = ownedBy(1, shipEdges)
    const settlements: Record<string, Building> = { C: { ownerId: 2, type: 'settlement' } } // opponent's, not mine
    expect(calculateLongestRoad(1, roads, graphOf([...roadEdges, ...shipEdges]), settlements, new Map(), ships)).toBe(2)
  })

  it('the very first edge from a starting vertex is never type-constrained', () => {
    // A single ship edge with nothing before it — no incoming type exists yet.
    const shipEdges = chain('A', 'B')
    expect(calculateLongestRoad(1, {}, graphOf(shipEdges), {}, new Map(), ownedBy(1, shipEdges))).toBe(1)
  })
})

describe('pickTrophyHolder', () => {
  const LR = LONGEST_ROAD_MIN_LENGTH // 5

  it('leaves the trophy unclaimed below the threshold', () => {
    expect(pickTrophyHolder(null, new Map([[1, 4], [2, 3]]), LR)).toBeNull()
  })

  it('awards it to the first player to reach the threshold', () => {
    expect(pickTrophyHolder(null, new Map([[1, 5], [2, 3]]), LR)).toBe(1)
  })

  it('keeps the incumbent on a tie', () => {
    expect(pickTrophyHolder(1, new Map([[1, 6], [2, 6]]), LR)).toBe(1)
  })

  it('transfers only when a challenger strictly exceeds the holder', () => {
    expect(pickTrophyHolder(1, new Map([[1, 6], [2, 7]]), LR)).toBe(2)
  })

  // --- S0-1 regression ---------------------------------------------------
  // An opponent settling mid-path can split the holder's network. Before
  // the fix, the holder kept Longest Road (and its +2 VP) with 3 roads,
  // which could hand the game to the wrong player.
  it('returns the trophy when the holder drops below the threshold and nobody else qualifies', () => {
    expect(pickTrophyHolder(1, new Map([[1, 3], [2, 4], [3, 2]]), LR)).toBeNull()
  })

  it('hands the trophy to a qualifying challenger when the holder is broken below the threshold', () => {
    expect(pickTrophyHolder(1, new Map([[1, 3], [2, 5]]), LR)).toBe(2)
  })

  it('picks the strongest qualifying challenger when the holder is broken', () => {
    expect(pickTrophyHolder(1, new Map([[1, 2], [2, 5], [3, 8]]), LR)).toBe(3)
  })

  it('leaves the trophy unclaimed when the holder drops below threshold and multiple challengers tie for the lead', () => {
    expect(pickTrophyHolder(1, new Map([[1, 4], [2, 5], [3, 5]]), LR)).toBeNull()
    expect(pickTrophyHolder(1, new Map([[1, 4], [3, 5], [2, 5]]), LR)).toBeNull()
  })

  it('treats a holder who vanished from the counts as unqualified', () => {
    expect(pickTrophyHolder(9, new Map([[1, 5]]), LR)).toBe(1)
  })

  it('applies the same rules to Largest Army', () => {
    const LA = LARGEST_ARMY_MIN_KNIGHTS // 3
    expect(pickTrophyHolder(null, new Map([[1, 2]]), LA)).toBeNull()
    expect(pickTrophyHolder(null, new Map([[1, 3]]), LA)).toBe(1)
    expect(pickTrophyHolder(1, new Map([[1, 3], [2, 3]]), LA)).toBe(1)
    expect(pickTrophyHolder(1, new Map([[1, 3], [2, 4]]), LA)).toBe(2)
  })
})
