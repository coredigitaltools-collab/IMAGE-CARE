import { BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { CashFlowTabs } from '../../components/cashFlow/CashFlowTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useCashLedger } from '../../features/accounting/hooks/useAccountingData'
import { CASH_LEDGER_TYPE_LABELS } from '../../types/accounting'
import type { CashLedgerEntryType } from '../../types/accounting'

export function CashFlowReportsPage() {
  const ledgerQuery = useCashLedger()
  const ledger = ledgerQuery.data ?? []

  const totalsByType = new Map<CashLedgerEntryType, { direction: 'in' | 'out'; total: number; count: number }>()
  for (const entry of ledger) {
    const existing = totalsByType.get(entry.type) ?? { direction: entry.direction, total: 0, count: 0 }
    existing.total += entry.amountUgx
    existing.count += 1
    totalsByType.set(entry.type, existing)
  }
  const rows = [...totalsByType.entries()].sort((a, b) => b[1].total - a[1].total)

  const totalIn = ledger.filter((e) => e.direction === 'in').reduce((sum, e) => sum + e.amountUgx, 0)
  const totalOut = ledger.filter((e) => e.direction === 'out').reduce((sum, e) => sum + e.amountUgx, 0)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Cash Flow' }]} />
      <CashFlowTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Cash Flow Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">All-time totals, by type.</p>
      </div>

      {ledgerQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : ledger.length === 0 ? (
        <Card className="p-6">
          <EmptyState icon={BarChart3} title="No cash activity yet" description="This fills in once cash starts moving." />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-xs text-ink-500">Total in, all time</p>
              <p className="mt-1 text-lg font-semibold text-success-700">{formatCurrency(totalIn, 'UGX')}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-500">Total out, all time</p>
              <p className="mt-1 text-lg font-semibold text-brand-red-700">{formatCurrency(totalOut, 'UGX')}</p>
            </Card>
          </div>

          <Card className="p-5">
            <ul className="divide-y divide-ink-100">
              {rows.map(([type, data]) => (
                <li key={type} className="flex items-center justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-ink-900">{CASH_LEDGER_TYPE_LABELS[type]}</p>
                    <p className="text-xs text-ink-500">
                      {data.count} entr{data.count === 1 ? 'y' : 'ies'}
                    </p>
                  </div>
                  <span className={data.direction === 'in' ? 'font-semibold text-success-700' : 'font-semibold text-brand-red-700'}>
                    {formatCurrency(data.total, 'UGX')}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  )
}
