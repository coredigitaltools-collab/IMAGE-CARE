import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import type { Supplier, SupplierInput } from '../../types/inventory'

const schema = z.object({
  name: z.string().trim().min(1, 'Supplier name is required.'),
  contactName: z.string().trim(),
  phone: z.string().trim(),
  email: z.string().trim().email('Enter a valid email address.').or(z.literal('')),
  tin: z.string().trim(),
  address: z.string().trim(),
  notes: z.string().trim(),
  status: z.enum(['active', 'inactive']),
})

interface SupplierFormModalProps {
  initial?: Supplier
  onClose: () => void
  onSubmit: (input: SupplierInput) => Promise<void>
}

export function SupplierFormModal({ initial, onClose, onSubmit }: SupplierFormModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SupplierInput>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? {
      name: '',
      contactName: '',
      phone: '',
      email: '',
      tin: '',
      address: '',
      notes: '',
      status: 'active',
    },
  })

  return (
    <Modal title={initial ? 'Edit supplier' : 'Add supplier'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
        <FormField label="Supplier name" {...register('name')} error={errors.name?.message} />
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Contact name" {...register('contactName')} error={errors.contactName?.message} />
          <FormField label="Phone" {...register('phone')} error={errors.phone?.message} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Email" type="email" {...register('email')} error={errors.email?.message} />
          <FormField label="TIN" {...register('tin')} error={errors.tin?.message} />
        </div>
        <FormField label="Address" {...register('address')} error={errors.address?.message} />
        <div>
          <label htmlFor="sf-notes" className="mb-1.5 block text-sm font-medium text-ink-700">Notes</label>
          <textarea
            id="sf-notes"
            {...register('notes')}
            rows={2}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          />
        </div>
        <div>
          <label htmlFor="sf-status" className="mb-1.5 block text-sm font-medium text-ink-700">Status</label>
          <select
            id="sf-status"
            {...register('status')}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
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
