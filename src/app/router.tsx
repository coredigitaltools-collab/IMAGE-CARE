import { createBrowserRouter } from 'react-router-dom'
import { DashboardPage } from '../pages/DashboardPage'

// Only the Dashboard module (IMP-001) is implemented. Future implementation
// packs (Inventory, Sales, ...) add routes here — the Sidebar already lists
// them as disabled entries per IMC-000's approved scope.
export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <DashboardPage />,
    },
  ],
  { basename: import.meta.env.BASE_URL },
)
