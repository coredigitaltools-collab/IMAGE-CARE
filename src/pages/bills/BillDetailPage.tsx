import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileText, Lock, Wallet, XCircle } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { InvoicePaymentModal } from '../../components/purchasing/InvoicePaymentModal'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { useSuppliers } from '../../features/inventory/hooks/useInventoryData'
import { usePurchaseOrders } from '../../features/purchasing/hooks/usePurchasingData'
import { useBill, useBillPayments, useCancelBill, useCloseBill, useRecordBillPayment } from '../../features/bills/hooks/useBillsData'
import { InvalidBillTransitionError } from '../../services/billsService'
import { PaymentExceedsInvoiceError } from '../../services/purchasingService'

const STATUS_TONE = { unpaid: 'warning', partially_paid: 'warning', paid: 'success', cancelled: 'neutral', closed: 'info' } as const
const STATUS_LABELS = { unpaid: 'Unpaid', partially_paid: 'Partially Paid', paid: 'Paid', cancelled: 'Cancelled', closed: 'Closed' } as const

export function BillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { showToast } = useToast()

  const billQuery = useBill(id)
  const paymentsQuery = useBillPayments(id)
  const suppliersQuery = useSuppliers()
  const ordersQuery = usePurchaseOrders()
  const recordPayment = useRecordBillPayment(user.id)
  const cancelBill = useCancelBill()
  const closeBill = useCloseBill()

  const [isPayOpen, setIsPayOpen] = useState(false)
  const [actionError, setActionError] = useState<string | undefined>()

  const bill = billQuery.data

  if (billQuery.isLoading) {
    return (
      <div className="mx-auto max-w-2xl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    )
  }

  if (!bill) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState icon={FileText} title="Bill not found" description="It may have been removed." />
      </div>
    )
  }

  const supplier = suppliersQuery.data?.find((s) => s.id === bill.supplierId)
  const order = ordersQuery.data?.find((o) => o.id === bill.purchaseOrderId)
  const owed = bill.amount - bill.amountPaid
  const canPay = bill.status === 'unpaid' || bill.status === 'partially_paid'

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader
        title={bill.reference}
        description={`${supplier?.name ?? 'Unknown supplier'}${bill.supplierInvoiceNumber ? ` · #${bill.supplierInvoiceNumber}` : ''}${order ? ` · from ${order.reference}` : ''}`}
        action={
          <div className="flex flex-wrap gap-2">
            {canPay && (
              <Button
                onClick={() => {
                  setActionError(undefined)
                  setIsPayOpen(true)
                }}
              >
                <Wallet size={14} /> Record payment
              </Button>
            )}
            {bill.status === 'paid' && (
              <Button
                onClick={async () => {
                  try {
                    await closeBill.mutateAsync(bill.id)
                    showToast('Bill closed.', 'success')
                  } catch (err) {
                    setActionError(err instanceof InvalidBillTransitionError ? err.message : 'Could not close this bill.')
                  }
                }}
              >
                <Lock size={14} /> Close bill
              </Button>
            )}
            {canPay && (
              <Button
                variant="danger"
                onClick={async () => {
                  const reason = window.prompt('Reason for cancelling this bill?')
                  if (!reason) return
                  try {
                    await cancelBill.mutateAsync({ id: bill.id, reason })
                    showToast('Bill cancelled.', 'success')
                  } catch (err) {
                    setActionError(err instanceof InvalidBillTransitionError ? err.message : 'Could not cancel this bill.')
                  }
                }}
              >
                <XCircle size={14} /> Cancel
              </Button>
            )}
          </div>
        }
      />

      {actionError && <p className="mb-4 text-sm text-brand-red-700">{actionError}</p>}

      <div className="mb-4 flex items-center gap-2">
        <Badge tone={STATUS_TONE[bill.status]}>{STATUS_LABELS[bill.status]}</Badge>
        {bill.dueDate && <span className="text-xs text-ink-500">Due {new Date(bill.dueDate).toLocaleDateString('en-UG')}</span>}
        {bill.closedAt && <span className="text-xs text-ink-500">Closed {formatRelativeTime(bill.closedAt)}</span>}
      </div>
      {bill.cancelReason && <p className="mb-4 text-xs text-brand-red-700">Cancelled: {bill.cancelReason}</p>}

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <p className="text-xs text-ink-500">Bill amount</p>
          <p className="mt-1 text-lg font-semibold text-ink-900">{formatCurrency(bill.amount, 'UGX')}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">Paid so far</p>
          <p className="mt-1 text-lg font-semibold text-success-700">{formatCurrency(bill.amountPaid, 'UGX')}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-ink-500">Still owed</p>
          <p className={`mt-1 text-lg font-semibold ${owed > 0 ? 'text-brand-red-700' : 'text-ink-900'}`}>{formatCurrency(owed, 'UGX')}</p>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Payment history</h2>
        {(paymentsQuery.data ?? []).length === 0 ? (
          <EmptyState icon={Wallet} title="No payments yet" description="Payments recorded against this bill will appear here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(paymentsQuery.data ?? []).map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <p className="font-medium text-ink-900">{formatRelativeTime(p.createdAt)}</p>
                  {p.reference && <p className="text-xs text-ink-500">{p.reference}</p>}
                </div>
                <span className="font-medium text-success-700">{formatCurrency(p.amount, 'UGX')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isPayOpen && (
        <InvoicePaymentModal
          invoiceReference={bill.reference}
          amountOwed={owed}
          submitError={actionError}
          onClose={() => setIsPayOpen(false)}
          onSubmit={async (amount, reference) => {
            try {
              await recordPayment.mutateAsync({ billId: bill.id, amount, reference })
              showToast('Payment recorded.', 'success')
              setIsPayOpen(false)
            } catch (err) {
              setActionError(err instanceof PaymentExceedsInvoiceError ? err.message : 'Could not record this payment.')
            }
          }}
        />
      )}
    </div>
  )
}
