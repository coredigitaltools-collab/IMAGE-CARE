import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as salesTargetsService from '../../../services/salesTargetsService'
import * as salesTargetsRealService from '../../../services/salesTargets/salesTargetsService'
import { useUserContext } from '../../../context/AppContext'
import type { UserContext } from '../../../types/app'
import type { SalesTarget, SalesTargetInput, SalesTargetsSettings } from '../../../types/salesTargets'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['sales-targets'] })
}

// ---------------------------------------------------------------------------
// Real-backend rewire (save-button repair pass):
//
// imagecare.sales_targets exists as a real table (business_id, branch_id,
// user_id, period_start, period_end, target_amount, target_type, notes -
// see database/migrations/0011_stage2_supporting_domains.sql) with RLS
// enabled. createTarget/deleteTarget now write to it for real, via
// services/salesTargets/salesTargetsService.ts, for BRANCH and STAFF
// scoped targets - the common, accountable case (branches and staff both
// come from the real Settings data already, see useBranches/useStaff in
// features/settings/hooks/useSettingsData.ts, so branchId/staffId picked
// in the New Target modal are always valid real ids).
//
// BUSINESS-wide targets are the one case that table cannot represent:
// chk_s2_target_scope requires branch_id or user_id to be set, so a
// business-wide row (both null) is rejected by the database. Since
// "Business-wide" is the modal's default option, useCreateTarget below
// routes that one scope to the existing local IndexedDB store instead of
// turning the default action into an error.
//
// Because targets can now live in either store, every read that lists
// targets (useTargets, useAllTargetProgress) merges both, and delete
// tries the real store first, falling back to local only when the real
// delete legitimately matched no row (see useDeleteTarget) - otherwise a
// target created for real would either never show up, or "delete"
// would silently do nothing. useTargetsDashboardData/useLeaderboard/
// useTargetsNearingCompletion stay LOCAL-ONLY (lower-priority derived
// views, not the save path this pass is about; still tagged per
// docs/MODULE_INTEGRATION_MAP.md).
// ---------------------------------------------------------------------------

async function listMergedTargets(ctx: UserContext): Promise<SalesTarget[]> {
  const [local, real] = await Promise.all([salesTargetsService.listTargets(), salesTargetsRealService.listTargets(ctx)])
  const realTargets = real.success && real.data ? real.data : []
  return [...local, ...realTargets].sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime())
}

export function useTargets() {
  const ctx = useUserContext()
  return useQuery({ queryKey: ['sales-targets', 'list', ctx.business_id], queryFn: () => listMergedTargets(ctx) })
}

export function useAllTargetProgress() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['sales-targets', 'progress', ctx.business_id],
    queryFn: async () => {
      const targets = await listMergedTargets(ctx)
      return Promise.all(targets.map((t) => salesTargetsService.getTargetProgress(t)))
    },
  })
}

export function useCreateTarget(userId: string) {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SalesTargetInput) => {
      if (input.scope === 'business') return salesTargetsService.createTarget(input, userId)
      const result = await salesTargetsRealService.createTarget(ctx, input)
      if (!result.success) throw new Error(result.error?.message ?? 'Could not create this target.')
      return result.data
    },
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDeleteTarget() {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const result = await salesTargetsRealService.deleteTarget(ctx, id)
      if (result.success && result.data?.deleted) return
      if (!result.success) throw new Error(result.error?.message ?? 'Could not delete this target.')
      // Ran fine but matched no real row - this target only ever existed
      // locally (e.g. a business-wide one), delete it there.
      await salesTargetsService.deleteTarget(id)
    },
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
