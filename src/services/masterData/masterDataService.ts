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
