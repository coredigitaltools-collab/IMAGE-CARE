import { vi } from 'vitest';
import '@testing-library/jest-dom';
import type { UserContext } from '../types/app';

export const TEST_BUSINESS_ID = 'business-test-001';
export const TEST_BRANCH_ID = 'branch-test-001';
export const TEST_USER_ID = 'user-test-001';

const fullPermissions = { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' as const };

export function makeUserContext(overrides: Partial<UserContext> = {}): UserContext {
  return {
    user_id: TEST_USER_ID, business_id: TEST_BUSINESS_ID, branch_id: TEST_BRANCH_ID,
    email: 'owner@example.test', first_name: 'Test', last_name: 'Owner', role: 'Owner',
    is_owner: true, is_active: true,
    permissions: Object.fromEntries(['sales', 'purchases', 'inventory', 'customers', 'suppliers', 'credit', 'invoices', 'bills', 'payroll', 'expenses', 'cash', 'journal', 'reports', 'settings'].map(module => [module, { ...fullPermissions }])),
    branches: [{ branch_id: TEST_BRANCH_ID, can_transact: true }],
    ...overrides,
  };
}

export function makeNoPermissionContext(overrides: Partial<UserContext> = {}): UserContext {
  return makeUserContext({ is_owner: false, permissions: {}, ...overrides });
}

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
