// ============================================================
// IMC-BLD-004 | ImageCare ERP Frontend Integration v1.0
// File: src/components/guards/PermissionGuard.tsx
// Purpose: Permission-aware UI components.
//          Use these instead of inline permission checks in JSX.
//          Frontend restrictions are usability only -
//          backend authorization remains authoritative.
// ============================================================

import React, { type ReactNode } from 'react';
import { useApp } from '../../context/AppContext';
import { usePermission } from '../../hooks/usePermission';
import type { ModuleName } from '../../config/env';
import type { ModulePermissions } from '../../types/app';

// ---- PermissionGuard ---------------------------------------
// Renders children only when the user has the required permission.
// Renders fallback (or nothing) when permission is denied.

interface PermissionGuardProps {
  module:   ModuleName | string;
  action:   keyof Omit<ModulePermissions, 'branch_scope'>;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGuard({
  module,
  action,
  children,
  fallback = null,
}: PermissionGuardProps) {
  const { userContext } = useApp();
  const { can }         = usePermission(userContext);

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
// Renders a disabled/hidden button when permission is denied.

interface PermissionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  module:   ModuleName | string;
  action:   keyof Omit<ModulePermissions, 'branch_scope'>;
  hideWhenDenied?: boolean;
  children: ReactNode;
}

export function PermissionButton({
  module,
  action,
  hideWhenDenied = false,
  children,
  ...buttonProps
}: PermissionButtonProps) {
  const { userContext } = useApp();
  const { can }         = usePermission(userContext);
  const hasPermission   = can(module, action);

  if (!hasPermission && hideWhenDenied) return null;

  return (
    <button
      {...buttonProps}
      disabled={!hasPermission || buttonProps.disabled}
      title={!hasPermission ? 'You do not have permission for this action' : buttonProps.title}
    >
      {children}
    </button>
  );
}

// ---- BranchGuard -------------------------------------------
// Renders children only when the user can access the given branch.

interface BranchGuardProps {
  branchId: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function BranchGuard({ branchId, children, fallback = null }: BranchGuardProps) {
  const { userContext } = useApp();
  const { canAccessBranch } = usePermission(userContext);

  if (!canAccessBranch(branchId)) return <>{fallback}</>;
  return <>{children}</>;
}
