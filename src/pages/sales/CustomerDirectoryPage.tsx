import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, Pencil, Plus, Search, Users } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { CustomerTabs } from '../../components/crm/CustomerTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { CustomerFormModal } from '../../components/sales/CustomerFormModal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import { useArchiveCustomer, useCreateCustomer, useCustomers, useReactivateCustomer, useUpdateCustomer } from '../../features/sales/hooks/useSalesData'
import type { Customer } from '../../types/sales'

export function CustomerDirectoryPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const customersQuery = useCustomers()
  const createCustomer = useCreateCustomer(user.id)
  const updateCustomer = useUpdateCustomer(user.id)
  const archiveCustomer = useArchiveCustomer(user.id)
  const reactivateCustomer = useReactivateCustomer(user.id)

  const [query, setQuery] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  // "Which customers owe me money right now?" — a real follow-up-on-
  // collections filter, not decoration.
  const [creditOnly, setCreditOnly] = useState(false)
  const [tagFilter, setTagFilter] = useState('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)

  const allTags = useMemo(() => {
    const set = new Set<string>()
    for (const c of customersQuery.data ?? []) for (const t of c.tags) set.add(t)
    return [...set].sort()
  }, [customersQuery.data])

  const filtered = useMemo(() => {
    let customers = (customersQuery.data ?? []).filter((c) => (showArchived ? true : c.is_active))
    if (creditOnly) customers = customers.filter((c) => c.creditBalance > 0)
    if (tagFilter !== 'all') customers = customers.filter((c) => c.tags.includes(tagFilter))
    const q = query.trim().toLowerCase()
    if (!q) return customers
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.email.toLowerCase().includes(q))
  }, [customersQuery.data, query, showArchived, creditOnly, tagFilter])

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Customers' }]} />
      <CustomerTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Customer Directory</h1>
          <p className="mt-0.5 text-sm text-ink-500">Search and filter the Customer Master.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> Add customer
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, or email..."
            className="w-full rounded-md border border-ink-100 bg-white py-2 pl-9 pr-3 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
          />
        </div>
        {allTags.length > 0 && (
          <select
            value={tagFilter}
            onChange={(e) => setTagFilter(e.target.value)}
            className="rounded-md border border-ink-100 bg-white px-2.5 py-2 text-xs font-medium text-ink-700 shadow-card hover:border-ink-300"
          >
            <option value="all">All tags</option>
            {allTags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={creditOnly}
            onChange={(e) => setCreditOnly(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-blue-700 focus:ring-brand-blue-500"
          />
          Owes credit
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-ink-300 text-brand-blue-700 focus:ring-brand-blue-500"
          />
          Show archived
        </label>
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
            description={query || creditOnly || tagFilter !== 'all' ? 'Try different search or filter criteria.' : 'Customers are also created automatically during checkout.'}
            action={query || creditOnly || tagFilter !== 'all' ? undefined : { label: 'Add customer', onClick: () => setIsAddOpen(true) }}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {filtered.map((customer) => (
              <li key={customer.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Link to={`/customers/${customer.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                      {customer.name}
                    </Link>
                    {!customer.is_active && <Badge tone="neutral">Archived</Badge>}
                    {customer.creditBalance > 0 && <Badge tone="danger">Owes {formatCurrency(customer.creditBalance, 'UGX')}</Badge>}
                    {customer.tags.map((t) => (
                      <Badge key={t} tone="info">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-ink-500">
                    {customer.phone || 'No phone'} {customer.email ? `· ${customer.email}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <div className="text-right text-xs text-ink-500">
                    <p className="font-medium text-ink-900">{formatCurrency(customer.lifetimePurchases, 'UGX')}</p>
                    <p>{customer.loyaltyPoints} pts</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <RowActionButton icon={Pencil} label="Edit" onClick={() => setEditingCustomer(customer)} />
                    {customer.is_active ? (
                      <RowActionButton
                        icon={Archive}
                        label="Archive"
                        tone="danger"
                        onClick={async () => {
                          await archiveCustomer.mutateAsync(customer.id)
                          showToast('Customer archived.', 'success')
                        }}
                      />
                    ) : (
                      <RowActionButton
                        icon={ArchiveRestore}
                        label="Reactivate"
                        tone="success"
                        onClick={async () => {
                          await reactivateCustomer.mutateAsync(customer.id)
                          showToast('Customer reactivated.', 'success')
                        }}
                      />
                    )}
                  </div>
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

      {editingCustomer && (
        <CustomerFormModal
          initial={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSubmit={async (input) => {
            await updateCustomer.mutateAsync({ id: editingCustomer.id, input })
            showToast('Customer updated.', 'success')
            setEditingCustomer(null)
          }}
        />
      )}
    </div>
  )
}
