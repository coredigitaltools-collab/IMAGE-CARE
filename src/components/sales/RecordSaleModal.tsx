import type { RefObject } from 'react'
import { Modal } from '../ui/Modal'
import { ProductPicker, type ProductPickerHandle } from './ProductPicker'
import { CustomerSelector } from './CustomerSelector'
import { CartPanel } from './CartPanel'
import type { Product } from '../../types/inventory'
import type { CartItem, Customer, PaymentMethod } from '../../types/sales'
import type { TaxRate } from '../../types/settings'

interface BranchOption {
  id: string
  name: string
}

interface StaffOption {
  id: string
  fullName: string
}

interface RecordSaleModalProps {
  onClose: () => void

  products: Product[]
  onAddToCart: (product: Product, quantity: number) => void
  productPickerRef: RefObject<ProductPickerHandle>

  customers: Customer[]
  selectedCustomer: Customer | null
  lastPurchaseAt: string | null
  onSelectCustomer: (customer: Customer | null) => void
  onAddNewCustomer: () => void

  branches: BranchOption[]
  branchId: string | null
  onBranchChange: (id: string | null) => void
  staff: StaffOption[]
  salesPersonId: string | null
  onSalesPersonChange: (id: string | null) => void

  cart: CartItem[]
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
  amountTendered: string
  onAmountTenderedChange: (value: string) => void
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

// Everything that used to sit in the always-visible "current sale" side
// panel now lives here, unchanged in behavior - this only changes where
// it's rendered (inside a modal, opened from the Sales Records list)
// rather than always on screen next to a product grid. CartPanel and
// CustomerSelector are reused exactly as they were; only the product
// picker (see ProductPicker.tsx) and the sale-details disclosure were
// reshaped to fit a modal instead of a full page column.
export function RecordSaleModal({
  onClose,
  products,
  onAddToCart,
  productPickerRef,
  customers,
  selectedCustomer,
  lastPurchaseAt,
  onSelectCustomer,
  onAddNewCustomer,
  branches,
  branchId,
  onBranchChange,
  staff,
  salesPersonId,
  onSalesPersonChange,
  cart,
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
}: RecordSaleModalProps) {
  return (
    <Modal title="Record sale" onClose={onClose} size="xl">
      <div className="max-h-[78vh] space-y-5 overflow-y-auto pr-1">
        <ProductPicker ref={productPickerRef} products={products} onAdd={onAddToCart} />

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink-700">Customer</label>
          <CustomerSelector
            customers={customers}
            selectedCustomer={selectedCustomer}
            lastPurchaseAt={lastPurchaseAt}
            onSelect={onSelectCustomer}
            onAddNew={onAddNewCustomer}
          />
        </div>

        <SaleDetailsToggle
          branches={branches}
          branchId={branchId}
          onBranchChange={onBranchChange}
          staff={staff}
          salesPersonId={salesPersonId}
          onSalesPersonChange={onSalesPersonChange}
        />

        <div className="rounded-md border border-ink-100 p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Cart</p>
          <CartPanel
            items={cart}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            onRemove={onRemove}
            discountPercent={discountPercent}
            onDiscountChange={onDiscountChange}
            discountsAllowed={discountsAllowed}
            maxDiscountPercent={maxDiscountPercent}
            taxRates={taxRates}
            taxRateId={taxRateId}
            onTaxRateChange={onTaxRateChange}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={onPaymentMethodChange}
            amountTendered={amountTendered}
            onAmountTenderedChange={onAmountTenderedChange}
            paymentReference={paymentReference}
            onPaymentReferenceChange={onPaymentReferenceChange}
            subtotal={subtotal}
            discountAmount={discountAmount}
            taxAmount={taxAmount}
            totalAmount={totalAmount}
            onPark={onPark}
            onComplete={onComplete}
            isSubmitting={isSubmitting}
          />
        </div>
      </div>
    </Modal>
  )
}

// ---- Branch / Sold by ----------------------------------------------
// Both matter, but neither is part of the "find product -> cart -> pay"
// workflow a first-time cashier needs to grasp, so they live behind a
// small disclosure instead of two full-width fields competing with the
// customer/cart area for attention. When there's only one branch to
// choose from anyway, the branch row is skipped entirely - there's
// nothing for the cashier to decide. (Moved here unchanged from
// PointOfSalePage.tsx now that the whole "current sale" workspace lives
// inside this modal.)
interface SaleDetailsToggleProps {
  branches: BranchOption[]
  branchId: string | null
  onBranchChange: (id: string | null) => void
  staff: StaffOption[]
  salesPersonId: string | null
  onSalesPersonChange: (id: string | null) => void
}

function SaleDetailsToggle({
  branches,
  branchId,
  onBranchChange,
  staff,
  salesPersonId,
  onSalesPersonChange,
}: SaleDetailsToggleProps) {
  const showBranchPicker = branches.length > 1
  const activeBranchName = branches.find((b) => b.id === branchId)?.name
  const soldByName = staff.find((s) => s.id === salesPersonId)?.fullName

  if (!showBranchPicker && staff.length === 0) return null

  return (
    <details className="group rounded-md border border-ink-100">
      <summary className="flex cursor-pointer list-none items-center justify-between px-2.5 py-2 text-xs font-medium text-ink-500">
        <span>
          Sale details
          {activeBranchName && <span className="text-ink-400"> · {activeBranchName}</span>}
          <span className="text-ink-400"> · Sold by {soldByName ?? 'unassigned'}</span>
        </span>
        <span className="text-ink-400 transition-transform group-open:rotate-180">⌄</span>
      </summary>
      <div className="space-y-2 px-2.5 pb-2.5">
        {showBranchPicker && (
          <div>
            <label htmlFor="pos-branch" className="mb-1 block text-xs font-medium text-ink-500">
              Branch
            </label>
            <select
              id="pos-branch"
              value={branchId ?? ''}
              onChange={(e) => onBranchChange(e.target.value || null)}
              className="w-full rounded-md border border-ink-100 bg-white px-2.5 py-1.5 text-xs text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {staff.length > 0 && (
          <div>
            <label htmlFor="pos-sold-by" className="mb-1 block text-xs font-medium text-ink-500">
              Sold by (optional)
            </label>
            <select
              id="pos-sold-by"
              value={salesPersonId ?? ''}
              onChange={(e) => onSalesPersonChange(e.target.value || null)}
              className="w-full rounded-md border border-ink-100 bg-white px-2.5 py-1.5 text-xs text-ink-900 shadow-card hover:border-ink-300 focus:border-brand-blue-500"
            >
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.fullName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </details>
  )
}
