import { Link } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { CreditTabs } from '../../components/credit/CreditTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useAgingReport } from '../../features/credit/hooks/useCreditData'

const BUCKET_TONE = ['text-ink-900', 'text-warning-700', 'text-warning-700', 'text-brand-red-700']

export function CreditReportsPage() {
  const agingQuery = useAgingReport()
  const buckets = agingQuery.data ?? []
  const totalOutstanding = buckets.reduce((sum, b) => sum + b.totalUgx, 0)

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Credit' }]} />
      <CreditTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Credit Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Aging analysis — how long balances have been outstanding.</p>
      </div>

      {agingQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : totalOutstanding === 0 ? (
        <Card className="p-5">
          <EmptyState icon={BarChart3} title="Nothing outstanding" description="There's no credit balance to age right now." />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {buckets.map((bucket, i) => (
              <Card key={bucket.label} className="p-4">
                <p className="text-xs text-ink-500">{bucket.label}</p>
                <p className={`mt-1 text-lg font-semibold ${BUCKET_TONE[i]}`}>{formatCurrency(bucket.totalUgx, 'UGX')}</p>
                <p className="text-xs text-ink-500">{bucket.accounts.length} account{bucket.accounts.length === 1 ? '' : 's'}</p>
              </Card>
            ))}
          </div>

          {buckets.map(
            (bucket, i) =>
              bucket.accounts.length > 0 && (
                <Card key={bucket.label} className="p-5">
                  <h2 className={`mb-3 text-sm font-semibold ${BUCKET_TONE[i]}`}>{bucket.label}</h2>
                  <ul className="divide-y divide-ink-100">
                    {bucket.accounts.map((a) => (
                      <li key={a.customer.id} className="flex items-center justify-between py-2 text-sm">
                        <Link to={`/customers/${a.customer.id}`} className="text-ink-900 hover:text-brand-blue-700">
                          {a.customer.name}
                        </Link>
                        <span className="font-medium text-ink-900">{formatCurrency(a.balance, 'UGX')}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ),
          )}
        </div>
      )}
    </div>
  )
}
