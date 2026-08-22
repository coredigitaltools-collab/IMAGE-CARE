// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/services/business/businessEngine.ts
// Purpose: Frontend business engine service.
//          All financial transactions go through this file.
//          Never call engine procedures directly from pages.
//          This mirrors the DB-003 Business Engine on the server.
// ============================================================

import { supabase, rpc } from '../../lib/supabase';
import { ok, fail, parseError } from '../../types/app';
import type { ApiResult, UserContext } from '../../types/app';
import type { UUID, Sale, Purchase, Expense } from '../../types/database';
import { canDo } from '../../types/app';
import { v4 as uuidv4 } from 'uuid';

// ---- Sale --------------------------------------------------

export interface CreateSaleInput {
  branch_id: UUID;
  customer_id?: UUID;
  sale_date?: string;
  payment_method: Sale['payment_method'];
  amount_paid: number;
  change_given: number;
  credit_amount: number;
  notes?: string;
  items: CreateSaleItemInput[];
}

export interface CreateSaleItemInput {
  product_id: UUID;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_pct?: number;
  tax_rate?: number;
}

export interface SaleResult {
  sale_id: UUID;
  sale_number: string;
  status: string;
  journal_entry_id: UUID | null;
}

export async function createAndPostSale(
  ctx: UserContext,
  input: CreateSaleInput
): Promise<ApiResult<SaleResult>> {
  if (!canDo(ctx, 'sales', 'create')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to create sales.' });
  }

  const idempotencyKey = uuidv4();

  try {
    // 1. Build sale header
    const saleId = uuidv4();
    const { subtotal, discountAmount, taxAmount, totalAmount } = calculateTotals(input.items);

    // 2. Insert sale header (draft)
    const { error: insertError } = await supabase
      .schema('imagecare')
      .from('sales')
      .insert({
        id:             saleId,
        business_id:    ctx.business_id,
        branch_id:      input.branch_id,
        customer_id:    input.customer_id ?? null,
        served_by:      ctx.user_id,
        sale_number:    'AUTO',    // DB trigger auto-assigns
        sale_date:      input.sale_date ?? new Date().toISOString(),
        status:         'draft',
        payment_method: input.payment_method,
        subtotal,
        discount_amount: discountAmount,
        tax_amount:      taxAmount,
        total_amount:    totalAmount,
        amount_paid:     input.amount_paid,
        change_given:    input.change_given,
        credit_amount:   input.credit_amount,
        notes:           input.notes ?? null,
      });

    if (insertError) return fail(parseError(insertError));

    // 3. Insert sale items
    const items = input.items.map(item => ({
      id:              uuidv4(),
      sale_id:         saleId,
      business_id:     ctx.business_id,
      branch_id:       input.branch_id,
      product_id:      item.product_id,
      quantity:        item.quantity,
      unit_price:      item.unit_price,
      unit_cost:       item.unit_cost,
      discount_pct:    item.discount_pct ?? 0,
      discount_amount: item.quantity * item.unit_price * (item.discount_pct ?? 0),
      tax_rate:        item.tax_rate ?? 0,
      tax_amount:      item.quantity * item.unit_price * (1 - (item.discount_pct ?? 0)) * (item.tax_rate ?? 0),
      line_total:      item.quantity * item.unit_price * (1 - (item.discount_pct ?? 0)) * (1 + (item.tax_rate ?? 0)),
    }));

    const { error: itemsError } = await supabase
      .schema('imagecare')
      .from('sale_items')
      .insert(items);

    if (itemsError) return fail(parseError(itemsError));

    // 4. Post through DB-003 Business Engine (atomic: stock + journal + cash)
    const { error: postError } = await rpc('engine_post_sale', {
      p_sale_id:         saleId,
      p_user_id:         ctx.user_id,
      p_idempotency_key: idempotencyKey,
    });

    if (postError) return fail(parseError(postError));

    // 5. Fetch confirmed sale number
    const { data: confirmed } = await supabase
      .schema('imagecare')
      .from('sales')
      .select('sale_number, status, journal_entry_id')
      .eq('id', saleId)
      .single();

    return ok({
      sale_id:          saleId,
      sale_number:      confirmed?.sale_number ?? '',
      status:           confirmed?.status ?? 'confirmed',
      journal_entry_id: confirmed?.journal_entry_id ?? null,
    });

  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Purchase ----------------------------------------------

export interface CreatePurchaseInput {
  branch_id: UUID;
  supplier_id?: UUID;
  purchase_date?: string;
  due_date?: string;
  payment_method: Purchase['payment_method'];
  amount_paid: number;
  notes?: string;
  items: CreatePurchaseItemInput[];
}

export interface CreatePurchaseItemInput {
  product_id: UUID;
  quantity: number;
  unit_cost: number;
  discount_pct?: number;
  tax_rate?: number;
  expiry_date?: string;
  batch_number?: string;
}

export async function createAndPostPurchase(
  ctx: UserContext,
  input: CreatePurchaseInput
): Promise<ApiResult<{ purchase_id: UUID; purchase_number: string }>> {
  if (!canDo(ctx, 'purchases', 'create')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to create purchases.' });
  }

  const idempotencyKey = uuidv4();

  try {
    const purchaseId = uuidv4();
    const { subtotal, discountAmount, taxAmount, totalAmount } = calculateTotals(input.items, 'cost');

    const { error: insertError } = await supabase
      .schema('imagecare')
      .from('purchases')
      .insert({
        id:                 purchaseId,
        business_id:        ctx.business_id,
        branch_id:          input.branch_id,
        supplier_id:        input.supplier_id ?? null,
        received_by:        ctx.user_id,
        purchase_number:    'AUTO',
        purchase_date:      input.purchase_date ?? new Date().toISOString(),
        due_date:           input.due_date ?? null,
        status:             'draft',
        payment_method:     input.payment_method,
        subtotal,
        discount_amount:    discountAmount,
        tax_amount:         taxAmount,
        total_amount:       totalAmount,
        amount_paid:        input.amount_paid,
        balance_due:        totalAmount - input.amount_paid,
        notes:              input.notes ?? null,
      });

    if (insertError) return fail(parseError(insertError));

    const items = input.items.map(item => ({
      id:              uuidv4(),
      purchase_id:     purchaseId,
      business_id:     ctx.business_id,
      branch_id:       input.branch_id,
      product_id:      item.product_id,
      quantity:        item.quantity,
      unit_cost:       item.unit_cost,
      discount_pct:    item.discount_pct ?? 0,
      discount_amount: item.quantity * item.unit_cost * (item.discount_pct ?? 0),
      tax_rate:        item.tax_rate ?? 0,
      tax_amount:      item.quantity * item.unit_cost * (1 - (item.discount_pct ?? 0)) * (item.tax_rate ?? 0),
      line_total:      item.quantity * item.unit_cost * (1 - (item.discount_pct ?? 0)) * (1 + (item.tax_rate ?? 0)),
      expiry_date:     item.expiry_date ?? null,
      batch_number:    item.batch_number ?? null,
    }));

    const { error: itemsError } = await supabase
      .schema('imagecare')
      .from('purchase_items')
      .insert(items);

    if (itemsError) return fail(parseError(itemsError));

    const { error: postError } = await rpc('engine_post_purchase', {
      p_purchase_id:     purchaseId,
      p_user_id:         ctx.user_id,
      p_idempotency_key: idempotencyKey,
    });

    if (postError) return fail(parseError(postError));

    const { data: confirmed } = await supabase
      .schema('imagecare')
      .from('purchases')
      .select('purchase_number')
      .eq('id', purchaseId)
      .single();

    return ok({ purchase_id: purchaseId, purchase_number: confirmed?.purchase_number ?? '' });

  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Expense -----------------------------------------------

export interface CreateExpenseInput {
  branch_id: UUID;
  expense_date?: string;
  category: string;
  description: string;
  amount: number;
  tax_amount?: number;
  payment_method: Expense['payment_method'];
  notes?: string;
}

export async function createAndPostExpense(
  ctx: UserContext,
  input: CreateExpenseInput
): Promise<ApiResult<{ expense_id: UUID; expense_number: string }>> {
  if (!canDo(ctx, 'expenses', 'create')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to record expenses.' });
  }

  const idempotencyKey = uuidv4();

  try {
    const expenseId = uuidv4();
    const taxAmount = input.tax_amount ?? 0;

    const { error: insertError } = await supabase
      .schema('imagecare')
      .from('expenses')
      .insert({
        id:              expenseId,
        business_id:     ctx.business_id,
        branch_id:       input.branch_id,
        incurred_by:     ctx.user_id,
        expense_number:  'AUTO',
        expense_date:    input.expense_date ?? new Date().toISOString(),
        category:        input.category,
        description:     input.description,
        amount:          input.amount,
        tax_amount:      taxAmount,
        total_amount:    input.amount + taxAmount,
        payment_method:  input.payment_method,
        status:          'draft',
        notes:           input.notes ?? null,
      });

    if (insertError) return fail(parseError(insertError));

    const { error: postError } = await rpc('engine_post_expense', {
      p_expense_id:      expenseId,
      p_user_id:         ctx.user_id,
      p_idempotency_key: idempotencyKey,
    });

    if (postError) return fail(parseError(postError));

    const { data: confirmed } = await supabase
      .schema('imagecare')
      .from('expenses')
      .select('expense_number')
      .eq('id', expenseId)
      .single();

    return ok({ expense_id: expenseId, expense_number: confirmed?.expense_number ?? '' });

  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Credit repayment --------------------------------------

export async function processCreditRepayment(
  ctx: UserContext,
  input: {
    branch_id: UUID;
    customer_id: UUID;
    amount: number;
    payment_method: string;
    reference_notes?: string;
  }
): Promise<ApiResult<void>> {
  if (!canDo(ctx, 'credit', 'create')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to process credit repayments.' });
  }

  try {
    const { error } = await rpc('engine_process_credit_repayment', {
      p_business_id:     ctx.business_id,
      p_branch_id:       input.branch_id,
      p_customer_id:     input.customer_id,
      p_amount:          input.amount,
      p_payment_method:  input.payment_method,
      p_user_id:         ctx.user_id,
      p_reference_notes: input.reference_notes ?? null,
      p_idempotency_key: uuidv4(),
    });

    if (error) return fail(parseError(error));
    return ok(undefined);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Payroll -----------------------------------------------

export async function processPayroll(
  ctx: UserContext,
  payrollId: UUID
): Promise<ApiResult<void>> {
  if (!canDo(ctx, 'payroll', 'approve')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to process payroll.' });
  }

  try {
    const { error } = await rpc('engine_process_payroll', {
      p_payroll_id:      payrollId,
      p_user_id:         ctx.user_id,
      p_idempotency_key: uuidv4(),
    });

    if (error) return fail(parseError(error));
    return ok(undefined);
  } catch (err) {
    return fail(parseError(err));
  }
}

// ---- Internal helpers --------------------------------------

interface TotalsInput {
  quantity: number;
  unit_price?: number;
  unit_cost?: number;
  discount_pct?: number;
  tax_rate?: number;
}

function calculateTotals(
  items: TotalsInput[],
  priceField: 'price' | 'cost' = 'price'
): { subtotal: number; discountAmount: number; taxAmount: number; totalAmount: number } {
  let subtotal = 0;
  let discountAmount = 0;
  let taxAmount = 0;

  for (const item of items) {
    const price    = priceField === 'price' ? (item.unit_price ?? 0) : (item.unit_cost ?? 0);
    const disc     = item.discount_pct ?? 0;
    const tax      = item.tax_rate ?? 0;
    const lineBase = item.quantity * price;
    const lineDisc = lineBase * disc;
    const lineNet  = lineBase - lineDisc;
    const lineTax  = lineNet * tax;

    subtotal      += lineBase;
    discountAmount += lineDisc;
    taxAmount      += lineTax;
  }

  return {
    subtotal:      Math.round(subtotal * 100) / 100,
    discountAmount: Math.round(discountAmount * 100) / 100,
    taxAmount:     Math.round(taxAmount * 100) / 100,
    totalAmount:   Math.round((subtotal - discountAmount + taxAmount) * 100) / 100,
  };
}
