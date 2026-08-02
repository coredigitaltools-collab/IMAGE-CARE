import { BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { SalesTargetsTabs } from '../../components/salesTargets/SalesTargetsTabs'
import { ProgressBar } from '../../components/salesTargets/ProgressBar'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useBranches, useStaff } from '../../features/settings/hooks/useSettingsData'
import { formatCurrency } from '../../lib/format'
import { useAllTargetProgress } from '../../features/salesTargets/hooks/useSalesTargetsData'
import { TARGET_SCOPE_LABELS } from '../../types/salesTargets'

export function TargetReportsPage() {
  const progressQuery = useAllTargetProgress()
  const branchesQuery = useBranches()
  const staffQuery = useStaff()

  const branches = branchesQuery.data ?? []
  const staff = staffQuery.data ?? []
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? 'Unknown branch'
  const staffName = (id: string | null) => staff.find((s) => s.id === id)?.fullName ?? 'Unknown staff'

  const rows = [...(progressQuery.data ?? [])].sort((a, b) => new Date(b.target.periodStart).getTime() - new Date(a.target.periodStart).getTime())

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Sales Targets' }]} />
      <SalesTargetsTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Target Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Every target ever created, and how it landed.</p>
      </div>

      <Card className="p-5">
        {progressQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={BarChart3} title="No targets yet" description="This fills in once targets are created." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((p) => (
              <li key={p.target.id} className="py-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-900">
                        {p.target.scope === 'business'
                          ? 'Business-wide'
                          : p.target.scope === 'branch'
                            ? branchName(p.target.branchId)
                            : staffName(p.target.staffId)}
                      </span>
                      <Badge tone="info">{TARGET_SCOPE_LABELS[p.target.scope]}</Badge>
                      {p.achievementPercent >= 100 && <Badge tone="success">Achieved</Badge>}
                    </div>
                    <p className="text-xs text-ink-500">
                      {new Date(p.target.periodStart).toLocaleDateString('en-UG')} to {new Date(p.target.periodEnd).toLocaleDateString('en-UG')}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-ink-900">
                    {formatCurrency(p.achievedUgx, 'UGX')} / {formatCurrency(p.target.targetAmountUgx, 'UGX')}
                  </span>
                </div>
                <ProgressBar percent={p.achievementPercent} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
