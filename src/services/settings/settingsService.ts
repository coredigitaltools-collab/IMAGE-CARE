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

// ============================================================
// Stage 5: Business profile, staff, expense categories.
// ============================================================

import type { StaffMember as SettingsStaffMember } from '../../types/settings';
export type { StaffMember } from '../../types/settings';

export interface BusinessProfile {
  id: UUID; business_id: UUID; name: string; phone: string | null;
  email: string | null; address: string | null; currency: string;
  logo_url: string | null; tax_id: string | null; receipt_footer: string | null;
}

export async function getBusinessProfile(ctx: UserContext): Promise<ApiResult<BusinessProfile>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('businesses')
      .select('*').eq('id', ctx.business_id).single();
    if (error) return fail(parseError(error));
    return ok(data as unknown as BusinessProfile);
  } catch (err) { return fail(parseError(err)); }
}

export async function saveBusinessProfile(
  ctx: UserContext,
  input: Partial<Omit<BusinessProfile, 'id' | 'business_id'>>
): Promise<ApiResult<BusinessProfile>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('businesses')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', ctx.business_id).select().single();
    if (error) return fail(parseError(error));
    return ok(data as unknown as BusinessProfile);
  } catch (err) { return fail(parseError(err)); }
}

export async function listStaff(ctx: UserContext): Promise<ApiResult<SettingsStaffMember[]>> {
  try {
    // Explicit column list (not '*'): imagecare.users also carries
    // pin_hash/pin_failed_attempts/pin_locked_until/pin_set_at (daily
    // unlock PIN - see 0020_stage7_pin_auth.sql). Those must never be
    // included in an API response, even a bcrypt hash, so they are
    // deliberately left out of this select.
    const { data, error } = await supabase.schema('imagecare').from('users')
      .select(`
        id, business_id, branch_id, auth_user_id, first_name, last_name,
        email, phone, role, is_owner, employment_type, hire_date, salary,
        salary_currency, avatar_url, is_active, last_login_at, settings,
        metadata, created_at, updated_at, deleted_at
      `)
      .eq('business_id', ctx.business_id).is('deleted_at', null).order('first_name');
    if (error) return fail(parseError(error));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mapped: SettingsStaffMember[] = ((data ?? []) as any[]).map((u: any) => ({
      ...u,
      fullName:       `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
      username:       u.email?.split('@')[0] ?? u.id,
      branchIds:      [] as string[],
      updated_at:     u.updated_at ?? new Date().toISOString(),
      created_by:     u.created_by ?? '',
      updated_by:     u.updated_by ?? '',
      sync_status:    'synced' as const,
      last_synced_at: null,
    }));
    return ok(mapped);
  } catch (err) { return fail(parseError(err)); }
}

export interface ExpenseCategory {
  id: UUID; business_id: UUID; name: string; is_active: boolean; created_at: string;
}

export async function listExpenseCategories(ctx: UserContext): Promise<ApiResult<ExpenseCategory[]>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('expense_categories')
      .select('*').eq('business_id', ctx.business_id).eq('is_active', true).order('name');
    if (error) return ok([]);
    return ok((data ?? []) as ExpenseCategory[]);
  } catch { return ok([]); }
}

export async function createExpenseCategory(ctx: UserContext, name: string): Promise<ApiResult<ExpenseCategory>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('expense_categories')
      .insert({ name, business_id: ctx.business_id, is_active: true }).select().single();
    if (error) return fail(parseError(error));
    return ok(data as ExpenseCategory);
  } catch (err) { return fail(parseError(err)); }
}
