import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useUserContext } from '../../../context/AppContext'
import { useBranches } from '../../../features/settings/hooks/useSettingsData'
import { getDashboardKPIs, getStockSummary } from '../../../services/reporting/reportingService'
import { getInventoryMovements } from '../../../services/inventory/inventoryService'
import { convertFromUgx } from '../../../lib/currency'
import type { SupportedCurrency } from '../../../lib/currency'
import type { UserContext, DateRange } from '../../../types/app'
import type { BranchRecord } from '../../../types/settings'
import type { DashboardKPIs, InventoryMovement, MovementType, StockSummaryRow, UUID } from '../../../types/database'
// Reuse the local-service's row/KPI shapes only for their field names - the
// branchOverview pages (src/pages/branchOverview/*.tsx) were written against
// these shapes and are not being touched, so whatever produces the data has
// to keep matching them exactly.
import type { BranchOverviewDashboardKpis, BranchOverviewRow } from '../../../services/branchOverviewService'

// Same unwrap() shape as src/features/invoices/hooks/useInvoicesData.ts: throws on
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

/** The same permission logic the main Dashboard and Inventory Dashboard
 *  use: Owners see every active branch (IMP-002, unrestricted access);
 *  anyone else is limited to the branches actually granted to them.
 *  Unlike the old local version of this hook, this reads that grant list
 *  from the real, backend-issued UserContext.branches (ctx.is_owner /
 *  ctx.branches) rather than the role-label-based AuthedUser shim - per
 *  src/types/app.ts, "role" is a display label only and is never supposed
 *  to be checked for authorization. */
export function useVisibleBranches() {
  const ctx = useUserContext()
  const branchesQuery = useBranches()
  const visibleBranches = useMemo(() => {
    const active = (branchesQuery.data ?? []).filter((b) => b.is_active)
    if (ctx.is_owner) return active
    const allowedIds = new Set(ctx.branches.map((b) => b.branch_id))
    return active.filter((b) => allowedIds.has(b.id))
  }, [branchesQuery.data, ctx.is_owner, ctx.branches])
  return { visibleBranches, isLoading: branchesQuery.isLoading }
}

// ---------------------------------------------------------------------------
// Real, Supabase-backed data (IMC-SRS-020)
//
// "Branch data aggregates automatically" / "respect user permissions": the
// same real reporting endpoints the main Dashboard uses (see SRS-020 in
// src/hooks/modules/useModuleHooks.ts) - getDashboardKPIs and getStockSummary
// from src/services/reporting/reportingService.ts, plus getInventoryMovements
// from src/services/inventory/inventoryService.ts - called once per visible
// branch instead of once for "all branches", so each row can be attributed
// to a branch the way these pages need.
// ---------------------------------------------------------------------------

// getDashboardKPIs/getInventoryMovements both take a date range; these pages
// present "all-time" figures (see PerformanceComparisonPage/SalesByBranchPage/
// BranchReportsPage copy), so the range is pinned wide rather than to a
// calendar period.
const ALL_TIME_RANGE: DateRange = {
  from: new Date(2000, 0, 1).toISOString(),
  to: new Date().toISOString(),
}

// InventoryMovement has no "direction" flag of its own - direction is
// implied by movement_type. This mirrors the categorisation the old local
// StockMovement model made explicit via a signed quantityChange.
const IN_MOVEMENT_TYPES = new Set<MovementType>(['purchase', 'adjustment_in', 'transfer_in', 'return_in', 'opening_stock'])
const OUT_MOVEMENT_TYPES = new Set<MovementType>(['sale', 'adjustment_out', 'transfer_out', 'return_out', 'damage', 'expiry'])

async function fetchBranchOverviewRow(ctx: UserContext, branch: BranchRecord): Promise<BranchOverviewRow> {
  const [kpis, movements] = await Promise.all([
    getDashboardKPIs(ctx, branch.id as UUID, ALL_TIME_RANGE).then(unwrap) as Promise<DashboardKPIs>,
    // Capped at the service's MAX_PAGE_SIZE (200) most-recent movements per
    // branch rather than looping every cursor page - see
    // src/services/inventory/inventoryService.ts getInventoryMovements.
    getInventoryMovements(ctx, { branch_id: branch.id as UUID }, { page_size: 200 }).then(unwrap) as Promise<InventoryMovement[]>,
  ])

  let stockInUnits = 0
  let stockOutUnits = 0
  for (const m of movements) {
    if (IN_MOVEMENT_TYPES.has(m.movement_type)) stockInUnits += Math.abs(m.quantity)
    else if (OUT_MOVEMENT_TYPES.has(m.movement_type)) stockOutUnits += Math.abs(m.quantity)
  }

  return {
    branchId: branch.id,
    branchName: branch.name,
    totalSalesUgx: kpis.revenue,
    transactionCount: kpis.sale_count,
    stockInUnits,
    stockOutUnits,
  }
}

function fetchBranchOverviewRows(ctx: UserContext, branches: BranchRecord[]): Promise<BranchOverviewRow[]> {
  return Promise.all(branches.map((branch) => fetchBranchOverviewRow(ctx, branch)))
}

export function useBranchOverview() {
  const ctx = useUserContext()
  const { visibleBranches, isLoading: branchesLoading } = useVisibleBranches()
  const query = useQuery({
    queryKey: ['branch-overview', 'rows', ctx.business_id, visibleBranches.map((b) => b.id).join(',')],
    queryFn: () => fetchBranchOverviewRows(ctx, visibleBranches),
    enabled: !branchesLoading,
  })
  return { ...query, isLoading: branchesLoading || query.isLoading }
}

export function useBranchOverviewDashboardKpis(currency: SupportedCurrency) {
  const ctx = useUserContext()
  const { visibleBranches, isLoading: branchesLoading } = useVisibleBranches()
  const query = useQuery({
    queryKey: ['branch-overview', 'kpis', ctx.business_id, currency, visibleBranches.map((b) => b.id).join(',')],
    queryFn: async (): Promise<BranchOverviewDashboardKpis> => {
      const [rows, stockRows] = await Promise.all([
        fetchBranchOverviewRows(ctx, visibleBranches),
        getStockSummary(ctx, undefined).then(unwrap) as Promise<StockSummaryRow[]>,
      ])
      const sorted = [...rows].sort((a, b) => b.totalSalesUgx - a.totalSalesUgx)

      return {
        branchCount: rows.length,
        totalSalesUgx: rows.reduce((sum, r) => sum + r.totalSalesUgx, 0),
        bestBranchName: sorted[0] && sorted[0].totalSalesUgx > 0 ? sorted[0].branchName : null,
        // Inventory value is business-wide from vw_stock_summary, not
        // re-derived per branch, same as the local version this replaces.
        totalInventoryValueUgx: convertFromUgx(stockRows.reduce((sum, row) => sum + row.stock_value, 0), currency),
      }
    },
    enabled: !branchesLoading,
  })
  return { ...query, isLoading: branchesLoading || query.isLoading }
}
