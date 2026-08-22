import { useEffect, useState } from 'react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { ToggleRow } from '../../components/settings/ToggleRow'
import { FormField } from '../../components/settings/FormField'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useNotificationSettings, useSaveNotificationSettings } from '../../features/settings/hooks/useSettingsData'

export function NotificationsSettingsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const query = useNotificationSettings()
  const save = useSaveNotificationSettings(user.id)

  const [lowStockAlerts, setLowStockAlerts] = useState(true)
  const [dailySummaryEmail, setDailySummaryEmail] = useState(false)
  const [notificationEmail, setNotificationEmail] = useState('')

  useEffect(() => {
    if (!query.data) return
    setLowStockAlerts(query.data.lowStockAlerts)
    setDailySummaryEmail(query.data.dailySummaryEmail)
    setNotificationEmail(query.data.notificationEmail)
  }, [query.data])

  const handleSave = async () => {
    await save.mutateAsync({ lowStockAlerts, dailySummaryEmail, notificationEmail })
    showToast('Notification settings saved.', 'success')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader title="Notifications" description="Alerts and summary emails." />
      <Card className="p-5">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="space-y-1 divide-y divide-ink-100">
            <div className="pb-4">
              <ToggleRow
                label="Low stock alerts"
                description="Notify when items fall below their reorder level"
                checked={lowStockAlerts}
                onChange={setLowStockAlerts}
              />
            </div>
            <div className="py-4">
              <ToggleRow
                label="Daily summary email"
                description="Send a daily sales and expense summary"
                checked={dailySummaryEmail}
                onChange={setDailySummaryEmail}
              />
            </div>
            <div className="pt-4">
              <FormField
                id="notif-email"
                label="Notification email"
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
              />
            </div>
          </div>
        )}
        <div className="mt-4 flex justify-end">
          <Button onClick={handleSave} disabled={query.isLoading || save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </Card>
    </div>
  )
}
