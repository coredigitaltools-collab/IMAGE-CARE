import { FileText, ShoppingBag } from 'lucide-react'
import { formatCurrency, formatRelativeTime } from '../../lib/format'
import { PAYMENT_METHOD_LABELS } from '../../types/sales'
import type { CustomerNote, Sale } from '../../types/sales'

type TimelineEvent =
  | { kind: 'sale'; at: string; sale: Sale }
  | { kind: 'note'; at: string; note: CustomerNote }

interface CustomerTimelineProps {
  sales: Sale[]
  notes: CustomerNote[]
}

/** The customer's complete business history in one chronological feed,
 *  every entry here is a real, already-recorded event (a completed sale,
 *  a logged note). Quotes/Invoices/loyalty-redemption events will appear
 *  here automatically once those modules exist and start writing real
 *  records; nothing is fabricated to fill the timeline out today. */
export function CustomerTimeline({ sales, notes }: CustomerTimelineProps) {
  const events: TimelineEvent[] = [
    ...sales.map((sale): TimelineEvent => ({ kind: 'sale', at: sale.createdAt, sale })),
    ...notes.map((note): TimelineEvent => ({ kind: 'note', at: note.createdAt, note })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-500">No activity recorded yet.</p>
  }

  return (
    <ol className="space-y-0">
      {events.map((event, i) => (
        <li key={`${event.kind}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
          {i < events.length - 1 && <span className="absolute left-[15px] top-8 h-full w-px bg-ink-100" aria-hidden="true" />}
          {event.kind === 'sale' ? (
            <>
              <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-100 text-success-700">
                <ShoppingBag size={14} />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-sm text-ink-900">
                  Purchase <span className="font-medium">{event.sale.reference}</span>, {formatCurrency(event.sale.totalAmount, 'UGX')} via{' '}
                  {PAYMENT_METHOD_LABELS[event.sale.paymentMethod]}
                  {event.sale.totalAmount >= 1000 && (
                    <span className="text-ink-500"> · +{Math.floor(event.sale.totalAmount / 1000)} loyalty pts</span>
                  )}
                </p>
                <p className="text-xs text-ink-500">{formatRelativeTime(event.sale.createdAt)}</p>
              </div>
            </>
          ) : (
            <>
              <span className="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-blue-50 text-brand-blue-700">
                <FileText size={14} />
              </span>
              <div className="min-w-0 flex-1 pt-1">
                <p className="text-sm text-ink-900">{event.note.text}</p>
                <p className="text-xs text-ink-500">{formatRelativeTime(event.note.createdAt)} · Note</p>
              </div>
            </>
          )}
        </li>
      ))}
    </ol>
  )
}
