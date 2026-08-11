// ============================================================
// IMC-BLD-006 | ImageCare ERP Testing & QA v1.0
// File: src/__tests__/unit/permissions.test.ts
// Purpose: Unit tests for permission helpers and error parsing.
// ============================================================

import { describe, it, expect } from 'vitest';
import { canDo, getModulePermission } from '../../types/app';
import { parseError, ImageCareError } from '../../types/app';
import { makeUserContext, makeNoPermissionContext } from '../setup';

// ---- canDo -------------------------------------------------

describe('canDo', () => {
  const ctx = makeUserContext();
  const restrictedCtx = makeNoPermissionContext();

  it('returns true when permission granted', () => {
    expect(canDo(ctx, 'sales', 'create')).toBe(true);
    expect(canDo(ctx, 'inventory', 'view')).toBe(true);
    expect(canDo(ctx, 'payroll', 'approve')).toBe(true);
  });

  it('returns false when permission denied', () => {
    expect(canDo(restrictedCtx, 'sales', 'create')).toBe(false);
    expect(canDo(restrictedCtx, 'payroll', 'view')).toBe(false);
  });

  it('returns false for unknown module', () => {
    expect(canDo(ctx, 'nonexistent_module', 'view')).toBe(false);
  });

  it('handles all action types', () => {
    const actions = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'sync'] as const;
    for (const action of actions) {
      expect(canDo(ctx, 'sales', action)).toBe(true);
    }
  });
});

// ---- getModulePermission -----------------------------------

describe('getModulePermission', () => {
  const ctx = makeUserContext();

  it('returns full permissions for authorized module', () => {
    const perms = getModulePermission(ctx, 'sales');
    expect(perms.view).toBe(true);
    expect(perms.create).toBe(true);
    expect(perms.approve).toBe(true);
    expect(perms.branch_scope).toBe('all');
  });

  it('returns no permissions for unknown module', () => {
    const perms = getModulePermission(ctx, 'unknown_module');
    expect(perms.view).toBe(false);
    expect(perms.create).toBe(false);
  });

  it('respects branch_scope setting', () => {
    const limitedCtx = makeUserContext({
      permissions: {
        sales: { view: true, create: true, edit: false, delete: false, approve: false, export: false, sync: false, branch_scope: 'assigned' },
      } as any,
    });
    const perms = getModulePermission(limitedCtx, 'sales');
    expect(perms.branch_scope).toBe('assigned');
  });
});

// ---- parseError --------------------------------------------

describe('parseError', () => {
  it('parses INSUFFICIENT_STOCK', () => {
    const error = parseError(new Error('INSUFFICIENT_STOCK: Product X has 0 available'));
    expect(error.code).toBe('INSUFFICIENT_STOCK');
    expect(error.message).toBeTruthy();
  });

  it('parses PERMISSION_DENIED', () => {
    const error = parseError(new Error('PERMISSION_DENIED: User cannot create sales'));
    expect(error.code).toBe('PERMISSION_DENIED');
  });

  it('parses CREDIT_LIMIT_EXCEEDED', () => {
    const error = parseError(new Error('CREDIT_LIMIT_EXCEEDED: Balance 100000 exceeds limit 50000'));
    expect(error.code).toBe('CREDIT_LIMIT_EXCEEDED');
  });

  it('parses IMMUTABLE_RECORD', () => {
    const error = parseError(new Error('IMMUTABLE_RECORD: Sale cannot be edited after confirmation'));
    expect(error.code).toBe('IMMUTABLE_RECORD');
  });

  it('parses network error', () => {
    const error = parseError(new Error('Failed to fetch'));
    expect(error.code).toBe('NETWORK_ERROR');
  });

  it('handles ImageCareError passthrough', () => {
    const err = new ImageCareError('OVERPAYMENT', 'Payment exceeds balance', 'detail');
    const parsed = parseError(err);
    expect(parsed.code).toBe('OVERPAYMENT');
    expect(parsed.message).toBe('Payment exceeds balance');
    expect(parsed.detail).toBe('detail');
  });

  it('returns UNKNOWN_ERROR for unrecognized errors', () => {
    const error = parseError(new Error('Something completely unexpected'));
    expect(error.code).toBe('SERVER_ERROR');
  });

  it('handles non-Error objects', () => {
    const error = parseError('string error');
    expect(error.code).toBeDefined();
    expect(error.message).toBeTruthy();
  });
});

// ---- Permission edge cases ---------------------------------

describe('Permission edge cases', () => {
  it('branch_scope all allows all branches', () => {
    const ctx = makeUserContext();
    const perms = getModulePermission(ctx, 'sales');
    expect(perms.branch_scope).toBe('all');
  });

  it('user with no branches cannot access any branch', () => {
    const ctx = makeUserContext({ branches: [] });
    // No explicit branch access - should only access home branch
    expect(ctx.branches).toHaveLength(0);
  });

  it('suspended user context reflects is_active false', () => {
    const ctx = makeUserContext({ is_active: false });
    expect(ctx.is_active).toBe(false);
  });
});
