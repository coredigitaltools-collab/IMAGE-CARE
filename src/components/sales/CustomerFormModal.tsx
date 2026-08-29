import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { FormRow } from '../settings/FormRow'
import { Button } from '../ui/Button'
import { useFindDuplicateCustomers } from '../../features/sales/hooks/useSalesData'
import { useBranches } from '../../features/settings/hooks/useSettingsData'
import { CUSTOMER_STATUSES, CUSTOMER_STATUS_LABELS, PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../../types/sales'
import type { Customer, CustomerInput, CustomerStatus, PaymentMethod } from '../../types/sales'

const schema = z.object({
  name: z.string().trim().min(1, 'Customer name is required.'),
  phone: z.string().trim(),
  email: z.string().trim().email('Enter a valid email address.').or(z.literal('')),
  address: z.string().trim(),
  notes: z.string().trim(),
  status: z.enum(['active', 'vip', 'blacklisted']),
  dateOfBirth: z.string(),
  preferredBranchId: z.string(),
  preferredPaymentMethod: z.string(),
  creditLimit: z.number().min(0, 'Must be 0 or higher.'),
})
type FormValues = z.infer<typeof schema>

interface CustomerFormModalProps {
  initial?: Customer
  title?: string
  submitLabel?: string
  onClose: () => void
  onSubmit: (input: CustomerInput) => Promise<void>
}

function parseTags(text: string): string[] {
  return [...new Set(text.split(',').map((t) => t.trim()).filter(Boolean))]
}

export function CustomerFormModal({ initial, title, submitLabel, onClose, onSubmit }: CustomerFormModalProps) {
  const findDuplicates = useFindDuplicateCustomers()
  const branchesQuery = useBranches()
  const [duplicates, setDuplicates] = useState<Customer[]>([])
  const [confirmedDespiteDuplicates, setConfirmedDespiteDuplicates] = useState(false)
  const [tagsText, setTagsText] = useState(initial?.tags.join(', ') ?? '')
  const [showMoreDetails, setShowMoreDetails] = useState(Boolean(initial))

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? {
          ...initial,
          dateOfBirth: initial.dateOfBirth ?? '',
          preferredBranchId: initial.preferredBranchId ?? '',
          preferredPaymentMethod: initial.preferredPaymentMethod ?? '',
        }
      : {
          name: '',
          phone: '',
          email: '',
          address: '',
          notes: '',
          status: 'active',
          dateOfBirth: '',
          preferredBranchId: '',
          preferredPaymentMethod: '',
          creditLimit: 0,
        },
  })

  const buildInput = (values: FormValues): CustomerInput => ({
    ...values,
    tags: parseTags(tagsText),
    status: values.status as CustomerStatus,
    dateOfBirth: values.dateOfBirth || null,
    preferredBranchId: values.preferredBranchId || null,
    preferredPaymentMethod: (values.preferredPaymentMethod || null) as PaymentMethod | null,
  })

  const submit = handleSubmit(async (values) => {
    if (!initial && !confirmedDespiteDuplicates) {
      const found = await findDuplicates.mutateAsync({ name: values.name, phone: values.phone, email: values.email })
      if (found.length > 0) {
        setDuplicates(found)
        return
      }
    }
    await onSubmit(buildInput(values))
  })

  return (
    <Modal title={title ?? (initial ? 'Edit customer' : 'Add customer')} onClose={onClose} size="lg">
      {/* Modal.tsx now provides the scrollable body itself, so this no
          longer needs its own max-h/overflow wrapper. */}
      <form onSubmit={submit} className="space-y-5">
        <FormRow>
          <FormField label="Customer name" {...register('name')} error={errors.name?.message} />
          <FormField label="Phone" {...register('phone')} error={errors.phone?.message} />
        </FormRow>
        <FormRow>
          <FormField label="Email" type="email" {...register('email')} error={errors.email?.message} />
          <FormField
            id="cf-tags"
            label="Tags"
            value={tagsText}
            onChange={(e) => setTagsText(e.target.value)}
            placeholder="Comma-separated, e.g. Wholesale, Priority"
            hint="Your own labels for grouping customers, nothing preset."
          />
        </FormRow>

        {!showMoreDetails ? (
          <button
            type="button"
            onClick={() => setShowMoreDetails(true)}
            className="text-xs font-medium text-brand-blue-700 hover:underline"
          >
            + Add address, status, and preferences
          </button>
        ) : (
          <>
            <FormField label="Address" {...register('address')} error={errors.address?.message} />
            <FormRow>
              <div>
                <label htmlFor="cf-status" className="mb-1.5 block text-sm font-medium text-ink-700">
                  Status
                </label>
                <select
                  id="cf-status"
                  {...register('status')}
                  className="w-full rounded-md border border-ink-100 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
                >
                  {CUSTOMER_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CUSTOMER_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
              </div>
              <FormField id="cf-dob" label="Date of birth" type="date" {...register('dateOfBirth')} />
            </FormRow>
            <FormRow>
              <div>
                <label htmlFor="cf-branch" className="mb-1.5 block text-sm font-medium text-ink-700">
                  Preferred branch
                </label>
                <select
                  id="cf-branch"
                  {...register('preferredBranchId')}
                  className="w-full rounded-md border border-ink-100 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
                >
                  <option value="">None</option>
                  {(branchesQuery.data ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="cf-payment" className="mb-1.5 block text-sm font-medium text-ink-700">
                  Preferred payment
                </label>
                <select
                  id="cf-payment"
                  {...register('preferredPaymentMethod')}
                  className="w-full rounded-md border border-ink-100 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
                >
                  <option value="">None</option>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
            </FormRow>
            <FormField
              id="cf-credit-limit"
              label="Credit limit (UGX)"
              type="number"
              min={0}
              hint="0 = no explicit limit set."
              {...register('creditLimit', { valueAsNumber: true })}
              error={errors.creditLimit?.message}
            />
            <div>
              <label htmlFor="cf-notes" className="mb-1.5 block text-sm font-medium text-ink-700">
                Description
              </label>
              <textarea
                id="cf-notes"
                {...register('notes')}
                rows={3}
                className="w-full rounded-md border border-ink-100 bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
              />
            </div>
          </>
        )}

        {duplicates.length > 0 && (
          <div className="rounded-md border border-warning-100 bg-warning-100/40 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0 text-warning-700" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-warning-700">
                  Possible existing customer{duplicates.length > 1 ? 's' : ''} found:
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-ink-700">
                  {duplicates.map((d) => (
                    <li key={d.id}>
                      {d.name}
                      {d.phone ? ` · ${d.phone}` : ''}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedDespiteDuplicates(true)
                    setDuplicates([])
                    onSubmit(buildInput(getValues()))
                  }}
                  className="mt-2 text-xs font-medium text-brand-blue-700 hover:underline"
                >
                  Create as a new customer anyway
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || findDuplicates.isPending}>
            {isSubmitting || findDuplicates.isPending ? 'Saving…' : (submitLabel ?? 'Save')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
