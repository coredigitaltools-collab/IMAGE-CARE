// ============================================================
// ImageCare ERP - Root App Component
// File: src/App.tsx
// ============================================================

import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './app/router';

export default function App() {
  return <RouterProvider router={router} />;
}
