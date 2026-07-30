import { Link } from 'react-router-dom'
import { BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { InvoiceTabs } from '../../components/invoices/InvoiceTabs'
import { Card } from '../../components/ui/Card'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { formatCurrency } from '../../lib/format'
import { useInvoices } from '../../features/invoices/hooks/useInvoicesData'
import { effectiveStatus } from '../../services/invoiceService'
import { INVOICE_STATUS_LABELS } from '../../types/invoices'
import type { Invoice } from '../../types/invoices'

const STATUSES = ['unpaid', 'partially_paid', 'overdue', 'paid', 'cancelled'] as const

export function InvoiceReportsPage() {
  const invoicesQuery = useInvoices()
  const invoices = invoicesQuery.data ?? []

  const buckets = STATUSES.map((status) => {
    const rows = invoices.filter((i) => effectiveStatus(i) === status)
    return { status, rows, total: rows.reduce((sum, r) => sum + r.totalAmount, 0) }
  })

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Invoices' }]} />
      <InvoiceTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Invoice Reports</h1>
        <p className="mt-0.5 text-sm text-ink-500">Every invoice broken down by status.</p>
      </div>

      {invoicesQuery.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : invoices.length === 0 ? (
        <Card className="p-5">
          <EmptyState icon={BarChart3} title="No invoices yet" description="This fills in once invoices are generated from sales." />
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {buckets.map((b) => (
              <Card key={b.status} className="p-4">
                <p className="text-xs text-ink-500">{INVOICE_STATUS_LABELS[b.status]}</p>
                <p className="mt-1 text-lg font-semibold text-ink-900">{formatCurrency(b.total, 'UGX')}</p>
                <p className="text-xs text-ink-500">
                  {b.rows.length} invoice{b.rows.length === 1 ? '' : 's'}
                </p>
              </Card>
            ))}
          </div>

          {buckets.map(
            (b) =>
              b.rows.length > 0 && (
                <Card key={b.status} className="p-5">
                  <h2 className="mb-3 text-sm font-semibold text-ink-900">{INVOICE_STATUS_LABELS[b.status]}</h2>
                  <ul className="divide-y divide-ink-100">
                    {b.rows.map((inv: Invoice) => (
                      <li key={inv.id} className="flex items-center justify-between py-2 text-sm">
                        <Link to={`/invoices/${inv.id}`} className="text-ink-900 hover:text-brand-blue-700">
                          {inv.invoiceNumber} · {inv.customerName}
                        </Link>
                        <span className="font-medium text-ink-900">{formatCurrency(inv.totalAmount, 'UGX')}</span>
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
