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
  // Edge id -> the 1 or 2 tile ids that share this edge (1 = boundary edge,
  // touching exactly one hex; 2 = interior edge, between two hexes). Lets a
  // ship-placement check ask "does this edge border a sea tile" the same
  // way tileVertexIds/vertexTileIds already answer the equivalent question
  // for vertices.
  edgeTileIds: Map<string, string[]>
  // Tile id -> the 6 edge ids bounding it — the exact reverse of
  // edgeTileIds above, same "forward/reverse pair" shape tileVertexIds/
  // vertexTileIds already use. Lets the pirate's steal-eligibility check
  // ask "which edges border this hex" the way it already asks "which
  // vertices border this hex" via tileVertexIds.
  tileEdgeIds: Map<string, string[]>
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
  const edgeTileIds = new Map<string, string[]>()
  const tileEdgeIds = new Map<string, string[]>()

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

      // Every tile visits each of its own 6 edges exactly once in this
      // loop (regardless of whether the edge itself was just created or
      // already existed from a neighboring tile), so this runs
      // unconditionally: a boundary edge (visited by only one tile) ends
      // up with exactly 1 entry, an interior edge (visited by both
      // tiles that share it) ends up with exactly 2.
      const tileIds = edgeTileIds.get(id)
      if (tileIds) {
        tileIds.push(tile.id)
      } else {
        edgeTileIds.set(id, [tile.id])
      }
      // Mirrors the block above in the opposite direction — every tile
      // visits each of its own 6 edges exactly once in this loop.
      const edgeIds = tileEdgeIds.get(tile.id)
      if (edgeIds) {
        edgeIds.push(id)
      } else {
        tileEdgeIds.set(tile.id, [id])
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
    edgeTileIds,
    tileEdgeIds,
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
function outwardEdgeAngle(graph: BoardGraph, tileById: Map<string, HexTileData>, edge: BoardEdge): number {
  const a = graph.vertexById.get(edge.a)!
  const b = graph.vertexById.get(edge.b)!
  const dx = b.x - a.x
  const dz = b.z - a.z
  const candidate = { x: -dz, z: dx }

  const tilesA = graph.vertexTileIds.get(edge.a) ?? []
  const tilesB = new Set(graph.vertexTileIds.get(edge.b) ?? [])
  const sharedTileIds = tilesA.filter((id) => tilesB.has(id))
  // Prefer the LAND tile among the (1 or 2) tiles sharing this edge — the
  // dock should point AWAY from land, out toward the water/void. For a pure
  // perimeter edge (1 tile, no adjacent water) that's just the one tile,
  // same as before; for a coastal land/water edge (2 tiles) this picks the
  // land one specifically, since array order between the pair isn't
  // otherwise meaningful.
  const adjacentTileId = sharedTileIds.find((id) => tileById.get(id)?.biome !== 'sea') ?? sharedTileIds[0]
  const tileCenter = adjacentTileId ? graph.tileCenters.get(adjacentTileId) : undefined
  const reference = tileCenter ? { x: edge.x - tileCenter.x, z: edge.z - tileCenter.z } : edge

  const pointsOutward = candidate.x * reference.x + candidate.z * reference.z > 0
  const normal = pointsOutward ? candidate : { x: dz, z: -dx }
  return Math.atan2(normal.x, normal.z)
}

// Ports sit on fixed, procedurally-derived COASTAL edges — never
// randomized, since only tile biome/number placement is meant to change
// between games, not the underlying grid shape. "Coastal" means an edge
// bordering exactly one LAND tile and nothing else land-side: either the
// graph's true outer perimeter (1 tile total, and it's land — a boundary
// edge whose one tile is water, e.g. the outer edge of a painted water
// ring, is NOT coastal, since there's no dock to place from further out)
// or an interior edge between one land tile and one water tile (the real
// shoreline once BoardShapeEditor lets water be a real tile in the shape,
// not just implied empty space beyond the land). An edge between two land
// tiles, or two water tiles, is interior either way and never coastal.
export function assignPorts(graph: BoardGraph, tileById: Map<string, HexTileData>): Port[] {
  const isLand = (tileId: string) => tileById.get(tileId)?.biome !== 'sea'

  const coastalEdges = graph.edges.filter((edge) => {
    const tileIds = graph.edgeTileIds.get(edge.id) ?? []
    if (tileIds.length === 1) return isLand(tileIds[0])
    if (tileIds.length === 2) return isLand(tileIds[0]) !== isLand(tileIds[1])
    return false
  })

  // Sorting order only needs to walk the perimeter roughly in sequence —
  // the radial angle is fine for that, unlike for the outward-facing
  // rotation itself.
  const sorted = [...coastalEdges].sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x))

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
      angle: outwardEdgeAngle(graph, tileById, edge),
    }
  })
}
