import { Outlet } from 'react-router-dom'
import { AppShell } from './AppShell'
import { SyncStatusIndicator } from '../dashboard/SyncStatusIndicator'
import { useSyncStatus } from '../../features/dashboard/hooks/useDashboardData'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export function RootLayout() {
  const isOnline = useOnlineStatus()
  const syncQuery = useSyncStatus()

  return (
    <AppShell
      topbarRight={
        <SyncStatusIndicator
          status={isOnline ? syncQuery.data : { state: 'offline', lastSyncedAt: syncQuery.data?.lastSyncedAt ?? null, pendingCount: 0 }}
        />
      }
    >
      <Outlet />
    </AppShell>
  )
}
