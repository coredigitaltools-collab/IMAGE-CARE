// ============================================================
// ImageCare ERP - Application Types
// File: src/types/app.ts
// Purpose: Application-level types - user context, permissions,
//          error codes, and standardized API response shapes.
//
// PERMISSION ARCHITECTURE NOTE:
// Authorization in ImageCare is determined by:
//   1. is_owner (explicit DB field) - owners manage all permissions
//   2. permissions map (from group_permissions + user_permissions)
//
// The user's role field is a DISPLAY LABEL only (e.g. "Cashier",
// "Branch Manager"). It is never checked for authorization.
// Permission groups are owner-managed collections - not fixed roles.
// ============================================================

import type { UUID } from './database';
import { mapErrorCode, serviceFail, serviceOk, type ServiceResponse } from './contracts';

// ---- Permissions -------------------------------------------

export interface ModulePermissions {
  view:         boolean;
  create:       boolean;
  edit:         boolean;
  delete:       boolean;
  approve:      boolean;
  export:       boolean;
  sync:         boolean;
  branch_scope: 'assigned' | 'all';
}

export interface BranchAccess {
  branch_id:    UUID;
  can_transact: boolean;
}

// ---- User Context ------------------------------------------
// Loaded once after login via imagecare.fn_get_user_context().
// Stored in sessionStorage. Refreshed on permission changes.

export interface UserContext {
  user_id:     UUID;
  business_id: UUID;
  branch_id:   UUID | null;
  email:       string;
  first_name:  string;
  last_name:   string;

  // role: DISPLAY LABEL only. Examples: "Cashier", "Branch Manager",
  // "Stock Controller". This field is NEVER checked for authorization.
  // The owner assigns role labels; they carry no access implications.
  role:        string;

  // is_owner: explicit field from imagecare.users.is_owner (a database column).
  // TRUE means this user is the business owner and can:
  //   - Manage other users' permission groups
  //   - Grant/revoke direct user permissions
  //   - Assign/remove branch access
  //   - Create and modify permission groups
  // NEVER derived by counting permissions or checking permission combinations.
  // Set only at provisioning or by owner self-designation in the database.
  is_owner:    boolean;

  is_active:   boolean;
  permissions: Record<string, ModulePermissions>;
  branches:    BranchAccess[];
}

// ---- Permission helpers ------------------------------------

export function getModulePermission(
  ctx: UserContext,
  module: string
): ModulePermissions {
  return (
    ctx.permissions[module] ?? {
      view: false, create: false, edit: false,
      delete: false, approve: false, export: false,
      sync: false, branch_scope: 'assigned',
    }
  );
}

export function canDo(
  ctx: UserContext,
  module: string,
  action: keyof Omit<ModulePermissions, 'branch_scope'>
): boolean {
  return getModulePermission(ctx, module)[action] ?? false;
}

// ---- Error Architecture ------------------------------------
// Standardized error codes. Never expose SQL or stack traces.

export type AppErrorCode =
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'BRANCH_ACCESS_DENIED'
  | 'ACCOUNT_SUSPENDED'
  | 'VALIDATION_ERROR'
  | 'AMOUNT_MISMATCH'
  | 'INVALID_AMOUNT'
  | 'INVALID_STATUS_TRANSITION'
  | 'MISSING_REQUIRED_FIELD'
  | 'INSUFFICIENT_STOCK'
  | 'CREDIT_LIMIT_EXCEEDED'
  | 'OVERPAYMENT'
  | 'RECORD_NOT_FOUND'
  | 'DUPLICATE_TRANSACTION'
  | 'IMMUTABLE_RECORD'
  | 'PRODUCT_NOT_SELLABLE'
  | 'PRODUCT_NOT_PURCHASABLE'
  | 'BUSINESS_INACTIVE'
  | 'BRANCH_INACTIVE'
  | 'IDEMPOTENCY_IN_FLIGHT'
  | 'SYNC_CONFLICT'
  | 'SYNC_FAILED'
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

export interface AppError {
  code:    AppErrorCode;
  message: string;
  detail?: string;
  field?:  string;
}

export class ImageCareError extends Error {
  readonly code:    AppErrorCode;
  readonly detail?: string;
  readonly field?:  string;

  constructor(code: AppErrorCode, message: string, detail?: string, field?: string) {
    super(message);
    this.name   = 'ImageCareError';
    this.code   = code;
    this.detail = detail;
    this.field  = field;
  }
}

export function parseError(err: unknown): AppError {
  if (err instanceof ImageCareError) {
    return { code: err.code, message: err.message, detail: err.detail, field: err.field };
  }

  const raw = err instanceof Error ? err.message : String(err);

  if (raw.includes('INSUFFICIENT_STOCK'))        return { code: 'INSUFFICIENT_STOCK',        message: 'Insufficient stock to complete this operation.' };
  if (raw.includes('PERMISSION_DENIED'))         return { code: 'PERMISSION_DENIED',         message: 'You do not have permission to perform this action.' };
  if (raw.includes('BRANCH_ACCESS_DENIED'))      return { code: 'BRANCH_ACCESS_DENIED',      message: 'You do not have access to this branch.' };
  if (raw.includes('CREDIT_LIMIT_EXCEEDED'))     return { code: 'CREDIT_LIMIT_EXCEEDED',     message: 'This would exceed the customer credit limit.' };
  if (raw.includes('INVALID_STATUS_TRANSITION')) return { code: 'INVALID_STATUS_TRANSITION', message: 'This status change is not allowed.' };
  if (raw.includes('IMMUTABLE_RECORD'))          return { code: 'IMMUTABLE_RECORD',          message: 'This record cannot be edited after confirmation.' };
  if (raw.includes('IDEMPOTENCY_IN_FLIGHT'))     return { code: 'IDEMPOTENCY_IN_FLIGHT',     message: 'This operation is already in progress. Please wait.' };
  if (raw.includes('AMOUNT_MISMATCH'))           return { code: 'AMOUNT_MISMATCH',           message: 'Transaction amounts do not balance.' };
  if (raw.includes('DUPLICATE_TRANSACTION'))     return { code: 'DUPLICATE_TRANSACTION',     message: 'This transaction has already been recorded.' };
  if (raw.includes('USER_NOT_FOUND'))            return { code: 'AUTH_INVALID',              message: 'Account not found for this business.' };
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return { code: 'NETWORK_ERROR', message: 'Network error. Please check your connection.' };
  }

  return { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.' };
}

// ---- API result shape --------------------------------------

/** @deprecated Kept as a source-compatible alias while legacy services migrate.
 * ServiceResponse is the single service contract. */
export type ApiResult<T> = ServiceResponse<T>;

export function ok<T>(data: T): ApiResult<T> {
  return serviceOk(data);
}

export function fail<T>(error: AppError): ApiResult<T> {
  return serviceFail(mapErrorCode(error.code), error.message, {
    field: error.field,
    detail: error.detail,
  });
}

// ---- Pagination --------------------------------------------

export interface CursorPage<T> {
  items:            T[];
  next_cursor_date: string | null;
  next_cursor_id:   string | null;
  has_more:         boolean;
}

export type SortOrder = 'asc' | 'desc';

export interface DateRange {
  from: string;
  to:   string;
}
