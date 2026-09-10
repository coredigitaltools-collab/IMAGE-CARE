import { Link } from 'react-router-dom'
import { Boxes, Package, AlertTriangle, PackageX } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { StockSummaryTabs } from '../../components/stockSummary/StockSummaryTabs'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { formatCurrency } from '../../lib/format'
import { useCurrentStockSummary, useStockSummaryDashboardKpis } from '../../features/stockSummary/hooks/useStockSummaryData'

const STATUS_TONE = { ok: 'success', low: 'warning', out: 'danger' } as const
const STATUS_LABELS = { ok: 'In stock', low: 'Low', out: 'Out of stock' } as const

export function CurrentStockPage() {
  const stockQuery = useCurrentStockSummary()
  const rows = stockQuery.data ?? []
  // Bug fix (2026-09-10), "Review Current Stock Overview": this page had no
  // aggregate totals at all, just the per-product list below. The Stock
  // Summary Dashboard tab (one tab over) already computes real totals from
  // the same underlying stock view - reused here instead of duplicating the
  // query. Deliberately NOT including that hook's todaysStockIn/todaysStockOut
  // fields: those are hard-coded to 0 there (see useStockSummaryData.ts's own
  // comment - the view backing this page has no movement/date history, and
  // the honest choice already made elsewhere is to leave it at 0 rather than
  // invent a number), so surfacing them here would just repeat a fake KPI.
  const kpisQuery = useStockSummaryDashboardKpis('UGX')
  const kpis = kpisQuery.data

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Stock Summary' }]} />
      <StockSummaryTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Current Stock</h1>
        <p className="mt-0.5 text-sm text-ink-500">
          Every active product, lowest stock first. For editing or creating products, use{' '}
          <Link to="/inventory/products" className="text-accent hover:underline">
            Inventory
          </Link>
          .
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Total inventory value"
          value={kpis ? formatCurrency(kpis.totalInventoryValue, 'UGX') : '-'}
          icon={Boxes}
          tone="blue"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard label="Stock items" value={kpis ? String(kpis.stockItemsCount) : '-'} icon={Package} tone="neutral" isLoading={kpisQuery.isLoading} />
        <KpiCard
          label="Low stock"
          value={kpis ? String(kpis.lowStockCount) : '-'}
          icon={AlertTriangle}
          tone={kpis && kpis.lowStockCount > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Out of stock"
          value={kpis ? String(kpis.outOfStockCount) : '-'}
          icon={PackageX}
          tone={kpis && kpis.outOfStockCount > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
      </div>

      <Card className="p-5">
        {stockQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={Package} title="No products yet" description="Add products under Inventory to see stock here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link to={`/inventory/products/${row.id}`} className="font-medium text-ink-900 hover:text-accent">
                    {row.name}
                  </Link>
                  <p className="text-xs text-ink-500">{row.sku}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-ink-700">
                    {row.currentStock} <span className="text-xs text-ink-500">(reorder at {row.reorderLevel})</span>
                  </span>
                  <Badge tone={STATUS_TONE[row.status]}>{STATUS_LABELS[row.status]}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
