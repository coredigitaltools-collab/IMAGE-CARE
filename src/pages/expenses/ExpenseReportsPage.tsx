import { useState } from 'react'
import { BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { ExpenseTabs } from '../../components/expenses/ExpenseTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useSpendByCategory } from '../../features/expenses/hooks/useExpensesData'

function firstOfMonth(): string {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ExpenseReportsPage() {
  // Bug fix (2026-09-07): "Expense Report" had no way to change the
  // reporting period at all - it always showed all-time spend with no
  // From/To controls. Defaults to the current month, matching how other
  // report pages in this app default (e.g. Sales Targets' "this month").
  const [from, setFrom] = useState(firstOfMonth())
  const [to, setTo] = useState(today())
  const spendQuery = useSpendByCategory(undefined, from, to)
  const rows = spendQuery.data ?? []
  const total = rows.reduce((sum, r) => sum + r.totalUgx, 0)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Expenses' }]} />
      <ExpenseTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Expense Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Spend by category, excludes cancelled and rejected expenses.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="rep-from" className="mb-1.5 block text-xs font-medium text-ink-700">
            From
          </label>
          <input
            id="rep-from"
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-md border border-ink-100 bg-surface px-3 py-1.5 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>
        <div>
          <label htmlFor="rep-to" className="mb-1.5 block text-xs font-medium text-ink-700">
            To
          </label>
          <input
            id="rep-to"
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
          <EmptyState icon={BarChart3} title="No spend recorded yet" description="This fills in once expenses are submitted and approved." />
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-500">
              Total: <span className="font-semibold text-ink-900">{formatCurrency(total, 'UGX')}</span>
            </p>
            <ul className="divide-y divide-ink-100">
              {rows.map((row) => (
                <li key={row.categoryId} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-ink-900">{row.categoryName}</p>
                    <p className="text-xs text-ink-500">
                      {row.count} expense{row.count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <span className="font-semibold text-ink-900">{formatCurrency(row.totalUgx, 'UGX')}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
