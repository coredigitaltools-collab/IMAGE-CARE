import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Target, TrendingUp, Flag, Percent, Award, Building2, Plus, ListChecks, Trophy } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { SalesTargetsTabs } from '../../components/salesTargets/SalesTargetsTabs'
import { CreateTargetModal } from '../../components/salesTargets/CreateTargetModal'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useBranches, useStaff } from '../../features/settings/hooks/useSettingsData'
import { formatCurrency } from '../../lib/format'
import { useCreateTarget, useTargetsDashboardData } from '../../features/salesTargets/hooks/useSalesTargetsData'
import { OverlappingTargetError, InvalidTargetScopeError } from '../../services/salesTargetsService'

export function SalesTargetsDashboardPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const dataQuery = useTargetsDashboardData()
  const branchesQuery = useBranches()
  const staffQuery = useStaff()
  const createTarget = useCreateTarget(user.id)

  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | undefined>()

  const data = dataQuery.data

  const quickActions = [
    {
      label: 'New target',
      icon: Plus,
      onClick: () => {
        setCreateError(undefined)
        setIsCreateOpen(true)
      },
    },
    { label: 'All targets', icon: ListChecks, onClick: () => navigate('/sales-targets/list') },
    { label: 'Leaderboard', icon: Trophy, onClick: () => navigate('/sales-targets/leaderboard') },
    { label: 'Reports', icon: Flag, onClick: () => navigate('/sales-targets/reports') },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Sales Targets' }]} />
      <SalesTargetsTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Sales Targets</h1>
        <p className="mt-0.5 text-sm text-ink-500">How the business is tracking against the current business-wide target.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="group flex flex-col items-center gap-1.5 rounded-card border border-ink-100 bg-white px-3 py-3 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover active:translate-y-0 active:scale-[0.97]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700 transition-all duration-200 group-hover:scale-110 group-hover:bg-brand-blue-700 group-hover:text-white">
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <span className="text-xs font-medium text-ink-700">{label}</span>
          </button>
        ))}
      </div>

      {dataQuery.isLoading ? null : !data?.current ? (
        <Card className="p-6">
          <EmptyState
            icon={Target}
            title="No active business target"
            description="Create a business-wide target for the current period to see progress here."
            action={{ label: 'New target', onClick: () => setIsCreateOpen(true) }}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard label="Target" value={formatCurrency(data.current.target.targetAmountUgx, 'UGX')} icon={Target} tone="blue" isLoading={false} />
          <KpiCard label="Sales achieved" value={formatCurrency(data.current.achievedUgx, 'UGX')} icon={TrendingUp} tone="success" isLoading={false} />
          <KpiCard label="Remaining target" value={formatCurrency(data.current.remainingUgx, 'UGX')} icon={Flag} tone="neutral" isLoading={false} />
          <KpiCard
            label="Achievement"
            value={`${data.current.achievementPercent}%`}
            icon={Percent}
            tone={data.current.achievementPercent >= 100 ? 'success' : 'neutral'}
            isLoading={false}
          />
          <KpiCard
            label="Top performer"
            value={data.topPerformer ? data.topPerformer.name : 'No staff targets yet'}
            hint={data.topPerformer ? `${data.topPerformer.achievementPercent}% of target` : undefined}
            icon={Award}
            tone="neutral"
            isLoading={false}
          />
          <KpiCard
            label="Best branch"
            value={data.bestBranch ? data.bestBranch.name : 'No branch targets yet'}
            hint={data.bestBranch ? `${data.bestBranch.achievementPercent}% of target` : undefined}
            icon={Building2}
            tone="neutral"
            isLoading={false}
          />
        </div>
      )}

      {isCreateOpen && (
        <CreateTargetModal
          branches={(branchesQuery.data ?? []).filter((b) => b.is_active)}
          staff={(staffQuery.data ?? []).filter((s) => s.is_active)}
          submitError={createError}
          onClose={() => setIsCreateOpen(false)}
          onSubmit={async (input) => {
            try {
              await createTarget.mutateAsync(input)
              showToast('Target created.', 'success')
              setIsCreateOpen(false)
            } catch (err) {
              setCreateError(
                err instanceof OverlappingTargetError || err instanceof InvalidTargetScopeError ? err.message : 'Could not create this target.',
              )
            }
          }}
        />
      )}
    </div>
  )
}
