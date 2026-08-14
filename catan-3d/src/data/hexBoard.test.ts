import { describe, expect, it } from 'vitest'
import { buildHexBoard, buildHexBoardFromCells, type Biome } from './hexBoard'

describe('buildHexBoard', () => {
  it('generates exactly 19 tiles', () => {
    const board = buildHexBoard()
    expect(board.length).toBe(19)
  })

  it('contains the correct distribution of biomes', () => {
    const board = buildHexBoard()
    const biomes = board.map(tile => tile.biome)

    expect(biomes.filter(b => b === 'hills').length).toBe(3)
    expect(biomes.filter(b => b === 'forest').length).toBe(4)
    expect(biomes.filter(b => b === 'pasture').length).toBe(4)
    expect(biomes.filter(b => b === 'fields').length).toBe(4)
    expect(biomes.filter(b => b === 'mountains').length).toBe(3)
    expect(biomes.filter(b => b === 'desert').length).toBe(1)
  })

  it('contains the correct distribution of numbers', () => {
    const board = buildHexBoard()
    const numbers = board.map(tile => tile.number).filter(n => n !== null) as number[]

    const numberCounts = numbers.reduce((acc, num) => {
      acc[num] = (acc[num] || 0) + 1
      return acc
    }, {} as Record<number, number>)

    expect(numberCounts[2]).toBe(1)
    expect(numberCounts[3]).toBe(2)
    expect(numberCounts[4]).toBe(2)
    expect(numberCounts[5]).toBe(2)
    expect(numberCounts[6]).toBe(2)
    expect(numberCounts[7]).toBeUndefined() // 7 is not in NUMBER_POOL
    expect(numberCounts[8]).toBe(2)
    expect(numberCounts[9]).toBe(2)
    expect(numberCounts[10]).toBe(2)
    expect(numberCounts[11]).toBe(2)
    expect(numberCounts[12]).toBe(1)
    expect(numbers.length).toBe(18) // 19 tiles - 1 desert
  })

  it('assigns null as the number to the desert tile and valid numbers to other tiles', () => {
    const board = buildHexBoard()

    for (const tile of board) {
      if (tile.biome === 'desert') {
        expect(tile.number).toBeNull()
      } else {
        expect(tile.number).not.toBeNull()
        expect(tile.number).toBeGreaterThanOrEqual(2)
        expect(tile.number).toBeLessThanOrEqual(12)
        expect(tile.number).not.toBe(7)
      }
    }
  })

  it('builds the board in a 3-4-5-4-3 column structure', () => {
    const board = buildHexBoard()

    // tile.col is centered around 0 (-2..2 for the standard board's 5
    // columns), not a raw 0-based index — the convention needed once board
    // shapes became arbitrary cell lists (BoardCell) rather than a fixed
    // column-heights array.
    const colCounts = board.reduce((acc, tile) => {
      acc[tile.col] = (acc[tile.col] || 0) + 1
      return acc
    }, {} as Record<number, number>)

    expect(colCounts[-2]).toBe(3)
    expect(colCounts[-1]).toBe(4)
    expect(colCounts[0]).toBe(5)
    expect(colCounts[1]).toBe(4)
    expect(colCounts[2]).toBe(3)
  })

  it('produces identical boards for the same seed', () => {
    const seed = 'test-seed-123'
    const board1 = buildHexBoard(seed)
    const board2 = buildHexBoard(seed)

    expect(board1).toEqual(board2)
  })

  it('produces different boards for different seeds', () => {
    const board1 = buildHexBoard('seed-A')
    const board2 = buildHexBoard('seed-B')

    // It is highly unlikely that two different seeds produce exactly the same board
    // We check that at least one property (like biome order) is different
    const biomes1 = board1.map(t => t.biome)
    const biomes2 = board2.map(t => t.biome)

    expect(biomes1).not.toEqual(biomes2)
  })
})

describe('buildHexBoardFromCells biome overrides', () => {
  const cells = [
    { col: 0, row: 0 },
    { col: 0, row: 1 },
    { col: 0, row: 2 },
    { col: 1, row: 0 },
    { col: -1, row: -1 },
  ]

  it('assigns the exact painted biome to a painted tile', () => {
    const board = buildHexBoardFromCells(cells, 'seed-1', undefined, { '0-0': 'desert' })
    const tile = board.find((t) => t.col === 0 && t.row === 0)
    expect(tile?.biome).toBe('desert')
    expect(tile?.number).toBeNull()
  })

  it('still produces exactly one tile per input cell', () => {
    const board = buildHexBoardFromCells(cells, 'seed-1', undefined, { '0-0': 'desert' })
    expect(board.length).toBe(cells.length)
  })

  it('produces the same result for the same seed with the same overrides', () => {
    const overrides = { '0-0': 'mountains' as const }
    const board1 = buildHexBoardFromCells(cells, 'seed-2', undefined, overrides)
    const board2 = buildHexBoardFromCells(cells, 'seed-2', undefined, overrides)
    expect(board1).toEqual(board2)
  })

  it('is unaffected by biomeOverrides being entirely absent (backward compatible)', () => {
    const withUndefined = buildHexBoardFromCells(cells, 'seed-3')
    const withEmpty = buildHexBoardFromCells(cells, 'seed-3', undefined, {})
    expect(withUndefined).toEqual(withEmpty)
  })

  it('handles painting more of a biome than its natural share without crashing or losing tiles', () => {
    // desertCountFor(5) is 1 — painting 3 deserts already exceeds the
    // natural share for two of them. This must not throw or shrink the board.
    const overrides = { '0-0': 'desert' as const, '0-1': 'desert' as const, '0-2': 'desert' as const }
    const board = buildHexBoardFromCells(cells, 'seed-4', undefined, overrides)
    expect(board.length).toBe(cells.length)
    const painted = board.filter((t) => ['0-0', '0-1', '0-2'].includes(`${t.col}-${t.row}`))
    expect(painted.every((t) => t.biome === 'desert')).toBe(true)
  })

  it('still assigns a random number to a painted non-desert tile', () => {
    const board = buildHexBoardFromCells(cells, 'seed-5', undefined, { '0-0': 'mountains' })
    const tile = board.find((t) => t.col === 0 && t.row === 0)
    expect(tile?.number).not.toBeNull()
    expect(tile?.number).toBeGreaterThanOrEqual(2)
    expect(tile?.number).toBeLessThanOrEqual(12)
  })

  it('handles over-painting a non-desert biome without losing numbers on unpainted tiles', () => {
    // Regression test: painting a biome with zero natural share (or more
    // instances than its share) can't cause the pool truncation to randomly
    // discard the last desert entries, leaving non-desert tiles with
    // undefined numbers. This triggered when painted non-desert tiles
    // exceeded successful removals from the pool.
    const smallBoard = [
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 0, row: 2 },
      { col: 1, row: 0 },
      { col: -1, row: -1 },
    ]
    // On a 5-tile board, mountains has 0 natural share. Painting it should
    // not cause pool truncation to discard a desert entry, leaving another
    // non-desert tile with undefined number.
    const board = buildHexBoardFromCells(smallBoard, 'probe-2', undefined, { '0-0': 'mountains' })
    // Every non-desert tile must have a valid number token
    for (const tile of board) {
      if (tile.biome !== 'desert') {
        expect(tile.number).not.toBeUndefined()
        expect(tile.number).not.toBeNull()
        expect(tile.number).toBeGreaterThanOrEqual(2)
        expect(tile.number).toBeLessThanOrEqual(12)
        expect(tile.number).not.toBe(7)
      }
    }
  })

  it('always leaves at least one desert tile when only some tiles are painted (probabilistic truncation case)', () => {
    // Regression test for the final-review-caught bug: the pool truncation
    // in buildHexBoardFromCells wasn't biome-aware and could randomly
    // discard the board's only remaining desert entry along with the
    // excess. Painting exactly 2 of the 5 cells forest (leaving 3
    // unpainted, with a 1-entry pool surplus to trim after the successful
    // removal) reproduces the exact truncation shape that crashed App.tsx's
    // robber placement ~7.5% of the time before the desert-preserving
    // truncation fix. NOTE: this is deliberately NOT the same as painting
    // every cell non-desert — that case has no desert to preserve in the
    // first place (the player explicitly excluded it), so it isn't
    // covered here; App.tsx's fallback (robber on the first tile) is what
    // protects that scenario instead.
    const partialOverrides: Record<string, Biome> = {
      '0-0': 'forest',
      '0-1': 'forest',
    }
    for (let s = 0; s < 200; s++) {
      const board = buildHexBoardFromCells(cells, `desert-guard-partial-${s}`, undefined, partialOverrides)
      expect(board.some((tile) => tile.biome === 'desert')).toBe(true)
    }
  })
})

describe('buildHexBoard with customBiomeOverrides', () => {
  it('passes overrides through only when a custom shape is active', () => {
    const customCells = [{ col: 0, row: 0 }, { col: 0, row: 1 }, { col: 1, row: 0 }]
    const board = buildHexBoard('seed-6', 'standard', customCells, { '0-0': 'hills' })
    const tile = board.find((t) => t.col === 0 && t.row === 0)
    expect(tile?.biome).toBe('hills')
  })

  it('ignores customBiomeOverrides when no custom cells are given', () => {
    const withOverrides = buildHexBoard('seed-7', 'standard', undefined, { '0-0': 'hills' })
    const without = buildHexBoard('seed-7', 'standard')
    expect(withOverrides).toEqual(without)
  })
})
