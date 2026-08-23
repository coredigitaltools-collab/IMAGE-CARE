import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as salesTargetsService from '../../../services/salesTargetsService'
import type { SalesTargetInput, SalesTargetsSettings } from '../../../types/salesTargets'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['sales-targets'] })
}

// ---------------------------------------------------------------------------
// Real-backend investigation (Stage 6 module restoration pass):
//
// imagecare.sales_targets exists as a real table (business_id, branch_id,
// user_id, period_start, period_end, target_amount, target_type, notes -
// see database/migrations/0011_stage2_supporting_domains.sql) with RLS
// enabled, but no service function anywhere under src/services/ performs
// CRUD against it - there is no listSalesTargets/createSalesTarget/etc. in
// src/services/reporting/reportingService.ts or elsewhere. The only
// Supabase-backed hook that mentions "sales targets" is
// src/hooks/modules/useModuleHooks.ts's useSalesTargets(), but it never
// touches imagecare.sales_targets: it only calls getDashboardKPIs() and
// getSalesByPeriod() from reportingService.ts, i.e. general sales
// performance figures, not target-vs-actual tracking against a stored
// target row.
//
// Every hook below - including useTargetsDashboardData - ultimately needs a
// real target_amount value scoped to a business/branch/staff and period
// (see SalesTargetsDashboardPage's data.current.target.targetAmountUgx,
// TargetsListPage/TargetReportsPage's per-target progress rows, and
// LeaderboardPage's per-staff/per-branch target ranking). Since no real
// backend service creates or reads those target rows, there is no honest
// way to wire any of these to Supabase without fabricating target numbers
// that don't exist in a real, queryable place. Every export below therefore
// stays LOCAL-ONLY (still backed by the local IndexedDB-only
// salesTargetsService), each tagged per docs/MODULE_INTEGRATION_MAP.md.
// ---------------------------------------------------------------------------

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useTargets() {
  return useQuery({ queryKey: ['sales-targets', 'list'], queryFn: salesTargetsService.listTargets })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useAllTargetProgress() {
  return useQuery({ queryKey: ['sales-targets', 'progress'], queryFn: salesTargetsService.getAllProgress })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useCreateTarget(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SalesTargetInput) => salesTargetsService.createTarget(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useDeleteTarget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => salesTargetsService.deleteTarget(id),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
// Not just a reachability gap: SalesTargetsDashboardPage renders
// data.current.target.targetAmountUgx plus per-staff/per-branch
// achievementPercent, none of which can be derived honestly from
// getDashboardKPIs()/getSalesByPeriod() (general sales performance) without
// a real target_amount row to compare against.
export function useTargetsDashboardData() {
  return useQuery({ queryKey: ['sales-targets', 'dashboard'], queryFn: salesTargetsService.getTargetsDashboardData })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useLeaderboard(scope: 'staff' | 'branch') {
  return useQuery({ queryKey: ['sales-targets', 'leaderboard', scope], queryFn: () => salesTargetsService.getLeaderboard(scope) })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useSalesTargetsSettings() {
  return useQuery({ queryKey: ['sales-targets', 'settings'], queryFn: salesTargetsService.getSalesTargetsSettings })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useSaveSalesTargetsSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SalesTargetsSettings) => salesTargetsService.saveSalesTargetsSettings(input),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useTargetsNearingCompletion() {
  return useQuery({ queryKey: ['sales-targets', 'nearing-completion'], queryFn: salesTargetsService.getTargetsNearingCompletion })
}
