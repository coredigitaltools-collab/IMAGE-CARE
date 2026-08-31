import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { NumberField } from '../ui/NumberField'
import { PayComponentTypeFormModal } from './PayComponentTypeFormModal'
import { useCreateComponentType } from '../../features/payroll/hooks/usePayrollData'
import type { PayComponentType } from '../../types/payroll'

interface AssignComponentModalProps {
  kind: 'allowance' | 'deduction'
  availableTypes: PayComponentType[]
  userId: string
  onClose: () => void
  onSubmit: (componentTypeId: string, amountOverride: number | null) => Promise<void>
}

export function AssignComponentModal({ kind, availableTypes, userId, onClose, onSubmit }: AssignComponentModalProps) {
  const createType = useCreateComponentType(userId)
  const [componentTypeId, setComponentTypeId] = useState(availableTypes[0]?.id ?? '')
  const [useOverride, setUseOverride] = useState(false)
  const [overrideAmount, setOverrideAmount] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  // 2026-08-31: this picker used to be a dead end when no allowance/deduction
  // types existed yet - "create one under Allowances & Deductions first"
  // meant closing this modal and leaving Payroll's Employees tab entirely.
  // Now it can create the type right here, same as the inline "+ Add new
  // category" pattern used elsewhere, and stays in this modal throughout.
  const [isCreatingType, setIsCreatingType] = useState(availableTypes.length === 0)

  const selected = availableTypes.find((t) => t.id === componentTypeId)

  const handleSubmit = async () => {
    setIsSubmitting(true)
    try {
      await onSubmit(componentTypeId, useOverride ? overrideAmount : null)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isCreatingType) {
    return (
      <PayComponentTypeFormModal
        kind={kind}
        onClose={() => {
          if (availableTypes.length === 0) {
            onClose()
          } else {
            setIsCreatingType(false)
          }
        }}
        onSubmit={async (input) => {
          const created = await createType.mutateAsync({ kind, input })
          setComponentTypeId(created.id)
          setIsCreatingType(false)
        }}
      />
    )
  }

  return (
    <Modal title={`Assign ${kind}`} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="ac-type" className="mb-1.5 block text-sm font-medium text-ink-700">
            {kind === 'allowance' ? 'Allowance' : 'Deduction'}
          </label>
          <div className="flex gap-2">
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
            <button
              type="button"
              onClick={() => setIsCreatingType(true)}
              className="shrink-0 rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-700 hover:bg-ink-50"
            >
              + New
            </button>
          </div>
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
          <NumberField
            id="ac-override"
            label={selected?.isPercentageOfBase ? 'Percentage of base salary' : 'Amount (UGX)'}
            min={0}
            allowDecimal={selected?.isPercentageOfBase}
            value={overrideAmount}
            onChange={setOverrideAmount}
          />
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
    </Modal>
  )
}
