import { getCollection, setCollection, getSingleton, setSingleton, enqueueSync } from '../lib/localStore'
import { stampNew, stampUpdated } from '../lib/audit'
import { listCustomers, adjustCustomerLoyaltyPoints } from './customerService'
import type { LoyaltyReward, LoyaltyRewardInput, LoyaltySettings, LoyaltyRedemption, LoyaltyTransaction } from '../types/loyalty'

const SETTINGS_KEY = 'loyalty:settings'
const REWARDS_KEY = 'loyalty:rewards'
const REDEMPTIONS_KEY = 'loyalty:redemptions'
const TRANSACTIONS_KEY = 'loyalty:transactions'

export class InsufficientPointsError extends Error {
  constructor(available: number, needed: number) {
    super(`Not enough points — ${available} available, ${needed} needed.`)
    this.name = 'InsufficientPointsError'
  }
}
export class BelowMinimumRedemptionError extends Error {
  constructor(min: number) {
    super(`Redemptions require at least ${min} points.`)
    this.name = 'BelowMinimumRedemptionError'
  }
}

// ---------- Settings (Points Engine configuration) ----------
// A simple starter default — 1 point per 1,000 UGX, 1 point worth 100
// UGX when redeemed, no minimum, points never expire — all editable, not
// hardcoded business logic, per "expiry rules configurable."

function seedLoyaltySettings(): LoyaltySettings {
  return { ugxPerPoint: 1000, redemptionValuePerPointUgx: 100, minPointsToRedeem: 0, expiryDays: 0 }
}

export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  return getSingleton(SETTINGS_KEY, seedLoyaltySettings)
}

export async function saveLoyaltySettings(input: LoyaltySettings): Promise<LoyaltySettings> {
  await setSingleton(SETTINGS_KEY, input)
  await enqueueSync({ entityType: 'loyalty_settings', entityId: 'singleton', operation: 'update' })
  return input
}

// ---------- Transactions (the audit trail behind every points change) ----------

async function logTransaction(input: Omit<LoyaltyTransaction, 'id' | 'createdAt'>): Promise<LoyaltyTransaction> {
  const transactions = await getCollection<LoyaltyTransaction>(TRANSACTIONS_KEY, () => [])
  const transaction: LoyaltyTransaction = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
  await setCollection(TRANSACTIONS_KEY, [...transactions, transaction])
  await enqueueSync({ entityType: 'loyalty_transaction', entityId: transaction.id, operation: 'create' })
  return transaction
}

export async function listTransactions(customerId?: string): Promise<LoyaltyTransaction[]> {
  const transactions = await getCollection<LoyaltyTransaction>(TRANSACTIONS_KEY, () => [])
  const sorted = [...transactions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return customerId ? sorted.filter((t) => t.customerId === customerId) : sorted
}

// ---------- Points Engine ----------
// "Only registered customers earn points" / "Points awarded after
// completed sales" — enforced by the caller (salesService only calls
// this for a completed sale with a real customerId); this function
// itself is the SOLE writer of Customer.loyaltyPoints, so the balance
// and the transaction log can never drift apart.

export async function awardPoints(customerId: string, saleId: string, amountSpentUgx: number, userId: string): Promise<number> {
  const settings = await getLoyaltySettings()
  const points = Math.floor(amountSpentUgx / settings.ugxPerPoint)
  if (points <= 0) return 0

  await adjustCustomerLoyaltyPoints(customerId, points, userId)
  await logTransaction({
    customerId,
    type: 'earn',
    points,
    relatedSaleId: saleId,
    relatedRedemptionId: null,
    reason: 'Points earned on completed sale',
    createdBy: userId,
  })
  return points
}

/** "Refunds reverse points" — finds the original earn transaction for
 *  the refunded sale and reverses exactly that many points (never more
 *  than was actually earned, even if settings changed since). */
export async function reversePointsForSale(saleId: string, userId: string): Promise<void> {
  const transactions = await listTransactions()
  const earnTx = transactions.find((t) => t.relatedSaleId === saleId && t.type === 'earn')
  if (!earnTx) return

  await adjustCustomerLoyaltyPoints(earnTx.customerId, -earnTx.points, userId)
  await logTransaction({
    customerId: earnTx.customerId,
    type: 'reverse',
    points: -earnTx.points,
    relatedSaleId: saleId,
    relatedRedemptionId: null,
    reason: 'Sale refunded',
    createdBy: userId,
  })
}

// ---------- Reward Catalogue ----------

export async function listRewards(): Promise<LoyaltyReward[]> {
  return getCollection<LoyaltyReward>(REWARDS_KEY, () => [])
}

export async function createReward(input: LoyaltyRewardInput, userId: string): Promise<LoyaltyReward> {
  const rewards = await listRewards()
  const reward: LoyaltyReward = { ...stampNew(userId), ...input }
  await setCollection(REWARDS_KEY, [...rewards, reward])
  await enqueueSync({ entityType: 'loyalty_reward', entityId: reward.id, operation: 'create' })
  return reward
}

export async function updateReward(id: string, input: LoyaltyRewardInput, userId: string): Promise<LoyaltyReward> {
  const rewards = await listRewards()
  let updated: LoyaltyReward | null = null
  const next = rewards.map((r) => {
    if (r.id !== id) return r
    updated = stampUpdated({ ...r, ...input }, userId)
    return updated
  })
  if (!updated) throw new Error('Reward not found.')
  await setCollection(REWARDS_KEY, next)
  await enqueueSync({ entityType: 'loyalty_reward', entityId: id, operation: 'update' })
  return updated
}

export async function archiveReward(id: string, userId: string): Promise<void> {
  const rewards = await listRewards()
  const next = rewards.map((r) => (r.id === id ? stampUpdated({ ...r, is_active: false }, userId) : r))
  await setCollection(REWARDS_KEY, next)
  await enqueueSync({ entityType: 'loyalty_reward', entityId: id, operation: 'disable' })
}

// ---------- Redemption ----------

export async function listRedemptions(customerId?: string): Promise<LoyaltyRedemption[]> {
  const redemptions = await getCollection<LoyaltyRedemption>(REDEMPTIONS_KEY, () => [])
  const sorted = [...redemptions].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  return customerId ? sorted.filter((r) => r.customerId === customerId) : sorted
}

export async function redeemReward(customerId: string, rewardId: string, userId: string): Promise<LoyaltyRedemption> {
  const [customers, rewards, settings] = await Promise.all([listCustomers(), listRewards(), getLoyaltySettings()])
  const customer = customers.find((c) => c.id === customerId)
  const reward = rewards.find((r) => r.id === rewardId)
  if (!customer) throw new Error('Customer not found.')
  if (!reward) throw new Error('Reward not found.')
  if (reward.pointsCost < settings.minPointsToRedeem) throw new BelowMinimumRedemptionError(settings.minPointsToRedeem)
  if (customer.loyaltyPoints < reward.pointsCost) throw new InsufficientPointsError(customer.loyaltyPoints, reward.pointsCost)

  const redemption: LoyaltyRedemption = {
    id: crypto.randomUUID(),
    customerId,
    rewardId,
    rewardName: reward.name,
    pointsCost: reward.pointsCost,
    createdAt: new Date().toISOString(),
    createdBy: userId,
  }
  const redemptions = await getCollection<LoyaltyRedemption>(REDEMPTIONS_KEY, () => [])
  await setCollection(REDEMPTIONS_KEY, [...redemptions, redemption])
  await enqueueSync({ entityType: 'loyalty_redemption', entityId: redemption.id, operation: 'create' })

  await adjustCustomerLoyaltyPoints(customerId, -reward.pointsCost, userId)
  await logTransaction({
    customerId,
    type: 'redeem',
    points: -reward.pointsCost,
    relatedSaleId: null,
    relatedRedemptionId: redemption.id,
    reason: `Redeemed for ${reward.name}`,
    createdBy: userId,
  })

  return redemption
}

// ---------- Manual expiration (explicit, never silent) ----------
// A real background cron isn't available in this offline-first PWA, so
// expiration is an explicit, auditable admin action rather than
// something that silently erodes a customer's balance unattended.

export async function processExpirations(userId: string): Promise<{ customersAffected: number; pointsExpired: number }> {
  const settings = await getLoyaltySettings()
  if (settings.expiryDays <= 0) return { customersAffected: 0, pointsExpired: 0 }

  const cutoff = Date.now() - settings.expiryDays * 86_400_000
  const customers = await listCustomers()
  let customersAffected = 0
  let pointsExpired = 0

  for (const customer of customers) {
    if (customer.loyaltyPoints <= 0) continue
    const txs = await listTransactions(customer.id)
    const lastActivity = txs.length > 0 ? new Date(txs[0].createdAt).getTime() : new Date(customer.created_at).getTime()
    if (lastActivity > cutoff) continue

    const amount = customer.loyaltyPoints
    await adjustCustomerLoyaltyPoints(customer.id, -amount, userId)
    await logTransaction({
      customerId: customer.id,
      type: 'expire',
      points: -amount,
      relatedSaleId: null,
      relatedRedemptionId: null,
      reason: `No activity in ${settings.expiryDays}+ days`,
      createdBy: userId,
    })
    customersAffected += 1
    pointsExpired += amount
  }
  return { customersAffected, pointsExpired }
}

// ---------- Dashboard & Reports ----------

export interface LoyaltyDashboardKpis {
  totalPointsOutstanding: number
  activeMembers: number
  pointsEarnedThisMonth: number
  pointsRedeemedThisMonth: number
  redemptionsThisMonth: number
}

export async function getLoyaltyDashboardKpis(): Promise<LoyaltyDashboardKpis> {
  const [customers, transactions] = await Promise.all([listCustomers(), listTransactions()])
  const now = new Date()
  const thisMonth = transactions.filter((t) => {
    const d = new Date(t.createdAt)
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  })

  return {
    totalPointsOutstanding: customers.filter((c) => c.is_active).reduce((sum, c) => sum + c.loyaltyPoints, 0),
    activeMembers: customers.filter((c) => c.is_active && c.loyaltyPoints > 0).length,
    pointsEarnedThisMonth: thisMonth.filter((t) => t.type === 'earn').reduce((sum, t) => sum + t.points, 0),
    pointsRedeemedThisMonth: Math.abs(thisMonth.filter((t) => t.type === 'redeem').reduce((sum, t) => sum + t.points, 0)),
    redemptionsThisMonth: thisMonth.filter((t) => t.type === 'redeem').length,
  }
}

export interface TopEarnerRow {
  customerId: string
  customerName: string
  pointsBalance: number
}

export async function getTopMembers(): Promise<TopEarnerRow[]> {
  const customers = await listCustomers()
  return customers
    .filter((c) => c.is_active && c.loyaltyPoints > 0)
    .sort((a, b) => b.loyaltyPoints - a.loyaltyPoints)
    .slice(0, 10)
    .map((c) => ({ customerId: c.id, customerName: c.name, pointsBalance: c.loyaltyPoints }))
}
