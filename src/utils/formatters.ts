// ============================================================
// IMC-BLD-001 | ImageCare ERP Application Architecture v1.0
// File: src/utils/formatters.ts
// Purpose: Centralized formatting utilities.
//          All currency, date, quantity and status display
//          formatting goes through these functions.
//          Never format values inline in UI components.
// ============================================================

// ---- Currency ----------------------------------------------
// UGX has no decimal places. Format without decimals.

export function formatCurrency(
  amount: number,
  currency: string = 'UGX',
  locale: string = 'en-UG'
): string {
  try {
    return new Intl.NumberFormat(locale, {
      style:                 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${formatNumber(amount, 0)}`;
  }
}

export function formatNumber(
  value: number,
  decimalPlaces: number = 0
): string {
  return new Intl.NumberFormat('en-UG', {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  }).format(value);
}

// Short form: 1,250,000 -> 1.25M
export function formatCurrencyShort(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000)     return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000)         return `${(amount / 1_000).toFixed(0)}K`;
  return formatNumber(amount, 0);
}

// ---- Dates -------------------------------------------------

export function formatDate(
  date: string | Date | null | undefined,
  style: 'short' | 'medium' | 'long' = 'medium'
): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';

    const options: Intl.DateTimeFormatOptions = {
      short:  { day: '2-digit', month: 'short', year: 'numeric' },
      medium: { day: '2-digit', month: 'short', year: 'numeric' },
      long:   { day: '2-digit', month: 'long',  year: 'numeric' },
    }[style];

    return new Intl.DateTimeFormat('en-UG', options).format(d);
  } catch {
    return '-';
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    return new Intl.DateTimeFormat('en-UG', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).format(d);
  } catch {
    return '-';
  }
}

export function formatDateRelative(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    const d     = typeof date === 'string' ? new Date(date) : date;
    const now   = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins  = Math.floor(diffMs / 60_000);
    const diffHours = Math.floor(diffMs / 3_600_000);
    const diffDays  = Math.floor(diffMs / 86_400_000);

    if (diffMins  <  1) return 'Just now';
    if (diffMins  < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays  <  7) return `${diffDays}d ago`;
    return formatDate(d, 'short');
  } catch {
    return '-';
  }
}

// Start/end of day helpers
export function startOfDay(date?: Date): string {
  const d = date ?? new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0).toISOString();
}

export function endOfDay(date?: Date): string {
  const d = date ?? new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
}

export function startOfMonth(date?: Date): string {
  const d = date ?? new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

export function endOfMonth(date?: Date): string {
  const d = date ?? new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
}

// ---- Quantities --------------------------------------------

export function formatQuantity(value: number, unit?: string): string {
  const formatted = value % 1 === 0 ? formatNumber(value, 0) : formatNumber(value, 2);
  return unit ? `${formatted} ${unit}` : formatted;
}

// ---- Status ------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  // Transaction status
  draft:     'Draft',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  voided:    'Voided',
  // Invoice/bill status
  unpaid:    'Unpaid',
  partial:   'Partial',
  paid:      'Paid',
  overdue:   'Overdue',
  // Payroll
  pending:   'Pending',
  approved:  'Approved',
  // Stock
  in_stock:     'In Stock',
  low_stock:    'Low Stock',
  out_of_stock: 'Out of Stock',
  // Sync
  synced:   'Synced',
  conflict: 'Conflict',
  failed:   'Failed',
};

export function formatStatus(status: string): string {
  return STATUS_LABELS[status] ?? status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

type StatusVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

export function getStatusVariant(status: string): StatusVariant {
  const map: Record<string, StatusVariant> = {
    confirmed: 'success', paid: 'success', synced: 'success', in_stock: 'success',
    draft: 'info', pending: 'info', approved: 'info',
    partial: 'warning', low_stock: 'warning', conflict: 'warning',
    cancelled: 'neutral', voided: 'neutral',
    overdue: 'error', out_of_stock: 'error', failed: 'error',
  };
  return map[status] ?? 'neutral';
}

// ---- Payment methods ---------------------------------------

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash:          'Cash',
  mobile_money:  'Mobile Money',
  bank_transfer: 'Bank Transfer',
  card:          'Card',
  credit:        'Credit',
  cheque:        'Cheque',
};

export function formatPaymentMethod(method: string): string {
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

// ---- Names -------------------------------------------------

export function formatFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim();
}

export function formatInitials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

// ---- Percentage --------------------------------------------

export function formatPercent(value: number, decimalPlaces: number = 1): string {
  return `${formatNumber(value, decimalPlaces)}%`;
}
