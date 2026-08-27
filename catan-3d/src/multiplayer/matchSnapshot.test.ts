import { describe, expect, it, vi, beforeEach } from 'vitest'
import { loadMatchSnapshot } from './matchSnapshot'
import * as supabaseClient from '../lib/supabaseClient'

vi.mock('../lib/supabaseClient', () => {
  return {
    getSupabaseClient: vi.fn(),
  }
})

describe('loadMatchSnapshot', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('returns null when the stored match snapshot is missing required fields', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({
      data: {
        snapshot: {
          someField: 'but not a valid match snapshot',
        },
      },
      error: null,
    })

    const mockEq = vi.fn().mockReturnValue({
      maybeSingle: mockMaybeSingle,
    })

    const mockSelect = vi.fn().mockReturnValue({
      eq: mockEq,
    })

    const mockFrom = vi.fn().mockReturnValue({
      select: mockSelect,
    })

    const mockClient = {
      from: mockFrom,
    }

    vi.mocked(supabaseClient.getSupabaseClient).mockReturnValue(mockClient as unknown as import('@supabase/supabase-js').SupabaseClient)

    const result = await loadMatchSnapshot('test-room')

    expect(supabaseClient.getSupabaseClient).toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledWith('match_snapshots')
    expect(mockSelect).toHaveBeenCalledWith('snapshot')
    expect(mockEq).toHaveBeenCalledWith('room_code', 'test-room')
    expect(mockMaybeSingle).toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(
      '[Catan] Stored match snapshot is missing required fields, ignoring it:',
      { someField: 'but not a valid match snapshot' }
    )
    expect(result).toBeNull()
  })
})
