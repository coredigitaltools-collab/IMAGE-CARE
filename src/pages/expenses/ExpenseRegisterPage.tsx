import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileMinus, Plus, Send } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { ExpenseTabs } from '../../components/expenses/ExpenseTabs'
import { ExpenseFormModal } from '../../components/expenses/ExpenseFormModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useCreateExpense, useExpenseCategories, useExpenses, useSubmitExpense } from '../../features/expenses/hooks/useExpensesData'
import { EXPENSE_STATUS_LABELS } from '../../types/expenses'
import type { ExpenseStatus } from '../../types/expenses'

const STATUS_TONE = { draft: 'neutral', pending_approval: 'warning', approved: 'info', rejected: 'danger', paid: 'success', cancelled: 'neutral' } as const

export function ExpenseRegisterPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const expensesQuery = useExpenses()
  const categoriesQuery = useExpenseCategories()
  const createExpense = useCreateExpense(user.id)
  const submitExpense = useSubmitExpense(user.id)

  const [statusFilter, setStatusFilter] = useState<ExpenseStatus | 'all'>('all')
  const [isAddOpen, setIsAddOpen] = useState(false)

  const activeCategories = (categoriesQuery.data ?? []).filter((c) => c.is_active)
  const filtered = useMemo(() => {
    const all = expensesQuery.data ?? []
    return statusFilter === 'all' ? all : all.filter((e) => e.status === statusFilter)
  }, [expensesQuery.data, statusFilter])

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Expenses' }]} />
      <ExpenseTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Expense Register</h1>
          <p className="mt-0.5 text-sm text-ink-500">Every expense, from draft through payment.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> New expense
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['all', 'draft', 'pending_approval', 'approved', 'rejected', 'paid', 'cancelled'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={
              statusFilter === s
                ? 'rounded-full bg-brand-blue-700 px-3 py-1 text-xs font-medium text-white'
                : 'rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50'
            }
          >
            {s === 'all' ? 'All' : EXPENSE_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {expensesQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={FileMinus} title="No expenses found" description="Record a new expense to get started." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {filtered.map((exp) => (
              <li key={exp.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link to={`/expenses/${exp.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                      {exp.reference}
                    </Link>
                    <Badge tone={STATUS_TONE[exp.status]}>{EXPENSE_STATUS_LABELS[exp.status]}</Badge>
                  </div>
                  <p className="text-xs text-ink-500">
                    {exp.categoryName} · {exp.description || 'No description'} · {formatRelativeTime(exp.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold text-ink-900">{formatCurrency(exp.amount, 'UGX')}</span>
                  {exp.status === 'draft' && (
                    <RowActionButton
                      icon={Send}
                      label="Submit for approval"
                      onClick={async () => {
                        await submitExpense.mutateAsync(exp.id)
                        showToast('Submitted for approval.', 'success')
                      }}
                    />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
