import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Award, Users, TrendingUp, Gift, RotateCcw } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { LoyaltyTabs } from '../../components/loyalty/LoyaltyTabs'
import { RedeemRewardModal } from '../../components/loyalty/RedeemRewardModal'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useCustomers } from '../../features/sales/hooks/useSalesData'
import { useLoyaltyDashboardKpis, useLoyaltyRewards, useRedeemReward, useTopMembers } from '../../features/loyalty/hooks/useLoyaltyData'
import { InsufficientPointsError, BelowMinimumRedemptionError } from '../../services/loyaltyService'

export function LoyaltyDashboardPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const kpisQuery = useLoyaltyDashboardKpis()
  const topMembersQuery = useTopMembers()
  const customersQuery = useCustomers()
  const rewardsQuery = useLoyaltyRewards()
  const redeem = useRedeemReward(user.id)

  const [isRedeemOpen, setIsRedeemOpen] = useState(false)
  const [redeemError, setRedeemError] = useState<string | undefined>()

  const activeCustomers = (customersQuery.data ?? []).filter((c) => c.is_active)
  const activeRewards = (rewardsQuery.data ?? []).filter((r) => r.is_active)

  const quickActions = [
    {
      label: 'Redeem points',
      icon: Gift,
      onClick: () => {
        setRedeemError(undefined)
        setIsRedeemOpen(true)
      },
    },
    { label: 'Rewards', icon: Award, onClick: () => navigate('/loyalty/rewards') },
    { label: 'Reports', icon: TrendingUp, onClick: () => navigate('/loyalty/reports') },
    { label: 'Settings', icon: RotateCcw, onClick: () => navigate('/loyalty/settings') },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Loyalty' }]} />
      <LoyaltyTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Loyalty Programme</h1>
        <p className="mt-0.5 text-sm text-ink-500">Points, rewards, and repeat-customer engagement.</p>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Points outstanding"
          value={kpisQuery.data ? String(kpisQuery.data.totalPointsOutstanding) : '—'}
          icon={Award}
          tone="blue"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Active members"
          value={kpisQuery.data ? String(kpisQuery.data.activeMembers) : '—'}
          icon={Users}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Earned this month"
          value={kpisQuery.data ? String(kpisQuery.data.pointsEarnedThisMonth) : '—'}
          icon={TrendingUp}
          tone="success"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Redeemed this month"
          value={kpisQuery.data ? String(kpisQuery.data.pointsRedeemedThisMonth) : '—'}
          icon={Gift}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Redemptions this month"
          value={kpisQuery.data ? String(kpisQuery.data.redemptionsThisMonth) : '—'}
          icon={Gift}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-900">Top members by points</h2>
        {topMembersQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (topMembersQuery.data ?? []).length === 0 ? (
          <EmptyState icon={Award} title="No members yet" description="Customers earn points automatically on completed sales." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(topMembersQuery.data ?? []).map((m, i) => (
              <li key={m.customerId} className="flex items-center gap-3 py-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-50 text-xs font-medium text-ink-500">{i + 1}</span>
                <Link to={`/customers/${m.customerId}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                  {m.customerName}
                </Link>
                <span className="shrink-0 text-sm font-semibold text-ink-900">{m.pointsBalance} pts</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isRedeemOpen && (
        <RedeemRewardModal
          customers={activeCustomers}
          rewards={activeRewards}
          submitError={redeemError}
          onClose={() => setIsRedeemOpen(false)}
          onSubmit={async (customerId, rewardId) => {
            try {
              await redeem.mutateAsync({ customerId, rewardId })
              showToast('Reward redeemed.', 'success')
              setIsRedeemOpen(false)
            } catch (err) {
              setRedeemError(
                err instanceof InsufficientPointsError || err instanceof BelowMinimumRedemptionError ? err.message : 'Could not redeem this reward.',
              )
            }
          }}
        />
      )}
    </div>
  )
}
