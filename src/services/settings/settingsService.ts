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

import type { StaffMember as SettingsStaffMember, StaffInput } from '../../types/settings';
export type { StaffMember } from '../../types/settings';

export interface BusinessProfile {
  id: UUID; business_id: UUID; name: string; phone: string | null;
  email: string | null; address: string | null; currency: string;
  logo_url: string | null; tax_id: string | null; receipt_footer: string | null;
}

// Bug fix (Settings save-button audit 2026-09-03): this used to select('*')
// and hand the raw imagecare.businesses row straight to the UI, and
// saveBusinessProfile() below used to write {name, email, phone, address,
// currency} straight back - but the real columns are name, contact_email,
// contact_phone, currency, and a JSONB address, not email/phone/address(text).
// PostgREST rejects an update referencing unknown columns outright, which is
// why "Save changes" on Business Profile always failed. Same field-mapping
// bug class as masterDataService.ts's toCustomerRow()/toSupplierRow().
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function readBusinessAddress(address: any): string {
  if (typeof address === 'string') return address;
  if (!address || typeof address !== 'object') return '';
  if (typeof address.raw === 'string') return address.raw;
  return Object.keys(address).length > 0 ? JSON.stringify(address) : '';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBusinessProfileRow(row: any): BusinessProfile {
  return {
    id: row.id,
    business_id: row.id, // businesses.id IS the business_id everywhere else in the app
    name: row.name ?? '',
    phone: row.contact_phone ?? null,
    email: row.contact_email ?? null,
    address: readBusinessAddress(row.address),
    currency: row.currency ?? 'UGX',
    logo_url: row.logo_url ?? null,
    tax_id: row.tax_id ?? null,
    // No receipt_footer column exists on imagecare.businesses, and no page
    // reads BusinessProfile.receipt_footer (receipt footer text actually
    // lives in the separate 'receipt' settings category) - reported
    // honestly as null rather than invented.
    receipt_footer: null,
  };
}

export async function getBusinessProfile(ctx: UserContext): Promise<ApiResult<BusinessProfile>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('businesses')
      .select('*').eq('id', ctx.business_id).single();
    if (error) return fail(parseError(error));
    return ok(mapBusinessProfileRow(data));
  } catch (err) { return fail(parseError(err)); }
}

export async function saveBusinessProfile(
  ctx: UserContext,
  input: Partial<Omit<BusinessProfile, 'id' | 'business_id'>>
): Promise<ApiResult<BusinessProfile>> {
  try {
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) row.name = input.name;
    if (input.email !== undefined) row.contact_email = input.email || null;
    if (input.phone !== undefined) row.contact_phone = input.phone || null;
    if (input.address !== undefined) row.address = input.address ? { raw: input.address } : null;
    if (input.currency !== undefined) row.currency = input.currency;
    if (input.logo_url !== undefined) row.logo_url = input.logo_url;
    if (input.tax_id !== undefined) row.tax_id = input.tax_id;

    const { data, error } = await supabase.schema('imagecare').from('businesses')
      .update(row)
      .eq('id', ctx.business_id).select().single();
    if (error) return fail(parseError(error));
    return ok(mapBusinessProfileRow(data));
  } catch (err) { return fail(parseError(err)); }
}

// Explicit column list (not '*'): imagecare.users also carries
// pin_hash/pin_failed_attempts/pin_locked_until/pin_set_at (daily unlock
// PIN - see 0020_stage7_pin_auth.sql). Those must never be included in an
// API response, even a bcrypt hash, so they are deliberately left out.
const STAFF_COLUMNS = `
  id, business_id, branch_id, auth_user_id, first_name, last_name,
  email, phone, role, is_owner, employment_type, hire_date, salary,
  salary_currency, avatar_url, is_active, last_login_at, settings,
  metadata, created_at, updated_at, deleted_at
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStaffRow(u: any): SettingsStaffMember {
  return {
    ...u,
    fullName:       `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim(),
    username:       u.email?.split('@')[0] ?? u.id,
    // users.branch_id is a single column (one branch per staff member) -
    // the Edit Staff form's multi-select checkboxes can only ever reflect
    // that one real assignment. This used to be hardcoded to [] regardless
    // of the real value, so "Assigned branches" always rendered with
    // nothing checked even for staff who do have a branch_id set.
    branchIds:      u.branch_id ? [u.branch_id as string] : [],
    updated_at:     u.updated_at ?? new Date().toISOString(),
    created_by:     u.created_by ?? '',
    updated_by:     u.updated_by ?? '',
    sync_status:    'synced' as const,
    last_synced_at: null,
  };
}

export async function listStaff(ctx: UserContext): Promise<ApiResult<SettingsStaffMember[]>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('users')
      .select(STAFF_COLUMNS)
      .eq('business_id', ctx.business_id).is('deleted_at', null).order('first_name');
    if (error) return fail(parseError(error));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ok(((data ?? []) as any[]).map(mapStaffRow));
  } catch (err) { return fail(parseError(err)); }
}

// Bug fix (Settings save-button audit 2026-09-03): Edit/Disable/Reactivate
// staff used to be identity-function mocks in
// src/features/settings/hooks/useSettingsData.ts - `async (input) => ({
// ...input, id: crypto.randomUUID() })` - which always reported success but
// never wrote to Supabase. A refresh silently discarded every change. These
// write to the same real imagecare.users table listStaff() reads from.
// (Create Staff and Reset Password are intentionally left as-is: those
// need the Supabase Auth Admin API - a service-role key - to create a login
// or set a password, which can't safely run from browser code.)
//
// These throw directly rather than returning ApiResult, matching how
// createRoleReal()/archiveRoleReal() (src/services/roleService.ts) are
// already called from this same page (PeopleAccessPage.tsx): the ApiResult
// + unwrap() pattern used elsewhere in this file re-wraps every failure as
// a plain Error, which would swallow LastActiveOwnerError's identity before
// the page's `err instanceof LastActiveOwnerError` check ever saw it.
export async function updateStaffMember(
  ctx: UserContext,
  id: UUID,
  input: { fullName?: string; email?: string; role?: string; branchIds?: string[] }
): Promise<SettingsStaffMember> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.fullName !== undefined) {
    const trimmed = input.fullName.trim();
    const spaceIdx = trimmed.indexOf(' ');
    row.first_name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    row.last_name = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim();
  }
  if (input.email !== undefined) row.email = input.email;
  if (input.role !== undefined) row.role = input.role;
  if (input.branchIds !== undefined) row.branch_id = input.branchIds[0] ?? null;

  const { data, error } = await supabase.schema('imagecare').from('users')
    .update(row).eq('id', id).eq('business_id', ctx.business_id)
    .select(STAFF_COLUMNS).single();
  if (error) throw new Error(parseError(error).message ?? 'Failed to update staff member.');
  return mapStaffRow(data);
}

export class DuplicateStaffEmailError extends Error {
  constructor(email: string) {
    super(`A staff member with the email "${email}" already exists.`);
    this.name = 'DuplicateStaffEmailError';
  }
}

// Bug fix (2026-09-04): "Add staff" always showed "Staff member added."
// and reset the form, but never wrote anything to the database -
// useCreateStaff() in useSettingsData.ts was a pure mock (`async (input) =>
// ({ ...input, id: crypto.randomUUID() })`) - see the comment there for why
// it was left that way (creating a real login needs the Auth Admin API,
// which needs the service-role key, which must never run in browser code).
// That gap is why staff added here never showed up anywhere real, including
// the "Add employee to payroll" dropdown, which reads this same real table.
//
// This calls the `create-staff` Edge Function (server-side, uses the
// service-role key there, never in the browser) to create the Supabase
// Auth login AND the imagecare.users row together. Returns a one-time
// temporary password for the owner to relay to the new staff member.
export async function createStaffMember(
  ctx: UserContext,
  input: StaffInput
): Promise<{ staff: SettingsStaffMember; temporaryPassword: string }> {
  const { data, error } = await supabase.functions.invoke('create-staff', {
    body: {
      fullName: input.fullName,
      email: input.email,
      role: input.role,
      branchId: input.branchIds[0] ?? null,
    },
  });

  // supabase-js only sets `error` for a network failure or a non-2xx HTTP
  // status - on a non-2xx status `data` is left null and the function's
  // real JSON body (with the actual message) has to be read back off
  // error.context (the raw Response). Bug fix (2026-09-04): this used to
  // fall all the way through to a single generic "Could not add this staff
  // member." whenever that JSON body wasn't readable (e.g. a pure network/
  // CORS failure, where error.context isn't a parseable Response at all) -
  // which is exactly what happened on the owner's first live attempt: the
  // request never even reached Supabase (confirmed via the project's edge
  // function logs - only a CORS preflight was ever recorded, no actual
  // POST), so there was never a JSON body to read, and the real reason
  // (a network/CORS-level failure) was masked behind a message that gave
  // no hint anything besides "add staff" itself had gone wrong. Falling
  // back to error.message (which supabase-js sets to something concrete,
  // e.g. "Failed to send a request to the Edge Function") surfaces that
  // real reason instead, so the next failure is actually diagnosable from
  // what the owner sees on screen.
  if (error || !data?.success) {
    let message: string | undefined = data?.message;
    if (!message && error && typeof error === 'object' && 'context' in error) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const context = (error as any).context;
      message = await context?.json?.().then((b: { message?: string }) => b?.message).catch(() => undefined);
    }
    if (!message && error instanceof Error && error.message) {
      message = `Could not reach the server (${error.message}). Check your internet connection and try again.`;
    }
    if (message && /already exists/i.test(message)) {
      throw new DuplicateStaffEmailError(input.email);
    }
    throw new Error(message ?? 'Could not add this staff member.');
  }

  return {
    staff: mapStaffRow(data.staff),
    temporaryPassword: data.temporaryPassword as string,
  };
}

export async function setStaffActive(
  ctx: UserContext, id: UUID, isActive: boolean
): Promise<SettingsStaffMember> {
  // Business rule (IMP-002, mirrored from the prior local implementation in
  // src/services/staffService.ts): never disable the last active Owner.
  if (!isActive) {
    const { data: target, error: targetErr } = await supabase.schema('imagecare').from('users')
      .select('is_owner').eq('id', id).eq('business_id', ctx.business_id).maybeSingle();
    if (targetErr) throw new Error(parseError(targetErr).message ?? 'Failed to check owner status.');
    if (target?.is_owner) {
      const { count, error: countErr } = await supabase.schema('imagecare').from('users')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', ctx.business_id).eq('is_owner', true).eq('is_active', true)
        .is('deleted_at', null).neq('id', id);
      if (countErr) throw new Error(parseError(countErr).message ?? 'Failed to check active owners.');
      if (!count) {
        const { LastActiveOwnerError } = await import('../staffService');
        throw new LastActiveOwnerError();
      }
    }
  }

  const { data, error } = await supabase.schema('imagecare').from('users')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', id).eq('business_id', ctx.business_id)
    .select(STAFF_COLUMNS).single();
  if (error) throw new Error(parseError(error).message ?? 'Failed to update staff status.');
  return mapStaffRow(data);
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
