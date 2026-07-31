import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { FormField } from '../settings/FormField'
import { RECURRING_FREQUENCY_LABELS } from '../../types/expenses'
import type { ExpenseCategory, RecurringExpenseInput, RecurringFrequency } from '../../types/expenses'

interface RecurringTemplateFormModalProps {
  categories: ExpenseCategory[]
  onClose: () => void
  onSubmit: (input: RecurringExpenseInput) => Promise<void>
}

const FREQUENCIES: RecurringFrequency[] = ['weekly', 'monthly', 'quarterly', 'yearly']

export function RecurringTemplateFormModal({ categories, onClose, onSubmit }: RecurringTemplateFormModalProps) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(0)
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly')
  const [nextDueDate, setNextDueDate] = useState(new Date().toISOString().slice(0, 10))
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async () => {
    const category = categories.find((c) => c.id === categoryId)
    setIsSubmitting(true)
    try {
      await onSubmit({ categoryId, categoryName: category?.name ?? '', description, amount, frequency, nextDueDate })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title="New recurring expense" onClose={onClose}>
      {categories.length === 0 ? (
        <p className="text-sm text-ink-500">Create an expense category first, under Categories.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="rt-category" className="mb-1.5 block text-sm font-medium text-ink-700">
              Category
            </label>
            <select
              id="rt-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <FormField id="rt-desc" label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
          <div className="grid grid-cols-2 gap-3">
            <FormField id="rt-amount" label="Amount (UGX)" type="number" min={0} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
            <div>
              <label htmlFor="rt-freq" className="mb-1.5 block text-sm font-medium text-ink-700">
                Frequency
              </label>
              <select
                id="rt-freq"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
                className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
              >
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {RECURRING_FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="rt-due" className="mb-1.5 block text-sm font-medium text-ink-700">
              First due date
            </label>
            <input
              id="rt-due"
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting || amount <= 0}>
              {isSubmitting ? 'Saving…' : 'Save template'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
