import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Archive, ArchiveRestore, Copy, Printer, ShoppingBag, Truck as TruckIcon } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { BarcodeDisplay } from '../../components/inventory/BarcodeDisplay'
import { CategoryQuickSelect } from '../../components/inventory/CategoryQuickSelect'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatRelativeTime } from '../../lib/format'
import {
  useArchiveProduct,
  useBrands,
  useCategories,
  useDuplicateProduct,
  useProduct,
  useReactivateProduct,
  useStockMovements,
  useSuppliers,
  useUpdateProduct,
} from '../../features/inventory/hooks/useInventoryData'
import { DuplicateBarcodeError, DuplicateSkuError } from '../../services/productService'
import type { ProductInput } from '../../types/inventory'

const TABS = ['General', 'Pricing', 'Stock', 'Movement History', 'Purchase History', 'Sales History', 'Supplier', 'Notes', 'Audit Log'] as const
type Tab = (typeof TABS)[number]

const generalSchema = z.object({
  name: z.string().trim().min(1, 'Product name is required.'),
  sku: z.string().trim().min(1, 'SKU is required.'),
  barcode: z.string().trim(),
  categoryId: z.string().min(1),
  brandId: z.string(),
  unitId: z.string().min(1),
  description: z.string(),
})

const pricingSchema = z.object({
  buyingPrice: z.number().min(0),
  sellingPrice: z.number().min(0),
  reorderLevel: z.number().min(0),
})

export function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('General')

  const productQuery = useProduct(id)
  const categoriesQuery = useCategories()
  const brandsQuery = useBrands()
  const suppliersQuery = useSuppliers()
  const movementsQuery = useStockMovements(id)
  const updateProduct = useUpdateProduct(user.id)
  const archiveProduct = useArchiveProduct(user.id)
  const reactivateProduct = useReactivateProduct(user.id)
  const duplicateProduct = useDuplicateProduct(user.id)

  const product = productQuery.data

  const generalForm = useForm<z.infer<typeof generalSchema>>({
    resolver: zodResolver(generalSchema),
    values: product
      ? {
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          categoryId: product.categoryId,
          brandId: product.brandId ?? '',
          unitId: product.unitId,
          description: product.description,
        }
      : undefined,
  })

  const pricingForm = useForm<z.infer<typeof pricingSchema>>({
    resolver: zodResolver(pricingSchema),
    values: product
      ? { buyingPrice: product.buyingPrice, sellingPrice: product.sellingPrice, reorderLevel: product.reorderLevel }
      : undefined,
  })

  const [notes, setNotes] = useState(product?.notes ?? '')
  useState(() => {
    if (product) setNotes(product.notes)
  })

  if (productQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-96 w-full" />
      </div>
    )
  }

  if (!product) {
    return (
      <div className="mx-auto max-w-4xl">
        <EmptyState icon={ShoppingBag} title="Product not found" description="It may have been removed." />
      </div>
    )
  }

  const buildInput = (overrides: Partial<ProductInput>): ProductInput => ({
    name: product.name,
    sku: product.sku,
    barcode: product.barcode,
    imageDataUrl: product.imageDataUrl,
    categoryId: product.categoryId,
    brandId: product.brandId,
    unitId: product.unitId,
    supplierId: product.supplierId,
    description: product.description,
    notes: product.notes,
    buyingPrice: product.buyingPrice,
    sellingPrice: product.sellingPrice,
    taxRateId: product.taxRateId,
    reorderLevel: product.reorderLevel,
    openingStock: product.openingStock,
    branch_id: product.branch_id,
    ...overrides,
  })

  const saveGeneral = generalForm.handleSubmit(async (values) => {
    try {
      await updateProduct.mutateAsync({ id: product.id, input: buildInput(values) })
      showToast('Product details saved.', 'success')
    } catch (err) {
      showToast(err instanceof DuplicateSkuError || err instanceof DuplicateBarcodeError ? err.message : 'Could not save changes.')
    }
  })

  const savePricing = pricingForm.handleSubmit(async (values) => {
    await updateProduct.mutateAsync({ id: product.id, input: buildInput(values) })
    showToast('Pricing saved.', 'success')
  })

  const saveNotes = async () => {
    await updateProduct.mutateAsync({ id: product.id, input: buildInput({ notes }) })
    showToast('Notes saved.', 'success')
  }

  const supplier = suppliersQuery.data?.find((s) => s.id === product.supplierId)

  return (
    <div className="mx-auto max-w-4xl">
      <SettingsPageHeader
        title={product.name}
        description={`${product.sku} · ${product.status === 'active' ? 'Active' : 'Archived'}`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={14} /> Print barcode
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                const copy = await duplicateProduct.mutateAsync(product.id)
                showToast('Product duplicated.', 'success')
                navigate(`/inventory/products/${copy.id}`)
              }}
            >
              <Copy size={14} /> Duplicate
            </Button>
            {product.status === 'active' ? (
              <Button
                variant="danger"
                onClick={async () => {
                  await archiveProduct.mutateAsync(product.id)
                  showToast('Product archived.', 'success')
                }}
              >
                <Archive size={14} /> Archive
              </Button>
            ) : (
              <Button
                onClick={async () => {
                  await reactivateProduct.mutateAsync(product.id)
                  showToast('Product reactivated.', 'success')
                }}
              >
                <ArchiveRestore size={14} /> Reactivate
              </Button>
            )}
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 border-b border-ink-100">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? 'border-b-2 border-brand-blue-700 px-3 py-2 text-sm font-medium text-brand-blue-700'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-ink-500 hover:text-ink-900'
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'General' && (
        <Card className="p-5">
          <form onSubmit={saveGeneral} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pd-name" className="mb-1.5 block text-sm font-medium text-ink-700">Name</label>
                <input
                  id="pd-name"
                  {...generalForm.register('name')}
                  className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm shadow-card focus:border-brand-blue-500"
                />
              </div>
              <div>
                <label htmlFor="pd-sku" className="mb-1.5 block text-sm font-medium text-ink-700">SKU</label>
                <input
                  id="pd-sku"
                  {...generalForm.register('sku')}
                  className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm shadow-card focus:border-brand-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <CategoryQuickSelect
                id="pd-category"
                categories={categoriesQuery.data ?? []}
                value={generalForm.watch('categoryId')}
                onChange={(id) => generalForm.setValue('categoryId', id, { shouldValidate: true, shouldDirty: true })}
                userId={user.id}
                error={generalForm.formState.errors.categoryId?.message}
              />
              <div>
                <label htmlFor="pd-brand" className="mb-1.5 block text-sm font-medium text-ink-700">Brand</label>
                <select
                  id="pd-brand"
                  {...generalForm.register('brandId')}
                  className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm shadow-card focus:border-brand-blue-500"
                >
                  <option value="">None</option>
                  {brandsQuery.data?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="pd-description" className="mb-1.5 block text-sm font-medium text-ink-700">Description</label>
              <textarea
                id="pd-description"
                {...generalForm.register('description')}
                rows={3}
                className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm shadow-card focus:border-brand-blue-500"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Card>
      )}

      {tab === 'Pricing' && (
        <Card className="p-5">
          <form onSubmit={savePricing} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pd-buying" className="mb-1.5 block text-sm font-medium text-ink-700">Buying price (UGX)</label>
                <input
                  id="pd-buying"
                  type="number"
                  {...pricingForm.register('buyingPrice', { valueAsNumber: true })}
                  className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm shadow-card focus:border-brand-blue-500"
                />
              </div>
              <div>
                <label htmlFor="pd-selling" className="mb-1.5 block text-sm font-medium text-ink-700">Selling price (UGX)</label>
                <input
                  id="pd-selling"
                  type="number"
                  {...pricingForm.register('sellingPrice', { valueAsNumber: true })}
                  className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm shadow-card focus:border-brand-blue-500"
                />
              </div>
            </div>
            <div className="w-1/2 pr-1.5">
              <label htmlFor="pd-reorder" className="mb-1.5 block text-sm font-medium text-ink-700">Reorder level</label>
              <input
                id="pd-reorder"
                type="number"
                {...pricingForm.register('reorderLevel', { valueAsNumber: true })}
                className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm shadow-card focus:border-brand-blue-500"
              />
            </div>
            <p className="text-xs text-ink-500">
              Margin: {product.sellingPrice > 0 ? (((product.sellingPrice - product.buyingPrice) / product.sellingPrice) * 100).toFixed(1) : '0'}%
            </p>
            <div className="flex justify-end">
              <Button type="submit">Save changes</Button>
            </div>
          </form>
        </Card>
      )}

      {tab === 'Stock' && (
        <Card className="p-5">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-semibold text-ink-900">{product.currentStock}</p>
              <p className="text-xs text-ink-500">Current stock</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-ink-900">{product.reorderLevel}</p>
              <p className="text-xs text-ink-500">Reorder level</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-ink-900">{product.openingStock}</p>
              <p className="text-xs text-ink-500">Opening stock</p>
            </div>
          </div>
          {product.currentStock <= product.reorderLevel && (
            <p className="mt-4 rounded-md bg-brand-red-50 p-3 text-center text-xs font-medium text-brand-red-700">
              Stock is at or below the reorder level.
            </p>
          )}
        </Card>
      )}

      {tab === 'Movement History' && (
        <Card className="p-5">
          {movementsQuery.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (movementsQuery.data ?? []).length === 0 ? (
            <EmptyState icon={ShoppingBag} title="No movements yet" description="Stock changes for this product will appear here." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {(movementsQuery.data ?? []).map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <span className="font-medium text-ink-900 capitalize">{m.type}</span>
                    {m.reason && <span className="ml-2 text-ink-500">{m.reason}</span>}
                  </div>
                  <div className="text-right">
                    <p className={m.quantityChange >= 0 ? 'text-success-700' : 'text-brand-red-700'}>
                      {m.quantityChange >= 0 ? '+' : ''}
                      {m.quantityChange}
                    </p>
                    <p className="text-xs text-ink-500">{formatRelativeTime(m.createdAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'Purchase History' && (
        <Card className="p-5">
          <EmptyState
            icon={ShoppingBag}
            title="No purchase history yet"
            description="This will populate once the Purchase Orders module is implemented."
          />
        </Card>
      )}

      {tab === 'Sales History' && (
        <Card className="p-5">
          <EmptyState
            icon={ShoppingBag}
            title="No sales history yet"
            description="This will populate once the Sales module is implemented."
          />
        </Card>
      )}

      {tab === 'Supplier' && (
        <Card className="p-5">
          {supplier ? (
            <div>
              <p className="text-sm font-medium text-ink-900">{supplier.name}</p>
              <p className="mt-1 text-xs text-ink-500">
                {supplier.contactName} · {supplier.phone} · {supplier.email}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
                <TruckIcon size={12} /> {supplier.address}
              </p>
            </div>
          ) : (
            <EmptyState icon={TruckIcon} title="No supplier linked" description="Edit this product to link a supplier." />
          )}
        </Card>
      )}

      {tab === 'Notes' && (
        <Card className="p-5">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm shadow-card focus:border-brand-blue-500"
          />
          <div className="mt-3 flex justify-end">
            <Button onClick={saveNotes}>Save notes</Button>
          </div>
        </Card>
      )}

      {tab === 'Audit Log' && (
        <Card className="p-5 text-sm">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <dt className="text-xs text-ink-500">Created</dt>
              <dd className="text-ink-900">{formatRelativeTime(product.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Last updated</dt>
              <dd className="text-ink-900">{formatRelativeTime(product.updated_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Sync status</dt>
              <dd>
                <Badge tone={product.sync_status === 'synced' ? 'success' : 'warning'}>{product.sync_status}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Product ID</dt>
              <dd className="break-all font-mono text-xs text-ink-500">{product.id}</dd>
            </div>
          </dl>
        </Card>
      )}

      <Card className="mt-6 p-5 print:block">
        <p className="mb-2 text-xs font-medium text-ink-500">Barcode</p>
        <BarcodeDisplay value={product.barcode} />
      </Card>
    </div>
  )
}
