import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { CashFlowTabs } from '../../components/cashFlow/CashFlowTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/settings/FormField'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { useAccountingSettings, useSaveAccountingSettings } from '../../features/accounting/hooks/useAccountingData'

export function CashFlowSettingsPage() {
  const { showToast } = useToast()
  const settingsQuery = useAccountingSettings()
  const saveSettings = useSaveAccountingSettings()
  const [openingCash, setOpeningCash] = useState(0)
  const [openingBank, setOpeningBank] = useState(0)

  useEffect(() => {
    if (settingsQuery.data) {
      setOpeningCash(settingsQuery.data.openingCashUgx)
      setOpeningBank(settingsQuery.data.openingBankBalanceUgx)
    }
  }, [settingsQuery.data])

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Cash Flow' }]} />
      <CashFlowTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Cash Settings</h1>
        <p className="mt-0.5 text-sm text-ink-500">The starting balances everything else is calculated from.</p>
      </div>

      {settingsQuery.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <Card className="p-5">
          <div className="grid grid-cols-2 gap-4">
            <FormField
              id="cf-opening-cash"
              label="Opening cash balance (UGX)"
              type="number"
              min={0}
              value={openingCash}
              onChange={(e) => setOpeningCash(Number(e.target.value))}
            />
            <FormField
              id="cf-opening-bank"
              label="Opening bank balance (UGX)"
              type="number"
              min={0}
              value={openingBank}
              onChange={(e) => setOpeningBank(Number(e.target.value))}
            />
          </div>
          <div className="flex justify-end pt-3">
            <Button
              onClick={async () => {
                await saveSettings.mutateAsync({ openingCashUgx: openingCash, openingBankBalanceUgx: openingBank })
                showToast('Cash settings saved.', 'success')
              }}
            >
              Save settings
            </Button>
          </div>
        </Card>
      )}

      <Card className="mt-4 p-5">
        <p className="text-sm text-ink-700">
          Bank deposits, owner withdrawals, and cash adjustments are recorded from{' '}
          <Link to="/cash-movements" className="text-brand-blue-700 hover:underline">
            Cash Movements
          </Link>
          . Every one of them flows into the totals on this module's Dashboard and Ledger automatically.
        </p>
      </Card>
    </div>
  )
}
