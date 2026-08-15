// ============================================================
// IMC-BLD-002 | ImageCare ERP Database Schema Specification v1.0
// File: src/types/schema.ts
// Purpose: Extended TypeScript types covering all schema entities
//          defined in IMC-BLD-002. Extends the base database.ts
//          types from BLD-001 with additional detail and helpers.
// ============================================================

import type {
  UUID, Timestamptz, PaymentMethod, TransactionStatus,
  AccountType, AuditAction
} from './database';

// ---- Payment Methods (configurable) ------------------------

export interface PaymentMethodConfig {
  id: UUID;
  business_id: UUID;
  name: string;
  code: string;        // 'cash', 'mobile_money', 'bank_transfer', etc.
  is_active: boolean;
  requires_reference: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

// ---- Chart of Accounts -------------------------------------

export interface Account {
  id: UUID;
  business_id: UUID;
  code: string;          // e.g. '1100', '4000'
  name: string;
  account_type: AccountType;
  parent_id: UUID | null;
  is_active: boolean;
  is_system: boolean;    // system accounts cannot be deleted
  description: string | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

// ---- Expense Categories ------------------------------------

export interface ExpenseCategory {
  id: UUID;
  business_id: UUID;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

// ---- Sale Payments -----------------------------------------

export interface SalePayment {
  id: UUID;
  sale_id: UUID;
  business_id: UUID;
  branch_id: UUID;
  payment_method: PaymentMethod;
  amount: number;
  reference: string | null;     // mobile money ref, bank ref, etc.
  payment_date: Timestamptz;
  notes: string | null;
  created_at: Timestamptz;
  created_by: UUID | null;
}

// ---- Purchase Payments -------------------------------------

export interface PurchasePayment {
  id: UUID;
  purchase_id: UUID;
  business_id: UUID;
  branch_id: UUID;
  supplier_id: UUID | null;
  payment_method: PaymentMethod;
  amount: number;
  reference: string | null;
  payment_date: Timestamptz;
  notes: string | null;
  created_at: Timestamptz;
  created_by: UUID | null;
}

// ---- Credit Accounts and Transactions ----------------------

export interface CreditAccount {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  customer_id: UUID | null;
  supplier_id: UUID | null;
  credit_limit: number;
  current_balance: number;
  due_date: Timestamptz | null;
  is_active: boolean;
  notes: string | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export type CreditTransactionType =
  | 'credit_sale'
  | 'repayment'
  | 'adjustment_credit'
  | 'adjustment_debit'
  | 'reversal';

export interface CreditTransaction {
  id: UUID;
  credit_account_id: UUID;
  business_id: UUID;
  branch_id: UUID;
  customer_id: UUID | null;
  transaction_type: CreditTransactionType;
  amount: number;
  reference_type: string | null;   // 'sale', 'payment', 'adjustment'
  reference_id: UUID | null;
  description: string;
  balance_after: number;
  created_at: Timestamptz;
  created_by: UUID | null;
}

// ---- Invoice Payments --------------------------------------

export interface InvoicePayment {
  id: UUID;
  invoice_id: UUID;
  business_id: UUID;
  payment_method: PaymentMethod;
  amount: number;
  reference: string | null;
  payment_date: Timestamptz;
  notes: string | null;
  created_at: Timestamptz;
  created_by: UUID | null;
}

// ---- Bill Payments -----------------------------------------

export interface BillPayment {
  id: UUID;
  bill_id: UUID;
  business_id: UUID;
  payment_method: PaymentMethod;
  amount: number;
  reference: string | null;
  payment_date: Timestamptz;
  notes: string | null;
  created_at: Timestamptz;
  created_by: UUID | null;
}

// ---- Payroll Periods and Records ---------------------------

export interface PayrollPeriod {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: 'open' | 'processing' | 'closed' | 'cancelled';
  employee_count: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  notes: string | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  created_by: UUID | null;
}

export interface PayrollComponent {
  id: UUID;
  payroll_id: UUID;
  business_id: UUID;
  component_type: 'earning' | 'deduction';
  name: string;            // 'Basic Salary', 'PAYE', 'NSSF', 'Allowance', etc.
  amount: number;
  is_taxable: boolean;
  created_at: Timestamptz;
}

// ---- Cash Accounts -----------------------------------------

export interface CashAccount {
  id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  name: string;            // 'Main Till', 'Petty Cash', 'Float'
  account_type: 'till' | 'petty_cash' | 'float' | 'safe';
  currency: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  notes: string | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

// ---- Bank Accounts -----------------------------------------

export interface BankAccount {
  id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  bank_name: string;
  account_name: string;
  account_number: string;
  account_type: 'current' | 'savings' | 'mobile_money';
  currency: string;
  opening_balance: number;
  current_balance: number;
  is_active: boolean;
  notes: string | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

// ---- Bank Transactions -------------------------------------

export interface BankTransaction {
  id: UUID;
  bank_account_id: UUID;
  business_id: UUID;
  branch_id: UUID;
  transaction_number: string;
  transaction_date: Timestamptz;
  transaction_type: 'deposit' | 'withdrawal' | 'transfer_in' | 'transfer_out' | 'charge' | 'interest';
  amount: number;
  reference: string | null;
  description: string;
  reference_type: string | null;
  reference_id: UUID | null;
  status: TransactionStatus;
  reconciled: boolean;
  reconciliation_id: UUID | null;
  journal_entry_id: UUID | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
  created_by: UUID | null;
}

// ---- Bank Reconciliation -----------------------------------

export interface Reconciliation {
  id: UUID;
  bank_account_id: UUID;
  business_id: UUID;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number;
  statement_balance: number;
  difference: number;
  status: 'in_progress' | 'completed' | 'discarded';
  notes: string | null;
  reconciled_by: UUID | null;
  reconciled_at: Timestamptz | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

// ---- Stock Adjustments -------------------------------------

export interface StockAdjustment {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  adjustment_number: string;
  adjustment_date: Timestamptz;
  reason: string;
  status: 'draft' | 'approved' | 'cancelled';
  notes: string | null;
  approved_by: UUID | null;
  approved_at: Timestamptz | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  created_by: UUID | null;
}

export interface StockAdjustmentItem {
  id: UUID;
  adjustment_id: UUID;
  business_id: UUID;
  product_id: UUID;
  quantity_before: number;
  quantity_after: number;
  quantity_change: number;    // positive = in, negative = out
  unit_cost: number;
  reason: string | null;
  created_at: Timestamptz;
}

// ---- Inventory Balances (optimized projection) -------------

export interface InventoryBalance {
  business_id: UUID;
  branch_id: UUID;
  product_id: UUID;
  quantity_on_hand: number;
  quantity_reserved: number;   // reserved for pending orders
  quantity_available: number;  // on_hand - reserved
  average_cost: number;
  total_value: number;
  last_movement_at: Timestamptz | null;
  updated_at: Timestamptz;
}

// ---- File Objects ------------------------------------------

export interface FileObject {
  id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  uploaded_by: UUID | null;
  bucket_name: string;
  storage_path: string;
  entity_type: string;
  entity_id: UUID | null;
  original_name: string;
  file_extension: string;
  mime_type: string;
  file_size: number;
  checksum: string | null;
  category: string;
  is_public: boolean;
  public_url: string | null;
  is_active: boolean;
  expires_at: Timestamptz | null;
  deleted_at: Timestamptz | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

// ---- Business Settings -------------------------------------

export interface BusinessSetting {
  id: UUID;
  business_id: UUID;
  branch_id: UUID | null;   // null = global for business
  category: string;
  key: string;
  value: unknown;
  description: string | null;
  is_system: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

// ---- Sync Devices ------------------------------------------

export interface SyncDevice {
  id: UUID;
  business_id: UUID;
  user_id: UUID;
  device_id: string;
  device_name: string | null;
  device_type: 'mobile' | 'desktop' | 'tablet' | null;
  platform: string | null;
  app_version: string | null;
  last_seen_at: Timestamptz | null;
  last_push_at: Timestamptz | null;
  last_pull_at: Timestamptz | null;
  pull_cursor: number;
  push_cursor: number;
  is_active: boolean;
  registered_at: Timestamptz;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

export interface SyncConflict {
  id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  user_id: UUID | null;
  device_id: string | null;
  queue_entry_id: UUID | null;
  entity_type: string;
  entity_id: UUID;
  conflict_type: string;
  client_version: number | null;
  server_version: number | null;
  client_payload: Record<string, unknown>;
  server_state: Record<string, unknown> | null;
  resolution: 'accept_client' | 'accept_server' | 'manual' | 'discarded' | null;
  resolved_by: UUID | null;
  resolved_at: Timestamptz | null;
  resolution_notes: string | null;
  status: 'pending' | 'resolved' | 'discarded';
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

// ---- Audit Logs --------------------------------------------

export interface AuditLog {
  id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  user_id: UUID | null;
  table_name: string;
  record_id: UUID;
  action: AuditAction;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_fields: string[] | null;
  ip_address: string | null;
  user_agent: string | null;
  session_id: string | null;
  created_at: Timestamptz;
}

// ---- Sale Returns ------------------------------------------

export interface SaleReturn {
  id: UUID;
  sale_id: UUID;
  business_id: UUID;
  branch_id: UUID;
  return_number: string;
  return_date: Timestamptz;
  reason: string;
  status: 'pending' | 'approved' | 'cancelled';
  total_amount: number;
  refund_method: PaymentMethod | null;
  notes: string | null;
  approved_by: UUID | null;
  approved_at: Timestamptz | null;
  journal_entry_id: UUID | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  created_by: UUID | null;
}

export interface SaleReturnItem {
  id: UUID;
  return_id: UUID;
  sale_item_id: UUID;
  product_id: UUID;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  line_total: number;
  restock: boolean;       // whether to return to inventory
  created_at: Timestamptz;
}

// ---- Type guard helpers ------------------------------------

export function isConfirmedSale(status: string): boolean {
  return status === 'confirmed';
}

export function isPostedJournal(status: string): boolean {
  return status === 'posted';
}

export function isLowStock(quantity: number, reorderLevel: number): boolean {
  return quantity > 0 && quantity <= reorderLevel;
}

export function isOutOfStock(quantity: number): boolean {
  return quantity <= 0;
}
