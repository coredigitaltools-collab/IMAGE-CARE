import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, Building2, Plus } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { BankReconciliationTabs } from '../../components/bankReconciliation/BankReconciliationTabs'
import { BankAccountFormModal } from '../../components/bankReconciliation/BankAccountFormModal'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { formatCurrency } from '../../lib/format'
import {
  useArchiveBankAccount,
  useBankAccounts,
  useCreateBankAccount,
  useReconciledBalance,
} from '../../features/bankReconciliation/hooks/useBankReconciliationData'
import { AccountInUseError } from '../../services/bankReconciliationService'
import type { BankAccount } from '../../types/bankReconciliation'

function AccountBalance({ accountId }: { accountId: string }) {
  const balanceQuery = useReconciledBalance(accountId)
  return <span className="font-semibold text-ink-900">{balanceQuery.data !== undefined ? formatCurrency(balanceQuery.data, 'UGX') : '...'}</span>
}

export function BankAccountsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const accountsQuery = useBankAccounts()
  const createAccount = useCreateBankAccount(user.id)
  const archiveAccount = useArchiveBankAccount(user.id)
  const [isAddOpen, setIsAddOpen] = useState(false)

  const activeAccounts = (accountsQuery.data ?? []).filter((a: BankAccount) => a.is_active)

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Bank Reconciliation' }]} />
      <BankReconciliationTabs />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Bank Accounts</h1>
          <p className="mt-0.5 text-sm text-ink-500">Every bank account the business reconciles against.</p>
        </div>
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus size={15} /> New account
        </Button>
      </div>

      <Card className="p-5">
        {accountsQuery.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : activeAccounts.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="No bank accounts yet"
            description="Add the accounts the business actually banks with."
            action={{ label: '+ New account', onClick: () => setIsAddOpen(true) }}
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {activeAccounts.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <Link to={`/bank-reconciliation/reconcile?account=${a.id}`} className="font-medium text-ink-900 hover:text-brand-blue-700">
                    {a.name}
                  </Link>
                  <p className="text-xs text-ink-500">{a.accountNumber}</p>
                </div>
                <div className="flex items-center gap-3">
                  <AccountBalance accountId={a.id} />
                  <RowActionButton
                    icon={Archive}
                    label="Archive"
                    tone="danger"
                    onClick={async () => {
                      try {
                        await archiveAccount.mutateAsync(a.id)
                        showToast('Account archived.', 'success')
                      } catch (err) {
                        showToast(err instanceof AccountInUseError ? err.message : 'Could not archive this account.')
                      }
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAddOpen && (
        <BankAccountFormModal
          onClose={() => setIsAddOpen(false)}
          onSubmit={async (input) => {
            await createAccount.mutateAsync(input)
            showToast('Bank account created.', 'success')
            setIsAddOpen(false)
          }}
        />
      )}
    </div>
  )
}
