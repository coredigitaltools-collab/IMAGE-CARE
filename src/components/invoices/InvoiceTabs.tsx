import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/invoices', label: 'Dashboard', exact: true },
  { to: '/invoices/all', label: 'Invoices' },
  { to: '/invoices/reports', label: 'Reports' },
  { to: '/invoices/settings', label: 'Settings' },
]

export function InvoiceTabs() {
  const location = useLocation()
  return (
    <nav className="mb-6 flex items-center gap-1">
      {TABS.map((tab) => {
        const isActive = tab.exact ? location.pathname === tab.to : location.pathname.startsWith(tab.to)
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-current={isActive ? 'page' : undefined}
            className={
              isActive
                ? 'rounded-md bg-brand-blue-50 px-3 py-1.5 text-sm font-medium text-brand-blue-700'
                : 'rounded-md px-3 py-1.5 text-sm text-ink-500 hover:bg-ink-50 hover:text-ink-900'
            }
          >
            {tab.label}
          </Link>
        )
      })}
    </nav>
  )
}
