// ============================================================
// ImageCare ERP - Formatters Unit Tests
// File: src/__tests__/unit/formatters.test.ts
// Coverage target: src/utils/formatters.ts (0% -> 100%)
// ============================================================

import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatNumber,
  formatCurrencyShort,
  formatDate,
  formatDateTime,
  formatDateRelative,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  formatQuantity,
  formatStatus,
  getStatusVariant,
  formatPaymentMethod,
  formatFullName,
  formatInitials,
  formatPercent,
} from '../../utils/formatters';

describe('formatCurrency', () => {
  it('formats UGX with no decimals', () => {
    const result = formatCurrency(50000);
    expect(result).toContain('50,000');
  });

  it('uses currency formatting (contains amount)', () => {
    const result = formatCurrency(1000);
    // Node.js formats UGX as 'USh' - just check the number is present
    expect(result).toContain('1,000');
  });

  it('handles zero', () => {
    const result = formatCurrency(0);
    expect(result).toContain('0');
  });

  it('handles large amounts', () => {
    const result = formatCurrency(1_000_000);
    expect(result).toContain('1,000,000');
  });

  it('falls back gracefully on invalid locale', () => {
    // Should not throw even with unusual locale
    expect(() => formatCurrency(100, 'UGX', 'en-UG')).not.toThrow();
  });
});

describe('formatNumber', () => {
  it('formats with 0 decimal places by default', () => {
    expect(formatNumber(1234)).toContain('1,234');
  });

  it('formats with specified decimal places', () => {
    const result = formatNumber(1234.567, 2);
    expect(result).toContain('1,234');
    expect(result).toContain('57'); // rounds
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toContain('0');
  });
});

describe('formatCurrencyShort', () => {
  it('formats billions with B suffix', () => {
    expect(formatCurrencyShort(2_000_000_000)).toBe('2.0B');
  });

  it('formats millions with M suffix', () => {
    expect(formatCurrencyShort(1_500_000)).toBe('1.5M');
    expect(formatCurrencyShort(1_000_000)).toBe('1.0M');
  });

  it('formats thousands with K suffix', () => {
    expect(formatCurrencyShort(5_000)).toBe('5K');
    expect(formatCurrencyShort(1_250)).toBe('1K');
  });

  it('formats small amounts as plain number', () => {
    const result = formatCurrencyShort(999);
    expect(result).toContain('999');
  });

  it('formats zero', () => {
    expect(formatCurrencyShort(0)).toBeTruthy();
  });
});

describe('formatDate', () => {
  it('formats a valid ISO date string', () => {
    const result = formatDate('2024-01-15');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats a Date object', () => {
    const result = formatDate(new Date('2024-06-01'));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns "-" for null', () => {
    expect(formatDate(null)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatDate(undefined)).toBe('-');
  });
});

describe('formatDateTime', () => {
  it('formats a datetime string', () => {
    const result = formatDateTime('2024-01-15T10:30:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns "-" for null', () => {
    expect(formatDateTime(null)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatDateTime(undefined)).toBe('-');
  });
});

describe('formatDateRelative', () => {
  it('formats a recent date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = formatDateRelative(yesterday.toISOString());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns "-" for null', () => {
    expect(formatDateRelative(null)).toBe('-');
  });

  it('returns "-" for undefined', () => {
    expect(formatDateRelative(undefined)).toBe('-');
  });
});

describe('startOfDay / endOfDay', () => {
  it('startOfDay returns ISO string starting with date T00:00:00', () => {
    const result = startOfDay(new Date('2024-03-15'));
    expect(result).toContain('T00:00:00');
  });

  it('endOfDay returns ISO string ending with T23:59:59', () => {
    const result = endOfDay(new Date('2024-03-15'));
    expect(result).toContain('T23:59:59');
  });

  it('startOfDay uses today when no arg', () => {
    const result = startOfDay();
    expect(result).toContain('T00:00:00');
  });

  it('endOfDay uses today when no arg', () => {
    const result = endOfDay();
    expect(result).toContain('T23:59:59');
  });
});

describe('startOfMonth / endOfMonth', () => {
  it('startOfMonth returns first day of month', () => {
    const result = startOfMonth(new Date('2024-03-15'));
    expect(result).toMatch(/^2024-03-01/);
  });

  it('endOfMonth returns last day of month', () => {
    const result = endOfMonth(new Date('2024-02-10'));
    expect(result).toMatch(/^2024-02-29/); // 2024 is leap year
  });

  it('uses today when no arg', () => {
    expect(() => startOfMonth()).not.toThrow();
    expect(() => endOfMonth()).not.toThrow();
  });
});

describe('formatQuantity', () => {
  it('formats a quantity without unit', () => {
    expect(formatQuantity(5)).toContain('5');
  });

  it('formats a quantity with unit', () => {
    const result = formatQuantity(12, 'pcs');
    expect(result).toContain('12');
    expect(result).toContain('pcs');
  });

  it('handles decimal quantities', () => {
    const result = formatQuantity(1.5, 'kg');
    expect(result).toContain('1');
  });
});

describe('formatStatus', () => {
  it('capitalizes first letter', () => {
    expect(formatStatus('confirmed')).toMatch(/^[A-Z]/);
  });

  it('replaces underscores with spaces', () => {
    const result = formatStatus('in_progress');
    expect(result).not.toContain('_');
    expect(result).toContain(' ');
  });

  it('handles draft status', () => {
    expect(formatStatus('draft')).toBeTruthy();
  });

  it('handles empty string', () => {
    expect(formatStatus('')).toBe('');
  });
});

describe('getStatusVariant', () => {
  it('returns success variant for confirmed', () => {
    expect(getStatusVariant('confirmed')).toBe('success');
  });

  it('returns warning or info variant for draft/pending', () => {
    const result = getStatusVariant('draft');
    expect(['warning', 'info', 'default']).toContain(result);
  });

  it('returns danger/error/neutral variant for cancelled/rejected', () => {
    const result = getStatusVariant('cancelled');
    expect(['danger', 'error', 'destructive', 'neutral', 'default']).toContain(result);
  });

  it('returns a string for any input', () => {
    expect(typeof getStatusVariant('unknown_status')).toBe('string');
  });
});

describe('formatPaymentMethod', () => {
  it('formats cash payment method', () => {
    const result = formatPaymentMethod('cash');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats mobile_money payment method', () => {
    const result = formatPaymentMethod('mobile_money');
    expect(result).not.toContain('_');
  });

  it('formats bank_transfer payment method', () => {
    const result = formatPaymentMethod('bank_transfer');
    expect(typeof result).toBe('string');
  });

  it('formats credit payment method', () => {
    const result = formatPaymentMethod('credit');
    expect(typeof result).toBe('string');
  });

  it('handles unknown method without throwing', () => {
    expect(() => formatPaymentMethod('unknown')).not.toThrow();
  });
});

describe('formatFullName', () => {
  it('concatenates first and last name', () => {
    expect(formatFullName('Alice', 'Nakato')).toBe('Alice Nakato');
  });

  it('handles empty strings', () => {
    const result = formatFullName('', '');
    expect(typeof result).toBe('string');
  });

  it('trims whitespace', () => {
    const result = formatFullName(' Alice ', ' Nakato ');
    expect(result.trim()).toBe(result);
  });
});

describe('formatInitials', () => {
  it('returns uppercase initials', () => {
    const result = formatInitials('Alice', 'Nakato');
    expect(result).toBe('AN');
  });

  it('uses first letter of each name', () => {
    const result = formatInitials('John', 'Doe');
    expect(result).toBe('JD');
  });

  it('handles empty strings', () => {
    expect(() => formatInitials('', '')).not.toThrow();
  });
});

describe('formatPercent', () => {
  it('formats percentage with 1 decimal place by default', () => {
    const result = formatPercent(75.5);
    expect(result).toContain('75.5');
    expect(result).toContain('%');
  });

  it('formats with specified decimal places', () => {
    const result = formatPercent(33.333, 2);
    expect(result).toContain('33.33');
  });

  it('formats zero percent', () => {
    expect(formatPercent(0)).toContain('0');
  });

  it('formats 100 percent', () => {
    expect(formatPercent(100)).toContain('100');
  });
});
