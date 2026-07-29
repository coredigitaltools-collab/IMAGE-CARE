import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Archive, Award, CreditCard, Receipt as ReceiptIcon, Wallet } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { CustomerFormModal } from '../../components/sales/CustomerFormModal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useArchiveCustomer, useCustomer, useSales, useUpdateCustomer } from '../../features/sales/hooks/useSalesData'

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { showToast } = useToast()

  const customerQuery = useCustomer(id)
  const salesQuery = useSales()
  const updateCustomer = useUpdateCustomer(user.id)
  const archiveCustomer = useArchiveCustomer(user.id)

  const [isEditOpen, setIsEditOpen] = useState(false)

  const customer = customerQuery.data
  const purchaseHistory = (salesQuery.data ?? []).filter((s) => s.customerId === id && s.status === 'completed')

  if (customerQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="mx-auto max-w-3xl">
        <EmptyState icon={Award} title="Customer not found" description="It may have been removed." />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SettingsPageHeader
        title={customer.name}
        description={customer.phone || customer.email || 'No contact details'}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setIsEditOpen(true)}>
              Edit
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                await archiveCustomer.mutateAsync(customer.id)
                showToast('Customer archived.', 'success')
              }}
            >
              <Archive size={14} /> Archive
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Wallet size={15} className="text-success-700" />
            <p className="text-xs text-ink-500">Lifetime purchases</p>
          </div>
          <p className="mt-1 text-lg font-semibold text-ink-900">{formatCurrency(customer.lifetimePurchases, 'UGX')}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Award size={15} className="text-warning-700" />
            <p className="text-xs text-ink-500">Loyalty points</p>
          </div>
          <p className="mt-1 text-lg font-semibold text-ink-900">{customer.loyaltyPoints}</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <CreditCard size={15} className="text-brand-red-700" />
            <p className="text-xs text-ink-500">Credit balance</p>
          </div>
          <p className="mt-1 text-lg font-semibold text-ink-900">{formatCurrency(customer.creditBalance, 'UGX')}</p>
        </Card>
      </div>

      <Card className="mt-6 p-5">
        <h2 className="mb-4 text-sm font-semibold text-ink-900">Purchase history</h2>
        {purchaseHistory.length === 0 ? (
          <EmptyState icon={ReceiptIcon} title="No purchases yet" description="Sales for this customer will appear here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {purchaseHistory.map((sale) => (
              <li key={sale.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-ink-900">{sale.reference}</p>
                  <p className="text-xs text-ink-500">{formatRelativeTime(sale.createdAt)}</p>
                </div>
                <p className="font-medium text-ink-900">{formatCurrency(sale.totalAmount, 'UGX')}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {customer.notes && (
        <Card className="mt-6 p-5">
          <h2 className="mb-2 text-sm font-semibold text-ink-900">Notes</h2>
          <p className="text-sm text-ink-700">{customer.notes}</p>
        </Card>
      )}

      {isEditOpen && (
        <CustomerFormModal
          initial={customer}
          onClose={() => setIsEditOpen(false)}
          onSubmit={async (input) => {
            await updateCustomer.mutateAsync({ id: customer.id, input })
            showToast('Customer updated.', 'success')
            setIsEditOpen(false)
          }}
        />
      )}
    </div>
  )
}
