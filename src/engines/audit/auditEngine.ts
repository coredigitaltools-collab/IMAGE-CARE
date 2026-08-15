// ============================================================
// ImageCare ERP - Stage 3: Audit Engine
// File: src/engines/audit/auditEngine.ts
// Purpose: Records sensitive and material business actions.
//   - Who performed the action
//   - When it occurred
//   - Business and branch context
//   - Source transaction
//   - Action type
//
// Audit records are written only through this engine.
// Ordinary users cannot edit audit history.
// Audit records are NOT a second source of business truth.
// ============================================================

import { db } from '../../lib/db';
import type { UUID } from '../../types/database';
import type { EngineContext, EngineResult, AuditEvent } from '../types';
import { engineOk, engineFail, makeError } from '../types';

export class AuditEngine {
  // ---- log ------------------------------------------------
  // Records an audit event. Silently fails rather than
  // blocking the primary operation - audit failure must never
  // roll back a successful business transaction.
  // For sensitive operations call logSensitive() instead which
  // DOES propagate failure.

  async log(
    ctx: EngineContext,
    event: AuditEvent,
  ): Promise<void> {
    try {
      await db.audit_logs().insert({
        business_id:    ctx.business_id,
        branch_id:      ctx.branch_id ?? null,
        user_id:        ctx.user_id,
        table_name:     event.table_name,
        record_id:      event.record_id,
        action:         event.action,
        previous_value: event.previous_value ?? null,
        new_value:      event.new_value ?? null,
        changed_fields: event.changed_fields ?? null,
      });
    } catch {
      // Audit failure is logged to console only - never propagated
      console.error('[AuditEngine] Failed to write audit log', event);
    }
  }

  // ---- logSensitive ---------------------------------------
  // For permission changes, financial corrections, reversals.
  // Propagates failure so caller knows audit was not recorded.

  async logSensitive(
    ctx: EngineContext,
    event: AuditEvent,
  ): Promise<EngineResult> {
    const { error } = await db.audit_logs().insert({
      business_id:    ctx.business_id,
      branch_id:      ctx.branch_id ?? null,
      user_id:        ctx.user_id,
      table_name:     event.table_name,
      record_id:      event.record_id,
      action:         event.action,
      previous_value: event.previous_value ?? null,
      new_value:      event.new_value ?? null,
      changed_fields: event.changed_fields ?? null,
    });

    if (error) {
      return engineFail(makeError(
        'DATABASE_ERROR',
        'Failed to record audit event.',
        error.message,
      ));
    }

    return engineOk(undefined);
  }

  // ---- recent ---------------------------------------------
  // Returns recent audit logs for a given record.
  // Only accessible to owners (enforced by RLS on audit_logs).

  async recent(
    ctx: EngineContext,
    tableName: string,
    recordId: UUID,
    limit = 50,
  ): Promise<EngineResult<Array<Record<string, unknown>>>> {
    const { data, error } = await db.audit_logs()
      
      .select('*')
      .eq('business_id', ctx.business_id)
      .eq('table_name', tableName)
      .eq('record_id', recordId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to load audit logs.', error.message));
    }

    return engineOk(data ?? []);
  }
}

export const auditEngine = new AuditEngine();
