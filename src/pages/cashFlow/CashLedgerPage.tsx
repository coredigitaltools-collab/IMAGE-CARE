import { useMemo, useState } from 'react'
import { ListChecks } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { CashFlowTabs } from '../../components/cashFlow/CashFlowTabs'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useCashLedger } from '../../features/accounting/hooks/useAccountingData'
import { CASH_LEDGER_TYPE_LABELS } from '../../types/accounting'

export function CashLedgerPage() {
  const ledgerQuery = useCashLedger()
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all')

  const rows = useMemo(() => {
    const all = [...(ledgerQuery.data ?? [])].reverse()
    return filter === 'all' ? all : all.filter((e) => e.direction === filter)
  }, [ledgerQuery.data, filter])

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Cash Flow' }]} />
      <CashFlowTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Cash Ledger</h1>
        <p className="mt-0.5 text-sm text-ink-500">Every cash sale, payment received, expense paid, and movement, in one running balance.</p>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['all', 'in', 'out'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              filter === f
                ? 'rounded-full bg-brand-blue-700 px-3 py-1 text-xs font-medium text-white'
                : 'rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50'
            }
          >
            {f === 'all' ? 'All' : f === 'in' ? 'Cash Inflows' : 'Cash Outflows'}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {ledgerQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState icon={ListChecks} title="No cash activity yet" description="Sales, payments, and cash movements will appear here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-ink-900">{row.description}</p>
                    <Badge tone={row.direction === 'in' ? 'success' : 'neutral'}>{CASH_LEDGER_TYPE_LABELS[row.type]}</Badge>
                  </div>
                  <p className="text-xs text-ink-500">{formatRelativeTime(row.date)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={row.direction === 'in' ? 'font-semibold text-success-700' : 'font-semibold text-brand-red-700'}>
                    {row.direction === 'in' ? '+' : '-'}
                    {formatCurrency(row.amountUgx, 'UGX')}
                  </p>
                  <p className="text-xs text-ink-500">Balance {formatCurrency(row.runningBalanceUgx, 'UGX')}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
