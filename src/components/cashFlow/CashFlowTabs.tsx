import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/cash-flow', label: 'Dashboard', exact: true },
  { to: '/cash-flow/ledger', label: 'Ledger' },
  { to: '/cash-flow/forecast', label: 'Forecast' },
  { to: '/cash-flow/reconciliation', label: 'Reconciliation' },
  { to: '/cash-flow/reports', label: 'Reports' },
  { to: '/cash-flow/settings', label: 'Settings' },
]

export function CashFlowTabs() {
  const location = useLocation()
  return (
    <nav className="mb-6 -mx-1 overflow-x-auto pb-1">
      <ul className="flex items-center gap-1 px-1">
        {TABS.map((tab) => {
          const isActive = tab.exact ? location.pathname === tab.to : location.pathname.startsWith(tab.to)
          return (
            <li key={tab.to} className="shrink-0">
              <Link
                to={tab.to}
                aria-current={isActive ? 'page' : undefined}
                className={
                  isActive
                    ? 'block whitespace-nowrap rounded-md bg-brand-blue-50 px-3 py-1.5 text-sm font-medium text-brand-blue-700'
                    : 'block whitespace-nowrap rounded-md px-3 py-1.5 text-sm text-ink-500 hover:bg-ink-50 hover:text-ink-900'
                }
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
