import { TILE_HEIGHT } from '../data/hexBoard'

/**
 * Physical layout of the "product": a walnut tray holding a basin of water
 * with the island in it. The frame, the sea and the basin floor all derive
 * their dimensions from here so they can never drift apart and leave a
 * visible seam.
 *
 * Board extents for reference: hex centres span x ∈ [-3, 3] and
 * z ∈ [-3.46, 3.46]; add HEX_RADIUS (1) for the tile edges and ~0.55 more
 * for the port docks, so the island needs roughly 11 units of clear opening.
 */

/** Clear opening of the tray — the water surface you can actually see. */
export const FRAME_INNER = 11.7

/** Outer footprint. The difference is the rim thickness (~0.95 a side). */
export const FRAME_OUTER = 13.6

/** Corner rounding, applied to both the opening and the outer edge. */
export const FRAME_RADIUS = 0.55

/** Slab thickness below the rim — reads as a solid block, not a sheet. */
export const FRAME_DEPTH = 0.85

/**
 * Total peak height of the swell — the sum of every octave's amplitude in
 * Ocean.tsx, so it is the true worst case, not an average. The shader scales
 * its octave weights (which sum to 1) by this value, which means this
 * constant and the geometry can never disagree.
 */
export const WAVE_AMPLITUDE = 0.11

/** Vertical gap between the highest possible crest and the tile surface. */
const SHORE_CLEARANCE = 0.08

/**
 * Resting waterline, derived rather than tuned by eye.
 *
 * The tile prism spans y ∈ [-TILE_HEIGHT/2, +TILE_HEIGHT/2] and the port
 * docks sit on the tile top, so the highest crest must stay below that top
 * surface or the sea visibly saws through the island and the piers. Solving
 *
 *     WATER_Y + WAVE_AMPLITUDE ≤ TILE_HEIGHT/2 − SHORE_CLEARANCE
 *
 * for WATER_Y guarantees it for every wave phase. With the current numbers
 * crests top out at 0.03 + 0.11 = 0.14, a clear 0.08 below the 0.22 tile
 * surface, while troughs bottom out at -0.08 — still above the tile's
 * underside at -0.22, so no gap ever opens beneath the island. The tile sits
 * ~57% submerged, giving the coast a real cliff.
 */
export const WATER_Y = TILE_HEIGHT / 2 - WAVE_AMPLITUDE - SHORE_CLEARANCE

/**
 * Tray rim height. Pinned to the WATERLINE, not the tile top: the rim only
 * has to contain the sea, and keeping it below the island's surface lets the
 * board rise proudly out of its case rather than being walled in. Still
 * clears the highest crest.
 */
export const FRAME_TOP_Y = WATER_Y + 0.13

/** Opaque floor beneath the water, so the sea reads as deep, not transparent. */
export const BASIN_Y = WATER_Y - 0.5

/**
 * The sea is cut slightly LARGER than the opening so its edge tucks under
 * the rim overhang. Without this margin, wave displacement at the boundary
 * can pull the surface inward and flash a gap.
 */
export const WATER_OVERLAP = 0.5
