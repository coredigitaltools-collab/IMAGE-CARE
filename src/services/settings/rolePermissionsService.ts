// ============================================================
// ImageCare ERP - Real Roles & Permissions service
// File: src/services/settings/rolePermissionsService.ts
//
// Bug fix (2026-09-05): "check the sales tab, when the staff is using
// it... they see more than what is in their permission." Investigation
// (see claude/pos-staff-permission-enforcement-2026-09-05.md) found:
//
//   1. The PIN staff-switcher (0030_stage9_pin_staff.sql) never changes
//      auth.uid()/RLS - it only labels who's operating an already-
//      authenticated (owner's) session. Every app-level canDo() check
//      (including the ones already in services/sales/salesService.ts)
//      was therefore always checking the OWNER's permissions, never the
//      switched-in staff member's own.
//   2. Neither staff account in this business had ANY real permission
//      configured - the Settings > People & Access "Permission matrix"
//      (src/services/roleService.ts + src/services/permissionsService.ts)
//      only ever wrote to browser localStorage, never to the real
//      imagecare.permission_groups/group_permissions/
//      permission_group_members/user_permissions tables that
//      fn_get_user_context() actually reads.
//
// This file is the real, Supabase-backed replacement for both of those
// local-only services:
//   - listRoles/createRole/archiveRole:      imagecare.permission_groups
//   - getPermissionMatrix/setPermission:     imagecare.group_permissions
//   - assignRoleToUser:                      imagecare.permission_group_members
//   - getStaffEffectivePermissions:          resolves ONE staff member's
//     real, merged permissions + branch list (group + direct grants,
//     most-permissive-wins) - mirrors the exact algorithm
//     fn_get_user_context() uses server-side (0002_stage1_branch_authorization.sql),
//     just running client-side for a TARGET staff id instead of the
//     caller's own auth.uid(). This is safe without a new database
//     function because RLS already lets the business owner read any of
//     these tables for their own business (rls_s1_up_select,
//     rls_s1_pgm_select, rls_s1_gp_select, rls_s1_pg_select - see
//     0001_stage1_foundation.sql) - and only the owner ever calls this
//     (the PIN staff-switcher only runs on the owner's authenticated
//     session).
//
// The Permission Matrix UI (PermissionMatrixTable.tsx) is a coarse,
// one-checkbox-per-module model (12 "Permission" values, see
// types/settings.ts) layered on top of the real, fine-grained
// ModulePermissions shape (view/create/edit/delete/approve/export/sync
// per real module, see types/app.ts). PERMISSION_MODULE_MAP below is
// the deliberate, documented translation between the two: a "manage_X"
// checkbox grants/revokes ALL actions on its real module together (the
// label says "manage", not "view"), while "view_reports" only grants
// view+export (read-only by its own label). "view_dashboard" has no
// real module of its own - nothing in the app actually gates on a
// "dashboard" permission (Dashboard/Reports nav items are always shown
// regardless of permission, see AppShell.tsx's NAV_ITEMS handling of
// module 'reports') - so that checkbox stays informational only, exactly
// as harmless as it already was.
// ============================================================

import { supabase } from '../../lib/supabase';
import type { UserContext, ModulePermissions, BranchAccess } from '../../types/app';
import type { Permission, PermissionMatrix, RoleDefinition } from '../../types/settings';
import { PERMISSIONS } from '../../types/settings';
import {
  DuplicateRoleNameError,
  OwnerRoleProtectedError,
} from '../roleService';
import { OwnerPermissionsLockedError } from '../permissionsService';
import { OWNER_ROLE_ID } from '../../types/settings';

function emptyModulePermissions(): ModulePermissions {
  return {
    view: false, create: false, edit: false, delete: false,
    approve: false, export: false, sync: false, branch_scope: 'assigned',
  };
}

function emptyPermissionRow(): Record<Permission, boolean> {
  return Object.fromEntries(PERMISSIONS.map((p) => [p, false])) as Record<Permission, boolean>;
}

// ---- Coarse Permission <-> real module translation ----------
// 'full': the checkbox sets/reads view+create+edit+delete+approve+
//         export+sync together (a "manage" checkbox).
// 'view': the checkbox sets/reads only view+export (a "view" checkbox);
//         reading back uses `view` as the representative flag.
// null:   no real module backs this checkbox (see file header note on
//         view_dashboard) - it is stored nowhere real and always reads
//         as false; setting it is a no-op.
const PERMISSION_MODULE_MAP: Record<Permission, { module: string; kind: 'full' | 'view' } | null> = {
  view_dashboard:    null,
  manage_inventory:  { module: 'inventory', kind: 'full' },
  manage_sales:      { module: 'sales', kind: 'full' },
  manage_purchases:  { module: 'purchases', kind: 'full' },
  manage_expenses:   { module: 'expenses', kind: 'full' },
  manage_payroll:    { module: 'payroll', kind: 'full' },
  manage_clients:    { module: 'customers', kind: 'full' },
  manage_credit:     { module: 'credit', kind: 'full' },
  manage_invoices:   { module: 'invoices', kind: 'full' },
  manage_staff:      { module: 'users', kind: 'full' },
  manage_settings:   { module: 'settings', kind: 'full' },
  view_reports:      { module: 'reports', kind: 'view' },
};

interface GroupPermissionRow {
  permission_group_id: string;
  module: string;
  can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean;
  can_approve: boolean; can_export: boolean; can_sync: boolean;
}

// ---- Roles (imagecare.permission_groups) ---------------------

export async function listRoles(ctx: UserContext): Promise<RoleDefinition[]> {
  const { data, error } = await supabase.schema('imagecare').from('permission_groups')
    .select('id, name, is_active, created_at, updated_at, created_by')
    .eq('business_id', ctx.business_id)
    .is('deleted_at', null)
    .order('created_at');
  if (error) throw new Error('Failed to load roles.');
  return (data ?? []).map((r): RoleDefinition => ({
    id: r.id,
    name: r.name,
    is_active: r.is_active,
    branch_id: null,
    created_at: r.created_at,
    updated_at: r.updated_at ?? r.created_at,
    created_by: r.created_by ?? '',
    updated_by: r.created_by ?? '',
    sync_status: 'synced',
    last_synced_at: null,
  }));
}

export async function createRole(ctx: UserContext, name: string): Promise<RoleDefinition> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Role name is required.');

  const existing = await listRoles(ctx);
  if (existing.some((r) => r.is_active && r.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new DuplicateRoleNameError();
  }

  const { data, error } = await supabase.schema('imagecare').from('permission_groups')
    .insert({ business_id: ctx.business_id, name: trimmed, is_active: true, created_by: ctx.user_id })
    .select('id, name, is_active, created_at, updated_at, created_by')
    .single();
  if (error || !data) throw new Error('Could not create this role.');

  return {
    id: data.id, name: data.name, is_active: data.is_active, branch_id: null,
    created_at: data.created_at, updated_at: data.updated_at ?? data.created_at,
    created_by: data.created_by ?? '', updated_by: data.created_by ?? '',
    sync_status: 'synced', last_synced_at: null,
  };
}

// Caller (useArchiveRole) still computes activeAssigneeCount from real
// staff data first, exactly as it already does against the local
// roleService.archiveRole - unchanged, just pointed at this real version.
export async function archiveRole(ctx: UserContext, id: string, activeAssigneeCount: number): Promise<void> {
  if (id === OWNER_ROLE_ID) throw new OwnerRoleProtectedError();
  const { RoleInUseError } = await import('../roleService');
  if (activeAssigneeCount > 0) throw new RoleInUseError(activeAssigneeCount);

  const { error } = await supabase.schema('imagecare').from('permission_groups')
    .update({ is_active: false })
    .eq('id', id)
    .eq('business_id', ctx.business_id);
  if (error) throw new Error('Could not remove this role.');
}

// ---- Permission matrix (imagecare.group_permissions) ---------

export async function getPermissionMatrix(ctx: UserContext): Promise<PermissionMatrix> {
  const roles = await listRoles(ctx);
  const activeRoles = roles.filter((r) => r.is_active);
  if (activeRoles.length === 0) return {};

  const { data, error } = await supabase.schema('imagecare').from('group_permissions')
    .select('permission_group_id, module, can_view, can_create, can_edit, can_delete, can_approve, can_export, can_sync')
    .eq('business_id', ctx.business_id)
    .in('permission_group_id', activeRoles.map((r) => r.id));
  if (error) throw new Error('Failed to load the permission matrix.');

  const rows = (data ?? []) as GroupPermissionRow[];
  const matrix: PermissionMatrix = {};
  for (const role of activeRoles) {
    const row = emptyPermissionRow();
    for (const permission of PERMISSIONS) {
      const mapping = PERMISSION_MODULE_MAP[permission];
      if (!mapping) continue;
      const gp = rows.find((r) => r.permission_group_id === role.id && r.module === mapping.module);
      row[permission] = gp ? gp.can_view : false;
    }
    matrix[role.id] = row;
  }
  return matrix;
}

export async function setPermission(
  ctx: UserContext,
  role: string,
  permission: Permission,
  granted: boolean,
): Promise<void> {
  if (role === OWNER_ROLE_ID) throw new OwnerPermissionsLockedError();
  const mapping = PERMISSION_MODULE_MAP[permission];
  if (!mapping) return; // view_dashboard - no real module, nothing to persist.

  const actions = mapping.kind === 'full'
    ? { can_view: granted, can_create: granted, can_edit: granted, can_delete: granted, can_approve: granted, can_export: granted, can_sync: granted }
    : { can_view: granted, can_create: false, can_edit: false, can_delete: false, can_approve: false, can_export: granted, can_sync: false };

  const { error } = await supabase.schema('imagecare').from('group_permissions')
    .upsert(
      { business_id: ctx.business_id, permission_group_id: role, module: mapping.module, branch_scope: 'assigned', ...actions },
      { onConflict: 'permission_group_id,module' },
    );
  if (error) throw new Error('Could not save this permission change.');
}

// ---- Role assignment (imagecare.permission_group_members) -----
// A staff member has exactly one role at a time (the same model the
// existing users.role text column already assumes) - this replaces
// whichever group membership they had, rather than adding to it.

export async function assignRoleToUser(ctx: UserContext, userId: string, roleId: string): Promise<void> {
  const { error: delErr } = await supabase.schema('imagecare').from('permission_group_members')
    .delete().eq('business_id', ctx.business_id).eq('user_id', userId);
  if (delErr) throw new Error('Could not update this staff member’s role.');

  if (roleId === OWNER_ROLE_ID) return; // "Owner" isn't a real permission_groups row - is_owner covers it.

  const { error: insErr } = await supabase.schema('imagecare').from('permission_group_members')
    .insert({ business_id: ctx.business_id, user_id: userId, permission_group_id: roleId, assigned_by: ctx.user_id });
  // A role id that doesn't exist as a real permission_groups row (e.g. a
  // leftover local-only role id from before this fix) fails the FK
  // constraint - non-fatal here, the staff member just has no group
  // membership until re-assigned to a role created after this fix.
  if (insErr) return;
}

// ---- Effective permissions for ONE staff member ----------------
// Mirrors fn_get_user_context()'s permission/branch resolution
// (0002_stage1_branch_authorization.sql) exactly, but for a target
// staff id rather than the caller's own auth.uid() - see file header.

export interface StaffEffectiveContext {
  permissions: Record<string, ModulePermissions>;
  branches: BranchAccess[];
  branch_id: string | null;
}

function mergeModulePermissions(
  target: Record<string, ModulePermissions>,
  module: string,
  row: { can_view: boolean; can_create: boolean; can_edit: boolean; can_delete: boolean; can_approve: boolean; can_export: boolean; can_sync: boolean; branch_scope: string },
): void {
  const existing = target[module] ?? emptyModulePermissions();
  target[module] = {
    view:    existing.view    || row.can_view,
    create:  existing.create  || row.can_create,
    edit:    existing.edit    || row.can_edit,
    delete:  existing.delete  || row.can_delete,
    approve: existing.approve || row.can_approve,
    export:  existing.export  || row.can_export,
    sync:    existing.sync    || row.can_sync,
    branch_scope: existing.branch_scope === 'all' || row.branch_scope === 'all' ? 'all' : 'assigned',
  };
}

export async function getStaffEffectivePermissions(
  ctx: UserContext,
  staffId: string,
): Promise<StaffEffectiveContext> {
  const [staffRowResp, membershipsResp, directResp, branchAccessResp] = await Promise.all([
    supabase.schema('imagecare').from('users').select('branch_id').eq('id', staffId).eq('business_id', ctx.business_id).single(),
    supabase.schema('imagecare').from('permission_group_members').select('permission_group_id').eq('business_id', ctx.business_id).eq('user_id', staffId),
    supabase.schema('imagecare').from('user_permissions')
      .select('module, can_view, can_create, can_edit, can_delete, can_approve, can_export, can_sync, branch_scope')
      .eq('business_id', ctx.business_id).eq('user_id', staffId),
    supabase.schema('imagecare').from('user_branch_access').select('branch_id, can_transact').eq('business_id', ctx.business_id).eq('user_id', staffId),
  ]);

  const permissions: Record<string, ModulePermissions> = {};

  const groupIds = (membershipsResp.data ?? []).map((m: { permission_group_id: string }) => m.permission_group_id);
  if (groupIds.length > 0) {
    const { data: groupPerms } = await supabase.schema('imagecare').from('group_permissions')
      .select('module, can_view, can_create, can_edit, can_delete, can_approve, can_export, can_sync, branch_scope')
      .eq('business_id', ctx.business_id).in('permission_group_id', groupIds);
    for (const row of groupPerms ?? []) mergeModulePermissions(permissions, row.module, row);
  }

  for (const row of directResp.data ?? []) mergeModulePermissions(permissions, row.module, row);

  const homeBranchId: string | null = staffRowResp.data?.branch_id ?? null;
  const branchMap = new Map<string, boolean>();
  if (homeBranchId) branchMap.set(homeBranchId, true);
  for (const g of branchAccessResp.data ?? []) {
    branchMap.set(g.branch_id, g.can_transact ?? true);
  }
  const branches: BranchAccess[] = Array.from(branchMap.entries()).map(([branch_id, can_transact]) => ({ branch_id, can_transact }));

  return { permissions, branches, branch_id: homeBranchId };
}
