import { useState } from 'react'
import { FileText } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/EmptyState'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import type { Sale } from '../../types/sales'

interface GenerateInvoiceModalProps {
  uninvoicedSales: Sale[]
  defaultDueDays: number
  onClose: () => void
  onSubmit: (saleId: string, dueDate: string | null) => Promise<void>
  submitError?: string
}

export function GenerateInvoiceModal({ uninvoicedSales, defaultDueDays, onClose, onSubmit, submitError }: GenerateInvoiceModalProps) {
  const [saleId, setSaleId] = useState(uninvoicedSales[0]?.id ?? '')
  const defaultDue = new Date(Date.now() + defaultDueDays * 86_400_000).toISOString().slice(0, 10)
  const [dueDate, setDueDate] = useState(defaultDue)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(saleId, dueDate || null)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="Generate invoice" onClose={onClose}>
      {uninvoicedSales.length === 0 ? (
        <EmptyState icon={FileText} title="Nothing to invoice" description="Every completed sale already has an invoice." />
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="gi-sale" className="mb-1.5 block text-sm font-medium text-ink-700">
              Completed sale
            </label>
            <select
              id="gi-sale"
              value={saleId}
              onChange={(e) => setSaleId(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            >
              {uninvoicedSales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.reference} · {formatCurrency(s.totalAmount, 'UGX')} · {formatRelativeTime(s.createdAt)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="gi-due" className="mb-1.5 block text-sm font-medium text-ink-700">
              Due date
            </label>
            <input
              id="gi-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
          {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Generating…' : 'Generate invoice'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
