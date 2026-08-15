// ============================================================
// ImageCare ERP - Permission Guards
// File: src/components/guards/PermissionGuard.tsx
// Purpose: Permission-aware UI components.
//
// IMPORTANT: Frontend permission checks are a USABILITY layer only.
// They hide UI that the user cannot access. They do not replace
// backend RLS which is the authoritative security boundary.
//
// isContextStale: when true, the user context visible in the app
// is from sessionStorage while the authoritative backend load is
// in progress. Permission guards block rendering while stale to
// prevent acting on potentially outdated permission state.
// ============================================================

import React, { type ReactNode } from 'react';
import { useApp } from '../../context/AppContext';
import { usePermission } from '../../hooks/usePermission';
import type { ModuleName } from '../../config/env';
import type { ModulePermissions } from '../../types/app';

// ---- PermissionGuard ---------------------------------------
// Renders children only when:
//   1. User context is authenticated and not stale
//   2. User has the required permission

interface PermissionGuardProps {
  module:   ModuleName | string;
  action:   keyof Omit<ModulePermissions, 'branch_scope'>;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGuard({
  module, action, children, fallback = null,
}: PermissionGuardProps) {
  const { userContext, isContextStale } = useApp();
  const { can } = usePermission(userContext);

  // Block rendering while the authoritative context is still loading.
  // This prevents acting on stale sessionStorage-cached permissions.
  if (isContextStale) return null;

  if (!can(module, action)) return <>{fallback}</>;
  return <>{children}</>;
}

// ---- AuthGuard ---------------------------------------------
// Renders children only when authenticated.

interface AuthGuardProps {
  children:  ReactNode;
  fallback?: ReactNode;
}

export function AuthGuard({ children, fallback = null }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useApp();
  if (isLoading) return null;
  if (!isAuthenticated) return <>{fallback}</>;
  return <>{children}</>;
}

// ---- PermissionButton --------------------------------------
// Renders a disabled button when permission is denied.
// Also disabled while context is stale.

interface PermissionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  module:          ModuleName | string;
  action:          keyof Omit<ModulePermissions, 'branch_scope'>;
  hideWhenDenied?: boolean;
  children:        ReactNode;
}

export function PermissionButton({
  module, action, hideWhenDenied = false, children, ...buttonProps
}: PermissionButtonProps) {
  const { userContext, isContextStale } = useApp();
  const { can } = usePermission(userContext);
  const hasPermission = can(module, action) && !isContextStale;

  if (!hasPermission && hideWhenDenied) return null;

  return (
    <button
      {...buttonProps}
      disabled={!hasPermission || buttonProps.disabled}
      title={!hasPermission
        ? isContextStale
          ? 'Loading permissions...'
          : 'You do not have permission for this action'
        : buttonProps.title}
    >
      {children}
    </button>
  );
}

// ---- BranchGuard -------------------------------------------
// Renders children only when the user can access the given branch.

interface BranchGuardProps {
  branchId:  string;
  children:  ReactNode;
  fallback?: ReactNode;
}

export function BranchGuard({ branchId, children, fallback = null }: BranchGuardProps) {
  const { userContext, isContextStale } = useApp();
  const { canAccessBranch } = usePermission(userContext);

  if (isContextStale) return null;
  if (!canAccessBranch(branchId)) return <>{fallback}</>;
  return <>{children}</>;
}
