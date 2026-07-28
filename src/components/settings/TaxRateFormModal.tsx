import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from './FormField'
import { ToggleRow } from './ToggleRow'
import { Button } from '../ui/Button'
import type { TaxRate, TaxRateInput } from '../../types/settings'

const schema = z.object({
  name: z.string().trim().min(1, 'Tax name is required.'),
  ratePercent: z.number().min(0, 'Rate must be 0 or higher.').max(100, 'Rate must be 100 or lower.'),
  isInclusive: z.boolean(),
  isDefault: z.boolean(),
})

interface TaxRateFormModalProps {
  initial?: TaxRate
  onClose: () => void
  onSubmit: (input: TaxRateInput) => Promise<void>
}

export function TaxRateFormModal({ initial, onClose, onSubmit }: TaxRateFormModalProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<TaxRateInput>({
    resolver: zodResolver(schema),
    defaultValues: initial
      ? { name: initial.name, ratePercent: initial.ratePercent, isInclusive: initial.isInclusive, isDefault: initial.isDefault }
      : { name: '', ratePercent: 0, isInclusive: true, isDefault: false },
  })

  return (
    <Modal title={initial ? 'Edit tax rate' : 'Add tax rate'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Tax name" {...register('name')} error={errors.name?.message} />
        <FormField
          label="Rate (%)"
          type="number"
          step="0.01"
          {...register('ratePercent', { valueAsNumber: true })}
          error={errors.ratePercent?.message}
        />
        <ToggleRow
          label="Tax-inclusive pricing"
          description="Prices already include this tax"
          checked={watch('isInclusive')}
          onChange={(v) => setValue('isInclusive', v, { shouldDirty: true })}
        />
        <ToggleRow
          label="Default tax rate"
          description="Applied automatically to new sales"
          checked={watch('isDefault')}
          onChange={(v) => setValue('isDefault', v, { shouldDirty: true })}
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
