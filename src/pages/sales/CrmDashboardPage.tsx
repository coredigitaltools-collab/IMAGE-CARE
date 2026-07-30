import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Users, UserPlus, TrendingUp, Wallet, CreditCard, Award, Search, Upload, Download, BarChart3 } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { CustomerTabs } from '../../components/crm/CustomerTabs'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { Card } from '../../components/ui/Card'
import { EmptyState } from '../../components/ui/EmptyState'
import { Skeleton } from '../../components/ui/Skeleton'
import { CustomerFormModal } from '../../components/sales/CustomerFormModal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import { useCreateCustomer, useCrmKpis, useCustomers } from '../../features/sales/hooks/useSalesData'

export function CrmDashboardPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const kpisQuery = useCrmKpis()
  const customersQuery = useCustomers()
  const createCustomer = useCreateCustomer(user.id)

  const [isAddOpen, setIsAddOpen] = useState(false)

  const activeCustomers = (customersQuery.data ?? []).filter((c) => c.is_active)

  // "Who are our best customers?" — a real decision-support question
  // (who deserves priority service, a loyalty perk, a personal call).
  const topCustomers = [...activeCustomers].sort((a, b) => b.lifetimePurchases - a.lifetimePurchases).slice(0, 5)

  // "Who owes us money, and how much?" — directly actionable (follow up
  // on collections), not a vanity metric.
  const customersWithCredit = [...activeCustomers]
    .filter((c) => c.creditBalance > 0)
    .sort((a, b) => b.creditBalance - a.creditBalance)
    .slice(0, 5)

  const exportCsv = () => {
    if (activeCustomers.length === 0) {
      showToast('No customers to export yet.')
      return
    }
    const header = ['Name', 'Phone', 'Email', 'Tags', 'Lifetime Purchases (UGX)', 'Loyalty Points', 'Credit Balance (UGX)']
    const rows = activeCustomers.map((c) => [c.name, c.phone, c.email, c.tags.join('; '), c.lifetimePurchases, c.loyaltyPoints, c.creditBalance])
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showToast('Customers exported.', 'success')
  }

  const quickActions = [
    { label: 'Search', icon: Search, onClick: () => navigate('/customers/directory') },
    { label: 'Add', icon: UserPlus, onClick: () => setIsAddOpen(true) },
    { label: 'Import', icon: Upload, onClick: () => showToast('CSV import is coming in a future update.') },
    { label: 'Export', icon: Download, onClick: exportCsv },
  ]

  const isEmptyInstall = customersQuery.data && activeCustomers.length === 0 && !customersQuery.isLoading

  return (
    <div className="mx-auto max-w-6xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Customers' }]} />
      <CustomerTabs />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Customers</h1>
          <p className="mt-0.5 text-sm text-ink-500">Customer relationships, spend, and credit at a glance.</p>
        </div>
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

      {isEmptyInstall ? (
        <div className="flex flex-col items-center gap-4 rounded-card border border-dashed border-ink-200 bg-white px-6 py-16 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700">
            <Users size={26} strokeWidth={1.75} />
          </span>
          <div>
            <p className="text-base font-semibold text-ink-900">No customers have been added yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-500">
              Customers will automatically appear here after their first identified sale, or you can add one manually.
            </p>
          </div>
          <button
            onClick={() => setIsAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md bg-brand-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-blue-900"
          >
            <UserPlus size={15} /> Add your first customer
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard
              label="Total customers"
              value={kpisQuery.data ? String(kpisQuery.data.totalCustomers) : '—'}
              icon={Users}
              tone="blue"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="New (30 days)"
              value={kpisQuery.data ? String(kpisQuery.data.newCustomers30d) : '—'}
              icon={UserPlus}
              tone="neutral"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Active (30 days)"
              value={kpisQuery.data ? String(kpisQuery.data.activeCustomers30d) : '—'}
              hint="Purchased in the last 30 days"
              icon={TrendingUp}
              tone="success"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Lifetime value"
              value={kpisQuery.data ? formatCurrency(kpisQuery.data.lifetimeValueUgx, 'UGX') : '—'}
              icon={Wallet}
              tone="success"
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Outstanding credit"
              value={kpisQuery.data ? formatCurrency(kpisQuery.data.outstandingCreditUgx, 'UGX') : '—'}
              icon={CreditCard}
              tone={kpisQuery.data && kpisQuery.data.outstandingCreditUgx > 0 ? 'red' : 'neutral'}
              isLoading={kpisQuery.isLoading}
            />
            <KpiCard
              label="Loyalty members"
              value={kpisQuery.data ? String(kpisQuery.data.loyaltyMembers) : '—'}
              icon={Award}
              tone="neutral"
              isLoading={kpisQuery.isLoading}
            />
          </div>

          <div id="reports" className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <BarChart3 size={16} className="text-brand-blue-700" />
                <h2 className="text-sm font-semibold text-ink-900">Top customers by spend</h2>
              </div>
              {customersQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : topCustomers.length === 0 ? (
                <EmptyState icon={Users} title="No purchases yet" description="Top customers will appear here once sales start coming in." />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {topCustomers.map((c, i) => (
                    <li key={c.id} className="flex items-center gap-3 py-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-50 text-xs font-medium text-ink-500">
                        {i + 1}
                      </span>
                      <Link to={`/customers/${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                        {c.name}
                      </Link>
                      <span className="shrink-0 text-sm font-semibold text-ink-900">{formatCurrency(c.lifetimePurchases, 'UGX')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <CreditCard size={16} className="text-brand-red-700" />
                <h2 className="text-sm font-semibold text-ink-900">Outstanding credit</h2>
              </div>
              {customersQuery.isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : customersWithCredit.length === 0 ? (
                <EmptyState icon={CreditCard} title="Nothing outstanding" description="No customer currently owes a credit balance." />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {customersWithCredit.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 py-2.5">
                      <Link to={`/customers/${c.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                        {c.name}
                      </Link>
                      <span className="shrink-0 text-sm font-semibold text-brand-red-700">{formatCurrency(c.creditBalance, 'UGX')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      {isAddOpen && (
        <CustomerFormModal
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (input) => {
            await createCustomer.mutateAsync(input)
            showToast('Customer added.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}
    </div>
  )
}
