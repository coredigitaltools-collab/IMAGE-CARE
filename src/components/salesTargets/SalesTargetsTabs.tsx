import { Link, useLocation } from 'react-router-dom'

const TABS = [
  { to: '/sales-targets', label: 'Dashboard', exact: true },
  { to: '/sales-targets/list', label: 'Targets' },
  { to: '/sales-targets/leaderboard', label: 'Leaderboard' },
  { to: '/sales-targets/reports', label: 'Reports' },
  { to: '/sales-targets/settings', label: 'Settings' },
]

export function SalesTargetsTabs() {
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
