import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as offlineModeService from '../../../services/offlineModeService'
import type { OfflineSettings } from '../../../services/offlineModeService'
import type { SupportedCurrency } from '../../../lib/currency'

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['offline-mode'] })
}

export function useOfflineDashboardKpis(currency: SupportedCurrency) {
  return useQuery({ queryKey: ['offline-mode', 'kpis', currency], queryFn: () => offlineModeService.getOfflineDashboardKpis(currency) })
}

export function usePendingSyncItems() {
  return useQuery({ queryKey: ['offline-mode', 'pending'], queryFn: offlineModeService.listPendingSyncItems })
}

export function useSyncHistory() {
  return useQuery({ queryKey: ['offline-mode', 'history'], queryFn: offlineModeService.listSyncHistory })
}

export function usePerformManualSync() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: offlineModeService.performManualSync,
    onSuccess: () => invalidateAll(qc),
  })
}

export function useConflicts() {
  return useQuery({ queryKey: ['offline-mode', 'conflicts'], queryFn: offlineModeService.listConflicts })
}

export function useEncryptionStatus() {
  return useQuery({ queryKey: ['offline-mode', 'encryption-status'], queryFn: offlineModeService.getEncryptionStatus })
}

export function useEncryptRemainingData() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: offlineModeService.encryptRemainingData,
    onSuccess: () => invalidateAll(qc),
  })
}

export function useOfflineSettings() {
  return useQuery({ queryKey: ['offline-mode', 'settings'], queryFn: offlineModeService.getOfflineSettings })
}

export function useSaveOfflineSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: OfflineSettings) => offlineModeService.saveOfflineSettings(input),
    onSuccess: () => invalidateAll(qc),
  })
}
