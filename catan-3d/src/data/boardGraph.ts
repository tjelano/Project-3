import { HEX_RADIUS, type HexTileData } from './hexBoard'
import type { ResourceType } from '../game/types'

export interface BoardVertex {
  id: string
  x: number
  z: number
}

export interface BoardEdge {
  id: string
  a: string
  b: string
  x: number
  z: number
}

export interface BoardGraph {
  vertices: BoardVertex[]
  edges: BoardEdge[]
  vertexById: Map<string, BoardVertex>
  // tile id -> the ids of its 6 corner vertices, for resource-yield lookups.
  tileVertexIds: Map<string, string[]>
  // vertex id -> the ids of the tiles that touch it (reverse of the above),
  // for the setup-phase second-settlement resource kickstart.
  vertexTileIds: Map<string, string[]>
  // vertex id -> the ids of the edges touching it, for road/settlement
  // connectivity checks (does the player have a road at this intersection?).
  vertexEdgeIds: Map<string, string[]>
  // tile id -> its center, for determining which way a boundary edge's
  // port should face (see outwardEdgeAngle).
  tileCenters: Map<string, { x: number; z: number }>
}

// Flat-top hex corners sit at 30/90/150/210/270/330 degrees from center —
// this matches the Math.PI / 6 rotation already baked into the rendered
// hex mesh (see HexTile in CatanBoard.tsx).
const CORNER_ANGLES = [30, 90, 150, 210, 270, 330].map((deg) => (deg * Math.PI) / 180)

// Round shared corners to this many decimals so adjacent hexes' identical
// corner coordinates collapse onto the same vertex instead of duplicating.
const DEDUPE_PRECISION = 4

function roundCoord(n: number): number {
  const factor = 10 ** DEDUPE_PRECISION
  return Math.round(n * factor) / factor
}

// Derives the full vertex/edge graph purely from tile centers and
// HEX_RADIUS — no randomness, so the graph is always mathematically
// consistent with however the board happens to be laid out.
export function buildBoardGraph(tiles: HexTileData[]): BoardGraph {
  const vertexById = new Map<string, BoardVertex>()
  const edgeById = new Map<string, BoardEdge>()
  const tileVertexIds = new Map<string, string[]>()
  const vertexTileIds = new Map<string, string[]>()
  const vertexEdgeIds = new Map<string, string[]>()
  const tileCenters = new Map<string, { x: number; z: number }>()

  const getVertex = (x: number, z: number): BoardVertex => {
    const rx = roundCoord(x)
    const rz = roundCoord(z)
    const id = `${rx}:${rz}`
    let vertex = vertexById.get(id)
    if (!vertex) {
      vertex = { id, x: rx, z: rz }
      vertexById.set(id, vertex)
    }
    return vertex
  }

  for (const tile of tiles) {
    tileCenters.set(tile.id, { x: tile.x, z: tile.z })
    const corners = CORNER_ANGLES.map((angle) =>
      getVertex(tile.x + HEX_RADIUS * Math.sin(angle), tile.z + HEX_RADIUS * Math.cos(angle)),
    )
    tileVertexIds.set(
      tile.id,
      corners.map((c) => c.id),
    )
    for (const corner of corners) {
      const tileIds = vertexTileIds.get(corner.id)
      if (tileIds) {
        tileIds.push(tile.id)
      } else {
        vertexTileIds.set(corner.id, [tile.id])
      }
    }

    for (let i = 0; i < corners.length; i++) {
      const a = corners[i]
      const b = corners[(i + 1) % corners.length]
      const id = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`

      if (!edgeById.has(id)) {
        edgeById.set(id, {
          id,
          a: a.id,
          b: b.id,
          x: (a.x + b.x) / 2,
          z: (a.z + b.z) / 2,
        })

        for (const vertexId of [a.id, b.id]) {
          const edgeIds = vertexEdgeIds.get(vertexId)
          if (edgeIds) {
            edgeIds.push(id)
          } else {
            vertexEdgeIds.set(vertexId, [id])
          }
        }
      }
    }
  }

  return {
    vertices: [...vertexById.values()],
    edges: [...edgeById.values()],
    vertexById,
    tileVertexIds,
    vertexTileIds,
    vertexEdgeIds,
    tileCenters,
  }
}

// Vertex id -> ids of the vertices directly connected to it by an edge.
// Used for the settlement distance rule (no two settlements on adjacent
// intersections).
export function buildVertexAdjacency(edges: BoardEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>()

  const addNeighbor = (from: string, to: string) => {
    const neighbors = adjacency.get(from)
    if (neighbors) {
      neighbors.push(to)
    } else {
      adjacency.set(from, [to])
    }
  }

  for (const edge of edges) {
    addNeighbor(edge.a, edge.b)
    addNeighbor(edge.b, edge.a)
  }

  return adjacency
}

export type PortType = '3:1' | ResourceType

export interface Port {
  id: string
  edgeId: string
  vertexIds: [string, string]
  type: PortType
  x: number
  z: number
  // The edge's OWN true perpendicular direction (not the direction from
  // the board center through its midpoint — those two only coincide on
  // the flat middle of each of the overall board's 6 sides; everywhere
  // else the boundary is jagged, made of individual hex edges at their
  // own angles, and the two diverged by up to 49 degrees when measured
  // against the real board data). Used to point the 3D dock outward,
  // flush against the edge it's actually attached to.
  angle: number
}

// Standard Catan harbor mix: one 2:1 port per resource plus 4 generic 3:1
// ports, alternating around the perimeter (9 total).
const PORT_TYPE_SEQUENCE: PortType[] = ['ore', '3:1', 'wool', '3:1', 'grain', '3:1', 'lumber', '3:1', 'brick']

// The edge's own perpendicular, not the direction from the board center
// through its midpoint — see the comment on Port.angle for why those
// differ. Rotating the edge's direction vector 90 degrees gives two
// candidate normals; the correct one is whichever points away from the
// SINGLE tile this boundary edge actually belongs to (every boundary edge
// has exactly one, by definition). That's exact for any board shape —
// unlike the previous "distance from the board's overall origin"
// approximation, which silently flipped sign on boundary edges near a
// concave notch in an irregular player-drawn custom shape (a symmetric
// built-in shape never has one, which is why this only ever showed up on
// a custom board).
function outwardEdgeAngle(graph: BoardGraph, edge: BoardEdge): number {
  const a = graph.vertexById.get(edge.a)!
  const b = graph.vertexById.get(edge.b)!
  const dx = b.x - a.x
  const dz = b.z - a.z
  const candidate = { x: -dz, z: dx }

  const tilesA = graph.vertexTileIds.get(edge.a) ?? []
  const tilesB = new Set(graph.vertexTileIds.get(edge.b) ?? [])
  const adjacentTileId = tilesA.find((id) => tilesB.has(id))
  const tileCenter = adjacentTileId ? graph.tileCenters.get(adjacentTileId) : undefined
  const reference = tileCenter ? { x: edge.x - tileCenter.x, z: edge.z - tileCenter.z } : edge

  const pointsOutward = candidate.x * reference.x + candidate.z * reference.z > 0
  const normal = pointsOutward ? candidate : { x: dz, z: -dx }
  return Math.atan2(normal.x, normal.z)
}

// Ports sit on fixed, procedurally-derived boundary edges — never
// randomized, since only tile biome/number placement is meant to change
// between games, not the underlying grid shape.
export function assignPorts(graph: BoardGraph): Port[] {
  const boundaryEdges = graph.edges.filter((edge) => {
    const tilesA = graph.vertexTileIds.get(edge.a) ?? []
    const tilesB = new Set(graph.vertexTileIds.get(edge.b) ?? [])
    const sharedCount = tilesA.filter((id) => tilesB.has(id)).length
    return sharedCount === 1 // shared by exactly one tile = on the perimeter
  })

  // Sorting order only needs to walk the perimeter roughly in sequence —
  // the radial angle is fine for that, unlike for the outward-facing
  // rotation itself.
  const sorted = [...boundaryEdges].sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x))

  if (sorted.length === 0) return []

  const portCount = PORT_TYPE_SEQUENCE.length

  return PORT_TYPE_SEQUENCE.map((type, i) => {
    const edge = sorted[Math.floor((i * sorted.length) / portCount)]
    return {
      id: `port-${i}`,
      edgeId: edge.id,
      vertexIds: [edge.a, edge.b],
      type,
      x: edge.x,
      z: edge.z,
      angle: outwardEdgeAngle(graph, edge),
    }
  })
}
