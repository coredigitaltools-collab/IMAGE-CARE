import { Link } from 'react-router-dom'
import { Award, History } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { LoyaltyTabs } from '../../components/loyalty/LoyaltyTabs'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatRelativeTime } from '../../lib/format'
import { useCustomers } from '../../features/sales/hooks/useSalesData'
import { useLoyaltyTransactions, useTopMembers } from '../../features/loyalty/hooks/useLoyaltyData'
import { LOYALTY_TRANSACTION_LABELS } from '../../types/loyalty'

const TYPE_TONE = { earn: 'success', redeem: 'info', reverse: 'danger', expire: 'warning', adjust: 'neutral' } as const

export function LoyaltyReportsPage() {
  const topMembersQuery = useTopMembers()
  const transactionsQuery = useLoyaltyTransactions()
  const customersQuery = useCustomers()
  const customerName = (id: string) => customersQuery.data?.find((c) => c.id === id)?.name ?? 'Unknown customer'
  const recentTransactions = (transactionsQuery.data ?? []).slice(0, 15)

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Loyalty' }]} />
      <LoyaltyTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Loyalty Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Top members and the full audit trail of points activity.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <Award size={16} className="text-brand-blue-700" />
            <h2 className="text-sm font-semibold text-ink-900">Top members by points</h2>
          </div>
          {topMembersQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (topMembersQuery.data ?? []).length === 0 ? (
            <EmptyState icon={Award} title="No members yet" description="This fills in as customers earn points." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {(topMembersQuery.data ?? []).map((m) => (
                <li key={m.customerId} className="flex items-center justify-between py-2 text-sm">
                  <Link to={`/customers/${m.customerId}`} className="text-ink-900 hover:text-brand-blue-700">
                    {m.customerName}
                  </Link>
                  <span className="font-medium text-ink-900">{m.pointsBalance} pts</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center gap-2">
            <History size={16} className="text-brand-blue-700" />
            <h2 className="text-sm font-semibold text-ink-900">Recent activity</h2>
          </div>
          {transactionsQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : recentTransactions.length === 0 ? (
            <EmptyState icon={History} title="No activity yet" description="Every points change will be logged here." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {recentTransactions.map((t) => (
                <li key={t.id} className="py-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-ink-900">{customerName(t.customerId)}</span>
                    <span className={t.points >= 0 ? 'font-medium text-success-700' : 'font-medium text-brand-red-700'}>
                      {t.points >= 0 ? '+' : ''}
                      {t.points}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Badge tone={TYPE_TONE[t.type]}>{LOYALTY_TRANSACTION_LABELS[t.type]}</Badge>
                    <span className="text-xs text-ink-500">{formatRelativeTime(t.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
