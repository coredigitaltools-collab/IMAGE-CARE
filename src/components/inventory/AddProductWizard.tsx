import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Check, Upload } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { CategoryQuickSelect } from './CategoryQuickSelect'
import { FormField } from '../settings/FormField'
import { Button } from '../ui/Button'
import { formatCurrency } from '../../lib/format'
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

const STEPS = [
  { title: 'Basic info', fields: ['name', 'sku', 'barcode', 'categoryId', 'brandId'] as const },
  { title: 'Pricing & stock', fields: ['unitId', 'buyingPrice', 'sellingPrice', 'reorderLevel', 'openingStock'] as const },
  { title: 'Supplier & details', fields: ['supplierId', 'description', 'notes'] as const },
  { title: 'Review', fields: [] as const },
]

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

export function AddProductWizard({ categories, brands, units, suppliers, generatedSku, userId, onClose, onSubmit, submitError }: AddProductWizardProps) {
  const [step, setStep] = useState(0)
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    trigger,
    watch,
    setValue,
    formState: { errors },
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

  const values = watch()
  const categoryName = categories.find((c) => c.id === values.categoryId)?.name ?? '-'
  const brandName = brands.find((b) => b.id === values.brandId)?.name ?? 'None'
  const unitName = units.find((u) => u.id === values.unitId)?.name ?? '-'
  const supplierName = suppliers.find((s) => s.id === values.supplierId)?.name ?? 'None'

  const handleImageChange = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setImageDataUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  const goNext = async () => {
    const fieldsToValidate = STEPS[step].fields
    const valid = fieldsToValidate.length === 0 ? true : await trigger(fieldsToValidate as unknown as (keyof FormValues)[])
    if (valid) setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }
  const goBack = () => setStep((s) => Math.max(s - 1, 0))

  const submit = handleSubmit(async (v) => {
    await onSubmit({ ...v, imageDataUrl, branch_id: null, taxRateId: null })
  })

  const isLastStep = step === STEPS.length - 1

  return (
    <Modal title="Add product" onClose={onClose}>
      {/* Step indicator */}
      <div className="mb-5 flex items-center">
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  i < step
                    ? 'bg-success-500 text-white'
                    : i === step
                      ? 'bg-brand-blue-700 text-white'
                      : 'bg-ink-100 text-ink-500'
                }`}
              >
                {i < step ? <Check size={13} /> : i + 1}
              </div>
              <span className={`hidden text-[10px] sm:block ${i === step ? 'font-medium text-brand-blue-700' : 'text-ink-500'}`}>
                {s.title}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`mx-1 h-0.5 flex-1 ${i < step ? 'bg-success-500' : 'bg-ink-100'}`} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={submit} className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        {step === 0 && (
          <>
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
              <FormField label="SKU" {...register('sku')} error={errors.sku?.message} />
              <FormField label="Barcode" {...register('barcode')} error={errors.barcode?.message} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CategoryQuickSelect
                id="w-category"
                categories={categories}
                value={watch('categoryId')}
                onChange={(id) => setValue('categoryId', id, { shouldValidate: true, shouldDirty: true })}
                userId={userId}
                error={errors.categoryId?.message}
              />
              <div>
                <label htmlFor="w-brand" className="mb-1.5 block text-sm font-medium text-ink-700">Brand</label>
                <select id="w-brand" {...register('brandId')} className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500">
                  <option value="">None</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div>
              <label htmlFor="w-unit" className="mb-1.5 block text-sm font-medium text-ink-700">Unit</label>
              <select id="w-unit" {...register('unitId')} className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500">
                {units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
              </select>
              {errors.unitId && <p className="mt-1 text-xs text-brand-red-700">{errors.unitId.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Buying price (UGX)" type="number" {...register('buyingPrice', { valueAsNumber: true })} error={errors.buyingPrice?.message} />
              <FormField label="Selling price (UGX)" type="number" {...register('sellingPrice', { valueAsNumber: true })} error={errors.sellingPrice?.message} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Reorder level" type="number" {...register('reorderLevel', { valueAsNumber: true })} error={errors.reorderLevel?.message} />
              <FormField label="Opening stock" type="number" {...register('openingStock', { valueAsNumber: true })} error={errors.openingStock?.message} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div>
              <label htmlFor="w-supplier" className="mb-1.5 block text-sm font-medium text-ink-700">Supplier</label>
              <select id="w-supplier" {...register('supplierId')} className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500">
                <option value="">None</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="w-description" className="mb-1.5 block text-sm font-medium text-ink-700">Description</label>
              <textarea id="w-description" {...register('description')} rows={2} className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500" />
            </div>
            <div>
              <label htmlFor="w-notes" className="mb-1.5 block text-sm font-medium text-ink-700">Notes</label>
              <textarea id="w-notes" {...register('notes')} rows={2} className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500" />
            </div>
          </>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-md border border-ink-100 p-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-ink-50">
                {imageDataUrl ? <img src={imageDataUrl} alt="" className="h-full w-full object-cover" /> : <Upload size={16} className="text-ink-300" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink-900">{values.name || 'Untitled product'}</p>
                <p className="text-xs text-ink-500">{values.sku} · {categoryName} · {brandName}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-md border border-ink-100 p-3 text-sm">
              <div><dt className="text-xs text-ink-500">Buying price</dt><dd className="text-ink-900">{formatCurrency(values.buyingPrice || 0, 'UGX')}</dd></div>
              <div><dt className="text-xs text-ink-500">Selling price</dt><dd className="text-ink-900">{formatCurrency(values.sellingPrice || 0, 'UGX')}</dd></div>
              <div><dt className="text-xs text-ink-500">Opening stock</dt><dd className="text-ink-900">{values.openingStock} {unitName}</dd></div>
              <div><dt className="text-xs text-ink-500">Reorder level</dt><dd className="text-ink-900">{values.reorderLevel}</dd></div>
              <div><dt className="text-xs text-ink-500">Supplier</dt><dd className="text-ink-900">{supplierName}</dd></div>
              <div><dt className="text-xs text-ink-500">Barcode</dt><dd className="text-ink-900">{values.barcode || '-'}</dd></div>
            </dl>
            {values.description && <p className="text-xs text-ink-500">{values.description}</p>}
          </div>
        )}

        {submitError && <p className="text-sm text-brand-red-700">{submitError}</p>}

        <div className="flex justify-between gap-2 pt-2">
          {step > 0 ? (
            <Button type="button" variant="secondary" onClick={goBack}>Back</Button>
          ) : (
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          )}
          {isLastStep ? (
            <Button type="button" onClick={() => submit()}>Create product</Button>
          ) : (
            <Button type="button" onClick={goNext}>Next</Button>
          )}
        </div>
      </form>
    </Modal>
  )
}
