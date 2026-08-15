import { vi } from 'vitest';
import '@testing-library/jest-dom';

// Mock Supabase at the module level - tests never hit the real database.
// This mock covers both possible import paths used by tests.
const supabaseMock = {
  from:   vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  insert: vi.fn().mockReturnThis(),
  update: vi.fn().mockReturnThis(),
  eq:     vi.fn().mockReturnThis(),
  is:     vi.fn().mockReturnThis(),
  order:  vi.fn().mockReturnThis(),
  limit:  vi.fn().mockReturnThis(),
  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  single:      vi.fn().mockResolvedValue({ data: null, error: null }),
  rpc:         vi.fn().mockResolvedValue({ data: null, error: null }),
  schema:      vi.fn().mockReturnThis(),
  auth: {
    getUser:            vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    getSession:         vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: { message: 'Invalid credentials' } }),
    signOut:            vi.fn().mockResolvedValue({ error: null }),
    onAuthStateChange:  vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    refreshSession:     vi.fn().mockResolvedValue({ data: null, error: null }),
  },
};

vi.mock('../../lib/supabase', () => ({ supabase: supabaseMock, default: supabaseMock }));
vi.mock('../lib/supabase',    () => ({ supabase: supabaseMock, default: supabaseMock }));
vi.mock('src/lib/supabase',  () => ({ supabase: supabaseMock, default: supabaseMock }));
