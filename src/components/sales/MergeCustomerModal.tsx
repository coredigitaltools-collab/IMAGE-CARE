import { useState } from 'react'
import { Merge } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { Customer } from '../../types/sales'

interface MergeCustomerModalProps {
  source: Customer
  candidates: Customer[]
  onClose: () => void
  onMerge: (targetId: string) => Promise<void>
}

export function MergeCustomerModal({ source, candidates, onClose, onMerge }: MergeCustomerModalProps) {
  const options = candidates.filter((c) => c.id !== source.id)
  const [targetId, setTargetId] = useState(options[0]?.id ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const target = options.find((c) => c.id === targetId)

  const handleConfirm = async () => {
    if (!targetId) return
    setIsSubmitting(true)
    await onMerge(targetId)
    setIsSubmitting(false)
  }

  return (
    <Modal title={`Merge "${source.name}" into…`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-500">
          Choose the customer record to keep. Everything from "{source.name}" — purchase history, credit balance,
          loyalty points, notes, and tags — moves onto the record you pick below. "{source.name}" is then archived,
          not deleted.
        </p>

        {options.length === 0 ? (
          <p className="rounded-md bg-ink-50 p-3 text-sm text-ink-500">No other active customers to merge into.</p>
        ) : (
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          >
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.phone ? `· ${c.phone}` : ''}
              </option>
            ))}
          </select>
        )}

        {target && (
          <div className="rounded-md border border-warning-100 bg-warning-100/40 p-3 text-xs text-warning-700">
            <p className="font-medium">After merging:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                Loyalty points: {target.loyaltyPoints} + {source.loyaltyPoints} = {target.loyaltyPoints + source.loyaltyPoints}
              </li>
              <li>
                Credit balance: {target.creditBalance.toLocaleString()} + {source.creditBalance.toLocaleString()} ={' '}
                {(target.creditBalance + source.creditBalance).toLocaleString()} UGX
              </li>
              <li>All of "{source.name}"'s past sales will now show under "{target.name}".</li>
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={handleConfirm} disabled={isSubmitting || !targetId}>
            <Merge size={14} /> {isSubmitting ? 'Merging…' : 'Merge customers'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
