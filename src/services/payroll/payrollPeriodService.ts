// ============================================================
// File: src/services/payroll/payrollPeriodService.ts
// Purpose: The real payroll *period* lifecycle, backed entirely by
//          imagecare.payroll (create -> calculate -> approve ->
//          payslips -> pay -> archive). No local store is involved.
//
// SCHEMA MODEL
// There is no payroll_periods table and this file deliberately does
// not invent one. One imagecare.payroll row is one employee's pay for
// one period, so a "period" is the set of rows sharing
// business_id + pay_period_start + pay_period_end. That derived key is
// what the UI uses as the period id (see encodePeriodId).
//
// Branch: payroll.branch_id is NOT NULL and each employee carries their
// own imagecare.users.branch_id, so a single payroll run for the whole
// business legitimately writes rows across several branches (and the
// journal/cash postings that Record Payment makes must land on each
// employee's own branch). Including branch_id in the period key would
// therefore split one payroll run into several periods in the UI, so
// the key is business + dates and branch stays a per-row fact.
//
// STATUS (imagecare.payroll.status is plain text - verified against
// pg_constraint, nothing constrains its values):
//   draft     -> period created, rows costed from real salaries
//   pending   -> "calculated" (the table's own native pre-approval
//                status, so the already-real approvePayroll() and
//                businessEngine.processPayroll() paths keep working
//                unchanged)
//   approved  -> approved and locked
//   paid      -> paid (journal + cash posted per employee)
//   archived  -> archived
//   cancelled -> legacy/other writers; read as archived
//
// "Payslips generated" is recorded as metadata.payslips_generated_at,
// NOT as a status value: the payroll row must stay 'approved' for
// businessEngine.processPayroll() to accept the payment afterwards,
// and the Record payment action is gated on the approved state.
//
// ERROR STYLE: these functions throw (they do not return
// ServiceResponse) because the payroll pages already branch on the
// typed business-rule errors in types/payroll.ts. Permission and
// database failures throw a plain Error carrying a safe message.
// ============================================================

import { supabase } from '../../lib/supabase';
import { canDo, parseError } from '../../types/app';
import type { UserContext } from '../../types/app';
import type { PayrollRecord, UUID } from '../../types/database';
import type { PayrollPeriod, PayrollPeriodStatus, PayslipLine } from '../../types/payroll';
import {
  InvalidPeriodTransitionError,
  NoEmployeesInPayrollError,
  OverlappingPeriodError,
  PayrollLockedError,
} from '../../types/payroll';
import { approvePayroll, processPayrollPayment } from '../financial/financialServices';

// payroll rows also carry created_by/updated_by columns that the
// shared PayrollRecord row type does not declare.
type PayrollRow = PayrollRecord & { created_by: UUID | null; updated_by: UUID | null };

interface EligibleEmployee {
  id: UUID;
  branch_id: UUID;
  fullName: string;
  salary: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 5000;
const PAYROLL_SELECT = '*';

// ---- Period id ---------------------------------------------
// A period has no row of its own, so its id is its derived key.
// Both halves are plain ISO dates, so this is URL-safe.

export function encodePeriodId(startDate: string, endDate: string): string {
  return `${dateOnly(startDate)}_${dateOnly(endDate)}`;
}

export function decodePeriodId(id: string): { startDate: string; endDate: string } | null {
  const [startDate, endDate] = (id ?? '').split('_');
  if (!ISO_DATE.test(startDate ?? '') || !ISO_DATE.test(endDate ?? '')) return null;
  return { startDate, endDate };
}

function dateOnly(value: string): string {
  return (value ?? '').slice(0, 10);
}

// imagecare.payroll's RLS modify policy is owner-only. A rejected
// INSERT surfaces as Postgres 42501, but a rejected UPDATE simply
// matches zero rows and returns no error at all - so every transition
// below re-reads the period afterwards and refuses to report success
// for a write that did not actually land.
function writeErrorMessage(err: unknown): string {
  const code = (err && typeof err === 'object' && 'code' in err) ? String((err as { code?: unknown }).code) : '';
  const raw = (err && typeof err === 'object' && 'message' in err) ? String((err as { message?: unknown }).message) : '';
  if (code === '42501' || raw.toLowerCase().includes('row-level security')) {
    return 'Payroll changes are restricted to the business owner.';
  }
  return parseError(err).message;
}

const NOT_SAVED = 'The payroll period could not be updated - the change was rejected by the database. Payroll changes are restricted to the business owner.';

// ---- Status mapping ----------------------------------------

const STATUS_RANK: Record<PayrollPeriodStatus, number> = {
  draft: 0, calculated: 1, approved: 2, paid: 3, archived: 4,
};

export function rowStatusToPeriodStatus(status: string): PayrollPeriodStatus {
  switch (status) {
    case 'pending':   return 'calculated';
    case 'approved':  return 'approved';
    case 'paid':      return 'paid';
    case 'archived':
    case 'cancelled': return 'archived';
    default:          return 'draft';
  }
}

/** A period is only as far along as its least-advanced row, so a
 *  partially-applied transition stays visible and can be re-run. */
function periodStatusOf(rows: PayrollRow[]): PayrollPeriodStatus {
  return rows
    .map(r => rowStatusToPeriodStatus(r.status))
    .reduce((lowest, s) => (STATUS_RANK[s] < STATUS_RANK[lowest] ? s : lowest), 'archived' as PayrollPeriodStatus);
}

// ---- Row loading -------------------------------------------

function payrollTable() {
  return supabase.schema('imagecare').from('payroll');
}

async function fetchAllRows(ctx: UserContext): Promise<PayrollRow[]> {
  const { data, error } = await payrollTable()
    .select(PAYROLL_SELECT)
    .eq('business_id', ctx.business_id)
    .is('deleted_at', null)
    .order('pay_period_start', { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw new Error(parseError(error).message);
  return (data ?? []) as unknown as PayrollRow[];
}

async function fetchPeriodRows(ctx: UserContext, startDate: string, endDate: string): Promise<PayrollRow[]> {
  const { data, error } = await payrollTable()
    .select(PAYROLL_SELECT)
    .eq('business_id', ctx.business_id)
    .eq('pay_period_start', startDate)
    .eq('pay_period_end', endDate)
    .is('deleted_at', null)
    .limit(MAX_ROWS);
  if (error) throw new Error(parseError(error).message);
  return (data ?? []) as unknown as PayrollRow[];
}

async function requirePeriodRows(ctx: UserContext, periodId: string): Promise<{ startDate: string; endDate: string; rows: PayrollRow[] }> {
  const parsed = decodePeriodId(periodId);
  if (!parsed) throw new Error('Payroll period not found.');
  const rows = await fetchPeriodRows(ctx, parsed.startDate, parsed.endDate);
  if (rows.length === 0) throw new Error('Payroll period not found.');
  return { ...parsed, rows };
}

// ---- Period assembly ---------------------------------------

function metaString(rows: PayrollRow[], key: string): string | null {
  for (const row of rows) {
    const value = (row.metadata ?? {})[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return null;
}

function latestUpdatedAt(rows: PayrollRow[]): string | null {
  return rows.reduce<string | null>((latest, r) => (!latest || r.updated_at > latest ? r.updated_at : latest), null);
}

function buildPeriod(rows: PayrollRow[]): PayrollPeriod {
  const status = periodStatusOf(rows);
  const paidRows = rows.filter(r => r.status === 'paid' || r.status === 'archived');
  return {
    id:        encodePeriodId(rows[0].pay_period_start, rows[0].pay_period_end),
    // The period's reference is the first payroll number issued for it -
    // a real, stable value from the rows themselves.
    reference: rows.map(r => r.payroll_number).sort()[0],
    startDate: dateOnly(rows[0].pay_period_start),
    endDate:   dateOnly(rows[0].pay_period_end),
    status,
    calculatedAt:        metaString(rows, 'calculated_at'),
    approvedAt:          metaString(rows, 'approved_at'),
    approvedByName:      metaString(rows, 'approved_by_name'),
    payslipsGeneratedAt: metaString(rows, 'payslips_generated_at'),
    paidAt:              STATUS_RANK[status] >= STATUS_RANK.paid ? latestUpdatedAt(paidRows) : null,
    archivedAt:          status === 'archived' ? latestUpdatedAt(rows) : null,
    createdAt:           rows.reduce((earliest, r) => (r.created_at < earliest ? r.created_at : earliest), rows[0].created_at),
    createdBy:           rows[0].created_by ?? '',
  };
}

function groupIntoPeriods(rows: PayrollRow[]): PayrollPeriod[] {
  const groups = new Map<string, PayrollRow[]>();
  for (const row of rows) {
    const key = encodePeriodId(row.pay_period_start, row.pay_period_end);
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()]
    .map(buildPeriod)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
}

// ---- Employees (real staff, real salaries) ------------------

/** Active staff from imagecare.users - the same real table and the
 *  same explicit-column discipline as settingsService.listStaff()
 *  (the PIN columns are never selected). An employee with no salary,
 *  or with no branch to post their pay to, cannot produce a valid
 *  payroll row (basic_salary/branch_id are NOT NULL), so they are
 *  reported as skipped instead of being inserted with a fake salary. */
async function fetchEligibleEmployees(ctx: UserContext): Promise<{ eligible: EligibleEmployee[]; skipped: string[] }> {
  const { data, error } = await supabase
    .schema('imagecare')
    .from('users')
    .select('id, first_name, last_name, branch_id, salary, is_active')
    .eq('business_id', ctx.business_id)
    .eq('is_active', true)
    .is('deleted_at', null)
    .order('first_name');
  if (error) throw new Error(parseError(error).message);

  type StaffRow = { id: UUID; first_name: string | null; last_name: string | null; branch_id: UUID | null; salary: number | string | null };
  const eligible: EligibleEmployee[] = [];
  const skipped: string[] = [];

  for (const user of ((data ?? []) as unknown as StaffRow[])) {
    const fullName = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || 'Unnamed staff member';
    const salary = Number(user.salary ?? 0);
    const branchId = user.branch_id ?? ctx.branch_id;
    if (!Number.isFinite(salary) || salary <= 0) { skipped.push(`${fullName} (no salary set)`); continue; }
    if (!branchId) { skipped.push(`${fullName} (no branch assigned)`); continue; }
    eligible.push({ id: user.id, branch_id: branchId, fullName, salary });
  }
  return { eligible, skipped };
}

/** payroll_number is UNIQUE per business. Numbers are zero-padded, so
 *  the lexicographically-highest one is also the numerically-highest. */
async function latestPayrollSequence(businessId: UUID): Promise<number> {
  const { data, error } = await payrollTable()
    .select('payroll_number')
    .eq('business_id', businessId)
    .order('payroll_number', { ascending: false })
    .limit(1);
  if (error) throw new Error(parseError(error).message);
  const latest = ((data ?? []) as unknown as { payroll_number: string }[])[0]?.payroll_number;
  const parsed = latest ? Number(latest.replace(/\D/g, '')) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function payrollNumber(sequence: number): string {
  return `PAY-${String(sequence).padStart(6, '0')}`;
}

// Amounts a period row carries. Allowance/overtime/deduction values have
// no real per-employee source in this schema (there is no real allowance
// or deduction table - the local pay-component catalogue is explicitly
// out of scope), so nothing is fabricated for them: they stay 0 and the
// figures are derived from the employee's real salary exactly the way
// businessEngine.recordPayroll derives them.
function amountsFor(basicSalary: number, row?: PayrollRow) {
  const allowances       = Number(row?.allowances ?? 0);
  const overtimePay      = Number(row?.overtime_pay ?? 0);
  const taxDeduction     = Number(row?.tax_deduction ?? 0);
  const nssfDeduction    = Number(row?.nssf_deduction ?? 0);
  const otherDeductions  = Number(row?.other_deductions ?? 0);
  const grossPay         = basicSalary + allowances + overtimePay;
  const totalDeductions  = taxDeduction + nssfDeduction + otherDeductions;
  return {
    basic_salary:     basicSalary,
    allowances,
    overtime_pay:     overtimePay,
    gross_pay:        grossPay,
    tax_deduction:    taxDeduction,
    nssf_deduction:   nssfDeduction,
    other_deductions: otherDeductions,
    total_deductions: totalDeductions,
    net_pay:          grossPay - totalDeductions,
  };
}

// ---- Read -------------------------------------------------

export async function listPeriods(ctx: UserContext): Promise<PayrollPeriod[]> {
  if (!canDo(ctx, 'payroll', 'view')) throw new Error('You do not have permission to view payroll.');
  return groupIntoPeriods(await fetchAllRows(ctx));
}

export async function getPeriod(ctx: UserContext, periodId: string): Promise<PayrollPeriod | null> {
  if (!canDo(ctx, 'payroll', 'view')) throw new Error('You do not have permission to view payroll.');
  const parsed = decodePeriodId(periodId);
  if (!parsed) return null;
  const rows = await fetchPeriodRows(ctx, parsed.startDate, parsed.endDate);
  return rows.length === 0 ? null : buildPeriod(rows);
}

/** Payslip lines are the period's real payroll rows. Draft rows are
 *  excluded so "Calculate" still means something in the UI: a period
 *  shows payslips once it has actually been calculated. */
export async function listPayslips(ctx: UserContext, periodId?: string): Promise<PayslipLine[]> {
  if (!canDo(ctx, 'payroll', 'view')) throw new Error('You do not have permission to view payroll.');

  let rows: PayrollRow[];
  if (periodId) {
    const parsed = decodePeriodId(periodId);
    if (!parsed) return [];
    rows = await fetchPeriodRows(ctx, parsed.startDate, parsed.endDate);
  } else {
    rows = await fetchAllRows(ctx);
  }
  rows = rows.filter(r => r.status !== 'draft');
  if (rows.length === 0) return [];

  const names = await fetchEmployeeNames(ctx, rows.map(r => r.user_id));

  return rows.map(row => {
    const allowances = [
      { name: 'Allowances', amount: Number(row.allowances) },
      { name: 'Overtime',   amount: Number(row.overtime_pay) },
    ].filter(a => a.amount > 0);
    const deductions = [
      { name: 'PAYE',            amount: Number(row.tax_deduction) },
      { name: 'NSSF',            amount: Number(row.nssf_deduction) },
      { name: 'Other deductions', amount: Number(row.other_deductions) },
    ].filter(d => d.amount > 0);

    return {
      id:               row.id,
      periodId:         encodePeriodId(row.pay_period_start, row.pay_period_end),
      employeeRecordId: row.id,
      staffId:          row.user_id,
      staffName:        names.get(row.user_id) ?? 'Unknown staff member',
      baseSalary:       Number(row.basic_salary),
      allowances,
      deductions,
      grossPay:         Number(row.gross_pay),
      totalDeductions:  Number(row.total_deductions),
      netPay:           Number(row.net_pay),
    };
  });
}

async function fetchEmployeeNames(ctx: UserContext, userIds: UUID[]): Promise<Map<UUID, string>> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const { data, error } = await supabase
    .schema('imagecare')
    .from('users')
    .select('id, first_name, last_name')
    .eq('business_id', ctx.business_id)
    .in('id', unique);
  if (error) return new Map();
  type NameRow = { id: UUID; first_name: string | null; last_name: string | null };
  return new Map(((data ?? []) as unknown as NameRow[]).map(u => [
    u.id,
    `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || 'Unknown staff member',
  ]));
}

// ---- Create ------------------------------------------------

export interface CreatePeriodResult {
  period: PayrollPeriod;
  /** Active staff who could not be given a payroll row, with the reason. */
  skipped: string[];
}

/** "Payroll periods cannot overlap", checked against every
 *  non-archived real period (an archived one is historical and can no
 *  longer conflict with anything going forward). */
export async function createPeriod(
  ctx: UserContext,
  startDate: string,
  endDate: string,
  userId: UUID,
): Promise<CreatePeriodResult> {
  if (!canDo(ctx, 'payroll', 'create')) throw new Error('You do not have permission to create payroll periods.');
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) throw new Error('Enter a valid start and end date.');
  if (new Date(endDate).getTime() < new Date(startDate).getTime()) throw new Error('End date must be on or after the start date.');

  const newStart = new Date(startDate).getTime();
  const newEnd = new Date(endDate).getTime();
  const overlaps = groupIntoPeriods(await fetchAllRows(ctx)).some(p => {
    if (p.status === 'archived') return false;
    return newStart <= new Date(p.endDate).getTime() && newEnd >= new Date(p.startDate).getTime();
  });
  if (overlaps) throw new OverlappingPeriodError();

  const { eligible, skipped } = await fetchEligibleEmployees(ctx);
  if (eligible.length === 0) {
    throw new NoEmployeesInPayrollError(
      skipped.length > 0
        ? `No active staff member can be paid yet. Set a salary in Settings → People & Access for: ${skipped.join(', ')}.`
        : 'Add an active staff member with a salary in Settings → People & Access before creating a payroll period.',
    );
  }

  const firstSequence = await latestPayrollSequence(ctx.business_id) + 1;
  const inserts = eligible.map((employee, index) => ({
    business_id:      ctx.business_id,
    branch_id:        employee.branch_id,
    user_id:          employee.id,
    payroll_number:   payrollNumber(firstSequence + index),
    pay_period_start: startDate,
    pay_period_end:   endDate,
    // The period end is the intended pay date until payment is recorded.
    pay_date:         endDate,
    ...amountsFor(employee.salary),
    payment_method:   'bank_transfer',
    status:           'draft',
    metadata:         {},
    created_by:       userId,
    updated_by:       userId,
  }));

  const { error } = await payrollTable().insert(inserts);
  if (error) throw new Error(writeErrorMessage(error));

  const period = await getPeriod(ctx, encodePeriodId(startDate, endDate));
  if (!period) throw new Error('The payroll period was saved but could not be reloaded.');
  return { period, skipped };
}

// ---- Calculate ---------------------------------------------

/** Calculation re-reads every employee's *current* real salary from
 *  imagecare.users and rewrites the period's rows from it, so a salary
 *  changed in Settings after the period was created is picked up - that
 *  is what makes Calculate a distinct step from Create rather than a
 *  cosmetic status flip. Newly-eligible staff are added to the run and
 *  staff who are no longer active (or no longer have a salary) drop out
 *  of it, mirroring the old rule that a recalculation rebuilds the
 *  period's payslip set rather than appending to it. Only allowed while
 *  the period is still draft/calculated - never after approval. */
export async function calculatePayroll(ctx: UserContext, periodId: string): Promise<PayslipLine[]> {
  if (!canDo(ctx, 'payroll', 'create') && !canDo(ctx, 'payroll', 'edit')) {
    throw new Error('You do not have permission to calculate payroll.');
  }
  const { rows } = await requirePeriodRows(ctx, periodId);
  const status = periodStatusOf(rows);
  if (status === 'approved' || status === 'paid' || status === 'archived') throw new PayrollLockedError();

  const parsed = decodePeriodId(periodId)!;
  const { eligible } = await fetchEligibleEmployees(ctx);
  const byUser = new Map(eligible.map(e => [e.id, e]));
  const now = new Date().toISOString();

  const keep = rows.filter(r => byUser.has(r.user_id));
  const stale = rows.filter(r => !byUser.has(r.user_id));
  if (keep.length === 0 && eligible.length === 0) throw new NoEmployeesInPayrollError();

  // 1. Re-cost every row that is still on the run from the real salary.
  const refreshed = await Promise.all(keep.map(async row => {
    const employee = byUser.get(row.user_id)!;
    const amounts = amountsFor(employee.salary, row);
    if (amounts.net_pay < 0) {
      return { error: `Deductions exceed gross pay for ${employee.fullName}.` };
    }
    const { error } = await payrollTable()
      .update({
        ...amounts,
        status:     'pending',
        metadata:   { ...(row.metadata ?? {}), calculated_at: now },
        updated_by: ctx.user_id,
      })
      .eq('id', row.id)
      .eq('business_id', ctx.business_id);
    return { error: error ? writeErrorMessage(error) : null };
  }));
  const refreshFailure = refreshed.find(r => r.error);
  if (refreshFailure?.error) throw new Error(refreshFailure.error);

  // 2. Add employees who became eligible after the period was created.
  const missing = eligible.filter(e => !rows.some(r => r.user_id === e.id));
  if (missing.length > 0) {
    const firstSequence = await latestPayrollSequence(ctx.business_id) + 1;
    const { error } = await payrollTable().insert(missing.map((employee, index) => ({
      business_id:      ctx.business_id,
      branch_id:        employee.branch_id,
      user_id:          employee.id,
      payroll_number:   payrollNumber(firstSequence + index),
      pay_period_start: parsed.startDate,
      pay_period_end:   parsed.endDate,
      pay_date:         parsed.endDate,
      ...amountsFor(employee.salary),
      payment_method:   'bank_transfer',
      status:           'pending',
      metadata:         { calculated_at: now },
      created_by:       ctx.user_id,
      updated_by:       ctx.user_id,
    })));
    if (error) throw new Error(writeErrorMessage(error));
  }

  // 3. Drop rows for staff who are no longer active / no longer salaried.
  //    Soft delete, matching how every other row in this schema is removed.
  if (stale.length > 0) {
    const { error } = await payrollTable()
      .update({ deleted_at: now, updated_by: ctx.user_id })
      .in('id', stale.map(r => r.id))
      .eq('business_id', ctx.business_id);
    if (error) throw new Error(writeErrorMessage(error));
  }

  const payslips = await listPayslips(ctx, periodId);
  // Draft rows are excluded from payslips, so an empty result here means
  // the status updates above matched no rows (see writeErrorMessage).
  if (payslips.length === 0) throw new Error(NOT_SAVED);
  return payslips;
}

// ---- Approve -----------------------------------------------

export async function approvePeriod(ctx: UserContext, periodId: string, approverName: string): Promise<PayrollPeriod> {
  const { rows } = await requirePeriodRows(ctx, periodId);
  if (periodStatusOf(rows) !== 'calculated') throw new InvalidPeriodTransitionError('Only a calculated period can be approved.');

  const now = new Date().toISOString();
  // Delegates to the already-real approvePayroll(), row by row - same
  // permission gate ('payroll:approve') and the same pending -> approved
  // transition it has always performed, with the approver recorded in
  // the row's own metadata.
  const results = await Promise.all(rows.map(row => approvePayroll(ctx, row.id, {
    metadata: { ...(row.metadata ?? {}), approved_at: now, approved_by_name: approverName },
  })));
  const failure = results.find(r => r.error);
  if (failure?.error) throw new Error(failure.error.message);

  return reloadPeriod(ctx, periodId, 'approved');
}

// ---- Payslips ----------------------------------------------

/** Recorded on the real rows as metadata.payslips_generated_at rather
 *  than as a status value: the rows must stay 'approved' so that
 *  Record payment (businessEngine.processPayroll) still accepts them. */
export async function markPayslipsGenerated(ctx: UserContext, periodId: string): Promise<PayrollPeriod> {
  if (!canDo(ctx, 'payroll', 'edit') && !canDo(ctx, 'payroll', 'approve')) {
    throw new Error('You do not have permission to generate payslips.');
  }
  const { rows } = await requirePeriodRows(ctx, periodId);
  if (periodStatusOf(rows) !== 'approved') throw new InvalidPeriodTransitionError('Approve the period before generating payslips.');

  const now = new Date().toISOString();
  const results = await Promise.all(rows.map(async row => {
    const { error } = await payrollTable()
      .update({
        metadata:   { ...(row.metadata ?? {}), payslips_generated_at: now },
        updated_by: ctx.user_id,
      })
      .eq('id', row.id)
      .eq('business_id', ctx.business_id);
    return error ? writeErrorMessage(error) : null;
  }));
  const failure = results.find(Boolean);
  if (failure) throw new Error(failure);

  const period = await reloadPeriod(ctx, periodId);
  if (!period.payslipsGeneratedAt) throw new Error(NOT_SAVED);
  return period;
}

// ---- Payment -----------------------------------------------

/** Pays the period one employee at a time through the already-real
 *  processPayrollPayment(), which posts the journal entry (Dr 6400
 *  Salaries and Wages) and the cash outflow for each employee on their
 *  own branch. Sequential on purpose: each call posts its own journal
 *  entry and cash movement. It is idempotent per row, so if one
 *  employee fails the action can simply be re-run. */
export async function recordPayrollPayment(ctx: UserContext, periodId: string): Promise<PayrollPeriod> {
  const { rows } = await requirePeriodRows(ctx, periodId);
  if (periodStatusOf(rows) !== 'approved') {
    throw new InvalidPeriodTransitionError('Approve the period (and generate payslips) before recording payment.');
  }

  for (const row of rows) {
    const result = await processPayrollPayment(ctx, row.id);
    if (result.error) throw new Error(result.error.message);
  }

  return reloadPeriod(ctx, periodId, 'paid');
}

// ---- Archive -----------------------------------------------

/** Archiving is a status transition, not a soft delete: archived
 *  periods stay readable in Payroll Reports and in the YTD cost KPI,
 *  exactly as paid ones do. */
export async function archivePeriod(ctx: UserContext, periodId: string): Promise<PayrollPeriod> {
  if (!canDo(ctx, 'payroll', 'edit') && !canDo(ctx, 'payroll', 'approve')) {
    throw new Error('You do not have permission to archive payroll periods.');
  }
  const { rows } = await requirePeriodRows(ctx, periodId);
  if (periodStatusOf(rows) !== 'paid') throw new InvalidPeriodTransitionError('Only a paid period can be archived.');

  const { error } = await payrollTable()
    .update({ status: 'archived', updated_by: ctx.user_id })
    .in('id', rows.map(r => r.id))
    .eq('business_id', ctx.business_id)
    .eq('status', 'paid');
  if (error) throw new Error(writeErrorMessage(error));

  return reloadPeriod(ctx, periodId, 'archived');
}

async function reloadPeriod(ctx: UserContext, periodId: string, expected?: PayrollPeriodStatus): Promise<PayrollPeriod> {
  const period = await getPeriod(ctx, periodId);
  if (!period) throw new Error('Payroll period not found.');
  if (expected && STATUS_RANK[period.status] < STATUS_RANK[expected]) throw new Error(NOT_SAVED);
  return period;
}
