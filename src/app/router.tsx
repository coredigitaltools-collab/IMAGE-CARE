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
      ],
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
