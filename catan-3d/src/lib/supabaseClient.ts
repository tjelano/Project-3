import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Lazily constructed, never at module load.
 *
 * createClient() throws synchronously on an invalid/empty URL. If this ran
 * at import time, a missing VITE_SUPABASE_URL would crash the ENTIRE app —
 * including local Pass & Play, which has nothing to do with Supabase — the
 * instant this module was first imported, before React even renders.
 * Constructing it only when Online Multiplayer is actually used means local
 * play is fully unaffected by Supabase being unconfigured.
 */
let client: SupabaseClient | null = null

export function isSupabaseConfigured(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
}

export function getSupabaseClient(): SupabaseClient {
  if (!isSupabaseConfigured()) {
    throw new Error(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.',
    )
  }
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  }
  return client
}
