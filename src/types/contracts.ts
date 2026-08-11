// ============================================================
// IMC-BLD-003 | ImageCare ERP API & Service Contract v1.0
// File: src/types/contracts.ts
// Purpose: Standardized request and response contracts.
//          Every service call uses these shapes.
//          Never invent custom response shapes per module.
// ============================================================

import type { UUID, Timestamptz } from './database';

// ---- Standard Request Context ------------------------------
// Included in every service call via UserContext + extras.

export interface RequestContext {
  user_id: UUID;
  business_id: UUID;
  branch_id: UUID | null;
  device_id?: string;
  request_id: string;          // generated per call for tracing
  idempotency_key?: string;    // for repeat-safe operations
}

// Generate a request context from UserContext
export function makeRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ---- Standard Response Contract ----------------------------

export interface ServiceResponse<T> {
  success: boolean;
  data: T | null;
  error: ServiceError | null;
  request_id: string;
  server_timestamp: Timestamptz;
}

export interface ServiceError {
  code: ServiceErrorCode;
  message: string;        // safe user-facing message
  field?: string;         // for field-level validation errors
  detail?: string;        // dev detail - never shown in production UI
}

// ---- Standard Error Codes ----------------------------------
// Matches the BLD-003 spec section 6 exactly.

export type ServiceErrorCode =
  | 'AUTHENTICATION_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'INVALID_INPUT'
  | 'RESOURCE_NOT_FOUND'
  | 'BUSINESS_RULE_VIOLATION'
  | 'CONFLICT'
  | 'DUPLICATE_OPERATION'
  | 'SYNC_REQUIRED'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

// ---- Pagination contracts -----------------------------------

export interface PaginationRequest {
  page_size?: number;
  cursor_date?: string;
  cursor_id?: UUID;
  page?: number;          // offset-based fallback
}

export interface PaginationResponse {
  total_count: number;
  page_size: number;
  has_more: boolean;
  next_cursor_date: string | null;
  next_cursor_id: UUID | null;
}

export interface PagedResponse<T> {
  items: T[];
  pagination: PaginationResponse;
}

// ---- Filter contracts --------------------------------------

export interface DateFilter {
  from: string;    // ISO timestamptz
  to: string;      // ISO timestamptz
}

export interface SortRequest {
  field: string;
  direction: 'asc' | 'desc';
}

// Whitelist of sortable fields per entity
export const SORTABLE_FIELDS = {
  sales:     ['sale_date', 'total_amount', 'sale_number', 'status'],
  purchases: ['purchase_date', 'total_amount', 'purchase_number', 'status'],
  expenses:  ['expense_date', 'total_amount', 'category'],
  products:  ['name', 'selling_price', 'created_at'],
  customers: ['name', 'credit_balance', 'created_at'],
  suppliers: ['name', 'outstanding', 'created_at'],
  payroll:   ['pay_date', 'net_pay'],
  invoices:  ['invoice_date', 'due_date', 'total_amount', 'status'],
  bills:     ['bill_date', 'due_date', 'total_amount', 'status'],
} as const;

// ---- Response builders -------------------------------------

export function serviceOk<T>(data: T, requestId?: string): ServiceResponse<T> {
  return {
    success:          true,
    data,
    error:            null,
    request_id:       requestId ?? makeRequestId(),
    server_timestamp: new Date().toISOString(),
  };
}

export function serviceFail<T>(
  code: ServiceErrorCode,
  message: string,
  options?: { field?: string; detail?: string; requestId?: string }
): ServiceResponse<T> {
  return {
    success:          false,
    data:             null,
    error:            { code, message, field: options?.field, detail: options?.detail },
    request_id:       options?.requestId ?? makeRequestId(),
    server_timestamp: new Date().toISOString(),
  };
}

// Map AppErrorCode -> ServiceErrorCode
export function mapErrorCode(appCode: string): ServiceErrorCode {
  const map: Record<string, ServiceErrorCode> = {
    AUTH_REQUIRED:           'AUTHENTICATION_REQUIRED',
    AUTH_INVALID:            'AUTHENTICATION_REQUIRED',
    AUTH_EXPIRED:            'AUTHENTICATION_REQUIRED',
    PERMISSION_DENIED:       'PERMISSION_DENIED',
    BRANCH_ACCESS_DENIED:    'PERMISSION_DENIED',
    ACCOUNT_SUSPENDED:       'PERMISSION_DENIED',
    VALIDATION_ERROR:        'INVALID_INPUT',
    AMOUNT_MISMATCH:         'INVALID_INPUT',
    INVALID_AMOUNT:          'INVALID_INPUT',
    MISSING_REQUIRED_FIELD:  'INVALID_INPUT',
    RECORD_NOT_FOUND:        'RESOURCE_NOT_FOUND',
    INSUFFICIENT_STOCK:      'BUSINESS_RULE_VIOLATION',
    CREDIT_LIMIT_EXCEEDED:   'BUSINESS_RULE_VIOLATION',
    OVERPAYMENT:             'BUSINESS_RULE_VIOLATION',
    IMMUTABLE_RECORD:        'BUSINESS_RULE_VIOLATION',
    INVALID_STATUS_TRANSITION: 'BUSINESS_RULE_VIOLATION',
    PRODUCT_NOT_SELLABLE:    'BUSINESS_RULE_VIOLATION',
    BUSINESS_INACTIVE:       'BUSINESS_RULE_VIOLATION',
    IDEMPOTENCY_IN_FLIGHT:   'DUPLICATE_OPERATION',
    DUPLICATE_TRANSACTION:   'DUPLICATE_OPERATION',
    SYNC_CONFLICT:           'CONFLICT',
    SYNC_FAILED:             'SYNC_REQUIRED',
    NETWORK_ERROR:           'SERVICE_UNAVAILABLE',
    SERVER_ERROR:            'INTERNAL_ERROR',
    UNKNOWN_ERROR:           'INTERNAL_ERROR',
  };
  return map[appCode] ?? 'INTERNAL_ERROR';
}
