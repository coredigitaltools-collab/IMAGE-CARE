// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/hooks/usePermission.ts
// Purpose: React hook for centralized permission checks.
//          All permission guards in the UI use this hook.
//          Never check permissions inline in component JSX.
// ============================================================

import { useCallback } from 'react';
import { canDo, getModulePermission } from '../types/app';
import type { UserContext, ModulePermissions } from '../types/app';
import type { ModuleName } from '../config/env';

// Usage in components:
//   const { can, modulePerms } = usePermission(userContext);
//   if (!can('sales', 'create')) return <AccessDenied />;

interface UsePermissionReturn {
  // Check a specific action on a module
  can: (module: ModuleName | string, action: keyof Omit<ModulePermissions, 'branch_scope'>) => boolean;
  // Get all permissions for a module
  modulePerms: (module: ModuleName | string) => ModulePermissions;
  // Whether the user has any access to a module
  hasAnyAccess: (module: ModuleName | string) => boolean;
  // Whether the user can access all branches (not just assigned)
  canAccessAllBranches: (module: ModuleName | string) => boolean;
  // Whether the user can access a specific branch
  canAccessBranch: (branchId: string) => boolean;
  // Whether the user is the owner (has all permissions)
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
      // User's home branch is always accessible
      if (ctx.branch_id === branchId) return true;
      // Check explicit branch access grants
      return ctx.branches.some(b => b.branch_id === branchId);
    },
    [ctx]
  );

  // Owner has view + create + edit + delete on all modules
  const isOwner = ctx
    ? Object.values(ctx.permissions).some(
        p => p.view && p.create && p.edit && p.delete && p.branch_scope === 'all'
      )
    : false;

  return { can, modulePerms, hasAnyAccess, canAccessAllBranches, canAccessBranch, isOwner };
}

function noPermissions(): ModulePermissions {
  return {
    view: false, create: false, edit: false,
    delete: false, approve: false, export: false,
    sync: false, branch_scope: 'assigned',
  };
}
