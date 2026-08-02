import { Link, useLocation, useSearchParams } from 'react-router-dom'

const TABS = [
  { to: '/annual-summary', label: 'Dashboard', exact: true },
  { to: '/annual-summary/sales', label: 'Sales' },
  { to: '/annual-summary/cash-flow', label: 'Cash Flow' },
  { to: '/annual-summary/branches', label: 'Branches' },
  { to: '/annual-summary/year-over-year', label: 'Year over Year' },
  { to: '/annual-summary/report', label: 'Report' },
]

export function AnnualSummaryTabs() {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const year = searchParams.get('year')
  const suffix = year ? `?year=${year}` : ''

  return (
    <nav className="mb-6 -mx-1 overflow-x-auto pb-1 print:hidden">
      <ul className="flex items-center gap-1 px-1">
        {TABS.map((tab) => {
          const isActive = tab.exact ? location.pathname === tab.to : location.pathname.startsWith(tab.to)
          return (
            <li key={tab.to} className="shrink-0">
              <Link
                to={`${tab.to}${suffix}`}
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
