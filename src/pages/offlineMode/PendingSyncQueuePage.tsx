import { RefreshCw, CheckCircle2 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { OfflineModeTabs } from '../../components/offlineMode/OfflineModeTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { formatRelativeTime } from '../../lib/format'
import { usePendingSyncItems, usePerformManualSync } from '../../features/offlineMode/hooks/useOfflineModeData'

const OPERATION_LABELS: Record<string, string> = { create: 'Created', update: 'Updated', disable: 'Removed' }

export function PendingSyncQueuePage() {
  const { showToast } = useToast()
  const pendingQuery = usePendingSyncItems()
  const performSync = usePerformManualSync()
  const items = pendingQuery.data ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Offline Mode' }]} />
      <OfflineModeTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Pending Sync Queue</h1>
          <p className="mt-0.5 text-sm text-ink-500">Every create, update, and removal made since the last sync.</p>
        </div>
        <Button
          disabled={items.length === 0}
          onClick={async () => {
            const result = await performSync.mutateAsync()
            showToast(`Synced ${result.itemCount} item${result.itemCount === 1 ? '' : 's'}.`, 'success')
          }}
        >
          <RefreshCw size={14} /> Sync now
        </Button>
      </div>

      <Card className="p-5">
        {pendingQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : items.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nothing pending" description="Everything made so far is already synced." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="font-medium capitalize text-ink-900">{item.entityType.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-ink-500">{formatRelativeTime(item.createdAt)}</p>
                </div>
                <Badge tone="warning">{OPERATION_LABELS[item.operation] ?? item.operation}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
