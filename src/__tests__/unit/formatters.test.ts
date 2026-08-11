// ============================================================
// IMC-BLD-006 | ImageCare ERP Testing & QA v1.0
// File: src/__tests__/unit/formatters.test.ts
// Purpose: Unit tests for formatting utilities and validators.
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatCurrencyShort,
  formatDate,
  formatDateTime,
  formatDateRelative,
  formatStatus,
  getStatusVariant,
  formatPaymentMethod,
  formatQuantity,
  formatPercent,
  formatFullName,
  startOfMonth,
  endOfDay,
} from '../../utils/formatters';
import {
  rules,
  validateForm,
} from '../../hooks/shared/useFormState';

// ---- Currency formatting -----------------------------------

describe('formatCurrency', () => {
  it('formats UGX with no decimal places', () => {
    const result = formatCurrency(1500000);
    expect(result).toContain('1,500,000');
  });

  it('formats zero correctly', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('handles large amounts', () => {
    const result = formatCurrency(10_000_000_000);
    expect(result).toContain('10,000,000,000');
  });

  it('includes currency symbol or local equivalent', () => {
    const result = formatCurrency(5000, 'UGX');
    expect(result.includes('UGX') || result.includes('USh') || result.includes('5,000')).toBe(true);
  });
});

describe('formatCurrencyShort', () => {
  it('formats millions as M', () => {
    expect(formatCurrencyShort(1_500_000)).toBe('1.5M');
  });

  it('formats billions as B', () => {
    expect(formatCurrencyShort(2_000_000_000)).toBe('2.0B');
  });

  it('formats thousands as K', () => {
    expect(formatCurrencyShort(5000)).toBe('5K');
  });

  it('formats small amounts without suffix', () => {
    const result = formatCurrencyShort(500);
    expect(result).toBe('500');
  });
});

// ---- Date formatting ---------------------------------------

describe('formatDate', () => {
  it('formats a valid date', () => {
    const result = formatDate('2026-08-10T12:00:00Z');
    expect(result).toContain('2026');
    expect(result).toContain('Aug');
  });

  it('returns dash for null', () => {
    expect(formatDate(null)).toBe('-');
  });

  it('returns dash for undefined', () => {
    expect(formatDate(undefined)).toBe('-');
  });

  it('returns dash for invalid date string', () => {
    expect(formatDate('not-a-date')).toBe('-');
  });
});

describe('startOfMonth / endOfDay', () => {
  it('startOfMonth returns a valid ISO string', () => {
    const result = startOfMonth();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const d = new Date(result);
    expect(d.getDate()).toBe(1);
  });

  it('endOfDay returns 23:59:59', () => {
    const result = endOfDay();
    const d = new Date(result);
    expect(d.getHours()).toBe(23);
    expect(d.getMinutes()).toBe(59);
  });
});

// ---- Status formatting -------------------------------------

describe('formatStatus', () => {
  it('formats known statuses', () => {
    expect(formatStatus('confirmed')).toBe('Confirmed');
    expect(formatStatus('draft')).toBe('Draft');
    expect(formatStatus('paid')).toBe('Paid');
    expect(formatStatus('overdue')).toBe('Overdue');
    expect(formatStatus('out_of_stock')).toBe('Out of Stock');
    expect(formatStatus('in_stock')).toBe('In Stock');
    expect(formatStatus('low_stock')).toBe('Low Stock');
  });

  it('formats unknown status by capitalizing words', () => {
    const result = formatStatus('custom_status');
    expect(result).toBe('Custom Status');
  });
});

describe('getStatusVariant', () => {
  it('confirmed is success', () => expect(getStatusVariant('confirmed')).toBe('success'));
  it('draft is info',      () => expect(getStatusVariant('draft')).toBe('info'));
  it('overdue is error',   () => expect(getStatusVariant('overdue')).toBe('error'));
  it('cancelled is neutral', () => expect(getStatusVariant('cancelled')).toBe('neutral'));
  it('low_stock is warning', () => expect(getStatusVariant('low_stock')).toBe('warning'));
});

// ---- Payment methods ---------------------------------------

describe('formatPaymentMethod', () => {
  it('formats known methods', () => {
    expect(formatPaymentMethod('cash')).toBe('Cash');
    expect(formatPaymentMethod('mobile_money')).toBe('Mobile Money');
    expect(formatPaymentMethod('bank_transfer')).toBe('Bank Transfer');
  });
});

// ---- Validation rules --------------------------------------

describe('rules.required', () => {
  const rule = rules.required('Name');

  it('fails on empty string', () => {
    expect(rule('')).toBe('Name is required.');
  });

  it('fails on null', () => {
    expect(rule(null)).toBe('Name is required.');
  });

  it('fails on undefined', () => {
    expect(rule(undefined)).toBe('Name is required.');
  });

  it('passes on valid value', () => {
    expect(rule('Test Product')).toBeNull();
  });

  it('passes on zero (which is a valid number)', () => {
    // 0 is a valid value for fields like discount - required only checks for emptiness
    expect(rule(0)).toBeNull();
  });
});

describe('rules.positiveNumber', () => {
  const rule = rules.positiveNumber('Amount');

  it('fails on zero', () => {
    expect(rule(0)).toBe('Amount must be greater than zero.');
  });

  it('fails on negative', () => {
    expect(rule(-100)).toBe('Amount must be greater than zero.');
  });

  it('passes on positive number', () => {
    expect(rule(5000)).toBeNull();
  });

  it('passes on decimal', () => {
    expect(rule(0.5)).toBeNull();
  });
});

describe('rules.nonNegativeNumber', () => {
  const rule = rules.nonNegativeNumber('Discount');

  it('fails on negative', () => {
    expect(rule(-1)).toBe('Discount cannot be negative.');
  });

  it('passes on zero', () => {
    expect(rule(0)).toBeNull();
  });

  it('passes on positive', () => {
    expect(rule(100)).toBeNull();
  });
});

describe('rules.email', () => {
  const rule = rules.email();

  it('fails on invalid email', () => {
    expect(rule('notanemail')).toBeTruthy();
    expect(rule('missing@domain')).toBeTruthy();
  });

  it('passes on valid email', () => {
    expect(rule('test@imagecare.ug')).toBeNull();
  });

  it('passes on empty (not required, just format)', () => {
    expect(rule('')).toBeNull();
  });
});

describe('rules.maxAmount', () => {
  const rule = rules.maxAmount(100000, 'Amount');

  it('fails when over limit', () => {
    expect(rule(100001)).toBe('Amount cannot exceed 100,000.');
  });

  it('passes at limit', () => {
    expect(rule(100000)).toBeNull();
  });
});

// ---- validateForm ------------------------------------------

describe('validateForm', () => {
  interface SaleForm {
    customer_id: string;
    total_amount: number;
    payment_method: string;
  }

  const saleRules = {
    total_amount:   [rules.positiveNumber('Total amount')],
    payment_method: [rules.required('Payment method')],
  };

  it('returns errors for invalid values', () => {
    const errors = validateForm<SaleForm>(
      { customer_id: '', total_amount: 0, payment_method: '' },
      saleRules
    );
    expect(errors.total_amount).toBeTruthy();
    expect(errors.payment_method).toBeTruthy();
    expect(errors.customer_id).toBeUndefined();
  });

  it('returns empty object for valid values', () => {
    const errors = validateForm<SaleForm>(
      { customer_id: '', total_amount: 5000, payment_method: 'cash' },
      saleRules
    );
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('stops at first error per field', () => {
    const multiRules = {
      total_amount: [
        rules.positiveNumber('Total'),
        rules.maxAmount(1000, 'Total'),
      ],
    };
    const errors = validateForm<SaleForm>(
      { customer_id: '', total_amount: 0, payment_method: '' },
      multiRules
    );
    // Only first rule error should appear
    expect(errors.total_amount).toBe('Total must be greater than zero.');
  });
});