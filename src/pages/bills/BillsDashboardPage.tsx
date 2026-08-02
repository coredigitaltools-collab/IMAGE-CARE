import { Link, useNavigate } from 'react-router-dom'
import { Wallet, Clock, AlertTriangle, CheckCircle2, FileText, BarChart3, ListChecks } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BillsTabs } from '../../components/bills/BillsTabs'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { formatCurrency } from '../../lib/format'
import { useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import { useBills, useBillsDashboardKpis } from '../../features/bills/hooks/useBillsData'

const STATUS_TONE = { unpaid: 'warning', partially_paid: 'warning', paid: 'success', cancelled: 'neutral', closed: 'info' } as const
const STATUS_LABELS = { unpaid: 'Unpaid', partially_paid: 'Partially Paid', paid: 'Paid', cancelled: 'Cancelled', closed: 'Closed' } as const

export function BillsDashboardPage() {
  const navigate = useNavigate()
  const kpisQuery = useBillsDashboardKpis()
  const billsQuery = useBills()
  const suppliersQuery = useSuppliers()

  const supplierName = (id: string) => suppliersQuery.data?.find((s) => s.id === id)?.name ?? 'Unknown supplier'
  const overdueBills = (billsQuery.data ?? [])
    .filter((b) => (b.status === 'unpaid' || b.status === 'partially_paid') && b.dueDate && new Date(b.dueDate).getTime() < Date.now())
    .sort((a, b) => (a.amount - a.amountPaid > b.amount - b.amountPaid ? -1 : 1))
    .slice(0, 6)

  const quickActions = [
    { label: 'Payables register', icon: ListChecks, onClick: () => navigate('/bills/register') },
    { label: 'Record a bill', icon: FileText, onClick: () => navigate('/purchasing/invoices') },
    { label: 'View overdue', icon: AlertTriangle, onClick: () => navigate('/bills/register?overdue=1') },
    { label: 'Aging & reports', icon: BarChart3, onClick: () => navigate('/bills/reports') },
  ]

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Bills & Payables' }]} />
      <BillsTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Bills & Payables</h1>
        <p className="mt-0.5 text-sm text-ink-500">What the business owes suppliers, and what's coming due.</p>
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
          label="Total payable"
          value={kpisQuery.data ? formatCurrency(kpisQuery.data.totalPayableUgx, 'UGX') : '-'}
          icon={Wallet}
          tone={kpisQuery.data && kpisQuery.data.totalPayableUgx > 0 ? 'red' : 'neutral'}
          isLoading={kpisQuery.isLoading}
        />
        <KpiCard label="Open bills" value={kpisQuery.data ? String(kpisQuery.data.billsCount) : '-'} icon={FileText} tone="blue" isLoading={kpisQuery.isLoading} />
        <KpiCard label="Due this week" value={kpisQuery.data ? String(kpisQuery.data.dueThisWeekCount) : '-'} icon={Clock} tone="neutral" isLoading={kpisQuery.isLoading} />
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
        <h2 className="mb-4 text-sm font-semibold text-ink-900">Most overdue bills</h2>
        {billsQuery.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : overdueBills.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nothing overdue" description="No bill is currently past its due date." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {overdueBills.map((bill) => (
              <li key={bill.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <Link to={`/bills/${bill.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                    {bill.reference}
                  </Link>
                  <p className="text-xs text-ink-500">{supplierName(bill.supplierId)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={STATUS_TONE[bill.status]}>{STATUS_LABELS[bill.status]}</Badge>
                  <span className="text-sm font-semibold text-brand-red-700">{formatCurrency(bill.amount - bill.amountPaid, 'UGX')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
