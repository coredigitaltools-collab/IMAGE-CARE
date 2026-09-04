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

// Bug fix (2026-09-04): this is a second, independent Supabase client
// instance (src/lib/supabase.ts is the intended single shared one - see
// its header comment). Without an explicit storageKey it defaulted to
// the same fixed key as every other app on this Supabase project (this
// machine also runs Traxxo, a separate real product on the same
// project - see the "Missing .schema('imagecare')" warning a few lines
// down in dashboardService.ts, an earlier fix for the same underlying
// shared-project risk), so its session could be silently overwritten by
// - or overwrite - another app's login in shared browser storage. Same
// root cause as the "Add branch" investigation (see src/lib/supabase.ts).
//
// This client has no sign-in call of its own anywhere in the codebase -
// every feature that uses it (dashboardService, backupSyncService,
// SynchronizationPage) has only ever worked because it happened to pick
// up whatever session the main client (src/lib/supabase.ts) had already
// written to that shared default key. So the fix here is NOT a new,
// unique key (that would leave this client permanently signed out,
// breaking those features) - it's pointed at the SAME dedicated key the
// main client now uses, preserving that shared-session behavior while
// removing the collision with Traxxo (or anything else on this machine).
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: { storageKey: 'sb-imagecare-erp-auth-token' },
    })
  : null
