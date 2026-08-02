import { BarChart3, Undo2 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BankReconciliationTabs } from '../../components/bankReconciliation/BankReconciliationTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/Toast'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useBankAccounts, useStatementLines, useUnmatchTransaction } from '../../features/bankReconciliation/hooks/useBankReconciliationData'

export function BankReportsPage() {
  const { showToast } = useToast()
  const accountsQuery = useBankAccounts()
  const linesQuery = useStatementLines()
  const unmatchTransaction = useUnmatchTransaction()

  const accountName = (id: string) => accountsQuery.data?.find((a) => a.id === id)?.name ?? 'Unknown account'
  const matched = (linesQuery.data ?? []).filter((l) => l.isMatched)
  const totalMatchedUgx = matched.reduce((sum, l) => sum + l.amountUgx, 0)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Bank Reconciliation' }]} />
      <BankReconciliationTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Reconciliation Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Every statement line that has been reconciled, across every account.</p>
      </div>

      <Card className="p-5">
        {linesQuery.isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : matched.length === 0 ? (
          <EmptyState icon={BarChart3} title="Nothing reconciled yet" description="Matched statement lines will appear here." />
        ) : (
          <>
            <p className="mb-4 text-sm text-ink-500">
              Total reconciled: <span className="font-semibold text-ink-900">{formatCurrency(totalMatchedUgx, 'UGX')}</span>
            </p>
            <ul className="divide-y divide-ink-100">
              {matched.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium text-ink-900">{line.description}</p>
                    <p className="text-xs text-ink-500">
                      {accountName(line.bankAccountId)} · matched {line.matchedAt ? formatRelativeTime(line.matchedAt) : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold text-success-700">{formatCurrency(line.amountUgx, 'UGX')}</span>
                    <RowActionButton
                      icon={Undo2}
                      label="Unmatch"
                      tone="danger"
                      onClick={async () => {
                        await unmatchTransaction.mutateAsync(line.id)
                        showToast('Unmatched.', 'success')
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  )
}
