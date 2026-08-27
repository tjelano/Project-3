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

  it('returns empty array when storage is empty', () => {
    expect(loadCustomBoardShapes()).toEqual([])
  })

  it('returns empty array when storage contains invalid JSON', () => {
    localStorage.setItem('catan3d.customBoardShapes', '{[invalid json')
    expect(loadCustomBoardShapes()).toEqual([])
  })

  it('returns empty array when storage contains a non-array', () => {
    localStorage.setItem('catan3d.customBoardShapes', JSON.stringify({ id: 'bad' }))
    expect(loadCustomBoardShapes()).toEqual([])
  })

  it('filters out malformed shapes', () => {
    localStorage.setItem(
      'catan3d.customBoardShapes',
      JSON.stringify([
        { id: 'good', name: 'Good', cells: [{ col: 0, row: 0 }] },
        { name: 'Missing ID', cells: [{ col: 0, row: 0 }] },
        { id: 'missing-name', cells: [{ col: 0, row: 0 }] },
        { id: 'missing-cells', name: 'Missing Cells' },
        { id: 'cells-not-array', name: 'Cells Not Array', cells: 'not an array' },
        null,
        'not an object',
      ]),
    )
    const shapes = loadCustomBoardShapes()
    expect(shapes.length).toBe(1)
    expect(shapes[0].id).toBe('good')
  })

  it('filters out shapes with invalid biomeOverrides type', () => {
    localStorage.setItem(
      'catan3d.customBoardShapes',
      JSON.stringify([
        { id: 'bad-overrides-1', name: 'Bad Overrides 1', cells: [{ col: 0, row: 0 }], biomeOverrides: 'not an object' },
        { id: 'bad-overrides-2', name: 'Bad Overrides 2', cells: [{ col: 0, row: 0 }], biomeOverrides: null },
      ]),
    )
    expect(loadCustomBoardShapes()).toEqual([])
  })

  it('returns empty array if localStorage.getItem throws', () => {
    const originalGetItem = localStorage.getItem
    localStorage.getItem = () => {
      throw new Error('Storage disabled')
    }
    expect(loadCustomBoardShapes()).toEqual([])
    localStorage.getItem = originalGetItem
  })

  it('returns updated array even if localStorage.setItem throws', () => {
    const shape: CustomBoardShape = { id: 'c', name: 'Error', cells: [{ col: 0, row: 0 }] }
    const originalSetItem = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error('Storage disabled')
    }
    const result = saveCustomBoardShape(shape)
    expect(result).toEqual([shape])
    localStorage.setItem = originalSetItem
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

  it('returns updated array even if localStorage.setItem throws', () => {
    saveCustomBoardShape({ id: 'a', name: 'A', cells: [{ col: 0, row: 0 }] })
    const originalSetItem = localStorage.setItem
    localStorage.setItem = () => {
      throw new Error('Storage disabled')
    }
    const result = deleteCustomBoardShape('a')
    expect(result).toEqual([])
    localStorage.setItem = originalSetItem
  })
})
