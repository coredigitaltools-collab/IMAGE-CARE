import { useMemo, useState } from 'react'
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
} from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { InventorySearchBar } from '../../components/inventory/InventorySearchBar'
import { InventoryFilterBar, EMPTY_FILTERS, type InventoryFilters } from '../../components/inventory/InventoryFilterBar'
import { InventoryValueTrendChart } from '../../components/inventory/InventoryValueTrendChart'
import { ProductStatisticsWidget } from '../../components/inventory/ProductStatisticsWidget'
import { RecentStockActivityPanel } from '../../components/inventory/RecentStockActivityPanel'
import { LowStockPreviewPanel } from '../../components/inventory/LowStockPreviewPanel'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { BranchSelector } from '../../components/dashboard/BranchSelector'
import { CurrencySelector } from '../../components/dashboard/CurrencySelector'
import { SyncStatusIndicator } from '../../components/dashboard/SyncStatusIndicator'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useSyncStatus } from '../../features/dashboard/hooks/useDashboardData'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { BRANCHES } from '../../data/mockData'
import { formatCurrency } from '../../lib/format'
import type { SupportedCurrency } from '../../lib/currency'
import type { TrendRange } from '../../services/inventoryReportsService'
import {
  useBrands,
  useCategories,
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
  const isOnline = useOnlineStatus()

  const [currency, setCurrency] = useState<SupportedCurrency>('UGX')
  const [selectedBranchId, setSelectedBranchId] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [filters, setFilters] = useState<InventoryFilters>(EMPTY_FILTERS)
  const [trendRange, setTrendRange] = useState<TrendRange>('30d')

  const kpisQuery = useInventoryKpis(currency)
  const productsQuery = useProducts()
  const categoriesQuery = useCategories()
  const brandsQuery = useBrands()
  const suppliersQuery = useSuppliers()
  const movementsQuery = useStockMovements()
  const lowStockQuery = useLowStockReport()
  const statsQuery = useProductStatistics()
  const trendQuery = useInventoryValueTrend(trendRange, currency)
  const syncQuery = useSyncStatus()

  const visibleBranches = useMemo(
    () => BRANCHES.filter((b) => user.allowedBranchIds.includes(b.id)),
    [user.allowedBranchIds],
  )

  const passesFilters = (p: { categoryId: string; supplierId: string | null; brandId: string | null; status: string; branch_id: string | null }) => {
    if (filters.categoryId !== 'all' && p.categoryId !== filters.categoryId) return false
    if (filters.supplierId !== 'all' && p.supplierId !== filters.supplierId) return false
    if (filters.brandId !== 'all' && p.brandId !== filters.brandId) return false
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
    const header = ['SKU', 'Barcode', 'Name', 'Buying Price (UGX)', 'Selling Price (UGX)', 'Current Stock', 'Reorder Level', 'Status']
    const rows = products.map((p) => [p.sku, p.barcode, p.name, p.buyingPrice, p.sellingPrice, p.currentStock, p.reorderLevel, p.status])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `products-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('Products exported.', 'success')
  }

  const quickActions = [
    { label: 'Add product', icon: Plus, onClick: () => navigate('/inventory/products?new=1') },
    { label: 'Import', icon: Upload, onClick: () => showToast('CSV import is coming in a future update.') },
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
        <div className="flex flex-wrap items-center gap-2">
          <BranchSelector branches={visibleBranches} selectedBranchId={selectedBranchId} onChange={setSelectedBranchId} />
          <CurrencySelector selected={currency} onChange={setCurrency} />
          <SyncStatusIndicator
            status={isOnline ? syncQuery.data : { state: 'offline', lastSyncedAt: syncQuery.data?.lastSyncedAt ?? null, pendingCount: 0 }}
          />
        </div>
      </div>

      {!isEmptyInstall && (
        <div className="mb-6 flex flex-col gap-3">
          <InventorySearchBar
            products={productsQuery.data ?? []}
            categories={categoriesQuery.data ?? []}
            value={searchQuery}
            onChange={setSearchQuery}
          />
          <InventoryFilterBar
            categories={categoriesQuery.data ?? []}
            suppliers={suppliersQuery.data ?? []}
            brands={brandsQuery.data ?? []}
            branches={visibleBranches}
            filters={filters}
            onChange={setFilters}
          />
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {quickActions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="group flex flex-col items-center gap-2 rounded-card border border-ink-100 bg-white px-3 py-4 text-center shadow-card outline-none transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover focus-visible:-translate-y-0.5 focus-visible:border-brand-blue-500 focus-visible:shadow-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-blue-500 focus-visible:outline-offset-2 active:translate-y-0 active:scale-[0.97] active:shadow-card"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700 transition-all duration-200 ease-out group-hover:scale-110 group-hover:bg-brand-blue-700 group-hover:text-white group-active:scale-95">
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="text-xs font-medium text-ink-700">{label}</span>
          </button>
        ))}
      </div>

      {isEmptyInstall ? (
        <div className="rounded-card border border-dashed border-ink-100 bg-white py-16">
          <EmptyState
            icon={Boxes}
            title="Let's get your inventory started"
            description="Add your first product to start tracking stock, valuation, and reorder alerts."
            action={{ label: 'Add your first product', onClick: () => navigate('/inventory/products?new=1') }}
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Total products"
              value={kpisQuery.data ? String(kpisQuery.data.totalProducts) : '—'}
              icon={Package}
              tone="blue"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Inventory value"
              value={kpisQuery.data ? formatCurrency(kpisQuery.data.inventoryValue, currency) : '—'}
              icon={Wallet}
              tone="success"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Potential profit"
              value={kpisQuery.data ? formatCurrency(kpisQuery.data.potentialProfit, currency) : '—'}
              icon={TrendingUp}
              tone="success"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Low stock"
              value={kpisQuery.data ? String(kpisQuery.data.lowStockCount) : '—'}
              icon={AlertTriangle}
              tone={kpisQuery.data && kpisQuery.data.lowStockCount > 0 ? 'red' : 'neutral'}
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Out of stock"
              value={kpisQuery.data ? String(kpisQuery.data.outOfStockCount) : '—'}
              icon={PackageX}
              tone={kpisQuery.data && kpisQuery.data.outOfStockCount > 0 ? 'red' : 'neutral'}
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Categories"
              value={kpisQuery.data ? String(kpisQuery.data.categoriesCount) : '—'}
              icon={Tags}
              tone="neutral"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Suppliers"
              value={kpisQuery.data ? String(kpisQuery.data.suppliersCount) : '—'}
              icon={Truck}
              tone="neutral"
              isLoading={kpisQuery.isLoading}
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <InventoryValueTrendChart
                data={trendQuery.data}
                isLoading={trendQuery.isLoading}
                range={trendRange}
                onRangeChange={setTrendRange}
                currency={currency}
              />
            </div>
            <ProductStatisticsWidget stats={statsQuery.data} isLoading={statsQuery.isLoading} currency={currency} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <RecentStockActivityPanel
              movements={filteredMovements}
              products={productsQuery.data ?? []}
              isLoading={movementsQuery.isLoading}
            />
            <LowStockPreviewPanel products={filteredLowStock} isLoading={lowStockQuery.isLoading} />
          </div>
        </>
      )}
    </div>
  )
}
