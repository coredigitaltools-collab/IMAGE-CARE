import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserContext } from '../../../context/AppContext'
import {
  getInvoice as getInvoiceReal,
  listInvoices as listInvoicesReal,
  recordInvoicePayment,
  generateInvoice as generateInvoiceReal,
  markInvoiceSent as markInvoiceSentReal,
  cancelInvoice as cancelInvoiceReal,
} from '../../../services/credit/creditService'
import { supabase } from '../../../lib/supabase'
import { getSetting, updateSetting } from '../../../services/settings/settingsService'
import * as invoiceService from '../../../services/invoiceService'
import type { InvoiceSettings, Invoice as LocalInvoice, InvoiceLineItem, InvoiceStatus } from '../../../types/invoices'
import type { Invoice as DbInvoiceRow, Sale as DbSaleRow, UUID } from '../../../types/database'
import type { Sale as LocalSale } from '../../../types/sales'
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

  // Real invoices.* has no dedicated "sent"/"cancel reason" columns -
  // markInvoiceSent()/cancelInvoice() (src/services/credit/creditService.ts)
  // record them in the extensible `metadata` JSONB column instead.
  const metadata = (row.metadata ?? {}) as { sent_at?: string; cancel_reason?: string }

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
    sentAt: metadata.sent_at ?? null,
    cancelledAt: row.status === 'voided' ? row.updated_at : null,
    cancelReason: metadata.cancel_reason ?? null,
    notes: row.notes ?? '',
    createdAt: row.created_at,
    createdBy: '',
  }
}

// Real sales use TransactionStatus ('draft' | 'confirmed' | 'cancelled' |
// 'voided'), not the local SaleStatus union - 'confirmed' is a fully
// posted/completed sale. Only the fields GenerateInvoiceModal actually
// renders (id/reference/totalAmount/createdAt) carry real data; the rest
// are filled with reasonable defaults purely to satisfy the shared local
// Sale shape the modal already expects.
function mapDbSaleToLocalSale(row: DbSaleRow): LocalSale {
  return {
    id: row.id,
    reference: row.sale_number,
    branchId: row.branch_id ?? null,
    customerId: row.customer_id,
    salesPersonId: row.served_by,
    items: [],
    subtotal: row.subtotal,
    discountPercent: 0,
    discountAmount: row.discount_amount,
    taxRateId: null,
    taxAmount: row.tax_amount,
    totalAmount: row.total_amount,
    paymentMethod: row.payment_method as LocalSale['paymentMethod'],
    amountTendered: row.amount_paid,
    changeDue: row.change_given,
    paymentReference: null,
    status: 'completed',
    refundReason: null,
    createdAt: row.created_at,
    createdBy: row.served_by ?? '',
    syncStatus: 'synced',
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
// Real, Supabase-backed hooks (Save-button audit 2026-09-01)
//
// useGenerateInvoice/useMarkInvoiceSent/useCancelInvoice used to call the
// LOCAL src/services/invoiceService.ts (IndexedDB): "Invoice a sale" wrote
// to a collection the real list above can never see (looked like the
// invoice vanished), and Mark Sent/Cancel looked up the real invoice's id
// inside that same local collection, which never contains it ("Invoice not
// found."). All three are now backed by the real functions added to
// src/services/credit/creditService.ts. useUninvoicedSales now queries real
// completed sales with no matching real invoices row, instead of local
// sales.
// ---------------------------------------------------------------------------

export function useUninvoicedSales() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['invoices', 'uninvoiced-sales', ctx.business_id],
    queryFn: async () => {
      const { data: invoicedRows, error: invErr } = await supabase
        .schema('imagecare')
        .from('invoices')
        .select('sale_id')
        .eq('business_id', ctx.business_id)
        .is('deleted_at', null)
      if (invErr) throw new Error(invErr.message ?? 'Failed to load invoices.')
      const invoicedSaleIds = new Set((invoicedRows ?? []).map((r) => r.sale_id).filter(Boolean))

      const { data: sales, error } = await supabase
        .schema('imagecare')
        .from('sales')
        .select('*')
        .eq('business_id', ctx.business_id)
        .eq('status', 'confirmed')
        .is('deleted_at', null)
        .order('sale_date', { ascending: false })
        .limit(200)
      if (error) throw new Error(error.message ?? 'Failed to load uninvoiced sales.')

      return (sales ?? [])
        .filter((s: DbSaleRow) => !invoicedSaleIds.has(s.id))
        .map(mapDbSaleToLocalSale)
    },
  })
}

export function useGenerateInvoice(_userId: string) {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ saleId, dueDate }: { saleId: string; dueDate: string | null }) =>
      generateInvoiceReal(ctx, { sale_id: saleId as UUID, due_date: dueDate }).then(unwrap),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useMarkInvoiceSent() {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => markInvoiceSentReal(ctx, id as UUID).then(unwrap),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useCancelInvoice() {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      cancelInvoiceReal(ctx, { id: id as UUID, reason }).then(unwrap),
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

// Footer text / due days, wired through the real generic key/value settings
// store (src/services/settings/settingsService.ts, read-only reference -
// not modified here) instead of the LOCAL invoiceService singleton, so a
// saved setting is visible from any device/session, not just this browser's
// IndexedDB.
const INVOICE_SETTINGS_CATEGORY = 'invoices'
const INVOICE_SETTINGS_KEY = 'settings'

function defaultInvoiceSettings(): InvoiceSettings {
  return { defaultDueDays: 14, footerText: 'Thank you for your business.', showTaxBreakdown: true, showLogo: true }
}

export function useInvoiceSettings() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['invoices', 'settings', ctx.business_id],
    queryFn: async () => {
      const res = await getSetting(ctx, INVOICE_SETTINGS_CATEGORY, INVOICE_SETTINGS_KEY)
      if (res.error) throw new Error(res.error.message)
      return (res.data as InvoiceSettings | null) ?? defaultInvoiceSettings()
    },
  })
}

export function useSaveInvoiceSettings() {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: InvoiceSettings) => {
      const res = await updateSetting(ctx, INVOICE_SETTINGS_CATEGORY, INVOICE_SETTINGS_KEY, input)
      if (res.error) throw new Error(res.error.message)
      return input
    },
    onSuccess: () => invalidateAll(qc),
  })
}
