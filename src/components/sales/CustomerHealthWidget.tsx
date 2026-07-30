import { AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react'
import type { CustomerHealth } from '../../lib/customerHealth'

const STYLES = {
  excellent: { icon: CheckCircle2, bg: 'bg-success-100', text: 'text-success-700' },
  needs_attention: { icon: AlertTriangle, bg: 'bg-warning-100', text: 'text-warning-700' },
  inactive: { icon: MinusCircle, bg: 'bg-ink-100', text: 'text-ink-500' },
} as const

export function CustomerHealthWidget({ health }: { health: CustomerHealth }) {
  const { icon: Icon, bg, text } = STYLES[health.status]
  return (
    <div className={`flex items-start gap-3 rounded-card border border-ink-100 p-4 ${bg}`}>
      <Icon size={20} className={`mt-0.5 shrink-0 ${text}`} />
      <div className="min-w-0">
        <p className={`text-sm font-semibold ${text}`}>{health.label}</p>
        <ul className="mt-1 space-y-0.5">
          {health.reasons.map((r) => (
            <li key={r} className="text-xs text-ink-700">
              {r}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
