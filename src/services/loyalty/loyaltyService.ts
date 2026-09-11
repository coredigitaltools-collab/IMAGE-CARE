// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/loyalty/loyaltyService.ts
// Purpose: Loyalty programme - REAL backend wiring.
//
// SCOPE NOTE (updated 2026-09-05 - see
// claude/loyalty-not-connected-to-sales-fix-2026-09-05.md):
// imagecare.loyalty_accounts / imagecare.loyalty_transactions exist in
// the DB (database/migrations/0011_stage2_supporting_domains.sql) but
// nothing in the schema computes points_balance from transactions - no
// trigger, no function. There is still no loyalty_rewards /
// loyalty_redemptions table anywhere in the schema, so the reward
// catalogue and redemption log stay local-storage (see
// src/services/loyaltyService.ts / docs/MODULE_INTEGRATION_MAP.md gap).
//
// What IS now real (0031_stage9_loyalty_award.sql):
//   - listLoyaltyAccounts         real SELECT, business-scoped
//   - getLoyaltyAccountByCustomer real SELECT single row
//   - listLoyaltyTransactions     real SELECT, business+account-scoped
//   - enrollLoyaltyAccount        real INSERT of schema defaults only
//   - awardLoyaltyPoints          real, atomic award via
//     fn_award_loyalty_points (auto-enrolls on first qualifying sale,
//     idempotent per sale_id) - called from useCheckout on every
//     completed sale that has a customer attached
//   - redeemLoyaltyPoints         real, atomic debit via
//     fn_redeem_loyalty_points - called from useRedeemReward after the
//     local reward catalogue confirms the reward and its point cost
//
// The UGX-per-point conversion rate is still read from the local,
// owner-editable Loyalty Settings (getLoyaltySettings() in
// src/services/loyaltyService.ts) rather than hardcoded here or in the
// DB function - that number has nowhere else to live (no schema column
// for it), but the award/redeem WRITES themselves are real and atomic.
// ============================================================

import { supabase } from '../../lib/supabase';
import { canDo } from '../../types/app';
import { serviceOk, serviceFail, makeRequestId } from '../../types/contracts';
import type { ServiceResponse } from '../../types/contracts';
import type { UserContext } from '../../types/app';
import type { LoyaltyAccount, LoyaltyTransaction, UUID } from '../../types/database';

export interface LoyaltyAccountWithCustomer extends LoyaltyAccount {
  customers?: { name: string } | null;
}

// ===========================================================
// LOYALTY ACCOUNTS
// ===========================================================

export async function listLoyaltyAccounts(
  ctx: UserContext,
  filter: { is_active?: boolean } = {}
): Promise<ServiceResponse<LoyaltyAccountWithCustomer[]>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'loyalty', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view loyalty accounts.', { requestId });
  }
  try {
    let query = supabase
      .schema('imagecare')
      .from('loyalty_accounts')
      .select('*, customers(name)')
      .eq('business_id', ctx.business_id)
      .order('points_balance', { ascending: false });
    if (filter.is_active !== undefined) query = query.eq('is_active', filter.is_active);
    const { data, error } = await query;
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load loyalty accounts.', { requestId });
    return serviceOk((data ?? []) as LoyaltyAccountWithCustomer[], requestId);
  } catch {
    return serviceFail('INTERNAL_ERROR', 'Failed to load loyalty accounts.', { requestId });
  }
}

export async function getLoyaltyAccountByCustomer(
  ctx: UserContext,
  customerId: UUID
): Promise<ServiceResponse<LoyaltyAccountWithCustomer | null>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'loyalty', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view loyalty accounts.', { requestId });
  }
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('loyalty_accounts')
      .select('*, customers(name)')
      .eq('business_id', ctx.business_id)
      .eq('customer_id', customerId)
      .maybeSingle();
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load loyalty account.', { requestId });
    // No row is a normal state (customer not yet enrolled), not an error.
    return serviceOk((data as LoyaltyAccountWithCustomer | null) ?? null, requestId);
  } catch {
    return serviceFail('INTERNAL_ERROR', 'Failed to load loyalty account.', { requestId });
  }
}

// Row creation only - points_balance: 0, tier: 'standard', is_active: true
// are the table's own DEFAULT values, not invented business numbers.
export async function enrollLoyaltyAccount(
  ctx: UserContext,
  customerId: UUID
): Promise<ServiceResponse<LoyaltyAccount>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'loyalty', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to enroll loyalty accounts.', { requestId });
  }
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('loyalty_accounts')
      .insert({
        business_id:    ctx.business_id,
        customer_id:    customerId,
        points_balance: 0,
        tier:           'standard',
        is_active:      true,
      })
      .select()
      .single();
    if (error) {
      if (error.code === '23505') {
        return serviceFail('CONFLICT', 'This customer is already enrolled in the loyalty programme.', { requestId });
      }
      return serviceFail('INTERNAL_ERROR', 'Failed to enroll customer in the loyalty programme.', { requestId });
    }
    return serviceOk(data as LoyaltyAccount, requestId);
  } catch {
    return serviceFail('INTERNAL_ERROR', 'Failed to enroll customer in the loyalty programme.', { requestId });
  }
}

// ===========================================================
// LOYALTY TRANSACTIONS (read-only history - no writer here; see
// scope note above for why earn/redeem writes stay local-only)
// ===========================================================

export async function listLoyaltyTransactions(
  ctx: UserContext,
  loyaltyAccountId: UUID
): Promise<ServiceResponse<LoyaltyTransaction[]>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'loyalty', 'view')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to view loyalty transactions.', { requestId });
  }
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('loyalty_transactions')
      .select('*')
      .eq('business_id', ctx.business_id)
      .eq('loyalty_account_id', loyaltyAccountId)
      .order('transaction_date', { ascending: false });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to load loyalty transactions.', { requestId });
    return serviceOk((data ?? []) as LoyaltyTransaction[], requestId);
  } catch {
    return serviceFail('INTERNAL_ERROR', 'Failed to load loyalty transactions.', { requestId });
  }
}

// ===========================================================
// AWARD / REDEEM (real, atomic - see scope note above)
// ===========================================================

export interface AwardLoyaltyPointsResult {
  points: number;
  newBalance: number | null;
  alreadyAwarded: boolean;
}

// Called once per completed sale with a customer attached. A best-effort
// side effect of checkout, not a condition for it - see useCheckout in
// useSalesData.ts, which swallows a failure here rather than failing an
// otherwise-successful sale over the loyalty programme.
export async function awardLoyaltyPoints(
  ctx: UserContext,
  customerId: UUID,
  saleId: UUID,
  amountUgx: number,
  ugxPerPoint: number
): Promise<ServiceResponse<AwardLoyaltyPointsResult>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'loyalty', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to award loyalty points.', { requestId });
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_award_loyalty_points', {
      p_customer_id: customerId,
      p_sale_id: saleId,
      p_amount_ugx: amountUgx,
      p_ugx_per_point: ugxPerPoint,
    });
    if (error) return serviceFail('INTERNAL_ERROR', 'Failed to award loyalty points.', { requestId });
    const result = data as { points?: number; new_balance?: number; already_awarded?: boolean } | null;
    return serviceOk(
      {
        points: result?.points ?? 0,
        newBalance: result?.new_balance ?? null,
        alreadyAwarded: result?.already_awarded ?? false,
      },
      requestId
    );
  } catch {
    return serviceFail('INTERNAL_ERROR', 'Failed to award loyalty points.', { requestId });
  }
}

export interface RedeemLoyaltyPointsResult {
  newBalance: number;
}

// Debits the same real balance awardLoyaltyPoints credits. The reward
// catalogue (which reward, its point cost) stays local - see
// useRedeemReward in useLoyaltyData.ts for how the two are combined.
export async function redeemLoyaltyPoints(
  ctx: UserContext,
  customerId: UUID,
  points: number,
  description: string
): Promise<ServiceResponse<RedeemLoyaltyPointsResult>> {
  const requestId = makeRequestId();
  if (!canDo(ctx, 'loyalty', 'create')) {
    return serviceFail('PERMISSION_DENIED', 'You do not have permission to redeem loyalty points.', { requestId });
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('fn_redeem_loyalty_points', {
      p_customer_id: customerId,
      p_points: points,
      p_description: description,
    });
    if (error) {
      const raw = String(error.message ?? '');
      if (raw.includes('INSUFFICIENT_POINTS')) return serviceFail('BUSINESS_RULE_VIOLATION', 'This customer does not have enough points for this reward.', { requestId });
      if (raw.includes('NOT_FOUND')) return serviceFail('RESOURCE_NOT_FOUND', 'This customer is not enrolled in the loyalty programme yet.', { requestId });
      return serviceFail('INTERNAL_ERROR', 'Failed to redeem loyalty points.', { requestId });
    }
    const result = data as { new_balance?: number } | null;
    return serviceOk({ newBalance: result?.new_balance ?? 0 }, requestId);
  } catch {
    return serviceFail('INTERNAL_ERROR', 'Failed to redeem loyalty points.', { requestId });
  }
}
