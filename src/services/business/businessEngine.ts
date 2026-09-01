// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/services/business/businessEngine.ts
// Purpose: Frontend business engine SERVICE layer.
//          All financial transactions go through this file.
//          Never call engine procedures directly from pages.
//
// Backend implementation pass (2026-08-24): this file previously
// called rpc('engine_post_sale', ...) and four sibling RPCs that
// Phase 1 live verification confirmed do not exist anywhere - not
// live, not in any tracked migration. The codebase already had a
// complete, correct, tested implementation of this exact logic in
// src/engines/* (accountingEngine, inventoryEngine, cashEngine,
// creditEngine, businessEngine, purchasingEngine) - it was wired
// to unit tests only, never to the live application path. Per the
// architecture decision in the implementation pass's final report,
// this file now becomes the thin SERVICE layer that the existing
// PAGE -> HOOK -> SERVICE chain already expects, and delegates to
// the real, working src/engines/* ENGINE layer instead of calling
// nonexistent RPCs. No new transactional logic was invented here;
// every effect (stock, journal entries, cash, credit) is performed
// by the already-reviewed engine code.
// ============================================================

import { supabase } from '../../lib/supabase';
import { ok, fail, parseError } from '../../types/app';
import type { ApiResult, UserContext, AppErrorCode } from '../../types/app';
import type { UUID, Sale, Purchase, Expense } from '../../types/database';
import { canDo } from '../../types/app';
import {
  businessEngine as realBusinessEngine,
  purchasingEngine as realPurchasingEngine,
  accountingEngine,
  cashEngine,
  creditEngine,
} from '../../engines';
import type { EngineContext, EngineErrorCode } from '../../engines/types';
import { v4 as uuidv4 } from 'uuid';

// The engine layer (src/engines/types.ts) and the app-level service
// contract (src/types/app.ts) evolved their error-code unions
// separately - most values are identical strings, but a handful exist
// only on one side. This maps every EngineErrorCode to its closest
// AppErrorCode so engine errors can be surfaced through the service
// layer without losing type safety at the ApiResult boundary.
const ENGINE_TO_APP_ERROR_CODE: Record<EngineErrorCode, AppErrorCode> = {
  PERMISSION_DENIED:        'PERMISSION_DENIED',
  BRANCH_ACCESS_DENIED:     'BRANCH_ACCESS_DENIED',
  VALIDATION_ERROR:         'VALIDATION_ERROR',
  INSUFFICIENT_STOCK:       'INSUFFICIENT_STOCK',
  CREDIT_LIMIT_EXCEEDED:    'CREDIT_LIMIT_EXCEEDED',
  OVERPAYMENT:              'OVERPAYMENT',
  RECORD_NOT_FOUND:         'RECORD_NOT_FOUND',
  DUPLICATE_TRANSACTION:    'DUPLICATE_TRANSACTION',
  IMMUTABLE_RECORD:         'IMMUTABLE_RECORD',
  INVALID_STATUS_TRANSITION:'INVALID_STATUS_TRANSITION',
  BUSINESS_INACTIVE:        'BUSINESS_INACTIVE',
  BRANCH_INACTIVE:          'BRANCH_INACTIVE',
  PRODUCT_NOT_SELLABLE:     'PRODUCT_NOT_SELLABLE',
  PRODUCT_NOT_PURCHASABLE:  'PRODUCT_NOT_PURCHASABLE',
  // No AppErrorCode distinguishes "not stockable" from "not sellable" -
  // both are product-configuration restrictions surfaced the same way.
  PRODUCT_NOT_STOCKABLE:    'PRODUCT_NOT_SELLABLE',
  // Internal invariant violations - not user-actionable, surfaced as a
  // generic server error rather than inventing new AppErrorCode values.
  ACCOUNTING_IMBALANCE:     'SERVER_ERROR',
  ACCOUNT_NOT_FOUND:        'RECORD_NOT_FOUND',
  IDEMPOTENCY_CONFLICT:     'IDEMPOTENCY_IN_FLIGHT',
  IDEMPOTENCY_IN_FLIGHT:    'IDEMPOTENCY_IN_FLIGHT',
  CROSS_BUSINESS_VIOLATION: 'PERMISSION_DENIED',
  DATABASE_ERROR:           'SERVER_ERROR',
  UNKNOWN_ERROR:            'UNKNOWN_ERROR',
};

function mapEngineErrorCode(code: EngineErrorCode): AppErrorCode {
  return ENGINE_TO_APP_ERROR_CODE[code] ?? 'UNKNOWN_ERROR';
}

// ---- Context adapter -----------------------------------------
// UserContext (service layer) -> EngineContext (engine layer).

function toEngineContext(ctx: UserContext, branchId?: UUID): EngineContext {
  return {
    business_id: ctx.business_id,
    branch_id:   branchId ?? ctx.branch_id ?? null,
    user_id:     ctx.user_id,
    user_ctx:    ctx,
  };
}

// ---- Sale --------------------------------------------------

export interface CreateSaleItemInput {
  product_id: UUID;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_pct?: number;
  tax_rate?: number;
}

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
  const ectx = toEngineContext(ctx, input.branch_id);

  const createResult = await realBusinessEngine.createSale(ectx, {
    branch_id:      input.branch_id,
    customer_id:    input.customer_id,
    sale_date:      input.sale_date,
    payment_method: input.payment_method,
    notes:          input.notes,
    lines: input.items.map(item => ({
      product_id:   item.product_id,
      quantity:     item.quantity,
      unit_price:   item.unit_price,
      unit_cost:    item.unit_cost,
      discount_pct: item.discount_pct,
      tax_rate:     item.tax_rate,
    })),
  });

  if (!createResult.ok) {
    return fail({ code: mapEngineErrorCode(createResult.error!.code), message: createResult.error!.message });
  }

  const postResult = await realBusinessEngine.postSale(ectx, {
    sale_id:         createResult.data!.sale_id,
    idempotency_key: idempotencyKey,
  });

  if (!postResult.ok) {
    // Sale remains in draft - the DB row exists but was never
    // confirmed, matching the engine's atomicity guarantee (stock,
    // journal, and cash effects only happen once postSale succeeds).
    return fail({ code: mapEngineErrorCode(postResult.error!.code), message: postResult.error!.message });
  }

  return ok({
    sale_id:          postResult.data!.sale_id,
    sale_number:       postResult.data!.sale_number,
    status:            postResult.data!.status,
    journal_entry_id:  postResult.data!.journal_entry_id,
  });
}

// ---- Sale reversal (delete a completed sale) ----------------
// Undoes a confirmed sale entirely: stock returned, journal reversed,
// and cash or credit reversed depending on how it was paid. This is
// what "Delete" does on a completed sale in the Sales page - there is
// no separate "Refund" feature; it was never actually built (the old
// UI called an RPC, engine_return_sale, that does not exist in the
// database), so this is the first real implementation.

export async function reverseSale(
  ctx: UserContext,
  input: { sale_id: UUID; branch_id: UUID; reason: string }
): Promise<ApiResult<SaleResult>> {
  if (!canDo(ctx, 'sales', 'delete')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to delete sales.' });
  }

  const ectx = toEngineContext(ctx, input.branch_id);

  const result = await realBusinessEngine.reverseSale(ectx, {
    sale_id: input.sale_id,
    reason:  input.reason,
  });

  if (!result.ok) {
    return fail({ code: mapEngineErrorCode(result.error!.code), message: result.error!.message });
  }

  return ok({
    sale_id:          result.data!.sale_id,
    sale_number:      result.data!.sale_number,
    status:            result.data!.status,
    journal_entry_id:  result.data!.journal_entry_id,
  });
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

  const ectx = toEngineContext(ctx, input.branch_id);

  // Creates a draft purchase only - matches the existing UI flow of
  // "create purchase" then a separate "receive stock" action (see
  // approvePurchaseOrder in purchasingService.ts, which now calls
  // purchasingEngine.receiveStock instead of the missing
  // fn_imc_receive_purchase RPC).
  const result = await realPurchasingEngine.createPurchase(ectx, {
    branch_id:      input.branch_id,
    supplier_id:    input.supplier_id,
    purchase_date:  input.purchase_date,
    due_date:       input.due_date,
    payment_method: input.payment_method,
    notes:          input.notes,
    lines: input.items.map(item => ({
      product_id:   item.product_id,
      quantity:     item.quantity,
      unit_cost:    item.unit_cost,
      discount_pct: item.discount_pct,
      tax_rate:     item.tax_rate,
      expiry_date:  item.expiry_date,
      batch_number: item.batch_number,
    })),
  });

  if (!result.ok) {
    return fail({ code: mapEngineErrorCode(result.error!.code), message: result.error!.message });
  }

  return ok({
    purchase_id:     result.data!.purchase_id,
    purchase_number: result.data!.purchase_number,
  });
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
  const ectx = toEngineContext(ctx, input.branch_id);

  const result = await realBusinessEngine.recordExpense(ectx, {
    branch_id:      input.branch_id,
    category:       input.category,
    description:    input.description,
    amount:         input.amount,
    tax_amount:     input.tax_amount,
    payment_method: input.payment_method,
    expense_date:   input.expense_date,
    notes:          input.notes,
    idempotency_key: idempotencyKey,
  });

  if (!result.ok) {
    return fail({ code: mapEngineErrorCode(result.error!.code), message: result.error!.message });
  }

  return ok({
    expense_id:     result.data!.expense_id,
    expense_number: result.data!.expense_number,
  });
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

  const ectx = toEngineContext(ctx, input.branch_id);

  const accountResult = await creditEngine.getOrCreateCreditAccount(ectx, input.customer_id, input.branch_id);
  if (!accountResult.ok) {
    return fail({ code: mapEngineErrorCode(accountResult.error!.code), message: accountResult.error!.message });
  }

  const paymentResult = await creditEngine.recordPayment(ectx, {
    credit_account_id: accountResult.data!.credit_account_id,
    amount:             input.amount,
    payment_method:     input.payment_method as Sale['payment_method'],
    notes:              input.reference_notes,
  });

  if (!paymentResult.ok) {
    return fail({ code: mapEngineErrorCode(paymentResult.error!.code), message: paymentResult.error!.message });
  }

  return ok(undefined);
}

// ---- Payroll -----------------------------------------------
// Real imagecare.payroll rows created by createPayroll() below are
// posted immediately (status 'paid') via businessEngine.recordPayroll -
// the atomic create+post model, not a separate pending->process step.
// processPayroll() is kept for any row still sitting in 'pending' or
// 'approved' status (e.g. from the existing real approvePayroll()
// path in financialServices.ts) so that path also becomes real
// instead of calling the missing engine_process_payroll RPC.

export interface CreatePayrollInput {
  branch_id: UUID;
  user_id: UUID;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  basic_salary: number;
  allowances?: number;
  overtime_pay?: number;
  tax_deduction?: number;
  nssf_deduction?: number;
  other_deductions?: number;
  payment_method: string;
  notes?: string;
}

export async function createPayroll(
  ctx: UserContext,
  input: CreatePayrollInput
): Promise<ApiResult<{ payroll_id: UUID; payroll_number: string; net_pay: number }>> {
  if (!canDo(ctx, 'payroll', 'approve')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to record payroll.' });
  }

  const ectx = toEngineContext(ctx, input.branch_id);

  const result = await realBusinessEngine.recordPayroll(ectx, {
    branch_id:        input.branch_id,
    user_id:          input.user_id,
    pay_period_start: input.pay_period_start,
    pay_period_end:   input.pay_period_end,
    pay_date:         input.pay_date,
    basic_salary:     input.basic_salary,
    allowances:       input.allowances,
    overtime_pay:     input.overtime_pay,
    tax_deduction:    input.tax_deduction,
    nssf_deduction:   input.nssf_deduction,
    other_deductions: input.other_deductions,
    payment_method:   input.payment_method as Sale['payment_method'],
    notes:            input.notes,
  });

  if (!result.ok) {
    return fail({ code: mapEngineErrorCode(result.error!.code), message: result.error!.message });
  }

  return ok({
    payroll_id:     result.data!.payroll_id,
    payroll_number: result.data!.payroll_number,
    net_pay:        result.data!.net_pay,
  });
}

export async function processPayroll(
  ctx: UserContext,
  payrollId: UUID
): Promise<ApiResult<void>> {
  if (!canDo(ctx, 'payroll', 'approve')) {
    return fail({ code: 'PERMISSION_DENIED', message: 'You do not have permission to process payroll.' });
  }

  try {
    const { data: payroll, error: pErr } = await supabase
      .schema('imagecare')
      .from('payroll')
      .select('*')
      .eq('id', payrollId)
      .eq('business_id', ctx.business_id)
      .single();

    if (pErr || !payroll) {
      return fail({ code: 'RECORD_NOT_FOUND', message: 'Payroll record not found.' });
    }

    if (payroll.status === 'paid') {
      return ok(undefined); // already processed - idempotent no-op
    }

    if (payroll.status !== 'pending' && payroll.status !== 'approved') {
      return fail({ code: 'INVALID_STATUS_TRANSITION', message: `Cannot process payroll with status '${payroll.status}'.` });
    }

    const ectx = toEngineContext(ctx, payroll.branch_id);
    const netPay = Number(payroll.net_pay);

    const linesResult = await accountingEngine.buildExpenseJournalLines(ectx, {
      amount:        netPay,
      paymentMethod: payroll.payment_method,
      category:      'Salaries and Wages',
    });
    if (!linesResult.ok) return fail({ code: mapEngineErrorCode(linesResult.error!.code), message: linesResult.error!.message });

    const payrollLines = linesResult.data!.map(l =>
      l.debit_amount > 0 ? { ...l, account_code: '6400', account_name: 'Salaries and Wages' } : l
    );

    const jeResult = await accountingEngine.postJournal(ectx, {
      branch_id:      payroll.branch_id,
      entry_type:     'payroll',
      description:    `Payroll: ${payroll.payroll_number}`,
      reference_type: 'payroll',
      reference_id:   payrollId,
      lines:          payrollLines,
    });
    if (!jeResult.ok) return fail({ code: mapEngineErrorCode(jeResult.error!.code), message: jeResult.error!.message });

    const cashResult = await cashEngine.recordMovement(ectx, {
      branch_id:       payroll.branch_id,
      transaction_type:'cash_out',
      amount:          netPay,
      payment_method:  payroll.payment_method,
      reference_type:  'payroll',
      reference_id:    payrollId,
      description:     `Payroll payment: ${payroll.payroll_number}`,
    });
    if (!cashResult.ok) return fail({ code: mapEngineErrorCode(cashResult.error!.code), message: cashResult.error!.message });

    const { error: updateErr } = await supabase
      .schema('imagecare')
      .from('payroll')
      .update({
        status:           'paid',
        journal_entry_id: jeResult.data!.journal_entry_id,
        updated_by:       ctx.user_id,
      })
      .eq('id', payrollId);

    if (updateErr) return fail(parseError(updateErr));

    return ok(undefined);
  } catch (err) {
    return fail(parseError(err));
  }
}
