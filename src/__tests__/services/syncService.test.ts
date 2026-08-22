// ============================================================
// IMC-BLD-006 | ImageCare ERP Testing & QA v1.0
// File: src/__tests__/services/syncService.test.ts
// Purpose: Service contract tests for offline synchronization
//          (device registration, initial sync payload, push/pull,
//          and the push-then-pull session orchestrator).
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUserContext, TEST_BRANCH_ID } from '../setup';

// The global setup mock (src/__tests__/setup.ts) does not export the
// standalone `rpc()` boundary that syncService relies on for most of
// its calls, and its `supabase.from()` chain doesn't resolve a real
// insert result. Override both locally so success paths are testable,
// not just the try/catch fallback.
const { supabaseMock, rpcMock, setInsertResult } = vi.hoisted(() => {
  let insertResult: { error: unknown } = { error: null };
  const chain: Record<string, unknown> = {};
  for (const method of ['schema', 'from', 'insert']) {
    chain[method] = () => chain;
  }
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(insertResult).then(resolve, reject);
  return {
    supabaseMock: chain,
    rpcMock: vi.fn(),
    setInsertResult: (r: { error: unknown }) => { insertResult = r; },
  };
});

vi.mock('../../lib/supabase', () => ({
  supabase: supabaseMock,
  rpc: rpcMock,
  default: supabaseMock,
}));

vi.mock('../../config/env', () => ({
  APP_CONSTANTS: { SYNC_PULL_BATCH_SIZE: 200 },
}));

import {
  registerDevice,
  getInitialSyncPayload,
  pullChanges,
  pushQueuedOperations,
  enqueueOperation,
  runSyncSession,
} from '../../services/sync/syncService';

const DEVICE: Parameters<typeof registerDevice>[1] = { device_id: 'device-1', device_type: 'desktop' };

beforeEach(() => {
  rpcMock.mockReset();
  setInsertResult({ error: null });
});

// ---- registerDevice ------------------------------------------

describe('registerDevice', () => {
  it('registers a device and returns its record id', async () => {
    rpcMock.mockResolvedValue({ data: 'device-record-1', error: null });
    const result = await registerDevice(makeUserContext(), DEVICE);
    expect(result.success).toBe(true);
    expect(result.data?.device_record_id).toBe('device-record-1');
  });

  it('fails gracefully when the RPC returns an error', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'db unavailable' } });
    const result = await registerDevice(makeUserContext(), DEVICE);
    expect(result.success).toBe(false);
  });
});

// ---- getInitialSyncPayload ------------------------------------

describe('getInitialSyncPayload', () => {
  it('returns the initial sync payload on success', async () => {
    rpcMock.mockResolvedValue({
      data: { business_id: 'b1', user_id: 'u1', synced_at: '2026-01-01', products: [], product_categories: [], units: [], customers: [], suppliers: [], branches: [], settings: [], users: [] },
      error: null,
    });
    const result = await getInitialSyncPayload(makeUserContext(), TEST_BRANCH_ID);
    expect(result.success).toBe(true);
    expect(result.data?.business_id).toBe('b1');
  });

  it('fails gracefully when the RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await getInitialSyncPayload(makeUserContext());
    expect(result.success).toBe(false);
  });
});

// ---- pullChanges ------------------------------------------------

describe('pullChanges', () => {
  it('returns the pulled change set', async () => {
    rpcMock.mockResolvedValue({
      data: { changes: [], count: 0, new_cursor: 5, has_more: false, pulled_at: '2026-01-01' },
      error: null,
    });
    const result = await pullChanges(makeUserContext(), 'device-1', 0);
    expect(result.success).toBe(true);
    expect(result.data?.new_cursor).toBe(5);
  });

  it('fails gracefully when the RPC errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const result = await pullChanges(makeUserContext(), 'device-1', 0);
    expect(result.success).toBe(false);
  });
});

// ---- pushQueuedOperations -----------------------------------------

describe('pushQueuedOperations', () => {
  it('creates a sync batch then processes it, returning the batch result', async () => {
    rpcMock.mockResolvedValue({ data: { total: 3, accepted: 3, rejected: 0, conflicts: 0 }, error: null });
    const result = await pushQueuedOperations(makeUserContext(), 'device-1');
    expect(result.success).toBe(true);
    expect(result.data?.accepted).toBe(3);
  });

  it('fails without calling the RPC when the batch record cannot be created', async () => {
    setInsertResult({ error: { message: 'insert failed' } });
    const result = await pushQueuedOperations(makeUserContext(), 'device-1');
    expect(result.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('fails gracefully when batch processing itself errors', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'processing failed' } });
    const result = await pushQueuedOperations(makeUserContext(), 'device-1');
    expect(result.success).toBe(false);
  });
});

// ---- enqueueOperation -----------------------------------------------

describe('enqueueOperation', () => {
  it('queues a local operation and returns its generated id', async () => {
    const result = await enqueueOperation(makeUserContext(), 'device-1', {
      table_name: 'sales', record_id: 'sale-1', operation: 'insert', payload: { amount: 100 },
    });
    expect(result.success).toBe(true);
    expect(typeof result.data).toBe('string');
  });

  it('fails gracefully when the insert errors', async () => {
    setInsertResult({ error: { message: 'insert failed' } });
    const result = await enqueueOperation(makeUserContext(), 'device-1', {
      table_name: 'sales', record_id: 'sale-1', operation: 'insert', payload: {},
    });
    expect(result.success).toBe(false);
  });
});

// ---- runSyncSession: push-then-pull orchestration --------------------

describe('runSyncSession', () => {
  it('pushes pending operations, then pulls server changes, returning both', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: { total: 1, accepted: 1, rejected: 0, conflicts: 0 }, error: null }) // push
      .mockResolvedValueOnce({ data: { changes: [], count: 0, new_cursor: 9, has_more: false, pulled_at: '2026-01-01' }, error: null }); // pull

    const result = await runSyncSession(makeUserContext(), 'device-1', 0);

    expect(result.success).toBe(true);
    expect(result.data?.push.accepted).toBe(1);
    expect(result.data?.pull.new_cursor).toBe(9);
  });

  it('stops and reports failure without pulling when the push fails', async () => {
    setInsertResult({ error: { message: 'insert failed' } }); // push fails before any RPC call

    const result = await runSyncSession(makeUserContext(), 'device-1', 0);

    expect(result.success).toBe(false);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('reports failure when the push succeeds but the pull fails', async () => {
    rpcMock
      .mockResolvedValueOnce({ data: { total: 1, accepted: 1, rejected: 0, conflicts: 0 }, error: null }) // push
      .mockResolvedValueOnce({ data: null, error: { message: 'pull failed' } }); // pull

    const result = await runSyncSession(makeUserContext(), 'device-1', 0);

    expect(result.success).toBe(false);
  });
});
