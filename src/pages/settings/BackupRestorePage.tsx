import { useRef, useState } from 'react'
import { DatabaseBackup, Upload, AlertTriangle } from 'lucide-react'
import { SettingsPageHeader } from '../../components/settings/SettingsPageHeader'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useBackupHistory, useCreateBackup, useRestoreBackup } from '../../features/settings/hooks/useSettingsData'
import { InvalidBackupFileError } from '../../services/backupSyncService'
import { formatRelativeTime } from '../../lib/format'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function BackupRestorePage() {
  const { user } = useAuth()
  const { showToast } = useToast()
  const historyQuery = useBackupHistory()
  const createBackup = useCreateBackup(user.id)
  const restoreBackup = useRestoreBackup()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const handleCreateBackup = async () => {
    await createBackup.mutateAsync()
    showToast('Backup downloaded.', 'success')
  }

  const handleFileSelected = (file: File) => {
    setPendingFile(file)
  }

  const confirmRestore = async () => {
    if (!pendingFile) return
    try {
      const text = await pendingFile.text()
      await restoreBackup.mutateAsync(text)
      showToast('Backup restored.', 'success')
    } catch (err) {
      showToast(err instanceof InvalidBackupFileError ? err.message : 'Could not restore this backup.')
    } finally {
      setPendingFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsPageHeader title="Backup & Restore" description="Export a full local backup, or restore from one." />

      <div className="flex flex-col gap-6">
        <Card className="p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-brand-blue-700">
              <DatabaseBackup size={20} strokeWidth={1.75} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-ink-900">Create a backup</p>
              <p className="mt-0.5 text-xs text-ink-500">
                Downloads a JSON file with your business profile, staff, branches, and all settings.
              </p>
              <Button className="mt-3" onClick={handleCreateBackup} disabled={createBackup.isPending}>
                {createBackup.isPending ? 'Preparing…' : 'Download backup'}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-red-50 text-brand-red-700">
              <Upload size={20} strokeWidth={1.75} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-medium text-ink-900">Restore from a backup</p>
              <p className="mt-0.5 text-xs text-ink-500">
                This replaces your current business profile, staff, branches, and settings with the backup's contents.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
              />
              <Button
                className="mt-3"
                variant="secondary"
                onClick={() => fileInputRef.current?.click()}
                disabled={restoreBackup.isPending}
              >
                Choose backup file…
              </Button>

              {pendingFile && (
                <div className="mt-3 rounded-md border border-brand-red-100 bg-brand-red-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-brand-red-700" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-brand-red-700">
                        Restore "{pendingFile.name}"? This overwrites current data and can't be undone.
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button variant="danger" onClick={confirmRestore} disabled={restoreBackup.isPending}>
                          {restoreBackup.isPending ? 'Restoring…' : 'Yes, restore'}
                        </Button>
                        <Button variant="secondary" onClick={() => setPendingFile(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-sm font-semibold text-ink-900">Backup history</h2>
          {historyQuery.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (historyQuery.data ?? []).length === 0 ? (
            <EmptyState
              icon={DatabaseBackup}
              title="No backups yet"
              description="Backups you create on this device will be listed here."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {(historyQuery.data ?? []).map((record) => (
                <li key={record.id} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="text-ink-900">{formatRelativeTime(record.createdAt)}</span>
                  <span className="text-ink-500">{formatSize(record.sizeBytes)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
