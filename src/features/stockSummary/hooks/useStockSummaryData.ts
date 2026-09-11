import { useQuery } from '@tanstack/react-query'
import { useUserContext } from '../../../context/AppContext'
import { getStockSummary } from '../../../services/reporting/reportingService'
import * as stockSummaryService from '../../../services/stockSummaryService'
import { convertFromUgx, type SupportedCurrency } from '../../../lib/currency'
import type { StockSummaryRow as DbStockRow } from '../../../types/database'

// Same unwrap() shape as src/features/invoices/hooks/useInvoicesData.ts: throws
// on a ServiceResponse error, unwraps a PagedResponse's `.items`, otherwise
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
// Mapping: real imagecare.vw_stock_summary rows (via reportingService's
// getStockSummary, the same query useStockSummary()/useBranchOverview() in
// src/hooks/modules/useModuleHooks.ts use) -> the local shapes the
// stockSummary pages already render against (src/services/stockSummaryService.ts's
// exported interfaces, kept as-is for shape compatibility since there is no
// dedicated src/types/stockSummary.ts).
//
// vw_stock_summary is one row per (branch, product): quantity_on_hand,
// stock_value and stock_status are all branch-scoped. The stockSummary pages
// (Dashboard KPIs, Current Stock) were written against a business-wide,
// single-number-per-product view of stock (see stockSummaryService.ts's own
// comment: "Product.currentStock is a single number, not split per branch").
// To keep those pages working unmodified, real rows are aggregated by
// product_id below - summing quantity_on_hand and stock_value across branches
// - and stock status is recomputed from the aggregate, rather than trusting
// any single branch's stock_status.
// ---------------------------------------------------------------------------

interface AggregatedProductStock {
  productId: string
  productName: string
  sku: string
  quantityOnHand: number
  reorderLevel: number
  stockValueUgx: number
}

function aggregateByProduct(rows: DbStockRow[]): AggregatedProductStock[] {
  const byProduct = new Map<string, AggregatedProductStock>()
  for (const row of rows) {
    const existing = byProduct.get(row.product_id)
    if (existing) {
      existing.quantityOnHand += row.quantity_on_hand
      existing.stockValueUgx += row.stock_value
    } else {
      byProduct.set(row.product_id, {
        productId: row.product_id,
        productName: row.product_name,
        sku: row.sku ?? '',
        quantityOnHand: row.quantity_on_hand,
        // reorder_level is a per-product setting that should be constant
        // across branches - taking the first row's value is correct as long
        // as that holds.
        reorderLevel: row.reorder_level,
        stockValueUgx: row.stock_value,
      })
    }
  }
  return Array.from(byProduct.values())
}

// Same thresholds as stockSummaryService.ts's stockStatus(), reapplied to the
// aggregated (business-wide) quantity rather than a single branch's.
function aggregateStatus(quantityOnHand: number, reorderLevel: number): 'ok' | 'low' | 'out' {
  if (quantityOnHand <= 0) return 'out'
  if (quantityOnHand <= reorderLevel) return 'low'
  return 'ok'
}

// ---------------------------------------------------------------------------
// Real, Supabase-backed hooks
// ---------------------------------------------------------------------------

export function useStockSummaryDashboardKpis(currency: SupportedCurrency) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['stock-summary', 'kpis', ctx.business_id, currency],
    queryFn: async (): Promise<stockSummaryService.StockSummaryDashboardKpis> => {
      // No branchId -> all branches, same as useBranchOverview()'s
      // getStockSummary(ctx, undefined) call in useModuleHooks.ts.
      const rows = (await getStockSummary(ctx, undefined).then(unwrap)) as DbStockRow[]
      const products = aggregateByProduct(rows)

      const totalInventoryValueUgx = rows.reduce((sum, r) => sum + r.stock_value, 0)
      const lowStockCount = products.filter((p) => aggregateStatus(p.quantityOnHand, p.reorderLevel) === 'low').length
      const outOfStockCount = products.filter((p) => aggregateStatus(p.quantityOnHand, p.reorderLevel) === 'out').length

      return {
        totalInventoryValue: convertFromUgx(totalInventoryValueUgx, currency),
        stockItemsCount: products.length,
        lowStockCount,
        outOfStockCount,
        // vw_stock_summary is a current-snapshot view - it carries no
        // movement/date data, so "today's" in/out has no real source here.
        // Computing it for real would mean summing inventoryService's
        // getInventoryMovements() across every branch for today, which is a
        // paginated, per-branch cursor API not built for that aggregate and
        // would silently undercount past its page size - worse than being
        // honest. Left at 0 rather than inventing a figure (see
        // docs/MODULE_INTEGRATION_MAP.md gap).
        todaysStockIn: 0,
        todaysStockOut: 0,
      }
    },
  })
}

export function useCurrentStockSummary() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['stock-summary', 'current-stock', ctx.business_id],
    queryFn: async (): Promise<stockSummaryService.CurrentStockRow[]> => {
      const rows = (await getStockSummary(ctx, undefined).then(unwrap)) as DbStockRow[]
      const products = aggregateByProduct(rows)

      return products
        .map((p) => ({
          id: p.productId,
          name: p.productName,
          sku: p.sku,
          currentStock: p.quantityOnHand,
          reorderLevel: p.reorderLevel,
          status: aggregateStatus(p.quantityOnHand, p.reorderLevel),
        }))
        .sort((a, b) => a.currentStock - b.currentStock)
    },
  })
}

// ---------------------------------------------------------------------------
// Local-only hooks - no real backend service exists for these operations yet.
// ---------------------------------------------------------------------------

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
//
// Branch Comparison reports stock *movement* (units/value in and out per
// branch, all-time), not a stock-on-hand count - see
// stockSummaryService.getBranchComparison()'s own comment. That needs each
// branch's history of stock movements broken out by direction (in vs out),
// which vw_stock_summary genuinely doesn't carry: it is a current-quantity
// snapshot per (branch, product), with no movement-type or historical
// breakdown. The real equivalent would be inventoryService.getInventoryMovements()
// summed per branch across all history, which is a paginated, per-branch
// cursor API (fn_list_inventory_movements_cursor) - not a fit for a
// dashboard-style aggregate, and looping every branch through it here would
// invent a figure this hook can't guarantee is complete rather than
// reporting real data. Left calling the local service until a real
// per-branch movement aggregate exists.
export function useBranchComparison(currency: SupportedCurrency) {
  return useQuery({
    queryKey: ['stock-summary', 'branch-comparison', currency],
    queryFn: () => stockSummaryService.getBranchComparison(currency),
  })
}
