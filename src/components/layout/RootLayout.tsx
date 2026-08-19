import { Outlet } from 'react-router-dom'
import { AppShell } from './AppShell'

// This is the ONE global sync indicator for the whole app, it lives in
// the topbar here, not on individual pages. Pages should never render
// their own SyncStatusIndicator to avoid a confusing duplicate badge.
/** Compatibility wrapper for routes that still import RootLayout.
 * AppShell owns the authoritative application frame. */
export function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
