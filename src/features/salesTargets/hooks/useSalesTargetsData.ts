import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as salesTargetsService from '../../../services/salesTargetsService'
import type { SalesTargetInput, SalesTargetsSettings } from '../../../types/salesTargets'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['sales-targets'] })
}

export function useTargets() {
  return useQuery({ queryKey: ['sales-targets', 'list'], queryFn: salesTargetsService.listTargets })
}

export function useAllTargetProgress() {
  return useQuery({ queryKey: ['sales-targets', 'progress'], queryFn: salesTargetsService.getAllProgress })
}

export function useCreateTarget(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: SalesTargetInput) => salesTargetsService.createTarget(input, userId),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useDeleteTarget() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => salesTargetsService.deleteTarget(id),
    onSuccess: () => invalidateAll(qc),
  })
}

export function useTargetsDashboardData() {
  return useQuery({ queryKey: ['sales-targets', 'dashboard'], queryFn: salesTargetsService.getTargetsDashboardData })
}

export function useLeaderboard(scope: 'staff' | 'branch') {
  return useQuery({ queryKey: ['sales-targets', 'leaderboard', scope], queryFn: () => salesTargetsService.getLeaderboard(scope) })
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

export function useTargetsNearingCompletion() {
  return useQuery({ queryKey: ['sales-targets', 'nearing-completion'], queryFn: salesTargetsService.getTargetsNearingCompletion })
}
