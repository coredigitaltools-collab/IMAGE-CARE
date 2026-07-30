import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import { formatCurrency } from '../../lib/format'

const schema = z.object({
  newLimit: z.number().min(0, 'Limit cannot be negative.'),
})
type FormValues = z.infer<typeof schema>

interface CreditLimitModalProps {
  customerName: string
  currentLimit: number
  currentBalance: number
  onClose: () => void
  onSubmit: (input: FormValues) => Promise<void>
}

export function CreditLimitModal({ customerName, currentLimit, currentBalance, onClose, onSubmit }: CreditLimitModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { newLimit: currentLimit } })

  return (
    <Modal title={`Approve credit limit — ${customerName}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-500">
          Current limit: <span className="font-medium text-ink-900">{formatCurrency(currentLimit, 'UGX')}</span> · Current balance:{' '}
          <span className="font-medium text-ink-900">{formatCurrency(currentBalance, 'UGX')}</span>
        </p>
        <FormField label="New credit limit (UGX)" type="number" {...register('newLimit', { valueAsNumber: true })} error={errors.newLimit?.message} />
        <p className="text-xs text-ink-500">
          Setting this to 0 blocks all future credit sales for this customer until a limit is approved again.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Approve limit'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
