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
    <Link
      to={to}
      className="group block h-full rounded-card focus-visible:outline-none"
      aria-label={`${title}, ${description}`}
    >
      <Card
        className="flex h-full items-start gap-4 p-4 transition-all duration-[250ms] ease-out hover:-translate-y-0.5 hover:border-brand-blue-500 hover:shadow-card-hover group-focus-visible:-translate-y-0.5 group-focus-visible:border-brand-blue-500 group-focus-visible:shadow-card-hover group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-brand-blue-500 group-focus-visible:outline-offset-2"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-blue-50 text-brand-blue-700 transition-all duration-[250ms] ease-out group-hover:scale-105 group-hover:bg-brand-blue-700 group-hover:text-white">
          <Icon size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-sm font-semibold text-ink-900">{title}</p>
          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-ink-500">{description}</p>
        </div>
        <ChevronRight
          size={16}
          className="mt-1 shrink-0 text-ink-300 transition-all duration-[250ms] ease-out group-hover:translate-x-1 group-hover:text-brand-blue-700"
          aria-hidden="true"
        />
      </Card>
    </Link>
  )
}
