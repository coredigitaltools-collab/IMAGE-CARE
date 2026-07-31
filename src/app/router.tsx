import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { RootLayout } from '../components/layout/RootLayout'
import { Skeleton } from '../components/ui/Skeleton'

// IMC-004 §6 requires lazy loading for large pages — every route below is
// code-split so the initial bundle only includes what the first screen needs.
const DashboardPage = lazy(() => import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
const CashMovementsPage = lazy(() => import('../pages/accounting/CashMovementsPage').then((m) => ({ default: m.CashMovementsPage })))

const ExpenseDashboardPage = lazy(() => import('../pages/expenses/ExpenseDashboardPage').then((m) => ({ default: m.ExpenseDashboardPage })))
const ExpenseRegisterPage = lazy(() => import('../pages/expenses/ExpenseRegisterPage').then((m) => ({ default: m.ExpenseRegisterPage })))
const ExpenseCategoriesPage = lazy(() => import('../pages/expenses/ExpenseCategoriesPage').then((m) => ({ default: m.ExpenseCategoriesPage })))
const RecurringExpensesPage = lazy(() => import('../pages/expenses/RecurringExpensesPage').then((m) => ({ default: m.RecurringExpensesPage })))
const ExpenseDetailPage = lazy(() => import('../pages/expenses/ExpenseDetailPage').then((m) => ({ default: m.ExpenseDetailPage })))
const ExpenseReportsPage = lazy(() => import('../pages/expenses/ExpenseReportsPage').then((m) => ({ default: m.ExpenseReportsPage })))
const SettingsLandingPage = lazy(() => import('../pages/settings/SettingsLandingPage').then((m) => ({ default: m.SettingsLandingPage })))
const BusinessProfilePage = lazy(() => import('../pages/settings/BusinessProfilePage').then((m) => ({ default: m.BusinessProfilePage })))
const PeopleAccessPage = lazy(() => import('../pages/settings/PeopleAccessPage').then((m) => ({ default: m.PeopleAccessPage })))
const BranchManagementPage = lazy(() => import('../pages/settings/BranchManagementPage').then((m) => ({ default: m.BranchManagementPage })))
const TaxSettingsPage = lazy(() => import('../pages/settings/TaxSettingsPage').then((m) => ({ default: m.TaxSettingsPage })))
const ReceiptSettingsPage = lazy(() => import('../pages/settings/ReceiptSettingsPage').then((m) => ({ default: m.ReceiptSettingsPage })))
const InventorySettingsPage = lazy(() => import('../pages/settings/InventorySettingsPage').then((m) => ({ default: m.InventorySettingsPage })))
const SalesSettingsPage = lazy(() => import('../pages/settings/SalesSettingsPage').then((m) => ({ default: m.SalesSettingsPage })))
const NotificationsSettingsPage = lazy(() => import('../pages/settings/NotificationsSettingsPage').then((m) => ({ default: m.NotificationsSettingsPage })))
const BackupRestorePage = lazy(() => import('../pages/settings/BackupRestorePage').then((m) => ({ default: m.BackupRestorePage })))
const SynchronizationPage = lazy(() => import('../pages/settings/SynchronizationPage').then((m) => ({ default: m.SynchronizationPage })))
const AppearanceSettingsPage = lazy(() => import('../pages/settings/AppearanceSettingsPage').then((m) => ({ default: m.AppearanceSettingsPage })))
const AboutPage = lazy(() => import('../pages/settings/AboutPage').then((m) => ({ default: m.AboutPage })))

const InventoryDashboardPage = lazy(() => import('../pages/inventory/InventoryDashboardPage').then((m) => ({ default: m.InventoryDashboardPage })))
const ProductsListPage = lazy(() => import('../pages/inventory/ProductsListPage').then((m) => ({ default: m.ProductsListPage })))
const ProductDetailPage = lazy(() => import('../pages/inventory/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage })))
const CategoriesPage = lazy(() => import('../pages/inventory/CategoriesPage').then((m) => ({ default: m.CategoriesPage })))
const BrandsPage = lazy(() => import('../pages/inventory/BrandsPage').then((m) => ({ default: m.BrandsPage })))
const UnitsPage = lazy(() => import('../pages/inventory/UnitsPage').then((m) => ({ default: m.UnitsPage })))
const SuppliersPage = lazy(() => import('../pages/inventory/SuppliersPage').then((m) => ({ default: m.SuppliersPage })))
const StockMovementsPage = lazy(() => import('../pages/inventory/StockMovementsPage').then((m) => ({ default: m.StockMovementsPage })))
const StockAdjustmentsPage = lazy(() => import('../pages/inventory/StockAdjustmentsPage').then((m) => ({ default: m.StockAdjustmentsPage })))
const BarcodeManagementPage = lazy(() => import('../pages/inventory/BarcodeManagementPage').then((m) => ({ default: m.BarcodeManagementPage })))
const InventoryReportsPage = lazy(() => import('../pages/inventory/InventoryReportsPage').then((m) => ({ default: m.InventoryReportsPage })))

const PointOfSalePage = lazy(() => import('../pages/sales/PointOfSalePage').then((m) => ({ default: m.PointOfSalePage })))
const CrmDashboardPage = lazy(() => import('../pages/sales/CrmDashboardPage').then((m) => ({ default: m.CrmDashboardPage })))
const CustomerDirectoryPage = lazy(() => import('../pages/sales/CustomerDirectoryPage').then((m) => ({ default: m.CustomerDirectoryPage })))
const CustomerDetailPage = lazy(() => import('../pages/sales/CustomerDetailPage').then((m) => ({ default: m.CustomerDetailPage })))

const CreditDashboardPage = lazy(() => import('../pages/credit/CreditDashboardPage').then((m) => ({ default: m.CreditDashboardPage })))
const CreditAccountsPage = lazy(() => import('../pages/credit/CreditAccountsPage').then((m) => ({ default: m.CreditAccountsPage })))
const CreditReportsPage = lazy(() => import('../pages/credit/CreditReportsPage').then((m) => ({ default: m.CreditReportsPage })))

const PurchaseDashboardPage = lazy(() => import('../pages/purchasing/PurchaseDashboardPage').then((m) => ({ default: m.PurchaseDashboardPage })))
const RequisitionsPage = lazy(() => import('../pages/purchasing/RequisitionsPage').then((m) => ({ default: m.RequisitionsPage })))
const PurchaseOrdersPage = lazy(() => import('../pages/purchasing/PurchaseOrdersPage').then((m) => ({ default: m.PurchaseOrdersPage })))
const PurchaseOrderDetailPage = lazy(() => import('../pages/purchasing/PurchaseOrderDetailPage').then((m) => ({ default: m.PurchaseOrderDetailPage })))
const SupplierInvoicesPage = lazy(() => import('../pages/purchasing/SupplierInvoicesPage').then((m) => ({ default: m.SupplierInvoicesPage })))
const PurchaseReturnsPage = lazy(() => import('../pages/purchasing/PurchaseReturnsPage').then((m) => ({ default: m.PurchaseReturnsPage })))
const PurchaseReportsPage = lazy(() => import('../pages/purchasing/PurchaseReportsPage').then((m) => ({ default: m.PurchaseReportsPage })))

const LoyaltyDashboardPage = lazy(() => import('../pages/loyalty/LoyaltyDashboardPage').then((m) => ({ default: m.LoyaltyDashboardPage })))
const LoyaltyRewardsPage = lazy(() => import('../pages/loyalty/LoyaltyRewardsPage').then((m) => ({ default: m.LoyaltyRewardsPage })))
const LoyaltyRedemptionsPage = lazy(() => import('../pages/loyalty/LoyaltyRedemptionsPage').then((m) => ({ default: m.LoyaltyRedemptionsPage })))
const LoyaltyReportsPage = lazy(() => import('../pages/loyalty/LoyaltyReportsPage').then((m) => ({ default: m.LoyaltyReportsPage })))
const LoyaltySettingsPage = lazy(() => import('../pages/loyalty/LoyaltySettingsPage').then((m) => ({ default: m.LoyaltySettingsPage })))

const InvoiceDashboardPage = lazy(() => import('../pages/invoices/InvoiceDashboardPage').then((m) => ({ default: m.InvoiceDashboardPage })))
const InvoicesListPage = lazy(() => import('../pages/invoices/InvoicesListPage').then((m) => ({ default: m.InvoicesListPage })))
const InvoiceDetailPage = lazy(() => import('../pages/invoices/InvoiceDetailPage').then((m) => ({ default: m.InvoiceDetailPage })))
const InvoiceReportsPage = lazy(() => import('../pages/invoices/InvoiceReportsPage').then((m) => ({ default: m.InvoiceReportsPage })))
const InvoiceSettingsPage = lazy(() => import('../pages/invoices/InvoiceSettingsPage').then((m) => ({ default: m.InvoiceSettingsPage })))

const BillsDashboardPage = lazy(() => import('../pages/bills/BillsDashboardPage').then((m) => ({ default: m.BillsDashboardPage })))
const PayablesRegisterPage = lazy(() => import('../pages/bills/PayablesRegisterPage').then((m) => ({ default: m.PayablesRegisterPage })))
const BillDetailPage = lazy(() => import('../pages/bills/BillDetailPage').then((m) => ({ default: m.BillDetailPage })))
const BillsReportsPage = lazy(() => import('../pages/bills/BillsReportsPage').then((m) => ({ default: m.BillsReportsPage })))
const BillsSettingsPage = lazy(() => import('../pages/bills/BillsSettingsPage').then((m) => ({ default: m.BillsSettingsPage })))

const PayrollDashboardPage = lazy(() => import('../pages/payroll/PayrollDashboardPage').then((m) => ({ default: m.PayrollDashboardPage })))
const PayrollEmployeesPage = lazy(() => import('../pages/payroll/PayrollEmployeesPage').then((m) => ({ default: m.PayrollEmployeesPage })))
const PayComponentsPage = lazy(() => import('../pages/payroll/PayComponentsPage').then((m) => ({ default: m.PayComponentsPage })))
const PayrollPeriodsPage = lazy(() => import('../pages/payroll/PayrollPeriodsPage').then((m) => ({ default: m.PayrollPeriodsPage })))
const PayrollPeriodDetailPage = lazy(() => import('../pages/payroll/PayrollPeriodDetailPage').then((m) => ({ default: m.PayrollPeriodDetailPage })))
const PayrollReportsPage = lazy(() => import('../pages/payroll/PayrollReportsPage').then((m) => ({ default: m.PayrollReportsPage })))

function PageFallback() {
  return (
    <div className="mx-auto max-w-4xl">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-4 h-64 w-full" />
    </div>
  )
}

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<PageFallback />}>{element}</Suspense>
}

// IMP-001 (Dashboard) and IMP-002 (Settings) are implemented. Future
// implementation packs (Inventory, Sales, ...) add routes here — the
// Sidebar already lists them as disabled entries per IMC-000's approved
// scope.
export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <RootLayout />,
      children: [
        { index: true, element: withSuspense(<DashboardPage />) },
        { path: 'settings', element: withSuspense(<SettingsLandingPage />) },
        { path: 'settings/business-profile', element: withSuspense(<BusinessProfilePage />) },
        { path: 'settings/people', element: withSuspense(<PeopleAccessPage />) },
        { path: 'settings/branches', element: withSuspense(<BranchManagementPage />) },
        { path: 'settings/tax', element: withSuspense(<TaxSettingsPage />) },
        { path: 'settings/receipts', element: withSuspense(<ReceiptSettingsPage />) },
        { path: 'settings/inventory', element: withSuspense(<InventorySettingsPage />) },
        { path: 'settings/sales', element: withSuspense(<SalesSettingsPage />) },
        { path: 'settings/notifications', element: withSuspense(<NotificationsSettingsPage />) },
        { path: 'settings/backup', element: withSuspense(<BackupRestorePage />) },
        { path: 'settings/sync', element: withSuspense(<SynchronizationPage />) },
        { path: 'settings/appearance', element: withSuspense(<AppearanceSettingsPage />) },
        { path: 'settings/about', element: withSuspense(<AboutPage />) },
        { path: 'inventory', element: withSuspense(<InventoryDashboardPage />) },
        { path: 'inventory/products', element: withSuspense(<ProductsListPage />) },
        { path: 'inventory/products/:id', element: withSuspense(<ProductDetailPage />) },
        { path: 'inventory/categories', element: withSuspense(<CategoriesPage />) },
        { path: 'inventory/brands', element: withSuspense(<BrandsPage />) },
        { path: 'inventory/units', element: withSuspense(<UnitsPage />) },
        { path: 'inventory/suppliers', element: withSuspense(<SuppliersPage />) },
        { path: 'inventory/movements', element: withSuspense(<StockMovementsPage />) },
        { path: 'inventory/adjustments', element: withSuspense(<StockAdjustmentsPage />) },
        { path: 'inventory/barcode', element: withSuspense(<BarcodeManagementPage />) },
        { path: 'inventory/reports', element: withSuspense(<InventoryReportsPage />) },
        { path: 'sales', element: withSuspense(<PointOfSalePage />) },
        { path: 'cash-movements', element: withSuspense(<CashMovementsPage />) },
        { path: 'expenses', element: withSuspense(<ExpenseDashboardPage />) },
        { path: 'expenses/register', element: withSuspense(<ExpenseRegisterPage />) },
        { path: 'expenses/categories', element: withSuspense(<ExpenseCategoriesPage />) },
        { path: 'expenses/recurring', element: withSuspense(<RecurringExpensesPage />) },
        { path: 'expenses/reports', element: withSuspense(<ExpenseReportsPage />) },
        { path: 'expenses/:id', element: withSuspense(<ExpenseDetailPage />) },
        { path: 'customers', element: withSuspense(<CrmDashboardPage />) },
        { path: 'customers/directory', element: withSuspense(<CustomerDirectoryPage />) },
        { path: 'customers/:id', element: withSuspense(<CustomerDetailPage />) },
        { path: 'credit', element: withSuspense(<CreditDashboardPage />) },
        { path: 'credit/accounts', element: withSuspense(<CreditAccountsPage />) },
        { path: 'credit/reports', element: withSuspense(<CreditReportsPage />) },
        { path: 'purchasing', element: withSuspense(<PurchaseDashboardPage />) },
        { path: 'purchasing/requisitions', element: withSuspense(<RequisitionsPage />) },
        { path: 'purchasing/orders', element: withSuspense(<PurchaseOrdersPage />) },
        { path: 'purchasing/orders/:id', element: withSuspense(<PurchaseOrderDetailPage />) },
        { path: 'purchasing/invoices', element: withSuspense(<SupplierInvoicesPage />) },
        { path: 'purchasing/returns', element: withSuspense(<PurchaseReturnsPage />) },
        { path: 'purchasing/reports', element: withSuspense(<PurchaseReportsPage />) },
        { path: 'loyalty', element: withSuspense(<LoyaltyDashboardPage />) },
        { path: 'loyalty/rewards', element: withSuspense(<LoyaltyRewardsPage />) },
        { path: 'loyalty/redemptions', element: withSuspense(<LoyaltyRedemptionsPage />) },
        { path: 'loyalty/reports', element: withSuspense(<LoyaltyReportsPage />) },
        { path: 'loyalty/settings', element: withSuspense(<LoyaltySettingsPage />) },
        { path: 'invoices', element: withSuspense(<InvoiceDashboardPage />) },
        { path: 'invoices/all', element: withSuspense(<InvoicesListPage />) },
        { path: 'invoices/reports', element: withSuspense(<InvoiceReportsPage />) },
        { path: 'invoices/settings', element: withSuspense(<InvoiceSettingsPage />) },
        { path: 'bills', element: withSuspense(<BillsDashboardPage />) },
        { path: 'bills/register', element: withSuspense(<PayablesRegisterPage />) },
        { path: 'bills/reports', element: withSuspense(<BillsReportsPage />) },
        { path: 'bills/settings', element: withSuspense(<BillsSettingsPage />) },
        { path: 'payroll', element: withSuspense(<PayrollDashboardPage />) },
        { path: 'payroll/employees', element: withSuspense(<PayrollEmployeesPage />) },
        { path: 'payroll/components', element: withSuspense(<PayComponentsPage />) },
        { path: 'payroll/periods', element: withSuspense(<PayrollPeriodsPage />) },
        { path: 'payroll/periods/:id', element: withSuspense(<PayrollPeriodDetailPage />) },
        { path: 'payroll/reports', element: withSuspense(<PayrollReportsPage />) },
        { path: 'bills/:id', element: withSuspense(<BillDetailPage />) },
        { path: 'invoices/:id', element: withSuspense(<InvoiceDetailPage />) },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
