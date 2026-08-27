import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'

const STORAGE_KEY = 'catan-debug-log'

describe('debugLog', () => {
  let mockLocalStorage: Record<string, string>
  let mockAnchor: { href: string; download: string; click: Mock }
  let mockBlob: Mock
  let mockCreateObjectURL: Mock
  let mockRevokeObjectURL: Mock

  beforeEach(() => {
    mockLocalStorage = {}

    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => mockLocalStorage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => {
        if (key === 'QUOTA_EXCEEDED') throw new Error('QuotaExceededError')
        mockLocalStorage[key] = value
      }),
      removeItem: vi.fn((key: string) => {
        delete mockLocalStorage[key]
      }),
    })

    mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    }

    vi.stubGlobal('document', {
      createElement: vi.fn((tag: string) => {
        if (tag === 'a') return mockAnchor
        return {}
      }),
    })

    mockBlob = vi.fn()
    vi.stubGlobal('Blob', mockBlob)

    mockCreateObjectURL = vi.fn(() => 'blob:test-url')
    mockRevokeObjectURL = vi.fn()

    // We attach these to the existing global URL object so we don't break Node's internal
    // usage of new URL() during dynamic imports and source map resolution.
    // @ts-expect-error - URL is not fully implemented in Node
    globalThis.URL.createObjectURL = mockCreateObjectURL
    // @ts-expect-error - URL is not fully implemented in Node
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL

    vi.stubGlobal('window', {})

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2023-01-01T12:00:00Z'))

    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    // @ts-expect-error - URL is not fully implemented in Node
    delete globalThis.URL.createObjectURL
    // @ts-expect-error - URL is not fully implemented in Node
    delete globalThis.URL.revokeObjectURL

    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('loads empty buffer when localStorage is empty', async () => {
    const { debugLog } = await import('./debugLog')
    debugLog('test event')

    expect(mockLocalStorage[STORAGE_KEY]).toBeDefined()
    const parsed = JSON.parse(mockLocalStorage[STORAGE_KEY])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].event).toBe('test event')
  })

  it('loads existing buffer from localStorage', async () => {
    mockLocalStorage[STORAGE_KEY] = JSON.stringify([
      { time: '2022-01-01T00:00:00Z', event: 'old event' }
    ])

    const { debugLog } = await import('./debugLog')
    debugLog('new event')

    const parsed = JSON.parse(mockLocalStorage[STORAGE_KEY])
    expect(parsed).toHaveLength(2)
    expect(parsed[0].event).toBe('old event')
    expect(parsed[1].event).toBe('new event')
  })

  it('handles invalid JSON in localStorage gracefully', async () => {
    mockLocalStorage[STORAGE_KEY] = 'invalid json'

    const { debugLog } = await import('./debugLog')
    expect(console.error).toHaveBeenCalledWith(
      '[Catan] Failed to read debug log from localStorage:',
      expect.any(Error)
    )

    debugLog('new event')
    const parsed = JSON.parse(mockLocalStorage[STORAGE_KEY])
    expect(parsed).toHaveLength(1)
    expect(parsed[0].event).toBe('new event')
  })

  it('logs to console.warn with data', async () => {
    const { debugLog } = await import('./debugLog')
    const data = { id: 1 }
    debugLog('test event', data)

    expect(console.warn).toHaveBeenCalledWith('[Catan Debug]', 'test event', data)
  })

  it('logs to console.warn without data', async () => {
    const { debugLog } = await import('./debugLog')
    debugLog('test event')

    expect(console.warn).toHaveBeenCalledWith('[Catan Debug]', 'test event', '')
  })

  it('truncates buffer to MAX_ENTRIES', async () => {
    // Generate 500 entries
    const initialBuffer = Array.from({ length: 500 }).map((_, i) => ({
      time: '2023-01-01T00:00:00Z',
      event: `event ${i}`,
    }))
    mockLocalStorage[STORAGE_KEY] = JSON.stringify(initialBuffer)

    const { debugLog } = await import('./debugLog')
    debugLog('new event') // This should push the length to 501, which then truncates to 500

    const parsed = JSON.parse(mockLocalStorage[STORAGE_KEY])
    expect(parsed).toHaveLength(500)
    expect(parsed[0].event).toBe('event 1')
    expect(parsed[499].event).toBe('new event')
  })

  it('handles localStorage.setItem throwing an error', async () => {
    // We mock setItem to throw for this test
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(() => {
        throw new Error('QuotaExceededError')
      }),
      removeItem: vi.fn(),
    })

    const { debugLog, exportDebugLog } = await import('./debugLog')
    debugLog('test event') // Should not throw

    expect(console.error).toHaveBeenCalledWith(
      '[Catan] Failed to persist debug log to localStorage:',
      expect.any(Error)
    )

    // Even though it failed to persist, it should be in the in-memory buffer
    exportDebugLog()
    expect(mockBlob).toHaveBeenCalledWith(
      [expect.stringContaining('test event')],
      { type: 'application/json' }
    )
  })

  it('exportDebugLog creates a downloadable file', async () => {
    const { debugLog, exportDebugLog } = await import('./debugLog')
    debugLog('test event')

    exportDebugLog()

    expect(mockBlob).toHaveBeenCalledWith(
      [expect.stringContaining('test event')],
      { type: 'application/json' }
    )
    expect(mockCreateObjectURL).toHaveBeenCalled()
    expect(mockAnchor.href).toBe('blob:test-url')
    expect(mockAnchor.download).toMatch(/^catan-debug-log-\d+\.json$/)
    expect(mockAnchor.click).toHaveBeenCalled()
    expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url')
  })

  it('clearDebugLog clears memory and localStorage', async () => {
    mockLocalStorage[STORAGE_KEY] = JSON.stringify([{ event: 'old' }])

    const { clearDebugLog, exportDebugLog } = await import('./debugLog')
    clearDebugLog()

    expect(mockLocalStorage[STORAGE_KEY]).toBeUndefined()

    // Buffer should be empty
    exportDebugLog()
    expect(mockBlob).toHaveBeenCalledWith(
      ['[]'],
      { type: 'application/json' }
    )
  })

  it('binds functions to window if present', async () => {
    await import('./debugLog')
    expect(typeof window.exportCatanDebugLog).toBe('function')
    expect(typeof window.clearCatanDebugLog).toBe('function')
  })
})
