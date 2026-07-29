import type { LucideIcon } from 'lucide-react'
import { Card } from '../ui/Card'
import { Skeleton } from '../ui/Skeleton'

type KpiTone = 'blue' | 'red' | 'neutral' | 'success'

const ACCENT_CLASSES: Record<KpiTone, string> = {
  blue: 'before:bg-brand-blue-500',
  red: 'before:bg-brand-red-500',
  success: 'before:bg-success-500',
  neutral: 'before:bg-ink-300',
}

const ICON_CLASSES: Record<KpiTone, string> = {
  blue: 'bg-brand-blue-50 text-brand-blue-700',
  red: 'bg-brand-red-50 text-brand-red-700',
  success: 'bg-success-100 text-success-700',
  neutral: 'bg-ink-50 text-ink-500',
}

interface KpiCardProps {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  tone?: KpiTone
  isLoading?: boolean
}

export function KpiCard({ label, value, hint, icon: Icon, tone = 'neutral', isLoading }: KpiCardProps) {
  return (
    <Card
      className={`relative overflow-hidden py-4 pl-5 pr-4 transition-shadow duration-200 hover:shadow-card-hover before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] ${ACCENT_CLASSES[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
          {isLoading ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : (
            <p className="mt-1 text-2xl font-semibold text-ink-900">{value}</p>
          )}
          {hint && !isLoading && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ICON_CLASSES[tone]}`}>
          <Icon size={18} strokeWidth={1.75} aria-hidden="true" />
        </div>
      </div>
    </Card>
  )
}
