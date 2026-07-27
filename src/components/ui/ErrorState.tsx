import { AlertTriangle, RotateCw } from 'lucide-react'

interface ErrorStateProps {
  title?: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({
  title = "Couldn't load this data",
  description = 'Check your connection and try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-brand-red-50 text-brand-red-700">
        <AlertTriangle size={20} strokeWidth={1.75} aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-ink-900">{title}</p>
      <p className="max-w-xs text-sm text-ink-500">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-ink-100 bg-white px-3.5 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
        >
          <RotateCw size={14} aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  )
}
