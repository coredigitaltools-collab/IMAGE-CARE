import { useRef, useState } from 'react'
import { Clock, Trash2 } from 'lucide-react'
import { formatCurrency } from '../../lib/format'
import { formatRelativeTime } from '../../lib/format'
import type { Sale } from '../../types/sales'

interface ParkedSalesButtonProps {
  parkedSales: Sale[]
  onResume: (sale: Sale) => void
  onDelete: (id: string) => void
}

export function ParkedSalesButton({ parkedSales, onResume, onDelete }: ParkedSalesButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        onBlur={(e) => {
          if (!containerRef.current?.contains(e.relatedTarget as Node)) setIsOpen(false)
        }}
        className="relative flex items-center gap-1.5 rounded-md border border-ink-100 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 shadow-card hover:bg-ink-50"
      >
        <Clock size={13} />
        Parked
        {parkedSales.length > 0 && (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-warning-500 px-1 text-[10px] font-semibold text-white">
            {parkedSales.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-20 mt-1.5 w-72 overflow-hidden rounded-md border border-ink-100 bg-white shadow-card-hover">
          <div className="border-b border-ink-100 px-3 py-2">
            <p className="text-xs font-semibold text-ink-900">Parked sales</p>
          </div>
          {parkedSales.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-ink-500">No parked sales.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {parkedSales.map((sale) => (
                <li key={sale.id} className="flex items-center justify-between gap-2 border-b border-ink-100 px-3 py-2 last:border-0">
                  <button onMouseDown={() => onResume(sale)} className="min-w-0 flex-1 text-left">
                    <p className="text-xs font-medium text-ink-900">
                      {sale.reference || 'Parked sale'} · {formatCurrency(sale.totalAmount, 'UGX')}
                    </p>
                    <p className="text-xs text-ink-500">{formatRelativeTime(sale.createdAt)}</p>
                  </button>
                  <button
                    onMouseDown={() => onDelete(sale.id)}
                    aria-label="Discard parked sale"
                    className="shrink-0 rounded-full p-1 text-ink-400 hover:bg-brand-red-50 hover:text-brand-red-700"
                  >
                    <Trash2 size={13} />
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
