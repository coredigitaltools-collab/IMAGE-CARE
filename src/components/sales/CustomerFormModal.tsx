import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import { useFindDuplicateCustomers } from '../../features/sales/hooks/useSalesData'
import type { Customer, CustomerInput } from '../../types/sales'

const schema = z.object({
  name: z.string().trim().min(1, 'Customer name is required.'),
  phone: z.string().trim(),
  email: z.string().trim().email('Enter a valid email address.').or(z.literal('')),
  address: z.string().trim(),
  notes: z.string().trim(),
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
  const [duplicates, setDuplicates] = useState<Customer[]>([])
  const [confirmedDespiteDuplicates, setConfirmedDespiteDuplicates] = useState(false)
  const [tagsText, setTagsText] = useState(initial?.tags.join(', ') ?? '')

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? { name: '', phone: '', email: '', address: '', notes: '' },
  })

  const buildInput = (values: FormValues): CustomerInput => ({ ...values, tags: parseTags(tagsText) })

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
    <Modal title={title ?? (initial ? 'Edit customer' : 'Add customer')} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <FormField label="Customer name" {...register('name')} error={errors.name?.message} />
        <FormField label="Phone" {...register('phone')} error={errors.phone?.message} />
        <FormField label="Email" type="email" {...register('email')} error={errors.email?.message} />
        <FormField label="Address" {...register('address')} error={errors.address?.message} />
        <FormField
          id="cf-tags"
          label="Tags"
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          placeholder="Comma-separated, e.g. Wholesale, Priority"
          hint="Your own labels for grouping customers — nothing preset."
        />
        <div>
          <label htmlFor="cf-notes" className="mb-1.5 block text-sm font-medium text-ink-700">
            Notes
          </label>
          <textarea
            id="cf-notes"
            {...register('notes')}
            rows={2}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          />
        </div>

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
