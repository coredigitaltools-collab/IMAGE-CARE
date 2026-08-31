import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { Upload } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { CategoryQuickSelect } from './CategoryQuickSelect'
import { FormField } from '../settings/FormField'
import { NumberField } from '../ui/NumberField'
import { Button } from '../ui/Button'
import type { Brand, Category, ProductInput, Supplier, UnitOfMeasure } from '../../types/inventory'

const schema = z.object({
  name: z.string().trim().min(1, 'Product name is required.'),
  sku: z.string().trim().min(1, 'SKU is required.'),
  barcode: z.string().trim(),
  categoryId: z.string().min(1, 'Select a category.'),
  brandId: z.string(),
  unitId: z.string().min(1, 'Select a unit.'),
  buyingPrice: z.number().min(0, 'Must be 0 or higher.'),
  sellingPrice: z.number().min(0, 'Must be 0 or higher.'),
  reorderLevel: z.number().min(0, 'Must be 0 or higher.'),
  openingStock: z.number().min(0, 'Must be 0 or higher.'),
  supplierId: z.string(),
  description: z.string(),
  notes: z.string(),
})

type FormValues = z.infer<typeof schema>

interface AddProductWizardProps {
  categories: Category[]
  brands: Brand[]
  units: UnitOfMeasure[]
  suppliers: Supplier[]
  generatedSku?: string
  userId: string
  onClose: () => void
  onSubmit: (input: ProductInput) => Promise<void>
  submitError?: string
}

// 2026-08-31: collapsed from a 4-step wizard (Basic Info -> Pricing & Stock
// -> Supplier & Details -> Review, with Next/Back navigation) into one
// scrollable form, at the user's explicit direction that adding a single
// product shouldn't require understanding the app's internal step
// structure first. All 13 fields are unchanged - only the navigation is
// gone. Fields stay grouped under plain section labels (Product info /
// Pricing & stock / Supplier & details) so the form is still easy to scan,
// and the modal keeps its existing size (`size="lg"`, unchanged) with the
// same scrollable-body pattern ProductFormModal already uses.
export function AddProductWizard({ categories, brands, units, suppliers, generatedSku, userId, onClose, onSubmit, submitError }: AddProductWizardProps) {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      sku: '',
      barcode: '',
      categoryId: categories[0]?.id ?? '',
      brandId: '',
      unitId: units[0]?.id ?? '',
      buyingPrice: 0,
      sellingPrice: 0,
      reorderLevel: 10,
      openingStock: 0,
      supplierId: '',
      description: '',
      notes: '',
    },
  })

  useEffect(() => {
    if (generatedSku) setValue('sku', generatedSku)
  }, [generatedSku, setValue])

  const handleImageChange = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageDataUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  const submit = handleSubmit(async (v) => {
    await onSubmit({ ...v, imageDataUrl, branch_id: null, taxRateId: null })
  })

  return (
    <Modal title="Add product" onClose={onClose} size="lg">
      <form onSubmit={submit} className="max-h-[70vh] space-y-6 overflow-y-auto pr-1">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Product info</p>
          <div className="space-y-4">
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
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageChange(e.target.files?.[0])} />
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
              <Controller
                name="categoryId"
                control={control}
                render={({ field }) => (
                  <CategoryQuickSelect
                    id="w-category"
                    categories={categories}
                    value={field.value}
                    onChange={field.onChange}
                    userId={userId}
                    error={errors.categoryId?.message}
                  />
                )}
              />
              <div>
                <label htmlFor="w-brand" className="mb-1.5 block text-sm font-medium text-ink-700">Brand</label>
                <select id="w-brand" {...register('brandId')} className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500">
                  <option value="">None</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-ink-100 pt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Pricing &amp; stock</p>
          <div className="space-y-4">
            {/* Unit is locked to Piece - not user-configurable */}
            <input type="hidden" {...register('unitId')} value={units[0]?.id ?? 'piece'} />
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="buyingPrice"
                control={control}
                render={({ field }) => (
                  <NumberField label="Buying price (UGX)" value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={errors.buyingPrice?.message} />
                )}
              />
              <Controller
                name="sellingPrice"
                control={control}
                render={({ field }) => (
                  <NumberField label="Selling price (UGX)" value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={errors.sellingPrice?.message} />
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Controller
                name="reorderLevel"
                control={control}
                render={({ field }) => (
                  <NumberField
                    label="Reorder level"
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    error={errors.reorderLevel?.message}
                    hint="Alerts you to restock at or below this."
                  />
                )}
              />
              <Controller
                name="openingStock"
                control={control}
                render={({ field }) => (
                  <NumberField label="Opening stock" value={field.value} onChange={field.onChange} onBlur={field.onBlur} error={errors.openingStock?.message} />
                )}
              />
            </div>
          </div>
        </div>

        <div className="border-t border-ink-100 pt-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Supplier &amp; details</p>
          <div className="space-y-4">
            <div>
              <label htmlFor="w-supplier" className="mb-1.5 block text-sm font-medium text-ink-700">Supplier (optional)</label>
              <select id="w-supplier" {...register('supplierId')} className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500">
                <option value="">None</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="w-description" className="mb-1.5 block text-sm font-medium text-ink-700">Description (optional)</label>
              <textarea id="w-description" {...register('description')} rows={2} className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500" />
            </div>
            <div>
              <label htmlFor="w-notes" className="mb-1.5 block text-sm font-medium text-ink-700">Notes (optional)</label>
              <textarea id="w-notes" {...register('notes')} rows={2} className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500" />
            </div>
          </div>
        </div>

        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}

        <div className="flex justify-end gap-2 border-t border-ink-100 pt-4">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Save product'}</Button>
        </div>
      </form>
    </Modal>
  )
}
