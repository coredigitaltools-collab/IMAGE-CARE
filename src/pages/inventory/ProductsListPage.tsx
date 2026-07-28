import { useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Copy, Package, Plus, Search } from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { ProductFormModal } from '../../components/inventory/ProductFormModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import {
  useBrands,
  useCategories,
  useCreateProduct,
  useDuplicateProduct,
  useGeneratedSku,
  useProducts,
  useSuppliers,
  useUnits,
} from '../../features/inventory/hooks/useInventoryData'
import { DuplicateBarcodeError, DuplicateSkuError } from '../../services/productService'
import type { ProductInput } from '../../types/inventory'

export function ProductsListPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const productsQuery = useProducts()
  const categoriesQuery = useCategories()
  const brandsQuery = useBrands()
  const unitsQuery = useUnits()
  const suppliersQuery = useSuppliers()
  const generatedSkuQuery = useGeneratedSku()
  const createProduct = useCreateProduct(user.id)
  const duplicateProduct = useDuplicateProduct(user.id)

  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [isAddOpen, setIsAddOpen] = useState(searchParams.get('new') === '1')
  const [formError, setFormError] = useState<string | undefined>()

  const categoryName = (id: string) => categoriesQuery.data?.find((c) => c.id === id)?.name ?? '—'

  const filtered = useMemo(() => {
    const products = productsQuery.data ?? []
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (!showArchived && p.status === 'archived') return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q)
    })
  }, [productsQuery.data, query, showArchived])

  const closeAddModal = () => {
    setIsAddOpen(false)
    setFormError(undefined)
    if (searchParams.get('new')) {
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const handleCreate = async (input: ProductInput) => {
    setFormError(undefined)
    try {
      await createProduct.mutateAsync(input)
      showToast('Product added.', 'success')
      closeAddModal()
    } catch (err) {
      setFormError(
        err instanceof DuplicateSkuError || err instanceof DuplicateBarcodeError
          ? err.message
          : 'Something went wrong. Please try again.',
      )
    }
  }

  const handleDuplicate = async (id: string) => {
    await duplicateProduct.mutateAsync(id)
    showToast('Product duplicated — update its SKU and details.', 'success')
  }

  return (
    <div className="mx-auto max-w-6xl">
      <InventoryTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Products</h1>
          <p className="mt-0.5 text-sm text-ink-500">Search, view, and manage the product catalogue.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> Add product
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, SKU, or barcode..."
            className="w-full rounded-md border border-ink-100 bg-white py-2 pl-9 pr-3 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-blue-700 focus:ring-brand-blue-500"
          />
          Show archived
        </label>
      </div>

      <Card className="overflow-hidden">
        {productsQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products found"
            description={query ? 'Try a different search term.' : 'Add your first product to get started.'}
            action={query ? undefined : { label: 'Add product', onClick: () => setIsAddOpen(true) }}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {filtered.map((product) => (
              <li key={product.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink-100 bg-ink-50">
                  {product.imageDataUrl ? (
                    <img src={product.imageDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Package size={18} className="text-ink-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/inventory/products/${product.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                    {product.name}
                  </Link>
                  <p className="text-xs text-ink-500">
                    {product.sku} · {categoryName(product.categoryId)}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-medium text-ink-900">{formatCurrency(product.sellingPrice, 'UGX')}</p>
                  <p className={`text-xs ${product.currentStock <= product.reorderLevel ? 'text-brand-red-700' : 'text-ink-500'}`}>
                    {product.currentStock} in stock
                  </p>
                </div>
                {product.status === 'archived' && <Badge tone="neutral">Archived</Badge>}
                <div className="flex shrink-0 items-center gap-1">
                  <Link
                    to={`/inventory/products/${product.id}`}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleDuplicate(product.id)}
                    className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50"
                  >
                    <Copy size={12} /> Duplicate
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <ProductFormModal
          categories={categoriesQuery.data ?? []}
          brands={brandsQuery.data ?? []}
          units={unitsQuery.data ?? []}
          suppliers={suppliersQuery.data ?? []}
          generatedSku={generatedSkuQuery.data}
          onClose={closeAddModal}
          onSubmit={handleCreate}
          submitError={formError}
        />
      )}
    </div>
  )
}
