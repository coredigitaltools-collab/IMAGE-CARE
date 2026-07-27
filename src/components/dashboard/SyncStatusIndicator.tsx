import { CloudOff, RefreshCw, CloudAlert, CloudCheck } from 'lucide-react'
import { formatRelativeTime } from '../../lib/format'
import type { SyncStatus } from '../../types/domain'

const CONFIG = {
  synced: { icon: CloudCheck, dot: 'bg-success-500', text: 'text-success-700', label: 'Synced' },
  syncing: { icon: RefreshCw, dot: 'bg-brand-blue-500', text: 'text-brand-blue-700', label: 'Syncing' },
  offline: { icon: CloudOff, dot: 'bg-ink-300', text: 'text-ink-500', label: 'Offline' },
  error: { icon: CloudAlert, dot: 'bg-brand-red-500', text: 'text-brand-red-700', label: 'Sync issue' },
} as const

export function SyncStatusIndicator({ status }: { status?: SyncStatus }) {
  const state = status?.state ?? 'offline'
  const { icon: Icon, dot, text, label } = CONFIG[state]

  return (
    <div
      className="flex items-center gap-2 rounded-full border border-ink-100 bg-white py-1.5 pl-2.5 pr-3 text-xs shadow-card"
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {state === 'syncing' && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${dot} opacity-60`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dot}`} />
      </span>
      <Icon size={13} className={text} strokeWidth={2} aria-hidden="true" />
      <span className={`font-medium ${text}`}>{label}</span>
      <span className="text-ink-300">·</span>
      <span className="text-ink-500">{formatRelativeTime(status?.lastSyncedAt ?? null)}</span>
    </div>
  )
}
