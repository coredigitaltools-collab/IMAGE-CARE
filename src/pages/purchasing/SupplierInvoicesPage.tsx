import { useState } from 'react'
import { FileText, Plus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { PurchasingTabs } from '../../components/purchasing/PurchasingTabs'
import { SupplierInvoiceModal } from '../../components/purchasing/SupplierInvoiceModal'
import { InvoicePaymentModal } from '../../components/purchasing/InvoicePaymentModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import {
  useCreateSupplierInvoice,
  usePurchaseOrders,
  useRecordInvoicePayment,
  useSupplierInvoices,
} from '../../features/purchasing/hooks/usePurchasingData'
import { PaymentExceedsInvoiceError } from '../../services/purchasingService'
import type { SupplierInvoice } from '../../types/purchasing'

const STATUS_TONE = { unpaid: 'danger', partially_paid: 'warning', paid: 'success' } as const

export function SupplierInvoicesPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const invoicesQuery = useSupplierInvoices()
  const suppliersQuery = useSuppliers()
  const ordersQuery = usePurchaseOrders()
  const createInvoice = useCreateSupplierInvoice(user.id)
  const recordPayment = useRecordInvoicePayment(user.id)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [payingInvoice, setPayingInvoice] = useState<SupplierInvoice | null>(null)
  const [payError, setPayError] = useState<string | undefined>()

  const activeSuppliers = (suppliersQuery.data ?? []).filter((s) => s.status === 'active')
  const supplierName = (id: string) => suppliersQuery.data?.find((s) => s.id === id)?.name ?? 'Unknown supplier'

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Purchasing' }]} />
      <PurchasingTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Supplier Invoices</h1>
          <p className="mt-0.5 text-sm text-ink-500">What suppliers have billed, and what's still owed.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> Record invoice
        </Button>
      </div>

      <Card className="p-5">
        {invoicesQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (invoicesQuery.data ?? []).length === 0 ? (
          <EmptyState icon={FileText} title="No supplier invoices yet" description="Invoices you record from suppliers will appear here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(invoicesQuery.data ?? []).map((inv) => {
              const owed = inv.amount - inv.amountPaid
              return (
                <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink-900">{inv.reference}</span>
                      <Badge tone={STATUS_TONE[inv.status]}>{inv.status.replace('_', ' ')}</Badge>
                    </div>
                    <p className="text-xs text-ink-500">
                      {supplierName(inv.supplierId)} · #{inv.supplierInvoiceNumber || '—'} · {formatRelativeTime(inv.createdAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold text-ink-900">{formatCurrency(inv.amount, 'UGX')}</span>
                    {owed > 0 && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setPayError(undefined)
                          setPayingInvoice(inv)
                        }}
                      >
                        Pay
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <SupplierInvoiceModal
          suppliers={activeSuppliers}
          orders={ordersQuery.data ?? []}
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (input) => {
            await createInvoice.mutateAsync(input)
            showToast('Invoice recorded.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}

      {payingInvoice && (
        <InvoicePaymentModal
          invoiceReference={payingInvoice.reference}
          amountOwed={payingInvoice.amount - payingInvoice.amountPaid}
          submitError={payError}
          onClose={() => setPayingInvoice(null)}
          onSubmit={async (amount, reference) => {
            try {
              await recordPayment.mutateAsync({ supplierInvoiceId: payingInvoice.id, amount, reference })
              showToast('Payment recorded.', 'success')
              setPayingInvoice(null)
            } catch (err) {
              setPayError(err instanceof PaymentExceedsInvoiceError ? err.message : 'Could not record this payment.')
            }
          }}
        />
      )}
    </div>
  )
}
