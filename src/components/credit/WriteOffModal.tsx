import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import { formatCurrency } from '../../lib/format'

const schema = z.object({
  amount: z.number().positive('Enter an amount greater than 0.'),
  reason: z.string().trim().min(1, 'A reason is required to write off a balance.'),
})
type FormValues = z.infer<typeof schema>

interface WriteOffModalProps {
  customerName: string
  outstandingBalance: number
  onClose: () => void
  onSubmit: (input: FormValues) => Promise<void>
  submitError?: string
}

export function WriteOffModal({ customerName, outstandingBalance, onClose, onSubmit, submitError }: WriteOffModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { amount: outstandingBalance, reason: '' } })

  return (
    <Modal title={`Write off balance — ${customerName}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="flex items-start gap-2 rounded-md border border-warning-100 bg-warning-100/40 p-3">
          <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning-700" />
          <p className="text-xs text-warning-700">
            This permanently reduces the customer's balance as bad debt. Outstanding: {formatCurrency(outstandingBalance, 'UGX')}.
          </p>
        </div>
        <FormField label="Amount to write off (UGX)" type="number" {...register('amount', { valueAsNumber: true })} error={errors.amount?.message} />
        <div>
          <label htmlFor="wo-reason" className="mb-1.5 block text-sm font-medium text-ink-700">
            Reason
          </label>
          <textarea
            id="wo-reason"
            {...register('reason')}
            rows={2}
            placeholder="e.g. Customer unreachable, business closed, negotiated settlement"
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
          {errors.reason && <p className="mt-1 text-xs text-brand-red-700">{errors.reason.message}</p>}
        </div>
        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Write off'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
