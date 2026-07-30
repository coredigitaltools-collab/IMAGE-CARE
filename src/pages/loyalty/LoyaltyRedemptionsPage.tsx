import { useState } from 'react'
import { Gift } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { LoyaltyTabs } from '../../components/loyalty/LoyaltyTabs'
import { RedeemRewardModal } from '../../components/loyalty/RedeemRewardModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatRelativeTime } from '../../lib/format'
import { useCustomers } from '../../features/sales/hooks/useSalesData'
import { useLoyaltyRedemptions, useLoyaltyRewards, useRedeemReward } from '../../features/loyalty/hooks/useLoyaltyData'
import { InsufficientPointsError, BelowMinimumRedemptionError } from '../../services/loyaltyService'

export function LoyaltyRedemptionsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const redemptionsQuery = useLoyaltyRedemptions()
  const customersQuery = useCustomers()
  const rewardsQuery = useLoyaltyRewards()
  const redeem = useRedeemReward(user.id)

  const [isRedeemOpen, setIsRedeemOpen] = useState(false)
  const [redeemError, setRedeemError] = useState<string | undefined>()

  const activeCustomers = (customersQuery.data ?? []).filter((c) => c.is_active)
  const activeRewards = (rewardsQuery.data ?? []).filter((r) => r.is_active)
  const customerName = (id: string) => customersQuery.data?.find((c) => c.id === id)?.name ?? 'Unknown customer'

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Loyalty' }]} />
      <LoyaltyTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Redemptions</h1>
          <p className="mt-0.5 text-sm text-ink-500">History of points redeemed for rewards.</p>
        </div>
        <Button
          onClick={() => {
            setRedeemError(undefined)
            setIsRedeemOpen(true)
          }}
        >
          <Gift size={15} /> Redeem points
        </Button>
      </div>

      <Card className="p-5">
        {redemptionsQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : (redemptionsQuery.data ?? []).length === 0 ? (
          <EmptyState icon={Gift} title="No redemptions yet" description="Points redeemed for rewards will appear here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(redemptionsQuery.data ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-ink-900">
                    {customerName(r.customerId)} → {r.rewardName}
                  </p>
                  <p className="text-xs text-ink-500">{formatRelativeTime(r.createdAt)}</p>
                </div>
                <span className="font-semibold text-ink-900">-{r.pointsCost} pts</span>
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
