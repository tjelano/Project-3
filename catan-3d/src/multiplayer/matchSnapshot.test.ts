import { describe, it, expect, vi, beforeEach } from 'vitest'
import { saveMatchSnapshot, loadMatchSnapshot } from './matchSnapshot'
import * as supabaseClient from '../lib/supabaseClient'

describe('matchSnapshot', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('runSave', () => {
    it('handles missing supabase client gracefully', async () => {
      vi.spyOn(supabaseClient, 'getSupabaseClient').mockImplementation(() => {
        throw new Error('Supabase is not configured')
      })

      saveMatchSnapshot('TEST_ROOM', {} as import('./matchSnapshot').MatchSnapshot)

      // We need to wait for the internal activeSave promise to settle
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(console.error).toHaveBeenCalledWith(
        '[Catan] Supabase not configured, skipping snapshot save:',
        expect.any(Error)
      )
    })
  })

  describe('loadMatchSnapshot', () => {
    it('handles missing supabase client gracefully', async () => {
      vi.spyOn(supabaseClient, 'getSupabaseClient').mockImplementation(() => {
        throw new Error('Supabase is not configured')
      })

      const result = await loadMatchSnapshot('TEST_ROOM')

      expect(result).toBeNull()
      expect(console.error).toHaveBeenCalledWith(
        '[Catan] Supabase not configured, cannot check for an existing match:',
        expect.any(Error)
      )
    })
  })
})
