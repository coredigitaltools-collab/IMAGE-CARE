import { useState } from 'react'
import { InventoryTabs } from '../../components/inventory/InventoryTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { BarChart3 } from 'lucide-react'
import { formatCurrency } from '../../lib/format'
import {
  useDeadStockReport,
  useFastSlowMovingReport,
  useLowStockReport,
  useOutOfStockReport,
  useProfitabilityReport,
  useStockLevelsReport,
  useValuationReport,
} from '../../features/inventory/hooks/useInventoryData'

const REPORT_TABS = ['Valuation', 'Stock Levels', 'Low Stock', 'Out of Stock', 'Dead Stock', 'Fast/Slow Moving', 'Profitability'] as const
type ReportTab = (typeof REPORT_TABS)[number]

function ReportTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto">{children}</div>
}

export function InventoryReportsPage() {
  const [tab, setTab] = useState<ReportTab>('Valuation')

  const valuation = useValuationReport('UGX')
  const stockLevels = useStockLevelsReport()
  const lowStock = useLowStockReport()
  const outOfStock = useOutOfStockReport()
  const deadStock = useDeadStockReport()
  const fastSlow = useFastSlowMovingReport()
  const profitability = useProfitabilityReport('UGX')

  return (
    <div className="mx-auto max-w-5xl">
      <InventoryTabs />
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Inventory Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Valuation, stock health, and profitability at a glance.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-ink-100">
        {REPORT_TABS.map((t) => (
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

      <Card className="p-5">
        {tab === 'Valuation' &&
          (valuation.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : valuation.data && valuation.data.length > 0 ? (
            <ReportTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs text-ink-500">
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Stock</th>
                    <th className="pb-2 text-right">Stock value (cost)</th>
                    <th className="pb-2 text-right">Potential sale value</th>
                  </tr>
                </thead>
                <tbody>
                  {valuation.data.map((row) => (
                    <tr key={row.product.id} className="border-b border-ink-100 last:border-0">
                      <td className="py-2 text-ink-900">{row.product.name}</td>
                      <td className="py-2 text-right text-ink-500">{row.product.currentStock}</td>
                      <td className="py-2 text-right text-ink-900">{formatCurrency(row.stockValue, 'UGX')}</td>
                      <td className="py-2 text-right text-ink-900">{formatCurrency(row.potentialSaleValue, 'UGX')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ReportTable>
          ) : (
            <EmptyState icon={BarChart3} title="No data" description="Add products to see valuation." />
          ))}

        {tab === 'Stock Levels' &&
          (stockLevels.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : stockLevels.data && stockLevels.data.length > 0 ? (
            <ReportTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs text-ink-500">
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Current stock</th>
                    <th className="pb-2 text-right">Reorder level</th>
                  </tr>
                </thead>
                <tbody>
                  {stockLevels.data.map((p) => (
                    <tr key={p.id} className="border-b border-ink-100 last:border-0">
                      <td className="py-2 text-ink-900">{p.name}</td>
                      <td className="py-2 text-right text-ink-900">{p.currentStock}</td>
                      <td className="py-2 text-right text-ink-500">{p.reorderLevel}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ReportTable>
          ) : (
            <EmptyState icon={BarChart3} title="No data" description="Add products to see stock levels." />
          ))}

        {tab === 'Low Stock' &&
          (lowStock.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : lowStock.data && lowStock.data.length > 0 ? (
            <ul className="divide-y divide-ink-100">
              {lowStock.data.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink-900">{p.name}</span>
                  <span className="text-brand-red-700">
                    {p.currentStock} left · reorder at {p.reorderLevel}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={BarChart3} title="Nothing low on stock" description="All items are above their reorder level." />
          ))}

        {tab === 'Out of Stock' &&
          (outOfStock.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : outOfStock.data && outOfStock.data.length > 0 ? (
            <ul className="divide-y divide-ink-100">
              {outOfStock.data.map((p) => (
                <li key={p.id} className="py-2.5 text-sm text-ink-900">
                  {p.name}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={BarChart3} title="Nothing out of stock" description="Every active product has stock available." />
          ))}

        {tab === 'Dead Stock' &&
          (deadStock.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : deadStock.data && deadStock.data.length > 0 ? (
            <ul className="divide-y divide-ink-100">
              {deadStock.data.map((row) => (
                <li key={row.product.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink-900">{row.product.name}</span>
                  <span className="text-ink-500">
                    {row.daysSinceLastMovement === null ? 'No movement recorded' : `${row.daysSinceLastMovement} days idle`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={BarChart3} title="No dead stock" description="Every product has moved recently." />
          ))}

        {tab === 'Fast/Slow Moving' &&
          (fastSlow.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Fastest moving</h3>
                <ul className="divide-y divide-ink-100">
                  {fastSlow.data?.fast.map((row) => (
                    <li key={row.product.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-ink-900">{row.product.name}</span>
                      <span className="text-ink-500">{row.unitsMoved} units</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-500">Slowest moving</h3>
                <ul className="divide-y divide-ink-100">
                  {fastSlow.data?.slow.map((row) => (
                    <li key={row.product.id} className="flex items-center justify-between py-2 text-sm">
                      <span className="text-ink-900">{row.product.name}</span>
                      <span className="text-ink-500">{row.unitsMoved} units</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="col-span-full text-xs text-ink-500">
                Based on sale movements in the last 30 days. Until the Sales module is implemented, this will show 0 units for
                everything — that's accurate, not a bug.
              </p>
            </div>
          ))}

        {tab === 'Profitability' &&
          (profitability.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : profitability.data && profitability.data.length > 0 ? (
            <ReportTable>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-ink-100 text-left text-xs text-ink-500">
                    <th className="pb-2">Product</th>
                    <th className="pb-2 text-right">Margin</th>
                    <th className="pb-2 text-right">Potential profit</th>
                  </tr>
                </thead>
                <tbody>
                  {profitability.data.map((row) => (
                    <tr key={row.product.id} className="border-b border-ink-100 last:border-0">
                      <td className="py-2 text-ink-900">{row.product.name}</td>
                      <td className="py-2 text-right text-ink-500">{row.marginPercent}%</td>
                      <td className="py-2 text-right text-ink-900">{formatCurrency(row.potentialProfit, 'UGX')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ReportTable>
          ) : (
            <EmptyState icon={BarChart3} title="No data" description="Add products to see profitability." />
          ))}
      </Card>
    </div>
  )
}
