import { useMemo, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { Archive, ArchiveRestore, Copy, Eye, Package, Plus, Search } from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { AddProductWizard } from '../../components/inventory/AddProductWizard'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import {
  useArchiveProduct,
  useCategories,
  useCreateProduct,
  useDuplicateProduct,
  useEnsureDefaultUnit,
  useProducts,
  useReactivateProduct,
  useSuppliers,
} from '../../features/inventory/hooks/useInventoryData'
import type { ProductInput } from '../../types/inventory'

export function ProductsListPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const productsQuery = useProducts()
  const categoriesQuery = useCategories()
  // Units has no UI of its own here by design (the user's explicit,
  // repeated direction: the system just runs on pieces, no unit picker) -
  // this silently ensures one real "Piece" unit row exists the first time
  // it's needed and returns it the same shape useUnits() would.
  const unitsQuery = useEnsureDefaultUnit()
  const suppliersQuery = useSuppliers()
  // 2026-09-01: AddProductWizard now generates its own fresh SKU every time
  // it mounts (see the comment above generateSku() in that file) instead of
  // reading a single shared, page-lifetime-cached value from here - that
  // was the actual cause of "That SKU is already used by another product."
  // on the 2nd+ product added in a session, since the old shared value
  // never changed after the page first loaded.
  const createProduct = useCreateProduct(user.id)
  const duplicateProduct = useDuplicateProduct(user.id)
  const archiveProduct = useArchiveProduct(user.id)
  const reactivateProduct = useReactivateProduct(user.id)

  const [query, setQuery] = useState(searchParams.get('q') ?? '')
  // Bug fix (2026-09-09), "Filter products in the inventory list": this was
  // a plain "Show archived" checkbox - a real filter (active products are
  // hidden by default unless checked), just not shaped or labeled like one,
  // so a "Status" control alongside Category/Supplier here (the Inventory
  // Dashboard's separate InventoryFilterBar already has exactly this
  // 3-option shape - see aria-label="Filter by status" there) wasn't found.
  // Same default behavior as before (archived hidden unless explicitly
  // selected), now as an actual Status dropdown that matches the existing
  // Category/Supplier controls.
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active')
  // Bug fix (2026-09-07): "Category: Blazers, Supplier: Blazers United"
  // didn't narrow the list at all - this is the real product list users
  // browse day to day, and it had no category/supplier filter controls or
  // logic whatsoever (the only existing category/supplier filter UI lives
  // on the separate Inventory Dashboard tab, and even there it only ever
  // narrowed two small side widgets, never this list). Both constraints
  // apply together (AND), matching how the test - and the labels
  // "Category: X, Supplier: Y" - describe narrowing to products that
  // match both at once.
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [isAddOpen, setIsAddOpen] = useState(searchParams.get('new') === '1')
  const [formError, setFormError] = useState<string | undefined>()

  const categoryName = (id: string) => categoriesQuery.data?.find((c) => c.id === id)?.name ?? '-'

  const filtered = useMemo(() => {
    const products = productsQuery.data ?? []
    const q = query.trim().toLowerCase()
    return products.filter((p) => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (categoryFilter !== 'all' && p.categoryId !== categoryFilter) return false
      if (supplierFilter !== 'all' && p.supplierId !== supplierFilter) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q)
    })
  }, [productsQuery.data, query, statusFilter, categoryFilter, supplierFilter])

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
      const created = await createProduct.mutateAsync(input)
      showToast('Product added.', 'success')
      // Bug fix (2026-09-07): "why do the new products show grayed out" -
      // opening stock / branch assignment failures used to be swallowed
      // silently (console.error only). Now surfaced as a follow-up toast
      // so a product that quietly ended up at 0 stock or unassigned isn't
      // mistaken for one where nothing was entered.
      for (const warning of created?.warnings ?? []) showToast(warning)
      closeAddModal()
    } catch (err) {
      // 2026-09-01: this used to only recognize DuplicateSkuError/
      // DuplicateBarcodeError, both from the old local-storage productService
      // that this page doesn't actually call anymore - the real save path
      // (masterDataService.createProduct, via useCreateProduct) throws a
      // plain Error whose message now comes from parseError()'s much more
      // specific handling (see types/app.ts) - e.g. "That barcode is
      // already used by another record." instead of a dead-end generic
      // message. Use it whenever there is one.
      setFormError(err instanceof Error && err.message ? err.message : 'Something went wrong. Please try again.')
    }
  }

  const handleDuplicate = async (id: string) => {
    await duplicateProduct.mutateAsync(id)
    showToast('Product duplicated, update its SKU and details.', 'success')
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
            className="w-full rounded-md border border-ink-100 bg-surface py-2 pl-9 pr-3 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
          className="rounded-md border border-ink-100 bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-700 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
        >
          <option value="all">All categories</option>
          {(categoriesQuery.data ?? []).filter((c) => c.is_active).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
          aria-label="Filter by supplier"
          className="rounded-md border border-ink-100 bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-700 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
        >
          <option value="all">All suppliers</option>
          {(suppliersQuery.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'active' | 'archived' | 'all')}
          aria-label="Filter by status"
          className="rounded-md border border-ink-100 bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-700 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All statuses</option>
        </select>
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
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink-100 bg-surface-2">
                  {product.imageDataUrl ? (
                    <img src={product.imageDataUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Package size={18} className="text-ink-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <Link to={`/inventory/products/${product.id}`} className="text-sm font-medium text-ink-900 hover:text-accent">
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
                <div className="flex shrink-0 items-center gap-0.5">
                  <RowActionButton icon={Eye} label="View / Edit" onClick={() => navigate(`/inventory/products/${product.id}`)} />
                  <RowActionButton icon={Copy} label="Duplicate" onClick={() => handleDuplicate(product.id)} />
                  {product.status === 'active' ? (
                    <RowActionButton
                      icon={Archive}
                      label="Archive"
                      tone="danger"
                      onClick={async () => {
                        await archiveProduct.mutateAsync(product.id)
                        showToast('Product archived.', 'success')
                      }}
                    />
                  ) : (
                    <RowActionButton
                      icon={ArchiveRestore}
                      label="Reactivate"
                      tone="success"
                      onClick={async () => {
                        await reactivateProduct.mutateAsync(product.id)
                        showToast('Product reactivated.', 'success')
                      }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <AddProductWizard
          categories={categoriesQuery.data ?? []}
          units={unitsQuery.data ?? []}
          suppliers={suppliersQuery.data ?? []}
          userId={user.id}
          onClose={closeAddModal}
          onSubmit={handleCreate}
          submitError={formError}
        />
      )}
    </div>
  )
}
