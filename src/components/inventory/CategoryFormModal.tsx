import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import type { Category, CategoryInput } from '../../types/inventory'

const schema = z.object({ name: z.string().trim().min(1, 'Category name is required.') })

interface CategoryFormModalProps {
  initial?: Category
  onClose: () => void
  onSubmit: (input: CategoryInput) => Promise<void>
}

export function CategoryFormModal({ initial, onClose, onSubmit }: CategoryFormModalProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CategoryInput>({ resolver: zodResolver(schema), defaultValues: { name: initial?.name ?? '' } })

  return (
    <Modal title={initial ? 'Edit category' : 'Add category'} onClose={onClose}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <FormField label="Category name" {...register('name')} error={errors.name?.message} />
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

interface MergeCategoryModalProps {
  categories: Category[]
  source: Category
  onClose: () => void
  onMerge: (targetId: string) => Promise<void>
}

export function MergeCategoryModal({ categories, source, onClose, onMerge }: MergeCategoryModalProps) {
  const options = categories.filter((c) => c.id !== source.id)
  const [targetId, setTargetId] = useState(options[0]?.id ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleConfirm = async () => {
    if (!targetId) return
    setIsSubmitting(true)
    await onMerge(targetId)
    setIsSubmitting(false)
  }

  return (
    <Modal title={`Merge "${source.name}" into…`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-ink-500">
          Every product currently in "{source.name}" will move to the category you pick below. "{source.name}" will
          then be archived.
        </p>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
        >
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="danger" onClick={handleConfirm} disabled={isSubmitting || !targetId}>
            {isSubmitting ? 'Merging…' : 'Merge'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
