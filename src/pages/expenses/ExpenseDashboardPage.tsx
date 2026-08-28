import { useState } from 'react'
import { Wallet, Clock, CheckCircle2, TrendingDown, Plus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { ExpenseTabs } from '../../components/expenses/ExpenseTabs'
import { ExpenseFormModal } from '../../components/expenses/ExpenseFormModal'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { Button } from '../../components/ui/Button'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import { useCreateExpense, useExpenseCategories, useExpenseDashboardKpis } from '../../features/expenses/hooks/useExpensesData'

export function ExpenseDashboardPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const kpisQuery = useExpenseDashboardKpis()
  const categoriesQuery = useExpenseCategories()
  const createExpense = useCreateExpense(user.id)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const activeCategories = (categoriesQuery.data ?? []).filter((c) => c.is_active)

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Expenses' }]} />
      <ExpenseTabs />

      {/* Register, Categories, Recurring and Settings all live as tabs
          above, a second row of tiles here just repeated the same
          destinations. The one thing this page needs to make obvious
          is how to record a new expense. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Expenses</h1>
          <p className="mt-0.5 text-sm text-ink-500">What the business spends, tracked from request through payment.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> New expense
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="This month"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.totalThisMonthUgx, 'UGX') : '-'}
          icon={TrendingDown}
          tone="blue"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Pending approval"
          value={kpisQuery.data ? String(kpisQuery.data.pendingApprovalCount) : '-'}
          icon={Clock}
          tone={kpisQuery.data && kpisQuery.data.pendingApprovalCount > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Approved, unpaid"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.approvedUnpaidUgx, 'UGX') : '-'}
          icon={Wallet}
          tone="neutral"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Paid this month"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.paidThisMonthUgx, 'UGX') : '-'}
          icon={CheckCircle2}
          tone="success"
          isLoading={kpisQuery.isLoading}
        />
      </div>

      {isAddOpen && (
        <ExpenseFormModal
          categories={activeCategories}
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (input) => {
            await createExpense.mutateAsync(input)
            showToast('Expense saved as draft.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}
    </div>
  )
}
