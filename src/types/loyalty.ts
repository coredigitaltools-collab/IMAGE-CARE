import type { AuditFields } from '../lib/audit'

// ---------- Loyalty Programme (IMC-SRS-008) ----------
// Workflow: Completed Sale -> Points Awarded -> Customer Balance Updated
// -> Redeem Points -> Loyalty Balance Updated. Every step here writes a
// LoyaltyTransaction — "audit every loyalty transaction" is enforced by
// having exactly one function (loyaltyService) ever touch
// Customer.loyaltyPoints, and it never does so without also logging one.

export type LoyaltyTransactionType = 'earn' | 'redeem' | 'reverse' | 'expire' | 'adjust'
export const LOYALTY_TRANSACTION_LABELS: Record<LoyaltyTransactionType, string> = {
  earn: 'Earned',
  redeem: 'Redeemed',
  reverse: 'Reversed (refund)',
  expire: 'Expired',
  adjust: 'Manual adjustment',
}

export interface LoyaltyTransaction {
  id: string
  customerId: string
  type: LoyaltyTransactionType
  points: number // positive for earn/adjust-up, negative for redeem/reverse/expire/adjust-down
  relatedSaleId: string | null
  relatedRedemptionId: string | null
  reason: string
  createdAt: string
  createdBy: string
}

export interface LoyaltyReward extends AuditFields {
  name: string
  description: string
  pointsCost: number
  valueUgx: number // cash-equivalent value, for display and reporting
}
export type LoyaltyRewardInput = Pick<LoyaltyReward, 'name' | 'description' | 'pointsCost' | 'valueUgx'>

export interface LoyaltyRedemption {
  id: string
  customerId: string
  rewardId: string
  rewardName: string
  pointsCost: number
  createdAt: string
  createdBy: string
}

export interface LoyaltySettings {
  ugxPerPoint: number // customer earns 1 point per this many UGX spent
  redemptionValuePerPointUgx: number // cash value of 1 point when redeemed
  minPointsToRedeem: number
  expiryDays: number // 0 = points never expire
}
