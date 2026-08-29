import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Upload } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import type { Brand, Category, ProductInput, Supplier, UnitOfMeasure } from '../../types/inventory'

const schema = z.object({
  name: z.string().trim().min(1, 'Product name is required.'),
  sku: z.string().trim().min(1, 'SKU is required.'),
  barcode: z.string().trim(),
  categoryId: z.string().min(1, 'Select a category.'),
  brandId: z.string(),
  unitId: z.string().min(1, 'Select a unit.'),
  supplierId: z.string(),
  description: z.string(),
  notes: z.string(),
  buyingPrice: z.number().min(0, 'Must be 0 or higher.'),
  sellingPrice: z.number().min(0, 'Must be 0 or higher.'),
  reorderLevel: z.number().min(0, 'Must be 0 or higher.'),
  openingStock: z.number().min(0, 'Must be 0 or higher.'),
})

type FormValues = z.infer<typeof schema>

interface ProductFormModalProps {
  categories: Category[]
  brands: Brand[]
  units: UnitOfMeasure[]
  suppliers: Supplier[]
  initial?: Partial<FormValues> & { imageDataUrl?: string | null }
  isEditing?: boolean
  generatedSku?: string
  onClose: () => void
  onSubmit: (input: ProductInput) => Promise<void>
  submitError?: string
}

export function ProductFormModal({
  categories,
  brands,
  units,
  suppliers,
  initial,
  isEditing,
  generatedSku,
  onClose,
  onSubmit,
  submitError,
}: ProductFormModalProps) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(initial?.imageDataUrl ?? null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name ?? '',
      sku: initial?.sku ?? generatedSku ?? '',
      barcode: initial?.barcode ?? '',
      categoryId: initial?.categoryId ?? categories[0]?.id ?? '',
      brandId: initial?.brandId ?? '',
      unitId: initial?.unitId ?? units[0]?.id ?? '',
      supplierId: initial?.supplierId ?? '',
      description: initial?.description ?? '',
      notes: initial?.notes ?? '',
      buyingPrice: initial?.buyingPrice ?? 0,
      sellingPrice: initial?.sellingPrice ?? 0,
      reorderLevel: initial?.reorderLevel ?? 10,
      openingStock: initial?.openingStock ?? 0,
    },
  })

  useEffect(() => {
    if (generatedSku && !initial?.sku) setValue('sku', generatedSku)
  }, [generatedSku, initial?.sku, setValue])

  const handleImageChange = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageDataUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  const submit = handleSubmit(async (values) => {
    await onSubmit({ ...values, imageDataUrl, branch_id: null, taxRateId: null })
  })

  return (
    <Modal title={isEditing ? 'Edit product' : 'Add product'} onClose={onClose} size="lg">
      <form onSubmit={submit} className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <div className="flex items-center gap-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink-100 bg-ink-50">
            {imageDataUrl ? (
              <img src={imageDataUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Upload size={18} className="text-ink-300" />
            )}
          </div>
          <label className="cursor-pointer rounded-md border border-ink-100 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
            Upload image
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleImageChange(e.target.files?.[0])}
            />
          </label>
        </div>

        <FormField label="Product name" {...register('name')} error={errors.name?.message} />

        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="SKU"
            {...register('sku')}
            error={errors.sku?.message}
            hint="Auto-filled, editable."
          />
          <FormField
            label="Barcode (optional)"
            {...register('barcode')}
            error={errors.barcode?.message}
            hint="For scanning at checkout."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="pf-category" className="mb-1.5 block text-sm font-medium text-ink-700">Category</label>
            <select
              id="pf-category"
              {...register('categoryId')}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {errors.categoryId && <p className="mt-1 text-xs text-brand-red-700">{errors.categoryId.message}</p>}
          </div>
          <div>
            <label htmlFor="pf-brand" className="mb-1.5 block text-sm font-medium text-ink-700">Brand</label>
            <select
              id="pf-brand"
              {...register('brandId')}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
            >
              <option value="">None</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div style={{ display: 'none' }}>
            {/* Unit locked to Piece for Stage 5 */}
            <input type="hidden" {...register('unitId')} value={units[0]?.id ?? 'piece'} />
          </div>
          <div>
            <label htmlFor="pf-supplier" className="mb-1.5 block text-sm font-medium text-ink-700">Supplier</label>
            <select
              id="pf-supplier"
              {...register('supplierId')}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
            >
              <option value="">None</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="pf-description" className="mb-1.5 block text-sm font-medium text-ink-700">Description</label>
          <textarea
            id="pf-description"
            {...register('description')}
            rows={2}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Buying price (UGX)"
            type="number"
            step="1"
            {...register('buyingPrice', { valueAsNumber: true })}
            error={errors.buyingPrice?.message}
          />
          <FormField
            label="Selling price (UGX)"
            type="number"
            step="1"
            {...register('sellingPrice', { valueAsNumber: true })}
            error={errors.sellingPrice?.message}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField
            label="Reorder level"
            type="number"
            {...register('reorderLevel', { valueAsNumber: true })}
            error={errors.reorderLevel?.message}
            hint="Alerts you to restock at or below this."
          />
          <FormField
            label={isEditing ? 'Opening stock (historical)' : 'Opening stock'}
            type="number"
            disabled={isEditing}
            {...register('openingStock', { valueAsNumber: true })}
            error={errors.openingStock?.message}
            hint={isEditing ? 'Use Stock Adjustments to change quantity after creation.' : undefined}
          />
        </div>

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
