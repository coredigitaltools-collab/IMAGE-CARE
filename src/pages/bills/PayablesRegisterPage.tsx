import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileText, Plus, Wallet, XCircle } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BillsTabs } from '../../components/bills/BillsTabs'
import { InvoicePaymentModal } from '../../components/purchasing/InvoicePaymentModal'
import { SupplierInvoiceModal } from '../../components/purchasing/SupplierInvoiceModal'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import { useBills, useCancelBill, useRecordBillPayment } from '../../features/bills/hooks/useBillsData'
import { useCreateSupplierInvoice, usePurchaseOrders } from '../../features/purchasing/hooks/usePurchasingData'
import { PaymentExceedsInvoiceError } from '../../services/purchasingService'
import type { SupplierInvoice } from '../../types/purchasing'

const STATUS_TONE = { unpaid: 'warning', partially_paid: 'warning', paid: 'success', cancelled: 'neutral', closed: 'info' } as const
const STATUS_LABELS = { unpaid: 'Unpaid', partially_paid: 'Partially Paid', paid: 'Paid', cancelled: 'Cancelled', closed: 'Closed' } as const

export function PayablesRegisterPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const billsQuery = useBills()
  const suppliersQuery = useSuppliers()
  const ordersQuery = usePurchaseOrders()
  const recordPayment = useRecordBillPayment(user.id)
  const cancelBill = useCancelBill()
  const createInvoice = useCreateSupplierInvoice(user.id)

  const overdueOnly = searchParams.get('overdue') === '1'
  const [payingBill, setPayingBill] = useState<SupplierInvoice | null>(null)
  const [payError, setPayError] = useState<string | undefined>()
  // 2026-08-31: "Record a bill" used to fully navigate away to Purchasing's
  // Supplier Invoices page to reach this same modal - the module's own
  // namesake action lived entirely outside it. It now opens right here.
  const [isRecordOpen, setIsRecordOpen] = useState(false)

  const supplierName = (id: string) => suppliersQuery.data?.find((s) => s.id === id)?.name ?? 'Unknown supplier'

  const bills = useMemo(() => {
    const all = billsQuery.data ?? []
    const sorted = [...all].sort((a, b) => b.amount - b.amountPaid - (a.amount - a.amountPaid))
    if (!overdueOnly) return sorted
    return sorted.filter((b) => (b.status === 'unpaid' || b.status === 'partially_paid') && b.dueDate && new Date(b.dueDate).getTime() < Date.now())
  }, [billsQuery.data, overdueOnly])

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Bills & Payables' }]} />
      <BillsTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Payables Register</h1>
          <p className="mt-0.5 text-sm text-ink-500">Every bill recorded from a supplier invoice.</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => (e.target.checked ? setSearchParams({ overdue: '1' }) : setSearchParams({}))}
              className="h-4 w-4 rounded border-ink-300 text-brand-blue-700 focus:ring-brand-blue-500"
            />
            Overdue only
          </label>
          <button
            onClick={() => setIsRecordOpen(true)}
            className="flex items-center gap-1.5 rounded-md bg-brand-blue-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-blue-900"
          >
            <Plus size={15} /> Record a bill
          </button>
        </div>
      </div>

      <Card className="p-5">
        {billsQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : bills.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={overdueOnly ? 'Nothing overdue' : 'No bills yet'}
            description={overdueOnly ? 'No bill is currently past its due date.' : 'Record a supplier invoice to see it here as a bill you owe.'}
            action={overdueOnly ? undefined : { label: 'Record a bill', onClick: () => setIsRecordOpen(true) }}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {bills.map((bill) => {
              const owed = bill.amount - bill.amountPaid
              return (
                <li key={bill.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link to={`/bills/${bill.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                        {bill.reference}
                      </Link>
                      <Badge tone={STATUS_TONE[bill.status]}>{STATUS_LABELS[bill.status]}</Badge>
                    </div>
                    <p className="text-xs text-ink-500">
                      {supplierName(bill.supplierId)} · {formatRelativeTime(bill.createdAt)}
                      {bill.dueDate ? ` · due ${new Date(bill.dueDate).toLocaleDateString('en-UG')}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className={`text-sm font-semibold ${owed > 0 ? 'text-brand-red-700' : 'text-ink-900'}`}>{formatCurrency(bill.amount, 'UGX')}</p>
                    {(bill.status === 'unpaid' || bill.status === 'partially_paid') && (
                      <div className="flex items-center gap-0.5">
                        <RowActionButton
                          icon={Wallet}
                          label="Record payment"
                          tone="success"
                          onClick={() => {
                            setPayError(undefined)
                            setPayingBill(bill)
                          }}
                        />
                        <RowActionButton
                          icon={XCircle}
                          label="Cancel bill"
                          tone="danger"
                          onClick={async () => {
                            const reason = window.prompt('Reason for cancelling this bill?')
                            if (!reason) return
                            await cancelBill.mutateAsync({ id: bill.id, reason })
                            showToast('Bill cancelled.', 'success')
                          }}
                        />
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </Card>

      {payingBill && (
        <InvoicePaymentModal
          invoiceReference={payingBill.reference}
          amountOwed={payingBill.amount - payingBill.amountPaid}
          submitError={payError}
          onClose={() => setPayingBill(null)}
          onSubmit={async (amount, reference) => {
            try {
              await recordPayment.mutateAsync({ billId: payingBill.id, amount, reference })
              showToast('Payment recorded.', 'success')
              setPayingBill(null)
            } catch (err) {
              setPayError(err instanceof PaymentExceedsInvoiceError ? err.message : 'Could not record this payment.')
            }
          }}
        />
      )}

      {isRecordOpen && (
        <SupplierInvoiceModal
          suppliers={(suppliersQuery.data ?? []).filter((s) => s.status === 'active')}
          orders={ordersQuery.data ?? []}
          userId={user.id}
          onClose={() => setIsRecordOpen(false)}
          onSubmit={async (input) => {
            await createInvoice.mutateAsync(input)
            showToast('Bill recorded.', 'success')
            setIsRecordOpen(false)
          }}
        />
      )}
    </div>
  )
}
