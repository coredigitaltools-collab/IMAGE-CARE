import { useEffect, useState } from 'react'
import { Wallet, Plus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { RecordCashMovementModal } from '../../components/accounting/RecordCashMovementModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/settings/FormField'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import {
  useAccountingSettings,
  useCashInHandBreakdown,
  useCashMovements,
  useRecordCashMovement,
  useSaveAccountingSettings,
} from '../../features/accounting/hooks/useAccountingData'
import { CASH_MOVEMENT_LABELS } from '../../types/accounting'

export function CashMovementsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const breakdownQuery = useCashInHandBreakdown()
  const movementsQuery = useCashMovements()
  const settingsQuery = useAccountingSettings()
  const recordMovement = useRecordCashMovement(user.id)
  const saveSettings = useSaveAccountingSettings()

  const [isRecordOpen, setIsRecordOpen] = useState(false)
  const [recordError, setRecordError] = useState<string | undefined>()
  const [openingCash, setOpeningCash] = useState(0)

  useEffect(() => {
    if (settingsQuery.data) setOpeningCash(settingsQuery.data.openingCashUgx)
  }, [settingsQuery.data])

  const b = breakdownQuery.data

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Cash Movements' }]} />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Cash in Hand</h1>
          <p className="mt-0.5 text-sm text-ink-500">Opening cash, sales, payments received, and money leaving the till.</p>
        </div>
        <Button
          onClick={() => {
            setRecordError(undefined)
            setIsRecordOpen(true)
          }}
        >
          <Plus size={15} /> Record movement
        </Button>
      </div>

      {breakdownQuery.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : b ? (
        <Card className="mb-4 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Wallet size={16} className="text-brand-blue-700" />
            <p className="text-xs text-ink-500">Cash in hand right now</p>
          </div>
          <p className="mb-4 text-2xl font-semibold text-ink-900">{formatCurrency(b.cashInHandUgx, 'UGX')}</p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink-500">Opening cash</dt>
              <dd className="text-ink-900">{formatCurrency(b.openingCashUgx, 'UGX')}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">+ Cash sales</dt>
              <dd className="text-success-700">{formatCurrency(b.cashSalesUgx, 'UGX')}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">+ Credit payments received</dt>
              <dd className="text-success-700">{formatCurrency(b.creditPaymentsReceivedUgx, 'UGX')}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">− Expenses paid</dt>
              <dd className="text-brand-red-700">{formatCurrency(b.businessExpensesPaidUgx, 'UGX')}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">− Supplier payments</dt>
              <dd className="text-brand-red-700">{formatCurrency(b.supplierPaymentsUgx, 'UGX')}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">− Bank deposits</dt>
              <dd className="text-brand-red-700">{formatCurrency(b.bankDepositsUgx, 'UGX')}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">− Owner withdrawals</dt>
              <dd className="text-brand-red-700">{formatCurrency(b.ownerWithdrawalsUgx, 'UGX')}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">± Adjustments</dt>
              <dd className={b.cashAdjustmentsUgx < 0 ? 'text-brand-red-700' : 'text-success-700'}>{formatCurrency(b.cashAdjustmentsUgx, 'UGX')}</dd>
            </div>
          </dl>
        </Card>
      ) : null}

      <Card className="mb-4 p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Opening cash</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <FormField
              id="opening-cash"
              label="Opening cash balance (UGX)"
              type="number"
              min={0}
              value={openingCash}
              onChange={(e) => setOpeningCash(Number(e.target.value))}
            />
          </div>
          <Button
            variant="secondary"
            onClick={async () => {
              await saveSettings.mutateAsync({ openingCashUgx: openingCash })
              showToast('Opening cash saved.', 'success')
            }}
          >
            Save
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Movement history</h2>
        {movementsQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (movementsQuery.data ?? []).length === 0 ? (
          <EmptyState icon={Wallet} title="No movements recorded yet" description="Bank deposits, owner withdrawals, and adjustments will appear here." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {(movementsQuery.data ?? []).map((m) => (
              <li key={m.id} className="py-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-ink-900">{CASH_MOVEMENT_LABELS[m.type]}</span>
                  <span className={m.type === 'adjustment' && m.amount < 0 ? 'font-medium text-brand-red-700' : 'font-medium text-ink-900'}>
                    {formatCurrency(m.amount, 'UGX')}
                  </span>
                </div>
                <p className="text-xs text-ink-500">
                  {m.reason} · {formatRelativeTime(m.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isRecordOpen && (
        <RecordCashMovementModal
          submitError={recordError}
          onClose={() => setIsRecordOpen(false)}
          onSubmit={async (type, amount, reason) => {
            try {
              await recordMovement.mutateAsync({ type, amount, reason })
              showToast('Cash movement recorded.', 'success')
              setIsRecordOpen(false)
            } catch (err) {
              setRecordError(err instanceof Error ? err.message : 'Could not record this movement.')
            }
          }}
        />
      )}
    </div>
  )
}
