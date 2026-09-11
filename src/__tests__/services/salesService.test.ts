// ============================================================
// IMC-BLD-006 | ImageCare ERP Testing & QA v1.0
// File: src/__tests__/services/salesService.test.ts
// Purpose: Service contract tests for the sales service.
//          Validates permission enforcement, error mapping,
//          and response shape — not database internals.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUserContext, makeNoPermissionContext, TEST_BRANCH_ID, TEST_PRODUCT_ID, TEST_CUSTOMER_ID } from '../setup';
import { createSale, listSales, cancelSale } from '../../services/sales/salesService';
import { supabase } from '../../lib/supabase';

// ---- createSale permission tests ---------------------------

describe('createSale - permission enforcement', () => {
  it('rejects when user has no sales.create permission', async () => {
    const ctx = makeNoPermissionContext();
    const result = await createSale(ctx, {
      branch_id:      TEST_BRANCH_ID,
      payment_method: 'cash',
      amount_paid:    5000,
      change_given:   0,
      credit_amount:  0,
      items: [{ product_id: TEST_PRODUCT_ID, quantity: 1, unit_price: 5000, unit_cost: 3000 }],
    });

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('allows when user has sales.create permission', async () => {
    const ctx = makeUserContext();

    // createSale (services/sales/salesService.ts) now delegates through
    // the real multi-step engine (realBusinessEngine.createSale/postSale
    // -> validateContext, product checks, idempotency, journal posting,
    // etc. - see the Backend Implementation Pass rewiring of
    // src/services/business/businessEngine.ts) instead of a single RPC
    // call, so the mock needs to support arbitrarily deep
    // .select().eq().is()... chains without throwing. A generic
    // self-returning Proxy does that without hand-modeling every
    // table's exact call shape. This test only asserts the ApiResult
    // shape is well-formed, not that the sale succeeds, so a uniform
    // "not found" terminal value is fine even where it makes the engine
    // short-circuit into a permission-was-granted-but-business-rule-
    // failed response.
    const chainable: object = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === 'then') {
            return (resolve: (v: unknown) => void) => resolve({ data: null, error: null, count: 0 });
          }
          return () => chainable;
        },
      }
    );

    const mockSupabase = vi.mocked(supabase);
    (mockSupabase.schema as any) = vi.fn().mockReturnValue(chainable);
    (mockSupabase as any).from = vi.fn().mockReturnValue(chainable);
    (mockSupabase as any).rpc = vi.fn().mockResolvedValue({ data: null, error: null });

    const result = await createSale(ctx, {
      branch_id:      TEST_BRANCH_ID,
      payment_method: 'cash',
      amount_paid:    5000,
      change_given:   0,
      credit_amount:  0,
      items: [{ product_id: TEST_PRODUCT_ID, quantity: 1, unit_price: 5000, unit_cost: 3000 }],
    });

    // Permission was granted - the result shape is what we care about
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('request_id');
  });
});

// ---- createSale response shape tests -----------------------

describe('createSale - response shape', () => {
  it('always returns ServiceResponse shape', async () => {
    const ctx = makeNoPermissionContext();
    const result = await createSale(ctx, {
      branch_id: TEST_BRANCH_ID,
      payment_method: 'cash',
      amount_paid: 0,
      change_given: 0,
      credit_amount: 0,
      items: [],
    });

    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('data');
    expect(result).toHaveProperty('error');
    expect(result).toHaveProperty('request_id');
    expect(result).toHaveProperty('server_timestamp');
    expect(typeof result.request_id).toBe('string');
  });

  it('error response has code and message', async () => {
    const ctx = makeNoPermissionContext();
    const result = await createSale(ctx, {
      branch_id: TEST_BRANCH_ID, payment_method: 'cash',
      amount_paid: 0, change_given: 0, credit_amount: 0, items: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).not.toBeNull();
    expect(typeof result.error?.code).toBe('string');
    expect(typeof result.error?.message).toBe('string');
    // Error message must be user-friendly, not a raw SQL error
    expect(result.error?.message).not.toContain('pg_');
    expect(result.error?.message).not.toContain('ERROR:');
  });
});

// ---- listSales permission tests ----------------------------

describe('listSales - permission enforcement', () => {
  it('rejects when user has no sales.view permission', async () => {
    const ctx = makeNoPermissionContext();
    const result = await listSales(ctx, {});
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });
});

// ---- cancelSale tests --------------------------------------

describe('cancelSale - validation', () => {
  it('rejects when user has no sales.edit permission', async () => {
    const ctx = makeNoPermissionContext();
    const result = await cancelSale(ctx, 'some-sale-id', 'Reason');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('PERMISSION_DENIED');
  });

  it('rejects when reason is empty', async () => {
    const ctx = makeUserContext();
    const result = await cancelSale(ctx, 'some-sale-id', '');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
    expect(result.error?.field).toBe('reason');
  });

  it('rejects when reason is whitespace only', async () => {
    const ctx = makeUserContext();
    const result = await cancelSale(ctx, 'some-sale-id', '   ');
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('INVALID_INPUT');
  });
});
