import { BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { ExpenseTabs } from '../../components/expenses/ExpenseTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useSpendByCategory } from '../../features/expenses/hooks/useExpensesData'

export function ExpenseReportsPage() {
  const spendQuery = useSpendByCategory()
  const rows = spendQuery.data ?? []
  const total = rows.reduce((sum, r) => sum + r.totalUgx, 0)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Expenses' }]} />
      <ExpenseTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Expense Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Spend by category — excludes cancelled and rejected expenses.</p>
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
