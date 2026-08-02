import { useEffect, useState } from 'react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { SalesTargetsTabs } from '../../components/salesTargets/SalesTargetsTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { FormField } from '../../components/settings/FormField'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { useSalesTargetsSettings, useSaveSalesTargetsSettings } from '../../features/salesTargets/hooks/useSalesTargetsData'

export function TargetSettingsPage() {
  const { showToast } = useToast()
  const settingsQuery = useSalesTargetsSettings()
  const saveSettings = useSaveSalesTargetsSettings()
  const [threshold, setThreshold] = useState(80)

  useEffect(() => {
    if (settingsQuery.data) setThreshold(settingsQuery.data.notifyAtPercent)
  }, [settingsQuery.data])

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Sales Targets' }]} />
      <SalesTargetsTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Target Settings</h1>
        <p className="mt-0.5 text-sm text-ink-500">When a target shows up as an alert.</p>
      </div>

      {settingsQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Card className="p-5">
          <FormField
            id="tgs-notify"
            label="Notify when a target reaches this percent"
            type="number"
            min={1}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            hint="A current-period target that crosses this percent shows up in the bell icon notification list."
          />
          <div className="flex justify-end pt-3">
            <Button
              onClick={async () => {
                await saveSettings.mutateAsync({ notifyAtPercent: threshold })
                showToast('Sales Targets settings saved.', 'success')
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
