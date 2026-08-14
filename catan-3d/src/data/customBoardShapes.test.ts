import { beforeEach, describe, expect, it } from 'vitest'
import { deleteCustomBoardShape, loadCustomBoardShapes, saveCustomBoardShape, type CustomBoardShape } from './customBoardShapes'

// customBoardShapes.ts reads/writes the real global `localStorage` —
// vitest's configured 'node' environment (vite.config.ts) has none, so
// this stands in a fresh in-memory implementation before every test (no
// cross-test bleed, no need to touch vitest's environment config just for
// this one file).
class MemoryStorage {
  private store = new Map<string, string>()
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null
  }
  setItem(key: string, value: string) {
    this.store.set(key, value)
  }
  removeItem(key: string) {
    this.store.delete(key)
  }
  clear() {
    this.store.clear()
  }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = new MemoryStorage() as unknown as Storage
})

describe('saveCustomBoardShape / loadCustomBoardShapes', () => {
  it('round-trips a shape with no biomeOverrides', () => {
    const shape: CustomBoardShape = { id: 'a', name: 'Test', cells: [{ col: 0, row: 0 }] }
    saveCustomBoardShape(shape)
    expect(loadCustomBoardShapes()).toEqual([shape])
  })

  it('round-trips a shape with biomeOverrides', () => {
    const shape: CustomBoardShape = {
      id: 'b',
      name: 'Painted',
      cells: [{ col: 0, row: 0 }, { col: 1, row: 0 }],
      biomeOverrides: { '0-0': 'desert' },
    }
    saveCustomBoardShape(shape)
    expect(loadCustomBoardShapes()).toEqual([shape])
  })

  it('overwrites an existing shape with the same id instead of duplicating it', () => {
    saveCustomBoardShape({ id: 'a', name: 'First', cells: [{ col: 0, row: 0 }] })
    saveCustomBoardShape({ id: 'a', name: 'Second', cells: [{ col: 0, row: 0 }] })
    const shapes = loadCustomBoardShapes()
    expect(shapes.length).toBe(1)
    expect(shapes[0].name).toBe('Second')
  })

  it('drops a saved entry whose biomeOverrides contains an invalid biome', () => {
    localStorage.setItem(
      'catan3d.customBoardShapes',
      JSON.stringify([{ id: 'bad', name: 'Bad', cells: [{ col: 0, row: 0 }], biomeOverrides: { '0-0': 'lava' } }]),
    )
    expect(loadCustomBoardShapes()).toEqual([])
  })

  it('keeps a saved entry whose biomeOverrides is absent', () => {
    localStorage.setItem(
      'catan3d.customBoardShapes',
      JSON.stringify([{ id: 'ok', name: 'OK', cells: [{ col: 0, row: 0 }] }]),
    )
    expect(loadCustomBoardShapes().length).toBe(1)
  })
})

describe('deleteCustomBoardShape', () => {
  it('removes only the matching id', () => {
    saveCustomBoardShape({ id: 'a', name: 'A', cells: [{ col: 0, row: 0 }] })
    saveCustomBoardShape({ id: 'b', name: 'B', cells: [{ col: 0, row: 0 }] })
    deleteCustomBoardShape('a')
    expect(loadCustomBoardShapes().map((s) => s.id)).toEqual(['b'])
  })

  it('is a no-op when the id does not exist', () => {
    saveCustomBoardShape({ id: 'a', name: 'A', cells: [{ col: 0, row: 0 }] })
    deleteCustomBoardShape('nonexistent')
    expect(loadCustomBoardShapes().map((s) => s.id)).toEqual(['a'])
  })

  it('returns the updated list', () => {
    saveCustomBoardShape({ id: 'a', name: 'A', cells: [{ col: 0, row: 0 }] })
    const result = deleteCustomBoardShape('a')
    expect(result).toEqual([])
  })
})
