export type CustomerHealthStatus = 'excellent' | 'needs_attention' | 'inactive'

export interface CustomerHealth {
  status: CustomerHealthStatus
  label: string
  reasons: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Rules, in order of precedence:
 *  - Inactive: never purchased, or nothing in 90+ days.
 *  - Needs Attention: nothing in 30-90 days, OR any outstanding credit.
 *  - Excellent: purchased within 30 days AND no outstanding credit.
 *  Every reason shown is a fact derived from real data — never a guess. */
export function getCustomerHealth(params: { lastPurchaseAt: string | null; creditBalance: number }): CustomerHealth {
  const { lastPurchaseAt, creditBalance } = params
  const daysSinceLastPurchase = lastPurchaseAt ? Math.floor((Date.now() - new Date(lastPurchaseAt).getTime()) / DAY_MS) : null

  if (daysSinceLastPurchase === null) {
    return { status: 'inactive', label: 'Inactive', reasons: ['No purchases recorded yet'] }
  }
  if (daysSinceLastPurchase >= 90) {
    return { status: 'inactive', label: 'Inactive', reasons: [`No purchase in ${daysSinceLastPurchase} days`] }
  }

  const reasons: string[] = []
  if (daysSinceLastPurchase >= 30) reasons.push(`No purchase in ${daysSinceLastPurchase} days`)
  if (creditBalance > 0) reasons.push(`Outstanding credit of ${creditBalance.toLocaleString()} UGX`)

  if (reasons.length > 0) {
    return { status: 'needs_attention', label: 'Needs Attention', reasons }
  }

  return {
    status: 'excellent',
    label: 'Excellent',
    reasons: [`Purchased within the last ${daysSinceLastPurchase} day${daysSinceLastPurchase === 1 ? '' : 's'}`, 'No outstanding credit'],
  }
}
