import { History } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { OfflineModeTabs } from '../../components/offlineMode/OfflineModeTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatRelativeTime } from '../../lib/format'
import { useSyncHistory } from '../../features/offlineMode/hooks/useOfflineModeData'

export function SyncHistoryPage() {
  const historyQuery = useSyncHistory()
  const history = historyQuery.data ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Offline Mode' }]} />
      <OfflineModeTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Sync History</h1>
        <p className="mt-0.5 text-sm text-ink-500">Every completed sync, most recent first.</p>
      </div>

      <Card className="p-5">
        {historyQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : history.length === 0 ? (
          <EmptyState icon={History} title="No syncs yet" description="Sync now from the Status tab to create the first entry." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {history.map((entry) => (
              <li key={entry.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink-900">
                    {entry.itemCount} item{entry.itemCount === 1 ? '' : 's'}
                  </span>
                  <span className="text-xs text-ink-500">{formatRelativeTime(entry.syncedAt)}</span>
                </div>
                <p className="text-xs text-ink-500">{entry.itemsSummary}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
