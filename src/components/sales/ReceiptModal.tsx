import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Printer, X } from 'lucide-react'
import { Button } from '../ui/Button'
import { formatCurrency } from '../../lib/format'
import { PAYMENT_METHOD_LABELS } from '../../types/sales'
import type { Sale } from '../../types/sales'
import type { ReceiptSettings } from '../../types/settings'
import type { Customer } from '../../types/sales'

interface ReceiptModalProps {
  sale: Sale
  customer: Customer | null
  businessName: string
  receiptSettings?: ReceiptSettings
  cashierName: string
  onClose: () => void
  onNewSale: () => void
}

// Bug fix (2026-09-03): Print produced a blank page. Root cause: this
// modal renders inline in the component tree, wherever the page that
// opened it happens to sit - which, for the Sales page, is inside
// AppShell's <main style={{ overflow: 'auto' }}>. A `position: fixed`
// element nested inside a scrollable (overflow: auto/scroll) ancestor is
// a well-known Chromium print bug: on-screen it positions correctly
// relative to the viewport as normal, but the print engine can't resolve
// its position relative to the printed page and renders nothing for it -
// confirmed by matching the exact "opens fine, Print shows nothing"
// symptom reported. Rendering it through a portal straight onto
// `document.body` (a sibling of #root, not a descendant of any scrolling
// container) sidesteps that entirely. The `receipt-printing` class this
// adds to <body> while open pairs with the print rule in index.css that
// hides `#root` (the whole app UI) during print, so only this portaled
// receipt shows up on the page - without it, the dashboard/sidebar behind
// the modal would print alongside the receipt once printing it works at
// all. Scoped to just this component/class so it can't affect the
// several other pages that also call window.print() for their own
// in-page printable content.
export function ReceiptModal({ sale, customer, businessName, receiptSettings, cashierName, onClose, onNewSale }: ReceiptModalProps) {
  const portalRef = useRef<HTMLDivElement | null>(null)
  if (!portalRef.current) {
    portalRef.current = document.createElement('div')
  }

  useEffect(() => {
    const node = portalRef.current!
    document.body.appendChild(node)
    document.body.classList.add('receipt-printing')
    return () => {
      document.body.classList.remove('receipt-printing')
      document.body.removeChild(node)
    }
  }, [])

  return createPortal(
    // Same z-index fix as the shared Modal.tsx: this uses var(--z-modal)
    // instead of an arbitrary z-50 so the receipt also paints above the
    // fixed sidebar (var(--z-sticky)) instead of underneath it.
    <div className="fixed inset-0 flex items-center justify-center p-4 print:static print:p-0" style={{ zIndex: 'var(--z-modal)' }}>
      <div className="absolute inset-0 bg-ink-900/40 print:hidden" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Receipt"
        className="relative w-full max-w-sm rounded-card border border-ink-100 bg-white shadow-card-hover print:max-w-none print:border-0 print:shadow-none"
      >
        <div className="border-b border-ink-100 p-4 print:hidden">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success-100 text-success-700">
                <CheckCircle2 size={18} />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-ink-900">Sale completed</h2>
                <p className="text-xs text-ink-500">Receipt {sale.reference}</p>
              </div>
            </div>
            <button onClick={onClose} className="rounded-md p-1 text-ink-500 hover:bg-ink-50" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 font-mono text-xs text-ink-900">
          {receiptSettings?.showLogo !== false && <p className="mb-1 text-center text-sm font-bold">{businessName}</p>}
          <p className="text-center text-ink-500">Receipt · {sale.reference}</p>
          <p className="text-center text-ink-500">{new Date(sale.createdAt).toLocaleString('en-UG')}</p>
          {receiptSettings?.showCashierName !== false && (
            <p className="text-center text-ink-500">Served by {cashierName}</p>
          )}
          <p className="text-center text-ink-500">{customer ? customer.name : 'Walk-in Customer'}</p>

          <div className="my-3 border-t border-dashed border-ink-300" />

          <ul className="space-y-1">
            {sale.items.map((item) => (
              <li key={item.productId} className="flex justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {item.quantity} × {item.productName}
                </span>
                <span className="shrink-0">{formatCurrency(item.lineTotal, 'UGX')}</span>
              </li>
            ))}
          </ul>

          <div className="my-3 border-t border-dashed border-ink-300" />

          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <span>{formatCurrency(sale.subtotal, 'UGX')}</span>
            </div>
            {sale.discountAmount > 0 && (
              <div className="flex justify-between text-brand-red-700">
                <span>Discount ({sale.discountPercent}%)</span>
                <span>-{formatCurrency(sale.discountAmount, 'UGX')}</span>
              </div>
            )}
            {receiptSettings?.showTaxBreakdown !== false && sale.taxAmount > 0 && (
              <div className="flex justify-between text-ink-500">
                <span>Tax</span>
                <span>{formatCurrency(sale.taxAmount, 'UGX')}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-ink-100 pt-1 text-sm font-bold">
              <span>Total</span>
              <span>{formatCurrency(sale.totalAmount, 'UGX')}</span>
            </div>
            <div className="flex justify-between text-ink-500">
              <span>Payment</span>
              <span>{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</span>
            </div>
            {sale.paymentMethod === 'cash' && sale.amountTendered !== null && (
              <>
                <div className="flex justify-between text-ink-500">
                  <span>Amount received</span>
                  <span>{formatCurrency(sale.amountTendered, 'UGX')}</span>
                </div>
                <div className="flex justify-between text-ink-500">
                  <span>Change</span>
                  <span>{formatCurrency(sale.changeDue ?? 0, 'UGX')}</span>
                </div>
              </>
            )}
            {(sale.paymentMethod === 'mobile_money' || sale.paymentMethod === 'card') && sale.paymentReference && (
              <div className="flex justify-between text-ink-500">
                <span>{sale.paymentMethod === 'card' ? 'Transaction ID' : 'Reference'}</span>
                <span className="max-w-[60%] truncate text-right">{sale.paymentReference}</span>
              </div>
            )}
          </div>

          {receiptSettings?.footerMessage && (
            <>
              <div className="my-3 border-t border-dashed border-ink-300" />
              <p className="text-center">{receiptSettings.footerMessage}</p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-100 p-4 print:hidden">
          <Button variant="secondary" onClick={() => window.print()}>
            <Printer size={14} /> Print
          </Button>
          <Button onClick={onNewSale}>New sale</Button>
        </div>
      </div>
    </div>,
    portalRef.current
  )
}
