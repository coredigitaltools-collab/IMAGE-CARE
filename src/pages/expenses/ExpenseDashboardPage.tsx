import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wallet, Clock, CheckCircle2, TrendingDown, Plus, ListChecks, Tag, Repeat } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { ExpenseTabs } from '../../components/expenses/ExpenseTabs'
import { ExpenseFormModal } from '../../components/expenses/ExpenseFormModal'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import { useCreateExpense, useExpenseCategories, useExpenseDashboardKpis } from '../../features/expenses/hooks/useExpensesData'

export function ExpenseDashboardPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const kpisQuery = useExpenseDashboardKpis()
  const categoriesQuery = useExpenseCategories()
  const createExpense = useCreateExpense(user.id)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const activeCategories = (categoriesQuery.data ?? []).filter((c) => c.is_active)

  const quickActions = [
    { label: 'New expense', icon: Plus, onClick: () => setIsAddOpen(true) },
    { label: 'Register', icon: ListChecks, onClick: () => navigate('/expenses/register') },
    { label: 'Categories', icon: Tag, onClick: () => navigate('/expenses/categories') },
    { label: 'Recurring', icon: Repeat, onClick: () => navigate('/expenses/recurring') },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Expenses' }]} />
      <ExpenseTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Expenses</h1>
        <p className="mt-0.5 text-sm text-ink-500">What the business spends, tracked from request through payment.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="group flex flex-col items-center gap-1.5 rounded-card border border-ink-100 bg-white px-3 py-3 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover active:translate-y-0 active:scale-[0.97]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700 transition-all duration-200 group-hover:scale-110 group-hover:bg-brand-blue-700 group-hover:text-white">
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <span className="text-xs font-medium text-ink-700">{label}</span>
          </button>
        ))}
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
