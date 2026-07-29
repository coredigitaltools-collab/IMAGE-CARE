import { useMemo, useState } from 'react'
import { Award, Phone, Search, User, UserPlus, Wallet, X } from 'lucide-react'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import type { Customer } from '../../types/sales'

interface CustomerSelectorProps {
  customers: Customer[]
  selectedCustomer: Customer | null
  lastPurchaseAt: string | null
  onSelect: (customer: Customer | null) => void
  onAddNew: () => void
}

export function CustomerSelector({ customers, selectedCustomer, lastPurchaseAt, onSelect, onAddNew }: CustomerSelectorProps) {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return customers.slice(0, 6)
    return customers.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q)).slice(0, 6)
  }, [customers, query])

  if (selectedCustomer) {
    return (
      <div className="rounded-md border border-brand-blue-100 bg-brand-blue-50 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-brand-blue-700">
              <User size={14} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">{selectedCustomer.name}</p>
              {selectedCustomer.phone && (
                <p className="flex items-center gap-1 text-xs text-ink-500">
                  <Phone size={10} /> {selectedCustomer.phone}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => onSelect(null)}
            aria-label="Remove customer, sell as walk-in"
            className="shrink-0 rounded-full p-1 text-ink-500 hover:bg-white hover:text-ink-900"
          >
            <X size={14} />
          </button>
        </div>

        <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-brand-blue-100 pt-2.5 text-center">
          <div>
            <p className="flex items-center justify-center gap-1 text-[10px] text-ink-500">
              <Award size={10} /> Loyalty
            </p>
            <p className="text-xs font-semibold text-ink-900">{selectedCustomer.loyaltyPoints} pts</p>
          </div>
          <div>
            <p className="flex items-center justify-center gap-1 text-[10px] text-ink-500">
              <Wallet size={10} /> Credit owed
            </p>
            <p className={`text-xs font-semibold ${selectedCustomer.creditBalance > 0 ? 'text-brand-red-700' : 'text-ink-900'}`}>
              {formatCurrency(selectedCustomer.creditBalance, 'UGX')}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-ink-500">Last purchase</p>
            <p className="text-xs font-semibold text-ink-900">{lastPurchaseAt ? formatRelativeTime(lastPurchaseAt) : 'None yet'}</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
            placeholder="Walk-in Customer — search to select"
            className="w-full rounded-md border border-ink-100 bg-white py-2 pl-8 pr-2 text-sm text-ink-900 shadow-card placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-blue-500"
          />
        </div>
        <button
          onClick={onAddNew}
          className="flex shrink-0 items-center gap-1 rounded-md border border-ink-100 bg-white px-2.5 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50"
        >
          <UserPlus size={13} /> New
        </button>
      </div>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-ink-100 bg-white shadow-card-hover">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-xs text-ink-500">
              {customers.length === 0 ? 'No customers yet — they can be added here or during checkout.' : 'No customers found.'}
            </p>
          ) : (
            <ul>
              {matches.map((c) => (
                <li key={c.id}>
                  <button
                    onMouseDown={() => onSelect(c)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ink-50"
                  >
                    <span className="text-ink-900">{c.name}</span>
                    <span className="text-xs text-ink-500">{c.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
