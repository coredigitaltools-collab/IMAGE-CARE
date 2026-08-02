// ---------- Sales Targets (IMC-SRS-013) ----------
// "No hard coded targets" - every target is created by the business,
// for a business-wide, branch, or staff scope, over a period they pick
// themselves. Progress is computed live from real completed sales, not
// stored and allowed to drift out of sync.

export type TargetScope = 'business' | 'branch' | 'staff'
export const TARGET_SCOPE_LABELS: Record<TargetScope, string> = {
  business: 'Business-wide',
  branch: 'Branch',
  staff: 'Staff',
}

export interface SalesTarget {
  id: string
  scope: TargetScope
  branchId: string | null
  staffId: string | null
  periodStart: string
  periodEnd: string
  targetAmountUgx: number
  createdAt: string
  createdBy: string
}

export type SalesTargetInput = Pick<SalesTarget, 'scope' | 'branchId' | 'staffId' | 'periodStart' | 'periodEnd' | 'targetAmountUgx'>

export interface TargetProgress {
  target: SalesTarget
  achievedUgx: number
  remainingUgx: number
  achievementPercent: number
}

export interface SalesTargetsSettings {
  // A target that crosses this percent shows up as an alert in the
  // Notification Center - a real, configurable threshold, not a fixed
  // one.
  notifyAtPercent: number
}
