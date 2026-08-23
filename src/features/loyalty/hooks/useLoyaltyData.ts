import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useUserContext } from '../../../context/AppContext'
import {
  listLoyaltyAccounts as listLoyaltyAccountsReal,
  getLoyaltyAccountByCustomer as getLoyaltyAccountByCustomerReal,
  listLoyaltyTransactions as listLoyaltyTransactionsReal,
} from '../../../services/loyalty/loyaltyService'
import * as loyaltyService from '../../../services/loyaltyService'
import type { LoyaltyRewardInput, LoyaltySettings, LoyaltyTransaction as LocalLoyaltyTransaction } from '../../../types/loyalty'
import type { LoyaltyTransaction as DbLoyaltyTransaction } from '../../../types/database'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['loyalty'] })
  qc.invalidateQueries({ queryKey: ['sales', 'customers'] })
  qc.invalidateQueries({ queryKey: ['sales', 'crm-kpis'] })
}

// Same unwrap() shape as src/features/invoices/hooks/useInvoicesData.ts: throws on
// a ServiceResponse error, unwraps a PagedResponse's `.items`, otherwise returns
// `.data` as-is. Only used below for calls whose `.data` is a list (a bare `null`
// there just means "nothing yet", safe to fold into `[]`) - never for the single
// nullable-row lookup (getLoyaltyAccountByCustomer), where `null` is a meaningful
// "not enrolled" result and must not collapse into an empty array.
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
// Mapping: real imagecare.loyalty_transactions rows -> the local
// LoyaltyTransaction shape the loyalty pages already render against
// (src/types/loyalty.ts).
// ---------------------------------------------------------------------------

function mapDbTransaction(row: DbLoyaltyTransaction, customerId: string): LocalLoyaltyTransaction {
  return {
    id: row.id,
    customerId,
    // Real schema constrains transaction_type to 'earn' | 'redeem' only
    // (CHECK constraint) - a strict subset of the local union, so this is a
    // safe direct assignment, never 'reverse' | 'expire' | 'adjust'.
    type: row.transaction_type,
    // Real rows always store a positive `points` value (CHECK points > 0) plus
    // a separate transaction_type; the local shape instead encodes direction
    // as the sign of `points` (see types/loyalty.ts). Folding type into sign
    // here is a display-shape mapping of real, stored numbers - not a
    // computed or invented value.
    points: row.transaction_type === 'redeem' ? -row.points : row.points,
    relatedSaleId: row.sale_id,
    // No loyalty_redemptions table exists in the real schema.
    relatedRedemptionId: null,
    reason: row.description ?? '',
    createdAt: row.transaction_date,
    // Real loyalty_transactions.created_by isn't selected here; no local
    // equivalent to fall back to for a real row.
    createdBy: '',
  }
}

// ---------------------------------------------------------------------------
// Real, Supabase-backed hooks
// ---------------------------------------------------------------------------

// Real when a customerId is given (this is how CustomerDetailPage calls it):
// resolves the customer's real loyalty_accounts row, then reads its real
// loyalty_transactions history via listLoyaltyTransactions(ctx, accountId).
//
// LOCAL-ONLY when no customerId is given (this is how LoyaltyReportsPage's
// "recent activity across the whole business" list calls it): the
// minimum-safe real service only exposes per-account transaction listing
// (listLoyaltyTransactions requires a specific loyaltyAccountId) - there is
// no authorized "all transactions for this business" read in the safe
// minimum, so that case keeps reading the local store (see
// docs/MODULE_INTEGRATION_MAP.md gap).
export function useLoyaltyTransactions(customerId?: string) {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['loyalty', 'transactions', customerId ?? 'all', ctx.business_id],
    queryFn: async () => {
      if (!customerId) return loyaltyService.listTransactions()

      const accountResp = await getLoyaltyAccountByCustomerReal(ctx, customerId)
      if (accountResp.error) throw new Error(accountResp.error.message)
      const account = accountResp.data
      if (!account) return [] // customer not yet enrolled in the loyalty programme

      const rows = (await listLoyaltyTransactionsReal(ctx, account.id).then(unwrap)) as DbLoyaltyTransaction[]
      return rows.map((row) => mapDbTransaction(row, customerId))
    },
  })
}

// Real: sorts real loyalty_accounts by their own real, stored points_balance.
// No earn/redeem arithmetic, no conversion rate, no invented tie-break rule -
// exactly the "sum real points_balance across accounts, sort desc" case.
export function useTopMembers() {
  const ctx = useUserContext()
  return useQuery({
    queryKey: ['loyalty', 'top-members', ctx.business_id],
    queryFn: async () => {
      const accounts = (await listLoyaltyAccountsReal(ctx, { is_active: true }).then(unwrap)) as Array<{
        customer_id: string
        points_balance: number
        customers?: { name: string } | null
      }>
      return accounts
        .filter((a) => a.points_balance > 0)
        .sort((a, b) => b.points_balance - a.points_balance)
        .slice(0, 10)
        .map((a) => ({
          customerId: a.customer_id,
          customerName: a.customers?.name ?? 'Customer',
          pointsBalance: a.points_balance,
        }))
    },
  })
}

// ---------------------------------------------------------------------------
// LOCAL-ONLY hooks - no real backend service exists for these operations yet.
// ---------------------------------------------------------------------------

// LOCAL-ONLY: no real backend service yet for this operation - reads/writes a
// points-per-currency conversion rate that doesn't exist anywhere in the DB
// schema (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useLoyaltySettings() {
  return useQuery({ queryKey: ['loyalty', 'settings'], queryFn: loyaltyService.getLoyaltySettings })
}

// LOCAL-ONLY: no real backend service yet for this operation - saves an
// invented conversion rate / redemption minimum / expiry policy that isn't
// backed by any real column (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useSaveLoyaltySettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LoyaltySettings) => loyaltyService.saveLoyaltySettings(input),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no loyalty_rewards table exists in the real DB schema at all
// (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useLoyaltyRewards() {
  return useQuery({ queryKey: ['loyalty', 'rewards'], queryFn: loyaltyService.listRewards })
}

// LOCAL-ONLY: no loyalty_rewards table exists in the real DB schema at all
// (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useCreateReward(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LoyaltyRewardInput) => loyaltyService.createReward(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no loyalty_rewards table exists in the real DB schema at all
// (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useUpdateReward(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LoyaltyRewardInput }) => loyaltyService.updateReward(id, input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no loyalty_rewards table exists in the real DB schema at all
// (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useArchiveReward(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => loyaltyService.archiveReward(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: no loyalty_redemptions table exists in the real DB schema at
// all (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useLoyaltyRedemptions(customerId?: string) {
  return useQuery({ queryKey: ['loyalty', 'redemptions', customerId ?? 'all'], queryFn: () => loyaltyService.listRedemptions(customerId) })
}

// LOCAL-ONLY: redeeming requires an invented redemption minimum and a
// loyalty_rewards catalogue, neither of which exists in the real DB schema
// (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useRedeemReward(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ customerId, rewardId }: { customerId: string; rewardId: string }) => loyaltyService.redeemReward(customerId, rewardId, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: expiration requires an invented expiry-window policy that
// isn't present anywhere in the real DB schema (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useProcessExpirations(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => loyaltyService.processExpirations(userId),
    onSuccess: () => invalidateAll(qc),
  })
}

// LOCAL-ONLY: pointsEarnedThisMonth / pointsRedeemedThisMonth /
// redemptionsThisMonth need a business-wide read across every account's
// transactions, which the minimum-safe real service doesn't expose
// (listLoyaltyTransactions is account-scoped only, by design - see
// src/services/loyalty/loyaltyService.ts). totalPointsOutstanding and
// activeMembers alone are trivially real (a straight sum/count over
// listLoyaltyAccounts), but returning one KPI object that's part-real,
// part-local would misrepresent which numbers are actually backend-verified,
// so the whole KPI set stays local pending a real business-wide transactions
// read (see docs/MODULE_INTEGRATION_MAP.md gap)
export function useLoyaltyDashboardKpis() {
  return useQuery({ queryKey: ['loyalty', 'kpis'], queryFn: loyaltyService.getLoyaltyDashboardKpis })
}
