import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { CheckCircle2, FileMinus, Paperclip, Send, Wallet, XCircle } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import {
  useApproveExpense,
  useCancelExpense,
  useExpense,
  useMarkExpensePaid,
  useRejectExpense,
  useSubmitExpense,
} from '../../features/expenses/hooks/useExpensesData'
import { ApprovedExpenseImmutableError, InvalidExpenseTransitionError } from '../../services/expenseService'
import { EXPENSE_STATUS_LABELS } from '../../types/expenses'

const STATUS_TONE = { draft: 'neutral', pending_approval: 'warning', approved: 'info', rejected: 'danger', paid: 'success', cancelled: 'neutral' } as const

export function ExpenseDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { showToast } = useToast()

  const expenseQuery = useExpense(id)
  const submitExpense = useSubmitExpense(user.id)
  const approveExpense = useApproveExpense(user.id, user.name)
  const rejectExpense = useRejectExpense(user.id)
  const markPaid = useMarkExpensePaid(user.id)
  const cancelExpense = useCancelExpense(user.id)

  const [actionError, setActionError] = useState<string | undefined>()

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
      <SettingsPageHeader
        title={expense.reference}
        description={`${expense.categoryName} · ${formatCurrency(expense.amount, 'UGX')}`}
        action={
          <div className="flex flex-wrap gap-2">
            {expense.status === 'draft' && (
              <Button
                onClick={async () => {
                  await submitExpense.mutateAsync(expense.id)
                  showToast('Submitted for approval.', 'success')
                }}
              >
                <Send size={14} /> Submit
              </Button>
            )}
            {expense.status === 'pending_approval' && (
              <>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const reason = window.prompt('Reason for rejecting this expense?')
                    if (!reason) return
                    try {
                      await rejectExpense.mutateAsync({ id: expense.id, reason })
                      showToast('Expense rejected.', 'success')
                    } catch (err) {
                      setActionError(err instanceof InvalidExpenseTransitionError ? err.message : 'Could not reject this expense.')
                    }
                  }}
                >
                  <XCircle size={14} /> Reject
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      await approveExpense.mutateAsync(expense.id)
                      showToast('Expense approved.', 'success')
                    } catch (err) {
                      setActionError(err instanceof InvalidExpenseTransitionError ? err.message : 'Could not approve this expense.')
                    }
                  }}
                >
                  <CheckCircle2 size={14} /> Approve
                </Button>
              </>
            )}
            {expense.status === 'approved' && (
              <Button
                onClick={async () => {
                  await markPaid.mutateAsync(expense.id)
                  showToast('Expense marked as paid.', 'success')
                }}
              >
                <Wallet size={14} /> Mark paid
              </Button>
            )}
            {(expense.status === 'draft' || expense.status === 'pending_approval' || expense.status === 'rejected') && (
              <Button
                variant="danger"
                onClick={async () => {
                  const reason = window.prompt('Reason for cancelling this expense?')
                  if (!reason) return
                  try {
                    await cancelExpense.mutateAsync({ id: expense.id, reason })
                    showToast('Expense cancelled.', 'success')
                  } catch (err) {
                    setActionError(err instanceof ApprovedExpenseImmutableError ? err.message : 'Could not cancel this expense.')
                  }
                }}
              >
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {actionError && <p className="mb-4 text-sm text-brand-red-700">{actionError}</p>}

      <div className="mb-4 flex items-center gap-2">
        <Badge tone={STATUS_TONE[expense.status]}>{EXPENSE_STATUS_LABELS[expense.status]}</Badge>
        <span className="text-xs text-ink-500">{new Date(expense.expenseDate).toLocaleDateString('en-UG')}</span>
        {expense.approvedByName && <span className="text-xs text-ink-500">Approved by {expense.approvedByName}</span>}
      </div>
      {expense.rejectionReason && <p className="mb-4 text-xs text-brand-red-700">Rejected: {expense.rejectionReason}</p>}
      {expense.cancelReason && <p className="mb-4 text-xs text-ink-500">Cancelled: {expense.cancelReason}</p>}
      {expense.status === 'approved' && (
        <p className="mb-4 rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-500">
          This expense is approved and can no longer be cancelled or deleted.
        </p>
      )}

      <Card className="p-5">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-xs text-ink-500">Description</dt>
            <dd className="text-ink-900">{expense.description || '-'}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Amount</dt>
            <dd className="text-ink-900">{formatCurrency(expense.amount, 'UGX')}</dd>
          </div>
          <div>
            <dt className="text-xs text-ink-500">Created</dt>
            <dd className="text-ink-900">{formatRelativeTime(expense.created_at)}</dd>
          </div>
        </dl>

        {expense.attachment && (
          <div className="mt-4 border-t border-ink-100 pt-4">
            <p className="mb-2 text-xs text-ink-500">Receipt</p>
            {expense.attachment.mimeType.startsWith('image/') ? (
              <img src={expense.attachment.dataUrl} alt={expense.attachment.fileName} className="max-h-64 rounded-md border border-ink-100" />
            ) : (
              <a
                href={expense.attachment.dataUrl}
                download={expense.attachment.fileName}
                className="inline-flex items-center gap-1.5 text-sm text-brand-blue-700 hover:underline"
              >
                <Paperclip size={14} /> {expense.attachment.fileName}
              </a>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
