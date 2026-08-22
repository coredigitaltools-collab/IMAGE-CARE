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
import { LoginPage } from '../features/auth/LoginPage';

// ---- Lazy-loaded module pages --------------------------------
const DashboardPage     = lazy(() => import('../features/dashboard/DashboardPage'));
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

// ---- Auth guard -------------------------------------------
function RequireAuth() {
  const { isAuthenticated, isLoading } = useApp();

  if (isLoading) return <LoadingScreen message="Loading your session..." />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
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
  // Public routes
  {
    path: '/login',
    element: <LoginPage />,
  },

  // Protected routes - require authentication
  {
    element: <RequireAuth />,
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
