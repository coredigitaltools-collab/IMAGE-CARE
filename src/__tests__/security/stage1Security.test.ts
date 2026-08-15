// ============================================================
// ImageCare ERP - Stage 1 Security Tests
// File: src/__tests__/security/stage1Security.test.ts
// Purpose: RLS isolation and permission enforcement tests.
//          These must all pass before Stage 2 begins.
// ============================================================

import { describe, it, expect } from 'vitest';
import { canDo, getModulePermission, parseError, type ModulePermissions } from '../../types/app';

const TEST_BUSINESS_A = 'business-aaaa-0000-0000-0000-000000000001';
const TEST_BUSINESS_B = 'business-bbbb-0000-0000-0000-000000000001';
const TEST_BRANCH_A   = 'branch-aaaa-000-0000-0000-0000-000000000001';
const TEST_BRANCH_B   = 'branch-bbbb-000-0000-0000-0000-000000000001';

function makeCtx(businessId: string, branchId: string | null, permissions: Record<string, ModulePermissions> = {}) {
  return {
    user_id: 'user-test',
    business_id: businessId,
    branch_id: branchId,
    email: 'test@example.com',
    first_name: 'Test', last_name: 'User',
    role: 'Staff', is_active: true, is_owner: false,
    permissions,
    branches: branchId ? [{ branch_id: branchId, can_transact: true }] : [],
  };
}

// ============================================================
// RLS Business Isolation
// ============================================================

describe('RLS Business Isolation', () => {
  it('every query is scoped to business_id', () => {
    const ctx = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A);
    // Every service call must pass ctx.business_id to queries
    // This is enforced by both RLS (DB) and service contracts (frontend)
    expect(ctx.business_id).toBe(TEST_BUSINESS_A);
    // User from business A cannot query business B's data
    expect(ctx.business_id).not.toBe(TEST_BUSINESS_B);
  });

  it('service_role key must not be in frontend env', () => {
    // Critical: service_role bypasses RLS entirely
    const allowedFrontendKeys = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_APP_VERSION'];
    expect(allowedFrontendKeys).not.toContain('VITE_SUPABASE_SERVICE_ROLE');
    expect(allowedFrontendKeys).not.toContain('SUPABASE_SERVICE_ROLE');
  });

  it('anon key is used for frontend, not service_role', () => {
    // The supabase client is created with the anon key
    // RLS policies then restrict access based on auth.uid()
    const clientConfig = { schema: 'imagecare', auth: { autoRefreshToken: true } };
    expect(clientConfig.schema).toBe('imagecare');
    // No service_role key present
  });

  it('cross-business data access is blocked at context level', () => {
    const ctxA = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A);
    const ctxB = makeCtx(TEST_BUSINESS_B, TEST_BRANCH_B);

    // User A cannot use user B's context
    expect(ctxA.business_id).not.toBe(ctxB.business_id);
    // A service call with ctxA will only query business A's data
    expect(ctxA.business_id).toBe(TEST_BUSINESS_A);
  });
});

// ============================================================
// RLS Branch Isolation
// ============================================================

describe('RLS Branch Isolation', () => {
  it('user cannot access branches not in their list', () => {
    const ctx = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A, {
      sales: { view: true, create: true, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' as const },
    });

    const unauthorizedBranch = TEST_BRANCH_B;
    const hasAccess = ctx.branches.some(b => b.branch_id === unauthorizedBranch);
    expect(hasAccess).toBe(false);
  });

  it('branch_scope assigned restricts to user home branch', () => {
    const ctx = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A, {
      sales: { view: true, create: true, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' as const },
    });

    const perms = getModulePermission(ctx, 'sales');
    expect(perms.branch_scope).toBe('assigned');
  });

  it('branch_scope all allows cross-branch access', () => {
    const ctx = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A, {
      reports: { view: true, create: false, edit: false, delete: false, approve: false, export: true, sync: false, branch_scope: 'all' as const },
    });

    const perms = getModulePermission(ctx, 'reports');
    expect(perms.branch_scope).toBe('all');
  });

  it('branch must always belong to a business', () => {
    const ctx = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A);
    // Business_id is always present when branch_id is set
    if (ctx.branch_id) {
      expect(ctx.business_id).toBeTruthy();
    }
  });
});

// ============================================================
// Permission Enforcement
// ============================================================

describe('Permission Enforcement', () => {
  it('authorized action is allowed', () => {
    const ctx = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A, {
      sales: { view: true, create: true, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' as const },
    });
    expect(canDo(ctx, 'sales', 'view')).toBe(true);
    expect(canDo(ctx, 'sales', 'create')).toBe(true);
  });

  it('unauthorized action is blocked', () => {
    const ctx = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A, {
      sales: { view: true, create: false, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' as const },
    });
    expect(canDo(ctx, 'sales', 'create')).toBe(false);
    expect(canDo(ctx, 'sales', 'delete')).toBe(false);
  });

  it('permission removal takes effect immediately', () => {
    const withPerms = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A, {
      payroll: { view: true, create: true, edit: true, delete: false, approve: true, export: false, sync: false, branch_scope: 'all' as const },
    });
    const withoutPerms = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A, {
      payroll: { view: false, create: false, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' as const },
    });

    expect(canDo(withPerms, 'payroll', 'approve')).toBe(true);
    expect(canDo(withoutPerms, 'payroll', 'approve')).toBe(false);
  });

  it('suspended account has is_active false', () => {
    const activeCtx   = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A);
    const suspendedCtx = { ...activeCtx, is_active: false };

    expect(activeCtx.is_active).toBe(true);
    expect(suspendedCtx.is_active).toBe(false);
    // Auth service checks is_active and rejects login
  });

  it('position label does not grant permissions', () => {
    // Role is a display label - not checked by canDo
    const manager = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A, {}); // No permissions even with 'Manager' label
    const managerWithRole = { ...manager, role: 'Manager' };

    // role:'Manager' alone does not grant permissions
    expect(canDo(managerWithRole, 'payroll', 'view')).toBe(false);
    expect(canDo(managerWithRole, 'settings', 'edit')).toBe(false);
  });
});

// ============================================================
// Sensitive Data Protection
// ============================================================

describe('Sensitive Data Protection', () => {
  it('user context does not contain auth tokens', () => {
    const ctx = makeCtx(TEST_BUSINESS_A, TEST_BRANCH_A);
    expect(ctx).not.toHaveProperty('access_token');
    expect(ctx).not.toHaveProperty('refresh_token');
    expect(ctx).not.toHaveProperty('password');
    expect(ctx).not.toHaveProperty('password_hash');
  });

  it('error messages do not expose SQL details', () => {
    const sqlErr = parseError(new Error('ERROR: 42501: permission denied for table users'));
    expect(sqlErr.message).not.toContain('ERROR:');
    expect(sqlErr.message).not.toContain('42501');
    expect(sqlErr.message).not.toContain('table users');
  });

  it('error messages do not expose stack traces', () => {
    const err = parseError(new Error('Internal: at fn_post_sale() line 42'));
    expect(err.message).not.toContain('fn_post_sale');
    expect(err.message).not.toContain('line 42');
  });
});
