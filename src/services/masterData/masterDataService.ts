// ============================================================
// IMC-BLD-002 | ImageCare ERP Database Schema Specification v1.0
// File: src/services/masterData/masterDataService.ts
// Purpose: Master data service - products, customers, suppliers,
//          categories, units. Used by all transaction modules.
//          Master data is the single source of truth.
// ============================================================

import { supabase } from '../../lib/supabase';
import { ok, fail, parseError } from '../../types/app';
import type { ApiResult, UserContext } from '../../types/app';
import type { Product, Customer, Supplier, ProductCategory, Unit, UUID } from '../../types/database';
import { canDo } from '../../types/app';
import { APP_CONSTANTS } from '../../config/env';

// ---- Products ----------------------------------------------

export interface ProductListOptions {
  branch_id?: UUID;
  category_id?: UUID;
  is_active?: boolean;
  is_sellable?: boolean;
  is_purchasable?: boolean;
  search?: string;
  cursor_date?: string;
  cursor_id?: UUID;
  limit?: number;
}

export async function listProducts(
  ctx: UserContext,
  options: ProductListOptions = {}
): Promise<ApiResult<Product[]>> {
  if (!canDo(ctx, 'inventory', 'view')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to view products.' });
  }

  try {
    let query = supabase
      .schema('imagecare')
      .from('products')
      .select(`
        *,
        product_categories(id, name),
        units(id, name, abbreviation)
      `)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(options.limit ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE);

    if (options.is_active !== undefined) query = query.eq('is_active', options.is_active);
    if (options.is_sellable !== undefined) query = query.eq('is_sellable', options.is_sellable);
    if (options.is_purchasable !== undefined) query = query.eq('is_purchasable', options.is_purchasable);
    if (options.category_id) query = query.eq('category_id', options.category_id);
    if (options.search) query = query.ilike('name', `%${options.search}%`);

    const { data, error } = await query;
    if (error) return fail(parseError(error));
    return ok((data ?? []) as Product[]);
  } catch (err) {
    return fail(parseError(err));
  }
}

export async function getProduct(
  ctx: UserContext,
  productId: UUID
): Promise<ApiResult<Product>> {
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .single();

    if (error) return fail(parseError(error));
    if (!data) return fail({ code: 'RECORD_NOT_FOUND', message: 'Product not found.' });
    return ok(data as Product);
  } catch (err) {
    return fail(parseError(err));
  }
}

export async function createProduct(
  ctx: UserContext,
  input: Omit<Product, 'id' | 'business_id' | 'created_at' | 'updated_at' | 'deleted_at'>
): Promise<ApiResult<Product>> {
  if (!canDo(ctx, 'inventory', 'create')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to create products.' });
  }

  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('products')
      .insert({ ...input, business_id: ctx.business_id })
      .select()
      .single();

    if (error) return fail(parseError(error));
    return ok(data as Product);
  } catch (err) {
    return fail(parseError(err));
  }
}

export async function updateProduct(
  ctx: UserContext,
  productId: UUID,
  updates: Partial<Omit<Product, 'id' | 'business_id' | 'created_at'>>
): Promise<ApiResult<Product>> {
  if (!canDo(ctx, 'inventory', 'edit')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to edit products.' });
  }

  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('business_id', ctx.business_id)
      .select()
      .single();

    if (error) return fail(parseError(error));
    return ok(data as Product);
  } catch (err) {
    return fail(parseError(err));
  }
}

export async function softDeleteProduct(
  ctx: UserContext,
  productId: UUID
): Promise<ApiResult<void>> {
  if (!canDo(ctx, 'inventory', 'delete')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to delete products.' });
  }

  try {
    const { error } = await supabase
      .schema('imagecare')
      .from('products')
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq('id', productId)
      .eq('business_id', ctx.business_id);

    if (error) return fail(parseError(error));
    return ok(undefined);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Product Categories ------------------------------------

export async function listCategories(
  ctx: UserContext
): Promise<ApiResult<ProductCategory[]>> {
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('product_categories')
      .select('*')
      .eq('business_id', ctx.business_id)
      .eq('is_active', true)
      .order('name');

    if (error) return fail(parseError(error));
    return ok((data ?? []) as ProductCategory[]);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Units -------------------------------------------------

export async function listUnits(
  ctx: UserContext
): Promise<ApiResult<Unit[]>> {
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('units')
      .select('*')
      .eq('business_id', ctx.business_id)
      .eq('is_active', true)
      .order('name');

    if (error) return fail(parseError(error));
    return ok((data ?? []) as Unit[]);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Customers ---------------------------------------------

export interface CustomerListOptions {
  branch_id?: UUID;
  search?: string;
  has_credit_balance?: boolean;
  is_active?: boolean;
  limit?: number;
  cursor_id?: UUID;
}

export async function listCustomers(
  ctx: UserContext,
  options: CustomerListOptions = {}
): Promise<ApiResult<Customer[]>> {
  if (!canDo(ctx, 'customers', 'view')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to view customers.' });
  }

  try {
    let query = supabase
      .schema('imagecare')
      .from('customers')
      .select('*')
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .order('name')
      .limit(options.limit ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE);

    if (options.is_active !== undefined) query = query.eq('is_active', options.is_active);
    if (options.branch_id) query = query.eq('branch_id', options.branch_id);
    if (options.has_credit_balance) query = query.gt('credit_balance', 0);
    if (options.search) query = query.ilike('name', `%${options.search}%`);

    const { data, error } = await query;
    if (error) return fail(parseError(error));
    return ok((data ?? []) as Customer[]);
  } catch (err) {
    return fail(parseError(err));
  }
}

export async function getCustomer(
  ctx: UserContext,
  customerId: UUID
): Promise<ApiResult<Customer>> {
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('customers')
      .select('*')
      .eq('id', customerId)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .single();

    if (error) return fail(parseError(error));
    if (!data) return fail({ code: 'RECORD_NOT_FOUND', message: 'Customer not found.' });
    return ok(data as Customer);
  } catch (err) {
    return fail(parseError(err));
  }
}

export async function createCustomer(
  ctx: UserContext,
  input: Omit<Customer, 'id' | 'business_id' | 'credit_balance' | 'created_at' | 'updated_at' | 'deleted_at'>
): Promise<ApiResult<Customer>> {
  if (!canDo(ctx, 'customers', 'create')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to create customers.' });
  }

  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('customers')
      .insert({ ...input, business_id: ctx.business_id, credit_balance: 0 })
      .select()
      .single();

    if (error) return fail(parseError(error));
    return ok(data as Customer);
  } catch (err) {
    return fail(parseError(err));
  }
}

export async function updateCustomer(
  ctx: UserContext,
  customerId: UUID,
  updates: Partial<Omit<Customer, 'id' | 'business_id' | 'credit_balance' | 'created_at'>>
): Promise<ApiResult<Customer>> {
  if (!canDo(ctx, 'customers', 'edit')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to edit customers.' });
  }

  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('customers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', customerId)
      .eq('business_id', ctx.business_id)
      .select()
      .single();

    if (error) return fail(parseError(error));
    return ok(data as Customer);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Suppliers ---------------------------------------------

export async function listSuppliers(
  ctx: UserContext,
  options: { search?: string; is_active?: boolean; limit?: number } = {}
): Promise<ApiResult<Supplier[]>> {
  if (!canDo(ctx, 'suppliers', 'view')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to view suppliers.' });
  }

  try {
    let query = supabase
      .schema('imagecare')
      .from('suppliers')
      .select('*')
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .order('name')
      .limit(options.limit ?? APP_CONSTANTS.DEFAULT_PAGE_SIZE);

    if (options.is_active !== undefined) query = query.eq('is_active', options.is_active);
    if (options.search) query = query.ilike('name', `%${options.search}%`);

    const { data, error } = await query;
    if (error) return fail(parseError(error));
    return ok((data ?? []) as Supplier[]);
  } catch (err) {
    return fail(parseError(err));
  }
}

export async function getSupplier(
  ctx: UserContext,
  supplierId: UUID
): Promise<ApiResult<Supplier>> {
  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('suppliers')
      .select('*')
      .eq('id', supplierId)
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null)
      .single();

    if (error) return fail(parseError(error));
    if (!data) return fail({ code: 'RECORD_NOT_FOUND', message: 'Supplier not found.' });
    return ok(data as Supplier);
  } catch (err) {
    return fail(parseError(err));
  }
}

export async function createSupplier(
  ctx: UserContext,
  input: Omit<Supplier, 'id' | 'business_id' | 'outstanding' | 'created_at' | 'updated_at' | 'deleted_at'>
): Promise<ApiResult<Supplier>> {
  if (!canDo(ctx, 'suppliers', 'create')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to create suppliers.' });
  }

  try {
    const { data, error } = await supabase
      .schema('imagecare')
      .from('suppliers')
      .insert({ ...input, business_id: ctx.business_id, outstanding: 0 })
      .select()
      .single();

    if (error) return fail(parseError(error));
    return ok(data as Supplier);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ============================================================
// Stage 5: Extended functions for supplier/customer management
// and branch management.
// ============================================================

import type { BranchRecord as SettingsBranchRecord } from '../../types/settings';
export type BranchRecord = SettingsBranchRecord;

export async function updateSupplier(
  ctx: UserContext,
  supplierId: UUID,
  input: Partial<Omit<Supplier, 'id' | 'business_id' | 'created_at' | 'updated_at' | 'deleted_at'>>
): Promise<ApiResult<Supplier>> {
  if (!canDo(ctx, 'suppliers', 'edit')) return fail({ code: 'PERMISSION_DENIED', message: 'Permission denied.' });
  try {
    const { data, error } = await supabase.schema('imagecare').from('suppliers')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', supplierId).eq('business_id', ctx.business_id).select().single();
    if (error) return fail(parseError(error));
    return ok(data as Supplier);
  } catch (err) { return fail(parseError(err)); }
}

export async function archiveSupplier(ctx: UserContext, supplierId: UUID): Promise<ApiResult<void>> {
  if (!canDo(ctx, 'suppliers', 'delete')) return fail({ code: 'PERMISSION_DENIED', message: 'Permission denied.' });
  try {
    const { error } = await supabase.schema('imagecare').from('suppliers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', supplierId).eq('business_id', ctx.business_id);
    if (error) return fail(parseError(error));
    return ok(undefined);
  } catch (err) { return fail(parseError(err)); }
}

export async function archiveCustomer(ctx: UserContext, customerId: UUID): Promise<ApiResult<void>> {
  if (!canDo(ctx, 'customers', 'delete')) return fail({ code: 'PERMISSION_DENIED', message: 'Permission denied.' });
  try {
    const { error } = await supabase.schema('imagecare').from('customers')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', customerId).eq('business_id', ctx.business_id);
    if (error) return fail(parseError(error));
    return ok(undefined);
  } catch (err) { return fail(parseError(err)); }
}

export async function reactivateCustomer(ctx: UserContext, customerId: UUID): Promise<ApiResult<void>> {
  if (!canDo(ctx, 'customers', 'edit')) return fail({ code: 'PERMISSION_DENIED', message: 'Permission denied.' });
  try {
    const { error } = await supabase.schema('imagecare').from('customers')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', customerId).eq('business_id', ctx.business_id);
    if (error) return fail(parseError(error));
    return ok(undefined);
  } catch (err) { return fail(parseError(err)); }
}

export interface CustomerNote {
  id: UUID; customer_id: UUID; business_id: UUID;
  note: string; created_by: UUID; created_at: string;
}

export async function listCustomerNotes(ctx: UserContext, customerId: UUID): Promise<ApiResult<CustomerNote[]>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('customer_notes')
      .select('*').eq('customer_id', customerId).eq('business_id', ctx.business_id)
      .order('created_at', { ascending: false });
    if (error) return ok([] as CustomerNote[]);
    return ok((data ?? []) as CustomerNote[]);
  } catch { return ok([]); }
}

export async function addCustomerNote(ctx: UserContext, customerId: UUID, note: string): Promise<ApiResult<CustomerNote>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('customer_notes')
      .insert({ customer_id: customerId, business_id: ctx.business_id, note, created_by: ctx.user_id })
      .select().single();
    if (error) return fail(parseError(error));
    return ok(data as CustomerNote);
  } catch (err) { return fail(parseError(err)); }
}

export async function findCustomerDuplicates(
  ctx: UserContext,
  input: { name?: string; phone?: string; email?: string }
): Promise<ApiResult<Customer[]>> {
  try {
    let query = supabase.schema('imagecare').from('customers').select('*')
      .eq('business_id', ctx.business_id).is('deleted_at', null);
    if (input.phone) query = query.eq('phone', input.phone);
    else if (input.email) query = query.eq('email', input.email);
    else if (input.name) query = query.ilike('name', `%${input.name}%`);
    const { data, error } = await query.limit(10);
    if (error) return ok([]);
    return ok((data ?? []) as Customer[]);
  } catch { return ok([]); }
}

export async function listBranches(ctx: UserContext): Promise<ApiResult<BranchRecord[]>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('branches')
      .select('*').eq('business_id', ctx.business_id).order('name');
    if (error) return fail(parseError(error));
    return ok((data ?? []) as unknown as BranchRecord[]);
  } catch (err) { return fail(parseError(err)); }
}

export async function createBranch(
  ctx: UserContext,
  input: { name: string; code?: string; address?: string; phone?: string }
): Promise<ApiResult<BranchRecord>> {
  try {
    // Bug fix (Phase 6, item 2): the column is `is_main_branch`, not
    // `is_main` - the previous insert silently dropped that field
    // (PostgREST ignores unknown columns) so every branch was created as
    // a non-main branch. fn_register_business() creates the business and
    // owner user but never a branch, so the first branch a business
    // creates through this path becomes its main branch.
    // `code` is NOT NULL + UNIQUE per business in the schema
    // (0001_stage1_foundation.sql) but was previously not even part of
    // this function's declared input type - the value happened to reach
    // the database anyway when called from BranchFormModal (which does
    // collect it), but any caller relying on the type signature had no
    // compile-time indication it was required. Default to a generated
    // code so this function is safe to call without one too.
    const { count, error: countError } = await supabase
      .schema('imagecare')
      .from('branches')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', ctx.business_id)
      .is('deleted_at', null);
    if (countError) return fail(parseError(countError));

    const code = input.code?.trim()
      || input.name.trim().slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') + '-' + ((count ?? 0) + 1).toString().padStart(2, '0');

    const { data, error } = await supabase.schema('imagecare').from('branches')
      .insert({
        name:           input.name,
        code,
        address:        input.address ?? null,
        phone:          input.phone ?? null,
        business_id:    ctx.business_id,
        is_active:      true,
        is_main_branch: (count ?? 0) === 0,
      })
      .select().single();
    if (error) return fail(parseError(error));
    return ok(data as unknown as BranchRecord);
  } catch (err) { return fail(parseError(err)); }
}

export async function updateBranch(
  ctx: UserContext,
  branchId: UUID,
  input: { name?: string; address?: string; phone?: string; is_active?: boolean }
): Promise<ApiResult<BranchRecord>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('branches')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', branchId).eq('business_id', ctx.business_id).select().single();
    if (error) return fail(parseError(error));
    return ok(data as unknown as BranchRecord);
  } catch (err) { return fail(parseError(err)); }
}

// ============================================================
// Stage 5 Final Pass: Category and Brand CRUD
// ============================================================

export async function createCategory(
  ctx: UserContext,
  input: { name: string; description?: string }
): Promise<ApiResult<ProductCategory>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('product_categories')
      .insert({ name: input.name, description: input.description ?? null, business_id: ctx.business_id, is_active: true })
      .select().single();
    if (error) return fail(parseError(error));
    return ok(data as ProductCategory);
  } catch (err) { return fail(parseError(err)); }
}

export async function updateCategory(
  ctx: UserContext,
  categoryId: UUID,
  input: { name?: string; description?: string }
): Promise<ApiResult<ProductCategory>> {
  try {
    const { data, error } = await supabase.schema('imagecare').from('product_categories')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', categoryId).eq('business_id', ctx.business_id).select().single();
    if (error) return fail(parseError(error));
    return ok(data as ProductCategory);
  } catch (err) { return fail(parseError(err)); }
}

export async function archiveCategory(
  ctx: UserContext,
  categoryId: UUID
): Promise<ApiResult<void>> {
  try {
    const { error } = await supabase.schema('imagecare').from('product_categories')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', categoryId).eq('business_id', ctx.business_id);
    if (error) return fail(parseError(error));
    return ok(undefined);
  } catch (err) { return fail(parseError(err)); }
}

// Brands - stored as product metadata since no dedicated brands table in Stage 4
// Use a lightweight approach: categories with a 'brand' marker or simple in-memory
// Since no brands table exists in Stage 4, brand operations are advisory-only.
// The UI shows brands from products' metadata. Real brand persistence requires Stage 6.
