import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadMatchSnapshot } from './matchSnapshot'
import { getSupabaseClient } from '../lib/supabaseClient'

vi.mock('../lib/supabaseClient', () => ({
  getSupabaseClient: vi.fn(),
}))

describe('loadMatchSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should return null and log an error if Supabase is not configured', async () => {
    const error = new Error('Supabase not configured')
    vi.mocked(getSupabaseClient).mockImplementation(() => {
      throw error
    })

    const result = await loadMatchSnapshot('test-room')

    expect(result).toBeNull()
    expect(console.error).toHaveBeenCalledWith(
      '[Catan] Supabase not configured, cannot check for an existing match:',
      error
    )
  })
})
