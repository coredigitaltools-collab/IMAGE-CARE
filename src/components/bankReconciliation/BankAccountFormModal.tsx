import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { FormField } from '../settings/FormField'
import type { BankAccountInput } from '../../types/bankReconciliation'

interface BankAccountFormModalProps {
  onClose: () => void
  onSubmit: (input: BankAccountInput) => Promise<void>
}

export function BankAccountFormModal({ onClose, onSubmit }: BankAccountFormModalProps) {
  const [name, setName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [openingBalance, setOpeningBalance] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit({ name, accountNumber, openingBalanceUgx: openingBalance })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="New bank account" onClose={onClose}>
      <div className="space-y-4">
        <FormField id="ba-name" label="Account name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Stanbic Current Account" />
        <FormField id="ba-number" label="Account number" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
        <FormField
          id="ba-opening"
          label="Opening balance (UGX)"
          type="number"
          min={0}
          value={openingBalance}
          onChange={(e) => setOpeningBalance(Number(e.target.value))}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || !name.trim()}>
            {isSubmitting ? 'Creating...' : 'Create account'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
