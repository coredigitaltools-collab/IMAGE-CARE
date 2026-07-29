import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Search, Users } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { CustomerFormModal } from '../../components/sales/CustomerFormModal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import { useCreateCustomer, useCustomers } from '../../features/sales/hooks/useSalesData'

export function CustomersListPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const customersQuery = useCustomers()
  const createCustomer = useCreateCustomer(user.id)

  const [query, setQuery] = useState('')
  const [isAddOpen, setIsAddOpen] = useState(false)

  const filtered = useMemo(() => {
    const customers = (customersQuery.data ?? []).filter((c) => c.is_active)
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email.toLowerCase().includes(q))
  }, [customersQuery.data, query])

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Clients' }]} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Clients</h1>
          <p className="mt-0.5 text-sm text-ink-500">The Customer Master — reused across Sales, Credit, and Loyalty.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> Add customer
        </Button>
      </div>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, or email..."
          className="w-full rounded-md border border-ink-100 bg-white py-2 pl-9 pr-3 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
        />
      </div>

      <Card className="p-5">
        {customersQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No customers found"
            description={query ? 'Try a different search term.' : 'Customers are also created automatically during checkout.'}
            action={query ? undefined : { label: 'Add customer', onClick: () => setIsAddOpen(true) }}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {filtered.map((customer) => (
              <li key={customer.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <Link to={`/customers/${customer.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                    {customer.name}
                  </Link>
                  <p className="text-xs text-ink-500">
                    {customer.phone || 'No phone'} {customer.email ? `· ${customer.email}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-ink-500">
                  <p className="font-medium text-ink-900">{formatCurrency(customer.lifetimePurchases, 'UGX')}</p>
                  <p>{customer.loyaltyPoints} pts</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

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
