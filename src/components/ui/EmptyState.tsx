import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-ink-50 text-ink-500">
        <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-ink-900">{title}</p>
      <p className="max-w-xs text-sm text-ink-500">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-2 rounded-md bg-brand-blue-700 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-blue-900"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
