import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { NumberField } from '../ui/NumberField'
import { formatCurrency } from '../../lib/format'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '../../types/sales'
import type { CartItem, PaymentMethod } from '../../types/sales'
import type { TaxRate } from '../../types/settings'

interface CartPanelProps {
  items: CartItem[]
  onIncrement: (productId: string) => void
  onDecrement: (productId: string) => void
  onRemove: (productId: string) => void
  discountPercent: number
  onDiscountChange: (value: number) => void
  discountsAllowed: boolean
  maxDiscountPercent: number
  taxRates: TaxRate[]
  taxRateId: string | null
  onTaxRateChange: (id: string | null) => void
  paymentMethod: PaymentMethod
  onPaymentMethodChange: (method: PaymentMethod) => void
  amountTendered: number
  onAmountTenderedChange: (value: number) => void
  paymentReference: string
  onPaymentReferenceChange: (value: string) => void
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  onPark: () => void
  onComplete: () => void
  isSubmitting: boolean
}

export function CartPanel({
  items,
  onIncrement,
  onDecrement,
  onRemove,
  discountPercent,
  onDiscountChange,
  discountsAllowed,
  maxDiscountPercent,
  taxRates,
  taxRateId,
  onTaxRateChange,
  paymentMethod,
  onPaymentMethodChange,
  amountTendered,
  onAmountTenderedChange,
  paymentReference,
  onPaymentReferenceChange,
  subtotal,
  discountAmount,
  taxAmount,
  totalAmount,
  onPark,
  onComplete,
  isSubmitting,
}: CartPanelProps) {
  const tenderedNumber = amountTendered
  const changeDue = Math.max(0, tenderedNumber - totalAmount)
  const hasItems = items.length > 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {!hasItems ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-50">
              <ShoppingCart size={22} className="text-ink-300" />
            </span>
            <p className="text-sm font-semibold text-ink-900">Your cart is empty</p>
            <p className="max-w-[220px] text-xs text-ink-500">Search for a product above or scan a barcode to begin.</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {items.map((item) => (
              <li key={item.productId} className="flex items-center gap-2 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">{item.productName}</p>
                  <p className="text-xs text-ink-500">{formatCurrency(item.unitPrice, 'UGX')} each</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => onDecrement(item.productId)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-100 text-ink-500 hover:bg-ink-50 active:bg-ink-100"
                    aria-label={`Decrease quantity of ${item.productName}`}
                  >
                    <Minus size={13} />
                  </button>
                  <span className="w-6 text-center text-sm font-medium text-ink-900">{item.quantity}</span>
                  <button
                    onClick={() => onIncrement(item.productId)}
                    disabled={item.quantity >= item.availableStock}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-ink-100 text-ink-500 hover:bg-ink-50 active:bg-ink-100 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Increase quantity of ${item.productName}`}
                  >
                    <Plus size={13} />
                  </button>
                </div>
                <p className="w-16 shrink-0 text-right text-sm font-semibold text-ink-900">
                  {formatCurrency(item.unitPrice * item.quantity, 'UGX')}
                </p>
                <button
                  onClick={() => onRemove(item.productId)}
                  aria-label={`Remove ${item.productName}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-400 hover:bg-brand-red-50 hover:text-brand-red-700"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Everything below is only relevant once there's something to sell -
          asking a cashier to think about discounts, tax and payment before
          they've added a single item is exactly the "too much at once"
          problem this layout is meant to avoid. */}
      {hasItems && (
        <div className="shrink-0 space-y-4 border-t border-ink-100 pt-4">
          <details className="group rounded-lg border border-ink-100 bg-ink-50/60 open:bg-transparent">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-xs font-medium text-ink-700">
              <span>Discount &amp; tax {discountAmount > 0 || taxAmount > 0 ? <span className="text-ink-500">(applied)</span> : <span className="text-ink-400">(optional)</span>}</span>
              <span className="text-ink-400 transition-transform group-open:rotate-180">⌄</span>
            </summary>
            <div className="grid grid-cols-2 gap-3 px-4 pb-4">
              <NumberField
                id="pos-discount"
                label={`Discount %${!discountsAllowed ? ' (off)' : ''}`}
                min={0}
                max={maxDiscountPercent}
                allowDecimal
                disabled={!discountsAllowed}
                value={discountPercent}
                onChange={onDiscountChange}
              />
              <div>
                <label htmlFor="pos-tax" className="mb-1.5 block text-xs font-medium text-ink-700">
                  Tax
                </label>
                <select
                  id="pos-tax"
                  value={taxRateId ?? ''}
                  onChange={(e) => onTaxRateChange(e.target.value || null)}
                  className="w-full rounded-lg border border-ink-100 bg-white px-4 py-3 text-sm text-ink-900 shadow-card"
                >
                  <option value="">No tax</option>
                  {taxRates.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.ratePercent}%)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </details>

          <div className="space-y-1.5 rounded-lg bg-ink-50 px-4 py-3.5 text-sm">
            <div className="flex justify-between text-ink-500">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal, 'UGX')}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-brand-red-700">
                <span>Discount</span>
                <span>-{formatCurrency(discountAmount, 'UGX')}</span>
              </div>
            )}
            {taxAmount > 0 && (
              <div className="flex justify-between text-ink-500">
                <span>Tax</span>
                <span>{formatCurrency(taxAmount, 'UGX')}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-ink-200 pt-1 text-base font-semibold text-ink-900">
              <span>Total</span>
              <span>{formatCurrency(totalAmount, 'UGX')}</span>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-medium text-ink-700">Payment method</label>
            <div className="grid grid-cols-2 gap-2.5">
              {PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  onClick={() => onPaymentMethodChange(m)}
                  aria-pressed={paymentMethod === m}
                  className={
                    paymentMethod === m
                      ? 'rounded-lg border-2 border-brand-blue-700 bg-brand-blue-700 px-3 py-3 text-xs font-semibold text-white'
                      : 'rounded-lg border-2 border-ink-100 bg-white px-3 py-3 text-xs font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50'
                  }
                >
                  {PAYMENT_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
          </div>

          {/* Payment-method-specific fields */}
          {paymentMethod === 'cash' && (
            <div className="rounded-lg bg-ink-50 p-4">
              <NumberField
                id="pos-tendered"
                label="Amount received (UGX)"
                min={0}
                value={amountTendered}
                onChange={onAmountTenderedChange}
              />
              {tenderedNumber > 0 && (
                <p className={`mt-2 text-xs font-medium ${tenderedNumber >= totalAmount ? 'text-success-700' : 'text-brand-red-700'}`}>
                  {tenderedNumber >= totalAmount ? `Change due: ${formatCurrency(changeDue, 'UGX')}` : `Short by ${formatCurrency(totalAmount - tenderedNumber, 'UGX')}`}
                </p>
              )}
            </div>
          )}
          {paymentMethod === 'mobile_money' && (
            <div className="rounded-lg bg-ink-50 p-4">
              <label htmlFor="pos-reference" className="mb-1.5 block text-xs font-medium text-ink-700">
                Mobile money reference number
              </label>
              <input
                id="pos-reference"
                value={paymentReference}
                onChange={(e) => onPaymentReferenceChange(e.target.value)}
                placeholder="e.g. transaction confirmation code"
                className="w-full rounded-lg border border-ink-100 bg-white px-4 py-3 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
              />
            </div>
          )}
          {paymentMethod === 'card' && (
            <div className="rounded-lg bg-ink-50 p-4">
              <label htmlFor="pos-reference" className="mb-1.5 block text-xs font-medium text-ink-700">
                Card transaction ID
              </label>
              <input
                id="pos-reference"
                value={paymentReference}
                onChange={(e) => onPaymentReferenceChange(e.target.value)}
                placeholder="From the card terminal receipt"
                className="w-full rounded-lg border border-ink-100 bg-white px-4 py-3 text-sm text-ink-900 shadow-card focus:border-brand-blue-500"
              />
            </div>
          )}

          <div className="space-y-2.5 pt-1">
            <Button className="w-full !py-4 text-base" onClick={onComplete} disabled={isSubmitting}>
              {isSubmitting ? 'Processing…' : <>Complete sale · {formatCurrency(totalAmount, 'UGX')} <span className="hidden opacity-70 sm:inline">(F9)</span></>}
            </Button>
            <button
              onClick={onPark}
              disabled={isSubmitting}
              className="w-full py-2 text-center text-xs font-medium text-ink-500 underline-offset-2 hover:text-ink-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Hold this sale for later <span className="text-ink-400">(F10)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
