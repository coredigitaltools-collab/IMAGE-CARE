import { useMemo, useState } from 'react'
import { Target, Plus, Trash2 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { SalesTargetsTabs } from '../../components/salesTargets/SalesTargetsTabs'
import { CreateTargetModal } from '../../components/salesTargets/CreateTargetModal'
import { ProgressBar } from '../../components/salesTargets/ProgressBar'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useBranches, useStaff } from '../../features/settings/hooks/useSettingsData'
import { formatCurrency } from '../../lib/format'
import { useAllTargetProgress, useCreateTarget, useDeleteTarget } from '../../features/salesTargets/hooks/useSalesTargetsData'
import { OverlappingTargetError, InvalidTargetScopeError } from '../../services/salesTargetsService'
import { TARGET_SCOPE_LABELS } from '../../types/salesTargets'
import type { TargetScope } from '../../types/salesTargets'

export function TargetsListPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const progressQuery = useAllTargetProgress()
  const branchesQuery = useBranches()
  const staffQuery = useStaff()
  const createTarget = useCreateTarget(user.id)
  const deleteTarget = useDeleteTarget()

  const [scopeFilter, setScopeFilter] = useState<TargetScope | 'all'>('all')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createError, setCreateError] = useState<string | undefined>()

  const branches = branchesQuery.data ?? []
  const staff = staffQuery.data ?? []
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? 'Unknown branch'
  const staffName = (id: string | null) => staff.find((s) => s.id === id)?.fullName ?? 'Unknown staff'

  const filtered = useMemo(() => {
    const all = progressQuery.data ?? []
    return scopeFilter === 'all' ? all : all.filter((p) => p.target.scope === scopeFilter)
  }, [progressQuery.data, scopeFilter])

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Sales Targets' }]} />
      <SalesTargetsTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Targets</h1>
          <p className="mt-0.5 text-sm text-ink-500">Business, branch, and staff targets, with live progress.</p>
        </div>
        <Button
          onClick={() => {
            setCreateError(undefined)
            setIsCreateOpen(true)
          }}
        >
          <Plus size={15} /> New target
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['all', 'business', 'branch', 'staff'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setScopeFilter(s)}
            className={
              scopeFilter === s
                ? 'rounded-full bg-brand-blue-700 px-3 py-1 text-xs font-medium text-white'
                : 'rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50'
            }
          >
            {s === 'all' ? 'All' : TARGET_SCOPE_LABELS[s]}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {progressQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Target}
            title={scopeFilter === 'all' ? 'No targets yet' : 'No targets match this filter'}
            description={
              scopeFilter === 'all'
                ? 'Set a business, branch, or staff target to start tracking progress.'
                : 'Try a different scope filter, or view all targets.'
            }
            action={
              scopeFilter === 'all'
                ? {
                    label: '+ New target',
                    onClick: () => {
                      setCreateError(undefined)
                      setIsCreateOpen(true)
                    },
                  }
                : { label: 'Show all targets', onClick: () => setScopeFilter('all') }
            }
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {filtered.map((p) => (
              <li key={p.target.id} className="py-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-900">
                        {p.target.scope === 'business'
                          ? 'Business-wide'
                          : p.target.scope === 'branch'
                            ? branchName(p.target.branchId)
                            : staffName(p.target.staffId)}
                      </span>
                      <Badge tone="info">{TARGET_SCOPE_LABELS[p.target.scope]}</Badge>
                    </div>
                    <p className="text-xs text-ink-500">
                      {new Date(p.target.periodStart).toLocaleDateString('en-UG')} to {new Date(p.target.periodEnd).toLocaleDateString('en-UG')}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-ink-900">
                      {formatCurrency(p.achievedUgx, 'UGX')} / {formatCurrency(p.target.targetAmountUgx, 'UGX')}
                    </span>
                    <RowActionButton
                      icon={Trash2}
                      label="Delete target"
                      tone="danger"
                      onClick={async () => {
                        if (!window.confirm('Delete this target?')) return
                        await deleteTarget.mutateAsync(p.target.id)
                        showToast('Target deleted.', 'success')
                      }}
                    />
                  </div>
                </div>
                <ProgressBar percent={p.achievementPercent} />
                <p className="mt-1 text-xs text-ink-500">{p.achievementPercent}% achieved</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isCreateOpen && (
        <CreateTargetModal
          branches={branches.filter((b) => b.is_active)}
          staff={staff.filter((s) => s.is_active)}
          userId={user.id}
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
