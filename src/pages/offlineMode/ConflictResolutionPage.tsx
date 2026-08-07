import { GitMerge } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { OfflineModeTabs } from '../../components/offlineMode/OfflineModeTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useConflicts } from '../../features/offlineMode/hooks/useOfflineModeData'

export function ConflictResolutionPage() {
  const conflictsQuery = useConflicts()
  const conflicts = conflictsQuery.data ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Offline Mode' }]} />
      <OfflineModeTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Conflict Resolution</h1>
        <p className="mt-0.5 text-sm text-ink-500">When two changes to the same record disagree, they show up here for the owner to review.</p>
      </div>

      <Card className="p-5">
        {conflictsQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : conflicts.length === 0 ? (
          <EmptyState
            icon={GitMerge}
            title="No conflicts to review"
            description="A conflict needs two devices editing the same record while disconnected from each other. With this business currently working from one device, none have occurred, this list will fill in honestly once real multi-device sync is connected, not before."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {conflicts.map((c) => (
              <li key={c.id} className="py-2.5 text-sm">
                <p className="font-medium text-ink-900">{c.entityType}</p>
                <p className="text-xs text-ink-500">{c.detectedAt}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
