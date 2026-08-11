// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/services/sync/syncService.ts
// Purpose: Offline synchronization service.
//          Coordinates push (local queue -> server) and
//          pull (server changes -> local cache).
//          Never allow pages to call sync directly.
// ============================================================

import { supabase } from '../../lib/supabase';
import { ok, fail, parseError } from '../../types/app';
import type { ApiResult, UserContext } from '../../types/app';
import type { UUID } from '../../types/database';
import { APP_CONSTANTS } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

// ---- Device registration -----------------------------------

export interface DeviceInfo {
  device_id: string;
  device_name?: string;
  device_type?: 'mobile' | 'desktop' | 'tablet';
  platform?: string;
  app_version?: string;
}

export async function registerDevice(
  ctx: UserContext,
  device: DeviceInfo
): Promise<ApiResult<{ device_record_id: UUID }>> {
  try {
    const { data, error } = await supabase.rpc('fn_register_device', {
      p_business_id: ctx.business_id,
      p_user_id:     ctx.user_id,
      p_device_id:   device.device_id,
      p_device_name: device.device_name ?? null,
      p_device_type: device.device_type ?? null,
      p_platform:    device.platform ?? null,
      p_app_version: device.app_version ?? null,
    });

    if (error) return fail(parseError(error));
    return ok({ device_record_id: data as UUID });
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Initial sync (first-time device) ----------------------

export interface InitialSyncPayload {
  business_id: UUID;
  user_id: UUID;
  synced_at: string;
  products: unknown[];
  product_categories: unknown[];
  units: unknown[];
  customers: unknown[];
  suppliers: unknown[];
  branches: unknown[];
  settings: unknown[];
  users: unknown[];
}

export async function getInitialSyncPayload(
  ctx: UserContext,
  branchId?: UUID
): Promise<ApiResult<InitialSyncPayload>> {
  try {
    const { data, error } = await supabase.rpc('fn_get_initial_sync_payload', {
      p_business_id: ctx.business_id,
      p_user_id:     ctx.user_id,
      p_branch_id:   branchId ?? null,
    });

    if (error) return fail(parseError(error));
    return ok(data as unknown as InitialSyncPayload);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Pull (server -> device) --------------------------------

export interface ChangeLogEntry {
  cursor: number;
  entity_type: string;
  entity_id: UUID;
  operation: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;
  changed_at: string;
}

export interface PullResult {
  changes: ChangeLogEntry[];
  count: number;
  new_cursor: number;
  has_more: boolean;
  pulled_at: string;
}

export async function pullChanges(
  ctx: UserContext,
  deviceId: string,
  sinceCursor: number,
  branchId?: UUID
): Promise<ApiResult<PullResult>> {
  try {
    const { data, error } = await supabase.rpc('fn_get_changes_since', {
      p_business_id:  ctx.business_id,
      p_user_id:      ctx.user_id,
      p_device_id:    deviceId,
      p_since_cursor: sinceCursor,
      p_branch_id:    branchId ?? null,
      p_batch_size:   APP_CONSTANTS.SYNC_PULL_BATCH_SIZE,
    });

    if (error) return fail(parseError(error));
    return ok(data as unknown as PullResult);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Push (device -> server) --------------------------------

export interface SyncBatchResult {
  total: number;
  accepted: number;
  rejected: number;
  conflicts: number;
}

export async function pushQueuedOperations(
  ctx: UserContext,
  deviceId: string
): Promise<ApiResult<SyncBatchResult>> {
  try {
    // Create a batch record
    const batchId = uuidv4();
    const batchNumber = Date.now(); // simple sequential identifier

    const { error: batchError } = await supabase
      .schema('imagecare')
      .from('sync_batches')
      .insert({
        id:           batchId,
        business_id:  ctx.business_id,
        device_id:    deviceId,
        user_id:      ctx.user_id,
        batch_number: batchNumber,
        status:       'processing',
      });

    if (batchError) return fail(parseError(batchError));

    // Process the batch
    const { data, error } = await supabase.rpc('fn_process_sync_batch', {
      p_business_id: ctx.business_id,
      p_user_id:     ctx.user_id,
      p_device_id:   deviceId,
      p_batch_id:    batchId,
    });

    if (error) return fail(parseError(error));
    return ok(data as unknown as SyncBatchResult);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Queue local operation for offline sync ----------------

export async function enqueueOperation(
  ctx: UserContext,
  deviceId: string,
  operation: {
    table_name: string;
    record_id: UUID;
    operation: 'insert' | 'update' | 'delete';
    payload: Record<string, unknown>;
  }
): Promise<ApiResult<UUID>> {
  try {
    const entryId = uuidv4();

    const { error } = await supabase
      .schema('imagecare')
      .from('sync_queue')
      .insert({
        id:             entryId,
        business_id:    ctx.business_id,
        branch_id:      ctx.branch_id ?? null,
        user_id:        ctx.user_id,
        device_id:      deviceId,
        table_name:     operation.table_name,
        record_id:      operation.record_id,
        operation:      operation.operation,
        payload:        operation.payload,
        client_version: 1,
        sync_status:    'pending',
      });

    if (error) return fail(parseError(error));
    return ok(entryId);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Sync orchestrator -------------------------------------
// Call this on reconnection. Push first, then pull.

export async function runSyncSession(
  ctx: UserContext,
  deviceId: string,
  currentCursor: number,
  branchId?: UUID
): Promise<ApiResult<{ push: SyncBatchResult; pull: PullResult }>> {
  // Push pending local operations first
  const pushResult = await pushQueuedOperations(ctx, deviceId);
  if (pushResult.error) return fail(pushResult.error);

  // Then pull server changes
  const pullResult = await pullChanges(ctx, deviceId, currentCursor, branchId);
  if (pullResult.error) return fail(pullResult.error);

  return ok({ push: pushResult.data!, pull: pullResult.data! });
}
