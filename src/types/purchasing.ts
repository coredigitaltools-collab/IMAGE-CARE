import type { AuditFields } from '../lib/audit'

// ---------- Workflow: Purchase Order -> Confirmed -> Invoice ----------
// Every line item references a REAL product (Product Master) and every
// order references a REAL supplier (Supplier Master), no free-text
// entry of either, matching "Suppliers from Supplier Master only" /
// "Products from Product Master only".
//
// Workflow change (2026-09-03, "remove requisitions / simplify purchase
// order workflow"): per explicit instruction, Requisitions and the
// separate PO approval stage have been removed from the live app - a
// purchase order is now confirmed the instant it's recorded, with no
// approval step in between (see createAndPostPurchase() in
// services/business/businessEngine.ts). The `RequisitionStatus` /
// `PurchaseRequisition` / `RequisitionLineItem` / `REQUISITION_STATUS_LABELS`
// types below, and `GoodsReceipt` / `GoodsReceiptLineItem`, are left in
// place only because a pre-existing, already-dead, fully disconnected mock
// implementation of Purchasing (src/services/purchasingService.ts -
// localStorage-based, not wired to any live page) still imports them and
// would fail to compile without them; no live page or hook references
// Requisitions or a separate goods-receipt step any more.

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
// 'received' is the label shown for a real purchases.status of 'confirmed'
// (see STATUS_TO_PO_STATUS in usePurchasingData.ts). Labelled "Confirmed"
// rather than "Received" as of the 2026-09-03 workflow change - a PO is
// now confirmed the instant it's recorded, whether or not the goods have
// physically arrived, so "Received" overclaimed what the status actually
// means.
export const PO_STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  sent: 'Sent to Supplier',
  partially_received: 'Partially Received',
  received: 'Confirmed',
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

export type SupplierInvoiceStatus = 'unpaid' | 'partially_paid' | 'paid' | 'cancelled' | 'closed'

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
  cancelledAt: string | null
  cancelReason: string | null
  closedAt: string | null
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
