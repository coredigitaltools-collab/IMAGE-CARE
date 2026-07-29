import type { AuditFields } from '../lib/audit'

// ---------- Customer Master ----------
// "Sales is the primary entry point for identified customers. Every
// customer created during a sale becomes part of the Customer Master and
// is reused by CRM, Credit, Loyalty Programme, Quotes, Invoices, Receipts,
// Reports, and Marketing." (IMP-004) — this type is deliberately the one
// future modules will import, not a Sales-only shape.

export interface Customer extends AuditFields {
  name: string
  phone: string
  email: string
  address: string
  notes: string
  loyaltyPoints: number
  lifetimePurchases: number // total amount spent, in UGX
  creditBalance: number // amount currently owed on credit, in UGX
}

export type CustomerInput = Pick<Customer, 'name' | 'phone' | 'email' | 'address' | 'notes'>

// ---------- Sales & POS ----------

export type PaymentMethod = 'cash' | 'mobile_money' | 'card' | 'credit'

export const PAYMENT_METHODS: PaymentMethod[] = ['cash', 'mobile_money', 'card', 'credit']

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  card: 'Card',
  credit: 'Credit',
}

export type SaleStatus = 'completed' | 'parked' | 'refunded'

export interface SaleLineItem {
  productId: string
  productName: string // snapshot — survives later product edits/archival
  sku: string
  unitPrice: number // snapshot of sellingPrice at time of sale, UGX
  quantity: number
  lineTotal: number
}

export interface Sale {
  id: string
  reference: string
  branchId: string | null
  customerId: string | null // null = anonymous walk-in
  items: SaleLineItem[]
  subtotal: number
  discountPercent: number
  discountAmount: number
  taxRateId: string | null
  taxAmount: number
  totalAmount: number
  paymentMethod: PaymentMethod
  status: SaleStatus
  createdAt: string
  createdBy: string
  syncStatus: 'synced' | 'pending' | 'error'
}

export interface CartItem {
  productId: string
  productName: string
  sku: string
  unitPrice: number
  quantity: number
  availableStock: number
}

export interface CheckoutInput {
  customerId: string | null
  items: CartItem[]
  discountPercent: number
  taxRateId: string | null
  paymentMethod: PaymentMethod
  status: Extract<SaleStatus, 'completed' | 'parked'>
}
