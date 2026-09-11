import { useState } from 'react'
import { CalendarDays, ListChecks, TrendingDown, Wallet, Plus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { ExpenseTabs } from '../../components/expenses/ExpenseTabs'
import { ExpenseFormModal } from '../../components/expenses/ExpenseFormModal'
import type { ExpenseFormValues } from '../../components/expenses/ExpenseFormModal'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import { useCreateExpense, useExpenseCategories, useExpenseDashboardKpis, useExpenses } from '../../features/expenses/hooks/useExpensesData'

// 2026-08-31: KPIs simplified along with the rest of the module - "Pending
// approval" / "Approved, unpaid" / "Paid this month" all measured a
// draft/approval workflow the backend never implemented (every expense has
// always posted straight in as status: 'confirmed'), so under real data
// they were permanently zero. Replaced with the numbers that are actually
// true of a "recorded, not tracked-through-a-workflow" expense: this
// month's total, this month's count, the all-time total, and the number of
// categories in use.
export function ExpenseDashboardPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const kpisQuery = useExpenseDashboardKpis()
  const expensesQuery = useExpenses()
  const categoriesQuery = useExpenseCategories()
  const createExpense = useCreateExpense(user.id)
  const activeCategories = (categoriesQuery.data ?? []).filter((c) => c.is_active)

  const [isAddOpen, setIsAddOpen] = useState(false)

  const categoryCount = new Set((expensesQuery.data ?? []).map((e: { category: string }) => e.category)).size

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Expenses' }]} />
      <ExpenseTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Expenses</h1>
          <p className="mt-0.5 text-sm text-ink-500">What the business spends, recorded as it happens.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> Add expense
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="This month"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.totalThisMonthUgx, 'UGX') : '-'}
          hint={kpisQuery.data ? `${kpisQuery.data.countThisMonth} expense${kpisQuery.data.countThisMonth === 1 ? '' : 's'}` : undefined}
          icon={TrendingDown}
          tone="blue"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="All-time total"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.totalOverallUgx, 'UGX') : '-'}
          hint={kpisQuery.data ? `${kpisQuery.data.countOverall} expense${kpisQuery.data.countOverall === 1 ? '' : 's'}` : undefined}
          icon={Wallet}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="This month's count"
          value={kpisQuery.data ? String(kpisQuery.data.countThisMonth) : '-'}
          icon={CalendarDays}
          tone="success"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Categories in use"
          value={String(categoryCount)}
          icon={ListChecks}
          tone="neutral"
          isLoading={expensesQuery.isLoading}
        />
      </div>

      {isAddOpen && (
        <ExpenseFormModal
          title="Add expense"
          submitLabel="Save"
          categories={activeCategories}
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (input: ExpenseFormValues) => {
            await createExpense.mutateAsync({
              category: input.category,
              description: input.description,
              amount: input.amount,
              expenseDate: input.expenseDate,
            })
            showToast('Expense recorded.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}
    </div>
  )
}
