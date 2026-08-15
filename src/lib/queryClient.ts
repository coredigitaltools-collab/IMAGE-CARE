// ============================================================
// IMC-BLD-005 | ImageCare ERP State & Data Flow v1.0
// File: src/lib/queryClient.ts
// Purpose: React Query client configuration.
//          Controls server state caching, staleness, retries.
//          All server state goes through React Query.
//          Never store authoritative server data in component useState.
// ============================================================

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is considered fresh for 30 seconds - reduces unnecessary refetches
      staleTime:    30_000,
      // Keep inactive cache entries for 5 minutes
      gcTime:       5 * 60 * 1000,
      // Retry failed queries once before showing error
      retry:        1,
      retryDelay:   1000,
      // Refetch on window focus for operational data (sales, stock)
      refetchOnWindowFocus: true,
      // Do not refetch on reconnect by default - sync service handles this
      refetchOnReconnect: false,
    },
    mutations: {
      // Never retry mutations - idempotency keys handle safe retries
      retry: 0,
    },
  },
});

// ============================================================
// CACHE KEY REGISTRY
// All React Query cache keys in one place.
// Never hard-code query key strings in components.
// Use these factories to ensure consistent invalidation.
// ============================================================

export const queryKeys = {
  // ---- Auth / User ----------------------------------------
  userContext:      (businessId: string) => ['user', 'context', businessId] as const,
  userPermissions:  (userId: string)     => ['user', 'permissions', userId] as const,

  // ---- Dashboard ------------------------------------------
  dashboardKPIs: (businessId: string, branchId?: string, from?: string, to?: string) =>
    ['dashboard', 'kpis', businessId, branchId ?? 'all', from, to] as const,

  // ---- Master Data ----------------------------------------
  products:     (businessId: string, filters?: object) => ['products', businessId, filters]    as const,
  product:      (id: string)                           => ['product', id]                      as const,
  categories:   (businessId: string)                  => ['categories', businessId]            as const,
  units:        (businessId: string)                  => ['units', businessId]                 as const,
  customers:    (businessId: string, filters?: object) => ['customers', businessId, filters]   as const,
  customer:     (id: string)                           => ['customer', id]                     as const,
  suppliers:    (businessId: string, filters?: object) => ['suppliers', businessId, filters]   as const,
  supplier:     (id: string)                           => ['supplier', id]                     as const,
  settings:     (businessId: string, category?: string) => ['settings', businessId, category] as const,

  // ---- Sales ----------------------------------------------
  sales:        (businessId: string, filters?: object) => ['sales', businessId, filters]      as const,
  sale:         (id: string)                           => ['sale', id]                        as const,
  saleReceipt:  (id: string)                           => ['sale', 'receipt', id]             as const,

  // ---- Purchases ------------------------------------------
  purchases:    (businessId: string, filters?: object) => ['purchases', businessId, filters]  as const,
  purchase:     (id: string)                           => ['purchase', id]                    as const,

  // ---- Inventory ------------------------------------------
  inventory:    (businessId: string, branchId?: string) => ['inventory', businessId, branchId ?? 'all'] as const,
  stockLevel:   (productId: string, branchId: string)   => ['stock', productId, branchId]    as const,
  movements:    (businessId: string, branchId: string, productId?: string) =>
    ['movements', businessId, branchId, productId ?? 'all'] as const,

  // ---- Credit ---------------------------------------------
  credit:           (businessId: string, branchId?: string) => ['credit', 'outstanding', businessId, branchId ?? 'all'] as const,
  customerCredit:   (customerId: string)                    => ['credit', 'customer', customerId] as const,

  // ---- Invoices -------------------------------------------
  invoices:     (businessId: string, filters?: object) => ['invoices', businessId, filters]   as const,
  invoice:      (id: string)                           => ['invoice', id]                     as const,

  // ---- Bills ----------------------------------------------
  bills:        (businessId: string, filters?: object) => ['bills', businessId, filters]      as const,
  bill:         (id: string)                           => ['bill', id]                        as const,

  // ---- Expenses -------------------------------------------
  expenses:     (businessId: string, filters?: object) => ['expenses', businessId, filters]   as const,

  // ---- Payroll --------------------------------------------
  payroll:      (businessId: string, filters?: object) => ['payroll', businessId, filters]    as const,
  payrollRecord:(id: string)                           => ['payroll', 'record', id]           as const,

  // ---- Cash -----------------------------------------------
  cashBalance:  (businessId: string, branchId?: string) => ['cash', 'balance', businessId, branchId ?? 'all'] as const,
  cashTxns:     (businessId: string, filters?: object)  => ['cash', 'transactions', businessId, filters] as const,

  // ---- Accounting -----------------------------------------
  journalEntries: (businessId: string, filters?: object) => ['journal', businessId, filters]  as const,
  accountBalance: (businessId: string, code: string)     => ['account', 'balance', businessId, code] as const,

  // ---- Reporting ------------------------------------------
  salesByPeriod:   (businessId: string, branchId?: string, from?: string, to?: string, groupBy?: string) =>
    ['report', 'sales', businessId, branchId ?? 'all', from, to, groupBy] as const,
  topProducts:     (businessId: string, branchId?: string, from?: string, to?: string) =>
    ['report', 'top-products', businessId, branchId ?? 'all', from, to] as const,
  stockSummary:    (businessId: string, branchId?: string) =>
    ['report', 'stock', businessId, branchId ?? 'all'] as const,
  cashPosition:    (businessId: string, branchId?: string) =>
    ['report', 'cash-position', businessId, branchId ?? 'all'] as const,
  expenseBreakdown:(businessId: string, branchId?: string, from?: string, to?: string) =>
    ['report', 'expenses', businessId, branchId ?? 'all', from, to] as const,

  // ---- Sync -----------------------------------------------
  syncStatus:   (deviceId: string) => ['sync', 'status', deviceId] as const,
  syncConflicts:(businessId: string) => ['sync', 'conflicts', businessId] as const,

  // ---- Audit ----------------------------------------------
  auditLogs:    (businessId: string, filters?: object) => ['audit', businessId, filters] as const,

  // ---- Files ----------------------------------------------
  files:        (businessId: string, entityType?: string, entityId?: string) =>
    ['files', businessId, entityType ?? 'all', entityId ?? 'all'] as const,
} as const;

// ============================================================
// CACHE INVALIDATION HELPERS
// Call these after mutations to refresh affected server state.
// Cross-module effects are invalidated in one place.
// ============================================================

export const invalidateAfter = {

  // After a sale is created or cancelled
  sale: (businessId: string, branchId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['sales', businessId] });
    queryClient.invalidateQueries({ queryKey: ['inventory', businessId] });
    queryClient.invalidateQueries({ queryKey: ['report', 'stock', businessId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', businessId] });
    queryClient.invalidateQueries({ queryKey: ['report', 'sales', businessId] });
    queryClient.invalidateQueries({ queryKey: ['cash', 'balance', businessId] });
    if (branchId) {
      queryClient.invalidateQueries({ queryKey: ['inventory', businessId, branchId] });
    }
  },

  // After a purchase is created
  purchase: (businessId: string, _branchId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['purchases', businessId] });
    queryClient.invalidateQueries({ queryKey: ['inventory', businessId] });
    queryClient.invalidateQueries({ queryKey: ['report', 'stock', businessId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', businessId] });
    queryClient.invalidateQueries({ queryKey: ['cash', 'balance', businessId] });
    queryClient.invalidateQueries({ queryKey: ['suppliers', businessId] });
  },

  // After a credit repayment
  creditRepayment: (businessId: string, customerId: string) => {
    queryClient.invalidateQueries({ queryKey: ['credit', 'outstanding', businessId] });
    queryClient.invalidateQueries({ queryKey: ['credit', 'customer', customerId] });
    queryClient.invalidateQueries({ queryKey: ['customers', businessId] });
    queryClient.invalidateQueries({ queryKey: ['cash', 'balance', businessId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', businessId] });
  },

  // After an expense is created
  expense: (businessId: string) => {
    queryClient.invalidateQueries({ queryKey: ['expenses', businessId] });
    queryClient.invalidateQueries({ queryKey: ['cash', 'balance', businessId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', businessId] });
    queryClient.invalidateQueries({ queryKey: ['report', 'expenses', businessId] });
  },

  // After payroll is processed
  payroll: (businessId: string, _branchId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['payroll', businessId] });
    queryClient.invalidateQueries({ queryKey: ['cash', 'balance', businessId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', businessId] });
  },

  // After a stock adjustment or transfer
  inventory: (businessId: string, branchId?: string) => {
    queryClient.invalidateQueries({ queryKey: ['inventory', businessId] });
    queryClient.invalidateQueries({ queryKey: ['report', 'stock', businessId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', businessId] });
    if (branchId) {
      queryClient.invalidateQueries({ queryKey: ['movements', businessId, branchId] });
    }
  },

  // After master data changes
  product: (businessId: string, productId: string) => {
    queryClient.invalidateQueries({ queryKey: ['products', businessId] });
    queryClient.invalidateQueries({ queryKey: ['product', productId] });
    queryClient.invalidateQueries({ queryKey: ['inventory', businessId] });
  },

  customer: (businessId: string, customerId: string) => {
    queryClient.invalidateQueries({ queryKey: ['customers', businessId] });
    queryClient.invalidateQueries({ queryKey: ['customer', customerId] });
    queryClient.invalidateQueries({ queryKey: ['credit', 'customer', customerId] });
  },

  supplier: (businessId: string, supplierId: string) => {
    queryClient.invalidateQueries({ queryKey: ['suppliers', businessId] });
    queryClient.invalidateQueries({ queryKey: ['supplier', supplierId] });
  },

  // After sync session completes - refresh everything
  syncComplete: (businessId: string) => {
    queryClient.invalidateQueries({ queryKey: [businessId] });
  },

  // After settings change
  settings: (businessId: string) => {
    queryClient.invalidateQueries({ queryKey: ['settings', businessId] });
    queryClient.invalidateQueries({ queryKey: ['dashboard', 'kpis', businessId] });
  },
};
