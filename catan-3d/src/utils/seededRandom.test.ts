import { describe, it, expect, vi } from 'vitest'
import { createSeededRandom, shuffle } from './seededRandom'

describe('createSeededRandom', () => {
  it('should produce the same sequence of numbers for the same seed', () => {
    const random1 = createSeededRandom('test-seed')
    const random2 = createSeededRandom('test-seed')

    for (let i = 0; i < 10; i++) {
      expect(random1()).toBe(random2())
    }
  })

  it('should produce different sequences for different seeds', () => {
    const random1 = createSeededRandom('test-seed-1')
    const random2 = createSeededRandom('test-seed-2')

    // It's highly unlikely that the first 10 numbers are exactly the same
    let allMatch = true
    for (let i = 0; i < 10; i++) {
      if (random1() !== random2()) {
        allMatch = false
        break
      }
    }
    expect(allMatch).toBe(false)
  })

  it('should produce values bounded between 0 (inclusive) and 1 (exclusive)', () => {
    const random = createSeededRandom('bounds-test')

    for (let i = 0; i < 1000; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('should handle empty string seed', () => {
    const random = createSeededRandom('')
    const value = random()
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThan(1)
  })
})

describe('shuffle', () => {
  it('should return a new array and not modify the original', () => {
    const original = [1, 2, 3, 4, 5]
    const originalCopy = [...original]
    const shuffled = shuffle(original)

    expect(shuffled).not.toBe(original)
    expect(original).toEqual(originalCopy)
  })

  it('should contain the exact same elements', () => {
    const original = [1, 2, 3, 4, 5]
    const shuffled = shuffle(original)

    expect(shuffled).toHaveLength(original.length)
    expect([...shuffled].sort()).toEqual([...original].sort())
  })

  it('should handle empty array', () => {
    const original: number[] = []
    const shuffled = shuffle(original)
    expect(shuffled).toEqual([])
  })

  it('should handle single-element array', () => {
    const original = [42]
    const shuffled = shuffle(original)
    expect(shuffled).toEqual([42])
  })

  it('should shuffle deterministically when using a seeded random', () => {
    const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

    const random1 = createSeededRandom('shuffle-seed')
    const shuffled1 = shuffle(original, random1)

    const random2 = createSeededRandom('shuffle-seed')
    const shuffled2 = shuffle(original, random2)

    expect(shuffled1).toEqual(shuffled2)
  })

  it('should fallback to Math.random by default', () => {
    const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5)
    const original = [1, 2, 3]
    shuffle(original)

    expect(mathRandomSpy).toHaveBeenCalled()
    mathRandomSpy.mockRestore()
  })
})
