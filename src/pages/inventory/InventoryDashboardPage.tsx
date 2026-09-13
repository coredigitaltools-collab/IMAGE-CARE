import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Package,
  Wallet,
  TrendingUp,
  PackageX,
  AlertTriangle,
  Tags,
  Truck,
  Plus,
  Upload,
  Download,
  Printer,
  ClipboardList,
  Barcode,
  Boxes,
  Sparkles,
} from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { InventorySearchBar } from '../../components/inventory/InventorySearchBar'
import { InventoryFilterBar } from '../../components/inventory/InventoryFilterBar'
import { EMPTY_FILTERS, type InventoryFilters } from '../../components/inventory/inventoryFilters'
import { InventoryValueTrendChart } from '../../components/inventory/InventoryValueTrendChart'
import { ProductStatisticsWidget } from '../../components/inventory/ProductStatisticsWidget'
import { RecentStockActivityPanel } from '../../components/inventory/RecentStockActivityPanel'
import { LowStockPreviewPanel } from '../../components/inventory/LowStockPreviewPanel'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { BranchSelector } from '../../components/dashboard/BranchSelector'
import { CurrencySelector } from '../../components/dashboard/CurrencySelector'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useBranches } from '../../features/settings/hooks/useSettingsData'
import { formatCurrency } from '../../lib/format'
import { parseCsv } from '../../lib/csv'
import type { SupportedCurrency } from '../../lib/currency'
import type { TrendRange } from '../../services/inventoryReportsService'
import {
  useCategories,
  useCreateCategory,
  useCreateProduct,
  useInventoryKpis,
  useInventoryValueTrend,
  useLowStockReport,
  useProductStatistics,
  useProducts,
  useStockMovements,
  useSuppliers,
} from '../../features/inventory/hooks/useInventoryData'

export function InventoryDashboardPage() {
  const { showToast } = useToast()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [currency, setCurrency] = useState<SupportedCurrency>('UGX')
  const [selectedBranchId, setSelectedBranchId] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<InventoryFilters>(EMPTY_FILTERS)
  const [trendRange, setTrendRange] = useState<TrendRange>('30d')
  const [isImporting, setIsImporting] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)
  const createProduct = useCreateProduct(user.id)
  const createCategory = useCreateCategory(user.id)

  const kpisQuery = useInventoryKpis(currency)
  const productsQuery = useProducts()
  const categoriesQuery = useCategories()
  const suppliersQuery = useSuppliers()
  const movementsQuery = useStockMovements()
  const lowStockQuery = useLowStockReport()
  const statsQuery = useProductStatistics()
  const trendQuery = useInventoryValueTrend(trendRange, currency)

  const branchesQuery = useBranches()

  // Same fix as the main Dashboard: real branch data instead of the
  // stale mock array, with Owner's unrestricted access (IMP-002)
  // applied directly since allowedBranchIds was never wired to real,
  // dynamically-created branch IDs.
  const visibleBranches = useMemo(() => {
    const active = (branchesQuery.data ?? []).filter((b) => b.is_active)
    if (user.role === 'owner') return active
    return active.filter((b) => user.allowedBranchIds.includes(b.id))
  }, [branchesQuery.data, user.role, user.allowedBranchIds])

  const passesFilters = (p: { categoryId: string; supplierId: string | null; status: string; branch_id: string | null }) => {
    if (filters.categoryId !== 'all' && p.categoryId !== filters.categoryId) return false
    if (filters.supplierId !== 'all' && p.supplierId !== filters.supplierId) return false
    if (filters.status !== 'all' && p.status !== filters.status) return false
    if (filters.branchId !== 'all' && p.branch_id !== filters.branchId) return false
    if (selectedBranchId !== 'all' && p.branch_id !== selectedBranchId) return false
    return true
  }

  const categoryName = (id: string) => categoriesQuery.data?.find((c) => c.id === id)?.name ?? ''
  const matchesSearch = (p: { name: string; sku: string; barcode: string; categoryId: string }) => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.barcode.includes(q) ||
      categoryName(p.categoryId).toLowerCase().includes(q)
    )
  }

  const filteredLowStock = (lowStockQuery.data ?? []).filter((p) => passesFilters(p) && matchesSearch(p))

  const filteredProductIds = useMemo(() => {
    const ids = new Set<string>()
    for (const p of productsQuery.data ?? []) {
      if (passesFilters(p) && matchesSearch(p)) ids.add(p.id)
    }
    return ids
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsQuery.data, filters, selectedBranchId, searchQuery, categoriesQuery.data])

  const filteredMovements = (movementsQuery.data ?? []).filter((m) => filteredProductIds.has(m.productId))

  const exportCsv = () => {
    const products = productsQuery.data ?? []
    if (products.length === 0) {
      showToast('No products to export yet.')
      return
    }
    // Category was added (2026-09-11) alongside Import: these are the same
    // column names Import recognizes, so this Export doubles as a real,
    // pre-filled template - open it, keep the header row, replace the data
    // rows with the client's own products, and Import it back in.
    const header = ['SKU', 'Barcode', 'Name', 'Category', 'Buying Price (UGX)', 'Selling Price (UGX)', 'Current Stock', 'Reorder Level', 'Status']
    const rows = products.map((p) => [p.sku, p.barcode, p.name, categoryName(p.categoryId), p.buyingPrice, p.sellingPrice, p.currentStock, p.reorderLevel, p.status])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    // Bug fix (2026-09-09), "Export inventory data" timing out: revoking
    // the object URL in the same tick as click() can race the browser
    // actually starting the download, especially under an automated
    // browser driving the click - deferred to the next tick instead (same
    // fix applied to lib/csv.ts's shared downloadCsv()).
    setTimeout(() => {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 0)
    showToast('Products exported.', 'success')
  }

  // Column recognition is name-based, not position-based (2026-09-11):
  // a business bringing in a product list from a different system won't
  // necessarily have columns in this exact order, or named exactly the
  // same thing (e.g. "Cost Price" instead of "Buying Price"). Matching by
  // a normalized header name (lowercased, punctuation/spacing stripped)
  // against a list of accepted synonyms per field means the same real
  // columns are found either way, without requiring a full column-mapping
  // UI - that remains a possible future upgrade if a stricter match ever
  // turns out not to be enough. Unrecognized columns are simply ignored.
  const normalizeHeader = (h: string) => h.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  const HEADER_SYNONYMS: Record<string, string[]> = {
    name: ['name', 'productname', 'itemname', 'item', 'product'],
    sku: ['sku', 'productcode', 'code', 'itemcode'],
    barcode: ['barcode', 'barcodenumber', 'upc'],
    category: ['category', 'productcategory', 'type'],
    buyingPrice: ['buyingpriceugx', 'buyingprice', 'costprice', 'cost', 'purchaseprice'],
    sellingPrice: ['sellingpriceugx', 'sellingprice', 'price', 'retailprice', 'saleprice'],
    stock: ['currentstock', 'stock', 'openingstock', 'quantity', 'qty', 'quantityonhand'],
    reorderLevel: ['reorderlevel', 'reorderpoint', 'reorder', 'minimumstock', 'minstock'],
  }
  const findColumn = (headerCells: string[], field: keyof typeof HEADER_SYNONYMS): number => {
    const normalized = headerCells.map(normalizeHeader)
    return normalized.findIndex((h) => HEADER_SYNONYMS[field].includes(h))
  }
  const parseImportNumber = (raw: string | undefined): number => {
    const n = Number(String(raw ?? '').replace(/[^0-9.-]/g, ''))
    return Number.isFinite(n) && n >= 0 ? n : 0
  }

  const handleImportFile = async (file: File) => {
    setIsImporting(true)
    try {
      const text = await file.text()
      const rows = parseCsv(text)
      if (rows.length === 0) { showToast('That file has no rows.', 'info'); return }

      const nameCol = findColumn(rows[0], 'name')
      if (nameCol === -1) {
        showToast('Could not find a product name column. Download Export first to see the expected column names.', 'info')
        return
      }
      const skuCol = findColumn(rows[0], 'sku')
      const barcodeCol = findColumn(rows[0], 'barcode')
      const categoryCol = findColumn(rows[0], 'category')
      const buyingCol = findColumn(rows[0], 'buyingPrice')
      const sellingCol = findColumn(rows[0], 'sellingPrice')
      const stockCol = findColumn(rows[0], 'stock')
      const reorderCol = findColumn(rows[0], 'reorderLevel')
      const dataRows = rows.slice(1)

      // Seed from the categories already loaded, then extend locally as
      // new ones are created - rows are processed one at a time (not in
      // parallel), so a category name repeated across many rows in the
      // same file is only ever created once, real and for good, the same
      // way typing a new category into CategoryQuickSelect on the Add
      // Product form does.
      const categoryIdByName = new Map<string, string>()
      for (const c of categoriesQuery.data ?? []) categoryIdByName.set(c.name.trim().toLowerCase(), c.id)

      let ok = 0
      let failed = 0
      const warnings: string[] = []
      for (const r of dataRows) {
        const name = r[nameCol]?.trim()
        if (!name) { failed++; continue }

        let categoryId: string | null = null
        const categoryRaw = categoryCol !== -1 ? r[categoryCol]?.trim() : ''
        if (categoryRaw) {
          const key = categoryRaw.toLowerCase()
          categoryId = categoryIdByName.get(key) ?? null
          if (!categoryId) {
            try {
              const created = await createCategory.mutateAsync({ name: categoryRaw })
              categoryId = created.id
              categoryIdByName.set(key, created.id)
            } catch {
              // Product can still be created without a category - it just
              // lands uncategorized, same as leaving Category blank; this
              // must never block the whole row over a non-essential field.
              categoryId = null
            }
          }
        }

        try {
          const result = await createProduct.mutateAsync({
            name,
            sku: skuCol !== -1 ? r[skuCol]?.trim() : '',
            barcode: barcodeCol !== -1 ? r[barcodeCol]?.trim() : '',
            categoryId,
            buyingPrice: buyingCol !== -1 ? parseImportNumber(r[buyingCol]) : 0,
            sellingPrice: sellingCol !== -1 ? parseImportNumber(r[sellingCol]) : 0,
            reorderLevel: reorderCol !== -1 ? parseImportNumber(r[reorderCol]) : 0,
            openingStock: stockCol !== -1 ? parseImportNumber(r[stockCol]) : 0,
          })
          ok++
          if (result.warnings?.length) warnings.push(...result.warnings)
        } catch {
          failed++
        }
      }

      showToast(
        failed === 0 ? `Imported ${ok} product${ok === 1 ? '' : 's'}.` : `Imported ${ok}, skipped ${failed} invalid row${failed === 1 ? '' : 's'}.`,
        ok > 0 ? 'success' : 'info',
      )
      if (warnings.length > 0) {
        showToast(`${warnings.length} product${warnings.length === 1 ? '' : 's'} saved with a follow-up needed - check Stock Adjustments.`, 'info')
      }
    } catch {
      showToast('Could not read that file.', 'info')
    } finally {
      setIsImporting(false)
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  const secondaryActions = [
    { label: isImporting ? 'Importing…' : 'Import', icon: Upload, onClick: () => importFileRef.current?.click() },
    { label: 'Export', icon: Download, onClick: exportCsv },
    { label: 'Print', icon: Printer, onClick: () => window.print() },
    { label: 'Stock adjustment', icon: ClipboardList, onClick: () => navigate('/inventory/adjustments?new=1') },
    { label: 'Barcode labels', icon: Barcode, onClick: () => navigate('/inventory/barcode') },
  ]

  const isEmptyInstall = kpisQuery.data && kpisQuery.data.totalProducts === 0 && !kpisQuery.isLoading

  return (
    <div className="mx-auto max-w-6xl">
      <InventoryTabs />

      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Inventory' }]} />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Inventory</h1>
          <p className="mt-0.5 text-sm text-ink-500">Product master, stock levels, and inventory reports.</p>
        </div>
        {/* Only branch + currency controls live here, sync status is
            shown once, globally, in the app header (RootLayout). */}
        <div className="flex flex-wrap items-center gap-2">
          <BranchSelector branches={visibleBranches} selectedBranchId={selectedBranchId} onChange={setSelectedBranchId} />
          <CurrencySelector selected={currency} onChange={setCurrency} />
        </div>
      </div>

      {!isEmptyInstall && (
        <div className="sticky top-16 z-10 -mx-4 mb-6 border-b border-ink-100 bg-surface-2/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-col gap-3">
            <InventorySearchBar
              products={productsQuery.data ?? []}
              categories={categoriesQuery.data ?? []}
              value={searchQuery}
              onChange={setSearchQuery}
            />
            <InventoryFilterBar
              categories={categoriesQuery.data ?? []}
              suppliers={suppliersQuery.data ?? []}
              branches={visibleBranches}
              filters={filters}
              onChange={setFilters}
            />
          </div>
        </div>
      )}

      {/* Quick actions, Add Product is the primary path into this page;
          everything else is a secondary, lower-emphasis action. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <button
          onClick={() => navigate('/inventory/products?new=1')}
          className="group col-span-2 flex flex-row items-center justify-center gap-2.5 rounded-card bg-brand-blue-700 px-3 py-3 text-center shadow-card outline-none transition-all duration-200 ease-out hover:-translate-y-0.5 hover:bg-brand-blue-900 hover:shadow-card-hover focus-visible:-translate-y-0.5 focus-visible:shadow-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue-500 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[0.98] sm:col-span-1"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-transform duration-200 ease-out group-hover:scale-110">
            <Plus size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <span className="text-xs font-semibold text-white">Add product</span>
        </button>

        {secondaryActions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="group flex flex-col items-center gap-1.5 rounded-card border border-ink-100 bg-surface px-3 py-3 text-center shadow-card outline-none transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover focus-visible:-translate-y-0.5 focus-visible:border-brand-blue-500 focus-visible:shadow-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue-500 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[0.97] active:shadow-card"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue-50 text-accent transition-all duration-200 ease-out group-hover:scale-110 group-hover:bg-brand-blue-700 group-hover:text-white group-active:scale-95">
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="text-xs font-medium text-ink-700">{label}</span>
          </button>
        ))}
      </div>

      <input
        ref={importFileRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleImportFile(e.target.files[0])}
      />

      {isEmptyInstall ? (
        <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-ink-200 bg-surface px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue-50 text-accent">
            <Boxes size={26} strokeWidth={1.75} />
          </span>
          <div>
            <p className="flex items-center justify-center gap-1.5 text-base font-semibold text-ink-900">
              Let's get your inventory started <Sparkles size={15} className="text-warning-500" />
            </p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
              Add your first product to start tracking stock levels, valuation, and reorder alerts, it only takes a minute.
            </p>
          </div>
          <Button onClick={() => navigate('/inventory/products?new=1')}>
            <Plus size={15} /> Add your first product
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total products"
              value={kpisQuery.data ? String(kpisQuery.data.totalProducts) : '-'}
              icon={Package}
              tone="blue"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Inventory value"
              value={kpisQuery.data ? formatCurrency(kpisQuery.data.inventoryValue, currency) : '-'}
              icon={Wallet}
              tone="success"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Potential profit"
              value={kpisQuery.data ? formatCurrency(kpisQuery.data.potentialProfit, currency) : '-'}
              icon={TrendingUp}
              tone="success"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Low stock"
              value={kpisQuery.data ? String(kpisQuery.data.lowStockCount) : '-'}
              icon={AlertTriangle}
              tone={kpisQuery.data && kpisQuery.data.lowStockCount > 0 ? 'red' : 'neutral'}
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Out of stock"
              value={kpisQuery.data ? String(kpisQuery.data.outOfStockCount) : '-'}
              icon={PackageX}
              tone={kpisQuery.data && kpisQuery.data.outOfStockCount > 0 ? 'red' : 'neutral'}
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Categories"
              value={kpisQuery.data ? String(kpisQuery.data.categoriesCount) : '-'}
              icon={Tags}
              tone="neutral"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Suppliers"
              value={kpisQuery.data ? String(kpisQuery.data.suppliersCount) : '-'}
              icon={Truck}
              tone="neutral"
              isLoading={kpisQuery.isLoading}
            />
          </div>

          {/* Three-column operational view */}
          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <RecentStockActivityPanel
              movements={filteredMovements}
              products={productsQuery.data ?? []}
              isLoading={movementsQuery.isLoading}
            />
            <LowStockPreviewPanel products={filteredLowStock} isLoading={lowStockQuery.isLoading} />
            <InventoryValueTrendChart
              data={trendQuery.data}
              isLoading={trendQuery.isLoading}
              range={trendRange}
              onRangeChange={setTrendRange}
              currency={currency}
              compact
            />
          </div>

          <div className="mt-4">
            <ProductStatisticsWidget stats={statsQuery.data} isLoading={statsQuery.isLoading} currency={currency} layout="horizontal" />
          </div>
        </>
      )}
    </div>
  )
}
