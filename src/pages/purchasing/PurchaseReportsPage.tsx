import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PurchasingTabs } from '../../components/purchasing/PurchasingTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useSpendBySupplier } from '../../features/purchasing/hooks/usePurchasingData'

function firstOfMonth(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function PurchaseReportsPage() {
  // Bug fix (2026-09-07): "Purchase Reports" had no way to change the
  // reporting period at all - useSpendBySupplier already accepted from/to
  // (see usePurchasingData.ts) but this page never passed them and had no
  // date controls, so it always showed all-time spend. Defaults to the
  // current month, matching Expense Reports' same fix (2026-09-07).
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const spendQuery = useSpendBySupplier(from, to)
  const rows = spendQuery.data ?? []
  const total = rows.reduce((sum, r) => sum + r.totalSpendUgx, 0)

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Purchasing' }]} />
      <PurchasingTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Purchase Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Spend by supplier, computed from received purchase orders.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="prep-from" className="mb-1.5 block text-xs font-medium text-ink-700">
            From
          </label>
          <input
            id="prep-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-ink-100 bg-surface px-3 py-1.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>
        <div>
          <label htmlFor="prep-to" className="mb-1.5 block text-xs font-medium text-ink-700">
            To
          </label>
          <input
            id="prep-to"
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-md border border-ink-100 bg-surface px-3 py-1.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>
      </div>

      <Card className="p-5">
        {spendQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={BarChart3} title="No spend recorded yet" description="This fills in once purchase orders are placed and received." />
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-500">
              Total spend: <span className="font-semibold text-ink-900">{formatCurrency(total, 'UGX')}</span>
            </p>
            <ul className="divide-y divide-ink-100">
              {rows.map((row) => (
                <li key={row.supplierId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-ink-900">{row.supplierName}</p>
                    <p className="text-xs text-ink-500">
                      {row.orderCount} order{row.orderCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="font-semibold text-ink-900">{formatCurrency(row.totalSpendUgx, 'UGX')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
