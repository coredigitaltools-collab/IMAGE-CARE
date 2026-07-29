import { Outlet } from 'react-router-dom'
import { AppShell } from './AppShell'
import { SyncStatusIndicator } from '../dashboard/SyncStatusIndicator'
import { NotificationCenter } from './NotificationCenter'
import { useSyncStatus } from '../../features/dashboard/hooks/useDashboardData'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

// This is the ONE global sync indicator for the whole app — it lives in
// the topbar here, not on individual pages. Pages should never render
// their own SyncStatusIndicator to avoid a confusing duplicate badge.
export function RootLayout() {
  const isOnline = useOnlineStatus()
  const syncQuery = useSyncStatus()

  return (
    <AppShell
      topbarRight={
        <>
          <NotificationCenter />
          <SyncStatusIndicator
            status={isOnline ? syncQuery.data : { state: 'offline', lastSyncedAt: syncQuery.data?.lastSyncedAt ?? null, pendingCount: 0 }}
          />
        </>
      }
    >
      <Outlet />
    </AppShell>
  )
}
