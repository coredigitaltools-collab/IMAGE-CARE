// ============================================================
// ImageCare ERP - Stage 3 Engine Types
// File: src/engines/types.ts
// Purpose: Shared types for all Stage 3 engines.
//   Commands, results, context, and error discrimination.
//   Engines return EngineResult<T> - never throw to callers.
// ============================================================

import type { UUID, PaymentMethod, MovementType } from '../types/database';
import type { UserContext } from '../types/app';

// ---- Engine Result -----------------------------------------

export interface EngineResult<T = void> {
  ok:    boolean;
  data:  T | null;
  error: EngineError | null;
}

export function engineOk<T>(data: T): EngineResult<T> {
  return { ok: true, data, error: null };
}

export function engineFail<T = void>(error: EngineError): EngineResult<T> {
  return { ok: false, data: null, error };
}

// ---- Engine Error ------------------------------------------

export type EngineErrorCode =
  | 'PERMISSION_DENIED'
  | 'BRANCH_ACCESS_DENIED'
  | 'VALIDATION_ERROR'
  | 'INSUFFICIENT_STOCK'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'OVERPAYMENT'
  | 'RECORD_NOT_FOUND'
  | 'DUPLICATE_TRANSACTION'
  | 'IMMUTABLE_RECORD'
  | 'INVALID_STATUS_TRANSITION'
  | 'BUSINESS_INACTIVE'
  | 'BRANCH_INACTIVE'
  | 'PRODUCT_NOT_SELLABLE'
  | 'PRODUCT_NOT_PURCHASABLE'
  | 'PRODUCT_NOT_STOCKABLE'
  | 'ACCOUNTING_IMBALANCE'
  | 'ACCOUNT_NOT_FOUND'
  | 'IDEMPOTENCY_CONFLICT'
  | 'IDEMPOTENCY_IN_FLIGHT'
  | 'CROSS_BUSINESS_VIOLATION'
  | 'DATABASE_ERROR'
  | 'UNKNOWN_ERROR';

export interface EngineError {
  code:    EngineErrorCode;
  message: string;
  detail?: string;
  field?:  string;
}

export function makeError(
  code: EngineErrorCode,
  message: string,
  detail?: string,
  field?: string,
): EngineError {
  return { code, message, detail, field };
}

// ---- Engine Context ----------------------------------------
// Every engine operation receives this context.
// business_id and user_id are trusted only from auth session.

export interface EngineContext {
  business_id: UUID;
  branch_id:   UUID | null;
  user_id:     UUID;
  user_ctx:    UserContext;
}

// ---- Sale Commands -----------------------------------------

export interface SaleLineInput {
  product_id:      UUID;
  quantity:        number;
  unit_price:      number;
  unit_cost:       number;
  discount_pct?:   number;
  tax_rate?:       number;
}

export interface CreateSaleCommand {
  branch_id:         UUID;
  customer_id?:      UUID;
  payment_method:    PaymentMethod;
  sale_date?:        string;
  lines:             SaleLineInput[];
  idempotency_key?:  string;
  notes?:            string;
}

export interface PostSaleCommand {
  sale_id:           UUID;
  idempotency_key?:  string;
}

export interface SaleResult {
  sale_id:        UUID;
  sale_number:    string;
  total_amount:   number;
  status:         string;
  journal_entry_id: UUID | null;
}

// ---- Purchase Commands -------------------------------------

export interface PurchaseLineInput {
  product_id:    UUID;
  quantity:      number;
  unit_cost:     number;
  discount_pct?: number;
  tax_rate?:     number;
  expiry_date?:  string;
  batch_number?: string;
}

export interface CreatePurchaseCommand {
  branch_id:        UUID;
  supplier_id?:     UUID;
  payment_method:   PaymentMethod;
  purchase_date?:   string;
  due_date?:        string;
  lines:            PurchaseLineInput[];
  idempotency_key?: string;
  notes?:           string;
}

export interface ReceiveStockCommand {
  purchase_id:      UUID;
  idempotency_key?: string;
}

export interface PurchaseResult {
  purchase_id:      UUID;
  purchase_number:  string;
  total_amount:     number;
  status:           string;
  journal_entry_id: UUID | null;
}

// ---- Inventory Commands ------------------------------------

export interface InventoryMovementCommand {
  branch_id:        UUID;
  product_id:       UUID;
  movement_type:    MovementType;
  quantity:         number;
  unit_cost:        number;
  reference_type?:  string;
  reference_id?:    UUID;
  from_branch_id?:  UUID;
  to_branch_id?:    UUID;
  expiry_date?:     string;
  batch_number?:    string;
  notes?:           string;
  idempotency_key?: string;
}

export interface TransferStockCommand {
  from_branch_id:   UUID;
  to_branch_id:     UUID;
  product_id:       UUID;
  quantity:         number;
  unit_cost:        number;
  reference_type?:  string;
  reference_id?:    UUID;
  idempotency_key?: string;
  notes?:           string;
}

export interface StockAvailability {
  product_id:       UUID;
  branch_id:        UUID;
  quantity_on_hand: number;
  stock_value:      number;
  stock_status:     'in_stock' | 'low_stock' | 'out_of_stock';
  reorder_level:    number;
}

// ---- Accounting Commands -----------------------------------

export interface JournalLineInput {
  account_code:  string;
  account_name:  string;
  account_type:  'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  account_id?:   UUID;
  debit_amount:  number;
  credit_amount: number;
  description?:  string;
}

export interface PostJournalCommand {
  branch_id:        UUID;
  entry_type:       string;
  description:      string;
  reference_type:   string;
  reference_id:     UUID;
  entry_date?:      string;
  lines:            JournalLineInput[];
  idempotency_key?: string;
}

export interface JournalResult {
  journal_entry_id: UUID;
  entry_number:     string;
  total_debit:      number;
  total_credit:     number;
  status:           string;
}

// ---- Cash Commands -----------------------------------------

export interface RecordCashMovementCommand {
  branch_id:         UUID;
  transaction_type:  'cash_in' | 'cash_out' | 'deposit' | 'withdrawal' | 'transfer';
  amount:            number;
  payment_method:    PaymentMethod;
  reference_type?:   string;
  reference_id?:     UUID;
  description:       string;
  bank_account_id?:  UUID;
  idempotency_key?:  string;
  notes?:            string;
}

export interface CashMovementResult {
  transaction_id:     UUID;
  transaction_number: string;
  amount:             number;
  transaction_type:   string;
}

// ---- Credit Commands ---------------------------------------

export interface CreateCreditChargeCommand {
  credit_account_id: UUID;
  sale_id?:          UUID;
  amount:            number;
  idempotency_key?:  string;
  notes?:            string;
}

export interface RecordCreditPaymentCommand {
  credit_account_id: UUID;
  amount:            number;
  payment_method:    PaymentMethod;
  reference_number?: string;
  idempotency_key?:  string;
  notes?:            string;
}

export interface CreditResult {
  transaction_id:    UUID;
  credit_account_id: UUID;
  amount:            number;
  new_balance:       number;
  transaction_type:  string;
}

// ---- Expense Commands --------------------------------------

export interface RecordExpenseCommand {
  branch_id:        UUID;
  category:         string;
  description:      string;
  amount:           number;
  tax_amount?:      number;
  payment_method:   PaymentMethod;
  expense_date?:    string;
  is_recurring?:    boolean;
  idempotency_key?: string;
  notes?:           string;
}

export interface ExpenseResult {
  expense_id:      UUID;
  expense_number:  string;
  total_amount:    number;
  status:          string;
  journal_entry_id: UUID | null;
}

// ---- Reporting Types ---------------------------------------

export interface KpiSummary {
  revenue:              number;
  cogs:                 number;
  gross_profit:         number;
  expenses:             number;
  net_profit:           number;
  cash_in_hand:         number;
  outstanding_credit:   number;
  sale_count:           number;
}

export interface StockAlert {
  product_id:       UUID;
  product_name:     string;
  sku:              string | null;
  branch_id:        UUID;
  quantity_on_hand: number;
  reorder_level:    number;
  stock_status:     string;
}

export interface ReportingPeriod {
  from_date: string;
  to_date:   string;
}

// ---- Audit Types -------------------------------------------

export interface AuditEvent {
  table_name:     string;
  record_id:      UUID;
  action:         'insert' | 'update' | 'delete' | 'restore';
  previous_value?: Record<string, unknown>;
  new_value?:      Record<string, unknown>;
  changed_fields?: string[];
}
