import type { AuditFields } from '../lib/audit'

// ---------- Workflow: Requisition -> PO -> Approval -> Goods Receipt -> Invoice ----------
// Every line item references a REAL product (Product Master) and every
// order references a REAL supplier (Supplier Master) — no free-text
// entry of either, matching "Suppliers from Supplier Master only" /
// "Products from Product Master only".

export type RequisitionStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'converted'
export const REQUISITION_STATUS_LABELS: Record<RequisitionStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  converted: 'Converted to PO',
}

export interface RequisitionLineItem {
  productId: string
  productName: string
  sku: string
  quantity: number
  notes: string
}

export interface PurchaseRequisition extends AuditFields {
  reference: string
  requestedByName: string
  items: RequisitionLineItem[]
  status: RequisitionStatus
  notes: string
  rejectionReason: string | null
  convertedToPoId: string | null
}

export type PurchaseOrderStatus = 'draft' | 'pending_approval' | 'approved' | 'sent' | 'partially_received' | 'received' | 'cancelled'
export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  sent: 'Sent to Supplier',
  partially_received: 'Partially Received',
  received: 'Received',
  cancelled: 'Cancelled',
}

export interface PurchaseOrderLineItem {
  productId: string
  productName: string
  sku: string
  quantityOrdered: number
  quantityReceived: number
  unitCost: number // UGX
}

export interface PurchaseOrder extends AuditFields {
  reference: string
  supplierId: string
  requisitionId: string | null
  items: PurchaseOrderLineItem[]
  status: PurchaseOrderStatus
  expectedDeliveryDate: string | null
  notes: string
  approvedByName: string | null
  approvedAt: string | null
  rejectionReason: string | null
}

export type PurchaseOrderInput = Pick<PurchaseOrder, 'supplierId' | 'items' | 'expectedDeliveryDate' | 'notes' | 'requisitionId'>

export interface GoodsReceiptLineItem {
  productId: string
  productName: string
  sku: string
  quantityReceived: number
  unitCost: number
}

export interface GoodsReceipt {
  id: string
  reference: string
  purchaseOrderId: string
  items: GoodsReceiptLineItem[]
  receivedAt: string
  receivedByName: string
  notes: string
}

export type SupplierInvoiceStatus = 'unpaid' | 'partially_paid' | 'paid'

export interface SupplierInvoice {
  id: string
  reference: string
  supplierInvoiceNumber: string
  supplierId: string
  purchaseOrderId: string | null
  amount: number
  amountPaid: number
  dueDate: string | null
  status: SupplierInvoiceStatus
  createdAt: string
  createdBy: string
}

export interface SupplierInvoicePayment {
  id: string
  supplierInvoiceId: string
  amount: number
  reference: string
  createdAt: string
  createdBy: string
}

export interface PurchaseReturnLineItem {
  productId: string
  productName: string
  sku: string
  quantity: number
  unitCost: number
}

export interface PurchaseReturn {
  id: string
  reference: string
  purchaseOrderId: string | null
  supplierId: string
  items: PurchaseReturnLineItem[]
  reason: string
  createdAt: string
  createdBy: string
}
