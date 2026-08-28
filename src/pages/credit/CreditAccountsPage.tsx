import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CreditCard, Sliders, UserPlus, Wallet, XCircle } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { CreditTabs } from '../../components/credit/CreditTabs'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { RecordPaymentModal } from '../../components/credit/RecordPaymentModal'
import { WriteOffModal } from '../../components/credit/WriteOffModal'
import { CreditLimitModal } from '../../components/credit/CreditLimitModal'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import { useApproveCreditLimit, useCreditAccounts, useRecordPayment, useWriteOffBalance } from '../../features/credit/hooks/useCreditData'
import { PaymentExceedsBalanceError, WriteOffExceedsBalanceError } from '../../services/creditService'
import type { CreditAccountRow } from '../../services/creditService'

export function CreditAccountsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const accountsQuery = useCreditAccounts()
  const recordPayment = useRecordPayment(user.id)
  const writeOffBalance = useWriteOffBalance(user.id)
  const approveLimit = useApproveCreditLimit(user.id)

  const overdueOnly = searchParams.get('overdue') === '1'
  const [modalState, setModalState] = useState<
    { mode: 'payment' | 'writeoff' | 'limit'; account: CreditAccountRow } | null
  >(null)
  const [formError, setFormError] = useState<string | undefined>()

  const accounts = useMemo(() => {
    const all = accountsQuery.data ?? []
    const sorted = [...all].sort((a, b) => b.balance - a.balance)
    return overdueOnly ? sorted.filter((a) => a.isOverdue) : sorted
  }, [accountsQuery.data, overdueOnly])

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Credit' }]} />
      <CreditTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Credit Accounts</h1>
          <p className="mt-0.5 text-sm text-ink-500">Every customer with a credit limit or a balance owed.</p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={overdueOnly}
              onChange={(e) => {
                if (e.target.checked) setSearchParams({ overdue: '1' })
                else setSearchParams({})
              }}
              className="h-4 w-4 rounded border-ink-300 text-brand-blue-700 focus:ring-brand-blue-500"
            />
            Overdue only
          </label>
          <button
            onClick={() => navigate('/customers/directory')}
            className="flex items-center gap-1.5 rounded-md bg-brand-blue-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-blue-900"
          >
            <UserPlus size={15} /> Give a customer credit
          </button>
        </div>
      </div>

      <Card className="p-5">
        {accountsQuery.isLoading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : accounts.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title={overdueOnly ? 'Nothing overdue' : 'No credit accounts yet'}
            description={
              overdueOnly
                ? 'No account is currently past its payment terms.'
                : 'Accounts appear here once a customer has a credit limit set or an outstanding balance. Open a customer’s profile and use "Set credit limit" on their Credit tab to get started.'
            }
            action={overdueOnly ? undefined : { label: 'Go to Customers', onClick: () => navigate('/customers/directory') }}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {accounts.map((account) => (
              <li key={account.customer.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link to={`/customers/${account.customer.id}`} className="text-sm font-medium text-ink-900 hover:text-brand-blue-700">
                      {account.customer.name}
                    </Link>
                    {account.isOverdue && <Badge tone="danger">{account.daysOutstanding}d overdue</Badge>}
                  </div>
                  <p className="text-xs text-ink-500">
                    Limit {formatCurrency(account.limit, 'UGX')} · Available {formatCurrency(account.available, 'UGX')}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className={`text-sm font-semibold ${account.balance > 0 ? 'text-brand-red-700' : 'text-ink-900'}`}>
                    {formatCurrency(account.balance, 'UGX')}
                  </p>
                  <div className="flex items-center gap-0.5">
                    <RowActionButton
                      icon={Wallet}
                      label="Record payment"
                      tone="success"
                      onClick={() => {
                        setFormError(undefined)
                        setModalState({ mode: 'payment', account })
                      }}
                    />
                    <RowActionButton
                      icon={Sliders}
                      label="Set credit limit"
                      onClick={() => setModalState({ mode: 'limit', account })}
                    />
                    <RowActionButton
                      icon={XCircle}
                      label="Write off"
                      tone="danger"
                      onClick={() => {
                        setFormError(undefined)
                        setModalState({ mode: 'writeoff', account })
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {modalState?.mode === 'payment' && (
        <RecordPaymentModal
          customerName={modalState.account.customer.name}
          outstandingBalance={modalState.account.balance}
          onClose={() => setModalState(null)}
          submitError={formError}
          onSubmit={async (values) => {
            try {
              await recordPayment.mutateAsync({ customerId: modalState.account.customer.id, ...values })
              showToast('Payment recorded.', 'success')
              setModalState(null)
            } catch (err) {
              setFormError(err instanceof PaymentExceedsBalanceError ? err.message : 'Could not record this payment.')
            }
          }}
        />
      )}

      {modalState?.mode === 'writeoff' && (
        <WriteOffModal
          customerName={modalState.account.customer.name}
          outstandingBalance={modalState.account.balance}
          onClose={() => setModalState(null)}
          submitError={formError}
          onSubmit={async (values) => {
            try {
              await writeOffBalance.mutateAsync({ customerId: modalState.account.customer.id, ...values })
              showToast('Balance written off.', 'success')
              setModalState(null)
            } catch (err) {
              setFormError(err instanceof WriteOffExceedsBalanceError ? err.message : 'Could not write off this balance.')
            }
          }}
        />
      )}

      {modalState?.mode === 'limit' && (
        <CreditLimitModal
          customerName={modalState.account.customer.name}
          currentLimit={modalState.account.limit}
          currentBalance={modalState.account.balance}
          onClose={() => setModalState(null)}
          onSubmit={async ({ newLimit }) => {
            await approveLimit.mutateAsync({ customerId: modalState.account.customer.id, newLimit })
            showToast('Credit limit updated.', 'success')
            setModalState(null)
          }}
        />
      )}
    </div>
  )
}
