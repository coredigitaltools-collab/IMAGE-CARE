import { useState } from 'react'
import { Trophy } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { SalesTargetsTabs } from '../../components/salesTargets/SalesTargetsTabs'
import { ProgressBar } from '../../components/salesTargets/ProgressBar'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useLeaderboard } from '../../features/salesTargets/hooks/useSalesTargetsData'

export function LeaderboardPage() {
  const [tab, setTab] = useState<'staff' | 'branch'>('staff')
  const leaderboardQuery = useLeaderboard(tab)
  const rows = leaderboardQuery.data ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Sales Targets' }]} />
      <SalesTargetsTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Leaderboard</h1>
        <p className="mt-0.5 text-sm text-ink-500">Ranked by achievement percent for targets covering today.</p>
      </div>

      <div className="mb-4 flex gap-1.5">
        <button
          onClick={() => setTab('staff')}
          className={
            tab === 'staff'
              ? 'rounded-full bg-brand-blue-700 px-3 py-1 text-xs font-medium text-white'
              : 'rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50'
          }
        >
          Staff
        </button>
        <button
          onClick={() => setTab('branch')}
          className={
            tab === 'branch'
              ? 'rounded-full bg-brand-blue-700 px-3 py-1 text-xs font-medium text-white'
              : 'rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50'
          }
        >
          Branch
        </button>
      </div>

      <Card className="p-5">
        {leaderboardQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No active targets"
            description={`Create a ${tab} target covering the current period to see it ranked here.`}
          />
        ) : (
          <ul className="space-y-4">
            {rows.map((row, i) => (
              <li key={row.id}>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-50 text-xs font-medium text-ink-500">
                      {i + 1}
                    </span>
                    <span className="text-sm font-medium text-ink-900">{row.name}</span>
                  </div>
                  <span className="text-sm font-semibold text-ink-900">{row.achievementPercent}%</span>
                </div>
                <ProgressBar percent={row.achievementPercent} />
                <p className="mt-1 text-xs text-ink-500">
                  {formatCurrency(row.achievedUgx, 'UGX')} of {formatCurrency(row.targetAmountUgx, 'UGX')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
