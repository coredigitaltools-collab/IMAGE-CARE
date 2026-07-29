import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
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
  subtotal,
  discountAmount,
  taxAmount,
  totalAmount,
  onPark,
  onComplete,
  isSubmitting,
}: CartPanelProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <ShoppingCart size={22} className="text-ink-300" />
            <p className="text-xs text-ink-500">Cart is empty — search or scan a product to begin.</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {items.map((item) => (
              <li key={item.productId} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink-900">{item.productName}</p>
                  <p className="text-xs text-ink-500">{formatCurrency(item.unitPrice, 'UGX')} each</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => onDecrement(item.productId)}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-ink-100 text-ink-500 hover:bg-ink-50"
                    aria-label={`Decrease quantity of ${item.productName}`}
                  >
                    <Minus size={11} />
                  </button>
                  <span className="w-6 text-center text-xs font-medium text-ink-900">{item.quantity}</span>
                  <button
                    onClick={() => onIncrement(item.productId)}
                    disabled={item.quantity >= item.availableStock}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-ink-100 text-ink-500 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={`Increase quantity of ${item.productName}`}
                  >
                    <Plus size={11} />
                  </button>
                </div>
                <p className="w-16 shrink-0 text-right text-xs font-semibold text-ink-900">
                  {formatCurrency(item.unitPrice * item.quantity, 'UGX')}
                </p>
                <button
                  onClick={() => onRemove(item.productId)}
                  aria-label={`Remove ${item.productName}`}
                  className="shrink-0 rounded-full p-1 text-ink-400 hover:bg-brand-red-50 hover:text-brand-red-700"
                >
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 space-y-3 border-t border-ink-100 pt-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="pos-discount" className="mb-1 block text-xs font-medium text-ink-700">
              Discount %{!discountsAllowed && ' (off)'}
            </label>
            <input
              id="pos-discount"
              type="number"
              min={0}
              max={maxDiscountPercent}
              disabled={!discountsAllowed}
              value={discountPercent}
              onChange={(e) => onDiscountChange(Number(e.target.value))}
              className="w-full rounded-md border border-ink-100 bg-white px-2.5 py-1.5 text-sm text-ink-900 shadow-card disabled:bg-ink-50 disabled:text-ink-300"
            />
          </div>
          <div>
            <label htmlFor="pos-tax" className="mb-1 block text-xs font-medium text-ink-700">
              Tax
            </label>
            <select
              id="pos-tax"
              value={taxRateId ?? ''}
              onChange={(e) => onTaxRateChange(e.target.value || null)}
              className="w-full rounded-md border border-ink-100 bg-white px-2.5 py-1.5 text-sm text-ink-900 shadow-card"
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

        <div>
          <label className="mb-1 block text-xs font-medium text-ink-700">Payment method</label>
          <div className="grid grid-cols-4 gap-1.5">
            {PAYMENT_METHODS.map((m) => (
              <button
                key={m}
                onClick={() => onPaymentMethodChange(m)}
                className={
                  paymentMethod === m
                    ? 'rounded-md bg-brand-blue-700 px-2 py-1.5 text-[11px] font-medium text-white'
                    : 'rounded-md border border-ink-100 bg-white px-2 py-1.5 text-[11px] font-medium text-ink-700 hover:bg-ink-50'
                }
              >
                {PAYMENT_METHOD_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1 border-t border-ink-100 pt-2 text-sm">
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
          <div className="flex justify-between text-base font-semibold text-ink-900">
            <span>Total</span>
            <span>{formatCurrency(totalAmount, 'UGX')}</span>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onPark} disabled={items.length === 0 || isSubmitting}>
            Park sale
          </Button>
          <Button className="flex-1" onClick={onComplete} disabled={items.length === 0 || isSubmitting}>
            {isSubmitting ? 'Processing…' : 'Complete sale'}
          </Button>
        </div>
      </div>
    </div>
  )
}
