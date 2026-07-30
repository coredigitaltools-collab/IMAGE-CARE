import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatCurrency } from '../../lib/format'

interface InvoicePaymentModalProps {
  invoiceReference: string
  amountOwed: number
  onClose: () => void
  onSubmit: (amount: number, reference: string) => Promise<void>
  submitError?: string
}

export function InvoicePaymentModal({ invoiceReference, amountOwed, onClose, onSubmit, submitError }: InvoicePaymentModalProps) {
  const [amount, setAmount] = useState(amountOwed)
  const [reference, setReference] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(amount, reference)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title={`Pay invoice — ${invoiceReference}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-500">
          Amount owed: <span className="font-medium text-ink-900">{formatCurrency(amountOwed, 'UGX')}</span>
        </p>
        <div>
          <label htmlFor="pay-amount" className="mb-1.5 block text-sm font-medium text-ink-700">
            Payment amount (UGX)
          </label>
          <input
            id="pay-amount"
            type="number"
            min={0}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>
        <div>
          <label htmlFor="pay-ref" className="mb-1.5 block text-sm font-medium text-ink-700">
            Reference (optional)
          </label>
          <input
            id="pay-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Bank transaction ID, cheque number..."
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>
        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting || amount <= 0}>
            {isSubmitting ? 'Saving…' : 'Record payment'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
