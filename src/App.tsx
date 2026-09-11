// ============================================================
// ImageCare ERP - Root App Component
// File: src/App.tsx
// ============================================================

import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';
// The existing toast context (src/components/ui/toastContext.ts + toastState.ts)
// is consumed by useToast() across ~20 pages, but its matching ToastProvider
// (src/components/ui/Toast.tsx) was never mounted anywhere in the app, so any
// page calling useToast() crashed with "useToast must be used within a
// ToastProvider" the moment it rendered (e.g. InvoiceDashboardPage). Mounting
// it here, once, at the application root fixes every such page at once - no
// new toast system, no per-page changes.
import { ToastProvider } from './components/ui/Toast';

export default function App() {
  return (
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  );
}
