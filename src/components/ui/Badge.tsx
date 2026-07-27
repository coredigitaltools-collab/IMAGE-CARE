import type { ReactNode } from 'react'

type BadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-success-100 text-success-700',
  warning: 'bg-warning-100 text-warning-700',
  danger: 'bg-brand-red-100 text-brand-red-700',
  neutral: 'bg-ink-100 text-ink-700',
  info: 'bg-brand-blue-100 text-brand-blue-700',
}

export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  )
}
