import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from './FormField'
import { Button } from '../ui/Button'
import type { BranchInput, BranchRecord } from '../../types/settings'

const schema = z.object({
  name: z.string().trim().min(1, 'Branch name is required.'),
  code: z.string().trim().min(2, 'Branch code must be at least 2 characters.'),
  address: z.string().trim(),
  phone: z.string().trim(),
})

interface BranchFormModalProps {
  initial?: BranchRecord
  onClose: () => void
  onSubmit: (input: BranchInput) => Promise<void>
  submitError?: string
}

export function BranchFormModal({ initial, onClose, onSubmit, submitError }: BranchFormModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BranchInput>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? { name: initial.name, code: initial.code, address: initial.address, phone: initial.phone }
      : { name: '', code: '', address: '', phone: '' },
  })

  return (
    <Modal title={initial ? 'Edit branch' : 'Add branch'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Branch name" {...register('name')} error={errors.name?.message} />
        <FormField
          label="Branch code"
          {...register('code')}
          error={errors.code?.message}
          hint="Must be unique, e.g. KLA-01"
        />
        <FormField label="Address" {...register('address')} error={errors.address?.message} />
        <FormField label="Phone" {...register('phone')} error={errors.phone?.message} />

        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}

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
