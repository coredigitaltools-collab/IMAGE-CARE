import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

interface SettingsPageHeaderProps {
  title: string
  description?: string
  action?: ReactNode
}

export function SettingsPageHeader({ title, description, action }: SettingsPageHeaderProps) {
  return (
    <div className="mb-6">
      <Link
        to="/settings"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-brand-blue-700"
      >
        <ArrowLeft size={15} aria-hidden="true" />
        Settings
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  )
}
