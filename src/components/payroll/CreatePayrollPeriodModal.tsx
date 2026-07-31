import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface CreatePayrollPeriodModalProps {
  onClose: () => void
  onSubmit: (startDate: string, endDate: string) => Promise<void>
  submitError?: string
}

export function CreatePayrollPeriodModal({ onClose, onSubmit, submitError }: CreatePayrollPeriodModalProps) {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10)

  const [startDate, setStartDate] = useState(firstOfMonth)
  const [endDate, setEndDate] = useState(lastOfMonth)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(startDate, endDate)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="New payroll period" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pp-start" className="mb-1.5 block text-sm font-medium text-ink-700">
              Start date
            </label>
            <input
              id="pp-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
          <div>
            <label htmlFor="pp-end" className="mb-1.5 block text-sm font-medium text-ink-700">
              End date
            </label>
            <input
              id="pp-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
        </div>
        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create period'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
