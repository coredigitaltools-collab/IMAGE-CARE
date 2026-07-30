import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { Customer } from '../../types/sales'
import type { LoyaltyReward } from '../../types/loyalty'

interface RedeemRewardModalProps {
  customers: Customer[]
  rewards: LoyaltyReward[]
  onClose: () => void
  onSubmit: (customerId: string, rewardId: string) => Promise<void>
  submitError?: string
}

export function RedeemRewardModal({ customers, rewards, onClose, onSubmit, submitError }: RedeemRewardModalProps) {
  const eligible = customers.filter((c) => c.loyaltyPoints > 0)
  const [customerId, setCustomerId] = useState(eligible[0]?.id ?? '')
  const [rewardId, setRewardId] = useState(rewards[0]?.id ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selectedCustomer = customers.find((c) => c.id === customerId)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(customerId, rewardId)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="Redeem points" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="rd-customer" className="mb-1.5 block text-sm font-medium text-ink-700">
            Customer
          </label>
          <select
            id="rd-customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          >
            {eligible.length === 0 && <option value="">No customers have points yet</option>}
            {eligible.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.loyaltyPoints} pts)
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="rd-reward" className="mb-1.5 block text-sm font-medium text-ink-700">
            Reward
          </label>
          <select
            id="rd-reward"
            value={rewardId}
            onChange={(e) => setRewardId(e.target.value)}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          >
            {rewards.length === 0 && <option value="">No rewards in the catalogue yet</option>}
            {rewards.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({r.pointsCost} pts)
              </option>
            ))}
          </select>
        </div>
        {selectedCustomer && (
          <p className="text-xs text-ink-500">
            {selectedCustomer.name} currently has {selectedCustomer.loyaltyPoints} points.
          </p>
        )}
        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || eligible.length === 0 || rewards.length === 0}>
            {isSubmitting ? 'Redeeming…' : 'Redeem'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
