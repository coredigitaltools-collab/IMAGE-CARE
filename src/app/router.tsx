import { lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { RootLayout } from '../components/layout/RootLayout'
import { Skeleton } from '../components/ui/Skeleton'

// IMC-004 §6 requires lazy loading for large pages — every route below is
// code-split so the initial bundle only includes what the first screen needs.
const DashboardPage = lazy(() => import('../pages/DashboardPage').then((m) => ({ default: m.DashboardPage })))
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
        { path: 'customers', element: withSuspense(<CrmDashboardPage />) },
        { path: 'customers/directory', element: withSuspense(<CustomerDirectoryPage />) },
        { path: 'customers/:id', element: withSuspense(<CustomerDetailPage />) },
        { path: 'credit', element: withSuspense(<CreditDashboardPage />) },
        { path: 'credit/accounts', element: withSuspense(<CreditAccountsPage />) },
        { path: 'credit/reports', element: withSuspense(<CreditReportsPage />) },
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
