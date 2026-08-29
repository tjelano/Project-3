import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { saveMatchSnapshot, loadMatchSnapshot } from './matchSnapshot'
import { getSupabaseClient } from '../lib/supabaseClient'
import type { MatchSnapshot } from './matchSnapshot'

vi.mock('../lib/supabaseClient', () => ({
  getSupabaseClient: vi.fn(),
}))

describe('matchSnapshot', () => {
  let mockUpsert: ReturnType<typeof vi.fn>
  let mockSelect: ReturnType<typeof vi.fn>
  let mockEq: ReturnType<typeof vi.fn>
  let mockMaybeSingle: ReturnType<typeof vi.fn>

  let consoleErrorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()

    mockUpsert = vi.fn().mockResolvedValue({ error: null })
    mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    mockEq = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    mockSelect = vi.fn().mockReturnValue({ eq: mockEq })

    const mockClient = {
      from: vi.fn().mockReturnValue({
        upsert: mockUpsert,
        select: mockSelect,
      }),
    }

    vi.mocked(getSupabaseClient).mockReturnValue(mockClient as unknown as ReturnType<typeof getSupabaseClient>)

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consoleErrorSpy.mockRestore()
  })

  // saveMatchSnapshot serializes writes through a module-level activeSave
  // promise chain (see its own comment in matchSnapshot.ts) — flush a
  // microtask turn so that chain gets a chance to run before asserting.
  const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0))

  const createValidSnapshot = (overrides = {}): MatchSnapshot => ({
    hostName: 'host',
    playerNames: ['host'],
    players: [],
    settlements: {},
    roads: {},
    currentPlayerIndex: 0,
    robberTileId: 'tile1',
    gamePhase: 'Setup',
    setupStepIndex: 0,
    setupStage: 'Forward',
    devDeck: [],
    devCardPlayedThisTurn: false,
    freeRoadsRemaining: 0,
    hasRolledThisTurn: false,
    setupSettlementVertexId: null,
    lastRoll: null,
    winner: null,
    longestRoadHolderId: null,
    largestArmyHolderId: null,
    ...overrides
  } as unknown as MatchSnapshot) // loose cast — only the fields isPlausibleMatchSnapshot checks matter here

  describe('saveMatchSnapshot', () => {
    it('saves a snapshot successfully', async () => {
      const snapshot = createValidSnapshot()
      saveMatchSnapshot('room1', snapshot)

      await flushPromises()

      expect(mockUpsert).toHaveBeenCalledTimes(1)
      expect(mockUpsert.mock.calls[0][0]).toMatchObject({
        room_code: 'room1',
        snapshot,
      })
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('coalesces rapid saves and only writes the latest', async () => {
      const snap1 = createValidSnapshot({ freeRoadsRemaining: 1 })
      const snap2 = createValidSnapshot({ freeRoadsRemaining: 2 })
      const snap3 = createValidSnapshot({ freeRoadsRemaining: 3 })

      saveMatchSnapshot('room1', snap1)
      saveMatchSnapshot('room1', snap2)
      saveMatchSnapshot('room1', snap3)

      await flushPromises()

      // All 3 calls happen synchronously before the first queued .then
      // callback runs, so `pending` already holds snap3 by the time any
      // callback reads it — snap1/snap2 are coalesced away, never sent.
      expect(mockUpsert).toHaveBeenCalledTimes(1)
      expect(mockUpsert.mock.calls[0][0]).toMatchObject({
        snapshot: snap3
      })
    })

    it('logs error and does not throw when Supabase client throws', async () => {
      vi.mocked(getSupabaseClient).mockImplementation(() => { throw new Error('Not configured') })

      saveMatchSnapshot('room1', createValidSnapshot())
      await flushPromises()

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Catan] Supabase not configured, skipping snapshot save:',
        expect.any(Error)
      )
      expect(mockUpsert).not.toHaveBeenCalled()
    })

    it('logs error when upsert fails', async () => {
      mockUpsert.mockResolvedValueOnce({ error: new Error('Upsert failed') })

      saveMatchSnapshot('room1', createValidSnapshot())
      await flushPromises()

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Catan] Failed to save match snapshot:',
        expect.any(Error)
      )
    })
  })

  describe('loadMatchSnapshot', () => {
    it('returns valid snapshot', async () => {
      const snapshot = createValidSnapshot()
      mockMaybeSingle.mockResolvedValueOnce({ data: { snapshot }, error: null })

      const result = await loadMatchSnapshot('room1')

      expect(result).toEqual(snapshot)
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('returns null and logs error if Supabase client throws', async () => {
      vi.mocked(getSupabaseClient).mockImplementation(() => { throw new Error('Not configured') })

      const result = await loadMatchSnapshot('room1')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Catan] Supabase not configured, cannot check for an existing match:',
        expect.any(Error)
      )
    })

    it('returns null and logs error if select fails', async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: null, error: new Error('Select failed') })

      const result = await loadMatchSnapshot('room1')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Catan] Failed to look up an existing match snapshot:',
        expect.any(Error)
      )
    })

    it('returns null without error if no snapshot exists', async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: { snapshot: null }, error: null })

      const result = await loadMatchSnapshot('room1')

      expect(result).toBeNull()
      expect(consoleErrorSpy).not.toHaveBeenCalled()
    })

    it('returns null and logs error if snapshot fails plausibility check', async () => {
      // missing required fields
      const invalidSnapshot = { hostName: 'host' }
      mockMaybeSingle.mockResolvedValueOnce({ data: { snapshot: invalidSnapshot }, error: null })

      const result = await loadMatchSnapshot('room1')

      expect(result).toBeNull()
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Catan] Stored match snapshot is missing required fields, ignoring it:',
        invalidSnapshot
      )
    })
  })
})
