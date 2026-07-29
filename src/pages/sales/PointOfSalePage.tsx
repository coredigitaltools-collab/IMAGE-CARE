import { useState } from 'react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { ProductSearchGrid } from '../../components/sales/ProductSearchGrid'
import { CartPanel } from '../../components/sales/CartPanel'
import { CustomerSelector } from '../../components/sales/CustomerSelector'
import { CustomerFormModal } from '../../components/sales/CustomerFormModal'
import { ParkedSalesButton } from '../../components/sales/ParkedSalesButton'
import { ReceiptModal } from '../../components/sales/ReceiptModal'
import { useToast } from '../../components/ui/Toast'
import { useAuth } from '../../hooks/useAuth'
import { useProducts } from '../../features/inventory/hooks/useInventoryData'
import { useTaxRates } from '../../features/settings/hooks/useSettingsData'
import { useReceiptSettings, useSalesSettings } from '../../features/settings/hooks/useSettingsData'
import { useBusinessProfile } from '../../features/settings/hooks/useSettingsData'
import {
  useCheckout,
  useCreateCustomer,
  useCustomers,
  useDeleteParkedSale,
  useParkedSales,
  useResumeParkedSale,
} from '../../features/sales/hooks/useSalesData'
import {
  CreditRequiresCustomerError,
  DiscountExceedsLimitError,
  DiscountNotAllowedError,
  EmptyCartError,
  NegativeStockError,
} from '../../services/salesService'
import { ArchivedProductError } from '../../services/productService'
import type { Product } from '../../types/inventory'
import type { CartItem, Customer, PaymentMethod, Sale } from '../../types/sales'

export function PointOfSalePage() {
  const { user } = useAuth()
  const { showToast } = useToast()

  const productsQuery = useProducts()
  const taxRatesQuery = useTaxRates()
  const customersQuery = useCustomers()
  const salesSettingsQuery = useSalesSettings()
  const receiptSettingsQuery = useReceiptSettings()
  const businessProfileQuery = useBusinessProfile()
  const parkedSalesQuery = useParkedSales()

  const checkout = useCheckout(user.id)
  const createCustomer = useCreateCustomer(user.id)
  const resumeParked = useResumeParkedSale()
  const deleteParked = useDeleteParkedSale()

  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [discountPercent, setDiscountPercent] = useState(0)
  const [taxRateId, setTaxRateId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null)

  const salesSettings = salesSettingsQuery.data
  const defaultTaxRate = taxRatesQuery.data?.find((r) => r.isDefault)

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        if (existing.quantity >= product.currentStock) {
          showToast(`Only ${product.currentStock} in stock.`)
          return prev
        }
        return prev.map((i) => (i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i))
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unitPrice: product.sellingPrice,
          quantity: 1,
          availableStock: product.currentStock,
        },
      ]
    })
  }

  const increment = (productId: string) =>
    setCart((prev) =>
      prev.map((i) => {
        if (i.productId !== productId) return i
        if (i.quantity >= i.availableStock) {
          showToast(`Only ${i.availableStock} in stock.`)
          return i
        }
        return { ...i, quantity: i.quantity + 1 }
      }),
    )
  const decrement = (productId: string) =>
    setCart((prev) => prev.map((i) => (i.productId === productId ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i)))
  const remove = (productId: string) => setCart((prev) => prev.filter((i) => i.productId !== productId))

  const resetPOS = () => {
    setCart([])
    setSelectedCustomer(null)
    setDiscountPercent(0)
    setTaxRateId(defaultTaxRate?.id ?? null)
    setPaymentMethod('cash')
  }

  const subtotal = cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
  const discountAmount = Math.round((subtotal * discountPercent) / 100)
  const taxableAmount = subtotal - discountAmount
  const rate = taxRatesQuery.data?.find((r) => r.id === taxRateId)
  const taxAmount = rate ? (rate.isInclusive ? Math.round(taxableAmount - taxableAmount / (1 + rate.ratePercent / 100)) : Math.round((taxableAmount * rate.ratePercent) / 100)) : 0
  const totalAmount = rate?.isInclusive ? taxableAmount : taxableAmount + taxAmount

  const handleError = (err: unknown) => {
    if (
      err instanceof NegativeStockError ||
      err instanceof ArchivedProductError ||
      err instanceof DiscountNotAllowedError ||
      err instanceof DiscountExceedsLimitError ||
      err instanceof CreditRequiresCustomerError ||
      err instanceof EmptyCartError
    ) {
      showToast(err.message)
    } else {
      showToast('Something went wrong completing this sale.')
    }
  }

  const handleComplete = async () => {
    try {
      const sale = await checkout.mutateAsync({
        customerId: selectedCustomer?.id ?? null,
        items: cart,
        discountPercent,
        taxRateId,
        paymentMethod,
        status: 'completed',
      })
      setReceiptSale(sale)
    } catch (err) {
      handleError(err)
    }
  }

  const handlePark = async () => {
    try {
      await checkout.mutateAsync({
        customerId: selectedCustomer?.id ?? null,
        items: cart,
        discountPercent,
        taxRateId,
        paymentMethod,
        status: 'parked',
      })
      showToast('Sale parked.', 'success')
      resetPOS()
    } catch (err) {
      handleError(err)
    }
  }

  const handleResumeParked = async (sale: Sale) => {
    const resumed = await resumeParked.mutateAsync(sale.id)
    setCart(
      resumed.items.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        sku: i.sku,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        availableStock: productsQuery.data?.find((p) => p.id === i.productId)?.currentStock ?? i.quantity,
      })),
    )
    setDiscountPercent(resumed.discountPercent)
    setTaxRateId(resumed.taxRateId)
    setPaymentMethod(resumed.paymentMethod)
    if (resumed.customerId) {
      const cust = customersQuery.data?.find((c) => c.id === resumed.customerId)
      setSelectedCustomer(cust ?? null)
    }
    showToast('Parked sale resumed.', 'success')
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] max-w-6xl flex-col">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Sales' }]} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Sales / POS</h1>
          <p className="mt-0.5 text-sm text-ink-500">Search products, build the cart, and check out.</p>
        </div>
        <ParkedSalesButton
          parkedSales={parkedSalesQuery.data ?? []}
          onResume={handleResumeParked}
          onDelete={(id) => deleteParked.mutate(id)}
        />
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[1fr_360px]">
        <div className="min-h-0 rounded-card border border-ink-100 bg-white p-4 shadow-card">
          <ProductSearchGrid products={productsQuery.data ?? []} onAdd={addToCart} />
        </div>

        <div className="flex min-h-0 flex-col gap-3 rounded-card border border-ink-100 bg-white p-4 shadow-card">
          <CustomerSelector
            customers={(customersQuery.data ?? []).filter((c) => c.is_active)}
            selectedCustomer={selectedCustomer}
            onSelect={setSelectedCustomer}
            onAddNew={() => setIsCustomerModalOpen(true)}
          />
          <div className="min-h-0 flex-1">
            <CartPanel
              items={cart}
              onIncrement={increment}
              onDecrement={decrement}
              onRemove={remove}
              discountPercent={discountPercent}
              onDiscountChange={setDiscountPercent}
              discountsAllowed={salesSettings?.allowDiscounts ?? true}
              maxDiscountPercent={salesSettings?.maxDiscountPercent ?? 100}
              taxRates={taxRatesQuery.data ?? []}
              taxRateId={taxRateId}
              onTaxRateChange={setTaxRateId}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
              subtotal={subtotal}
              discountAmount={discountAmount}
              taxAmount={taxAmount}
              totalAmount={totalAmount}
              onPark={handlePark}
              onComplete={handleComplete}
              isSubmitting={checkout.isPending}
            />
          </div>
        </div>
      </div>

      {isCustomerModalOpen && (
        <CustomerFormModal
          title="Add customer"
          submitLabel="Save & Continue Sale"
          onClose={() => setIsCustomerModalOpen(false)}
          onSubmit={async (input) => {
            const customer = await createCustomer.mutateAsync(input)
            setSelectedCustomer(customer)
            setIsCustomerModalOpen(false)
            showToast('Customer added.', 'success')
          }}
        />
      )}

      {receiptSale && (
        <ReceiptModal
          sale={receiptSale}
          customer={selectedCustomer}
          businessName={businessProfileQuery.data?.businessName ?? 'ImageCare'}
          receiptSettings={receiptSettingsQuery.data}
          cashierName={user.name}
          onClose={() => setReceiptSale(null)}
          onNewSale={() => {
            setReceiptSale(null)
            resetPOS()
          }}
        />
      )}
    </div>
  )
}
