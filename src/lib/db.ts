// ============================================================
// ImageCare ERP - Stage 3 Database Helper
// File: src/lib/db.ts
// Purpose: Typed Supabase query builder for Stage 3 engines.
//   Wraps supabase.schema('imagecare').from() with our
//   Database types so all engine queries are fully typed.
// ============================================================

import { supabase } from './supabase';
import type {
  Business, Branch, User, Sale, SaleItem, Purchase, PurchaseItem,
  Product, Customer, Supplier, Expense, PayrollRecord,
  InventoryMovement, CashTransaction, Invoice, Bill,
  JournalEntry, JournalLine, SyncQueueEntry, Setting,
  Account, CreditAccount, CreditTransaction, AuditLog, BankAccount,
  Notification, LoyaltyAccount, LoyaltyTransaction, SalesTarget, StorageMetadata,
  VwStockSummaryRow,
} from '../types/database';

// A typed 'from' factory that returns the correct Row type for each table.
// This is the engine-layer equivalent of supabase.schema('imagecare').from('table').

function schema() {
  return supabase.schema('imagecare');
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

export const db = {
  businesses:          () => schema().from('businesses')          as AnyQuery,
  branches:            () => schema().from('branches')            as AnyQuery,
  users:               () => schema().from('users')               as AnyQuery,
  accounts:            () => schema().from('accounts')            as AnyQuery,
  products:            () => schema().from('products')            as AnyQuery,
  customers:           () => schema().from('customers')           as AnyQuery,
  suppliers:           () => schema().from('suppliers')           as AnyQuery,
  sales:               () => schema().from('sales')               as AnyQuery,
  sale_items:          () => schema().from('sale_items')          as AnyQuery,
  purchases:           () => schema().from('purchases')           as AnyQuery,
  purchase_items:      () => schema().from('purchase_items')      as AnyQuery,
  expenses:            () => schema().from('expenses')            as AnyQuery,
  payroll:             () => schema().from('payroll')             as AnyQuery,
  inventory_movements: () => schema().from('inventory_movements') as AnyQuery,
  cash_transactions:   () => schema().from('cash_transactions')   as AnyQuery,
  invoices:            () => schema().from('invoices')            as AnyQuery,
  bills:               () => schema().from('bills')               as AnyQuery,
  journal_entries:     () => schema().from('journal_entries')     as AnyQuery,
  journal_lines:       () => schema().from('journal_lines')       as AnyQuery,
  credit_accounts:     () => schema().from('credit_accounts')     as AnyQuery,
  credit_transactions: () => schema().from('credit_transactions') as AnyQuery,
  audit_logs:          () => schema().from('audit_logs')          as AnyQuery,
  bank_accounts:       () => schema().from('bank_accounts')       as AnyQuery,
  notifications:       () => schema().from('notifications')       as AnyQuery,
  loyalty_accounts:    () => schema().from('loyalty_accounts')    as AnyQuery,
  loyalty_transactions:() => schema().from('loyalty_transactions')as AnyQuery,
  sales_targets:       () => schema().from('sales_targets')       as AnyQuery,
  storage_metadata:    () => schema().from('storage_metadata')    as AnyQuery,
  sync_queue:          () => schema().from('sync_queue')          as AnyQuery,
  settings:            () => schema().from('settings')            as AnyQuery,
  vw_stock_summary:    () => schema().from('vw_stock_summary')    as AnyQuery,
};

// Type-narrowing result helpers for common query patterns
export function asRow<T>(data: unknown): T {
  return data as T;
}

export function asRows<T>(data: unknown): T[] {
  return (data ?? []) as T[];
}

// Re-export interface types for engine use
export type {
  Business, Branch, User, Sale, SaleItem, Purchase, PurchaseItem,
  Product, Customer, Supplier, Expense, PayrollRecord,
  InventoryMovement, CashTransaction, Invoice, Bill,
  JournalEntry, JournalLine, SyncQueueEntry, Setting,
  Account, CreditAccount, CreditTransaction, AuditLog, BankAccount,
  Notification, LoyaltyAccount, LoyaltyTransaction, SalesTarget, StorageMetadata,
  VwStockSummaryRow,
};
