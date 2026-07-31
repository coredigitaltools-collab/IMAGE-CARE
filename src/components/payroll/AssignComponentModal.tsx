import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import type { PayComponentType } from '../../types/payroll'

interface AssignComponentModalProps {
  kind: 'allowance' | 'deduction'
  availableTypes: PayComponentType[]
  onClose: () => void
  onSubmit: (componentTypeId: string, amountOverride: number | null) => Promise<void>
}

export function AssignComponentModal({ kind, availableTypes, onClose, onSubmit }: AssignComponentModalProps) {
  const [componentTypeId, setComponentTypeId] = useState(availableTypes[0]?.id ?? '')
  const [useOverride, setUseOverride] = useState(false)
  const [overrideAmount, setOverrideAmount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const selected = availableTypes.find((t) => t.id === componentTypeId)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(componentTypeId, useOverride ? overrideAmount : null)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal title={`Assign ${kind}`} onClose={onClose}>
      {availableTypes.length === 0 ? (
        <p className="text-sm text-ink-500">No {kind} types yet — create one under Allowances & Deductions first.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="ac-type" className="mb-1.5 block text-sm font-medium text-ink-700">
              {kind === 'allowance' ? 'Allowance' : 'Deduction'}
            </label>
            <select
              id="ac-type"
              value={componentTypeId}
              onChange={(e) => setComponentTypeId(e.target.value)}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            >
              {availableTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.isPercentageOfBase ? `${t.amount}% of base` : `UGX ${t.amount.toLocaleString()}`})
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={useOverride}
              onChange={(e) => setUseOverride(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-brand-blue-700 focus:ring-brand-blue-500"
            />
            Override the default amount for this employee
          </label>
          {useOverride && (
            <div>
              <label htmlFor="ac-override" className="mb-1.5 block text-sm font-medium text-ink-700">
                {selected?.isPercentageOfBase ? 'Percentage of base salary' : 'Amount (UGX)'}
              </label>
              <input
                id="ac-override"
                type="number"
                min={0}
                value={overrideAmount}
                onChange={(e) => setOverrideAmount(Number(e.target.value))}
                className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? 'Assigning…' : 'Assign'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
