import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as salesTargetsService from '../../../services/salesTargetsService'
import * as salesTargetsRealService from '../../../services/salesTargets/salesTargetsService'
import { listStaff as listStaffReal } from '../../../services/settings/settingsService'
import { listBranches as listBranchesReal } from '../../../services/masterData/masterDataService'
import { useUserContext } from '../../../context/AppContext'
import type { UserContext } from '../../../types/app'
import type { SalesTarget, SalesTargetInput, SalesTargetsSettings } from '../../../types/salesTargets'
import type { TargetsDashboardData, LeaderboardRow, NearingTargetAlert } from '../../../services/salesTargetsService'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['sales-targets'] })
}

// ---------------------------------------------------------------------------
// Real-backend rewire (save-button repair pass, extended 2026-09-05):
//
// imagecare.sales_targets exists as a real table (business_id, branch_id,
// user_id, period_start, period_end, target_amount, target_type, notes -
// see database/migrations/0011_stage2_supporting_domains.sql) with RLS
// enabled. createTarget/deleteTarget write to it for real, via
// services/salesTargets/salesTargetsService.ts, for BRANCH, STAFF, and
// (as of migration 0032_stage9_salestargets_business_scope.sql) BUSINESS
// scoped targets too - branches and staff both come from the real
// Settings data already (see useBranches/useStaff in
// features/settings/hooks/useSettingsData.ts), so branchId/staffId picked
// in the New Target modal are always valid real ids.
//
// Bug fix (2026-09-05): "let's go to sales target, the dashboard does not
// show anything" - the target itself DID save for real, but every derived
// view below (dashboard/leaderboard/nearing-completion/progress) used to
// read ONLY the old local-only store (services/salesTargetsService.ts)
// and compute achievement against a fake, purely-local sales list, so a
// real target could never show real progress. They now all merge real +
// legacy-local targets (listMergedTargets, unchanged) and compute
// achievement for EVERY merged target against real imagecare.sales via
// services/salesTargets/salesTargetsService.ts's getAllProgress() - which
// only needs the target's own scope/branchId/staffId/period, so it works
// the same whether the target row itself is real or legacy-local. Staff
// and branch display names now come from the real Settings/master-data
// services too, not the old local staffService/branchService. See
// claude/sales-targets-dashboard-fix-2026-09-05.md.
//
// Because targets can now live in either store, every read that lists
// targets merges both, and delete tries the real store first, falling
// back to local only when the real delete legitimately matched no row
// (see useDeleteTarget) - otherwise a target created for real would
// either never show up, or "delete" would silently do nothing.
// ---------------------------------------------------------------------------

async function listMergedTargets(ctx: UserContext): Promise<SalesTarget[]> {
  const [local, real] = await Promise.all([salesTargetsService.listTargets(), salesTargetsRealService.listTargets(ctx)])
  const realTargets = real.success && real.data ? real.data : []
  return [...local, ...realTargets].sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime())
}

async function realStaffNames(ctx: UserContext): Promise<Map<string, string>> {
  const resp = await listStaffReal(ctx)
  const map = new Map<string, string>()
  if (resp.success && resp.data) resp.data.forEach((s) => map.set(s.id, s.fullName))
  return map
}

async function realBranchNames(ctx: UserContext): Promise<Map<string, string>> {
  const resp = await listBranchesReal(ctx)
  const map = new Map<string, string>()
  if (resp.success && resp.data) resp.data.forEach((b) => map.set(b.id, b.name))
  return map
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
      return salesTargetsRealService.getAllProgress(ctx, targets)
    },
  })
}

export function useCreateTarget(_userId: string) {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: SalesTargetInput) => {
      const result = await salesTargetsRealService.createTarget(ctx, input)
      if (!result.success) throw new Error(result.error?.message ?? 'Could not create this target.')
      return result.data
    },
    onSuccess: () => invalidateAll(qc),
  })
}

// Feature request (2026-09-07): "i want to be able to delete and edit a
// target" - same real-then-legacy-local fallback pattern as
// useDeleteTarget below, so an edit works regardless of which store the
// target actually lives in.
export function useUpdateTarget() {
  const ctx = useUserContext()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: Pick<SalesTargetInput, 'periodStart' | 'periodEnd' | 'targetAmountUgx'> }) => {
      const result = await salesTargetsRealService.updateTarget(ctx, id, input)
      if (result.success) return result.data
      if (result.error?.code === 'RESOURCE_NOT_FOUND') {
        // Not a real row - this target only ever existed locally (a
        // legacy business-wide one from before 2026-09-05). Update it there.
        return salesTargetsService.updateTarget(id, input)
      }
      throw new Error(result.error?.message ?? 'Could not update this target.')
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
      // locally (a legacy business-wide one from before 2026-09-05), delete
      // it there.
      await salesTargetsService.deleteTarget(id)
    },
    onSuccess: () => invalidateAll(qc),
  })
}

async function computeDashboardData(ctx: UserContext): Promise<TargetsDashboardData> {
  const targets = await listMergedTargets(ctx)
  const [allProgress, staffNames, branchNames] = await Promise.all([
    salesTargetsRealService.getAllProgress(ctx, targets),
    realStaffNames(ctx),
    realBranchNames(ctx),
  ])
  const currentAll = allProgress.filter((p) => salesTargetsRealService.isCurrentPeriod(p.target))

  const currentBusiness = currentAll.find((p) => p.target.scope === 'business') ?? null

  const staffProgress = currentAll.filter((p) => p.target.scope === 'staff').sort((a, b) => b.achievementPercent - a.achievementPercent)
  const topStaff = staffProgress[0]
  const topPerformer = topStaff
    ? {
        name: staffNames.get(topStaff.target.staffId ?? '') ?? 'Unknown staff',
        achievedUgx: topStaff.achievedUgx,
        achievementPercent: topStaff.achievementPercent,
      }
    : null

  const branchProgress = currentAll.filter((p) => p.target.scope === 'branch').sort((a, b) => b.achievementPercent - a.achievementPercent)
  const topBranch = branchProgress[0]
  const bestBranch = topBranch
    ? {
        name: branchNames.get(topBranch.target.branchId ?? '') ?? 'Unknown branch',
        achievedUgx: topBranch.achievedUgx,
        achievementPercent: topBranch.achievementPercent,
      }
    : null

  return { current: currentBusiness, topPerformer, bestBranch }
}

export function useTargetsDashboardData() {
  const ctx = useUserContext()
  return useQuery({ queryKey: ['sales-targets', 'dashboard', ctx.business_id], queryFn: () => computeDashboardData(ctx) })
}

async function computeLeaderboard(ctx: UserContext, scope: 'staff' | 'branch'): Promise<LeaderboardRow[]> {
  const targets = await listMergedTargets(ctx)
  const [allProgress, staffNames, branchNames] = await Promise.all([
    salesTargetsRealService.getAllProgress(ctx, targets),
    realStaffNames(ctx),
    realBranchNames(ctx),
  ])
  const rows = allProgress.filter((p) => p.target.scope === scope && salesTargetsRealService.isCurrentPeriod(p.target))

  return rows
    .map((p) => ({
      id: scope === 'staff' ? (p.target.staffId as string) : (p.target.branchId as string),
      name:
        scope === 'staff'
          ? (staffNames.get(p.target.staffId ?? '') ?? 'Unknown staff')
          : (branchNames.get(p.target.branchId ?? '') ?? 'Unknown branch'),
      achievedUgx: p.achievedUgx,
      targetAmountUgx: p.target.targetAmountUgx,
      achievementPercent: p.achievementPercent,
    }))
    .sort((a, b) => b.achievementPercent - a.achievementPercent)
}

export function useLeaderboard(scope: 'staff' | 'branch') {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['sales-targets', 'leaderboard', scope, ctx.business_id],
    queryFn: () => computeLeaderboard(ctx, scope),
  })
}

export function useSalesTargetsSettings() {
  return useQuery({ queryKey: ['sales-targets', 'settings'], queryFn: salesTargetsService.getSalesTargetsSettings })
}

export function useSaveSalesTargetsSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SalesTargetsSettings) => salesTargetsService.saveSalesTargetsSettings(input),
    onSuccess: () => invalidateAll(qc),
  })
}

async function computeNearingCompletion(ctx: UserContext): Promise<NearingTargetAlert[]> {
  const [settings, targets, staffNames, branchNames] = await Promise.all([
    salesTargetsService.getSalesTargetsSettings(),
    listMergedTargets(ctx),
    realStaffNames(ctx),
    realBranchNames(ctx),
  ])
  const allProgress = await salesTargetsRealService.getAllProgress(ctx, targets)

  return allProgress
    .filter(
      (p) =>
        salesTargetsRealService.isCurrentPeriod(p.target) &&
        p.achievementPercent >= settings.notifyAtPercent &&
        p.achievementPercent < 100,
    )
    .map((p) => ({
      targetId: p.target.id,
      label:
        p.target.scope === 'business'
          ? 'Business-wide target'
          : p.target.scope === 'branch'
            ? `${branchNames.get(p.target.branchId ?? '') ?? 'Branch'} target`
            : `${staffNames.get(p.target.staffId ?? '') ?? 'Staff'} target`,
      achievementPercent: p.achievementPercent,
    }))
}

export function useTargetsNearingCompletion() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['sales-targets', 'nearing-completion', ctx.business_id],
    queryFn: () => computeNearingCompletion(ctx),
  })
}
