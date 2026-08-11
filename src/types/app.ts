// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/types/app.ts
// Purpose: Application-level types - user context, permissions,
//          error codes, and standardized API response shapes.
// ============================================================

import type { UUID } from './database';

// ---- User Context (from fn_get_user_context) ---------------

export interface ModulePermissions {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  approve: boolean;
  export: boolean;
  sync: boolean;
  branch_scope: 'assigned' | 'all';
}

export interface BranchAccess {
  branch_id: UUID;
  can_transact: boolean;
}

export interface UserContext {
  user_id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  permissions: Record<string, ModulePermissions>;
  branches: BranchAccess[];
}

// Convenience getter
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
  // Auth
  | 'AUTH_REQUIRED'
  | 'AUTH_INVALID'
  | 'AUTH_EXPIRED'
  | 'PERMISSION_DENIED'
  | 'BRANCH_ACCESS_DENIED'
  | 'ACCOUNT_SUSPENDED'
  // Validation
  | 'VALIDATION_ERROR'
  | 'AMOUNT_MISMATCH'
  | 'INVALID_AMOUNT'
  | 'INVALID_STATUS_TRANSITION'
  | 'MISSING_REQUIRED_FIELD'
  // Business rules
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
  // Idempotency
  | 'IDEMPOTENCY_IN_FLIGHT'
  // Sync
  | 'SYNC_CONFLICT'
  | 'SYNC_FAILED'
  // Network / system
  | 'NETWORK_ERROR'
  | 'SERVER_ERROR'
  | 'UNKNOWN_ERROR';

export interface AppError {
  code: AppErrorCode;
  message: string;        // user-facing message (safe to display)
  detail?: string;        // additional context (not shown in production UI)
  field?: string;         // for field-level validation errors
}

export class ImageCareError extends Error {
  readonly code: AppErrorCode;
  readonly detail?: string;
  readonly field?: string;

  constructor(code: AppErrorCode, message: string, detail?: string, field?: string) {
    super(message);
    this.name = 'ImageCareError';
    this.code = code;
    this.detail = detail;
    this.field = field;
  }
}

// Parses a raw error from Supabase/PostgreSQL into an AppError.
// Strips SQL details from user-facing messages.
export function parseError(err: unknown): AppError {
  if (err instanceof ImageCareError) {
    return { code: err.code, message: err.message, detail: err.detail, field: err.field };
  }

  const raw = err instanceof Error ? err.message : String(err);

  // Map PostgreSQL RAISE EXCEPTION codes to AppErrorCodes
  if (raw.includes('INSUFFICIENT_STOCK'))        return { code: 'INSUFFICIENT_STOCK',        message: 'Insufficient stock to complete this operation.' };
  if (raw.includes('PERMISSION_DENIED'))         return { code: 'PERMISSION_DENIED',         message: 'You do not have permission to perform this action.' };
  if (raw.includes('BRANCH_ACCESS_DENIED'))      return { code: 'BRANCH_ACCESS_DENIED',      message: 'You do not have access to this branch.' };
  if (raw.includes('CREDIT_LIMIT_EXCEEDED'))     return { code: 'CREDIT_LIMIT_EXCEEDED',     message: 'This would exceed the customer credit limit.' };
  if (raw.includes('INVALID_STATUS_TRANSITION')) return { code: 'INVALID_STATUS_TRANSITION', message: 'This status change is not allowed.' };
  if (raw.includes('IMMUTABLE_RECORD'))          return { code: 'IMMUTABLE_RECORD',          message: 'This record cannot be edited after confirmation.' };
  if (raw.includes('IDEMPOTENCY_IN_FLIGHT'))     return { code: 'IDEMPOTENCY_IN_FLIGHT',     message: 'This operation is already in progress. Please wait.' };
  if (raw.includes('AMOUNT_MISMATCH'))           return { code: 'AMOUNT_MISMATCH',           message: 'Transaction amounts do not balance. Please check the totals.' };
  if (raw.includes('DUPLICATE_TRANSACTION'))     return { code: 'DUPLICATE_TRANSACTION',     message: 'This transaction has already been recorded.' };

  if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return { code: 'NETWORK_ERROR', message: 'Network error. Please check your connection and try again.' };
  }

  return { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again or contact support.' };
}

// ---- Standardized API response shape -----------------------

export interface ApiResult<T> {
  data: T | null;
  error: AppError | null;
}

export function ok<T>(data: T): ApiResult<T> {
  return { data, error: null };
}

export function fail<T>(error: AppError): ApiResult<T> {
  return { data: null, error };
}

// ---- Pagination --------------------------------------------

export interface PaginationMeta {
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
  offset: number;
}

export interface CursorPage<T> {
  items: T[];
  next_cursor_date: string | null;
  next_cursor_id: string | null;
  has_more: boolean;
}

// ---- Filter / sort helpers ---------------------------------

export type SortOrder = 'asc' | 'desc';

export interface DateRange {
  from: string;
  to: string;
}
