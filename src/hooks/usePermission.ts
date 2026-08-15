// ============================================================
// ImageCare ERP - Permission Hook
// File: src/hooks/usePermission.ts
// Purpose: React hook for permission checks.
//
// ARCHITECTURE:
// - can(module, action): checks the permissions map loaded from DB
// - isOwner: reads ctx.is_owner which is an explicit DB field
//   (imagecare.users.is_owner). NEVER inferred from permissions.
// - role is never checked here - it is a display label only.
// ============================================================

import { useCallback } from 'react';
import { canDo, getModulePermission } from '../types/app';
import type { UserContext, ModulePermissions } from '../types/app';
import type { ModuleName } from '../config/env';

interface UsePermissionReturn {
  // Check a specific action on a module (uses permissions map)
  can: (module: ModuleName | string, action: keyof Omit<ModulePermissions, 'branch_scope'>) => boolean;
  // Get all permissions for a module
  modulePerms: (module: ModuleName | string) => ModulePermissions;
  // Whether user has any access to a module
  hasAnyAccess: (module: ModuleName | string) => boolean;
  // Whether user can access all branches on this module
  canAccessAllBranches: (module: ModuleName | string) => boolean;
  // Whether user can access a specific branch
  canAccessBranch: (branchId: string) => boolean;
  // is_owner: explicit database field. TRUE means this user is the business owner.
  // Owners can manage permissions, groups, and branch access.
  // This is read directly from ctx.is_owner - NEVER derived from permission combinations.
  isOwner: boolean;
}

export function usePermission(ctx: UserContext | null): UsePermissionReturn {
  const can = useCallback(
    (module: string, action: keyof Omit<ModulePermissions, 'branch_scope'>): boolean => {
      if (!ctx) return false;
      return canDo(ctx, module, action);
    },
    [ctx]
  );

  const modulePerms = useCallback(
    (module: string): ModulePermissions => {
      if (!ctx) return noPermissions();
      return getModulePermission(ctx, module);
    },
    [ctx]
  );

  const hasAnyAccess = useCallback(
    (module: string): boolean => {
      if (!ctx) return false;
      const perms = getModulePermission(ctx, module);
      return perms.view || perms.create || perms.edit || perms.delete;
    },
    [ctx]
  );

  const canAccessAllBranches = useCallback(
    (module: string): boolean => {
      if (!ctx) return false;
      return getModulePermission(ctx, module).branch_scope === 'all';
    },
    [ctx]
  );

  const canAccessBranch = useCallback(
    (branchId: string): boolean => {
      if (!ctx) return false;
      if (ctx.branch_id === branchId) return true;
      if (ctx.is_owner) return true;
      return ctx.branches.some(b => b.branch_id === branchId);
    },
    [ctx]
  );

  // is_owner: read directly from the user context which loaded it from
  // imagecare.users.is_owner via fn_get_user_context().
  // This is an explicit database column - NOT derived from permissions.
  const isOwner = ctx?.is_owner ?? false;

  return { can, modulePerms, hasAnyAccess, canAccessAllBranches, canAccessBranch, isOwner };
}

function noPermissions(): ModulePermissions {
  return {
    view: false, create: false, edit: false,
    delete: false, approve: false, export: false,
    sync: false, branch_scope: 'assigned',
  };
}
