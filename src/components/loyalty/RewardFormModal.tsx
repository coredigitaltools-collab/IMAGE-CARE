import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import type { LoyaltyReward, LoyaltyRewardInput } from '../../types/loyalty'

const schema = z.object({
  name: z.string().trim().min(1, 'Reward name is required.'),
  description: z.string().trim(),
  pointsCost: z.number().min(1, 'Must cost at least 1 point.'),
  valueUgx: z.number().min(0, 'Must be 0 or higher.'),
})
type FormValues = z.infer<typeof schema>

interface RewardFormModalProps {
  initial?: LoyaltyReward
  onClose: () => void
  onSubmit: (input: LoyaltyRewardInput) => Promise<void>
}

export function RewardFormModal({ initial, onClose, onSubmit }: RewardFormModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial ?? { name: '', description: '', pointsCost: 100, valueUgx: 0 },
  })

  return (
    <Modal title={initial ? 'Edit reward' : 'New reward'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Reward name" {...register('name')} error={errors.name?.message} placeholder="Your own reward, nothing preset" />
        <div>
          <label htmlFor="rw-desc" className="mb-1.5 block text-sm font-medium text-ink-700">
            Description
          </label>
          <textarea
            id="rw-desc"
            {...register('description')}
            rows={2}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Points cost" type="number" {...register('pointsCost', { valueAsNumber: true })} error={errors.pointsCost?.message} />
          <FormField label="Cash value (UGX)" type="number" {...register('valueUgx', { valueAsNumber: true })} error={errors.valueUgx?.message} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Save reward'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
