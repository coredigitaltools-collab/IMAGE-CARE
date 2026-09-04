// Stage 5: Settings feature hooks - rewired to Stage 4 services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUserContext } from '../../../context/AppContext';
import { getBusinessProfile, saveBusinessProfile, listStaff, createStaffMember, updateStaffMember, setStaffActive, getSetting, updateSetting } from '../../../services/settings/settingsService';
import { listBranches, createBranch, updateBranch } from '../../../services/masterData/masterDataService';
import { listRoles, createRole as createRoleReal, renameRole as renameRoleReal, archiveRole as archiveRoleReal } from '../../../services/roleService';
import { getPermissionMatrix, setPermission as setPermissionReal } from '../../../services/permissionsService';
import type { UUID } from '../../../types/database';
import type { Permission, StaffRole, StaffInput } from '../../../types/settings';

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
  return useMutation({ mutationFn: (input: Parameters<typeof createBranch>[1]) => createBranch(ctx, input).then(unwrap), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'branches'] }) });
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

// Roles and the Permission Matrix are now genuinely persisted (IndexedDB,
// via the real, previously-orphaned src/services/roleService.ts and
// permissionsService.ts - see the module comments there for the Owner-role
// protection and role-in-use rules). This makes Save actually stick and
// survive a refresh, which the prior identity-function stubs never did.
// Note: this does NOT change how ctx.permissions/canDo() enforce access at
// runtime - that continues to come from the session's role-based grant as
// it always has, since rewiring live permission ENFORCEMENT is an
// Auth-adjacent change deliberately out of scope for this save-button pass.
export function useRoles(_userId?: string) {
  return useQuery({ queryKey: ['settings', 'roles'], queryFn: () => listRoles() });
}

export function useCreateRole(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => createRoleReal(input, userId ?? ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'roles'] }),
  });
}

export function useRenameRole(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameRoleReal(id, name, userId ?? ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'roles'] }),
  });
}

export function useArchiveRole(userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const staffResult = await listStaff(ctx);
      if (staffResult.error) throw new Error((staffResult.error as { message?: string })?.message ?? 'Failed to check staff assignments.');
      const activeAssignees = ((staffResult.data ?? []) as Array<{ role?: string; is_active?: boolean }>)
        .filter((s) => s.role === id && s.is_active !== false).length;
      return archiveRoleReal(id, userId ?? '', activeAssignees);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'roles'] }),
  });
}

export function usePermissionMatrix(_userId?: string) {
  return useQuery({ queryKey: ['settings', 'permissions'], queryFn: () => getPermissionMatrix() });
}

export function useTaxRates(_userId?: string) {
  return useQuery({
    queryKey: ['settings', 'tax-rates'],
    queryFn: async () => [] as Array<{ id: string; name: string; rate: number; ratePercent: number; isInclusive: boolean; isDefault: boolean; created_at: string; updated_at: string; created_by: string; updated_by: string; branch_id: null; is_active: boolean; sync_status: 'synced'; last_synced_at: null }>,
    staleTime: 5 * 60_000,
  });
}

const RECEIPT_SETTINGS_DEFAULTS = { id: 'default', business_id: '', created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(), created_by: '', updated_by: '', branch_id: null as null, is_active: true, sync_status: 'synced' as const, last_synced_at: null as null, showLogo: true, footerText: '', footerMessage: '', receiptPrefix: 'RCP', showTaxBreakdown: false, showCashierName: true, showCustomerName: true, showPaymentMethod: true, printAutomatically: false };

export function useReceiptSettings(_userId?: string) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['settings', 'receipt', ctx.business_id],
    queryFn: async () => {
      const r = await getSetting(ctx, 'receipt', 'config');
      if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Failed to load receipt settings.');
      return { ...RECEIPT_SETTINGS_DEFAULTS, ...((r.data as object) ?? {}) };
    },
  });
}

const SALES_SETTINGS_DEFAULTS = { allowDiscounts: true, maxDiscountPercent: 100, requireCustomerForCredit: false };

export function useSalesSettings(_userId?: string) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['settings', 'sales', ctx.business_id],
    queryFn: async () => {
      const r = await getSetting(ctx, 'sales_settings', 'config');
      if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Failed to load sales settings.');
      return { ...SALES_SETTINGS_DEFAULTS, ...((r.data as object) ?? {}) };
    },
  });
}

export function useSyncSettings(_userId?: string) { return useQuery({ queryKey: ['settings', 'sync'], queryFn: async () => ({ enabled: false, interval: 60 }), staleTime: Infinity }); }
export function useConfigSettings(_userId?: string) { return useQuery({ queryKey: ['settings', 'config'], queryFn: async () => ({}) as Record<string, unknown>, staleTime: Infinity }); }
export function useSaveConfigSettings(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: Record<string, unknown>) => input, onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'config'] }) }); }
const APPEARANCE_SETTINGS_DEFAULTS = { theme: 'light', primaryColor: '#2563eb', language: 'en', density: 'comfortable' as 'comfortable' | 'compact', dateFormat: 'DD/MM/YYYY' as 'DD/MM/YYYY' | 'MM/DD/YYYY', timeFormat: '12h' };
export function useAppearanceSettings(_userId?: string) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['settings', 'appearance', ctx.business_id],
    queryFn: async () => {
      const r = await getSetting(ctx, 'appearance', 'config');
      if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Failed to load appearance settings.');
      return { ...APPEARANCE_SETTINGS_DEFAULTS, ...((r.data as object) ?? {}) };
    },
  });
}
export function useSaveAppearanceSettings(_userId?: string) {
  const ctx = useUserContext(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const r = await updateSetting(ctx, 'appearance', 'config', input);
      if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Failed to save appearance settings.');
      return input;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'appearance'] }),
  });
}
const INVENTORY_SETTINGS_DEFAULTS = { allowNegativeStock: false, autoReorderEnabled: false, defaultUnit: '', defaultReorderLevel: 5, skuPrefix: 'SKU', trackExpiryDates: false };
export function useInventorySettings(_userId?: string) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['settings', 'inventory', ctx.business_id],
    queryFn: async () => {
      const r = await getSetting(ctx, 'inventory', 'config');
      if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Failed to load inventory settings.');
      return { ...INVENTORY_SETTINGS_DEFAULTS, ...((r.data as object) ?? {}) };
    },
  });
}
export function useSaveInventorySettings(_userId?: string) {
  const ctx = useUserContext(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const r = await updateSetting(ctx, 'inventory', 'config', input);
      if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Failed to save inventory settings.');
      return input;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'inventory'] }),
  });
}
const NOTIFICATION_SETTINGS_DEFAULTS = { lowStockAlerts: true, dailySummary: false, dailySummaryEmail: false, notificationEmail: '' };
export function useNotificationSettings(_userId?: string) {
  const ctx = useUserContext();
  return useQuery({
    queryKey: ['settings', 'notifications', ctx.business_id],
    queryFn: async () => {
      const r = await getSetting(ctx, 'notifications', 'config');
      if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Failed to load notification settings.');
      return { ...NOTIFICATION_SETTINGS_DEFAULTS, ...((r.data as object) ?? {}) };
    },
  });
}
export function useSaveNotificationSettings(_userId?: string) {
  const ctx = useUserContext(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const r = await updateSetting(ctx, 'notifications', 'config', input);
      if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Failed to save notification settings.');
      return input;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'notifications'] }),
  });
}
// Backup history itself has no backing table (a downloaded file leaves this
// device, there's nowhere durable to list it from) - the list intentionally
// stays empty rather than fabricating entries. The download and restore
// mutations below now do real work instead of faking a result, which is
// the actual save-button bug this file needed to fix.
export function useBackupHistory(_userId?: string) { return useQuery({ queryKey: ['settings', 'backups'], queryFn: async () => [] as Array<{ id: string; createdAt: string; sizeBytes: number; status: string; is_active: boolean; created_at: string; updated_at: string; created_by: string; updated_by: string; branch_id: null; sync_status: 'synced'; last_synced_at: null }>, staleTime: Infinity }); }

const BACKUP_SETTINGS_CATEGORIES = ['receipt', 'sales_settings', 'appearance', 'inventory', 'notifications'] as const;

export function useCreateBackup(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const profileResult = await getBusinessProfile(ctx);
      if (profileResult.error) throw new Error((profileResult.error as { message?: string })?.message ?? 'Failed to read business profile.');

      // Each category is an independent read - run them together instead of
      // one round-trip after another.
      const settingsResults = await Promise.all(
        BACKUP_SETTINGS_CATEGORIES.map((category) => getSetting(ctx, category, 'config').then((r) => ({ category, r })))
      );
      const settings: Record<string, unknown> = {};
      for (const { category, r } of settingsResults) {
        if (r.error) throw new Error((r.error as { message?: string })?.message ?? `Failed to read ${category} settings.`);
        settings[category] = r.data ?? null;
      }

      const payload = {
        exportedAt: new Date().toISOString(),
        businessId: ctx.business_id,
        businessProfile: profileResult.data,
        settings,
      };
      const json = JSON.stringify(payload, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `imagecare-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      return { id: crypto.randomUUID(), createdAt: payload.exportedAt, sizeBytes: json.length, status: 'complete' };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'backups'] }),
  });
}

// Restores the business profile and settings groups a backup file actually
// contains (see useCreateBackup above). Staff and branches are deliberately
// NOT restored from a file - they carry relational/uniqueness rules
// (accounts, permissions, foreign keys from sales/inventory/etc.) that a
// blind upsert from an arbitrary JSON file could silently corrupt. Restoring
// those safely is a larger, separate piece of work, not a save-button fix.
export function useRestoreBackup(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fileText: string) => {
      let payload: { businessProfile?: Record<string, unknown>; settings?: Record<string, unknown> };
      try {
        payload = JSON.parse(fileText);
      } catch {
        throw new Error('That file is not a valid ImageCare backup (invalid JSON).');
      }
      if (!payload || typeof payload !== 'object' || (!payload.businessProfile && !payload.settings)) {
        throw new Error('That file is not a valid ImageCare backup.');
      }

      if (payload.businessProfile) {
        const { id: _id, business_id: _bid, ...profileInput } = payload.businessProfile as Record<string, unknown>;
        const r = await saveBusinessProfile(ctx, profileInput);
        if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Failed to restore business profile.');
      }
      if (payload.settings) {
        // Each category is an independent write - run them together.
        const toRestore = BACKUP_SETTINGS_CATEGORIES
          .map((category) => ({ category, value: (payload!.settings as Record<string, unknown>)[category] }))
          .filter((c) => c.value !== undefined && c.value !== null);
        const results = await Promise.all(
          toRestore.map(({ category, value }) => updateSetting(ctx, category, 'config', value).then((r) => ({ category, r })))
        );
        for (const { category, r } of results) {
          if (r.error) throw new Error((r.error as { message?: string })?.message ?? `Failed to restore ${category} settings.`);
        }
      }

      return { restored: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });
}
export function useLastSyncedAt(_userId?: string) { return useQuery({ queryKey: ['sync', 'last-synced'], queryFn: async () => new Date().toISOString(), staleTime: 30_000 }); }
export function usePendingSyncItems(_userId?: string) { return useQuery({ queryKey: ['sync', 'pending'], queryFn: async () => [] as Array<{ id: string; operation: string; entityType: string; entityId: string; createdAt: string; status: string }>, staleTime: 15_000 }); }
export function useRunSync(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async () => ({ success: true, syncedCount: 0, failedCount: 0, errors: [] as string[] }), onSuccess: () => qc.invalidateQueries({ queryKey: ['sync'] }) }); }
// Bug fix (2026-09-04): useCreateStaff used to be a pure mock (`async
// (input) => ({ ...input, id: crypto.randomUUID(), temporaryPassword:
// 'ImageCare@123' })`) that always reported success but never wrote
// anything to Supabase - "Add staff" looked like it worked, but the staff
// member never existed anywhere real, including the "Add employee to
// payroll" dropdown, which reads this same real table. Now calls the
// `create-staff` Edge Function (createStaffMember() in settingsService.ts),
// which uses the Auth Admin API server-side (the service-role key it needs
// can never run in browser code) to create both the real login and the
// imagecare.users row together, and returns a real one-time temporary
// password for the owner to relay to the new staff member.
//
// Reset Password remains a mock for the same underlying reason (setting an
// existing user's password also needs the Auth Admin API) - not touched by
// this fix.
export function useCreateStaff(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StaffInput) => createStaffMember(ctx, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  });
}
export function useResetStaffPassword(_userId?: string) { return useMutation({ mutationFn: async (id: string) => ({ id, temporaryPassword: 'ImageCare@123' }) }); }

// Bug fix (Settings save-button audit 2026-09-03): these three used to be
// identity-function mocks (`async (id) => ({id})`, `async ({id,input}) =>
// ({id,...input})`) that always reported success but never wrote to
// Supabase - a refresh silently discarded every edit/disable/reactivate.
// Now call the real imagecare.users writes in settingsService.ts.
export function useUpdateStaff(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: StaffInput }) => updateStaffMember(ctx, id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  });
}
export function useDisableStaff(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setStaffActive(ctx, id, false),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  });
}
export function useReactivateStaff(_userId?: string) {
  const ctx = useUserContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => setStaffActive(ctx, id, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'staff'] }),
  });
}
export function useSaveReceiptSettings(_userId?: string) {
  const ctx = useUserContext(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const r = await updateSetting(ctx, 'receipt', 'config', input);
      if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Failed to save receipt settings.');
      return input;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'receipt'] }),
  });
}
export function useSaveSalesSettings(_userId?: string) {
  const ctx = useUserContext(); const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Record<string, unknown>) => {
      const r = await updateSetting(ctx, 'sales_settings', 'config', input);
      if (r.error) throw new Error((r.error as { message?: string })?.message ?? 'Failed to save sales settings.');
      return input;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'sales'] }),
  });
}
export function useSetPermission(userId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { role: StaffRole; permission: Permission; granted: boolean }) =>
      setPermissionReal(input.role, input.permission, input.granted, userId ?? ''),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'permissions'] }),
  });
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useCreateTaxRate(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (input: any) => ({ id: crypto.randomUUID(), rate: input.ratePercent ?? input.rate ?? 0, ratePercent: input.ratePercent ?? input.rate ?? 0, ...input, isInclusive: false, isDefault: false, created_at: '', updated_at: '', created_by: '', updated_by: '', branch_id: null as null, is_active: true, sync_status: 'synced' as const, last_synced_at: null as null }), onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'tax-rates'] }) }); }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useUpdateTaxRate(_userId?: string) { const qc = useQueryClient(); return useMutation({ mutationFn: async (raw: any) => { const input = raw.input ?? raw; return { ...input, rate: input.ratePercent ?? input.rate ?? 0 }; }, onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'tax-rates'] }) }); }
