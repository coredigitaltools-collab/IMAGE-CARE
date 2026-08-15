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

// ---- Lazy-loaded module pages (Stage 2+ - placeholders) ---
// These will be replaced with real implementations in later stages.
// They are defined here now so the shell and routing work.
const DashboardPage     = lazy(() => import('../features/dashboard/DashboardPage'));
const NotFoundPage      = lazy(() => import('../features/NotFoundPage'));
const UnauthorizedPage  = lazy(() => import('../features/UnauthorizedPage'));

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

          // All SRS module routes - placeholders, implemented in Stage 5
          { path: 'sales/*',       element: <ModulePlaceholder module="Sales" /> },
          { path: 'inventory/*',   element: <ModulePlaceholder module="Inventory" /> },
          { path: 'purchasing/*',  element: <ModulePlaceholder module="Purchasing" /> },
          { path: 'customers/*',   element: <ModulePlaceholder module="Customers" /> },
          { path: 'credit/*',      element: <ModulePlaceholder module="Credit" /> },
          { path: 'invoices/*',    element: <ModulePlaceholder module="Invoices" /> },
          { path: 'bills/*',       element: <ModulePlaceholder module="Bills & Payables" /> },
          { path: 'payroll/*',     element: <ModulePlaceholder module="Payroll" /> },
          { path: 'expenses/*',    element: <ModulePlaceholder module="Expenses" /> },
          { path: 'reports/*',     element: <ModulePlaceholder module="Reports" /> },
          { path: 'settings/*',    element: <ModulePlaceholder module="Settings" /> },

          // Error routes
          { path: '401', element: <UnauthorizedPage /> },
          { path: '*',   element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);

// ---- Module placeholder (removed when real module lands) --
function ModulePlaceholder({ module }: { module: string }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      gap: '12px',
      color: 'var(--color-text-secondary)',
    }}>
      <div style={{ fontSize: '32px' }}>🏗</div>
      <p style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{module}</p>
      <p style={{ fontSize: '13px' }}>Coming in the next build stage.</p>
    </div>
  );
}
