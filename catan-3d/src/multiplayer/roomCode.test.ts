import { describe, it, expect } from 'vitest'
import { generateRoomCode, normalizeRoomCode, normalizePlayerName } from './roomCode'

describe('roomCode', () => {
  describe('generateRoomCode', () => {
    it('should generate a 4-character string', () => {
      const code = generateRoomCode()
      expect(typeof code).toBe('string')
      expect(code.length).toBe(4)
    })

    it('should only contain allowed characters', () => {
      const code = generateRoomCode()
      const allowedCharacters = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
      for (let i = 0; i < code.length; i++) {
        expect(allowedCharacters.includes(code[i])).toBe(true)
      }
    })
  })

  describe('normalizeRoomCode', () => {
    it('should trim whitespace', () => {
      expect(normalizeRoomCode('  ABCD  ')).toBe('ABCD')
    })

    it('should uppercase the code', () => {
      expect(normalizeRoomCode('abcd')).toBe('ABCD')
    })

    it('should limit to 4 characters', () => {
      expect(normalizeRoomCode('ABCDEFG')).toBe('ABCD')
    })
  })

  describe('normalizePlayerName', () => {
    it('should trim whitespace', () => {
      expect(normalizePlayerName('  Alice  ')).toBe('alice')
    })

    it('should lowercase the name', () => {
      expect(normalizePlayerName('Bob')).toBe('bob')
    })

    it('should handle empty strings', () => {
      expect(normalizePlayerName('')).toBe('')
    })

    it('should handle whitespace-only strings', () => {
      expect(normalizePlayerName('   ')).toBe('')
    })
  })
})
