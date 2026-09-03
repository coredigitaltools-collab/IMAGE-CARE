// ============================================================
// Sales Targets - REAL service (Stage: save-button repair pass)
// ============================================================
// imagecare.sales_targets is a real table (business_id, branch_id,
// user_id, period_start, period_end, target_amount, target_type, notes -
// database/migrations/0011_stage2_supporting_domains.sql) but, until now,
// nothing under src/services/ performed CRUD against it - the feature
// hooks wrote to a local-only IndexedDB store instead
// (src/services/salesTargetsService.ts, kept for the one scope it can
// still honestly represent, see the note on createTarget below).
//
// This file adds real create/delete for BRANCH- and STAFF-scoped
// targets, following the same ServiceResponse/canDo pattern as
// src/services/financial/financialServices.ts. BUSINESS-wide targets
// are the one case this table cannot represent:
// chk_s2_target_scope requires branch_id OR user_id to be set, so a
// business-wide row (both null, exactly what "business" scope means)
// is rejected by the database outright. Rather than block the default,
// most-common "Business-wide" option in the New Target modal on a
// schema limitation nobody asked to change, useCreateTarget (see
// features/salesTargets/hooks/useSalesTargetsData.ts) routes that one
// scope to the existing local store and everything else here.

import { supabase } from '../../lib/supabase';
import { canDo } from '../../types/app';
import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { SalesTarget, SalesTargetInput, TargetScope } from '../../types/salesTargets';
// Reused so TargetsListPage's `instanceof OverlappingTargetError` /
// `instanceof InvalidTargetScopeError` checks keep working no matter
// which store (real or local) actually handled the request.
import { OverlappingTargetError, InvalidTargetScopeError } from '../salesTargetsService';

interface SalesTargetRow {
  id: string;
  branch_id: string | null;
  user_id: string | null;
  period_start: string;
  period_end: string;
  target_amount: number;
  created_at: string;
  created_by: string | null;
}

function mapRow(row: SalesTargetRow): SalesTarget {
  const scope: TargetScope = row.branch_id ? 'branch' : 'staff';
  return {
    id: row.id,
    scope,
    branchId: row.branch_id,
    staffId: row.user_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    targetAmountUgx: Number(row.target_amount),
    createdAt: row.created_at,
    createdBy: row.created_by ?? '',
  };
}

function periodsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() <= new Date(bEnd).getTime() && new Date(aEnd).getTime() >= new Date(bStart).getTime();
}

export async function listTargets(ctx: UserContext): Promise<ServiceResponse<SalesTarget[]>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'salesTargets', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view sales targets.', { requestId });
  }
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('sales_targets')
      .select('id, branch_id, user_id, period_start, period_end, target_amount, created_at, created_by')
      .eq('business_id', ctx.business_id)
      .order('period_start', { ascending: false });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load sales targets.', { requestId });
    return serviceOk((data ?? []).map(mapRow), requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to load sales targets.', { requestId }); }
}

// Only ever called for scope 'branch' | 'staff' (see the module note
// above) - 'business' is routed to the local store by the calling hook.
export async function createTarget(ctx: UserContext, input: SalesTargetInput): Promise<ServiceResponse<SalesTarget>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'salesTargets', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to create sales targets.', { requestId });
  }

  if (new Date(input.periodEnd).getTime() < new Date(input.periodStart).getTime()) {
    return serviceFail('INVALID_INPUT', 'End date must be on or after the start date.', { requestId });
  }
  if (input.targetAmountUgx <= 0) {
    return serviceFail('INVALID_INPUT', 'Enter a target amount greater than 0.', { requestId });
  }
  if (input.scope === 'branch' && !input.branchId) throw new InvalidTargetScopeError('A branch target needs a branch selected.');
  if (input.scope === 'staff' && !input.staffId) throw new InvalidTargetScopeError('A staff target needs a staff member selected.');

  try {
    // "Payroll periods cannot overlap" applies here too - same rule the
    // local store already enforced, replicated against real rows since
    // no DB constraint covers it.
    let existingQuery = supabase
      .schema('imagecare')
      .from('sales_targets')
      .select('id, period_start, period_end')
      .eq('business_id', ctx.business_id);
    existingQuery = input.scope === 'branch' ? existingQuery.eq('branch_id', input.branchId as string) : existingQuery.eq('user_id', input.staffId as string);
    const { data: existing, error: existingErr } = await existingQuery;
    if (existingErr) return serviceFail('INTERNAL_ERROR', 'Failed to check existing targets.', { requestId });
    if ((existing ?? []).some((t) => periodsOverlap(t.period_start, t.period_end, input.periodStart, input.periodEnd))) {
      throw new OverlappingTargetError();
    }

    const { data, error } = await supabase
      .schema('imagecare')
      .from('sales_targets')
      .insert({
        business_id:   ctx.business_id,
        branch_id:     input.scope === 'branch' ? input.branchId : null,
        user_id:       input.scope === 'staff' ? input.staffId : null,
        period_start:  input.periodStart,
        period_end:    input.periodEnd,
        target_amount: input.targetAmountUgx,
        target_type:   'revenue',
        created_by:    ctx.user_id,
      })
      .select('id, branch_id, user_id, period_start, period_end, target_amount, created_at, created_by')
      .single();
    if (error || !data) return serviceFail('INTERNAL_ERROR', 'Failed to create sales target.', { requestId });
    return serviceOk(mapRow(data), requestId);
  } catch (err) {
    if (err instanceof OverlappingTargetError || err instanceof InvalidTargetScopeError) throw err;
    return serviceFail('INTERNAL_ERROR', 'Failed to create sales target.', { requestId });
  }
}

// Deletes the real row if one exists with this id; reports whether it
// did, so the caller can fall back to the local store for a target that
// was never real (e.g. a business-wide one) without masking a genuine
// database error as "not found".
export async function deleteTarget(ctx: UserContext, id: string): Promise<ServiceResponse<{ deleted: boolean }>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'salesTargets', 'delete')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to delete sales targets.', { requestId });
  }
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('sales_targets')
      .delete()
      .eq('id', id)
      .eq('business_id', ctx.business_id)
      .select('id');
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to delete sales target.', { requestId });
    return serviceOk({ deleted: (data ?? []).length > 0 }, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to delete sales target.', { requestId }); }
}
