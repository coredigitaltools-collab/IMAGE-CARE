import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import type { UnitInput, UnitOfMeasure } from '../../types/inventory'

const schema = z.object({
  name: z.string().trim().min(1, 'Unit name is required.'),
  abbreviation: z.string().trim().min(1, 'Abbreviation is required.'),
})

interface UnitFormModalProps {
  initial?: UnitOfMeasure
  onClose: () => void
  onSubmit: (input: UnitInput) => Promise<void>
}

export function UnitFormModal({ initial, onClose, onSubmit }: UnitFormModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UnitInput>({
    resolver: zodResolver(schema),
    defaultValues: { name: initial?.name ?? '', abbreviation: initial?.abbreviation ?? '' },
  })

  return (
    <Modal title={initial ? 'Edit unit' : 'Add unit'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Unit name" {...register('name')} error={errors.name?.message} />
        <FormField label="Abbreviation" {...register('abbreviation')} error={errors.abbreviation?.message} />
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
