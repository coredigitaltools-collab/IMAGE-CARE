import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as loyaltyService from '../../../services/loyaltyService'
import type { LoyaltyRewardInput, LoyaltySettings } from '../../../types/loyalty'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['loyalty'] })
  qc.invalidateQueries({ queryKey: ['sales', 'customers'] })
  qc.invalidateQueries({ queryKey: ['sales', 'crm-kpis'] })
}

export function useLoyaltySettings() {
  return useQuery({ queryKey: ['loyalty', 'settings'], queryFn: loyaltyService.getLoyaltySettings })
}

export function useSaveLoyaltySettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LoyaltySettings) => loyaltyService.saveLoyaltySettings(input),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useLoyaltyTransactions(customerId?: string) {
  return useQuery({ queryKey: ['loyalty', 'transactions', customerId ?? 'all'], queryFn: () => loyaltyService.listTransactions(customerId) })
}

export function useLoyaltyRewards() {
  return useQuery({ queryKey: ['loyalty', 'rewards'], queryFn: loyaltyService.listRewards })
}

export function useCreateReward(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: LoyaltyRewardInput) => loyaltyService.createReward(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useUpdateReward(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LoyaltyRewardInput }) => loyaltyService.updateReward(id, input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useArchiveReward(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => loyaltyService.archiveReward(id, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useLoyaltyRedemptions(customerId?: string) {
  return useQuery({ queryKey: ['loyalty', 'redemptions', customerId ?? 'all'], queryFn: () => loyaltyService.listRedemptions(customerId) })
}

export function useRedeemReward(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ customerId, rewardId }: { customerId: string; rewardId: string }) => loyaltyService.redeemReward(customerId, rewardId, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useProcessExpirations(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => loyaltyService.processExpirations(userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useLoyaltyDashboardKpis() {
  return useQuery({ queryKey: ['loyalty', 'kpis'], queryFn: loyaltyService.getLoyaltyDashboardKpis })
}

export function useTopMembers() {
  return useQuery({ queryKey: ['loyalty', 'top-members'], queryFn: loyaltyService.getTopMembers })
}
