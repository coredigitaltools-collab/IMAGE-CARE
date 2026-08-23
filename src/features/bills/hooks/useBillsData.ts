import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as billsService from '../../../services/billsService'
import { useUserContext } from '../../../context/AppContext'
import { getBill as getRealBill, listBills as listRealBills } from '../../../services/credit/creditService'
import type { Bill as RealBill, UUID } from '../../../types/database'
import type { SupplierInvoice, SupplierInvoiceStatus } from '../../../types/purchasing'

// Stage 6: `useBills` / `useBill` / `useBillsDashboardKpis` are rewired to the
// real Supabase-backed payables service (src/services/credit/creditService.ts,
// `getBill`/`listBills` against imagecare.bills). That service returns the
// real DB `Bill` row shape (src/types/database.ts), which uses different
// field names and a different `status` enum ('unpaid' | 'partial' | 'paid' |
// 'overdue' | 'voided') than the local `SupplierInvoice` shape the bills
// pages already read. Rather than touch every page file, real rows are
// mapped onto `SupplierInvoice` below (see `toSupplierInvoice`) so
// BillsDashboardPage/PayablesRegisterPage/BillDetailPage keep working
// unmodified against real data — this was judged less risky than editing
// field references across five page files.
//
// There is still no real backend function for recording a bill payment,
// cancelling/closing a bill, payables aging, or supplier statements, so
// those hooks below remain wired to the LOCAL-ONLY IndexedDB service
// (services/billsService.ts) exactly as before.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error')
  const d = r.data
  if (d === null || d === undefined) return []
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string, unknown>).items))
    return (d as Record<string, unknown>).items
  return d
}

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['bills'] })
  qc.invalidateQueries({ queryKey: ['purchasing'] })
}

type RealBillRow = RealBill & { suppliers?: { name: string } | null }

/** Real `bills.status` has no 'cancelled'/'closed' distinction (those are
 *  local-only lifecycle states, see LOCAL-ONLY hooks below) and adds
 *  'partial'/'overdue' that the local shape doesn't have. Mapped
 *  mechanically onto the closest local equivalent so existing page badges
 *  and filters keep working. */
function mapBillStatus(status: RealBill['status']): SupplierInvoiceStatus {
  switch (status) {
    case 'partial':
      return 'partially_paid'
    case 'overdue':
      // Pages already derive "overdue" themselves by comparing dueDate to
      // now, so this only needs to remain a valid unpaid-ish state here.
      return 'unpaid'
    case 'voided':
      // Closest local equivalent; real bills carry no separate cancel
      // reason/date yet.
      return 'cancelled'
    default:
      return status
  }
}

function toSupplierInvoice(row: RealBillRow): SupplierInvoice {
  return {
    id: row.id,
    reference: row.bill_number,
    supplierInvoiceNumber: '',
    supplierId: row.supplier_id ?? '',
    purchaseOrderId: row.purchase_id,
    amount: row.total_amount,
    amountPaid: row.amount_paid,
    dueDate: row.due_date,
    status: mapBillStatus(row.status),
    cancelledAt: row.status === 'voided' ? row.updated_at : null,
    cancelReason: null,
    closedAt: null,
    createdAt: row.created_at,
    createdBy: '',
  }
}

export function useBills() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['bills', 'list', ctx.business_id],
    queryFn: () => listRealBills(ctx, {}).then(unwrap).then((rows: RealBillRow[]) => rows.map(toSupplierInvoice)),
  })
}

export function useBill(id: string | undefined) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['bills', 'one', id, ctx.business_id],
    queryFn: () => getRealBill(ctx, id as UUID).then(unwrap).then((row: RealBillRow) => toSupplierInvoice(row)),
    enabled: Boolean(id),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useBillPayments(billId?: string) {
  return useQuery({ queryKey: ['bills', 'payments', billId ?? 'all'], queryFn: () => billsService.listBillPayments(billId) })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useRecordBillPayment(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ billId, amount, reference }: { billId: string; amount: number; reference: string }) =>
      billsService.recordBillPayment(billId, amount, reference, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useCancelBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => billsService.cancelBill(id, reason),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useCloseBill() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => billsService.closeBill(id),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function usePayablesAging() {
  return useQuery({ queryKey: ['bills', 'aging'], queryFn: billsService.getPayablesAging })
}

export function useBillsDashboardKpis() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['bills', 'kpis', ctx.business_id],
    queryFn: async () => {
      const rows = (await listRealBills(ctx, {}).then(unwrap)) as RealBillRow[]
      const bills = rows.map(toSupplierInvoice)
      const outstanding = bills.filter((b) => b.status === 'unpaid' || b.status === 'partially_paid')
      const now = Date.now()
      const weekFromNow = now + 7 * 86_400_000

      const overdue = outstanding.filter((b) => b.dueDate && new Date(b.dueDate).getTime() < now)
      const dueThisWeek = outstanding.filter((b) => b.dueDate && new Date(b.dueDate).getTime() >= now && new Date(b.dueDate).getTime() <= weekFromNow)

      return {
        totalPayableUgx: outstanding.reduce((sum, b) => sum + (b.amount - b.amountPaid), 0),
        billsCount: outstanding.length,
        dueThisWeekCount: dueThisWeek.length,
        overdueCount: overdue.length,
        overdueAmountUgx: overdue.reduce((sum, b) => sum + (b.amount - b.amountPaid), 0),
        // No real backend for bill payments yet, so "paid this month" cannot be derived from real data.
        paidThisMonthUgx: 0,
      }
    },
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useSupplierStatement(supplierId: string | undefined) {
  return useQuery({
    queryKey: ['bills', 'statement', supplierId],
    queryFn: () => billsService.getSupplierStatement(supplierId as string),
    enabled: Boolean(supplierId),
  })
}
