import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, FileMinus, Pencil, Trash2 } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { ExpenseFormModal } from '../../components/expenses/ExpenseFormModal'
import type { ExpenseFormValues } from '../../components/expenses/ExpenseFormModal'
import { useToast } from '../../components/ui/toastContext'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useDeleteExpense, useExpense, useExpenseCategories, useUpdateExpense } from '../../features/expenses/hooks/useExpensesData'

// 2026-08-31: simplified along with the rest of the module - this used to
// render Submit/Approve/Reject/Mark-paid/Cancel buttons for a draft/
// approval workflow the backend never actually implemented (every expense
// has always posted straight in as status: 'confirmed'), and read fields
// (reference, categoryName, expenseDate, status, attachment) that don't
// exist on the real Expense row shape (types/database.ts) - so this page
// was broken for any real expense before this rewrite. Now: a plain view
// with Edit and Delete, matching the Register page.
export function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showToast } = useToast()

  const expenseQuery = useExpense(id)
  const categoriesQuery = useExpenseCategories()
  const updateExpense = useUpdateExpense()
  const deleteExpense = useDeleteExpense()
  const activeCategories = (categoriesQuery.data ?? []).filter((c) => c.is_active)

  const [isEditOpen, setIsEditOpen] = useState(false)

  const expense = expenseQuery.data

  if (expenseQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    )
  }

  if (!expense) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState icon={FileMinus} title="Expense not found" description="It may have been removed." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        to="/expenses/register"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-blue-700"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Expenses
      </Link>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">{expense.expense_number}</h1>
          <p className="mt-1 text-sm text-ink-500">{expense.category} · {formatCurrency(expense.total_amount, 'UGX')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setIsEditOpen(true)}>
            <Pencil size={14} /> Edit
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm('Delete this expense? This cannot be undone.')) return
              await deleteExpense.mutateAsync(expense.id)
              showToast('Expense deleted.', 'success')
              navigate('/expenses/register')
            }}
          >
            <Trash2 size={14} /> Delete
          </Button>
        </div>
      </div>

      <div className="mb-4 text-xs text-ink-500">
        {new Date(expense.expense_date).toLocaleDateString('en-UG', { day: '2-digit', month: 'short', year: 'numeric' })}
      </div>

      <Card className="p-5">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-ink-500">Description</dt>
            <dd className="text-ink-900">{expense.description || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Amount</dt>
            <dd className="text-ink-900">{formatCurrency(expense.total_amount, 'UGX')}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Payment method</dt>
            <dd className="text-ink-900">{expense.payment_method}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Recorded</dt>
            <dd className="text-ink-900">{formatRelativeTime(expense.created_at)}</dd>
          </div>
        </dl>
      </Card>

      {isEditOpen && (
        <ExpenseFormModal
          title="Edit expense"
          submitLabel="Save changes"
          lockAmount
          categories={activeCategories}
          initialValues={{
            category: expense.category,
            description: expense.description ?? '',
            amount: expense.total_amount,
            expenseDate: expense.expense_date.slice(0, 10),
          }}
          onClose={() => setIsEditOpen(false)}
          onSubmit={async (input: ExpenseFormValues) => {
            await updateExpense.mutateAsync({
              id: expense.id,
              patch: { category: input.category, description: input.description, expense_date: input.expenseDate },
            })
            showToast('Expense updated.', 'success')
            setIsEditOpen(false)
          }}
        />
      )}
    </div>
  )
}
