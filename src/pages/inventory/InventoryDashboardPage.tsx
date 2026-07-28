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
} from 'lucide-react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { CurrencySelector } from '../../components/dashboard/CurrencySelector'
import { useToast } from '../../components/ui/Toast'
import { useInventoryKpis, useProducts } from '../../features/inventory/hooks/useInventoryData'
import { formatCurrency } from '../../lib/format'
import { useState } from 'react'
import type { SupportedCurrency } from '../../lib/currency'

export function InventoryDashboardPage() {
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [currency, setCurrency] = useState<SupportedCurrency>('UGX')
  const kpisQuery = useInventoryKpis(currency)
  const productsQuery = useProducts()

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
    a.download = `imagecare-products-${new Date().toISOString().slice(0, 10)}.csv`
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

  return (
    <div className="mx-auto max-w-6xl">
      <InventoryTabs />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Inventory</h1>
          <p className="mt-0.5 text-sm text-ink-500">Product master, stock levels, and inventory reports.</p>
        </div>
        <CurrencySelector selected={currency} onChange={setCurrency} />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {quickActions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="group flex flex-col items-center gap-2 rounded-card border border-ink-100 bg-white px-3 py-4 text-center shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700 transition-colors group-hover:bg-brand-blue-700 group-hover:text-white">
              <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span className="text-xs font-medium text-ink-700">{label}</span>
          </button>
        ))}
      </div>

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
    </div>
  )
}
