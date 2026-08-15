// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/types/database.ts
// Purpose: TypeScript types for all imagecare schema tables.
//          These mirror the PostgreSQL schema from IMC-DB-001
//          through IMC-DB-008. Keep in sync with schema changes.
// ============================================================

export type UUID = string;
export type Timestamptz = string;

// ---- Enums (match imagecare schema enums) -------------------

export type MovementType =
  | 'purchase' | 'sale' | 'adjustment_in' | 'adjustment_out'
  | 'transfer_in' | 'transfer_out' | 'return_in' | 'return_out'
  | 'opening_stock' | 'damage' | 'expiry';

export type JournalEntryType =
  | 'sale' | 'purchase' | 'payroll' | 'expense' | 'credit_payment'
  | 'bank_deposit' | 'bank_withdrawal' | 'adjustment'
  | 'opening_balance' | 'transfer';

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type TransactionStatus = 'draft' | 'confirmed' | 'cancelled' | 'voided';

export type PaymentMethod =
  | 'cash' | 'mobile_money' | 'bank_transfer' | 'card' | 'credit' | 'cheque';

export type SyncStatus = 'pending' | 'synced' | 'conflict' | 'failed';

export type AuditAction = 'insert' | 'update' | 'delete' | 'restore';

export type Gender = 'male' | 'female' | 'other' | 'prefer_not_to_say';

// ---- Master Data --------------------------------------------

export interface Business {
  id: UUID;
  name: string;
  trading_name: string | null;
  registration_number: string | null;
  tax_id: string | null;
  industry: string | null;
  country: string;
  currency: string;
  timezone: string;
  logo_url: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  address: Record<string, unknown> | null;
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface Branch {
  id: UUID;
  business_id: UUID;
  name: string;
  code: string;
  branch_type: string;
  phone: string | null;
  email: string | null;
  address: Record<string, unknown> | null;
  is_main_branch: boolean;
  is_active: boolean;
  settings: Record<string, unknown>;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface User {
  id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  auth_user_id: UUID | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  gender: Gender | null;
  role: string;
  employment_type: string | null;
  hire_date: string | null;
  salary: number | null;
  salary_currency: string;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: Timestamptz | null;
  settings: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface PermissionGroup {
  id: UUID;
  business_id: UUID;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface GroupPermission {
  id: UUID;
  business_id: UUID;
  permission_group_id: UUID;
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
  can_sync: boolean;
  branch_scope: 'assigned' | 'all';
  extra: Record<string, unknown>;
}

export interface Customer {
  id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
  address: Record<string, unknown> | null;
  tin: string | null;
  credit_limit: number;
  credit_balance: number;
  notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface Supplier {
  id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  name: string;
  code: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: Record<string, unknown> | null;
  tin: string | null;
  payment_terms: number;
  credit_limit: number;
  outstanding: number;
  notes: string | null;
  tags: string[] | null;
  is_active: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface ProductCategory {
  id: UUID;
  business_id: UUID;
  parent_id: UUID | null;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

export interface Unit {
  id: UUID;
  business_id: UUID;
  name: string;
  abbreviation: string;
  is_active: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

export interface Product {
  id: UUID;
  business_id: UUID;
  category_id: UUID | null;
  unit_id: UUID | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  image_url: string | null;
  selling_price: number;
  cost_price: number;
  reorder_level: number;
  is_stockable: boolean;
  is_sellable: boolean;
  is_purchasable: boolean;
  track_expiry: boolean;
  tax_rate: number;
  metadata: Record<string, unknown>;
  is_active: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

// ---- Transactions -------------------------------------------

export interface Sale {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  customer_id: UUID | null;
  served_by: UUID | null;
  sale_number: string;
  sale_date: Timestamptz;
  status: TransactionStatus;
  payment_method: PaymentMethod;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  change_given: number;
  credit_amount: number;
  notes: string | null;
  receipt_url: string | null;
  metadata: Record<string, unknown>;
  journal_entry_id: UUID | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface SaleItem {
  id: UUID;
  sale_id: UUID;
  business_id: UUID;
  branch_id: UUID;
  product_id: UUID;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  discount_pct: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  notes: string | null;
  created_at: Timestamptz;
}

export interface Purchase {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  supplier_id: UUID | null;
  received_by: UUID | null;
  purchase_number: string;
  supplier_invoice_no: string | null;
  purchase_date: Timestamptz;
  due_date: Timestamptz | null;
  status: TransactionStatus;
  payment_method: PaymentMethod;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  notes: string | null;
  metadata: Record<string, unknown>;
  journal_entry_id: UUID | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface PurchaseItem {
  id: UUID;
  purchase_id: UUID;
  business_id: UUID;
  branch_id: UUID;
  product_id: UUID;
  quantity: number;
  unit_cost: number;
  discount_pct: number;
  discount_amount: number;
  tax_rate: number;
  tax_amount: number;
  line_total: number;
  expiry_date: string | null;
  batch_number: string | null;
  notes: string | null;
  created_at: Timestamptz;
}

export interface Expense {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  incurred_by: UUID | null;
  expense_number: string;
  expense_date: Timestamptz;
  category: string;
  description: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  payment_method: PaymentMethod;
  receipt_url: string | null;
  is_recurring: boolean;
  recurrence_rule: Record<string, unknown> | null;
  status: TransactionStatus;
  notes: string | null;
  metadata: Record<string, unknown>;
  journal_entry_id: UUID | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface PayrollRecord {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  user_id: UUID;
  payroll_number: string;
  pay_period_start: string;
  pay_period_end: string;
  pay_date: string;
  basic_salary: number;
  allowances: number;
  overtime_pay: number;
  gross_pay: number;
  tax_deduction: number;
  nssf_deduction: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  payment_method: PaymentMethod;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  notes: string | null;
  metadata: Record<string, unknown>;
  journal_entry_id: UUID | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

// ---- Inventory ----------------------------------------------

export interface InventoryMovement {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  product_id: UUID;
  movement_type: MovementType;
  quantity: number;
  unit_cost: number;
  reference_type: string | null;
  reference_id: UUID | null;
  from_branch_id: UUID | null;
  to_branch_id: UUID | null;
  expiry_date: string | null;
  batch_number: string | null;
  notes: string | null;
  moved_at: Timestamptz;
  created_at: Timestamptz;
  created_by: UUID | null;
}

export interface CurrentStock {
  business_id: UUID;
  branch_id: UUID;
  product_id: UUID;
  quantity_on_hand: number;
  stock_value: number;
}

// ---- Accounting ---------------------------------------------

export interface JournalLine {
  id: UUID;
  journal_entry_id: UUID;
  business_id: UUID;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_id: UUID | null;
  debit_amount: number;
  credit_amount: number;
  description: string | null;
  created_at: Timestamptz;
}

export interface JournalEntry {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  entry_number: string;
  entry_date: Timestamptz;
  entry_type: JournalEntryType;
  description: string;
  reference_type: string | null;
  reference_id: UUID | null;
  total_debit: number;
  total_credit: number;
  status: 'draft' | 'posted' | 'voided';
  period_month: number;
  period_year: number;
  is_reversed: boolean;
  reversal_of: UUID | null;
  notes: string | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  journal_lines?: JournalLine[];
}

// ---- Credit and Invoices ------------------------------------

export interface Invoice {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  customer_id: UUID | null;
  sale_id: UUID | null;
  invoice_number: string;
  invoice_date: Timestamptz;
  due_date: Timestamptz | null;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue' | 'voided';
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  notes: string | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface Bill {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  supplier_id: UUID | null;
  purchase_id: UUID | null;
  bill_number: string;
  bill_date: Timestamptz;
  due_date: Timestamptz | null;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue' | 'voided';
  total_amount: number;
  amount_paid: number;
  balance_due: number;
  notes: string | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface CashTransaction {
  id: UUID;
  business_id: UUID;
  branch_id: UUID;
  bank_account_id: UUID | null;
  transaction_number: string;
  transaction_date: Timestamptz;
  transaction_type: string;
  amount: number;
  reference_type: string | null;
  reference_id: UUID | null;
  description: string;
  payment_method: PaymentMethod;
  status: TransactionStatus;
  notes: string | null;
  journal_entry_id: UUID | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

// ---- Sync ---------------------------------------------------

export interface SyncQueueEntry {
  id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  user_id: UUID | null;
  device_id: string;
  table_name: string;
  record_id: UUID;
  operation: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;
  client_version: number;
  server_version: number | null;
  sync_status: SyncStatus;
  conflict_data: Record<string, unknown> | null;
  error_message: string | null;
  retry_count: number;
  queued_at: Timestamptz;
  synced_at: Timestamptz | null;
}

// ---- Settings -----------------------------------------------

export interface Setting {
  id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  category: string;
  key: string;
  value: unknown;
  description: string | null;
  is_system: boolean;
  created_at: Timestamptz;
  updated_at: Timestamptz;
}

// ---- Reporting views ----------------------------------------

export interface DashboardKPIs {
  period_from: Timestamptz;
  period_to: Timestamptz;
  sale_count: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  expenses: number;
  payroll: number;
  net_profit: number;
  cash_in_hand: number;
  credit_outstanding: number;
}

export interface StockSummaryRow {
  business_id: UUID;
  branch_id: UUID;
  branch_name: string;
  product_id: UUID;
  product_name: string;
  sku: string | null;
  barcode: string | null;
  category_name: string | null;
  unit: string | null;
  quantity_on_hand: number;
  stock_value: number;
  selling_price: number;
  cost_price: number;
  reorder_level: number;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
  retail_value: number;
}

// ---- Database type map (for createClient generic) -----------

// AnyRow: allows insert/update operations without requiring
// a fully generated Supabase types file.
type AnyRow<R> = { Row: R; Insert: Partial<R> & Record<string, unknown>; Update: Partial<R> & Record<string, unknown> };

export interface Database {
  imagecare: {
    Tables: {
      businesses:          AnyRow<Business>;
      branches:            AnyRow<Branch>;
      users:               AnyRow<User>;
      permission_groups:   AnyRow<PermissionGroup>;
      group_permissions:   AnyRow<GroupPermission>;
      customers:           AnyRow<Customer>;
      suppliers:           AnyRow<Supplier>;
      product_categories:  AnyRow<ProductCategory>;
      units:               AnyRow<Unit>;
      products:            AnyRow<Product>;
      sales:               AnyRow<Sale>;
      sale_items:          AnyRow<SaleItem>;
      purchases:           AnyRow<Purchase>;
      purchase_items:      AnyRow<PurchaseItem>;
      expenses:            AnyRow<Expense>;
      payroll:             AnyRow<PayrollRecord>;
      inventory_movements: AnyRow<InventoryMovement>;
      cash_transactions:   AnyRow<CashTransaction>;
      invoices:            AnyRow<Invoice>;
      bills:               AnyRow<Bill>;
      sync_queue:          AnyRow<SyncQueueEntry>;
      settings:            AnyRow<Setting>;
    };
    Views: {
      current_stock:            AnyRow<CurrentStock>;
      vw_stock_summary:         AnyRow<StockSummaryRow>;
    };
    Functions: {
      fn_get_dashboard_kpis: {
        Args: { p_business_id: UUID; p_branch_id?: UUID; p_from_date?: string; p_to_date?: string };
        Returns: DashboardKPIs;
      };
    };
  };
}

// ============================================================
// Stage 2 additional table interfaces
// ============================================================

export interface Account {
  id: UUID; business_id: UUID; account_code: string; account_name: string;
  account_type: AccountType; parent_account_id: UUID | null; description: string | null;
  is_system: boolean; is_active: boolean; created_at: Timestamptz; updated_at: Timestamptz;
}

export interface CreditAccount {
  id: UUID; business_id: UUID; branch_id: UUID; customer_id: UUID | null;
  supplier_id: UUID | null; credit_limit: number; current_balance: number;
  due_date: Timestamptz | null; is_active: boolean; notes: string | null;
  created_at: Timestamptz; updated_at: Timestamptz; deleted_at: Timestamptz | null;
}

export interface CreditTransaction {
  id: UUID; business_id: UUID; branch_id: UUID; credit_account_id: UUID;
  sale_id: UUID | null; purchase_id: UUID | null;
  transaction_type: 'charge' | 'payment'; amount: number;
  payment_method: PaymentMethod | null; reference_number: string | null;
  notes: string | null; transaction_date: Timestamptz; created_at: Timestamptz;
}

export interface AuditLog {
  id: UUID; business_id: UUID; branch_id: UUID | null; user_id: UUID | null;
  table_name: string; record_id: UUID; action: AuditAction;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changed_fields: string[] | null; ip_address: string | null;
  user_agent: string | null; session_id: string | null; created_at: Timestamptz;
}

export interface BankAccount {
  id: UUID; business_id: UUID; branch_id: UUID | null; bank_name: string;
  account_name: string; account_number: string; account_type: string;
  currency: string; opening_balance: number; current_balance: number;
  is_active: boolean; created_at: Timestamptz; updated_at: Timestamptz;
  deleted_at: Timestamptz | null;
}

export interface Notification {
  id: UUID; business_id: UUID; branch_id: UUID | null; user_id: UUID;
  type: string; title: string; body: string | null;
  reference_type: string | null; reference_id: UUID | null;
  is_read: boolean; is_actioned: boolean; expires_at: Timestamptz | null;
  created_at: Timestamptz; updated_at: Timestamptz;
}

export interface LoyaltyAccount {
  id: UUID; business_id: UUID; customer_id: UUID; points_balance: number;
  tier: string; enrolled_at: Timestamptz; last_activity: Timestamptz | null;
  is_active: boolean; created_at: Timestamptz; updated_at: Timestamptz;
}

export interface LoyaltyTransaction {
  id: UUID; business_id: UUID; loyalty_account_id: UUID; sale_id: UUID | null;
  transaction_type: 'earn' | 'redeem'; points: number; description: string | null;
  transaction_date: Timestamptz; created_at: Timestamptz;
}

export interface SalesTarget {
  id: UUID; business_id: UUID; branch_id: UUID | null; user_id: UUID | null;
  period_start: string; period_end: string; target_amount: number;
  target_type: string; notes: string | null; created_at: Timestamptz; updated_at: Timestamptz;
}

export interface StorageMetadata {
  id: UUID; business_id: UUID; branch_id: UUID | null; bucket_name: string;
  storage_path: string; file_name: string; mime_type: string | null;
  file_size_bytes: number | null; reference_type: string | null;
  reference_id: UUID | null; is_public: boolean; created_at: Timestamptz;
}

export interface VwStockSummaryRow {
  business_id: UUID; branch_id: UUID; product_id: UUID; product_name: string;
  sku: string | null; reorder_level: number; product_active: boolean;
  quantity_on_hand: number; stock_value: number;
  stock_status: 'in_stock' | 'low_stock' | 'out_of_stock';
}
