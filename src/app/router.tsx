// ============================================================
// ImageCare ERP - Application Router
// File: src/app/router.tsx
// Purpose: Central route definition. All routes in one place.
//          Protected routes require authentication.
//          Permission routes require specific module access.
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
const InventoryDashboardPage = lazy(() => import('../pages/inventory/InventoryDashboardPage').then(m => ({ default: m.InventoryDashboardPage })));
const PointOfSalePage = lazy(() => import('../pages/sales/PointOfSalePage').then(m => ({ default: m.PointOfSalePage })));
const CrmDashboardPage = lazy(() => import('../pages/sales/CrmDashboardPage').then(m => ({ default: m.CrmDashboardPage })));
const PurchaseDashboardPage = lazy(() => import('../pages/purchasing/PurchaseDashboardPage').then(m => ({ default: m.PurchaseDashboardPage })));
const CreditDashboardPage = lazy(() => import('../pages/credit/CreditDashboardPage').then(m => ({ default: m.CreditDashboardPage })));
const InvoiceDashboardPage = lazy(() => import('../pages/invoices/InvoiceDashboardPage').then(m => ({ default: m.InvoiceDashboardPage })));
const BillsDashboardPage = lazy(() => import('../pages/bills/BillsDashboardPage').then(m => ({ default: m.BillsDashboardPage })));
const PayrollDashboardPage = lazy(() => import('../pages/payroll/PayrollDashboardPage').then(m => ({ default: m.PayrollDashboardPage })));
const ExpenseDashboardPage = lazy(() => import('../pages/expenses/ExpenseDashboardPage').then(m => ({ default: m.ExpenseDashboardPage })));
const CashFlowDashboardPage = lazy(() => import('../pages/cashFlow/CashFlowDashboardPage').then(m => ({ default: m.CashFlowDashboardPage })));
const SettingsLandingPage = lazy(() => import('../pages/settings/SettingsLandingPage').then(m => ({ default: m.SettingsLandingPage })));
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

          { path: 'sales/*', element: <PointOfSalePage /> },
          { path: 'inventory/*', element: <InventoryDashboardPage /> },
          { path: 'purchasing/*', element: <PurchaseDashboardPage /> },
          { path: 'customers/*', element: <CrmDashboardPage /> },
          { path: 'credit/*', element: <CreditDashboardPage /> },
          { path: 'invoices/*', element: <InvoiceDashboardPage /> },
          { path: 'bills/*', element: <BillsDashboardPage /> },
          { path: 'payroll/*', element: <PayrollDashboardPage /> },
          { path: 'expenses/*', element: <ExpenseDashboardPage /> },
          { path: 'cash-flow/*', element: <CashFlowDashboardPage /> },
          { path: 'settings/*', element: <SettingsLandingPage /> },
          { path: 'reports/*', element: <ReportsPage /> },

          // Error routes
          { path: '401', element: <UnauthorizedPage /> },
          { path: '*',   element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

