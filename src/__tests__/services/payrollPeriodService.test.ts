// ============================================================
// File: src/__tests__/services/payrollPeriodService.test.ts
// Purpose: Service contract tests for the real payroll *period*
//          lifecycle - src/services/payroll/payrollPeriodService.ts
//          (create -> calculate -> approve -> payslips -> pay ->
//          archive, entirely backed by imagecare.payroll rows, no
//          local store). Added while closing the CI coverage gate.
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeUserContext, makeNoPermissionContext, TEST_BUSINESS_ID, TEST_BRANCH_ID } from '../setup';
import {
  OverlappingPeriodError,
  PayrollLockedError,
  InvalidPeriodTransitionError,
  NoEmployeesInPayrollError,
} from '../../types/payroll';

// financialServices.approvePayroll / processPayrollPayment are real,
// already-tested functions this file delegates to - mock them so this
// suite tests payrollPeriodService's own orchestration, not their
// internals. Must be wrapped in vi.hoisted: vi.mock(...) factories are
// hoisted above plain `const` declarations, so referencing an
// un-hoisted mock here throws "Cannot access before initialization".
const { approvePayrollMock, processPayrollPaymentMock } = vi.hoisted(() => ({
  approvePayrollMock: vi.fn(),
  processPayrollPaymentMock: vi.fn(),
}));
vi.mock('../../services/financial/financialServices', () => ({
  approvePayroll: approvePayrollMock,
  processPayrollPayment: processPayrollPaymentMock,
}));

// Table-agnostic FIFO queue mock - every distinct supabase call in a
// test pushes its own result, consumed in call order. Used because
// these functions issue several sequential queries per call.
const { chain, push, reset } = vi.hoisted(() => {
  const queue: Array<{ data: unknown; error: unknown }> = [];
  const EMPTY = { data: null, error: null };
  const c: Record<string, unknown> = {};
  for (const m of ['schema', 'from', 'select', 'insert', 'update', 'eq', 'in', 'is', 'order', 'limit']) {
    c[m] = vi.fn(() => c);
  }
  const nextOrEmpty = () => queue.shift() ?? EMPTY;
  c.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(nextOrEmpty()).then(resolve, reject);
  return {
    chain: c,
    push: (r: { data: unknown; error: unknown }) => queue.push(r),
    reset: () => { queue.length = 0; },
  };
});

vi.mock('../../lib/supabase', () => ({ supabase: chain, default: chain }));

import {
  encodePeriodId,
  decodePeriodId,
  rowStatusToPeriodStatus,
  listPeriods,
  getPeriod,
  listPayslips,
  createPeriod,
  calculatePayroll,
  approvePeriod,
  markPayslipsGenerated,
  recordPayrollPayment,
  archivePeriod,
} from '../../services/payroll/payrollPeriodService';

beforeEach(() => {
  reset();
  approvePayrollMock.mockReset();
  processPayrollPaymentMock.mockReset();
});

function payrollRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payroll-1', business_id: TEST_BUSINESS_ID, branch_id: TEST_BRANCH_ID, user_id: 'user-1',
    payroll_number: 'PAY-000001', pay_period_start: '2026-01-01', pay_period_end: '2026-01-31',
    pay_date: '2026-01-31', basic_salary: 500000, allowances: 0, overtime_pay: 0,
    gross_pay: 500000, tax_deduction: 0, nssf_deduction: 0, other_deductions: 0,
    total_deductions: 0, net_pay: 500000, payment_method: 'bank_transfer', status: 'draft',
    metadata: {}, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    created_by: 'user-test-001', updated_by: 'user-test-001', deleted_at: null,
    ...overrides,
  };
}

// ---- pure helpers ---------------------------------------------------

describe('encodePeriodId / decodePeriodId', () => {
  it('encodes a start/end pair, truncating to plain dates', () => {
    expect(encodePeriodId('2026-01-01T00:00:00Z', '2026-01-31T00:00:00Z')).toBe('2026-01-01_2026-01-31');
  });

  it('decodes a valid period id back into start/end dates', () => {
    expect(decodePeriodId('2026-01-01_2026-01-31')).toEqual({ startDate: '2026-01-01', endDate: '2026-01-31' });
  });

  it('returns null for a malformed id', () => {
    expect(decodePeriodId('not-a-period-id')).toBeNull();
  });

  it('returns null for an empty id', () => {
    expect(decodePeriodId('')).toBeNull();
  });
});

describe('rowStatusToPeriodStatus', () => {
  it('maps every known row status', () => {
    expect(rowStatusToPeriodStatus('pending')).toBe('calculated');
    expect(rowStatusToPeriodStatus('approved')).toBe('approved');
    expect(rowStatusToPeriodStatus('paid')).toBe('paid');
    expect(rowStatusToPeriodStatus('archived')).toBe('archived');
    expect(rowStatusToPeriodStatus('cancelled')).toBe('archived');
  });

  it('defaults an unrecognized status to draft', () => {
    expect(rowStatusToPeriodStatus('draft')).toBe('draft');
    expect(rowStatusToPeriodStatus('anything-else')).toBe('draft');
  });
});

// ---- listPeriods / getPeriod / listPayslips --------------------------

describe('listPeriods', () => {
  it('denies without payroll view permission', async () => {
    await expect(listPeriods(makeNoPermissionContext())).rejects.toThrow('You do not have permission to view payroll.');
  });

  it('groups rows into periods by their derived (business + dates) key', async () => {
    push({
      data: [
        payrollRow({ id: 'p1', user_id: 'user-1', status: 'draft' }),
        payrollRow({ id: 'p2', user_id: 'user-2', status: 'draft' }),
        payrollRow({ id: 'p3', user_id: 'user-1', pay_period_start: '2026-02-01', pay_period_end: '2026-02-28', status: 'draft' }),
      ],
      error: null,
    });
    const periods = await listPeriods(makeUserContext());
    expect(periods).toHaveLength(2);
  });

  it('throws a friendly error on a database failure', async () => {
    push({ data: null, error: { message: 'db down' } });
    await expect(listPeriods(makeUserContext())).rejects.toThrow();
  });
});

describe('getPeriod', () => {
  it('denies without payroll view permission', async () => {
    await expect(getPeriod(makeNoPermissionContext(), '2026-01-01_2026-01-31')).rejects.toThrow('You do not have permission to view payroll.');
  });

  it('returns null for a malformed period id without querying', async () => {
    const result = await getPeriod(makeUserContext(), 'bad-id');
    expect(result).toBeNull();
  });

  it('returns null when no rows exist for a valid period id', async () => {
    push({ data: [], error: null });
    const result = await getPeriod(makeUserContext(), '2026-01-01_2026-01-31');
    expect(result).toBeNull();
  });

  it('builds the period from its rows on success', async () => {
    push({ data: [payrollRow({ status: 'pending' })], error: null });
    const result = await getPeriod(makeUserContext(), '2026-01-01_2026-01-31');
    expect(result?.status).toBe('calculated');
    expect(result?.startDate).toBe('2026-01-01');
  });
});

describe('listPayslips', () => {
  it('denies without payroll view permission', async () => {
    await expect(listPayslips(makeNoPermissionContext())).rejects.toThrow('You do not have permission to view payroll.');
  });

  it('returns an empty array for a malformed period id', async () => {
    const result = await listPayslips(makeUserContext(), 'bad-id');
    expect(result).toEqual([]);
  });

  it('excludes draft rows and returns [] without a names lookup when none remain', async () => {
    push({ data: [payrollRow({ status: 'draft' })], error: null });
    const result = await listPayslips(makeUserContext(), '2026-01-01_2026-01-31');
    expect(result).toEqual([]);
  });

  it('builds payslip lines with only positive allowance/deduction entries, using resolved staff names', async () => {
    push({
      data: [payrollRow({ status: 'pending', allowances: 50000, overtime_pay: 0, tax_deduction: 20000, nssf_deduction: 0, other_deductions: 0, gross_pay: 550000, total_deductions: 20000, net_pay: 530000 })],
      error: null,
    });
    push({ data: [{ id: 'user-1', first_name: 'Jane', last_name: 'Doe' }], error: null }); // fetchEmployeeNames
    const result = await listPayslips(makeUserContext(), '2026-01-01_2026-01-31');
    expect(result).toHaveLength(1);
    expect(result[0].staffName).toBe('Jane Doe');
    expect(result[0].allowances).toEqual([{ name: 'Allowances', amount: 50000 }]);
    expect(result[0].deductions).toEqual([{ name: 'PAYE', amount: 20000 }]);
  });

  it('falls back to "Unknown staff member" when the name lookup fails', async () => {
    push({ data: [payrollRow({ status: 'pending' })], error: null });
    push({ data: null, error: { message: 'lookup failed' } }); // fetchEmployeeNames swallows and returns empty map
    const result = await listPayslips(makeUserContext(), '2026-01-01_2026-01-31');
    expect(result[0].staffName).toBe('Unknown staff member');
  });

  it('fetches all rows when no periodId is given', async () => {
    push({ data: [payrollRow({ status: 'pending' })], error: null }); // fetchAllRows
    push({ data: [{ id: 'user-1', first_name: 'Jane', last_name: 'Doe' }], error: null });
    const result = await listPayslips(makeUserContext());
    expect(result).toHaveLength(1);
  });
});

// ---- createPeriod ---------------------------------------------------

describe('createPeriod', () => {
  it('denies without payroll create permission', async () => {
    await expect(createPeriod(makeNoPermissionContext(), '2026-01-01', '2026-01-31', 'user-test-001'))
      .rejects.toThrow('You do not have permission to create payroll periods.');
  });

  it('rejects malformed dates', async () => {
    await expect(createPeriod(makeUserContext(), 'not-a-date', '2026-01-31', 'user-test-001'))
      .rejects.toThrow('Enter a valid start and end date.');
  });

  it('rejects an end date before the start date', async () => {
    await expect(createPeriod(makeUserContext(), '2026-01-31', '2026-01-01', 'user-test-001'))
      .rejects.toThrow('End date must be on or after the start date.');
  });

  it('throws OverlappingPeriodError when a non-archived period overlaps', async () => {
    push({ data: [payrollRow({ status: 'pending', pay_period_start: '2026-01-15', pay_period_end: '2026-02-15' })], error: null }); // fetchAllRows
    await expect(createPeriod(makeUserContext(), '2026-01-01', '2026-01-31', 'user-test-001')).rejects.toThrow(OverlappingPeriodError);
  });

  it('ignores archived periods when checking for overlap', async () => {
    push({ data: [payrollRow({ status: 'archived', pay_period_start: '2026-01-15', pay_period_end: '2026-02-15' })], error: null }); // fetchAllRows: archived overlap, ignored
    push({ data: [{ id: 'user-1', first_name: 'Jane', last_name: 'Doe', branch_id: TEST_BRANCH_ID, salary: 500000, is_active: true }], error: null }); // fetchEligibleEmployees
    push({ data: [], error: null }); // latestPayrollSequence
    push({ data: null, error: null }); // insert
    push({ data: [payrollRow({ status: 'draft' })], error: null }); // getPeriod reload
    const result = await createPeriod(makeUserContext(), '2026-01-01', '2026-01-31', 'user-test-001');
    expect(result.period).toBeTruthy();
  });

  it('throws NoEmployeesInPayrollError with skipped detail when staff exist but none are payable', async () => {
    push({ data: [], error: null }); // fetchAllRows: no overlap
    push({ data: [{ id: 'user-1', first_name: 'Jane', last_name: 'Doe', branch_id: TEST_BRANCH_ID, salary: 0, is_active: true }], error: null }); // fetchEligibleEmployees: no salary
    await expect(createPeriod(makeUserContext(), '2026-01-01', '2026-01-31', 'user-test-001')).rejects.toThrow(NoEmployeesInPayrollError);
  });

  it('throws a generic NoEmployeesInPayrollError message when there is no staff at all', async () => {
    push({ data: [], error: null }); // fetchAllRows
    push({ data: [], error: null }); // fetchEligibleEmployees: nobody
    await expect(createPeriod(makeUserContext(), '2026-01-01', '2026-01-31', 'user-test-001'))
      .rejects.toThrow('Add an active staff member with a salary');
  });

  it('creates the period and reports which staff were skipped', async () => {
    push({ data: [], error: null }); // fetchAllRows
    push({
      data: [
        { id: 'user-1', first_name: 'Jane', last_name: 'Doe', branch_id: TEST_BRANCH_ID, salary: 500000, is_active: true },
        { id: 'user-2', first_name: 'No', last_name: 'Salary', branch_id: TEST_BRANCH_ID, salary: 0, is_active: true },
      ],
      error: null,
    }); // fetchEligibleEmployees: 1 eligible, 1 skipped
    push({ data: [], error: null }); // latestPayrollSequence
    push({ data: null, error: null }); // insert
    push({ data: [payrollRow({ status: 'draft' })], error: null }); // getPeriod reload
    const result = await createPeriod(makeUserContext(), '2026-01-01', '2026-01-31', 'user-test-001');
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]).toContain('no salary set');
  });

  it('maps an RLS-rejected insert to the owner-only message', async () => {
    push({ data: [], error: null }); // fetchAllRows
    push({ data: [{ id: 'user-1', first_name: 'Jane', last_name: 'Doe', branch_id: TEST_BRANCH_ID, salary: 500000, is_active: true }], error: null }); // fetchEligibleEmployees
    push({ data: [], error: null }); // latestPayrollSequence
    push({ data: null, error: { code: '42501', message: 'row-level security policy violation' } }); // insert rejected
    await expect(createPeriod(makeUserContext(), '2026-01-01', '2026-01-31', 'user-test-001'))
      .rejects.toThrow('Payroll changes are restricted to the business owner.');
  });
});

// ---- calculatePayroll -------------------------------------------------

describe('calculatePayroll', () => {
  it('denies without payroll create or edit permission', async () => {
    await expect(calculatePayroll(makeNoPermissionContext(), '2026-01-01_2026-01-31')).rejects.toThrow('You do not have permission to calculate payroll.');
  });

  it('throws PayrollLockedError once the period is approved, paid, or archived', async () => {
    push({ data: [payrollRow({ status: 'approved' })], error: null }); // requirePeriodRows
    await expect(calculatePayroll(makeUserContext(), '2026-01-01_2026-01-31')).rejects.toThrow(PayrollLockedError);
  });

  it('throws NoEmployeesInPayrollError when nobody stays eligible', async () => {
    push({ data: [payrollRow({ status: 'draft', user_id: 'user-1' })], error: null }); // requirePeriodRows
    push({ data: [], error: null }); // fetchEligibleEmployees: none
    await expect(calculatePayroll(makeUserContext(), '2026-01-01_2026-01-31')).rejects.toThrow(NoEmployeesInPayrollError);
  });

  it('re-costs existing rows from current real salaries and returns the refreshed payslips', async () => {
    push({ data: [payrollRow({ id: 'p1', status: 'draft', user_id: 'user-1' })], error: null }); // requirePeriodRows
    push({ data: [{ id: 'user-1', first_name: 'Jane', last_name: 'Doe', branch_id: TEST_BRANCH_ID, salary: 600000, is_active: true }], error: null }); // fetchEligibleEmployees
    push({ data: null, error: null }); // update for the kept row
    // listPayslips re-fetch:
    push({ data: [payrollRow({ id: 'p1', status: 'pending', user_id: 'user-1', basic_salary: 600000, gross_pay: 600000, net_pay: 600000 })], error: null });
    push({ data: [{ id: 'user-1', first_name: 'Jane', last_name: 'Doe' }], error: null }); // fetchEmployeeNames
    const result = await calculatePayroll(makeUserContext(), '2026-01-01_2026-01-31');
    expect(result).toHaveLength(1);
    expect(result[0].baseSalary).toBe(600000);
  });
});

// ---- approvePeriod ----------------------------------------------------

describe('approvePeriod', () => {
  it('throws InvalidPeriodTransitionError when the period is not calculated', async () => {
    push({ data: [payrollRow({ status: 'draft' })], error: null }); // requirePeriodRows
    await expect(approvePeriod(makeUserContext(), '2026-01-01_2026-01-31', 'Owner')).rejects.toThrow(InvalidPeriodTransitionError);
  });

  it('approves every row through financialServices.approvePayroll and reloads the period', async () => {
    push({ data: [payrollRow({ status: 'pending' })], error: null }); // requirePeriodRows
    approvePayrollMock.mockResolvedValue({ success: true, error: null });
    push({ data: [payrollRow({ status: 'approved' })], error: null }); // reloadPeriod -> getPeriod
    const result = await approvePeriod(makeUserContext(), '2026-01-01_2026-01-31', 'Owner');
    expect(result.status).toBe('approved');
    expect(approvePayrollMock).toHaveBeenCalled();
  });

  it('throws when the underlying approvePayroll call fails for any row', async () => {
    push({ data: [payrollRow({ status: 'pending' })], error: null }); // requirePeriodRows
    approvePayrollMock.mockResolvedValue({ success: false, error: { code: 'INTERNAL_ERROR', message: 'approval failed' } });
    await expect(approvePeriod(makeUserContext(), '2026-01-01_2026-01-31', 'Owner')).rejects.toThrow('approval failed');
  });
});

// ---- markPayslipsGenerated ---------------------------------------------

describe('markPayslipsGenerated', () => {
  it('denies without payroll edit or approve permission', async () => {
    await expect(markPayslipsGenerated(makeNoPermissionContext(), '2026-01-01_2026-01-31')).rejects.toThrow('You do not have permission to generate payslips.');
  });

  it('throws InvalidPeriodTransitionError when the period is not approved', async () => {
    push({ data: [payrollRow({ status: 'pending' })], error: null }); // requirePeriodRows
    await expect(markPayslipsGenerated(makeUserContext(), '2026-01-01_2026-01-31')).rejects.toThrow(InvalidPeriodTransitionError);
  });

  it('records payslips_generated_at on every row and reloads the period', async () => {
    push({ data: [payrollRow({ status: 'approved' })], error: null }); // requirePeriodRows
    push({ data: null, error: null }); // update
    push({ data: [payrollRow({ status: 'approved', metadata: { payslips_generated_at: '2026-01-31T00:00:00Z' } })], error: null }); // reload
    const result = await markPayslipsGenerated(makeUserContext(), '2026-01-01_2026-01-31');
    expect(result.payslipsGeneratedAt).toBe('2026-01-31T00:00:00Z');
  });

  it('throws when the underlying update fails', async () => {
    push({ data: [payrollRow({ status: 'approved' })], error: null }); // requirePeriodRows
    push({ data: null, error: { message: 'update failed' } }); // update fails
    await expect(markPayslipsGenerated(makeUserContext(), '2026-01-01_2026-01-31')).rejects.toThrow();
  });
});

// ---- recordPayrollPayment ----------------------------------------------

describe('recordPayrollPayment', () => {
  it('throws InvalidPeriodTransitionError when the period is not approved', async () => {
    push({ data: [payrollRow({ status: 'pending' })], error: null }); // requirePeriodRows
    await expect(recordPayrollPayment(makeUserContext(), '2026-01-01_2026-01-31')).rejects.toThrow(InvalidPeriodTransitionError);
  });

  it('pays every row through financialServices.processPayrollPayment and reloads the period', async () => {
    push({ data: [payrollRow({ status: 'approved' })], error: null }); // requirePeriodRows
    processPayrollPaymentMock.mockResolvedValue({ success: true, error: null });
    push({ data: [payrollRow({ status: 'paid' })], error: null }); // reloadPeriod
    const result = await recordPayrollPayment(makeUserContext(), '2026-01-01_2026-01-31');
    expect(result.status).toBe('paid');
    expect(processPayrollPaymentMock).toHaveBeenCalled();
  });

  it('throws when the underlying payment call fails for a row', async () => {
    push({ data: [payrollRow({ status: 'approved' })], error: null }); // requirePeriodRows
    processPayrollPaymentMock.mockResolvedValue({ success: false, error: { code: 'BUSINESS_RULE_VIOLATION', message: 'insufficient cash' } });
    await expect(recordPayrollPayment(makeUserContext(), '2026-01-01_2026-01-31')).rejects.toThrow('insufficient cash');
  });
});

// ---- archivePeriod ------------------------------------------------------

describe('archivePeriod', () => {
  it('denies without payroll edit or approve permission', async () => {
    await expect(archivePeriod(makeNoPermissionContext(), '2026-01-01_2026-01-31')).rejects.toThrow('You do not have permission to archive payroll periods.');
  });

  it('throws InvalidPeriodTransitionError when the period is not paid', async () => {
    push({ data: [payrollRow({ status: 'approved' })], error: null }); // requirePeriodRows
    await expect(archivePeriod(makeUserContext(), '2026-01-01_2026-01-31')).rejects.toThrow(InvalidPeriodTransitionError);
  });

  it('archives a paid period and reloads it', async () => {
    push({ data: [payrollRow({ status: 'paid' })], error: null }); // requirePeriodRows
    push({ data: null, error: null }); // update
    push({ data: [payrollRow({ status: 'archived' })], error: null }); // reload
    const result = await archivePeriod(makeUserContext(), '2026-01-01_2026-01-31');
    expect(result.status).toBe('archived');
  });

  it('throws when the underlying update fails', async () => {
    push({ data: [payrollRow({ status: 'paid' })], error: null }); // requirePeriodRows
    push({ data: null, error: { message: 'update failed' } }); // update fails
    await expect(archivePeriod(makeUserContext(), '2026-01-01_2026-01-31')).rejects.toThrow();
  });
});
