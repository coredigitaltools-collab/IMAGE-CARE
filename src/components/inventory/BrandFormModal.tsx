import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import type { Brand, BrandInput } from '../../types/inventory'

const schema = z.object({ name: z.string().trim().min(1, 'Brand name is required.') })

interface BrandFormModalProps {
  initial?: Brand
  onClose: () => void
  onSubmit: (input: BrandInput) => Promise<void>
}

export function BrandFormModal({ initial, onClose, onSubmit }: BrandFormModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<BrandInput>({ resolver: zodResolver(schema), defaultValues: { name: initial?.name ?? '' } })

  return (
    <Modal title={initial ? 'Edit brand' : 'Add brand'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Brand name" {...register('name')} error={errors.name?.message} />
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
