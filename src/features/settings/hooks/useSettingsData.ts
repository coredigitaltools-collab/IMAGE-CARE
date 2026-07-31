import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getBusinessProfile, saveBusinessProfile } from '../../../services/businessProfileService'
import {
  createBranch,
  listBranches,
  updateBranch,
  setBranchActive,
} from '../../../services/branchService'
import {
  createStaff,
  disableStaff,
  listStaff,
  reactivateStaff,
  resetStaffPassword,
  updateStaff,
} from '../../../services/staffService'
import { getPermissionMatrix, setPermission } from '../../../services/permissionsService'
import { listRoles, createRole, renameRole, archiveRole } from '../../../services/roleService'
import { createTaxRate, listTaxRates, updateTaxRate } from '../../../services/taxSettingsService'
import {
  getAppearanceSettings,
  getInventorySettings,
  getNotificationSettings,
  getReceiptSettings,
  getSalesSettings,
  saveAppearanceSettings,
  saveInventorySettings,
  saveNotificationSettings,
  saveReceiptSettings,
  saveSalesSettings,
} from '../../../services/configSettingsService'
import {
  createBackup,
  downloadBackupFile,
  getBackupHistory,
  getLastSyncedAt,
  getPendingSyncItems,
  restoreBackup,
  runSync,
} from '../../../services/backupSyncService'
import type { BranchInput, BusinessProfileInput, Permission, RoleDefinitionInput, StaffInput, StaffRole, TaxRateInput } from '../../../types/settings'

// ---------- Business Profile ----------

export function useBusinessProfile() {
  return useQuery({ queryKey: ['settings', 'business-profile'], queryFn: getBusinessProfile })
}

export function useSaveBusinessProfile(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BusinessProfileInput) => saveBusinessProfile(input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'business-profile'] }),
  })
}

// ---------- Branches ----------

export function useBranches() {
  return useQuery({ queryKey: ['settings', 'branches'], queryFn: listBranches })
}

export function useCreateBranch(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BranchInput) => createBranch(input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'branches'] }),
  })
}

export function useUpdateBranch(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: BranchInput }) => updateBranch(id, input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'branches'] }),
  })
}

export function useSetBranchActive(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setBranchActive(id, isActive, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'branches'] }),
  })
}

// ---------- Staff ----------

export function useStaff() {
  return useQuery({ queryKey: ['settings', 'staff'], queryFn: listStaff })
}

export function useCreateStaff(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: StaffInput) => createStaff(input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  })
}

export function useUpdateStaff(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: StaffInput }) => updateStaff(id, input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  })
}

export function useDisableStaff(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => disableStaff(id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  })
}

export function useReactivateStaff(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reactivateStaff(id, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  })
}

export function useResetStaffPassword() {
  return useMutation({ mutationFn: (id: string) => resetStaffPassword(id) })
}

// ---------- Roles ----------

export function useRoles() {
  return useQuery({ queryKey: ['settings', 'roles'], queryFn: listRoles })
}

export function useCreateRole(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RoleDefinitionInput) => createRole(input, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'roles'] })
      qc.invalidateQueries({ queryKey: ['settings', 'permission-matrix'] })
    },
  })
}

export function useRenameRole(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameRole(id, name, userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'roles'] }),
  })
}

export function useArchiveRole(userId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => archiveRole(id, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'roles'] })
      qc.invalidateQueries({ queryKey: ['settings', 'permission-matrix'] })
    },
  })
}

// ---------- Permissions ----------

export function usePermissionMatrix() {
  return useQuery({ queryKey: ['settings', 'permission-matrix'], queryFn: getPermissionMatrix })
}

export function useSetPermission(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ role, permission, granted }: { role: StaffRole; permission: Permission; granted: boolean }) =>
      setPermission(role, permission, granted, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'permission-matrix'] }),
  })
}

// ---------- Tax ----------

export function useTaxRates() {
  return useQuery({ queryKey: ['settings', 'tax-rates'], queryFn: listTaxRates })
}

export function useCreateTaxRate(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TaxRateInput) => createTaxRate(input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'tax-rates'] }),
  })
}

export function useUpdateTaxRate(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaxRateInput }) => updateTaxRate(id, input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'tax-rates'] }),
  })
}

// ---------- Receipts / Inventory / Sales / Notifications / Appearance ----------

export function useReceiptSettings() {
  return useQuery({ queryKey: ['settings', 'receipts'], queryFn: getReceiptSettings })
}
export function useSaveReceiptSettings(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof saveReceiptSettings>[0]) => saveReceiptSettings(input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'receipts'] }),
  })
}

export function useInventorySettings() {
  return useQuery({ queryKey: ['settings', 'inventory-config'], queryFn: getInventorySettings })
}
export function useSaveInventorySettings(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof saveInventorySettings>[0]) => saveInventorySettings(input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'inventory-config'] }),
  })
}

export function useSalesSettings() {
  return useQuery({ queryKey: ['settings', 'sales-config'], queryFn: getSalesSettings })
}
export function useSaveSalesSettings(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof saveSalesSettings>[0]) => saveSalesSettings(input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'sales-config'] }),
  })
}

export function useNotificationSettings() {
  return useQuery({ queryKey: ['settings', 'notifications'], queryFn: getNotificationSettings })
}
export function useSaveNotificationSettings(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof saveNotificationSettings>[0]) => saveNotificationSettings(input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'notifications'] }),
  })
}

export function useAppearanceSettings() {
  return useQuery({ queryKey: ['settings', 'appearance'], queryFn: getAppearanceSettings })
}
export function useSaveAppearanceSettings(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Parameters<typeof saveAppearanceSettings>[0]) => saveAppearanceSettings(input, userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'appearance'] }),
  })
}

// ---------- Backup / Restore / Sync ----------

export function useBackupHistory() {
  return useQuery({ queryKey: ['settings', 'backup-history'], queryFn: getBackupHistory })
}

export function useCreateBackup(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { file, record } = await createBackup(userId)
      downloadBackupFile(file)
      return record
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'backup-history'] }),
  })
}

export function useRestoreBackup() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fileContents: string) => restoreBackup(fileContents),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  })
}

export function usePendingSyncItems() {
  return useQuery({ queryKey: ['settings', 'sync-queue'], queryFn: getPendingSyncItems, refetchInterval: 5000 })
}

export function useLastSyncedAt() {
  return useQuery({ queryKey: ['settings', 'last-synced-at'], queryFn: getLastSyncedAt })
}

export function useRunSync() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: runSync,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings', 'sync-queue'] })
      queryClient.invalidateQueries({ queryKey: ['settings', 'last-synced-at'] })
    },
  })
}
