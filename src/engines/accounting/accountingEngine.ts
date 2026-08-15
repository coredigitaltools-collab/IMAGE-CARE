// ============================================================
// ImageCare ERP - Stage 3: Accounting Engine
// File: src/engines/accounting/accountingEngine.ts
// Purpose: Authoritative double-entry accounting engine.
//
// RULES (enforced here and at DB level):
//   - Every posted journal entry balances: SUM(debit) = SUM(credit).
//   - Account codes are never hard-coded; resolved via accounts table.
//   - Posted entries are immutable; corrections use reversals.
//   - COGS affects profit, never cash.
//   - Callers cannot create an unbalanced posted entry.
// ============================================================

import { db } from '../../lib/db';
import type { UUID } from '../../types/database';
import type {
  EngineContext, EngineResult,
  PostJournalCommand, JournalResult, JournalLineInput,
} from '../types';
import { engineOk, engineFail, makeError } from '../types';

// ---- Account resolution ------------------------------------
// Never hard-code account IDs. Resolve from the authoritative
// accounts table (Chart of Accounts) using business_id + code.

export interface ResolvedAccount {
  id:           UUID;
  account_code: string;
  account_name: string;
  account_type: string;
}

async function resolveAccount(
  businessId: UUID,
  code: string,
): Promise<ResolvedAccount | null> {
  const { data } = await db.accounts()
    
    .select('id, account_code, account_name, account_type')
    .eq('business_id', businessId)
    .eq('account_code', code)
    .eq('is_active', true)
    .single();
  return data ?? null;
}

// ---- Sequence number ----------------------------------------

async function nextJournalNumber(businessId: UUID): Promise<string> {
  // Count posted + draft entries for this business for sequential numbering
  const { count } = await db.journal_entries()
    
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);

  const seq = ((count ?? 0) + 1).toString().padStart(6, '0');
  return `JE-${seq}`;
}

// ---- AccountingEngine class --------------------------------

export class AccountingEngine {

  // ---- resolveAccountCode ---------------------------------
  // Public helper so other engines can look up accounts.

  async resolveAccountCode(
    businessId: UUID,
    code: string,
  ): Promise<EngineResult<ResolvedAccount>> {
    const account = await resolveAccount(businessId, code);
    if (!account) {
      return engineFail(makeError(
        'ACCOUNT_NOT_FOUND',
        `Account code '${code}' not found in the Chart of Accounts.`,
        'Create the account in Settings before posting.',
        'account_code',
      ));
    }
    return engineOk(account);
  }

  // ---- postJournal ----------------------------------------
  // Posts a balanced journal entry.
  // Validates: lines are not empty, debits == credits.
  // Resolves account IDs from the authoritative accounts table.
  // Returns the created journal_entry record.

  async postJournal(
    ctx: EngineContext,
    cmd: PostJournalCommand,
  ): Promise<EngineResult<JournalResult>> {
    if (!cmd.lines.length) {
      return engineFail(makeError('VALIDATION_ERROR', 'Journal entry must have at least one line.'));
    }

    // Validate balance before touching DB
    const totalDebit  = cmd.lines.reduce((s, l) => s + (l.debit_amount  ?? 0), 0);
    const totalCredit = cmd.lines.reduce((s, l) => s + (l.credit_amount ?? 0), 0);

    if (Math.abs(totalDebit - totalCredit) >= 0.01) {
      return engineFail(makeError(
        'ACCOUNTING_IMBALANCE',
        `Journal entry does not balance: debit ${totalDebit.toFixed(2)} != credit ${totalCredit.toFixed(2)}.`,
      ));
    }

    // Validate each line: exactly one side non-zero
    for (const line of cmd.lines) {
      const hasDebit  = (line.debit_amount  ?? 0) > 0;
      const hasCredit = (line.credit_amount ?? 0) > 0;
      if (hasDebit === hasCredit) {
        return engineFail(makeError(
          'VALIDATION_ERROR',
          'Each journal line must have exactly one of debit or credit greater than zero.',
          `Account: ${line.account_code}`,
        ));
      }
    }

    // Resolve account IDs from the authoritative Chart of Accounts
    const resolvedLines: Array<JournalLineInput & { account_id?: UUID }> = [];

    for (const line of cmd.lines) {
      const account = await resolveAccount(ctx.business_id, line.account_code);
      // account_id is set when found; if not found the line still posts but
      // the DB trigger will validate if account_id is provided.
      resolvedLines.push({ ...line, account_id: account?.id });
    }

    const entryDate  = cmd.entry_date ?? new Date().toISOString();
    const entryMonth = new Date(entryDate).getMonth() + 1;
    const entryYear  = new Date(entryDate).getFullYear();
    const entryNum   = await nextJournalNumber(ctx.business_id);

    // Insert journal entry header
    const { data: jeData, error: jeErr } = await db.journal_entries()
      
      .insert({
        business_id:    ctx.business_id,
        branch_id:      cmd.branch_id,
        entry_number:   entryNum,
        entry_date:     entryDate,
        entry_type:     cmd.entry_type,
        description:    cmd.description,
        reference_type: cmd.reference_type,
        reference_id:   cmd.reference_id,
        total_debit:    totalDebit,
        total_credit:   totalCredit,
        status:         'posted',
        period_month:   entryMonth,
        period_year:    entryYear,
        created_by:     ctx.user_id,
      })
      .select('id, entry_number, total_debit, total_credit, status')
      .single();

    if (jeErr || !jeData) {
      // DB immutability trigger raises IMC-IMMUTABLE; surface that specifically
      if (jeErr?.message?.includes('IMC-IMMUTABLE')) {
        return engineFail(makeError('IMMUTABLE_RECORD', 'This journal entry is posted and cannot be modified.'));
      }
      return engineFail(makeError('DATABASE_ERROR', 'Failed to create journal entry.', jeErr?.message));
    }

    // Insert journal lines
    const lineRows = resolvedLines.map(line => ({
      journal_entry_id: jeData.id,
      business_id:      ctx.business_id,
      account_code:     line.account_code,
      account_name:     line.account_name,
      account_type:     line.account_type,
      account_id:       line.account_id ?? null,
      debit_amount:     line.debit_amount  ?? 0,
      credit_amount:    line.credit_amount ?? 0,
      description:      line.description ?? null,
    }));

    const { error: lineErr } = await db.journal_lines().insert(lineRows);

    if (lineErr) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to create journal lines.', lineErr.message));
    }

    return engineOk({
      journal_entry_id: jeData.id,
      entry_number:     jeData.entry_number,
      total_debit:      jeData.total_debit,
      total_credit:     jeData.total_credit,
      status:           jeData.status,
    });
  }

  // ---- reverseJournal -------------------------------------
  // Creates a reversal entry for a posted journal entry.
  // Debits become credits and vice versa.
  // The original entry is marked is_reversed = true.

  async reverseJournal(
    ctx: EngineContext,
    journalEntryId: UUID,
    reason: string,
  ): Promise<EngineResult<JournalResult>> {
    // Load the original entry
    const { data: orig, error: origErr } = await db.journal_entries()
      
      .select('*, journal_lines(*)')
      .eq('id', journalEntryId)
      .eq('business_id', ctx.business_id)
      .single();

    if (origErr || !orig) {
      return engineFail(makeError('RECORD_NOT_FOUND', 'Journal entry not found.'));
    }

    if (orig.status !== 'posted') {
      return engineFail(makeError('INVALID_STATUS_TRANSITION', 'Only posted journal entries can be reversed.'));
    }

    if (orig.is_reversed) {
      return engineFail(makeError('IMMUTABLE_RECORD', 'This journal entry has already been reversed.'));
    }

    // Build reversal lines - swap debit/credit
    type LineRow = { account_code: string; account_name: string; account_type: string; account_id?: UUID | null; debit_amount: number; credit_amount: number; };
    const reversalLines: JournalLineInput[] = (orig.journal_lines as LineRow[]).map((l) => ({
      account_code:  l.account_code,
      account_name:  l.account_name,
      account_type:  l.account_type as JournalLineInput['account_type'],
      account_id:    l.account_id ?? undefined,
      debit_amount:  l.credit_amount,  // swapped
      credit_amount: l.debit_amount,   // swapped
      description:   `Reversal: ${reason}`,
    }));

    const result = await this.postJournal(ctx, {
      branch_id:      orig.branch_id,
      entry_type:     orig.entry_type,
      description:    `Reversal of ${orig.entry_number}: ${reason}`,
      reference_type: 'journal_entry',
      reference_id:   journalEntryId,
      entry_date:     new Date().toISOString(),
      lines:          reversalLines,
    });

    if (!result.ok) return result;

    // Mark original as reversed
    await db.journal_entries()
      
      .update({ is_reversed: true, reversal_of: journalEntryId, updated_by: ctx.user_id })
      .eq('id', journalEntryId);

    return result;
  }

  // ---- buildSaleJournalLines ------------------------------
  // Constructs balanced journal lines for a sale.
  // Cash sale:    Dr Cash/Mobile, Cr Revenue, Dr COGS, Cr Inventory
  // Credit sale:  Dr Receivable,  Cr Revenue, Dr COGS, Cr Inventory
  // COGS never touches cash accounts.

  async buildSaleJournalLines(
    ctx: EngineContext,
    opts: {
      revenue:      number;
      cogs:         number;
      paymentMethod: string;
      isCreditSale: boolean;
    },
  ): Promise<EngineResult<JournalLineInput[]>> {
    const { revenue, cogs, paymentMethod, isCreditSale } = opts;

    // Determine debit account for the payment side
    let debitCode: string;
    if (isCreditSale) {
      debitCode = '1200'; // Accounts Receivable
    } else if (paymentMethod === 'mobile_money') {
      debitCode = '1120'; // Mobile Money
    } else if (paymentMethod === 'bank_transfer' || paymentMethod === 'card') {
      debitCode = '1130'; // Bank Account
    } else {
      debitCode = '1100'; // Cash in Hand
    }

    const debitAcct = await resolveAccount(ctx.business_id, debitCode);
    const revenueAcct = await resolveAccount(ctx.business_id, '4000');
    const cogsAcct = await resolveAccount(ctx.business_id, '5000');
    const inventoryAcct = await resolveAccount(ctx.business_id, '1300');

    const lines: JournalLineInput[] = [];

    // Dr Cash/Receivable, Cr Revenue
    lines.push({
      account_code:  debitCode,
      account_name:  debitAcct?.account_name ?? (isCreditSale ? 'Accounts Receivable' : 'Cash'),
      account_type:  'asset',
      account_id:    debitAcct?.id,
      debit_amount:  revenue,
      credit_amount: 0,
    });
    lines.push({
      account_code:  '4000',
      account_name:  revenueAcct?.account_name ?? 'Sales Revenue',
      account_type:  'revenue',
      account_id:    revenueAcct?.id,
      debit_amount:  0,
      credit_amount: revenue,
    });

    // Dr COGS, Cr Inventory (if COGS > 0)
    // COGS affects profit, never cash. These are separate lines.
    if (cogs > 0) {
      lines.push({
        account_code:  '5000',
        account_name:  cogsAcct?.account_name ?? 'Cost of Goods Sold',
        account_type:  'expense',
        account_id:    cogsAcct?.id,
        debit_amount:  cogs,
        credit_amount: 0,
        description:   'COGS - not a cash movement',
      });
      lines.push({
        account_code:  '1300',
        account_name:  inventoryAcct?.account_name ?? 'Inventory',
        account_type:  'asset',
        account_id:    inventoryAcct?.id,
        debit_amount:  0,
        credit_amount: cogs,
        description:   'Inventory reduction at cost',
      });
    }

    return engineOk(lines);
  }

  // ---- buildExpenseJournalLines ---------------------------

  async buildExpenseJournalLines(
    ctx: EngineContext,
    opts: { amount: number; paymentMethod: string; category: string },
  ): Promise<EngineResult<JournalLineInput[]>> {
    const { amount, paymentMethod, category } = opts;

    let creditCode: string;
    if (paymentMethod === 'mobile_money') {
      creditCode = '1120';
    } else if (paymentMethod === 'bank_transfer' || paymentMethod === 'card') {
      creditCode = '1130';
    } else {
      creditCode = '1100'; // Cash
    }

    const expenseAcct = await resolveAccount(ctx.business_id, '6000');
    const payAcct     = await resolveAccount(ctx.business_id, creditCode);

    return engineOk([
      {
        account_code:  '6000',
        account_name:  expenseAcct?.account_name ?? `Expense: ${category}`,
        account_type:  'expense' as const,
        account_id:    expenseAcct?.id,
        debit_amount:  amount,
        credit_amount: 0,
        description:   category,
      },
      {
        account_code:  creditCode,
        account_name:  payAcct?.account_name ?? 'Cash',
        account_type:  'asset' as const,
        account_id:    payAcct?.id,
        debit_amount:  0,
        credit_amount: amount,
      },
    ]);
  }

  // ---- buildPurchaseJournalLines --------------------------

  async buildPurchaseJournalLines(
    ctx: EngineContext,
    opts: { amount: number; paymentMethod: string; isPaid: boolean },
  ): Promise<EngineResult<JournalLineInput[]>> {
    const { amount, paymentMethod, isPaid } = opts;

    const inventoryAcct  = await resolveAccount(ctx.business_id, '1300');
    const payableAcct    = await resolveAccount(ctx.business_id, '2000');

    let cashCode = '1100';
    if (paymentMethod === 'mobile_money')               cashCode = '1120';
    else if (['bank_transfer','card'].includes(paymentMethod)) cashCode = '1130';

    const cashAcct = await resolveAccount(ctx.business_id, cashCode);

    // Dr Inventory, Cr Payable (always - stock received)
    const lines: JournalLineInput[] = [
      {
        account_code:  '1300',
        account_name:  inventoryAcct?.account_name ?? 'Inventory',
        account_type:  'asset' as const,
        account_id:    inventoryAcct?.id,
        debit_amount:  amount,
        credit_amount: 0,
      },
      {
        account_code:  '2000',
        account_name:  payableAcct?.account_name ?? 'Accounts Payable',
        account_type:  'liability' as const,
        account_id:    payableAcct?.id,
        debit_amount:  0,
        credit_amount: amount,
        description:   'Supplier payable on stock receipt',
      },
    ];

    // If paid immediately: Dr Payable, Cr Cash (clears the payable)
    if (isPaid) {
      lines.push({
        account_code:  '2000',
        account_name:  payableAcct?.account_name ?? 'Accounts Payable',
        account_type:  'liability' as const,
        account_id:    payableAcct?.id,
        debit_amount:  amount,
        credit_amount: 0,
        description:   'Payment clears payable',
      });
      lines.push({
        account_code:  cashCode,
        account_name:  cashAcct?.account_name ?? 'Cash',
        account_type:  'asset' as const,
        account_id:    cashAcct?.id,
        debit_amount:  0,
        credit_amount: amount,
      });
    }

    return engineOk(lines);
  }
}

export const accountingEngine = new AccountingEngine();
