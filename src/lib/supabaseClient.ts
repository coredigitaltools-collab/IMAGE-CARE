import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * `supabase` is null until VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are set
 * in .env (see .env.example). Every service in src/services checks
 * `isSupabaseConfigured` first and transparently falls back to local mock
 * data + IndexedDB, so the Dashboard module runs standalone today and
 * switches to live data the moment real credentials are added, no UI
 * or hook code changes required.
 */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null
