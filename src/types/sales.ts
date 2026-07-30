import type { AuditFields } from '../lib/audit'

// ---------- Customer Master ----------
// "Sales is the primary entry point for identified customers. Every
// customer created during a sale becomes part of the Customer Master and
// is reused by CRM, Credit, Loyalty Programme, Quotes, Invoices, Receipts,
// Reports, and Marketing." (IMP-004) — this type is deliberately the one
// future modules will import, not a Sales-only shape.

export type CustomerStatus = 'active' | 'vip' | 'blacklisted'
export const CUSTOMER_STATUSES: CustomerStatus[] = ['active', 'vip', 'blacklisted']
export const CUSTOMER_STATUS_LABELS: Record<CustomerStatus, string> = {
  active: 'Active',
  vip: 'VIP',
  blacklisted: 'Blacklisted',
}

export interface Customer extends AuditFields {
  name: string
  phone: string
  email: string
  address: string
  notes: string
  tags: string[] // free-text, business-defined segments (e.g. "Wholesale", "VIP") — never a preset industry list
  status: CustomerStatus // business-set relationship status — distinct from is_active (archived or not)
  dateOfBirth: string | null // optional, ISO date — for future birthday-based promotions/loyalty
  preferredBranchId: string | null
  preferredPaymentMethod: PaymentMethod | null
  creditLimit: number // 0 = no explicit limit set; UGX
  loyaltyPoints: number
  lifetimePurchases: number // total amount spent, in UGX
  creditBalance: number // amount currently owed on credit, in UGX
}

// A dated, attributed log entry — separate from Customer.notes (a single
// free-text field shown on the quick-add form). This is what the Notes
// tab on a customer's profile actually shows: a real history of
// interactions over time, each one accountable to whoever logged it.
export interface CustomerNote {
  id: string
  customerId: string
  text: string
  createdAt: string
  createdBy: string
}

export type CustomerInput = Pick<
  Customer,
  'name' | 'phone' | 'email' | 'address' | 'notes' | 'tags' | 'status' | 'dateOfBirth' | 'preferredBranchId' | 'preferredPaymentMethod' | 'creditLimit'
>

// ---------- Credit Management (IMC-SRS-006) ----------
// "One customer has one credit account" — that account IS
// Customer.creditLimit / Customer.creditBalance; there is deliberately
// no separate CreditAccount entity duplicating those fields. These
// three types are the transaction log behind that single account.

export interface CreditPayment {
  id: string
  customerId: string
  amount: number
  method: 'cash' | 'mobile_money' | 'card' | 'bank_transfer'
  reference: string
  createdAt: string
  createdBy: string
}

export interface CreditWriteOff {
  id: string
  customerId: string
  amount: number
  reason: string
  createdAt: string
  createdBy: string
}

export interface CreditLimitChange {
  id: string
  customerId: string
  previousLimit: number
  newLimit: number
  createdAt: string
  createdBy: string
}

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
  amountTendered: number | null // cash only
  changeDue: number | null // cash only
  paymentReference: string | null // mobile money reference / card transaction ID
  status: SaleStatus
  refundReason: string | null
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
  amountTendered: number | null
  paymentReference: string | null
  status: Extract<SaleStatus, 'completed' | 'parked'>
}
