import { describe, it, expect, vi } from 'vitest'
import { shuffle, secureRandom, createSeededRandom } from './seededRandom'

describe('seededRandom', () => {
  describe('secureRandom', () => {
    it('returns a number between 0 and 1', () => {
      const val = secureRandom()
      expect(val).toBeGreaterThanOrEqual(0)
      expect(val).toBeLessThan(1)
    })

    it('draws from crypto.getRandomValues, not Math.random', () => {
      const cryptoSpy = vi.spyOn(crypto, 'getRandomValues')
      secureRandom()
      expect(cryptoSpy).toHaveBeenCalledTimes(1)
      cryptoSpy.mockRestore()
    })
  })

  describe('createSeededRandom', () => {
    it('returns deterministic values for the same seed', () => {
      const r1 = createSeededRandom('test-seed')
      const r2 = createSeededRandom('test-seed')
      expect(r1()).toBe(r2())
      expect(r1()).toBe(r2())
    })

    it('returns different values for different seeds', () => {
      const r1 = createSeededRandom('seed-1')
      const r2 = createSeededRandom('seed-2')
      expect(r1()).not.toBe(r2())
    })
  })

  describe('shuffle', () => {
    it('preserves all elements', () => {
      const items = [1, 2, 3, 4, 5]
      const result = shuffle(items)

      expect(result).toHaveLength(items.length)
      expect(result).toEqual(expect.arrayContaining(items))
      // Ensure the original array isn't mutated
      expect(items).toEqual([1, 2, 3, 4, 5])
    })

    it('uses the provided random source', () => {
      const items = ['a', 'b', 'c']
      // A mock random function that always returns 0
      // Math.floor(0 * (i + 1)) will always be 0
      // i=2: [result[2], result[0]] = [result[0], result[2]] -> ['c', 'b', 'a']
      // i=1: [result[1], result[0]] = [result[0], result[1]] -> ['b', 'c', 'a']
      const mockRandom = vi.fn(() => 0)

      const result = shuffle(items, mockRandom)
      expect(mockRandom).toHaveBeenCalledTimes(2)
      expect(result).toEqual(['b', 'c', 'a'])
    })

    it('uses secureRandom by default', () => {
      const cryptoSpy = vi.spyOn(crypto, 'getRandomValues')
      const items = [1, 2, 3, 4, 5]
      const result = shuffle(items)
      expect(result).toEqual(expect.arrayContaining(items))
      expect(cryptoSpy).toHaveBeenCalled()
      cryptoSpy.mockRestore()
    })
  })
})
