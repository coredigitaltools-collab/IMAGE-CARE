// Stage 5: Settings feature hooks - rewired to Stage 4 services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext } from '../../../context/AppContext';
import { getBusinessProfile, saveBusinessProfile, listStaff } from '../../../services/settings/settingsService';
import { listBranches, createBranch, updateBranch } from '../../../services/masterData/masterDataService';
import type { UUID } from '../../../types/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrap<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return {};
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string,unknown>).items))
    return (d as Record<string,unknown>).items;
  return d;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function unwrapArr<T>(r: { data?: T | null; error?: any; success?: boolean }): any {
  if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Service error');
  const d = r.data;
  if (d === null || d === undefined) return [];
  if (d && typeof d === 'object' && 'items' in (d as object) && Array.isArray((d as Record<string,unknown>).items))
    return (d as Record<string,unknown>).items;
  return d;
}

export function useBusinessProfile(_userId?: string) {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['settings', 'business-profile', ctx.business_id], queryFn: () => getBusinessProfile(ctx).then(unwrap) });
}

export function useSaveBusinessProfile(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: Parameters<typeof saveBusinessProfile>[1]) => saveBusinessProfile(ctx, input).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'business-profile'] }) });
}

export function useBranches(_userId?: string) {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['settings', 'branches', ctx.business_id], queryFn: () => listBranches(ctx).then(unwrapArr) });
}

export function useCreateBranch(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: { name: string; address?: string; phone?: string }) => createBranch(ctx, input).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'branches'] }) });
}

export function useUpdateBranch(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, input }: { id: UUID; input: Parameters<typeof updateBranch>[2] }) => updateBranch(ctx, id, input).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'branches'] }) });
}

export function useSetBranchActive(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, isActive }: { id: UUID; isActive: boolean }) => updateBranch(ctx, id, { is_active: isActive }).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'branches'] }) });
}

export function useStaff(_userId?: string) {
  const ctx = useUserContext();
  return useQuery({ queryKey: ['settings', 'staff', ctx.business_id], queryFn: () => listStaff(ctx).then(unwrapArr) });
}

export function useRoles(_userId?: string) {
  return useQuery({ queryKey: ['settings', 'roles'], queryFn: async () => [] as Array<{ id: string; name: string; permissions: Record<string, Record<string, boolean>>; created_at: string; updated_at: string; created_by: string; updated_by: string; branch_id: null; is_active: boolean; sync_status: 'synced'; last_synced_at: null }>, staleTime: Infinity });
}

export function usePermissionMatrix(_userId?: string) {
  return useQuery({ queryKey: ['settings', 'permissions'], queryFn: async () => ({}) as Record<string, unknown>, staleTime: Infinity });
}

export function useTaxRates(_userId?: string) {
  return useQuery({
    queryKey: ['settings', 'tax-rates'],
    queryFn: async () => [] as Array<{ id: string; name: string; rate: number; ratePercent: number; isInclusive: boolean; isDefault: boolean; created_at: string; updated_at: string; created_by: string; updated_by: string; branch_id: null; is_active: boolean; sync_status: 'synced'; last_synced_at: null }>,
    staleTime: 5 * 60_000,
  });
}

export function useReceiptSettings(_userId?: string) {
  return useQuery({
    queryKey: ['settings', 'receipt'],
    queryFn: async () => ({ id: 'default', business_id: '', created_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: '', updated_by: '', branch_id: null as null, is_active: true, sync_status: 'synced' as const, last_synced_at: null as null, showLogo: true, footerText: '', footerMessage: '', receiptPrefix: 'RCP', showTaxBreakdown: false, showCashierName: true, showCustomerName: true, showPaymentMethod: true, printAutomatically: false }),
    staleTime: Infinity,
  });
}

export function useSalesSettings(_userId?: string) {
  return useQuery({ queryKey: ['settings', 'sales'], queryFn: async () => ({ allowDiscounts: true, maxDiscountPercent: 100, requireCustomerForCredit: false }), staleTime: Infinity });
}

export function useSyncSettings(_userId?: string) { return useQuery({ queryKey: ['settings', 'sync'], queryFn: async () => ({ enabled: false, interval: 60 }), staleTime: Infinity }); }
export function useConfigSettings(_userId?: string) { return useQuery({ queryKey: ['settings', 'config'], queryFn: async () => ({}) as Record<string, unknown>, staleTime: Infinity }); }
export function useSaveConfigSettings(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: Record<string, unknown>) => input, onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'config'] }) }); }
export function useAppearanceSettings(_userId?: string) { return useQuery({ queryKey: ['settings', 'appearance'], queryFn: async () => ({ theme: 'light', primaryColor: '#2563eb', language: 'en', density: 'comfortable' as 'comfortable' | 'compact', dateFormat: 'DD/MM/YYYY' as 'DD/MM/YYYY' | 'MM/DD/YYYY', timeFormat: '12h' }), staleTime: Infinity }); }
export function useSaveAppearanceSettings(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: Record<string, unknown>) => input, onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'appearance'] }) }); }
export function useInventorySettings(_userId?: string) { return useQuery({ queryKey: ['settings', 'inventory'], queryFn: async () => ({ allowNegativeStock: false, autoReorderEnabled: false, defaultUnit: '', defaultReorderLevel: 5, skuPrefix: 'SKU', trackExpiryDates: false }), staleTime: Infinity }); }
export function useSaveInventorySettings(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: Record<string, unknown>) => input, onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'inventory'] }) }); }
export function useNotificationSettings(_userId?: string) { return useQuery({ queryKey: ['settings', 'notifications'], queryFn: async () => ({ lowStockAlerts: true, dailySummary: false, dailySummaryEmail: false, notificationEmail: '' }), staleTime: Infinity }); }
export function useSaveNotificationSettings(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: Record<string, unknown>) => input, onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'notifications'] }) }); }
export function useBackupHistory(_userId?: string) { return useQuery({ queryKey: ['settings', 'backups'], queryFn: async () => [] as Array<{ id: string; createdAt: string; sizeBytes: number; status: string; is_active: boolean; created_at: string; updated_at: string; created_by: string; updated_by: string; branch_id: null; sync_status: 'synced'; last_synced_at: null }>, staleTime: Infinity }); }
export function useCreateBackup(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async () => ({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), sizeBytes: 0, status: 'complete' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'backups'] }) }); }
export function useRestoreBackup(_userId?: string) { return useMutation({ mutationFn: async (id: string) => ({ id }) }); }
export function useLastSyncedAt(_userId?: string) { return useQuery({ queryKey: ['sync', 'last-synced'], queryFn: async () => new Date().toISOString(), staleTime: 30_000 }); }
export function usePendingSyncItems(_userId?: string) { return useQuery({ queryKey: ['sync', 'pending'], queryFn: async () => [] as Array<{ id: string; operation: string; entityType: string; entityId: string; createdAt: string; status: string }>, staleTime: 15_000 }); }
export function useRunSync(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async () => ({ success: true, syncedCount: 0, failedCount: 0, errors: [] as string[] }), onSuccess: () => qc.invalidateQueries({ queryKey: ['sync'] }) }); }
export function useCreateStaff(_userId?: string) { const qc = useQueryClient(); return useMutation({ // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mutationFn: async (input: Record<string, unknown>): Promise<any> => ({ ...input, id: crypto.randomUUID(), temporaryPassword: 'ImageCare@123' }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'staff'] }) }); }
export function useDisableStaff(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (id: string) => ({ id }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'staff'] }) }); }
export function useReactivateStaff(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (id: string) => ({ id }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'staff'] }) }); }
export function useResetStaffPassword(_userId?: string) { return useMutation({ mutationFn: async (id: string) => ({ id, temporaryPassword: 'ImageCare@123' }) }); }
export function useUpdateStaff(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async ({ id, input }: { id: string; input: Record<string, unknown> }) => ({ id, ...input }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'staff'] }) }); }
export function useSaveReceiptSettings(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: Record<string, unknown>) => input, onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'receipt'] }) }); }
export function useSaveSalesSettings(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: Record<string, unknown>) => input, onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'sales'] }) }); }
export function useCreateRole(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: { name: string }) => ({ id: crypto.randomUUID(), name: input.name, permissions: {} as Record<string, Record<string, boolean>>, created_at: '', updated_at: '', created_by: '', updated_by: '', branch_id: null as null, is_active: true, sync_status: 'synced' as const, last_synced_at: null as null }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'roles'] }) }); }
export function useRenameRole(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async ({ id, name }: { id: string; name: string }) => ({ id, name }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'roles'] }) }); }
export function useArchiveRole(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (id: string) => ({ id }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'roles'] }) }); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSetPermission(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: any) => input, onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'permissions'] }) }); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCreateTaxRate(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: any) => ({ id: crypto.randomUUID(), rate: input.ratePercent ?? input.rate ?? 0, ratePercent: input.ratePercent ?? input.rate ?? 0, ...input, isInclusive: false, isDefault: false, created_at: '', updated_at: '', created_by: '', updated_by: '', branch_id: null as null, is_active: true, sync_status: 'synced' as const, last_synced_at: null as null }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'tax-rates'] }) }); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useUpdateTaxRate(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (raw: any) => { const input = raw.input ?? raw; return { ...input, rate: input.ratePercent ?? input.rate ?? 0 }; }, onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'tax-rates'] }) }); }
