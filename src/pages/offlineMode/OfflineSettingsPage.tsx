import { useEffect, useState } from 'react'
import { Lock, ShieldCheck } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { OfflineModeTabs } from '../../components/offlineMode/OfflineModeTabs'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { useToast } from '../../components/ui/Toast'
import {
  useEncryptionStatus,
  useEncryptRemainingData,
  useOfflineSettings,
  useSaveOfflineSettings,
} from '../../features/offlineMode/hooks/useOfflineModeData'

export function OfflineSettingsPage() {
  const { showToast } = useToast()
  const settingsQuery = useOfflineSettings()
  const saveSettings = useSaveOfflineSettings()
  const encryptionQuery = useEncryptionStatus()
  const encryptRemaining = useEncryptRemainingData()

  const [autoSyncEnabled, setAutoSyncEnabled] = useState(true)
  const [intervalMinutes, setIntervalMinutes] = useState(5)

  useEffect(() => {
    if (settingsQuery.data) {
      setAutoSyncEnabled(settingsQuery.data.autoSyncEnabled)
      setIntervalMinutes(settingsQuery.data.autoSyncIntervalMinutes)
    }
  }, [settingsQuery.data])

  return (
    <div className="mx-auto max-w-2xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Offline Mode' }]} />
      <OfflineModeTabs />

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Offline Settings</h1>
        <p className="mt-0.5 text-sm text-ink-500">How and when this device syncs, and how data is protected while it's stored locally.</p>
      </div>

      {settingsQuery.isLoading ? (
        <Skeleton className="mb-4 h-40 w-full" />
      ) : (
        <Card className="mb-4 p-5">
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Automatic sync</h2>
          <label className="mb-4 flex items-center gap-2.5 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={autoSyncEnabled}
              onChange={(e) => setAutoSyncEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-ink-300 text-brand-blue-700 focus:ring-brand-blue-500"
            />
            Sync automatically in the background
          </label>
          <div className="mb-4 max-w-xs">
            <label htmlFor="sync-interval" className="mb-1.5 block text-sm font-medium text-ink-700">
              Check every (minutes)
            </label>
            <input
              id="sync-interval"
              type="number"
              min={1}
              value={intervalMinutes}
              onChange={(e) => setIntervalMinutes(Number(e.target.value))}
              disabled={!autoSyncEnabled}
              className="w-full rounded-md border border-ink-100 bg-white px-3 py-2 text-sm text-ink-900 shadow-card focus:border-brand-blue-500 disabled:opacity-50"
            />
          </div>
          <Button
            onClick={async () => {
              await saveSettings.mutateAsync({ autoSyncEnabled, autoSyncIntervalMinutes: intervalMinutes })
              showToast('Offline settings saved.', 'success')
            }}
          >
            Save settings
          </Button>
        </Card>
      )}

      {encryptionQuery.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2">
            {encryptionQuery.data?.isActive ? <ShieldCheck size={16} className="text-success-600" /> : <Lock size={16} className="text-ink-400" />}
            <h2 className="text-sm font-semibold text-ink-900">Local data encryption</h2>
          </div>
          <p className="mb-3 text-sm text-ink-700">
            {encryptionQuery.data?.isActive
              ? 'Data stored on this device is encrypted with AES-256-GCM.'
              : 'Encryption has not been set up on this device yet.'}
          </p>
          <p className="mb-4 text-xs text-ink-500">
            This protects locally stored data against casual inspection on this device, not against someone with full access to this same browser
            profile, no purely client-side scheme without a server-held key can promise more than that.
          </p>
          {(encryptionQuery.data?.legacyPlaintextCount ?? 0) > 0 && (
            <>
              <p className="mb-3 text-sm text-warning-700">
                {encryptionQuery.data?.legacyPlaintextCount} record{encryptionQuery.data?.legacyPlaintextCount === 1 ? '' : 's'} stored before
                encryption existed and will be encrypted automatically the next time each is updated, or immediately below.
              </p>
              <Button
                variant="secondary"
                onClick={async () => {
                  const count = await encryptRemaining.mutateAsync()
                  showToast(`Encrypted ${count} record${count === 1 ? '' : 's'}.`, 'success')
                }}
              >
                Encrypt existing data now
              </Button>
            </>
          )}
        </Card>
      )}
    </div>
  )
}
