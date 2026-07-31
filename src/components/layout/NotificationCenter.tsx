import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell, AlertOctagon, PackageX, CheckCircle2, FileMinus } from 'lucide-react'
import { useLowStockReport, useOutOfStockReport } from '../../features/inventory/hooks/useInventoryData'
import { useExpenses } from '../../features/expenses/hooks/useExpensesData'

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const lowStockQuery = useLowStockReport()
  const outOfStockQuery = useOutOfStockReport()
  const expensesQuery = useExpenses()

  const lowStock = lowStockQuery.data ?? []
  const outOfStock = outOfStockQuery.data ?? []
  const pendingExpenses = (expensesQuery.data ?? []).filter((e) => e.status === 'pending_approval')
  const totalAlerts = lowStock.length + outOfStock.length + pendingExpenses.length

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget as Node)) setIsOpen(false)
        }}
        aria-label={`Notifications${totalAlerts > 0 ? ` — ${totalAlerts} unread` : ''}`}
        aria-expanded={isOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-50 hover:text-ink-900"
      >
        <Bell size={18} strokeWidth={1.75} />
        {totalAlerts > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-red-500 px-1 text-[10px] font-semibold text-white">
            {totalAlerts > 9 ? '9+' : totalAlerts}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-md border border-ink-100 bg-white shadow-card-hover">
          <div className="border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Alerts</p>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {totalAlerts === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <CheckCircle2 size={22} className="text-success-500" />
                <p className="text-xs text-ink-500">You're all caught up — nothing needs attention.</p>
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {pendingExpenses.slice(0, 4).map((e) => (
                  <li key={e.id}>
                    <Link
                      to={`/expenses/${e.id}`}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-ink-50"
                    >
                      <FileMinus size={14} className="shrink-0 text-warning-500" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink-900">{e.reference} · {e.categoryName}</p>
                        <p className="text-xs text-ink-500">Awaiting approval</p>
                      </div>
                    </Link>
                  </li>
                ))}
                {outOfStock.slice(0, 4).map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/inventory/products/${p.id}`}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-ink-50"
                    >
                      <PackageX size={14} className="shrink-0 text-brand-red-700" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink-900">{p.name}</p>
                        <p className="text-xs text-brand-red-700">Out of stock</p>
                      </div>
                    </Link>
                  </li>
                ))}
                {lowStock.slice(0, 4).map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/inventory/products/${p.id}`}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-ink-50"
                    >
                      <AlertOctagon size={14} className="shrink-0 text-warning-500" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-ink-900">{p.name}</p>
                        <p className="text-xs text-ink-500">
                          {p.currentStock} left · reorder at {p.reorderLevel}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {totalAlerts > 0 && (
            <Link
              to={lowStock.length + outOfStock.length > 0 ? '/inventory/reports' : '/expenses/register'}
              onClick={() => setIsOpen(false)}
              className="block border-t border-ink-100 px-4 py-2.5 text-center text-xs font-medium text-brand-blue-700 hover:bg-brand-blue-50"
            >
              View all
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
