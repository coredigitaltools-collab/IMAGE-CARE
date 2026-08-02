import { getCollection, setCollection, getSingleton, setSingleton, enqueueSync } from '../lib/localStore'
import { listSales } from './salesService'
import { listStaff } from './staffService'
import { listBranches } from './branchService'
import type { Sale } from '../types/sales'
import type { SalesTarget, SalesTargetInput, SalesTargetsSettings, TargetProgress } from '../types/salesTargets'

const KEY = 'sales-targets:targets'
const SETTINGS_KEY = 'sales-targets:settings'

function seedSalesTargetsSettings(): SalesTargetsSettings {
  return { notifyAtPercent: 80 }
}

export async function getSalesTargetsSettings(): Promise<SalesTargetsSettings> {
  return getSingleton(SETTINGS_KEY, seedSalesTargetsSettings)
}

export async function saveSalesTargetsSettings(input: SalesTargetsSettings): Promise<SalesTargetsSettings> {
  await setSingleton(SETTINGS_KEY, input)
  await enqueueSync({ entityType: 'sales_targets_settings', entityId: 'singleton', operation: 'update' })
  return input
}

export class InvalidTargetScopeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidTargetScopeError'
  }
}
export class OverlappingTargetError extends Error {
  constructor() {
    super('A target already exists for this scope and period.')
    this.name = 'OverlappingTargetError'
  }
}

export async function listTargets(): Promise<SalesTarget[]> {
  const targets = await getCollection<SalesTarget>(KEY, () => [])
  return [...targets].sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime())
}

export async function getTarget(id: string): Promise<SalesTarget | null> {
  const targets = await listTargets()
  return targets.find((t) => t.id === id) ?? null
}

function periodsOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return new Date(aStart).getTime() <= new Date(bEnd).getTime() && new Date(aEnd).getTime() >= new Date(bStart).getTime()
}

export async function createTarget(input: SalesTargetInput, userId: string): Promise<SalesTarget> {
  if (new Date(input.periodEnd).getTime() < new Date(input.periodStart).getTime()) {
    throw new Error('End date must be on or after the start date.')
  }
  if (input.scope === 'branch' && !input.branchId) throw new InvalidTargetScopeError('A branch target needs a branch selected.')
  if (input.scope === 'staff' && !input.staffId) throw new InvalidTargetScopeError('A staff target needs a staff member selected.')
  if (input.targetAmountUgx <= 0) throw new Error('Enter a target amount greater than 0.')

  const existing = await listTargets()
  const overlaps = existing.some((t) => {
    if (t.scope !== input.scope) return false
    if (input.scope === 'branch' && t.branchId !== input.branchId) return false
    if (input.scope === 'staff' && t.staffId !== input.staffId) return false
    return periodsOverlap(t.periodStart, t.periodEnd, input.periodStart, input.periodEnd)
  })
  if (overlaps) throw new OverlappingTargetError()

  const target: SalesTarget = {
    id: crypto.randomUUID(),
    ...input,
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }
  await setCollection(KEY, [...existing, target])
  await enqueueSync({ entityType: 'sales_target', entityId: target.id, operation: 'create' })
  return target
}

export async function deleteTarget(id: string): Promise<void> {
  const targets = await listTargets()
  await setCollection(
    KEY,
    targets.filter((t) => t.id !== id),
  )
  await enqueueSync({ entityType: 'sales_target', entityId: id, operation: 'update' })
}

/** "Completed sales update progress automatically. Cancelled sales
 *  excluded." A parked sale never became a sale and a refunded sale was
 *  reversed, so only status 'completed' ever counts here. */
function achievedForTarget(target: SalesTarget, sales: Sale[]): number {
  const inPeriod = sales.filter(
    (s) =>
      s.status === 'completed' &&
      new Date(s.createdAt).getTime() >= new Date(target.periodStart).getTime() &&
      new Date(s.createdAt).getTime() <= new Date(target.periodEnd).getTime() + 86_399_000,
  )
  const scoped =
    target.scope === 'business'
      ? inPeriod
      : target.scope === 'branch'
        ? inPeriod.filter((s) => s.branchId === target.branchId)
        : inPeriod.filter((s) => s.salesPersonId === target.staffId)
  return scoped.reduce((sum, s) => sum + s.totalAmount, 0)
}

export async function getTargetProgress(target: SalesTarget): Promise<TargetProgress> {
  const sales = await listSales()
  const achievedUgx = achievedForTarget(target, sales)
  return {
    target,
    achievedUgx,
    remainingUgx: Math.max(0, target.targetAmountUgx - achievedUgx),
    achievementPercent: target.targetAmountUgx > 0 ? Math.round((achievedUgx / target.targetAmountUgx) * 100) : 0,
  }
}

export async function getAllProgress(): Promise<TargetProgress[]> {
  const [targets, sales] = await Promise.all([listTargets(), listSales()])
  return targets.map((target) => {
    const achievedUgx = achievedForTarget(target, sales)
    return {
      target,
      achievedUgx,
      remainingUgx: Math.max(0, target.targetAmountUgx - achievedUgx),
      achievementPercent: target.targetAmountUgx > 0 ? Math.round((achievedUgx / target.targetAmountUgx) * 100) : 0,
    }
  })
}

function isCurrentPeriod(target: SalesTarget): boolean {
  const now = Date.now()
  return new Date(target.periodStart).getTime() <= now && new Date(target.periodEnd).getTime() + 86_399_000 >= now
}

// ---------- Dashboard ----------

export interface TargetsDashboardData {
  current: TargetProgress | null
  topPerformer: { name: string; achievedUgx: number; achievementPercent: number } | null
  bestBranch: { name: string; achievedUgx: number; achievementPercent: number } | null
}

export async function getTargetsDashboardData(): Promise<TargetsDashboardData> {
  const [allProgress, staff, branches] = await Promise.all([getAllProgress(), listStaff(), listBranches()])
  const currentAll = allProgress.filter((p) => isCurrentPeriod(p.target))

  const currentBusiness = currentAll.find((p) => p.target.scope === 'business') ?? null

  const staffProgress = currentAll.filter((p) => p.target.scope === 'staff').sort((a, b) => b.achievementPercent - a.achievementPercent)
  const topStaff = staffProgress[0]
  const topPerformer = topStaff
    ? {
        name: staff.find((s) => s.id === topStaff.target.staffId)?.fullName ?? 'Unknown staff',
        achievedUgx: topStaff.achievedUgx,
        achievementPercent: topStaff.achievementPercent,
      }
    : null

  const branchProgress = currentAll.filter((p) => p.target.scope === 'branch').sort((a, b) => b.achievementPercent - a.achievementPercent)
  const topBranch = branchProgress[0]
  const bestBranch = topBranch
    ? {
        name: branches.find((b) => b.id === topBranch.target.branchId)?.name ?? 'Unknown branch',
        achievedUgx: topBranch.achievedUgx,
        achievementPercent: topBranch.achievementPercent,
      }
    : null

  return { current: currentBusiness, topPerformer, bestBranch }
}

// ---------- Notifications ----------
// A target that crosses the configured percent (and isn't fully done
// yet) is worth surfacing - a real, actionable signal, not decoration.

export interface NearingTargetAlert {
  targetId: string
  label: string
  achievementPercent: number
}

export async function getTargetsNearingCompletion(): Promise<NearingTargetAlert[]> {
  const [settings, allProgress, staff, branches] = await Promise.all([
    getSalesTargetsSettings(),
    getAllProgress(),
    listStaff(),
    listBranches(),
  ])

  return allProgress
    .filter((p) => isCurrentPeriod(p.target) && p.achievementPercent >= settings.notifyAtPercent && p.achievementPercent < 100)
    .map((p) => ({
      targetId: p.target.id,
      label:
        p.target.scope === 'business'
          ? 'Business-wide target'
          : p.target.scope === 'branch'
            ? `${branches.find((b) => b.id === p.target.branchId)?.name ?? 'Branch'} target`
            : `${staff.find((s) => s.id === p.target.staffId)?.fullName ?? 'Staff'} target`,
      achievementPercent: p.achievementPercent,
    }))
}

export interface LeaderboardRow {
  id: string
  name: string
  achievedUgx: number
  targetAmountUgx: number
  achievementPercent: number
}

export async function getLeaderboard(scope: 'staff' | 'branch'): Promise<LeaderboardRow[]> {
  const [allProgress, staff, branches] = await Promise.all([getAllProgress(), listStaff(), listBranches()])
  const rows = allProgress.filter((p) => p.target.scope === scope && isCurrentPeriod(p.target))

  return rows
    .map((p) => ({
      id: scope === 'staff' ? (p.target.staffId as string) : (p.target.branchId as string),
      name:
        scope === 'staff'
          ? (staff.find((s) => s.id === p.target.staffId)?.fullName ?? 'Unknown staff')
          : (branches.find((b) => b.id === p.target.branchId)?.name ?? 'Unknown branch'),
      achievedUgx: p.achievedUgx,
      targetAmountUgx: p.target.targetAmountUgx,
      achievementPercent: p.achievementPercent,
    }))
    .sort((a, b) => b.achievementPercent - a.achievementPercent)
}
