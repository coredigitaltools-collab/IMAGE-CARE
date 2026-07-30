import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import { formatCurrency } from '../../lib/format'
import type { CreditPayment } from '../../types/sales'

const METHODS: CreditPayment['method'][] = ['cash', 'mobile_money', 'card', 'bank_transfer']
const METHOD_LABELS: Record<CreditPayment['method'], string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  card: 'Card',
  bank_transfer: 'Bank Transfer',
}

const schema = z.object({
  amount: z.number().positive('Enter an amount greater than 0.'),
  method: z.enum(['cash', 'mobile_money', 'card', 'bank_transfer']),
  reference: z.string().trim(),
})
type FormValues = z.infer<typeof schema>

interface RecordPaymentModalProps {
  customerName: string
  outstandingBalance: number
  onClose: () => void
  onSubmit: (input: FormValues) => Promise<void>
  submitError?: string
}

export function RecordPaymentModal({ customerName, outstandingBalance, onClose, onSubmit, submitError }: RecordPaymentModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { amount: outstandingBalance, method: 'cash', reference: '' } })

  return (
    <Modal title={`Record payment — ${customerName}`} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-500">
          Outstanding balance: <span className="font-medium text-ink-900">{formatCurrency(outstandingBalance, 'UGX')}</span>
        </p>
        <FormField label="Amount received (UGX)" type="number" {...register('amount', { valueAsNumber: true })} error={errors.amount?.message} />
        <div>
          <label htmlFor="pay-method" className="mb-1.5 block text-sm font-medium text-ink-700">
            Payment method
          </label>
          <select
            id="pay-method"
            {...register('method')}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          >
            {METHODS.map((m) => (
              <option key={m} value={m}>
                {METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
        <FormField label="Reference (optional)" {...register('reference')} error={errors.reference?.message} placeholder="Receipt or transaction number" />
        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Record payment'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
