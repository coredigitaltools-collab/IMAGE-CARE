import type { PaymentMethod } from './sales'

// ---------- Invoices (IMC-SRS-009) ----------
// An Invoice is deliberately NOT a re-implementation of Sale, it's a
// thin, trackable document layer that REFERENCES a completed Sale
// (saleId) and snapshots its line items/totals at generation time. The
// Sale is the transaction record; the Invoice is the formal document a
// customer receives, with its own lifecycle (sent/paid/overdue) that
// can move independently of the underlying sale. "Sale reference"
// (INV-xxxxx, assigned at checkout) and "Invoice number" (IVC-xxxxx,
// assigned when formally invoiced) are deliberately different numbers
// for this reason, conflating them would blur "when was this sold"
// with "when was this formally invoiced," which don't have to be the
// same moment.

export type InvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'
export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
}

export interface InvoiceLineItem {
  productId: string
  productName: string
  sku: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface Invoice {
  id: string
  invoiceNumber: string
  saleId: string
  saleReference: string
  customerId: string | null
  customerName: string
  items: InvoiceLineItem[]
  subtotal: number
  discountAmount: number
  taxAmount: number
  totalAmount: number
  paymentMethod: PaymentMethod
  status: InvoiceStatus
  issuedAt: string
  dueDate: string | null
  paidAt: string | null
  sentAt: string | null
  cancelledAt: string | null
  cancelReason: string | null
  notes: string
  createdAt: string
  createdBy: string
}

export interface InvoiceSettings {
  defaultDueDays: number
  footerText: string
  showTaxBreakdown: boolean
  showLogo: boolean
}
