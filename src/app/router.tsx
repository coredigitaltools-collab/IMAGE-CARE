// ============================================================
// ImageCare ERP - Application Router
// File: src/app/router.tsx
// Purpose: Central route definition. All routes in one place.
//          Protected routes require authentication.
//          Permission routes require specific module access.
//
// Stage 5 -> Stage 6 integration correction:
// Every module below previously resolved its whole subtree
// ('inventory/*', 'purchasing/*', etc.) to a single dashboard
// component, so every existing sub-page (Products, Categories,
// Suppliers, Purchase Orders, Requisitions, Credit Accounts,
// Payroll Periods, Settings sections, ...) was unreachable even
// though the pages themselves were already fully implemented.
// This pass wires each of those existing pages into a real nested
// route, using the exact paths each module's own Tabs component
// (e.g. InventoryTabs, PurchasingTabs) and internal <Link>/navigate()
// calls already expected. No new pages were created.
//
// `basename` is now set to '/IMAGE-CARE/' to match the GitHub
// Pages project-site deployment path, so client-side navigation,
// direct URL entry, and browser refresh all resolve correctly
// instead of 404ing or silently dropping the prefix.
// ============================================================

import React, { lazy, Suspense } from 'react';
import {
  createBrowserRouter,
  Navigate,
  Outlet,
} from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingScreen } from '../components/feedback/LoadingScreen';
import { RouteErrorBoundary } from '../components/feedback/RouteErrorBoundary';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { PinSetupPage } from '../features/auth/PinSetupPage';
import { UnlockPage } from '../features/auth/UnlockPage';
import { ForgotPinPage } from '../features/auth/ForgotPinPage';

// ---- Lazy-loaded module pages --------------------------------
const DashboardPage     = lazy(() => import('../pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const NotFoundPage      = lazy(() => import('../features/NotFoundPage'));
const UnauthorizedPage  = lazy(() => import('../features/UnauthorizedPage'));

// Inventory
const InventoryDashboardPage = lazy(() => import('../pages/inventory/InventoryDashboardPage').then(m => ({ default: m.InventoryDashboardPage })));
const ProductsListPage       = lazy(() => import('../pages/inventory/ProductsListPage').then(m => ({ default: m.ProductsListPage })));
const ProductDetailPage      = lazy(() => import('../pages/inventory/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })));
const CategoriesPage         = lazy(() => import('../pages/inventory/CategoriesPage').then(m => ({ default: m.CategoriesPage })));
const BrandsPage             = lazy(() => import('../pages/inventory/BrandsPage').then(m => ({ default: m.BrandsPage })));
const SuppliersPage          = lazy(() => import('../pages/inventory/SuppliersPage').then(m => ({ default: m.SuppliersPage })));
const StockMovementsPage     = lazy(() => import('../pages/inventory/StockMovementsPage').then(m => ({ default: m.StockMovementsPage })));
const StockAdjustmentsPage   = lazy(() => import('../pages/inventory/StockAdjustmentsPage').then(m => ({ default: m.StockAdjustmentsPage })));
const BarcodeManagementPage  = lazy(() => import('../pages/inventory/BarcodeManagementPage').then(m => ({ default: m.BarcodeManagementPage })));
const InventoryReportsPage   = lazy(() => import('../pages/inventory/InventoryReportsPage').then(m => ({ default: m.InventoryReportsPage })));
const UnitsPage              = lazy(() => import('../pages/inventory/UnitsPage').then(m => ({ default: m.UnitsPage })));

// Sales / Point of Sale
const PointOfSalePage = lazy(() => import('../pages/sales/PointOfSalePage').then(m => ({ default: m.PointOfSalePage })));

// Customers / CRM
const CrmDashboardPage       = lazy(() => import('../pages/sales/CrmDashboardPage').then(m => ({ default: m.CrmDashboardPage })));
const CustomerDirectoryPage  = lazy(() => import('../pages/sales/CustomerDirectoryPage').then(m => ({ default: m.CustomerDirectoryPage })));
const CustomersListPage      = lazy(() => import('../pages/sales/CustomersListPage').then(m => ({ default: m.CustomersListPage })));
const CustomerDetailPage     = lazy(() => import('../pages/sales/CustomerDetailPage').then(m => ({ default: m.CustomerDetailPage })));

// Purchasing (includes Goods Receiving, via the existing
// GoodsReceiptModal launched from Purchase Order Detail)
const PurchaseDashboardPage    = lazy(() => import('../pages/purchasing/PurchaseDashboardPage').then(m => ({ default: m.PurchaseDashboardPage })));
const RequisitionsPage         = lazy(() => import('../pages/purchasing/RequisitionsPage').then(m => ({ default: m.RequisitionsPage })));
const PurchaseOrdersPage       = lazy(() => import('../pages/purchasing/PurchaseOrdersPage').then(m => ({ default: m.PurchaseOrdersPage })));
const PurchaseOrderDetailPage  = lazy(() => import('../pages/purchasing/PurchaseOrderDetailPage').then(m => ({ default: m.PurchaseOrderDetailPage })));
const SupplierInvoicesPage     = lazy(() => import('../pages/purchasing/SupplierInvoicesPage').then(m => ({ default: m.SupplierInvoicesPage })));
const PurchaseReturnsPage      = lazy(() => import('../pages/purchasing/PurchaseReturnsPage').then(m => ({ default: m.PurchaseReturnsPage })));
const PurchaseReportsPage      = lazy(() => import('../pages/purchasing/PurchaseReportsPage').then(m => ({ default: m.PurchaseReportsPage })));

// Credit
const CreditDashboardPage = lazy(() => import('../pages/credit/CreditDashboardPage').then(m => ({ default: m.CreditDashboardPage })));
const CreditAccountsPage  = lazy(() => import('../pages/credit/CreditAccountsPage').then(m => ({ default: m.CreditAccountsPage })));
const CreditReportsPage   = lazy(() => import('../pages/credit/CreditReportsPage').then(m => ({ default: m.CreditReportsPage })));

// Invoices
const InvoiceDashboardPage = lazy(() => import('../pages/invoices/InvoiceDashboardPage').then(m => ({ default: m.InvoiceDashboardPage })));
const InvoicesListPage     = lazy(() => import('../pages/invoices/InvoicesListPage').then(m => ({ default: m.InvoicesListPage })));
const InvoiceDetailPage    = lazy(() => import('../pages/invoices/InvoiceDetailPage').then(m => ({ default: m.InvoiceDetailPage })));
const InvoiceReportsPage   = lazy(() => import('../pages/invoices/InvoiceReportsPage').then(m => ({ default: m.InvoiceReportsPage })));
const InvoiceSettingsPage  = lazy(() => import('../pages/invoices/InvoiceSettingsPage').then(m => ({ default: m.InvoiceSettingsPage })));

// Bills & Payables
const BillsDashboardPage    = lazy(() => import('../pages/bills/BillsDashboardPage').then(m => ({ default: m.BillsDashboardPage })));
const PayablesRegisterPage  = lazy(() => import('../pages/bills/PayablesRegisterPage').then(m => ({ default: m.PayablesRegisterPage })));
const BillDetailPage        = lazy(() => import('../pages/bills/BillDetailPage').then(m => ({ default: m.BillDetailPage })));
const BillsReportsPage      = lazy(() => import('../pages/bills/BillsReportsPage').then(m => ({ default: m.BillsReportsPage })));
const BillsSettingsPage     = lazy(() => import('../pages/bills/BillsSettingsPage').then(m => ({ default: m.BillsSettingsPage })));

// Payroll
const PayrollDashboardPage     = lazy(() => import('../pages/payroll/PayrollDashboardPage').then(m => ({ default: m.PayrollDashboardPage })));
const PayrollEmployeesPage     = lazy(() => import('../pages/payroll/PayrollEmployeesPage').then(m => ({ default: m.PayrollEmployeesPage })));
const PayComponentsPage        = lazy(() => import('../pages/payroll/PayComponentsPage').then(m => ({ default: m.PayComponentsPage })));
const PayrollPeriodsPage       = lazy(() => import('../pages/payroll/PayrollPeriodsPage').then(m => ({ default: m.PayrollPeriodsPage })));
const PayrollPeriodDetailPage  = lazy(() => import('../pages/payroll/PayrollPeriodDetailPage').then(m => ({ default: m.PayrollPeriodDetailPage })));
const PayrollReportsPage       = lazy(() => import('../pages/payroll/PayrollReportsPage').then(m => ({ default: m.PayrollReportsPage })));

// Expenses
const ExpenseDashboardPage   = lazy(() => import('../pages/expenses/ExpenseDashboardPage').then(m => ({ default: m.ExpenseDashboardPage })));
const ExpenseRegisterPage    = lazy(() => import('../pages/expenses/ExpenseRegisterPage').then(m => ({ default: m.ExpenseRegisterPage })));
const ExpenseDetailPage      = lazy(() => import('../pages/expenses/ExpenseDetailPage').then(m => ({ default: m.ExpenseDetailPage })));
const ExpenseCategoriesPage  = lazy(() => import('../pages/expenses/ExpenseCategoriesPage').then(m => ({ default: m.ExpenseCategoriesPage })));
const RecurringExpensesPage  = lazy(() => import('../pages/expenses/RecurringExpensesPage').then(m => ({ default: m.RecurringExpensesPage })));
const ExpenseReportsPage     = lazy(() => import('../pages/expenses/ExpenseReportsPage').then(m => ({ default: m.ExpenseReportsPage })));
const ExpenseSettingsPage    = lazy(() => import('../pages/expenses/ExpenseSettingsPage').then(m => ({ default: m.ExpenseSettingsPage })));

// Cash Flow
const CashFlowDashboardPage    = lazy(() => import('../pages/cashFlow/CashFlowDashboardPage').then(m => ({ default: m.CashFlowDashboardPage })));
const CashLedgerPage           = lazy(() => import('../pages/cashFlow/CashLedgerPage').then(m => ({ default: m.CashLedgerPage })));
const CashForecastPage         = lazy(() => import('../pages/cashFlow/CashForecastPage').then(m => ({ default: m.CashForecastPage })));
const CashReconciliationPage   = lazy(() => import('../pages/cashFlow/CashReconciliationPage').then(m => ({ default: m.CashReconciliationPage })));
const CashFlowReportsPage      = lazy(() => import('../pages/cashFlow/CashFlowReportsPage').then(m => ({ default: m.CashFlowReportsPage })));
const CashFlowSettingsPage     = lazy(() => import('../pages/cashFlow/CashFlowSettingsPage').then(m => ({ default: m.CashFlowSettingsPage })));

// Settings (includes Branches -> BranchManagementPage, and
// Users -> PeopleAccessPage)
const SettingsLandingPage        = lazy(() => import('../pages/settings/SettingsLandingPage').then(m => ({ default: m.SettingsLandingPage })));
const BusinessProfilePage        = lazy(() => import('../pages/settings/BusinessProfilePage').then(m => ({ default: m.BusinessProfilePage })));
const BranchManagementPage       = lazy(() => import('../pages/settings/BranchManagementPage').then(m => ({ default: m.BranchManagementPage })));
const TaxSettingsPage            = lazy(() => import('../pages/settings/TaxSettingsPage').then(m => ({ default: m.TaxSettingsPage })));
const InventorySettingsPage      = lazy(() => import('../pages/settings/InventorySettingsPage').then(m => ({ default: m.InventorySettingsPage })));
const SalesSettingsPage          = lazy(() => import('../pages/settings/SalesSettingsPage').then(m => ({ default: m.SalesSettingsPage })));
const ReceiptSettingsPage        = lazy(() => import('../pages/settings/ReceiptSettingsPage').then(m => ({ default: m.ReceiptSettingsPage })));
const PeopleAccessPage           = lazy(() => import('../pages/settings/PeopleAccessPage').then(m => ({ default: m.PeopleAccessPage })));
const BackupRestorePage          = lazy(() => import('../pages/settings/BackupRestorePage').then(m => ({ default: m.BackupRestorePage })));
const SynchronizationPage        = lazy(() => import('../pages/settings/SynchronizationPage').then(m => ({ default: m.SynchronizationPage })));
const NotificationsSettingsPage  = lazy(() => import('../pages/settings/NotificationsSettingsPage').then(m => ({ default: m.NotificationsSettingsPage })));
const AppearanceSettingsPage     = lazy(() => import('../pages/settings/AppearanceSettingsPage').then(m => ({ default: m.AppearanceSettingsPage })));
const AboutPage                  = lazy(() => import('../pages/settings/AboutPage').then(m => ({ default: m.AboutPage })));

// Reports (single self-contained page - its Overview/Sales/
// Inventory/Purchases/Expenses/Credit tabs are internal React
// state, not separate routes, so no sub-routing is needed here)
const ReportsPage = lazy(() => import('../pages/reports/ReportsPage').then(m => ({ default: m.ReportsPage })));

// ---- Restored modules (see Module-Inventory-Forensic-Report.md) --
// These 10 modules' pages, sub-nav (*Tabs.tsx), and (for most) real
// backend hooks already existed in source - they were just never
// wired into this router after the pre-backend history reset. Route
// paths below are taken from each module's own Tabs component
// (already-hardcoded internal navigation), which also match the old
// 06972ff router.

// Loyalty
const LoyaltyDashboardPage   = lazy(() => import('../pages/loyalty/LoyaltyDashboardPage').then(m => ({ default: m.LoyaltyDashboardPage })));
const LoyaltyRewardsPage     = lazy(() => import('../pages/loyalty/LoyaltyRewardsPage').then(m => ({ default: m.LoyaltyRewardsPage })));
const LoyaltyRedemptionsPage = lazy(() => import('../pages/loyalty/LoyaltyRedemptionsPage').then(m => ({ default: m.LoyaltyRedemptionsPage })));
const LoyaltyReportsPage     = lazy(() => import('../pages/loyalty/LoyaltyReportsPage').then(m => ({ default: m.LoyaltyReportsPage })));
const LoyaltySettingsPage    = lazy(() => import('../pages/loyalty/LoyaltySettingsPage').then(m => ({ default: m.LoyaltySettingsPage })));

// Sales Targets
const SalesTargetsDashboardPage = lazy(() => import('../pages/salesTargets/SalesTargetsDashboardPage').then(m => ({ default: m.SalesTargetsDashboardPage })));
const TargetsListPage           = lazy(() => import('../pages/salesTargets/TargetsListPage').then(m => ({ default: m.TargetsListPage })));
const LeaderboardPage           = lazy(() => import('../pages/salesTargets/LeaderboardPage').then(m => ({ default: m.LeaderboardPage })));
const TargetReportsPage         = lazy(() => import('../pages/salesTargets/TargetReportsPage').then(m => ({ default: m.TargetReportsPage })));
const TargetSettingsPage        = lazy(() => import('../pages/salesTargets/TargetSettingsPage').then(m => ({ default: m.TargetSettingsPage })));

// Stock Summary
const StockSummaryDashboardPage = lazy(() => import('../pages/stockSummary/StockSummaryDashboardPage').then(m => ({ default: m.StockSummaryDashboardPage })));
const CurrentStockPage          = lazy(() => import('../pages/stockSummary/CurrentStockPage').then(m => ({ default: m.CurrentStockPage })));
const StockBranchComparisonPage = lazy(() => import('../pages/stockSummary/BranchComparisonPage').then(m => ({ default: m.BranchComparisonPage })));
const StockReportsPage          = lazy(() => import('../pages/stockSummary/StockReportsPage').then(m => ({ default: m.StockReportsPage })));

// Daily Summary
const DailyDashboardPage          = lazy(() => import('../pages/dailySummary/DailyDashboardPage').then(m => ({ default: m.DailyDashboardPage })));
const DailySalesSummaryPage       = lazy(() => import('../pages/dailySummary/DailySalesSummaryPage').then(m => ({ default: m.DailySalesSummaryPage })));
const DailyInventorySummaryPage   = lazy(() => import('../pages/dailySummary/DailyInventorySummaryPage').then(m => ({ default: m.DailyInventorySummaryPage })));
const DailyCashSummaryPage        = lazy(() => import('../pages/dailySummary/DailyCashSummaryPage').then(m => ({ default: m.DailyCashSummaryPage })));
const DailyReportPage             = lazy(() => import('../pages/dailySummary/DailyReportPage').then(m => ({ default: m.DailyReportPage })));

// Monthly Summary
const MonthlyDashboardPage          = lazy(() => import('../pages/monthlySummary/MonthlyDashboardPage').then(m => ({ default: m.MonthlyDashboardPage })));
const MonthlySalesSummaryPage       = lazy(() => import('../pages/monthlySummary/MonthlySalesSummaryPage').then(m => ({ default: m.MonthlySalesSummaryPage })));
const MonthlyInventorySummaryPage   = lazy(() => import('../pages/monthlySummary/MonthlyInventorySummaryPage').then(m => ({ default: m.MonthlyInventorySummaryPage })));
const MonthlyCashFlowSummaryPage    = lazy(() => import('../pages/monthlySummary/MonthlyCashFlowSummaryPage').then(m => ({ default: m.MonthlyCashFlowSummaryPage })));
const MonthlyBranchComparisonPage   = lazy(() => import('../pages/monthlySummary/MonthlyBranchComparisonPage').then(m => ({ default: m.MonthlyBranchComparisonPage })));
const MonthlyReportPage             = lazy(() => import('../pages/monthlySummary/MonthlyReportPage').then(m => ({ default: m.MonthlyReportPage })));

// Annual Summary
const AnnualDashboardPage           = lazy(() => import('../pages/annualSummary/AnnualDashboardPage').then(m => ({ default: m.AnnualDashboardPage })));
const AnnualSalesSummaryPage        = lazy(() => import('../pages/annualSummary/AnnualSalesSummaryPage').then(m => ({ default: m.AnnualSalesSummaryPage })));
const AnnualCashFlowSummaryPage     = lazy(() => import('../pages/annualSummary/AnnualCashFlowSummaryPage').then(m => ({ default: m.AnnualCashFlowSummaryPage })));
const AnnualBranchPerformancePage   = lazy(() => import('../pages/annualSummary/AnnualBranchPerformancePage').then(m => ({ default: m.AnnualBranchPerformancePage })));
const YearOverYearPage              = lazy(() => import('../pages/annualSummary/YearOverYearPage').then(m => ({ default: m.YearOverYearPage })));
const AnnualReportPage              = lazy(() => import('../pages/annualSummary/AnnualReportPage').then(m => ({ default: m.AnnualReportPage })));

// Bank Reconciliation
const BankDashboardPage         = lazy(() => import('../pages/bankReconciliation/BankDashboardPage').then(m => ({ default: m.BankDashboardPage })));
const BankAccountsPage          = lazy(() => import('../pages/bankReconciliation/BankAccountsPage').then(m => ({ default: m.BankAccountsPage })));
const ReconciliationPage        = lazy(() => import('../pages/bankReconciliation/ReconciliationPage').then(m => ({ default: m.ReconciliationPage })));
const UnmatchedTransactionsPage = lazy(() => import('../pages/bankReconciliation/UnmatchedTransactionsPage').then(m => ({ default: m.UnmatchedTransactionsPage })));
const BankReportsPage           = lazy(() => import('../pages/bankReconciliation/BankReportsPage').then(m => ({ default: m.BankReportsPage })));

// Branch Overview
const BranchOverviewDashboardPage = lazy(() => import('../pages/branchOverview/BranchOverviewDashboardPage').then(m => ({ default: m.BranchOverviewDashboardPage })));
const PerformanceComparisonPage   = lazy(() => import('../pages/branchOverview/PerformanceComparisonPage').then(m => ({ default: m.PerformanceComparisonPage })));
const InventoryByBranchPage       = lazy(() => import('../pages/branchOverview/InventoryByBranchPage').then(m => ({ default: m.InventoryByBranchPage })));
const SalesByBranchPage           = lazy(() => import('../pages/branchOverview/SalesByBranchPage').then(m => ({ default: m.SalesByBranchPage })));
const BranchReportsPage           = lazy(() => import('../pages/branchOverview/BranchReportsPage').then(m => ({ default: m.BranchReportsPage })));

// Offline Mode
const OfflineStatusDashboardPage = lazy(() => import('../pages/offlineMode/OfflineStatusDashboardPage').then(m => ({ default: m.OfflineStatusDashboardPage })));
const PendingSyncQueuePage       = lazy(() => import('../pages/offlineMode/PendingSyncQueuePage').then(m => ({ default: m.PendingSyncQueuePage })));
const ConflictResolutionPage     = lazy(() => import('../pages/offlineMode/ConflictResolutionPage').then(m => ({ default: m.ConflictResolutionPage })));
const SyncHistoryPage            = lazy(() => import('../pages/offlineMode/SyncHistoryPage').then(m => ({ default: m.SyncHistoryPage })));
const OfflineSettingsPage        = lazy(() => import('../pages/offlineMode/OfflineSettingsPage').then(m => ({ default: m.OfflineSettingsPage })));

// Accounting (single self-contained page today - old 06972ff
// frontend had this as its own top-level "cash-movements" module;
// its data hook, useAccountingData.ts, already draws real Cash
// Flow/cash_transactions data for the cash-in-hand breakdown)
const CashMovementsPage = lazy(() => import('../pages/accounting/CashMovementsPage').then(m => ({ default: m.CashMovementsPage })));

// ---- Auth guard -------------------------------------------
// Gates the main app tree. Three checks, in order:
//   1. Live, authoritative user context loaded -> else /login.
//   2. Daily PIN lock active (isLocked) -> else /unlock. This is
//      the normal state after re-opening the app on a trusted
//      device that already held a session - see AppContext's
//      "DAILY PIN LOCK ARCHITECTURE" note.
//   3. No PIN configured yet (hasPin === false) -> /setup-pin,
//      forced (covers both first-time registration and an
//      existing user's next login after this feature shipped).
function RequireAuth() {
  const { isAuthenticated, isLoading, isLocked, hasPin } = useApp();

  if (isLoading) return <LoadingScreen message="Loading your session..." />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isLocked) return <Navigate to="/unlock" replace />;
  if (!hasPin) return <Navigate to="/setup-pin" replace />;
  return <Outlet />;
}

// ---- Suspense wrapper -------------------------------------
function SuspenseShell() {
  return (
    <AppShell>
      <Suspense fallback={<LoadingScreen message="Loading..." />}>
        <Outlet />
      </Suspense>
    </AppShell>
  );
}

// ---- Router -----------------------------------------------
export const router = createBrowserRouter([
  // Public routes - no Business ID anywhere in this flow. Business
  // ID is resolved server-side from the authenticated session (see
  // fn_get_my_business_id in 0020_stage7_pin_auth.sql).
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/register',
    element: <RegisterPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/forgot-pin',
    element: <ForgotPinPage />,
    errorElement: <RouteErrorBoundary />,
  },
  // /unlock and /setup-pin require a live session (checked inside
  // each page itself, same pattern as LoginPage's own redirect
  // effect) but are deliberately NOT behind RequireAuth - they are
  // themselves how a locked / PIN-less session resolves to one that
  // can pass RequireAuth's checks.
  {
    path: '/unlock',
    element: <UnlockPage />,
    errorElement: <RouteErrorBoundary />,
  },
  {
    path: '/setup-pin',
    element: <PinSetupPage />,
    errorElement: <RouteErrorBoundary />,
  },

  // Protected routes - require authentication
  //
  // 2026-09-01: errorElement added here after a live crash on Sales -
  // "Unexpected Application Error! Failed to fetch dynamically imported
  // module: .../PointOfSalePage-<hash>.js". Every page below is
  // lazy-loaded (see the lazy() calls above), so a browser tab left open
  // across a redeploy can try to fetch an old page chunk that no longer
  // exists at its old hashed filename. Without this, ANY such failure -
  // or any other unhandled error from ANY page in this whole protected
  // tree - fell through to React Router's raw, technical default crash
  // screen. RouteErrorBoundary replaces that with a plain-language
  // message and auto-recovers the stale-chunk case with a single reload.
  // See RouteErrorBoundary.tsx for the full story.
  {
    element: <RequireAuth />,
    errorElement: <RouteErrorBoundary />,
    children: [
      {
        element: <SuspenseShell />,
        children: [
          // Default redirect
          { index: true, element: <Navigate to="/dashboard" replace /> },

          // Dashboard
          { path: 'dashboard', element: <DashboardPage /> },

          // Sales / Point of Sale (single-page module, no sub-routes)
          { path: 'sales', element: <PointOfSalePage /> },

          // Inventory (Products, Categories, Suppliers, Stock
          // Adjustments, Stock Movements, Barcode, Brands, Units,
          // Inventory Reports - all pre-existing pages)
          {
            path: 'inventory',
            children: [
              { index: true, element: <InventoryDashboardPage /> },
              { path: 'products', element: <ProductsListPage /> },
              { path: 'products/:id', element: <ProductDetailPage /> },
              { path: 'categories', element: <CategoriesPage /> },
              { path: 'brands', element: <BrandsPage /> },
              { path: 'suppliers', element: <SuppliersPage /> },
              { path: 'movements', element: <StockMovementsPage /> },
              { path: 'adjustments', element: <StockAdjustmentsPage /> },
              { path: 'barcode', element: <BarcodeManagementPage /> },
              { path: 'reports', element: <InventoryReportsPage /> },
              { path: 'units', element: <UnitsPage /> },
            ],
          },

          // Purchasing (Requisitions, Orders + detail, Supplier
          // Invoices, Returns, Reports. Goods Receiving happens via
          // the existing GoodsReceiptModal launched from a Purchase
          // Order's detail page - there is no separate Receiving
          // page in the current implementation.)
          {
            path: 'purchasing',
            children: [
              { index: true, element: <PurchaseDashboardPage /> },
              { path: 'requisitions', element: <RequisitionsPage /> },
              { path: 'orders', element: <PurchaseOrdersPage /> },
              { path: 'orders/:id', element: <PurchaseOrderDetailPage /> },
              { path: 'invoices', element: <SupplierInvoicesPage /> },
              { path: 'returns', element: <PurchaseReturnsPage /> },
              { path: 'reports', element: <PurchaseReportsPage /> },
            ],
          },

          // Customers / CRM (Directory, List, Detail)
          {
            path: 'customers',
            children: [
              { index: true, element: <CrmDashboardPage /> },
              { path: 'directory', element: <CustomerDirectoryPage /> },
              { path: 'list', element: <CustomersListPage /> },
              { path: ':id', element: <CustomerDetailPage /> },
            ],
          },

          // Credit (Accounts, Reports - Payments are recorded via
          // the existing RecordPaymentModal from a credit account)
          {
            path: 'credit',
            children: [
              { index: true, element: <CreditDashboardPage /> },
              { path: 'accounts', element: <CreditAccountsPage /> },
              { path: 'reports', element: <CreditReportsPage /> },
            ],
          },

          // Invoices
          {
            path: 'invoices',
            children: [
              { index: true, element: <InvoiceDashboardPage /> },
              { path: 'all', element: <InvoicesListPage /> },
              { path: 'reports', element: <InvoiceReportsPage /> },
              { path: 'settings', element: <InvoiceSettingsPage /> },
              { path: ':id', element: <InvoiceDetailPage /> },
            ],
          },

          // Bills & Payables (Payments are recorded via the
          // existing InvoicePaymentModal from a bill's detail view)
          {
            path: 'bills',
            children: [
              { index: true, element: <BillsDashboardPage /> },
              { path: 'register', element: <PayablesRegisterPage /> },
              { path: 'reports', element: <BillsReportsPage /> },
              { path: 'settings', element: <BillsSettingsPage /> },
              { path: ':id', element: <BillDetailPage /> },
            ],
          },

          // Payroll
          {
            path: 'payroll',
            children: [
              { index: true, element: <PayrollDashboardPage /> },
              { path: 'employees', element: <PayrollEmployeesPage /> },
              { path: 'components', element: <PayComponentsPage /> },
              { path: 'periods', element: <PayrollPeriodsPage /> },
              { path: 'periods/:id', element: <PayrollPeriodDetailPage /> },
              { path: 'reports', element: <PayrollReportsPage /> },
            ],
          },

          // Expenses
          {
            path: 'expenses',
            children: [
              { index: true, element: <ExpenseDashboardPage /> },
              { path: 'register', element: <ExpenseRegisterPage /> },
              { path: 'categories', element: <ExpenseCategoriesPage /> },
              { path: 'recurring', element: <RecurringExpensesPage /> },
              { path: 'reports', element: <ExpenseReportsPage /> },
              { path: 'settings', element: <ExpenseSettingsPage /> },
              { path: ':id', element: <ExpenseDetailPage /> },
            ],
          },

          // Cash Flow
          {
            path: 'cash-flow',
            children: [
              { index: true, element: <CashFlowDashboardPage /> },
              { path: 'ledger', element: <CashLedgerPage /> },
              { path: 'forecast', element: <CashForecastPage /> },
              { path: 'reconciliation', element: <CashReconciliationPage /> },
              { path: 'reports', element: <CashFlowReportsPage /> },
              { path: 'settings', element: <CashFlowSettingsPage /> },
            ],
          },

          // Settings (Branch Management = Branches module, People &
          // Access = Users module)
          {
            path: 'settings',
            children: [
              { index: true, element: <SettingsLandingPage /> },
              { path: 'business-profile', element: <BusinessProfilePage /> },
              { path: 'branches', element: <BranchManagementPage /> },
              { path: 'tax', element: <TaxSettingsPage /> },
              { path: 'inventory', element: <InventorySettingsPage /> },
              { path: 'sales', element: <SalesSettingsPage /> },
              { path: 'receipts', element: <ReceiptSettingsPage /> },
              { path: 'people', element: <PeopleAccessPage /> },
              { path: 'backup', element: <BackupRestorePage /> },
              { path: 'sync', element: <SynchronizationPage /> },
              { path: 'notifications', element: <NotificationsSettingsPage /> },
              { path: 'appearance', element: <AppearanceSettingsPage /> },
              { path: 'about', element: <AboutPage /> },
            ],
          },

          // Reports
          { path: 'reports', element: <ReportsPage /> },

          // ---- Restored modules (see Module-Inventory-Forensic-Report.md) --

          // Loyalty
          {
            path: 'loyalty',
            children: [
              { index: true, element: <LoyaltyDashboardPage /> },
              { path: 'rewards', element: <LoyaltyRewardsPage /> },
              { path: 'redemptions', element: <LoyaltyRedemptionsPage /> },
              { path: 'reports', element: <LoyaltyReportsPage /> },
              { path: 'settings', element: <LoyaltySettingsPage /> },
            ],
          },

          // Sales Targets
          {
            path: 'sales-targets',
            children: [
              { index: true, element: <SalesTargetsDashboardPage /> },
              { path: 'list', element: <TargetsListPage /> },
              { path: 'leaderboard', element: <LeaderboardPage /> },
              { path: 'reports', element: <TargetReportsPage /> },
              { path: 'settings', element: <TargetSettingsPage /> },
            ],
          },

          // Stock Summary
          {
            path: 'stock-summary',
            children: [
              { index: true, element: <StockSummaryDashboardPage /> },
              { path: 'current-stock', element: <CurrentStockPage /> },
              { path: 'branch-comparison', element: <StockBranchComparisonPage /> },
              { path: 'reports', element: <StockReportsPage /> },
            ],
          },

          // Daily Summary
          {
            path: 'daily-summary',
            children: [
              { index: true, element: <DailyDashboardPage /> },
              { path: 'sales', element: <DailySalesSummaryPage /> },
              { path: 'inventory', element: <DailyInventorySummaryPage /> },
              { path: 'cash', element: <DailyCashSummaryPage /> },
              { path: 'report', element: <DailyReportPage /> },
            ],
          },

          // Monthly Summary
          {
            path: 'monthly-summary',
            children: [
              { index: true, element: <MonthlyDashboardPage /> },
              { path: 'sales', element: <MonthlySalesSummaryPage /> },
              { path: 'inventory', element: <MonthlyInventorySummaryPage /> },
              { path: 'cash-flow', element: <MonthlyCashFlowSummaryPage /> },
              { path: 'branches', element: <MonthlyBranchComparisonPage /> },
              { path: 'report', element: <MonthlyReportPage /> },
            ],
          },

          // Annual Summary
          {
            path: 'annual-summary',
            children: [
              { index: true, element: <AnnualDashboardPage /> },
              { path: 'sales', element: <AnnualSalesSummaryPage /> },
              { path: 'cash-flow', element: <AnnualCashFlowSummaryPage /> },
              { path: 'branches', element: <AnnualBranchPerformancePage /> },
              { path: 'year-over-year', element: <YearOverYearPage /> },
              { path: 'report', element: <AnnualReportPage /> },
            ],
          },

          // Bank Reconciliation
          {
            path: 'bank-reconciliation',
            children: [
              { index: true, element: <BankDashboardPage /> },
              { path: 'accounts', element: <BankAccountsPage /> },
              { path: 'reconcile', element: <ReconciliationPage /> },
              { path: 'unmatched', element: <UnmatchedTransactionsPage /> },
              { path: 'reports', element: <BankReportsPage /> },
            ],
          },

          // Branch Overview
          {
            path: 'branch-overview',
            children: [
              { index: true, element: <BranchOverviewDashboardPage /> },
              { path: 'performance', element: <PerformanceComparisonPage /> },
              { path: 'inventory', element: <InventoryByBranchPage /> },
              { path: 'sales', element: <SalesByBranchPage /> },
              { path: 'reports', element: <BranchReportsPage /> },
            ],
          },

          // Offline Mode
          {
            path: 'offline-mode',
            children: [
              { index: true, element: <OfflineStatusDashboardPage /> },
              { path: 'queue', element: <PendingSyncQueuePage /> },
              { path: 'conflicts', element: <ConflictResolutionPage /> },
              { path: 'history', element: <SyncHistoryPage /> },
              { path: 'settings', element: <OfflineSettingsPage /> },
            ],
          },

          // Accounting (single self-contained page - old
          // "cash-movements" module)
          { path: 'accounting', element: <CashMovementsPage /> },

          // Error routes
          { path: '401', element: <UnauthorizedPage /> },
          { path: '*',   element: <NotFoundPage /> },
        ],
      },
    ],
  },
], {
  // GitHub Pages serves this repo as a project site under
  // /IMAGE-CARE/. Without this, React Router's client-side
  // navigation silently drops that prefix from the address bar,
  // so any refresh or direct link/bookmark to an in-app URL
  // 404s at the GitHub Pages static layer. This makes the
  // browser's URL match what's actually deployed.
  basename: '/IMAGE-CARE/',
});
