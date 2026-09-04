import { Link, useLocation } from 'react-router-dom'

// Bug fix (2026-09-04): "Reports" (aging analysis) was removed at the
// user's request - it was a stub that always showed "Nothing
// outstanding" regardless of real data (useAgingReport hard-coded an
// empty result; the feature was never actually built), which was
// confusing next to Dashboard/Accounts, which show real balances. Not
// hiding a working feature - just removing a placeholder that had
// nothing behind it.
const TABS = [
  { to: '/credit', label: 'Dashboard', exact: true },
  { to: '/credit/accounts', label: 'Accounts' },
]

export function CreditTabs() {
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
