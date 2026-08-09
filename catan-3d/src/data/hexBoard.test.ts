import { describe, expect, it } from 'vitest'
import { buildHexBoard } from './hexBoard'

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

    const colCounts = board.reduce((acc, tile) => {
      acc[tile.col] = (acc[tile.col] || 0) + 1
      return acc
    }, {} as Record<number, number>)

    expect(colCounts[0]).toBe(3)
    expect(colCounts[1]).toBe(4)
    expect(colCounts[2]).toBe(5)
    expect(colCounts[3]).toBe(4)
    expect(colCounts[4]).toBe(3)
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
