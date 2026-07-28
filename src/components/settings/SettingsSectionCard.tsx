import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card } from '../ui/Card'
import { ChevronRight } from 'lucide-react'

interface SettingsSectionCardProps {
  to: string
  icon: LucideIcon
  title: string
  description: string
}

export function SettingsSectionCard({ to, icon: Icon, title, description }: SettingsSectionCardProps) {
  return (
    <Link to={to} className="block">
      <Card className="group flex items-center gap-4 p-4 transition-all hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-brand-blue-700 transition-colors group-hover:bg-brand-blue-700 group-hover:text-white">
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">{title}</p>
          <p className="truncate text-xs text-ink-500">{description}</p>
        </div>
        <ChevronRight size={16} className="shrink-0 text-ink-300" aria-hidden="true" />
      </Card>
    </Link>
  )
}
