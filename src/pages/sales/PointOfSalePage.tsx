import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Receipt, Search, Trash2, TrendingUp } from 'lucide-react'
import { Breadcrumb } from '../../components/ui/Breadcrumb'
import { Card } from '../../components/ui/Card'
import { Badge } from '../../components/ui/Badge'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { RowActionButton } from '../../components/ui/RowActionButton'
import { ConfirmDialog } from '../../components/ui/ConfirmDialog'
import { KpiCard } from '../../components/dashboard/KpiCard'
import { RecordSaleModal } from '../../components/sales/RecordSaleModal'
import { CustomerFormModal } from '../../components/sales/CustomerFormModal'
import { ParkedSalesButton } from '../../components/sales/ParkedSalesButton'
import { ReceiptModal } from '../../components/sales/ReceiptModal'
import type { ProductPickerHandle } from '../../components/sales/ProductPicker'
import { useToast } from '../../components/ui/toastContext'
import { useAuth } from '../../hooks/useAuth'
import { useUserContext } from '../../context/AppContext'
import { useProducts } from '../../features/inventory/hooks/useInventoryData'
import { useTaxRates, useStaff, useBranches } from '../../features/settings/hooks/useSettingsData'
import { useReceiptSettings, useSalesSettings } from '../../features/settings/hooks/useSettingsData'
import { useBusinessProfile } from '../../features/settings/hooks/useSettingsData'
import {
  useCheckout,
  useCreateCustomer,
  useCustomers,
  useDeleteParkedSale,
  useDeleteSale,
  useParkedSales,
  useResumeParkedSale,
  useSales,
} from '../../features/sales/hooks/useSalesData'
import { getSale } from '../../services/sales/salesService'
import {
  CreditLimitExceededError,
  CreditRequiresCustomerError,
  DiscountExceedsLimitError,
  DiscountNotAllowedError,
  EmptyCartError,
  InsufficientPaymentError,
  NegativeStockError,
  NoCreditLimitApprovedError,
  PaymentReferenceRequiredError,
} from '../../services/salesService'
import { ArchivedProductError } from '../../services/productService'
import { formatCurrency } from '../../lib/format'
import { PAYMENT_METHOD_LABELS } from '../../types/sales'
import type { Product } from '../../types/inventory'
import type { CartItem, Customer, PaymentMethod, Sale, SaleLineItem, SaleStatus } from '../../types/sales'

// ---------------------------------------------------------------------
// Sales <-> real backend field mapping
// ---------------------------------------------------------------------
// listSales()/getSale() (src/services/sales/salesService.ts) return raw,
// snake_case database rows (Sale/SaleItem in types/database.ts). Every
// UI piece reused here - CartPanel, ReceiptModal, ParkedSalesButton -
// was built against the camelCase Sale/CartItem/SaleLineItem shapes in
// types/sales.ts instead. Nothing in this module ever mapped between the
// two before this fix (the same "never exercised against live data" gap
// documented for the Dashboard in the UX audit log), so completing a
// sale, opening Parked, or resuming a parked sale all worked with
// undefined fields - completing a sale in particular threw the moment
// ReceiptModal tried to read sale.items. These helpers close that one
// gap; they do not change what checkout, park, or refund actually do.

function mapStatus(status: string): SaleStatus {
  if (status === 'confirmed') return 'completed'
  if (status === 'draft') return 'parked'
  // 2026-09-01: the real 'sales.status' column (see TransactionStatus in
  // types/database.ts) only ever holds draft/confirmed/cancelled/voided -
  // there is no 'refunded' value in the database. A cancelled or voided
  // sale was previously mapped to 'refunded' here, which showed a sale
  // that was discarded while still on hold (never charged) as
  // "Refunded" - confusing, since nothing was ever paid or returned.
  // 'refunded' is unused - deleting a completed sale now fully reverses
  // it (see handleDeleteSale/useDeleteSale) and the sale becomes
  // 'cancelled', the same status a discarded held sale gets. There is
  // no partial "refund" state in this schema.
  return 'cancelled' // cancelled / voided - held sale discarded, never charged
}

// 2026-09-01: listSales() now embeds each sale's line items (just enough
// to show a Product column - quantity and product name, not full pricing
// detail) alongside the sale row. This builds just that minimal slice;
// openReceipt() below still calls getSale() for the complete item list
// with real pricing when a receipt is actually opened.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawSaleListItems(rawItems: any[] | undefined): SaleLineItem[] {
  return (rawItems ?? []).map((i) => ({
    productId: '',
    productName: i.products?.name ?? 'Item',
    sku: '',
    unitPrice: 0,
    unitCost: 0,
    quantity: i.quantity ?? 0,
    lineTotal: 0,
  }))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawSaleRow(raw: any): Sale {
  const paymentMethod = (raw.payment_method ?? 'cash') as PaymentMethod
  return {
    id: raw.id,
    reference: raw.sale_number ?? '',
    branchId: raw.branch_id ?? null,
    customerId: raw.customer_id ?? null,
    salesPersonId: raw.served_by ?? null,
    items: mapRawSaleListItems(raw.sale_items),
    subtotal: raw.subtotal ?? 0,
    discountPercent: 0, // only the resulting amount is stored on the row
    discountAmount: raw.discount_amount ?? 0,
    taxRateId: null,
    taxAmount: raw.tax_amount ?? 0,
    totalAmount: raw.total_amount ?? 0,
    paymentMethod,
    amountTendered: paymentMethod === 'cash' ? (raw.amount_paid ?? null) : null,
    changeDue: paymentMethod === 'cash' ? (raw.change_given ?? null) : null,
    paymentReference: raw.notes ?? null,
    status: mapStatus(raw.status),
    refundReason: null,
    createdAt: raw.created_at ?? raw.sale_date ?? '',
    createdBy: raw.served_by_name ?? '',
    syncStatus: 'synced',
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRawSaleItems(rawItems: any[] | undefined, products: Product[]): SaleLineItem[] {
  return (rawItems ?? []).map((i) => {
    const product = products.find((p) => p.id === i.product_id)
    return {
      productId: i.product_id,
      productName: product?.name ?? 'Item',
      sku: product?.sku ?? '',
      unitPrice: i.unit_price ?? 0,
      unitCost: i.unit_cost ?? 0,
      quantity: i.quantity ?? 0,
      lineTotal: i.line_total ?? (i.unit_price ?? 0) * (i.quantity ?? 0),
    }
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapOrThrow(r: { data?: any; error?: any }): any {
  if (r.error) throw new Error(r.error?.message ?? 'Could not load this sale.')
  return r.data
}

// 2026-08-31: "Parked" was called out by name as ERP jargon a normal
// business owner wouldn't recognize. "On Hold" is the same concept in
// plain retail language - the internal status value (SaleStatus =
// 'parked') is unchanged, only this display label.
const STATUS_LABEL: Record<SaleStatus, string> = {
  completed: 'Completed',
  parked: 'On Hold',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
}
const STATUS_TONE: Record<SaleStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  completed: 'success',
  parked: 'warning',
  cancelled: 'neutral',
  refunded: 'danger',
}

export function PointOfSalePage() {
  const { user } = useAuth()
  const ctx = useUserContext()
  const { showToast } = useToast()
  const productPickerRef = useRef<ProductPickerHandle>(null)

  const productsQuery = useProducts()
  const taxRatesQuery = useTaxRates()
  const customersQuery = useCustomers()
  const salesQuery = useSales()
  const salesSettingsQuery = useSalesSettings()
  const receiptSettingsQuery = useReceiptSettings()
  const businessProfileQuery = useBusinessProfile()
  const parkedSalesQuery = useParkedSales()

  const checkout = useCheckout(user.id)
  const createCustomer = useCreateCustomer(user.id)
  const resumeParked = useResumeParkedSale()
  const deleteParked = useDeleteParkedSale()
  const deleteSale = useDeleteSale(user.id)

  const [isRecordSaleOpen, setIsRecordSaleOpen] = useState(false)
  const [cart, setCart] = useState<CartItem[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
  const [salesPersonId, setSalesPersonId] = useState<string | null>(null)
  const staffQuery = useStaff()
  const branchesQuery = useBranches()
  const [branchId, setBranchId] = useState<string | null>(null)

  useEffect(() => {
    if (branchId === null) {
      const firstActive = (branchesQuery.data ?? []).find((b) => b.is_active)
      if (firstActive) setBranchId(firstActive.id)
    }
  }, [branchesQuery.data, branchId])
  const [discountPercent, setDiscountPercent] = useState(0)
  const [taxRateId, setTaxRateId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [amountTendered, setAmountTendered] = useState(0)
  const [paymentReference, setPaymentReference] = useState('')
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  const [receiptSale, setReceiptSale] = useState<Sale | null>(null)
  // Completed sale awaiting a Delete confirmation. window.confirm()/
  // window.prompt() can't be relabeled with the business's own name (see
  // ConfirmDialog.tsx) - this branded dialog collects the required
  // reason instead.
  const [deleteSaleTarget, setDeleteSaleTarget] = useState<Sale | null>(null)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<SaleStatus | 'all'>('all')

  const salesSettings = salesSettingsQuery.data
  const defaultTaxRate = taxRatesQuery.data?.find((r) => r.isDefault)

  const sales = useMemo(() => (salesQuery.data ?? []).map(mapRawSaleRow), [salesQuery.data])
  const customerName = (id: string | null) => (id ? (customersQuery.data ?? []).find((c) => c.id === id)?.name ?? 'Unknown customer' : 'Walk-in customer')
  // 2026-09-01: the Sales table now leads with what was sold, not the
  // internal invoice number - a single-item sale shows the product name
  // (with quantity if more than one), a multi-item sale shows a count,
  // matching how other retail POS tools (e.g. Traxxo) show this column.
  const productSummary = (sale: Sale) => {
    if (sale.items.length === 0) return sale.reference
    if (sale.items.length === 1) {
      const item = sale.items[0]
      return item.quantity > 1 ? `${item.quantity}x ${item.productName}` : item.productName
    }
    return `${sale.items.length} items`
  }

  const filteredSales = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return sales.filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false
      if (!q) return true
      return (
        s.reference.toLowerCase().includes(q) ||
        customerName(s.customerId).toLowerCase().includes(q) ||
        s.items.some((i) => i.productName.toLowerCase().includes(q))
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sales, statusFilter, searchQuery, customersQuery.data])

  const filteredTotal = filteredSales.reduce((sum, s) => sum + s.totalAmount, 0)
  const completedCount = filteredSales.filter((s) => s.status === 'completed').length

  const lastPurchaseAt = useMemo(() => {
    if (!selectedCustomer) return null
    const match = sales.find((s) => s.customerId === selectedCustomer.id && s.status === 'completed')
    return match?.createdAt ?? null
  }, [sales, selectedCustomer])

  const addToCart = (product: Product, quantity = 1) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id)
      if (existing) {
        const nextQty = existing.quantity + quantity
        if (nextQty > product.currentStock) {
          showToast(`Only ${product.currentStock} in stock.`)
          return prev
        }
        return prev.map((i) => (i.productId === product.id ? { ...i, quantity: nextQty } : i))
      }
      if (quantity > product.currentStock) {
        showToast(`Only ${product.currentStock} in stock.`)
        return prev
      }
      return [
        ...prev,
        {
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          unitPrice: product.sellingPrice,
          quantity,
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
    setSalesPersonId(null)
    setDiscountPercent(0)
    setTaxRateId(defaultTaxRate?.id ?? null)
    setPaymentMethod('cash')
    setAmountTendered(0)
    setPaymentReference('')
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
      err instanceof EmptyCartError ||
      err instanceof InsufficientPaymentError ||
      err instanceof PaymentReferenceRequiredError ||
      err instanceof NoCreditLimitApprovedError ||
      err instanceof CreditLimitExceededError
    ) {
      showToast(err.message)
    } else if (err instanceof Error) {
      showToast(err.message)
    } else {
      showToast('Something went wrong completing this sale.')
    }
  }

  const handleComplete = async () => {
    try {
      const result = await checkout.mutateAsync({
        customerId: selectedCustomer?.id ?? null,
        salesPersonId,
        branchId,
        items: cart,
        discountPercent,
        taxRateId,
        paymentMethod,
        amountTendered: paymentMethod === 'cash' ? amountTendered : null,
        paymentReference: paymentMethod === 'mobile_money' || paymentMethod === 'card' ? paymentReference : null,
        status: 'completed',
      })
      // 2026-09-01: an earlier pass sent this to the overall app
      // Dashboard (/dashboard) per the first phrasing of the request -
      // the follow-up clarified "take me back to that sales page", not
      // the whole-system Dashboard. This IS the Sales page (Record Sale
      // is a modal on top of it, not a separate route), so "back to
      // Sales" just means closing the modal - no navigation needed. The
      // table underneath refreshes on its own: useCheckout's onSuccess
      // invalidates the 'sales' query, so the just-completed sale shows
      // up in this same list immediately once the modal closes.
      showToast(`Sale ${result.sale_number} recorded.`, 'success')
      setIsRecordSaleOpen(false)
      resetPOS()
    } catch (err) {
      handleError(err)
    }
  }

  const handlePark = async () => {
    try {
      await checkout.mutateAsync({
        customerId: selectedCustomer?.id ?? null,
        salesPersonId,
        branchId,
        items: cart,
        discountPercent,
        taxRateId,
        paymentMethod,
        amountTendered: null,
        paymentReference: null,
        status: 'parked',
      })
      showToast('Sale put on hold.', 'success')
      resetPOS()
      setIsRecordSaleOpen(false)
    } catch (err) {
      handleError(err)
    }
  }

  const handleResumeParked = async (sale: Sale) => {
    const resumed = await resumeParked.mutateAsync(sale.id)
    const items = mapRawSaleItems(resumed.items, productsQuery.data ?? [])
    setCart(
      items.map((i) => ({
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
    setPaymentMethod((resumed.paymentMethod ?? 'cash') as PaymentMethod)
    if (resumed.customerId) {
      const cust = customersQuery.data?.find((c) => c.id === resumed.customerId)
      setSelectedCustomer(cust ?? null)
    }
    setIsRecordSaleOpen(true)
    showToast('Held sale resumed.', 'success')
  }

  // 2026-09-01: the main Sales table only ever showed a "View receipt"
  // action, for every row regardless of status - meaningless (and
  // confusing) for a held sale that was never completed, since there's
  // no receipt to view. On Hold rows now get the same Resume/Discard
  // actions already available from the "On Hold" button's dropdown,
  // just also reachable directly from the row without hunting for that
  // separate control.
  const handleDeleteHeldSale = (saleId: string) => {
    deleteParked.mutate(saleId, {
      onSuccess: () => showToast('Held sale removed.', 'success'),
      onError: () => showToast('Could not remove this held sale.'),
    })
  }

  const handleDeleteSale = async (reason: string) => {
    if (!deleteSaleTarget) return
    try {
      await deleteSale.mutateAsync({ saleId: deleteSaleTarget.id, reason })
      showToast('Sale deleted, stock and books reversed.', 'success')
      setDeleteSaleTarget(null)
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not delete this sale.')
    }
  }

  const [isReceiptLoading, setIsReceiptLoading] = useState(false)
  const openReceipt = async (sale: Sale) => {
    setIsReceiptLoading(true)
    try {
      const full = await getSale(ctx, sale.id).then(unwrapOrThrow)
      setReceiptSale({ ...mapRawSaleRow(full), items: mapRawSaleItems(full.items, productsQuery.data ?? []) })
    } catch {
      showToast('Could not load this receipt.')
    } finally {
      setIsReceiptLoading(false)
    }
  }

  const openRecordSale = () => setIsRecordSaleOpen(true)

  // Keyboard shortcuts for desktop cashiers: F2 search, F9 complete,
  // F10 park, Esc clears the cart. Only active while the Record Sale
  // modal is open, and ignored while another modal is open or the
  // shortcut would conflict with normal typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isRecordSaleOpen || isCustomerModalOpen || receiptSale) return
      if (e.key === 'F2') {
        e.preventDefault()
        productPickerRef.current?.focusSearch()
      } else if (e.key === 'F9') {
        e.preventDefault()
        if (cart.length > 0 && !checkout.isPending) handleComplete()
      } else if (e.key === 'F10') {
        e.preventDefault()
        if (cart.length > 0 && !checkout.isPending) handlePark()
      } else if (e.key === 'Escape' && document.activeElement?.tagName !== 'INPUT') {
        setCart([])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecordSaleOpen, cart, isCustomerModalOpen, receiptSale, checkout.isPending, discountPercent, taxRateId, paymentMethod, amountTendered, paymentReference, selectedCustomer])

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: 'Sales' }]} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">Sales</h1>
          <p className="mt-0.5 text-sm text-ink-500">Every sale recorded, latest first.</p>
        </div>
        <div className="flex items-center gap-2">
          <ParkedSalesButton
            parkedSales={(parkedSalesQuery.data ?? []).map(mapRawSaleRow)}
            onResume={handleResumeParked}
            onDelete={handleDeleteHeldSale}
          />
          <Button onClick={openRecordSale}>
            <Plus size={15} /> Record sale
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard
          label="Filtered sales"
          value={formatCurrency(filteredTotal, 'UGX')}
          hint={`${filteredSales.length} transaction${filteredSales.length === 1 ? '' : 's'}`}
          icon={TrendingUp}
          tone="success"
          isLoading={salesQuery.isLoading}
        />
        <KpiCard
          label="Completed sales"
          value={String(completedCount)}
          hint="in this filter"
          icon={Receipt}
          tone="blue"
          isLoading={salesQuery.isLoading}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product, reference or customer..."
            className="w-full rounded-md border border-ink-100 bg-white py-2 pl-8 pr-3 text-sm text-ink-900 shadow-card placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-blue-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'completed', 'parked', 'cancelled'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={
                statusFilter === s
                  ? 'rounded-full bg-brand-blue-700 px-3 py-1 text-xs font-medium text-white'
                  : 'rounded-full border border-ink-100 bg-white px-3 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50'
              }
            >
              {s === 'all' ? 'All' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <Card className="overflow-hidden">
        {salesQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : filteredSales.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={sales.length === 0 ? 'No sales recorded yet' : 'No sales match this filter'}
            description={sales.length === 0 ? 'Record your first sale to see it here.' : 'Try a different search term or status.'}
            action={sales.length === 0 ? { label: 'Record sale', onClick: openRecordSale } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-left text-xs font-medium uppercase tracking-wide text-ink-500">
                  <th className="px-4 py-2.5">Date</th>
                  <th className="px-4 py-2.5">Product</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Payment</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredSales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-ink-50/60">
                    <td className="whitespace-nowrap px-4 py-3 text-ink-500">{new Date(sale.createdAt).toLocaleDateString('en-UG')}</td>
                    <td className="px-4 py-3 font-medium text-ink-900">{productSummary(sale)}</td>
                    <td className="px-4 py-3 text-ink-700">{customerName(sale.customerId)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge tone="info">{PAYMENT_METHOD_LABELS[sale.paymentMethod]}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-ink-900">{formatCurrency(sale.totalAmount, 'UGX')}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <Badge tone={STATUS_TONE[sale.status]}>{STATUS_LABEL[sale.status]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {sale.status === 'completed' && (
                          <>
                            <RowActionButton icon={Receipt} label="View receipt" onClick={() => openReceipt(sale)} />
                            <RowActionButton icon={Trash2} label="Delete" tone="danger" onClick={() => setDeleteSaleTarget(sale)} />
                          </>
                        )}
                        {sale.status === 'parked' && (
                          <>
                            <RowActionButton icon={Pencil} label="Edit" onClick={() => handleResumeParked(sale)} />
                            <RowActionButton icon={Trash2} label="Delete" tone="danger" onClick={() => handleDeleteHeldSale(sale.id)} />
                          </>
                        )}
                        {sale.status === 'cancelled' && <span className="text-xs text-ink-400">—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isRecordSaleOpen && (
        <RecordSaleModal
          onClose={() => setIsRecordSaleOpen(false)}
          products={productsQuery.data ?? []}
          onAddToCart={addToCart}
          productPickerRef={productPickerRef}
          customers={(customersQuery.data ?? []).filter((c) => c.is_active)}
          selectedCustomer={selectedCustomer}
          lastPurchaseAt={lastPurchaseAt}
          onSelectCustomer={setSelectedCustomer}
          onAddNewCustomer={() => setIsCustomerModalOpen(true)}
          branches={(branchesQuery.data ?? []).filter((b) => b.is_active)}
          branchId={branchId}
          onBranchChange={setBranchId}
          staff={(staffQuery.data ?? []).filter((s) => s.is_active)}
          salesPersonId={salesPersonId}
          onSalesPersonChange={setSalesPersonId}
          cart={cart}
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
          amountTendered={amountTendered}
          onAmountTenderedChange={setAmountTendered}
          paymentReference={paymentReference}
          onPaymentReferenceChange={setPaymentReference}
          subtotal={subtotal}
          discountAmount={discountAmount}
          taxAmount={taxAmount}
          totalAmount={totalAmount}
          onPark={handlePark}
          onComplete={handleComplete}
          isSubmitting={checkout.isPending || isReceiptLoading}
        />
      )}

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

      {deleteSaleTarget && (
        <ConfirmDialog
          title={`Delete sale ${deleteSaleTarget.reference}?`}
          message="This puts the stock back, reverses the accounting entry, and reverses the cash or credit it recorded. This cannot be undone."
          confirmLabel="Delete sale"
          tone="danger"
          reasonLabel="Reason for deleting this sale"
          reasonPlaceholder="e.g. wrong item, wrong customer, duplicate entry"
          onConfirm={(reason) => handleDeleteSale(reason ?? '')}
          onCancel={() => setDeleteSaleTarget(null)}
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
            setIsRecordSaleOpen(true)
          }}
        />
      )}
    </div>
  )
}
