import { AlertTriangle, Trash2 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BankReconciliationTabs } from '../../components/bankReconciliation/BankReconciliationTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/Toast'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useBankAccounts, useDeleteStatementLine, useStatementLines } from '../../features/bankReconciliation/hooks/useBankReconciliationData'

export function UnmatchedTransactionsPage() {
  const { showToast } = useToast()
  const accountsQuery = useBankAccounts()
  const linesQuery = useStatementLines()
  const deleteLine = useDeleteStatementLine()

  const accountName = (id: string) => accountsQuery.data?.find((a) => a.id === id)?.name ?? 'Unknown account'
  const unmatched = (linesQuery.data ?? []).filter((l) => !l.isMatched)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Bank Reconciliation' }]} />
      <BankReconciliationTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Unmatched Transactions</h1>
        <p className="mt-0.5 text-sm text-ink-500">Statement lines with no matching deposit yet, across every account.</p>
      </div>

      <Card className="p-5">
        {linesQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : unmatched.length === 0 ? (
          <EmptyState icon={AlertTriangle} title="Nothing unmatched" description="Every statement line has a matching deposit." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {unmatched.map((line) => (
              <li key={line.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-ink-900">{line.description}</p>
                  <p className="text-xs text-ink-500">
                    {accountName(line.bankAccountId)} · {new Date(line.date).toLocaleDateString('en-UG')} · added{' '}
                    {formatRelativeTime(line.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="font-semibold text-ink-900">{formatCurrency(line.amountUgx, 'UGX')}</span>
                  <RowActionButton
                    icon={Trash2}
                    label="Delete"
                    tone="danger"
                    onClick={async () => {
                      if (!window.confirm('Delete this unmatched statement line?')) return
                      await deleteLine.mutateAsync(line.id)
                      showToast('Statement line deleted.', 'success')
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
