// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/services/loyalty/loyaltyService.ts
// Purpose: Loyalty programme - REAL backend wiring, minimum safe subset.
//
// SCOPE NOTE (do not extend without a product decision):
// imagecare.loyalty_accounts / imagecare.loyalty_transactions exist in
// the DB (database/migrations/0011_stage2_supporting_domains.sql) but
// nothing in the schema computes points_balance from transactions - no
// trigger, no function (confirmed by grepping every migration file for
// "loyalty"). The migration comment "points_balance derives from
// loyalty_transactions" is aspirational, not enforced. There is also no
// points-per-currency conversion rate, no redemption minimum, no
// expiry policy, and no loyalty_rewards / loyalty_redemptions table
// anywhere in the schema.
//
// This file therefore contains ONLY rule-free reads plus one
// zero-balance row insert:
//   - listLoyaltyAccounts        real SELECT, business-scoped
//   - getLoyaltyAccountByCustomer real SELECT single row
//   - listLoyaltyTransactions    real SELECT, business+account-scoped
//   - enrollLoyaltyAccount       real INSERT of schema defaults only
//     (points_balance: 0, tier: 'standard', is_active: true - no
//     invented numbers)
//
// It deliberately does NOT implement awarding points, redeeming
// points/rewards, tier calculation, or expiration: every one of those
// requires a business rule (conversion rate, redemption minimum, tier
// thresholds, expiry window) that does not exist anywhere in the real
// schema. Writing those rules into code that reads from real tables
// would make invented numbers look like verified backend behaviour.
// Those operations remain local-only in src/services/loyaltyService.ts
// (see src/features/loyalty/hooks/useLoyaltyData.ts for the split).
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
