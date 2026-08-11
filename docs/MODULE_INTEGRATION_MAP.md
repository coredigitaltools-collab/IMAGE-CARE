# IMC-BLD-004 - Module Integration Map

Maps every SRS module to its service contracts, hooks, and integration rules.
This is the authoritative reference for connecting frontend screens to the backend.

---

## SRS-to-Service Wiring

| SRS Module | Hook | Primary Service | Supporting Services |
|---|---|---|---|
| SRS-001 Dashboard | `useDashboard` | `getDashboardKPIs` | `getStockSummary` |
| SRS-002 Inventory | `useInventory`, `useInventoryMovements` | `listInventory`, `getInventoryMovements` | `createStockAdjustment`, `createStockTransfer` |
| SRS-003 Sales | `useSales`, `useSaleDetail` | `createSale`, `listSales`, `getSale` | `cancelSale`, `getSaleReceipt` |
| SRS-004 Customers | `useCustomers`, `useCustomerDetail` | `listCustomers`, `getCustomer` | `getCustomerCredit`, `listSales` |
| SRS-005 Purchasing | `usePurchases` | `createPurchase`, `listPurchases` | `recordSupplierPayment` |
| SRS-006 Credit Management | `useCreditManagement` | `getOutstandingCredit`, `recordCreditPayment` | `getCustomerCredit` |
| SRS-007 Purchasing & Procurement | `usePurchases` | `createPurchase`, `listPurchases` | `listSuppliers` |
| SRS-008 Loyalty Programme | Extend master data | Settings-based loyalty config | `listCustomers`, `listSales` |
| SRS-009 Invoices | `useInvoices` | `listInvoices`, `getInvoice` | `recordInvoicePayment` |
| SRS-010 Bills & Payables | `useBills` | `listBills`, `getBill` | `recordSupplierPayment` |
| SRS-011 Payroll | `usePayroll` | `listPayroll`, `approvePayroll` | `processPayrollPayment` |
| SRS-012 Expenses | `useExpenses` | `createExpense`, `listExpenses` | `getExpenseBreakdown` |
| SRS-013 Sales Targets | `useSalesTargets` | `getDashboardKPIs`, `getSalesByPeriod` | `getTopProducts` |
| SRS-014 Stock Summary | `useStockSummary` | `getStockSummary` | `listInventory` |
| SRS-015 Cash Flow | `useCashFlow` | `getCashPosition`, `listCashTransactions` | `getDashboardKPIs` |
| SRS-016 Monthly Summary | `useMonthlySummary` | `getDashboardKPIs`, `getSalesByPeriod` | `getExpenseBreakdown` |
| SRS-017 Annual Summary | `useAnnualSummary` | `getDashboardKPIs`, `getSalesByPeriod` | `getTopProducts` |
| SRS-018 Daily Summary | `useDailySummary` | `getDashboardKPIs`, `getTopProducts` | `getCashPosition` |
| SRS-019 Bank Reconciliation | `useBankReconciliation` | `listCashTransactions` | `listJournalEntries` |
| SRS-020 Branch Overview | `useBranchOverview` | `getDashboardKPIs` | `getStockSummary` |
| SRS-021 Offline Mode | `useOfflineMode` | `runSyncSession` | `getInitialSyncPayload` |

---

## Standard Screen Integration Pattern

Every screen follows this pattern. Do not deviate.

```tsx
// 1. Import the module hook
import { useSales } from '@/hooks/modules/useModuleHooks';
import { PermissionGuard } from '@/components/guards/PermissionGuard';
import { ServiceStateWrapper } from '@/components/feedback/ServiceStates';

// 2. Use the hook in your component
function SalesPage() {
  const { sales, isLoading, error, refetch } = useSales();

  return (
    // 3. Wrap in permission guard
    <PermissionGuard module="sales" action="view" fallback={<PermissionDeniedState />}>
      // 4. Use service state wrapper for loading/error/empty
      <ServiceStateWrapper
        isLoading={isLoading}
        error={error}
        data={sales?.items}
        isEmpty={items => items.length === 0}
        emptyTitle="No sales yet"
        onRetry={refetch}
      >
        {(items) => (
          // 5. Render data
          <SalesList sales={items} />
        )}
      </ServiceStateWrapper>

      // 6. Permission-aware actions
      <PermissionGuard module="sales" action="create">
        <NewSaleButton />
      </PermissionGuard>
    </PermissionGuard>
  );
}
```

---

## Integration Rules

### Financial Rules
- **Never calculate KPIs in the frontend.** Use `getDashboardKPIs`.
- **Dashboard values must reconcile with detailed reports.** Both use the same DB functions.
- **Cash in Hand is not Profit.** They come from different service calls.
- **Credit balance is not Cash.** `credit_balance` on customers, `getCashPosition` for cash.
- **COGS is not a cash movement.** Only inventory movements affect COGS.

### Inventory Rules
- **Never allow direct stock balance edits.** Use `createStockAdjustment` with `approve` permission.
- **Stock derives from movements.** The `current_stock` view is authoritative.
- **Transfers require dispatch + receive.** Both steps create inventory movements.

### Permission Rules
- **Every action checks permission at service level.** Frontend guards are for usability only.
- **Sensitive actions require explicit permissions:** `delete`, `approve`, `export`, `reconcile`.
- **Branch selectors show only `ctx.branches`.** Never show unauthorized branches.

### Pagination Rules
- **All list screens use pagination.** Never load unbounded lists.
- **High-volume transaction histories use cursor pagination.** Sales, purchases, movements.
- **Master data lists may use offset pagination.** Products, customers, suppliers.

### Offline Rules
- **Use `useOfflineMode` hook for SRS-021.** Provides sync state and actions.
- **`runSyncSession` pushes first, then pulls.** Always in that order.
- **Show pending operation count.** Use `OfflineBanner` component.

---

## Component Hierarchy

```
AppProvider                           ← auth state, user context, active branch
  AuthGuard                          ← redirect to login if not authenticated
    AppLayout                        ← navigation, sidebar, header
      BranchSelector                 ← shows only authorized branches
      OfflineBanner                  ← offline/pending status
      
      [Module Page]
        PermissionGuard              ← hides content if no module.view
          ServiceStateWrapper        ← handles loading/error/empty
            [Data Components]        ← pure display
          PermissionGuard            ← hides create button if no module.create
            [Action Components]      ← trigger useServiceCall
```

---

## Hook Import Reference

```typescript
// Context
import { useApp, useUserContext, useActiveBranch } from '@/context/AppContext';

// Permission
import { usePermission } from '@/hooks/usePermission';

// Shared
import { useServiceCall, useAsyncData } from '@/hooks/shared/useServiceCall';

// Module hooks
import { useDashboard } from '@/hooks/modules/useDashboard';
import {
  useInventory, useInventoryMovements,
  useSales, useSaleDetail,
  useCustomers, useCustomerDetail,
  usePurchases,
  useCreditManagement,
  useInvoices,
  useBills,
  usePayroll,
  useExpenses,
  useSalesTargets,
  useStockSummary,
  useCashFlow,
  useMonthlySummary,
  useAnnualSummary,
  useDailySummary,
  useBankReconciliation,
  useBranchOverview,
  useOfflineMode,
} from '@/hooks/modules/useModuleHooks';

// Guards
import {
  PermissionGuard,
  AuthGuard,
  PermissionButton,
  BranchGuard,
} from '@/components/guards/PermissionGuard';

// Feedback
import {
  LoadingState,
  ErrorState,
  EmptyState,
  ServiceStateWrapper,
  PermissionDeniedState,
  OfflineBanner,
} from '@/components/feedback/ServiceStates';
```

---

*ImageCare ERP - IMC-BLD-004 v1.0*
