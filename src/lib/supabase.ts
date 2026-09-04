// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/lib/supabase.ts
// Purpose: Single shared Supabase client instance.
//          Never instantiate Supabase outside this file.
// ============================================================

import { createClient, type PostgrestError } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.local'
  );
}

export const supabase = createClient<Database, 'imagecare'>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    // Bug fix (2026-09-04): "Add branch" (and potentially other saves)
    // intermittently failed with a genuine, correctly-enforced permission
    // rejection for the confirmed business owner. Root cause traced to
    // the browser, not the database: this computer also runs Traxxo (a
    // separate real product, same developer, same Supabase project -
    // same auth.users table), and neither app told the Supabase client
    // where to keep its login session. Without an explicit storageKey,
    // supabase-js defaults to a fixed key derived only from the project
    // ref (`sb-<project-ref>-auth-token`) - since both apps share that
    // project ref and, on this machine, the same browser storage origin,
    // whichever app last signed in/refreshed silently overwrote the
    // other's saved session. ImageCare would then occasionally send a
    // real, valid, but WRONG-tenant login (e.g. a Traxxo account) - which
    // Postgres correctly rejected, since that account genuinely isn't
    // this business's owner. Giving this client its own dedicated
    // storage key means it can never again share that slot with Traxxo
    // (or anything else on this machine), regardless of what those other
    // apps do on their end.
    storageKey: 'sb-imagecare-erp-auth-token',
  },
  db: {
    // All ImageCare tables live in the imagecare schema
    schema: 'imagecare',
  },
  global: {
    headers: { 'x-application-name': 'imagecare-erp' },
  },
});

export default supabase;

type ImagecareFunctions = Database['imagecare']['Functions'];

/** Typed RPC boundary for the maintained ImageCare schema contract. */
export async function rpc<Name extends keyof ImagecareFunctions>(
  name: Name,
  args: ImagecareFunctions[Name]['Args'],
): Promise<{ data: ImagecareFunctions[Name]['Returns'] | null; error: PostgrestError | null }> {
  return supabase.rpc(name as never, args as never) as unknown as Promise<{
    data: ImagecareFunctions[Name]['Returns'] | null;
    error: PostgrestError | null;
  }>;
}
