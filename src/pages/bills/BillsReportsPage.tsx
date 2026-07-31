import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, FileText } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BillsTabs } from '../../components/bills/BillsTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import { usePayablesAging, useSupplierStatement } from '../../features/bills/hooks/useBillsData'

const BUCKET_TONE = ['text-ink-900', 'text-warning-700', 'text-warning-700', 'text-brand-red-700', 'text-brand-red-700']

export function BillsReportsPage() {
  const agingQuery = usePayablesAging()
  const suppliersQuery = useSuppliers()
  const [statementSupplierId, setStatementSupplierId] = useState('')
  const statementQuery = useSupplierStatement(statementSupplierId || undefined)

  const buckets = agingQuery.data ?? []
  const totalOutstanding = buckets.reduce((sum, b) => sum + b.totalUgx, 0)
  const activeSuppliers = (suppliersQuery.data ?? []).filter((s) => s.status === 'active')

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Bills & Payables' }]} />
      <BillsTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Aging & Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">How overdue outstanding bills are, and a per-supplier statement.</p>
      </div>

      {agingQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : totalOutstanding === 0 ? (
        <Card className="p-5">
          <EmptyState icon={BarChart3} title="Nothing outstanding" description="There's no payable balance to age right now." />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {buckets.map((bucket, i) => (
              <Card key={bucket.label} className="p-4">
                <p className="text-xs text-ink-500">{bucket.label}</p>
                <p className={`mt-1 text-lg font-semibold ${BUCKET_TONE[i]}`}>{formatCurrency(bucket.totalUgx, 'UGX')}</p>
                <p className="text-xs text-ink-500">
                  {bucket.rows.length} bill{bucket.rows.length === 1 ? '' : 's'}
                </p>
              </Card>
            ))}
          </div>

          {buckets.map(
            (bucket, i) =>
              bucket.rows.length > 0 && (
                <Card key={bucket.label} className="p-5">
                  <h2 className={`mb-3 text-sm font-semibold ${BUCKET_TONE[i]}`}>{bucket.label}</h2>
                  <ul className="divide-y divide-ink-100">
                    {bucket.rows.map((row) => (
                      <li key={row.bill.id} className="flex items-center justify-between py-2 text-sm">
                        <Link to={`/bills/${row.bill.id}`} className="text-ink-900 hover:text-brand-blue-700">
                          {row.bill.reference} · {row.supplierName}
                        </Link>
                        <span className="font-medium text-ink-900">{formatCurrency(row.amountOwed, 'UGX')}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ),
          )}
        </div>
      )}

      <Card className="mt-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Supplier statement</h2>
        <select
          value={statementSupplierId}
          onChange={(e) => setStatementSupplierId(e.target.value)}
          className="mb-4 w-full max-w-sm rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
        >
          <option value="">Select a supplier…</option>
          {activeSuppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        {!statementSupplierId ? (
          <p className="text-xs text-ink-500">Choose a supplier to see their running balance.</p>
        ) : statementQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (statementQuery.data ?? []).length === 0 ? (
          <EmptyState icon={FileText} title="No activity" description="This supplier has no bills or payments on record." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(statementQuery.data ?? []).map((line, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="text-ink-900">{line.description}</p>
                  <p className="text-xs text-ink-500">{formatRelativeTime(line.date)}</p>
                </div>
                <div className="text-right">
                  {line.debit > 0 && <p className="text-brand-red-700">+{formatCurrency(line.debit, 'UGX')}</p>}
                  {line.credit > 0 && <p className="text-success-700">-{formatCurrency(line.credit, 'UGX')}</p>}
                  <p className="text-xs text-ink-500">Balance {formatCurrency(line.runningBalance, 'UGX')}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
