import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GitCompare, Plus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BankReconciliationTabs } from '../../components/bankReconciliation/BankReconciliationTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/settings/FormField'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import {
  useAddStatementLine,
  useBankAccounts,
  useMatchTransaction,
  useStatementLines,
  useUnmatchedDeposits,
} from '../../features/bankReconciliation/hooks/useBankReconciliationData'
import { AmountMismatchError } from '../../services/bankReconciliationService'

export function ReconciliationPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const accountsQuery = useBankAccounts()
  const activeAccounts = (accountsQuery.data ?? []).filter((a) => a.is_active)
  const accountId = searchParams.get('account') || activeAccounts[0]?.id || ''

  const linesQuery = useStatementLines(accountId)
  const depositsQuery = useUnmatchedDeposits(accountId)
  const addLine = useAddStatementLine(user.id)
  const matchTransaction = useMatchTransaction()

  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  const [matchError, setMatchError] = useState<string | undefined>()

  const [lineDate, setLineDate] = useState(new Date().toISOString().slice(0, 10))
  const [lineDescription, setLineDescription] = useState('')
  const [lineAmount, setLineAmount] = useState(0)

  const unmatchedLines = (linesQuery.data ?? []).filter((l) => !l.isMatched)
  const deposits = depositsQuery.data ?? []

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Bank Reconciliation' }]} />
      <BankReconciliationTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Reconciliation</h1>
          <p className="mt-0.5 text-sm text-ink-500">Enter what's on the real bank statement, then match it against a recorded deposit.</p>
        </div>
        {activeAccounts.length > 0 && (
          <select
            value={accountId}
            onChange={(e) => setSearchParams({ account: e.target.value })}
            className="rounded-md border border-ink-100 bg-white px-3 py-1.5 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {activeAccounts.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={GitCompare} title="No bank accounts yet" description="Create a bank account first, under Bank Accounts." />
        </Card>
      ) : (
        <>
          <Card className="mb-4 p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Add a statement line</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor="sl-date" className="mb-1.5 block text-sm font-medium text-ink-700">
                  Date
                </label>
                <input
                  id="sl-date"
                  type="date"
                  value={lineDate}
                  onChange={(e) => setLineDate(e.target.value)}
                  className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
                />
              </div>
              <div className="sm:col-span-2">
                <FormField id="sl-desc" label="Description" value={lineDescription} onChange={(e) => setLineDescription(e.target.value)} />
              </div>
              <FormField id="sl-amount" label="Amount (UGX)" type="number" min={0} value={lineAmount} onChange={(e) => setLineAmount(Number(e.target.value))} />
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                variant="secondary"
                disabled={!lineDescription.trim() || lineAmount <= 0}
                onClick={async () => {
                  await addLine.mutateAsync({ bankAccountId: accountId, date: lineDate, description: lineDescription, amountUgx: lineAmount })
                  showToast('Statement line added.', 'success')
                  setLineDescription('')
                  setLineAmount(0)
                }}
              >
                <Plus size={14} /> Add line
              </Button>
            </div>
          </Card>

          {matchError && <p className="mb-4 text-sm text-brand-red-700">{matchError}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-ink-900">Statement lines (unmatched)</h2>
              {linesQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : unmatchedLines.length === 0 ? (
                <EmptyState icon={GitCompare} title="Nothing to match" description="Add a line from the real bank statement above." />
              ) : (
                <ul className="space-y-2">
                  {unmatchedLines.map((line) => (
                    <li key={line.id}>
                      <button
                        onClick={() => setSelectedLineId(line.id === selectedLineId ? null : line.id)}
                        className={`w-full rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                          selectedLineId === line.id ? 'border-brand-blue-500 bg-brand-blue-50' : 'border-ink-100 bg-white hover:bg-ink-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-ink-900">{line.description}</span>
                          <span className="font-semibold text-ink-900">{formatCurrency(line.amountUgx, 'UGX')}</span>
                        </div>
                        <p className="text-xs text-ink-500">{new Date(line.date).toLocaleDateString('en-UG')}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-ink-900">Recorded deposits (unmatched)</h2>
              <p className="mb-3 text-xs text-ink-500">
                {selectedLineId ? 'Select a deposit to match with the highlighted statement line.' : 'Select a statement line first.'}
              </p>
              {depositsQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : deposits.length === 0 ? (
                <EmptyState icon={GitCompare} title="No unmatched deposits" description="Deposits recorded for this account will appear here." />
              ) : (
                <ul className="space-y-2">
                  {deposits.map((deposit) => (
                    <li key={deposit.id}>
                      <button
                        disabled={!selectedLineId}
                        onClick={async () => {
                          if (!selectedLineId) return
                          setMatchError(undefined)
                          try {
                            await matchTransaction.mutateAsync({ statementLineId: selectedLineId, movementId: deposit.id })
                            showToast('Matched.', 'success')
                            setSelectedLineId(null)
                          } catch (err) {
                            setMatchError(err instanceof AmountMismatchError ? err.message : 'Could not match these.')
                          }
                        }}
                        className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-left text-sm hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-ink-900">{deposit.reason}</span>
                          <span className="font-semibold text-ink-900">{formatCurrency(deposit.amount, 'UGX')}</span>
                        </div>
                        <p className="text-xs text-ink-500">{formatRelativeTime(deposit.createdAt)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
