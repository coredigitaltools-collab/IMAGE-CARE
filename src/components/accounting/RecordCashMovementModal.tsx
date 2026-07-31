import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { FormField } from '../settings/FormField'
import type { CashMovementType } from '../../types/accounting'

interface RecordCashMovementModalProps {
  onClose: () => void
  onSubmit: (type: CashMovementType, amount: number, reason: string) => Promise<void>
  submitError?: string
}

export function RecordCashMovementModal({ onClose, onSubmit, submitError }: RecordCashMovementModalProps) {
  const [type, setType] = useState<CashMovementType>('bank_deposit')
  const [amount, setAmount] = useState(0)
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(type, amount, reason)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="Record cash movement" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="cm-type" className="mb-1.5 block text-sm font-medium text-ink-700">
            Type
          </label>
          <select
            id="cm-type"
            value={type}
            onChange={(e) => setType(e.target.value as CashMovementType)}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          >
            <option value="bank_deposit">Bank Deposit (cash leaving the till, going to the bank)</option>
            <option value="owner_withdrawal">Owner Withdrawal (cash taken out by the owner)</option>
            <option value="adjustment">Cash Adjustment (reconciliation correction, + or −)</option>
          </select>
        </div>
        <FormField
          id="cm-amount"
          label={type === 'adjustment' ? 'Amount (UGX, negative for a shortfall)' : 'Amount (UGX)'}
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <div>
          <label htmlFor="cm-reason" className="mb-1.5 block text-sm font-medium text-ink-700">
            Reason
          </label>
          <textarea
            id="cm-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Why this movement happened — required for every entry"
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>
        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Record movement'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
