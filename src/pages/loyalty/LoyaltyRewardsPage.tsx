import { useState } from 'react'
import { Archive, Award, Pencil, Plus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { LoyaltyTabs } from '../../components/loyalty/LoyaltyTabs'
import { RewardFormModal } from '../../components/loyalty/RewardFormModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import { useArchiveReward, useCreateReward, useLoyaltyRewards, useUpdateReward } from '../../features/loyalty/hooks/useLoyaltyData'
import type { LoyaltyReward } from '../../types/loyalty'

export function LoyaltyRewardsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const rewardsQuery = useLoyaltyRewards()
  const createReward = useCreateReward(user.id)
  const updateReward = useUpdateReward(user.id)
  const archiveReward = useArchiveReward(user.id)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingReward, setEditingReward] = useState<LoyaltyReward | null>(null)

  const activeRewards = (rewardsQuery.data ?? []).filter((r) => r.is_active)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Loyalty' }]} />
      <LoyaltyTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Reward Catalogue</h1>
          <p className="mt-0.5 text-sm text-ink-500">What customers can redeem their points for, entirely your own.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> New reward
        </Button>
      </div>

      <Card className="p-5">
        {rewardsQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : activeRewards.length === 0 ? (
          <EmptyState
            icon={Award}
            title="No rewards yet"
            description="Add rewards customers can redeem their points for."
            action={{ label: 'New reward', onClick: () => setIsAddOpen(true) }}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {activeRewards.map((reward) => (
              <li key={reward.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-900">{reward.name}</p>
                  <p className="text-xs text-ink-500">
                    {reward.pointsCost} pts {reward.valueUgx > 0 ? `· worth ${formatCurrency(reward.valueUgx, 'UGX')}` : ''}
                  </p>
                  {reward.description && <p className="mt-0.5 text-xs text-ink-500">{reward.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-0.5">
                  <RowActionButton icon={Pencil} label="Edit" onClick={() => setEditingReward(reward)} />
                  <RowActionButton
                    icon={Archive}
                    label="Archive"
                    tone="danger"
                    onClick={async () => {
                      await archiveReward.mutateAsync(reward.id)
                      showToast('Reward archived.', 'success')
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <RewardFormModal
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (input) => {
            await createReward.mutateAsync(input)
            showToast('Reward created.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}

      {editingReward && (
        <RewardFormModal
          initial={editingReward}
          onClose={() => setEditingReward(null)}
          onSubmit={async (input) => {
            await updateReward.mutateAsync({ id: editingReward.id, input })
            showToast('Reward updated.', 'success')
            setEditingReward(null)
          }}
        />
      )}
    </div>
  )
}
