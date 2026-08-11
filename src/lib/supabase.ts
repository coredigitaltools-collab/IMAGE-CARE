// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/lib/supabase.ts
// Purpose: Single shared Supabase client instance.
//          Never instantiate Supabase outside this file.
// ============================================================

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. ' +
    'Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.local'
  );
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
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
