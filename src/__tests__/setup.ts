// ============================================================
// IMC-BLD-006 | ImageCare ERP Testing & QA v1.0
// File: src/__tests__/setup.ts
// Purpose: Global test setup - mocks, helpers, test context.
// ============================================================

import { expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom';
import type { UserContext } from '../types/app';
import type { UUID } from '../types/database';

// ---- Mock Supabase -----------------------------------------
// Tests never hit a real database. Use mock responses.

vi.mock('../lib/supabase', () => ({
  supabase: {
    from:   vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    in:     vi.fn().mockReturnThis(),
    gt:     vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
    lte:    vi.fn().mockReturnThis(),
    ilike:  vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    limit:  vi.fn().mockReturnThis(),
    range:  vi.fn().mockReturnThis(),
    single:    vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    rpc:       vi.fn().mockResolvedValue({ data: null, error: null }),
    auth: {
      getUser:      vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession:   vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue({ data: null, error: null }),
      signOut:      vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      refreshSession: vi.fn().mockResolvedValue({ data: null, error: null }),
    },
    schema: vi.fn().mockReturnThis(),
    storage: {
      from: vi.fn().mockReturnThis(),
      upload: vi.fn().mockResolvedValue({ data: null, error: null }),
      createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: 'https://signed.url' }, error: null }),
    },
  },
  default: { auth: {}, from: vi.fn() },
}));

// ---- Test Data Factories -----------------------------------

export const TEST_BUSINESS_ID: UUID = 'test-business-00000000-0000-0000-0000-000000000001';
export const TEST_BRANCH_ID:   UUID = 'test-branch-000000000-0000-0000-0000-000000000001';
export const TEST_USER_ID:     UUID = 'test-user-0000000000-0000-0000-0000-000000000001';
export const TEST_PRODUCT_ID:  UUID = 'test-product-00000000-0000-0000-0000-000000000001';
export const TEST_CUSTOMER_ID: UUID = 'test-customer-0000000-0000-0000-0000-000000000001';
export const TEST_SUPPLIER_ID: UUID = 'test-supplier-0000000-0000-0000-0000-000000000001';

export function makeUserContext(overrides?: Partial<UserContext>): UserContext {
  return {
    user_id:     TEST_USER_ID,
    business_id: TEST_BUSINESS_ID,
    branch_id:   TEST_BRANCH_ID,
    email:       'test@imagecare.ug',
    first_name:  'Test',
    last_name:   'User',
    role:        'Owner',
    is_active:   true,
    permissions: {
      sales:     { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      purchases: { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      inventory: { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      expenses:  { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      payroll:   { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      customers: { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      suppliers: { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      reports:   { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      settings:  { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      credit:    { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      invoices:  { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      bills:     { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      journal:   { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      cash:      { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
      bank:      { view: true, create: true, edit: true, delete: true, approve: true, export: true, sync: true, branch_scope: 'all' },
    },
    branches: [{ branch_id: TEST_BRANCH_ID, can_transact: true }],
    ...overrides,
  };
}

export function makeNoPermissionContext(): UserContext {
  const noPerms = Object.fromEntries(
    ['sales','purchases','inventory','expenses','payroll','customers',
     'suppliers','reports','settings','credit','invoices','bills','journal','cash','bank'].map(
      m => [m, { view: false, create: false, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' as const }]
    )
  );
  return makeUserContext({ permissions: noPerms, branches: [] });
}

// ---- Global cleanup ----------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
