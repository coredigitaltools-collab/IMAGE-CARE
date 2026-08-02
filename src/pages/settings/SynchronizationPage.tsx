import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useLastSyncedAt, usePendingSyncItems, useRunSync } from '../../features/settings/hooks/useSettingsData'
import { formatRelativeTime } from '../../lib/format'
import { isSupabaseConfigured } from '../../lib/supabaseClient'

export function SynchronizationPage() {
  const { showToast } = useToast()
  const isOnline = useOnlineStatus()
  const pendingQuery = usePendingSyncItems()
  const lastSyncedQuery = useLastSyncedAt()
  const runSync = useRunSync()

  const pendingItems = pendingQuery.data ?? []

  const handleSync = async () => {
    const result = await runSync.mutateAsync()
    showToast(
      result.syncedCount > 0 ? `Synced ${result.syncedCount} change${result.syncedCount === 1 ? '' : 's'}.` : 'Nothing to sync.',
      'success',
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader title="Synchronization" description="Offline changes and connection status." />

      {!isSupabaseConfigured && (
        <div className="mb-4 rounded-md border border-warning-100 bg-warning-100/40 p-3 text-xs text-warning-700">
          No live backend is connected yet, "Sync now" simulates pushing offline changes so this flow is testable
          today. Connect Supabase (see README) to make it real.
        </div>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink-900">{isOnline ? 'Connected' : 'Offline'}</p>
            <p className="text-xs text-ink-500">
              Last synced: {lastSyncedQuery.isLoading ? '…' : formatRelativeTime(lastSyncedQuery.data ?? null)}
            </p>
          </div>
          <Button onClick={handleSync} disabled={!isOnline || runSync.isPending || pendingItems.length === 0}>
            <RefreshCw size={15} className={runSync.isPending ? 'animate-spin' : ''} />
            {runSync.isPending ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      </Card>

      <Card className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-900">Pending changes</h2>
        {pendingQuery.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : pendingItems.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Everything is synced" description="No offline changes waiting to sync." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {pendingItems.map((item) => (
              <li key={item.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink-900">
                  {item.operation} · {item.entityType.replace(/_/g, ' ')}
                </span>
                <span className="text-ink-500">{formatRelativeTime(item.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
