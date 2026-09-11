// ============================================================
// File: src/__tests__/services/rolePermissionsService.test.ts
// Purpose: Service contract tests for the real (Supabase-backed) roles
//          & permissions service - src/services/settings/rolePermissionsService.ts.
//          Added while closing the CI coverage gate. Exercises the real
//          coarse-Permission <-> real-module translation, the owner-role
//          protections, and the most-permissive-wins merge algorithm -
//          not stub assertions.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUserContext, TEST_BUSINESS_ID } from '../setup';
import { OWNER_ROLE_ID } from '../../types/settings';
import { OwnerRoleProtectedError, RoleInUseError, DuplicateRoleNameError } from '../../services/roleService';
import { OwnerPermissionsLockedError } from '../../services/permissionsService';

// FIFO queue of chain results, table-agnostic - the same pattern used
// elsewhere in this coverage pass (see loyaltyService.test.ts /
// salesTargetsRealService.test.ts) since these functions issue several
// distinct queries per call in a fixed, known order.
const { chain, push, reset } = vi.hoisted(() => {
  const queue: Array<{ data: unknown; error: unknown }> = [];
  const EMPTY = { data: null, error: null };
  const c: Record<string, unknown> = {};
  for (const m of ['schema', 'from', 'select', 'insert', 'update', 'delete', 'upsert', 'eq', 'is', 'in', 'order']) {
    c[m] = vi.fn(() => c);
  }
  const nextOrEmpty = () => queue.shift() ?? EMPTY;
  c.single = vi.fn(() => Promise.resolve(nextOrEmpty()));
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(nextOrEmpty()).then(resolve, reject);
  return {
    chain: c,
    push: (r: { data: unknown; error: unknown }) => queue.push(r),
    reset: () => { queue.length = 0; },
  };
});

vi.mock('../../lib/supabase', () => ({ supabase: chain, default: chain }));

import {
  listRoles,
  createRole,
  archiveRole,
  getPermissionMatrix,
  setPermission,
  assignRoleToUser,
  getStaffEffectivePermissions,
} from '../../services/settings/rolePermissionsService';

beforeEach(() => {
  reset();
  // Clear call history (not just the result queue) so an assertion like
  // `expect(chain.insert).not.toHaveBeenCalled()` in one test isn't
  // tripped by calls recorded during an earlier test - the chain mock
  // methods are shared vi.fn() instances across every test in this file.
  vi.clearAllMocks();
});

function roleRow(overrides: Record<string, unknown> = {}) {
  return { id: 'role-1', name: 'Cashier', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: null, created_by: 'user-test-001', ...overrides };
}

// ---- listRoles -----------------------------------------------------

describe('listRoles', () => {
  it('maps rows into RoleDefinition, defaulting updated_at/created_by/sync_status', async () => {
    push({ data: [roleRow()], error: null });
    const roles = await listRoles(makeUserContext());
    expect(roles).toHaveLength(1);
    expect(roles[0]).toMatchObject({ id: 'role-1', name: 'Cashier', is_active: true, branch_id: null, sync_status: 'synced', last_synced_at: null });
    expect(roles[0].updated_at).toBe('2026-01-01T00:00:00Z'); // falls back to created_at
  });

  it('returns an empty array when there are no roles', async () => {
    push({ data: [], error: null });
    const roles = await listRoles(makeUserContext());
    expect(roles).toEqual([]);
  });

  it('throws a friendly error on a database failure', async () => {
    push({ data: null, error: { message: 'db down' } });
    await expect(listRoles(makeUserContext())).rejects.toThrow('Failed to load roles.');
  });
});

// ---- createRole ------------------------------------------------------

describe('createRole', () => {
  it('rejects an empty (whitespace-only) name', async () => {
    await expect(createRole(makeUserContext(), '   ')).rejects.toThrow('Role name is required.');
  });

  it('throws DuplicateRoleNameError for a case-insensitive match against an active role', async () => {
    push({ data: [roleRow({ name: 'Cashier' })], error: null }); // listRoles() inside createRole
    await expect(createRole(makeUserContext(), 'cashier')).rejects.toThrow(DuplicateRoleNameError);
  });

  it('allows a name matching an archived (inactive) role', async () => {
    push({ data: [roleRow({ name: 'Cashier', is_active: false })], error: null }); // listRoles()
    push({ data: roleRow({ id: 'role-2', name: 'Cashier' }), error: null }); // insert
    const role = await createRole(makeUserContext(), 'Cashier');
    expect(role.id).toBe('role-2');
  });

  it('creates and trims the role name on success', async () => {
    push({ data: [], error: null }); // listRoles()
    push({ data: roleRow({ name: 'Manager' }), error: null }); // insert
    const role = await createRole(makeUserContext(), '  Manager  ');
    expect(role.name).toBe('Manager');
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Manager', business_id: TEST_BUSINESS_ID }));
  });

  it('throws a friendly error when the insert fails', async () => {
    push({ data: [], error: null }); // listRoles()
    push({ data: null, error: { message: 'insert failed' } }); // insert
    await expect(createRole(makeUserContext(), 'Manager')).rejects.toThrow('Could not create this role.');
  });
});

// ---- archiveRole -----------------------------------------------------

describe('archiveRole', () => {
  it('throws OwnerRoleProtectedError for the Owner role id', async () => {
    await expect(archiveRole(makeUserContext(), OWNER_ROLE_ID, 0)).rejects.toThrow(OwnerRoleProtectedError);
  });

  it('throws RoleInUseError when the role has active assignees', async () => {
    await expect(archiveRole(makeUserContext(), 'role-1', 3)).rejects.toThrow(RoleInUseError);
  });

  it('deactivates the role when unused', async () => {
    push({ data: null, error: null }); // update
    await expect(archiveRole(makeUserContext(), 'role-1', 0)).resolves.toBeUndefined();
    expect(chain.update).toHaveBeenCalledWith({ is_active: false });
  });

  it('throws a friendly error when the update fails', async () => {
    push({ data: null, error: { message: 'update failed' } });
    await expect(archiveRole(makeUserContext(), 'role-1', 0)).rejects.toThrow('Could not remove this role.');
  });
});

// ---- getPermissionMatrix ----------------------------------------------

describe('getPermissionMatrix', () => {
  it('returns an empty matrix when there are no active roles', async () => {
    push({ data: [roleRow({ is_active: false })], error: null }); // listRoles()
    const matrix = await getPermissionMatrix(makeUserContext());
    expect(matrix).toEqual({});
  });

  it('maps manage_* checkboxes from can_view on the full-kind module row', async () => {
    push({ data: [roleRow()], error: null }); // listRoles()
    push({
      data: [{ permission_group_id: 'role-1', module: 'sales', can_view: true, can_create: true, can_edit: true, can_delete: true, can_approve: true, can_export: true, can_sync: true }],
      error: null,
    }); // group_permissions
    const matrix = await getPermissionMatrix(makeUserContext());
    expect(matrix['role-1'].manage_sales).toBe(true);
    expect(matrix['role-1'].manage_inventory).toBe(false); // no row for inventory
  });

  it('maps view_reports from the reports module row', async () => {
    push({ data: [roleRow()], error: null });
    push({ data: [{ permission_group_id: 'role-1', module: 'reports', can_view: true, can_create: false, can_edit: false, can_delete: false, can_approve: false, can_export: true, can_sync: false }], error: null });
    const matrix = await getPermissionMatrix(makeUserContext());
    expect(matrix['role-1'].view_reports).toBe(true);
  });

  it('always reports view_dashboard as false (no backing module)', async () => {
    push({ data: [roleRow()], error: null });
    push({ data: [], error: null });
    const matrix = await getPermissionMatrix(makeUserContext());
    expect(matrix['role-1'].view_dashboard).toBe(false);
  });

  it('throws a friendly error when the permissions query fails', async () => {
    push({ data: [roleRow()], error: null }); // listRoles()
    push({ data: null, error: { message: 'boom' } }); // group_permissions fails
    await expect(getPermissionMatrix(makeUserContext())).rejects.toThrow('Failed to load the permission matrix.');
  });
});

// ---- setPermission -----------------------------------------------------

describe('setPermission', () => {
  it('throws OwnerPermissionsLockedError for the Owner role id', async () => {
    await expect(setPermission(makeUserContext(), OWNER_ROLE_ID, 'manage_sales', true)).rejects.toThrow(OwnerPermissionsLockedError);
  });

  it('is a no-op for view_dashboard (no backing module)', async () => {
    await expect(setPermission(makeUserContext(), 'role-1', 'view_dashboard', true)).resolves.toBeUndefined();
    expect(chain.upsert).not.toHaveBeenCalled();
  });

  it('sets every action flag together for a "full" kind permission', async () => {
    push({ data: null, error: null });
    await setPermission(makeUserContext(), 'role-1', 'manage_sales', true);
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'sales', can_view: true, can_create: true, can_edit: true, can_delete: true, can_approve: true, can_export: true, can_sync: true }),
      expect.objectContaining({ onConflict: 'permission_group_id,module' }),
    );
  });

  it('sets only view+export for a "view" kind permission', async () => {
    push({ data: null, error: null });
    await setPermission(makeUserContext(), 'role-1', 'view_reports', true);
    expect(chain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'reports', can_view: true, can_create: false, can_edit: false, can_delete: false, can_approve: false, can_export: true, can_sync: false }),
      expect.anything(),
    );
  });

  it('revokes (sets false) correctly for a "full" kind permission', async () => {
    push({ data: null, error: null });
    await setPermission(makeUserContext(), 'role-1', 'manage_sales', false);
    expect(chain.upsert).toHaveBeenCalledWith(expect.objectContaining({ can_view: false, can_create: false }), expect.anything());
  });

  it('throws a friendly error when the upsert fails', async () => {
    push({ data: null, error: { message: 'upsert failed' } });
    await expect(setPermission(makeUserContext(), 'role-1', 'manage_sales', true)).rejects.toThrow('Could not save this permission change.');
  });
});

// ---- assignRoleToUser ---------------------------------------------------

describe('assignRoleToUser', () => {
  it('throws a friendly error when clearing the existing membership fails', async () => {
    push({ data: null, error: { message: 'delete failed' } });
    await expect(assignRoleToUser(makeUserContext(), 'staff-1', 'role-1')).rejects.toThrow('Could not update this staff member’s role.');
  });

  it('returns early for the Owner role id without inserting a membership row', async () => {
    push({ data: null, error: null }); // delete
    await assignRoleToUser(makeUserContext(), 'staff-1', OWNER_ROLE_ID);
    expect(chain.insert).not.toHaveBeenCalled();
  });

  it('inserts the new membership row for a real role', async () => {
    push({ data: null, error: null }); // delete
    push({ data: null, error: null }); // insert
    await assignRoleToUser(makeUserContext(), 'staff-1', 'role-1');
    expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'staff-1', permission_group_id: 'role-1' }));
  });

  it('swallows a non-fatal insert failure (e.g. FK violation on a stale role id)', async () => {
    push({ data: null, error: null }); // delete
    push({ data: null, error: { message: 'FK violation' } }); // insert fails
    await expect(assignRoleToUser(makeUserContext(), 'staff-1', 'role-1')).resolves.toBeUndefined();
  });
});

// ---- getStaffEffectivePermissions -----------------------------------------

describe('getStaffEffectivePermissions', () => {
  it('merges group + direct permissions with most-permissive-wins, and merges branch access', async () => {
    // Promise.all order: staffRow, memberships, direct, branchAccess
    push({ data: { branch_id: 'home-branch' }, error: null }); // staffRow
    push({ data: [{ permission_group_id: 'role-1' }], error: null }); // memberships
    push({ data: [{ module: 'sales', can_view: false, can_create: false, can_edit: false, can_delete: false, can_approve: false, can_export: false, can_sync: false, branch_scope: 'assigned' }], error: null }); // direct
    push({ data: [{ branch_id: 'branch-2', can_transact: true }], error: null }); // branchAccess
    // Sequential group_permissions call (after memberships resolves)
    push({ data: [{ module: 'sales', can_view: true, can_create: true, can_edit: false, can_delete: false, can_approve: false, can_export: false, can_sync: false, branch_scope: 'all' }], error: null }); // group_permissions

    const result = await getStaffEffectivePermissions(makeUserContext(), 'staff-1');

    expect(result.branch_id).toBe('home-branch');
    // most-permissive-wins: group grants view/create even though direct denies them
    expect(result.permissions.sales.view).toBe(true);
    expect(result.permissions.sales.create).toBe(true);
    expect(result.permissions.sales.branch_scope).toBe('all');
    // branches: home branch plus the explicit branch access row
    const branchIds = result.branches.map((b) => b.branch_id).sort();
    expect(branchIds).toEqual(['branch-2', 'home-branch']);
  });

  it('returns empty permissions/branches when the staff member has no group, direct, or branch rows', async () => {
    push({ data: null, error: null }); // staffRow - no home branch
    push({ data: [], error: null }); // memberships - empty, so the group_permissions call is skipped
    push({ data: [], error: null }); // direct
    push({ data: [], error: null }); // branchAccess

    const result = await getStaffEffectivePermissions(makeUserContext(), 'staff-1');

    expect(result.branch_id).toBeNull();
    expect(result.permissions).toEqual({});
    expect(result.branches).toEqual([]);
  });
});
