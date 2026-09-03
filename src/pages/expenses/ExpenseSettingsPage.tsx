import { useEffect, useState } from 'react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { ExpenseTabs } from '../../components/expenses/ExpenseTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { NumberField } from '../../components/ui/NumberField'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toastContext'
import { useExpenseSettings, useSaveExpenseSettings } from '../../features/expenses/hooks/useExpensesData'

export function ExpenseSettingsPage() {
  const { showToast } = useToast()
  const settingsQuery = useExpenseSettings()
  const saveSettings = useSaveExpenseSettings()
  const [threshold, setThreshold] = useState(0)

  useEffect(() => {
    if (settingsQuery.data) setThreshold(settingsQuery.data.autoApproveThresholdUgx)
  }, [settingsQuery.data])

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Expenses' }]} />
      <ExpenseTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Expense Settings</h1>
        <p className="mt-0.5 text-sm text-ink-500">How expenses move through approval.</p>
      </div>

      {settingsQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Card className="p-5">
          <NumberField
            id="es-threshold"
            label="Auto-approve expenses at or below this amount (UGX)"
            min={0}
            value={threshold}
            onChange={setThreshold}
            hint="Set to 0 to require manual approval on every expense, with no exceptions."
          />
          <div className="flex justify-end pt-3">
            <Button
              onClick={async () => {
                await saveSettings.mutateAsync({ autoApproveThresholdUgx: threshold })
                showToast('Expense settings saved.', 'success')
              }}
            >
              Save settings
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
