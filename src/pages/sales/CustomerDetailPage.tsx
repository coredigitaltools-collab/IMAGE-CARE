import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, Award, CreditCard, FileText, Quote, Receipt as ReceiptIcon, Sliders, Wallet, XCircle } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { CustomerFormModal } from '../../components/sales/CustomerFormModal'
import { CustomerHealthWidget } from '../../components/sales/CustomerHealthWidget'
import { CustomerTimeline } from '../../components/sales/CustomerTimeline'
import { RecordPaymentModal } from '../../components/credit/RecordPaymentModal'
import { WriteOffModal } from '../../components/credit/WriteOffModal'
import { CreditLimitModal } from '../../components/credit/CreditLimitModal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { getCustomerHealth } from '../../lib/customerHealth'
import {
  useAddCustomerNote,
  useArchiveCustomer,
  useCustomer,
  useCustomerNotes,
  useReactivateCustomer,
  useRefundSale,
  useSales,
  useUpdateCustomer,
} from '../../features/sales/hooks/useSalesData'
import { useApproveCreditLimit, useCreditPayments, useCreditWriteOffs, useRecordPayment, useWriteOffBalance } from '../../features/credit/hooks/useCreditData'
import { useLoyaltyTransactions } from '../../features/loyalty/hooks/useLoyaltyData'
import { PaymentExceedsBalanceError, WriteOffExceedsBalanceError } from '../../services/creditService'
import { SaleNotRefundableError } from '../../services/salesService'
import { LOYALTY_TRANSACTION_LABELS } from '../../types/loyalty'

const LOYALTY_TX_TONE = { earn: 'success', redeem: 'info', reverse: 'danger', expire: 'warning', adjust: 'neutral' } as const

const TABS = ['Overview', 'Purchases', 'Credit', 'Loyalty', 'Quotes', 'Invoices', 'Notes', 'Audit Log'] as const
type Tab = (typeof TABS)[number]

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [tab, setTab] = useState<Tab>('Overview')
  const [noteText, setNoteText] = useState('')

  const customerQuery = useCustomer(id)
  const salesQuery = useSales()
  const notesQuery = useCustomerNotes(id)
  const paymentsQuery = useCreditPayments(id)
  const loyaltyTxQuery = useLoyaltyTransactions(id)
  const refundSale = useRefundSale(user.id)
  const writeOffsQuery = useCreditWriteOffs(id)
  const updateCustomer = useUpdateCustomer(user.id)
  const archiveCustomer = useArchiveCustomer(user.id)
  const reactivateCustomer = useReactivateCustomer(user.id)
  const addNote = useAddCustomerNote(user.id)
  const recordPayment = useRecordPayment(user.id)
  const writeOffBalance = useWriteOffBalance(user.id)
  const approveLimit = useApproveCreditLimit(user.id)

  const [isEditOpen, setIsEditOpen] = useState(false)
  const [creditModal, setCreditModal] = useState<'payment' | 'writeoff' | 'limit' | null>(null)
  const [creditFormError, setCreditFormError] = useState<string | undefined>()

  const customer = customerQuery.data
  const purchases = (salesQuery.data ?? []).filter((s) => s.customerId === id && s.status === 'completed')
  const creditSales = purchases.filter((s) => s.paymentMethod === 'credit')
  const lastPurchase = purchases[0] // useSales() already sorts newest-first
  const averagePurchaseValue = purchases.length > 0 ? Math.round(purchases.reduce((sum, s) => sum + s.totalAmount, 0) / purchases.length) : 0
  const health = customer ? getCustomerHealth({ lastPurchaseAt: lastPurchase?.createdAt ?? null, creditBalance: customer.creditBalance }) : null
  const availableCredit = customer ? Math.max(0, customer.creditLimit - customer.creditBalance) : 0

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
            {customer.is_active ? (
              <Button
                variant="danger"
                onClick={async () => {
                  await archiveCustomer.mutateAsync(customer.id)
                  showToast('Customer archived.', 'success')
                }}
              >
                <Archive size={14} /> Archive
              </Button>
            ) : (
              <Button
                onClick={async () => {
                  await reactivateCustomer.mutateAsync(customer.id)
                  showToast('Customer reactivated.', 'success')
                }}
              >
                <ArchiveRestore size={14} /> Reactivate
              </Button>
            )}
          </div>
        }
      />

      {customer.tags.length > 0 && (
        <div className="mb-4 -mt-2 flex flex-wrap gap-1.5">
          {customer.tags.map((t) => (
            <Badge key={t} tone="info">
              {t}
            </Badge>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1 border-b border-ink-100">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              tab === t
                ? 'border-b-2 border-brand-blue-700 px-3 py-2 text-sm font-medium text-brand-blue-700'
                : 'border-b-2 border-transparent px-3 py-2 text-sm text-ink-500 hover:text-ink-900'
            }
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && (
        <div className="space-y-4">
          {health && <CustomerHealthWidget health={health} />}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-2">
                <Wallet size={14} className="text-success-700" />
                <p className="text-xs text-ink-500">Lifetime value</p>
              </div>
              <p className="mt-1 text-base font-semibold text-ink-900">{formatCurrency(customer.lifetimePurchases, 'UGX')}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-500">Avg. purchase</p>
              <p className="mt-1 text-base font-semibold text-ink-900">
                {purchases.length > 0 ? formatCurrency(averagePurchaseValue, 'UGX') : '—'}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-500">Last purchase</p>
              <p className="mt-1 text-base font-semibold text-ink-900">{lastPurchase ? formatRelativeTime(lastPurchase.createdAt) : 'None yet'}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-ink-500">Total orders</p>
              <p className="mt-1 text-base font-semibold text-ink-900">{purchases.length}</p>
            </Card>
          </div>
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Contact</h2>
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
              <div>
                <dt className="text-xs text-ink-500">Phone</dt>
                <dd className="text-ink-900">{customer.phone || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-500">Email</dt>
                <dd className="text-ink-900">{customer.email || '—'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-xs text-ink-500">Address</dt>
                <dd className="text-ink-900">{customer.address || '—'}</dd>
              </div>
            </dl>
            {customer.notes && (
              <div className="mt-3 border-t border-ink-100 pt-3">
                <dt className="text-xs text-ink-500">Description</dt>
                <dd className="mt-1 text-sm text-ink-700">{customer.notes}</dd>
              </div>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold text-ink-900">Activity timeline</h2>
            <CustomerTimeline sales={purchases} notes={notesQuery.data ?? []} />
          </Card>
        </div>
      )}

      {tab === 'Purchases' && (
        <Card className="p-5">
          {purchases.length === 0 ? (
            <EmptyState icon={ReceiptIcon} title="No purchases yet" description="Sales for this customer will appear here." />
          ) : (
            <ul className="divide-y divide-ink-100">
              {purchases.map((sale) => (
                <li key={sale.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-ink-900">{sale.reference}</p>
                    <p className="text-xs text-ink-500">{formatRelativeTime(sale.createdAt)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="font-medium text-ink-900">{formatCurrency(sale.totalAmount, 'UGX')}</p>
                    <Button
                      variant="secondary"
                      onClick={async () => {
                        const reason = window.prompt('Reason for this refund?')
                        if (!reason) return
                        try {
                          await refundSale.mutateAsync({ saleId: sale.id, reason })
                          showToast('Sale refunded — stock and points reversed.', 'success')
                        } catch (err) {
                          showToast(err instanceof SaleNotRefundableError ? err.message : 'Could not refund this sale.')
                        }
                      }}
                    >
                      Refund
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'Credit' && (
        <div className="space-y-4">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <p className="text-xs text-ink-500">Balance owed</p>
                  <p className={`mt-1 text-xl font-semibold ${customer.creditBalance > 0 ? 'text-brand-red-700' : 'text-ink-900'}`}>
                    {formatCurrency(customer.creditBalance, 'UGX')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Approved limit</p>
                  <p className="mt-1 text-xl font-semibold text-ink-900">{formatCurrency(customer.creditLimit, 'UGX')}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-500">Available credit</p>
                  <p className="mt-1 text-xl font-semibold text-success-700">{formatCurrency(availableCredit, 'UGX')}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setCreditFormError(undefined)
                    setCreditModal('payment')
                  }}
                  disabled={customer.creditBalance === 0}
                >
                  <Wallet size={14} /> Record payment
                </Button>
                <Button variant="secondary" onClick={() => setCreditModal('limit')}>
                  <Sliders size={14} /> Approve limit
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    setCreditFormError(undefined)
                    setCreditModal('writeoff')
                  }}
                  disabled={customer.creditBalance === 0}
                >
                  <XCircle size={14} /> Write off
                </Button>
              </div>
            </div>
            {customer.creditLimit === 0 && (
              <p className="rounded-md bg-warning-100/40 px-3 py-2 text-xs text-warning-700">
                No credit limit has been approved for this customer yet — credit sales are blocked until one is.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Credit sales</h2>
            {creditSales.length === 0 ? (
              <EmptyState icon={CreditCard} title="No credit sales" description="Sales made on credit will be listed here." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {creditSales.map((sale) => (
                  <li key={sale.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-ink-900">{sale.reference}</p>
                      <p className="text-xs text-ink-500">{formatRelativeTime(sale.createdAt)}</p>
                    </div>
                    <p className="font-medium text-brand-red-700">{formatCurrency(sale.totalAmount, 'UGX')}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Payment history</h2>
            {(paymentsQuery.data ?? []).length === 0 ? (
              <EmptyState icon={Wallet} title="No payments recorded" description="Payments received against this balance will appear here." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {(paymentsQuery.data ?? []).map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-ink-900 capitalize">{payment.method.replace('_', ' ')}</p>
                      <p className="text-xs text-ink-500">
                        {formatRelativeTime(payment.createdAt)}
                        {payment.reference ? ` · ${payment.reference}` : ''}
                      </p>
                    </div>
                    <p className="font-medium text-success-700">{formatCurrency(payment.amount, 'UGX')}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {(writeOffsQuery.data ?? []).length > 0 && (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-ink-900">Write-offs</h2>
              <ul className="divide-y divide-ink-100">
                {(writeOffsQuery.data ?? []).map((writeOff) => (
                  <li key={writeOff.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-ink-900">{formatRelativeTime(writeOff.createdAt)}</p>
                      <p className="font-medium text-brand-red-700">{formatCurrency(writeOff.amount, 'UGX')}</p>
                    </div>
                    <p className="text-xs text-ink-500">{writeOff.reason}</p>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {creditModal === 'payment' && (
        <RecordPaymentModal
          customerName={customer.name}
          outstandingBalance={customer.creditBalance}
          submitError={creditFormError}
          onClose={() => setCreditModal(null)}
          onSubmit={async (values) => {
            try {
              await recordPayment.mutateAsync({ customerId: customer.id, ...values })
              showToast('Payment recorded.', 'success')
              setCreditModal(null)
            } catch (err) {
              setCreditFormError(err instanceof PaymentExceedsBalanceError ? err.message : 'Could not record this payment.')
            }
          }}
        />
      )}

      {creditModal === 'writeoff' && (
        <WriteOffModal
          customerName={customer.name}
          outstandingBalance={customer.creditBalance}
          submitError={creditFormError}
          onClose={() => setCreditModal(null)}
          onSubmit={async (values) => {
            try {
              await writeOffBalance.mutateAsync({ customerId: customer.id, ...values })
              showToast('Balance written off.', 'success')
              setCreditModal(null)
            } catch (err) {
              setCreditFormError(err instanceof WriteOffExceedsBalanceError ? err.message : 'Could not write off this balance.')
            }
          }}
        />
      )}

      {creditModal === 'limit' && (
        <CreditLimitModal
          customerName={customer.name}
          currentLimit={customer.creditLimit}
          currentBalance={customer.creditBalance}
          onClose={() => setCreditModal(null)}
          onSubmit={async ({ newLimit }) => {
            await approveLimit.mutateAsync({ customerId: customer.id, newLimit })
            showToast('Credit limit updated.', 'success')
            setCreditModal(null)
          }}
        />
      )}

      {tab === 'Loyalty' && (
        <div className="space-y-4">
          <Card className="p-5">
            <p className="text-xs text-ink-500">Loyalty points balance</p>
            <p className="mt-1 text-2xl font-semibold text-ink-900">{customer.loyaltyPoints} pts</p>
          </Card>
          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink-900">Points history</h2>
            {(loyaltyTxQuery.data ?? []).length === 0 ? (
              <EmptyState icon={Award} title="No points activity yet" description="Earned, redeemed, and reversed points will appear here." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {(loyaltyTxQuery.data ?? []).map((t) => (
                  <li key={t.id} className="py-2.5 text-sm">
                    <div className="flex items-center justify-between">
                      <Badge tone={LOYALTY_TX_TONE[t.type]}>{LOYALTY_TRANSACTION_LABELS[t.type]}</Badge>
                      <span className={t.points >= 0 ? 'font-medium text-success-700' : 'font-medium text-brand-red-700'}>
                        {t.points >= 0 ? '+' : ''}
                        {t.points}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-ink-500">
                      {t.reason} · {formatRelativeTime(t.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'Quotes' && (
        <Card className="p-5">
          <EmptyState icon={Quote} title="No quotes yet" description="This will populate once the Quotes module is implemented." />
        </Card>
      )}

      {tab === 'Invoices' && (
        <Card className="p-5">
          <EmptyState icon={FileText} title="No invoices yet" description="This will populate once the Invoices module is implemented." />
        </Card>
      )}

      {tab === 'Notes' && (
        <Card className="p-5">
          <div className="mb-4 flex gap-2">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Log a note about this customer..."
              className="flex-1 rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
            />
            <Button
              disabled={!noteText.trim() || addNote.isPending}
              onClick={async () => {
                await addNote.mutateAsync({ customerId: customer.id, text: noteText })
                setNoteText('')
              }}
            >
              Add
            </Button>
          </div>
          {notesQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (notesQuery.data ?? []).length === 0 ? (
            <EmptyState icon={FileText} title="No notes yet" description="Notes logged about this customer will appear here." />
          ) : (
            <ul className="space-y-3">
              {(notesQuery.data ?? []).map((note) => (
                <li key={note.id} className="rounded-md bg-ink-50 p-3">
                  <p className="text-sm text-ink-900">{note.text}</p>
                  <p className="mt-1 text-xs text-ink-500">{formatRelativeTime(note.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'Audit Log' && (
        <Card className="p-5 text-sm">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <dt className="text-xs text-ink-500">Created</dt>
              <dd className="text-ink-900">{formatRelativeTime(customer.created_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Last updated</dt>
              <dd className="text-ink-900">{formatRelativeTime(customer.updated_at)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Sync status</dt>
              <dd>
                <Badge tone={customer.sync_status === 'synced' ? 'success' : 'warning'}>{customer.sync_status}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Customer ID</dt>
              <dd className="break-all font-mono text-xs text-ink-500">{customer.id}</dd>
            </div>
          </dl>
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
