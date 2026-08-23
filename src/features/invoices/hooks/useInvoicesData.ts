import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserContext } from '../../../context/AppContext'
import {
  getInvoice as getInvoiceReal,
  listInvoices as listInvoicesReal,
  recordInvoicePayment,
} from '../../../services/credit/creditService'
import { supabase } from '../../../lib/supabase'
import * as invoiceService from '../../../services/invoiceService'
import type { InvoiceSettings, Invoice as LocalInvoice, InvoiceLineItem, InvoiceStatus } from '../../../types/invoices'
import type { Invoice as DbInvoiceRow, UUID } from '../../../types/database'
import type { UserContext } from '../../../types/app'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['invoices'] })
}

// Same unwrap() shape as src/features/credit/hooks/useCreditData.ts: throws on
// a ServiceResponse error, unwraps a PagedResponse's `.items`, otherwise
// returns `.data` as-is.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return [];
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string, unknown>).items))
    return (d as Record<string, unknown>).items;
  return d;
}

// ---------------------------------------------------------------------------
// Mapping: real imagecare.invoices rows -> the local Invoice shape the
// invoices pages already render against (src/types/invoices.ts). Normalizing
// here, rather than touching every page's field references, is the lower-risk
// path: the pages also render invoices coming from the still-local
// useGenerateInvoice/useMarkInvoiceSent/useCancelInvoice flows below, and both
// call effectiveStatus()/STATUS_TONE keyed on the local InvoiceStatus union,
// so a single normalized shape keeps every page working unmodified.
// ---------------------------------------------------------------------------

interface DbInvoiceItemRow {
  id: string
  product_id: string | null
  description: string
  quantity: number
  unit_price: number
  line_total: number
}

interface DbInvoiceWithRelations extends DbInvoiceRow {
  invoice_items?: DbInvoiceItemRow[]
  customers?: { name: string } | null
}

// DB enum is 'unpaid' | 'partial' | 'paid' | 'overdue' | 'voided'; local union
// is 'unpaid' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'.
function mapDbStatus(status: DbInvoiceRow['status']): InvoiceStatus {
  if (status === 'partial') return 'partially_paid'
  if (status === 'voided') return 'cancelled'
  return status
}

function mapDbInvoice(row: DbInvoiceWithRelations): LocalInvoice {
  const items: InvoiceLineItem[] = (row.invoice_items ?? []).map((it) => ({
    productId: it.product_id ?? '',
    productName: it.description,
    sku: '',
    quantity: it.quantity,
    unitPrice: it.unit_price,
    lineTotal: it.line_total,
  }))

  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    saleId: row.sale_id ?? '',
    // Real invoices.* has no separate "sale reference" column - see
    // docs/MODULE_INTEGRATION_MAP.md gap.
    saleReference: '',
    customerId: row.customer_id,
    customerName: row.customers?.name ?? 'Walk-in Customer',
    items,
    subtotal: row.subtotal,
    discountAmount: row.discount_amount,
    taxAmount: row.tax_amount,
    totalAmount: row.total_amount,
    // Real invoices.* has no payment_method column (payment method lives on
    // the originating sale, not snapshotted onto the invoice) - default kept
    // for shape compatibility with the local Invoice type only.
    paymentMethod: 'cash',
    status: mapDbStatus(row.status),
    issuedAt: row.invoice_date,
    dueDate: row.due_date,
    paidAt: row.status === 'paid' ? row.updated_at : null,
    sentAt: null,
    cancelledAt: row.status === 'voided' ? row.updated_at : null,
    cancelReason: null,
    notes: row.notes ?? '',
    createdAt: row.created_at,
    createdBy: '',
  }
}

// listInvoices() (unlike getInvoice()) doesn't join customers(name), so
// fetch the names for whatever customer_ids came back in one extra query.
async function attachCustomerNames(rows: DbInvoiceWithRelations[], ctx: UserContext): Promise<DbInvoiceWithRelations[]> {
  const ids = Array.from(new Set(rows.map((r) => r.customer_id).filter((id): id is UUID => Boolean(id))))
  if (ids.length === 0) return rows
  const { data } = await supabase
    .schema('imagecare')
    .from('customers')
    .select('id, name')
    .eq('business_id', ctx.business_id)
    .in('id', ids)
  const nameMap = new Map((data ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))
  return rows.map((r) => (r.customer_id ? { ...r, customers: { name: nameMap.get(r.customer_id) ?? 'Customer' } } : r))
}

// ---------------------------------------------------------------------------
// Real, Supabase-backed hooks
// ---------------------------------------------------------------------------

export function useInvoices() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['invoices', 'list', ctx.business_id],
    queryFn: async () => {
      const rows = (await listInvoicesReal(ctx, {}, { page_size: 200 }).then(unwrap)) as DbInvoiceWithRelations[]
      const withNames = await attachCustomerNames(rows, ctx)
      return withNames.map(mapDbInvoice)
    },
  })
}

export function useInvoice(id: string | undefined) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['invoices', 'one', id, ctx.business_id],
    queryFn: async () => {
      const row = (await getInvoiceReal(ctx, id as UUID).then(unwrap)) as DbInvoiceWithRelations
      return mapDbInvoice(row)
    },
    enabled: Boolean(id),
  })
}

export function useInvoiceDashboardKpis() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['invoices', 'kpis', ctx.business_id],
    queryFn: async () => {
      const rows = (await listInvoicesReal(ctx, {}, { page_size: 200 }).then(unwrap)) as DbInvoiceRow[]
      const now = new Date()
      const thisMonth = rows.filter((r) => {
        const d = new Date(r.invoice_date)
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      })
      const outstanding = rows.filter((r) => r.status === 'unpaid' || r.status === 'partial' || r.status === 'overdue')
      const overdue = rows.filter((r) => r.status === 'overdue')
      // No paid_at column on the real invoice row; updated_at is used as a
      // proxy for "when it was paid" - see docs/MODULE_INTEGRATION_MAP.md gap.
      const paidThisMonth = rows.filter(
        (r) => r.status === 'paid' && new Date(r.updated_at).getFullYear() === now.getFullYear() && new Date(r.updated_at).getMonth() === now.getMonth(),
      )

      return {
        invoicedThisMonthUgx: thisMonth.filter((r) => r.status !== 'voided').reduce((sum, r) => sum + r.total_amount, 0),
        outstandingCount: outstanding.length,
        outstandingAmountUgx: outstanding.reduce((sum, r) => sum + r.balance_due, 0),
        overdueCount: overdue.length,
        paidThisMonthUgx: paidThisMonth.reduce((sum, r) => sum + r.total_amount, 0),
      }
    },
  })
}

export function useMarkInvoicePaid() {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const invoice = (await getInvoiceReal(ctx, id as UUID).then(unwrap)) as DbInvoiceRow
      await recordInvoicePayment(ctx, {
        invoice_id: id as UUID,
        amount: invoice.balance_due,
        payment_method: 'cash',
      }).then(unwrap)
    },
    onSuccess: () => invalidateAll(qc),
  })
}

// ---------------------------------------------------------------------------
// Local-only hooks - no real backend service exists for these operations yet.
// ---------------------------------------------------------------------------

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useInvoiceForSale(saleId: string | undefined) {
  return useQuery({
    queryKey: ['invoices', 'for-sale', saleId],
    queryFn: () => invoiceService.getInvoiceForSale(saleId as string),
    enabled: Boolean(saleId),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useUninvoicedSales() {
  return useQuery({ queryKey: ['invoices', 'uninvoiced-sales'], queryFn: invoiceService.listUninvoicedCompletedSales })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useGenerateInvoice(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ saleId, dueDate }: { saleId: string; dueDate: string | null }) => invoiceService.generateInvoice(saleId, dueDate, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useMarkInvoiceSent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => invoiceService.markInvoiceSent(id),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useCancelInvoice() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => invoiceService.cancelInvoice(id, reason),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useInvoiceSettings() {
  return useQuery({ queryKey: ['invoices', 'settings'], queryFn: invoiceService.getInvoiceSettings })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useSaveInvoiceSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: InvoiceSettings) => invoiceService.saveInvoiceSettings(input),
    onSuccess: () => invalidateAll(qc),
  })
}
