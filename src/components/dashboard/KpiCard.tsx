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
  blue: 'bg-brand-blue-50 text-accent',
  red: 'bg-brand-red-50 text-brand-red-700',
  success: 'bg-success-100 text-success-700',
  neutral: 'bg-surface-2 text-ink-500',
}

interface KpiCardProps {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  tone?: KpiTone
  isLoading?: boolean
  // Optional (2026-09-11, "Pending Receipt card doesn't navigate"): most
  // KPI cards are purely informational and stay exactly as before (no
  // onClick passed, nothing changes here). A card can opt in to being a
  // real navigation target - e.g. Purchasing's "Pending receipt" jumping
  // to the matching filtered list - without a new component/visual style,
  // since every KpiCard already has a hover state.
  onClick?: () => void
}

export function KpiCard({ label, value, hint, icon: Icon, tone = 'neutral', isLoading, onClick }: KpiCardProps) {
  return (
    <Card
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={`relative overflow-hidden py-4 pl-5 pr-4 transition-shadow duration-200 hover:shadow-card-hover before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-[''] ${ACCENT_CLASSES[tone]} ${onClick ? 'cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-brand-blue-500' : ''}`}
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
