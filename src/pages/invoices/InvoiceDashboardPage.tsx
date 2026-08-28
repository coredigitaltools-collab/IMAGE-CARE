import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { FileText, Clock, AlertTriangle, Wallet, CheckCircle2, Plus, BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { InvoiceTabs } from '../../components/invoices/InvoiceTabs'
import { GenerateInvoiceModal } from '../../components/invoices/GenerateInvoiceModal'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import {
  useGenerateInvoice,
  useInvoiceDashboardKpis,
  useInvoiceSettings,
  useInvoices,
  useUninvoicedSales,
} from '../../features/invoices/hooks/useInvoicesData'
import { AlreadyInvoicedError, effectiveStatus } from '../../services/invoiceService'
import { INVOICE_STATUS_LABELS } from '../../types/invoices'

const STATUS_TONE = { unpaid: 'warning', partially_paid: 'warning', paid: 'success', overdue: 'danger', cancelled: 'neutral' } as const

export function InvoiceDashboardPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const kpisQuery = useInvoiceDashboardKpis()
  const invoicesQuery = useInvoices()
  const uninvoicedQuery = useUninvoicedSales()
  const settingsQuery = useInvoiceSettings()
  const generateInvoice = useGenerateInvoice(user.id)

  const [isGenerateOpen, setIsGenerateOpen] = useState(false)
  const [genError, setGenError] = useState<string | undefined>()

  const overdueOrOutstanding = (invoicesQuery.data ?? []).filter((i) => i.status === 'unpaid' || i.status === 'partially_paid').slice(0, 6)

  const quickActions = [
    {
      label: 'Invoice a sale',
      icon: Plus,
      onClick: () => {
        setGenError(undefined)
        setIsGenerateOpen(true)
      },
    },
    { label: 'All invoices', icon: FileText, onClick: () => navigate('/invoices/all') },
    { label: 'Reports', icon: BarChart3, onClick: () => navigate('/invoices/reports') },
    { label: 'Settings', icon: Clock, onClick: () => navigate('/invoices/settings') },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Invoices' }]} />
      <InvoiceTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Invoices</h1>
        <p className="mt-0.5 text-sm text-ink-500">Every invoice generated from a completed sale, and what's still owed.</p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickActions.map(({ label, icon: Icon, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="group flex flex-col items-center gap-1.5 rounded-card border border-ink-100 bg-white px-3 py-3 text-center shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover active:translate-y-0 active:scale-[0.97]"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700 transition-all duration-200 group-hover:scale-110 group-hover:bg-brand-blue-700 group-hover:text-white">
              <Icon size={16} strokeWidth={1.75} />
            </span>
            <span className="text-xs font-medium text-ink-700">{label}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="Invoiced this month"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.invoicedThisMonthUgx, 'UGX') : '-'}
          icon={FileText}
          tone="blue"
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Outstanding"
          value={kpisQuery.data ? String(kpisQuery.data.outstandingCount) : '-'}
          icon={Clock}
          tone={kpisQuery.data && kpisQuery.data.outstandingCount > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Outstanding amount"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.outstandingAmountUgx, 'UGX') : '-'}
          icon={Wallet}
          tone={kpisQuery.data && kpisQuery.data.outstandingAmountUgx > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Overdue"
          value={kpisQuery.data ? String(kpisQuery.data.overdueCount) : '-'}
          icon={AlertTriangle}
          tone={kpisQuery.data && kpisQuery.data.overdueCount > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard
          label="Paid this month"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.paidThisMonthUgx, 'UGX') : '-'}
          icon={CheckCircle2}
          tone="success"
          isLoading={kpisQuery.isLoading}
        />
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-900">Outstanding invoices</h2>
        {invoicesQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : overdueOrOutstanding.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nothing outstanding" description="Every invoice is paid, or none exist yet." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {overdueOrOutstanding.map((inv) => {
              const status = effectiveStatus(inv)
              return (
                <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link to={`/invoices/${inv.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                      {inv.invoiceNumber}
                    </Link>
                    <p className="text-xs text-ink-500">{inv.customerName}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone={STATUS_TONE[status]}>{INVOICE_STATUS_LABELS[status]}</Badge>
                    <span className="text-sm font-semibold text-ink-900">{formatCurrency(inv.totalAmount, 'UGX')}</span>
                  </div>
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
