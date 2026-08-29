import { describe, it, expect } from 'vitest'
import { computeFrameInnerSize, computeFrameOuterSize, FRAME_INNER, FRAME_OUTER } from './layout'

const STANDARD_MAX_CENTER_EXTENT = 4 * Math.sqrt(3)
const FRAME_MARGIN_PER_SIDE = (FRAME_INNER - STANDARD_MAX_CENTER_EXTENT) / 2
const FRAME_RIM_THICKNESS = FRAME_OUTER - FRAME_INNER

describe('computeFrameInnerSize', () => {
  it('returns FRAME_INNER for an empty array of tiles', () => {
    expect(computeFrameInnerSize([])).toBe(FRAME_INNER)
  })

  it('returns FRAME_INNER for a small board (e.g., just the center tile)', () => {
    expect(computeFrameInnerSize([{ x: 0, z: 0 }])).toBe(FRAME_INNER)
  })

  it('returns FRAME_INNER for a standard board layout', () => {
    const tiles = [
      { x: 0, z: 2 * Math.sqrt(3) },
      { x: 0, z: -2 * Math.sqrt(3) },
      { x: 3, z: 0 },
      { x: -3, z: 0 }
    ]
    expect(computeFrameInnerSize(tiles)).toBeCloseTo(FRAME_INNER)
  })

  it('expands the frame correctly for a very wide board', () => {
    const tiles = [{ x: 10, z: 0 }]
    const expected = 10 * 2 + FRAME_MARGIN_PER_SIDE * 2
    expect(computeFrameInnerSize(tiles)).toBeCloseTo(expected)
  })

  it('expands the frame correctly for a very tall board', () => {
    const tiles = [{ x: 0, z: 10 }]
    const expected = 10 * 2 + FRAME_MARGIN_PER_SIDE * 2
    expect(computeFrameInnerSize(tiles)).toBeCloseTo(expected)
  })

  it('handles negative coordinates correctly', () => {
    const tiles = [{ x: -10, z: -10 }]
    const expected = 10 * 2 + FRAME_MARGIN_PER_SIDE * 2
    expect(computeFrameInnerSize(tiles)).toBeCloseTo(expected)
  })
})

describe('computeFrameOuterSize', () => {
  it('correctly adds the rim thickness to FRAME_INNER', () => {
    expect(computeFrameOuterSize(FRAME_INNER)).toBeCloseTo(FRAME_OUTER)
  })

  it('correctly adds the rim thickness to an arbitrarily large inner size', () => {
    const innerSize = 20
    const expected = 20 + FRAME_RIM_THICKNESS
    expect(computeFrameOuterSize(innerSize)).toBeCloseTo(expected)
  })
})
