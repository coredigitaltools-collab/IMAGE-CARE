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
// This file adds real create/delete for BRANCH-, STAFF-, and (as of the
// 2026-09-05 Sales Targets dashboard fix) BUSINESS-scoped targets, plus
// real achievement computation against imagecare.sales, following the
// same ServiceResponse/canDo pattern as
// src/services/financial/financialServices.ts.
//
// Bug fix (2026-09-05): chk_s2_target_scope used to require branch_id OR
// user_id to be set, so a business-wide row (both null) was rejected by
// the database outright, and every dashboard/leaderboard/report view read
// only the old local-only store (services/salesTargetsService.ts) and
// computed achievement against fake local sales data - so a real target
// (e.g. a staff target for Mariam) never showed real progress. The owner
// approved (AskUserQuestion, 2026-09-05) both fixes: migration
// 0032_stage9_salestargets_business_scope.sql replaced that constraint
// with chk_s2_target_scope_mutex (branch_id IS NULL OR user_id IS NULL),
// and imagecare.sales.served_by is now written for real at checkout (see
// engines/business/businessEngine.ts createSale()). See
// claude/sales-targets-dashboard-fix-2026-09-05.md.

import { supabase } from '../../lib/supabase';
import { canDo } from '../../types/app';
import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { SalesTarget, SalesTargetInput, TargetProgress, TargetScope } from '../../types/salesTargets';
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
  const scope: TargetScope = row.branch_id ? 'branch' : row.user_id ? 'staff' : 'business';
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

// Handles all three scopes - 'business' (both branch_id/user_id null) is
// now a real row too, per the 2026-09-05 schema fix (see module note).
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
    existingQuery =
      input.scope === 'branch'
        ? existingQuery.eq('branch_id', input.branchId as string)
        : input.scope === 'staff'
          ? existingQuery.eq('user_id', input.staffId as string)
          : existingQuery.is('branch_id', null).is('user_id', null);
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

// ---------------------------------------------------------------------
// Real achievement computation (2026-09-05 Sales Targets dashboard fix)
//
// Works for a SalesTarget regardless of which store it came from (real
// row or a legacy local one) - it only needs the scope/branchId/staffId/
// period/targetAmountUgx already on the object, and queries real
// imagecare.sales directly. This replaces the old local
// services/salesTargetsService.ts's achievedForTarget(), which matched
// against a fake, purely-local sales list and could never see a real
// checkout - the actual root cause of the Sales Targets dashboard
// showing nothing for a real target. See
// claude/sales-targets-dashboard-fix-2026-09-05.md.

// periodEnd is a plain date (YYYY-MM-DD) but sale_date is a timestamptz -
// this pushes the boundary to the start of the next day so the whole end
// date is included, mirroring the old local store's end-of-day
// (`+ 86_399_000` ms) adjustment.
function periodEndExclusive(periodEnd: string): string {
  const d = new Date(periodEnd);
  d.setDate(d.getDate() + 1);
  return d.toISOString();
}

async function achievedForTarget(ctx: UserContext, target: SalesTarget): Promise<ServiceResponse<number>> {
  const requestId = makeRequestId();
  try {
    let query = supabase
      .schema('imagecare')
      .from('sales')
      .select('total_amount')
      .eq('business_id', ctx.business_id)
      .eq('status', 'confirmed')
      .gte('sale_date', target.periodStart)
      .lt('sale_date', periodEndExclusive(target.periodEnd));
    if (target.scope === 'branch' && target.branchId) query = query.eq('branch_id', target.branchId);
    else if (target.scope === 'staff' && target.staffId) query = query.eq('served_by', target.staffId);
    // 'business' scope: no extra filter - every confirmed sale counts.
    const { data, error } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to compute target achievement.', { requestId });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const achieved = ((data ?? []) as any[]).reduce((sum, r) => sum + Number(r.total_amount ?? 0), 0);
    return serviceOk(achieved, requestId);
  } catch { return serviceFail('INTERNAL_ERROR', 'Failed to compute target achievement.', { requestId }); }
}

export async function getProgress(ctx: UserContext, target: SalesTarget): Promise<ServiceResponse<TargetProgress>> {
  const requestId = makeRequestId();
  const achievedResp = await achievedForTarget(ctx, target);
  if (!achievedResp.success) {
    return serviceFail(achievedResp.error?.code ?? 'INTERNAL_ERROR', achievedResp.error?.message ?? 'Failed to compute target achievement.', { requestId });
  }
  const achievedUgx = achievedResp.data ?? 0;
  return serviceOk(
    {
      target,
      achievedUgx,
      remainingUgx: Math.max(0, target.targetAmountUgx - achievedUgx),
      achievementPercent: target.targetAmountUgx > 0 ? Math.round((achievedUgx / target.targetAmountUgx) * 100) : 0,
    },
    requestId,
  );
}

// Best-effort per target: a single target's query failing (e.g. a
// transient error) falls back to zero achievement for that one target
// rather than failing the whole dashboard/leaderboard.
export async function getAllProgress(ctx: UserContext, targets: SalesTarget[]): Promise<TargetProgress[]> {
  const results = await Promise.all(targets.map((t) => getProgress(ctx, t)));
  return results.map((r, i) =>
    r.success && r.data
      ? r.data
      : {
          target: targets[i],
          achievedUgx: 0,
          remainingUgx: targets[i].targetAmountUgx,
          achievementPercent: 0,
        },
  );
}

export function isCurrentPeriod(target: SalesTarget): boolean {
  const now = Date.now();
  return new Date(target.periodStart).getTime() <= now && new Date(target.periodEnd).getTime() + 86_399_000 >= now;
}
