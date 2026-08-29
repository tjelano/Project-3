import { describe, expect, it } from 'vitest'
import { hidesResourceMesh } from './hiddenTiles'

describe('hidesResourceMesh', () => {
  it('returns false for "off"', () => {
    expect(hidesResourceMesh('off')).toBe(false)
  })

  it('returns false for "numbers"', () => {
    expect(hidesResourceMesh('numbers')).toBe(false)
  })

  it('returns true for "resources"', () => {
    expect(hidesResourceMesh('resources')).toBe(true)
  })

  it('returns true for "both"', () => {
    expect(hidesResourceMesh('both')).toBe(true)
  })
})
