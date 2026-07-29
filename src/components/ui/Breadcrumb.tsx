import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

interface BreadcrumbItem {
  label: string
  to?: string
}

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1.5 text-xs text-ink-500">
      {items.map((item, i) => {
        const isLast = i === items.length - 1
        return (
          <span key={item.label} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight size={12} className="text-ink-300" aria-hidden="true" />}
            {item.to && !isLast ? (
              <Link to={item.to} className="hover:text-brand-blue-700">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-ink-700' : ''} aria-current={isLast ? 'page' : undefined}>
                {item.label}
              </span>
            )}
          </span>
        )
      })}
    </nav>
  )
}
