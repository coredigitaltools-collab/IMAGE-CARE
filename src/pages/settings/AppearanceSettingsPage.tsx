import { useEffect, useState } from 'react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useAppearanceSettings, useSaveAppearanceSettings } from '../../features/settings/hooks/useSettingsData'
import type { AppearanceSettings } from '../../types/settings'

export function AppearanceSettingsPage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const query = useAppearanceSettings()
  const save = useSaveAppearanceSettings(user.id)

  const [density, setDensity] = useState<AppearanceSettings['density']>('comfortable')
  const [dateFormat, setDateFormat] = useState<AppearanceSettings['dateFormat']>('DD/MM/YYYY')

  useEffect(() => {
    if (!query.data) return
    setDensity(query.data.density)
    setDateFormat(query.data.dateFormat)
  }, [query.data])

  const handleSave = async () => {
    await save.mutateAsync({ density, dateFormat })
    showToast('Appearance settings saved.', 'success')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader
        title="Appearance"
        description="Layout and formatting preferences. Brand colors and icon style are fixed per IMC-003."
      />
      <Card className="p-5">
        {query.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="density" className="mb-1.5 block text-sm font-medium text-ink-700">
                Layout density
              </label>
              <select
                id="density"
                value={density}
                onChange={(e) => setDensity(e.target.value as AppearanceSettings['density'])}
                className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
              >
                <option value="comfortable">Comfortable</option>
                <option value="compact">Compact</option>
              </select>
            </div>
            <div>
              <label htmlFor="dateFormat" className="mb-1.5 block text-sm font-medium text-ink-700">
                Date format
              </label>
              <select
                id="dateFormat"
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value as AppearanceSettings['dateFormat'])}
                className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
              </select>
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
