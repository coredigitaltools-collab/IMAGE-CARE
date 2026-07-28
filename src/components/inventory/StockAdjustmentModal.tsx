import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import type { Product, StockAdjustmentInput } from '../../types/inventory'

const schema = z.object({
  productId: z.string().min(1, 'Select a product.'),
  direction: z.enum(['in', 'out']),
  quantity: z.number().int().positive('Enter a quantity greater than 0.'),
  reason: z.string().trim().min(1, 'A reason is required for every adjustment.'),
})

type FormValues = z.infer<typeof schema>

interface StockAdjustmentModalProps {
  products: Product[]
  presetProductId?: string
  onClose: () => void
  onSubmit: (input: StockAdjustmentInput) => Promise<void>
  submitError?: string
}

export function StockAdjustmentModal({ products, presetProductId, onClose, onSubmit, submitError }: StockAdjustmentModalProps) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { productId: presetProductId ?? products[0]?.id ?? '', direction: 'in', quantity: 1, reason: '' },
  })

  const selectedProduct = products.find((p) => p.id === watch('productId'))

  const submit = handleSubmit(async (values) => {
    const quantityChange = values.direction === 'in' ? values.quantity : -values.quantity
    await onSubmit({ productId: values.productId, quantityChange, reason: values.reason })
  })

  return (
    <Modal title="Record stock adjustment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="adj-product" className="mb-1.5 block text-sm font-medium text-ink-700">Product</label>
          <select
            id="adj-product"
            {...register('productId')}
            disabled={Boolean(presetProductId)}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500 disabled:bg-ink-50"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
          {selectedProduct && <p className="mt-1 text-xs text-ink-500">Current stock: {selectedProduct.currentStock}</p>}
        </div>

        <div>
          <label htmlFor="adj-direction" className="mb-1.5 block text-sm font-medium text-ink-700">Direction</label>
          <select
            id="adj-direction"
            {...register('direction')}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          >
            <option value="in">Stock in (add)</option>
            <option value="out">Stock out (remove)</option>
          </select>
        </div>

        <FormField
          label="Quantity"
          type="number"
          min={1}
          {...register('quantity', { valueAsNumber: true })}
          error={errors.quantity?.message}
        />

        <div>
          <label htmlFor="adj-reason" className="mb-1.5 block text-sm font-medium text-ink-700">Reason</label>
          <textarea
            id="adj-reason"
            {...register('reason')}
            rows={2}
            placeholder="e.g. Damaged in storage, physical count correction, transfer in"
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          />
          {errors.reason && <p className="mt-1 text-xs text-brand-red-700">{errors.reason.message}</p>}
        </div>

        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Record adjustment'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
