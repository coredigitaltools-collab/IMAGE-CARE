import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText, Plus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { InvoiceTabs } from '../../components/invoices/InvoiceTabs'
import { GenerateInvoiceModal } from '../../components/invoices/GenerateInvoiceModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useGenerateInvoice, useInvoiceSettings, useInvoices, useUninvoicedSales } from '../../features/invoices/hooks/useInvoicesData'
import { AlreadyInvoicedError, effectiveStatus } from '../../services/invoiceService'
import { INVOICE_STATUS_LABELS } from '../../types/invoices'
import type { InvoiceStatus } from '../../types/invoices'

const STATUS_TONE = { unpaid: 'warning', partially_paid: 'warning', paid: 'success', overdue: 'danger', cancelled: 'neutral' } as const

export function InvoicesListPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const invoicesQuery = useInvoices()
  const uninvoicedQuery = useUninvoicedSales()
  const settingsQuery = useInvoiceSettings()
  const generateInvoice = useGenerateInvoice(user.id)

  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | 'all' | 'overdue'>('all')
  const [isGenerateOpen, setIsGenerateOpen] = useState(false)
  const [genError, setGenError] = useState<string | undefined>()

  const filtered = useMemo(() => {
    const all = invoicesQuery.data ?? []
    if (statusFilter === 'all') return all
    return all.filter((i) => effectiveStatus(i) === statusFilter)
  }, [invoicesQuery.data, statusFilter])

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Invoices' }]} />
      <InvoiceTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">All Invoices</h1>
          <p className="mt-0.5 text-sm text-ink-500">Complete invoice history, cancelled ones stay visible, never deleted.</p>
        </div>
        <Button
          onClick={() => {
            setGenError(undefined)
            setIsGenerateOpen(true)
          }}
        >
          <Plus size={15} /> Invoice a sale
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(['all', 'unpaid', 'partially_paid', 'overdue', 'paid', 'cancelled'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={
              statusFilter === s
                ? 'rounded-full bg-brand-blue-700 px-3 py-1 text-xs font-medium text-white'
                : 'rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50'
            }
          >
            {s === 'all' ? 'All' : INVOICE_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <Card className="p-5">
        {invoicesQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={statusFilter === 'all' ? 'No invoices yet' : 'No invoices match this filter'}
            description={
              statusFilter === 'all'
                ? 'Generate an invoice from a completed sale to start tracking what customers owe.'
                : 'Try a different status filter, or view all invoices.'
            }
            action={
              statusFilter === 'all'
                ? {
                    label: '+ Invoice a sale',
                    onClick: () => {
                      setGenError(undefined)
                      setIsGenerateOpen(true)
                    },
                  }
                : { label: 'Show all invoices', onClick: () => setStatusFilter('all') }
            }
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {filtered.map((inv) => {
              const status = effectiveStatus(inv)
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link to={`/invoices/${inv.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                        {inv.invoiceNumber}
                      </Link>
                      <Badge tone={STATUS_TONE[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>
                    </div>
                    <p className="text-xs text-ink-500">
                      {inv.customerName} · {formatRelativeTime(inv.issuedAt)}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold text-ink-900">{formatCurrency(inv.totalAmount, 'UGX')}</span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {isGenerateOpen && (
        <GenerateInvoiceModal
          uninvoicedSales={uninvoicedQuery.data ?? []}
          defaultDueDays={settingsQuery.data?.defaultDueDays ?? 14}
          submitError={genError}
          onClose={() => setIsGenerateOpen(false)}
          onSubmit={async (saleId, dueDate) => {
            try {
              await generateInvoice.mutateAsync({ saleId, dueDate })
              showToast('Invoice generated.', 'success')
              setIsGenerateOpen(false)
            } catch (err) {
              setGenError(err instanceof AlreadyInvoicedError ? err.message : 'Could not generate this invoice.')
            }
          }}
        />
      )}
    </div>
  )
}
