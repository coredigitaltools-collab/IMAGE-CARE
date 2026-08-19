import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { CashFlowTabs } from '../../components/cashFlow/CashFlowTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/settings/FormField'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useCashInHandBreakdown, useRecordReconciliation, useReconciliations } from '../../features/accounting/hooks/useAccountingData'

export function CashReconciliationPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const breakdownQuery = useCashInHandBreakdown()
  const reconciliationsQuery = useReconciliations()
  const recordReconciliation = useRecordReconciliation(user.id)

  const [countedAmount, setCountedAmount] = useState(0)
  const [notes, setNotes] = useState('')

  const systemAmount = breakdownQuery.data?.cashInHandUgx ?? 0
  const variance = countedAmount - systemAmount

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Cash Flow' }]} />
      <CashFlowTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Cash Reconciliation</h1>
        <p className="mt-0.5 text-sm text-ink-500">Count the till, compare it to what the system expects, and log the difference.</p>
      </div>

      <Card className="mb-4 p-5">
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-ink-500">System says cash in hand is</p>
            <p className="text-lg font-semibold text-ink-900">{formatCurrency(systemAmount, 'UGX')}</p>
          </div>
          <div>
            <FormField
              id="recon-counted"
              label="Physically counted amount (UGX)"
              type="number"
              min={0}
              value={countedAmount}
              onChange={(e) => setCountedAmount(Number(e.target.value))}
            />
          </div>
        </div>

        {countedAmount > 0 && (
          <p className={`mb-4 text-sm ${variance === 0 ? 'text-success-700' : variance > 0 ? 'text-success-700' : 'text-brand-red-700'}`}>
            {variance === 0
              ? 'No variance, the till matches the system exactly.'
              : variance > 0
                ? `${formatCurrency(variance, 'UGX')} more than expected.`
                : `${formatCurrency(Math.abs(variance), 'UGX')} short of expected.`}
          </p>
        )}

        <div className="mb-4">
          <label htmlFor="recon-notes" className="mb-1.5 block text-sm font-medium text-ink-700">
            Notes (optional)
          </label>
          <textarea
            id="recon-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
          />
        </div>

        <Button
          onClick={async () => {
            await recordReconciliation.mutateAsync({ countedAmountUgx: countedAmount, notes })
            showToast(
              variance === 0 ? 'Reconciliation logged, no variance.' : 'Reconciliation logged, variance recorded as a cash adjustment.',
              'success',
            )
            setCountedAmount(0)
            setNotes('')
          }}
          disabled={countedAmount <= 0}
        >
          Log reconciliation
        </Button>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Reconciliation history</h2>
        {reconciliationsQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (reconciliationsQuery.data ?? []).length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No reconciliations yet" description="Logged reconciliations will appear here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(reconciliationsQuery.data ?? []).map((r) => (
              <li key={r.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-ink-900">{new Date(r.date).toLocaleDateString('en-UG')}</span>
                  <span className={r.varianceUgx === 0 ? 'text-success-700' : r.varianceUgx > 0 ? 'text-success-700' : 'text-brand-red-700'}>
                    {r.varianceUgx === 0 ? 'No variance' : `${r.varianceUgx > 0 ? '+' : ''}${formatCurrency(r.varianceUgx, 'UGX')}`}
                  </span>
                </div>
                <p className="text-xs text-ink-500">
                  Counted {formatCurrency(r.countedAmountUgx, 'UGX')} vs system {formatCurrency(r.systemAmountUgx, 'UGX')}, {formatRelativeTime(r.reconciledAt)}
                  {r.notes ? ` - ${r.notes}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
