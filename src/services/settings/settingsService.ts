// ============================================================
// IMC-BLD-002 | ImageCare ERP Database Schema Specification v1.0
// File: src/services/settings/settingsService.ts
// Purpose: Business settings service.
//          All configuration is stored as data, never hard-coded.
//          Covers business settings, branch settings, chart of accounts.
// ============================================================

import { supabase } from '../../lib/supabase';
import { ok, fail, parseError } from '../../types/app';
import type { ApiResult, UserContext } from '../../types/app';
import type { UUID } from '../../types/database';
import type { Account } from '../../types/schema';

// ---- Settings access ---------------------------------------

export async function getSetting(
  ctx: UserContext,
  category: string,
  key: string,
  branchId?: UUID
): Promise<ApiResult<unknown>> {
  try {
    let query = supabase
      .schema('imagecare')
      .from('settings')
      .select('value')
      .eq('business_id', ctx.business_id)
      .eq('category', category)
      .eq('key', key);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    } else {
      query = query.is('branch_id', null);
    }

    const { data, error } = await query.maybeSingle();
    if (error) return fail(parseError(error));
    return ok(data?.value ?? null);
  } catch (err) {
    return fail(parseError(err));
  }
}

export async function getSettingsByCategory(
  ctx: UserContext,
  category: string,
  branchId?: UUID
): Promise<ApiResult<Record<string, unknown>>> {
  try {
    let query = supabase
      .schema('imagecare')
      .from('settings')
      .select('key, value')
      .eq('business_id', ctx.business_id)
      .eq('category', category);

    if (branchId) {
      query = query.eq('branch_id', branchId);
    } else {
      query = query.is('branch_id', null);
    }

    const { data, error } = await query;
    if (error) return fail(parseError(error));

    const result: Record<string, unknown> = {};
    for (const row of data ?? []) {
      result[row.key] = row.value;
    }
    return ok(result);
  } catch (err) {
    return fail(parseError(err));
  }
}

export async function updateSetting(
  ctx: UserContext,
  category: string,
  key: string,
  value: unknown,
  branchId?: UUID
): Promise<ApiResult<void>> {
  try {
    const { error } = await supabase
      .schema('imagecare')
      .from('settings')
      .upsert({
        business_id: ctx.business_id,
        branch_id:   branchId ?? null,
        category,
        key,
        value,
        updated_at:  new Date().toISOString(),
      }, { onConflict: 'business_id,branch_id,category,key' });

    if (error) return fail(parseError(error));
    return ok(undefined);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Chart of accounts -------------------------------------

export async function getChartOfAccounts(
  ctx: UserContext
): Promise<ApiResult<Account[]>> {
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('settings')
      .select('key, value')
      .eq('business_id', ctx.business_id)
      .is('branch_id', null)
      .eq('category', 'chart_of_accounts')
      .order('key');

    if (error) return fail(parseError(error));

    const accounts: Account[] = (data ?? []).map(row => {
      const v = row.value as Record<string, unknown>;
      return {
        id:           crypto.randomUUID(), // display only - not a real DB row id
        business_id:  ctx.business_id,
        code:         row.key,
        name:         v.name as string,
        account_type: v.type as Account['account_type'],
        parent_id:    null,
        is_active:    true,
        is_system:    true,
        description:  null,
        created_at:   '',
        updated_at:   '',
      };
    });

    return ok(accounts);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Commonly used settings getters ------------------------

export async function getBusinessCurrency(ctx: UserContext): Promise<string> {
  const result = await getSetting(ctx, 'accounting', 'default_currency');
  const val = result.data;
  if (typeof val === 'string') return val.replace(/"/g, '');
  return 'UGX';
}

export async function getVatRate(ctx: UserContext): Promise<number> {
  const result = await getSetting(ctx, 'accounting', 'vat_rate');
  return typeof result.data === 'number' ? result.data : 0.18;
}

export async function allowNegativeStock(ctx: UserContext): Promise<boolean> {
  const result = await getSetting(ctx, 'inventory', 'allow_negative_stock');
  return result.data === true || result.data === 'true';
}

export async function getReceiptPrefix(ctx: UserContext): Promise<string> {
  const result = await getSetting(ctx, 'sales', 'receipt_prefix');
  const val = result.data;
  if (typeof val === 'string') return val.replace(/"/g, '');
  return 'RCP';
}
