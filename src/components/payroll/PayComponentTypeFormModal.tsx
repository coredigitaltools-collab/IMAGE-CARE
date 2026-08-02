import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import type { PayComponentTypeInput } from '../../types/payroll'

const schema = z.object({
  name: z.string().trim().min(1, 'Name is required.'),
  isPercentageOfBase: z.boolean(),
  amount: z.number().min(0, 'Must be 0 or higher.'),
})
type FormValues = z.infer<typeof schema>

interface PayComponentTypeFormModalProps {
  kind: 'allowance' | 'deduction'
  onClose: () => void
  onSubmit: (input: PayComponentTypeInput) => Promise<void>
}

export function PayComponentTypeFormModal({ kind, onClose, onSubmit }: PayComponentTypeFormModalProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { name: '', isPercentageOfBase: false, amount: 0 } })

  const isPercent = watch('isPercentageOfBase')

  return (
    <Modal title={`New ${kind}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          label="Name"
          {...register('name')}
          error={errors.name?.message}
          placeholder={kind === 'allowance' ? 'Your own allowance, nothing preset' : 'Your own deduction, nothing preset'}
        />
        <div>
          <label htmlFor="pc-type" className="mb-1.5 block text-sm font-medium text-ink-700">
            Amount type
          </label>
          <select
            id="pc-type"
            {...register('isPercentageOfBase', { setValueAs: (v) => v === 'true' })}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          >
            <option value="false">Fixed amount (UGX)</option>
            <option value="true">Percentage of base salary</option>
          </select>
        </div>
        <FormField
          label={isPercent ? 'Percentage of base salary' : 'Amount (UGX)'}
          type="number"
          min={0}
          {...register('amount', { valueAsNumber: true })}
          error={errors.amount?.message}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
