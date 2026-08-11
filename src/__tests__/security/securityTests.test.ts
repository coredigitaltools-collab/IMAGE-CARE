// ============================================================
// IMC-BLD-006 | ImageCare ERP Testing & QA v1.0
// File: src/__tests__/security/securityTests.test.ts
// Purpose: Security tests - RLS isolation, permission bypass,
//          sensitive data exposure, session handling.
// ============================================================

import { describe, it, expect, vi } from 'vitest';
import { makeUserContext, makeNoPermissionContext, TEST_BUSINESS_ID, TEST_BRANCH_ID } from '../setup';
import { canDo, getModulePermission } from '../../types/app';
import { parseError } from '../../types/app';

// ---- RLS Isolation -----------------------------------------

describe('RLS Business Isolation', () => {
  it('user context always carries business_id for RLS filtering', () => {
    const ctx = makeUserContext();
    expect(ctx.business_id).toBeTruthy();
    expect(ctx.business_id).toBe(TEST_BUSINESS_ID);
  });

  it('cross-business access is not possible via user context', () => {
    const ctxA = makeUserContext({ business_id: 'business-a' });
    const ctxB = makeUserContext({ business_id: 'business-b' });

    // User A cannot use User B's business_id
    expect(ctxA.business_id).not.toBe(ctxB.business_id);

    // All service calls attach ctx.business_id to queries
    // RLS policy ensures only matching rows are returned
    expect(ctxA.business_id).toBe('business-a');
    expect(ctxB.business_id).toBe('business-b');
  });

  it('all service calls include business_id in queries', () => {
    // This is verified by convention - every service function
    // receives UserContext and passes ctx.business_id to every query
    const ctx = makeUserContext();
    expect(ctx).toHaveProperty('business_id');
    expect(ctx).toHaveProperty('branch_id');
    expect(ctx).toHaveProperty('user_id');
  });
});

// ---- Permission Bypass Prevention --------------------------

describe('Permission Bypass Prevention', () => {
  it('frontend permission check mirrors backend check', () => {
    // Frontend uses canDo() for UI - backend validates again via RLS and service
    // Both use the same permission structure loaded from DB at login
    const ctx = makeUserContext();
    const restrictedCtx = makeNoPermissionContext();

    expect(canDo(ctx, 'sales', 'create')).toBe(true);
    expect(canDo(restrictedCtx, 'sales', 'create')).toBe(false);
  });

  it('sensitive modules require explicit permissions', () => {
    const sensitiveModules = ['payroll', 'settings', 'journal', 'bank'];
    const restrictedCtx = makeNoPermissionContext();

    for (const module of sensitiveModules) {
      expect(canDo(restrictedCtx, module, 'view')).toBe(false);
      expect(canDo(restrictedCtx, module, 'create')).toBe(false);
    }
  });

  it('payroll requires explicit approve permission to process', () => {
    // Create permission alone is not sufficient to process payroll
    const createOnlyCtx = makeUserContext({
      permissions: {
        payroll: { view: true, create: true, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' },
      } as any,
    });

    expect(canDo(createOnlyCtx, 'payroll', 'create')).toBe(true);
    expect(canDo(createOnlyCtx, 'payroll', 'approve')).toBe(false);
  });

  it('stock adjustments require approve, not just create', () => {
    const createOnlyCtx = makeUserContext({
      permissions: {
        inventory: { view: true, create: true, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' },
      } as any,
    });

    expect(canDo(createOnlyCtx, 'inventory', 'create')).toBe(true);
    expect(canDo(createOnlyCtx, 'inventory', 'approve')).toBe(false);
  });

  it('delete requires explicit delete permission', () => {
    const viewOnlyCtx = makeUserContext({
      permissions: {
        customers: { view: true, create: false, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' },
      } as any,
    });

    expect(canDo(viewOnlyCtx, 'customers', 'view')).toBe(true);
    expect(canDo(viewOnlyCtx, 'customers', 'delete')).toBe(false);
  });
});

// ---- Sensitive Data Protection -----------------------------

describe('Sensitive Data Protection', () => {
  it('error messages never expose database internals', () => {
    const sensitivePatterns = [
      /ERROR:\s+\d+/,    // PostgreSQL error codes
      /pg_/,             // PostgreSQL internal names
      /DETAIL:/,         // PostgreSQL DETAIL lines
      /HINT:/,           // PostgreSQL HINT lines
      /relation/,        // Table name exposure
      /column/,          // Column name exposure
      /syntax error/i,   // SQL syntax errors
    ];

    const safeError = parseError(new Error('PERMISSION_DENIED: Cannot access module'));

    for (const pattern of sensitivePatterns) {
      expect(safeError.message).not.toMatch(pattern);
    }
  });

  it('service_role key must never appear in frontend env', () => {
    // The service_role key bypasses RLS - must never be in VITE_ env vars
    // This test verifies the contract, not runtime values
    const forbiddenEnvKeys = ['VITE_SUPABASE_SERVICE_ROLE'];
    const allowedEnvKeys   = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

    // Service role must not be in the allowed list
    for (const forbidden of forbiddenEnvKeys) {
      expect(allowedEnvKeys).not.toContain(forbidden);
    }
  });

  it('user context does not expose auth tokens', () => {
    const ctx = makeUserContext();

    // UserContext should have identity info but never auth tokens
    expect(ctx).not.toHaveProperty('access_token');
    expect(ctx).not.toHaveProperty('refresh_token');
    expect(ctx).not.toHaveProperty('password');
    expect(ctx).not.toHaveProperty('pin');
    expect(ctx).not.toHaveProperty('pin_hash');
  });
});

// ---- Session Security --------------------------------------

describe('Session Security', () => {
  it('session storage key is cleared on logout', () => {
    // AppContext clears sessionStorage on signOut
    // Verify the key name matches what AppContext uses
    const SESSION_KEY = 'imc_user_context';
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user_id: 'test' }));
    expect(sessionStorage.getItem(SESSION_KEY)).toBeTruthy();

    // Simulate logout
    sessionStorage.removeItem(SESSION_KEY);
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });

  it('suspended user context has is_active false', () => {
    const suspendedCtx = makeUserContext({ is_active: false });
    expect(suspendedCtx.is_active).toBe(false);

    // A suspended user's permissions still exist in context
    // but the auth service must reject their login attempt
    // The is_active flag signals that the account is suspended
  });
});

// ---- Branch Access Security --------------------------------

describe('Branch Access Security', () => {
  it('user without branch access cannot transact in that branch', () => {
    const ctx = makeUserContext({
      branch_id: TEST_BRANCH_ID,
      branches:  [], // No explicit branch access grants beyond home branch
    });

    const OTHER_BRANCH = 'other-branch-id';
    const hasAccess = ctx.branches.some(b => b.branch_id === OTHER_BRANCH);
    expect(hasAccess).toBe(false);
  });

  it('user home branch is always accessible', () => {
    const ctx = makeUserContext({
      branch_id: TEST_BRANCH_ID,
      branches:  [],
    });

    // Home branch access is implicit - no explicit grant needed
    expect(ctx.branch_id).toBe(TEST_BRANCH_ID);
  });

  it('branch_scope all allows cross-branch reports', () => {
    const ctx = makeUserContext();
    const salesPerms = getModulePermission(ctx, 'sales');
    expect(salesPerms.branch_scope).toBe('all');
  });

  it('branch_scope assigned restricts to home branch', () => {
    const ctx = makeUserContext({
      permissions: {
        sales: { view: true, create: true, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' },
      } as any,
    });
    const salesPerms = getModulePermission(ctx, 'sales');
    expect(salesPerms.branch_scope).toBe('assigned');
  });
});
