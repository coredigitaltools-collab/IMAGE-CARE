// ============================================================
// ImageCare ERP - Stage 3: Credit Engine
// File: src/engines/credit/creditEngine.ts
// Purpose: Authoritative customer credit and receivables.
//
// RULES:
//   Credit balance is INDEPENDENT from cash until payment occurs.
//   Credit sales do NOT increase Cash in Hand.
//   Repayments MUST NOT silently exceed outstanding balance.
//   Partial payments are supported.
//   Credit is NOT receivables (receivables are invoices).
//   Credit != Cash. Receivables != Revenue.
// ============================================================

import { db } from '../../lib/db';
import type { UUID } from '../../types/database';
import type {
  EngineContext, EngineResult,
  CreateCreditChargeCommand, RecordCreditPaymentCommand, CreditResult,
} from '../types';
import { engineOk, engineFail, makeError } from '../types';
import { accountingEngine } from '../accounting/accountingEngine';
import { cashEngine } from '../cash/cashEngine';

export class CreditEngine {

  // ---- getBalance -----------------------------------------

  async getBalance(
    ctx: EngineContext,
    creditAccountId: UUID,
  ): Promise<EngineResult<{ balance: number; credit_limit: number }>> {
    const { data, error } = await db.credit_accounts()
      
      .select('current_balance, credit_limit, business_id')
      .eq('id', creditAccountId)
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      return engineFail(makeError('RECORD_NOT_FOUND', 'Credit account not found.'));
    }

    // Cross-business guard
    if (data.business_id !== ctx.business_id) {
      return engineFail(makeError('CROSS_BUSINESS_VIOLATION', 'Credit account belongs to a different business.'));
    }

    return engineOk({
      balance:      Number(data.current_balance),
      credit_limit: Number(data.credit_limit),
    });
  }

  // ---- charge ---------------------------------------------
  // Records a credit charge (customer uses credit).
  // Validates against credit_limit.

  async charge(
    ctx: EngineContext,
    cmd: CreateCreditChargeCommand,
  ): Promise<EngineResult<CreditResult>> {
    if (cmd.amount <= 0) {
      return engineFail(makeError('VALIDATION_ERROR', 'Charge amount must be positive.', undefined, 'amount'));
    }

    const balResult = await this.getBalance(ctx, cmd.credit_account_id);
    if (!balResult.ok) return engineFail(balResult.error!);

    const { balance, credit_limit } = balResult.data!;

    if (credit_limit > 0 && balance + cmd.amount > credit_limit) {
      return engineFail(makeError(
        'CREDIT_LIMIT_EXCEEDED',
        `This charge (${cmd.amount}) would exceed the credit limit (${credit_limit}). Current balance: ${balance}.`,
        undefined, 'amount',
      ));
    }

    const { data, error } = await db.credit_transactions()
      
      .insert({
        business_id:       ctx.business_id,
        branch_id:         ctx.branch_id ?? (await this.getBranchFromAccount(cmd.credit_account_id)),
        credit_account_id: cmd.credit_account_id,
        sale_id:           cmd.sale_id ?? null,
        transaction_type:  'charge',
        amount:            cmd.amount,
        notes:             cmd.notes ?? null,
        transaction_date:  new Date().toISOString(),
        created_by:        ctx.user_id,
      })
      .select('id, credit_account_id, amount')
      .single();

    if (error || !data) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to record credit charge.', error?.message));
    }

    const newBalance = balance + cmd.amount;

    return engineOk({
      transaction_id:    data.id as UUID,
      credit_account_id: data.credit_account_id as UUID,
      amount:            Number(data.amount),
      new_balance:       newBalance,
      transaction_type:  'charge',
    });
  }

  // ---- recordPayment --------------------------------------
  // Records a credit repayment.
  // Amount must not exceed outstanding balance.
  // (DB trigger fn_update_credit_balance enforces this at DB level;
  //  engine validates first to give a clear error before hitting the DB.)
  //
  // Bug fix (found during Phase 12 E2E verification): this previously
  // only inserted a credit_transactions row - the DB trigger correctly
  // updates credit_accounts.current_balance and customers.credit_balance,
  // but nothing ever posted the matching Dr Cash / Cr Accounts
  // Receivable journal entry, and nothing recorded the cash actually
  // received in cash_transactions. Unlike charge() (called from inside
  // postSale, which already posts the sale's full journal including the
  // Accounts Receivable line), recordPayment() has no other caller that
  // posts accounting for it - it IS the transaction. Left unfixed, the
  // books stayed permanently unbalanced (Receivable never credited back)
  // and Cash in Hand never reflected money actually collected from
  // credit customers.

  async recordPayment(
    ctx: EngineContext,
    cmd: RecordCreditPaymentCommand,
  ): Promise<EngineResult<CreditResult>> {
    if (cmd.amount <= 0) {
      return engineFail(makeError('VALIDATION_ERROR', 'Payment amount must be positive.', undefined, 'amount'));
    }

    const balResult = await this.getBalance(ctx, cmd.credit_account_id);
    if (!balResult.ok) return engineFail(balResult.error!);

    const { balance } = balResult.data!;

    // Pre-validate to give a clear error (DB trigger also enforces this)
    if (cmd.amount > balance) {
      return engineFail(makeError(
        'OVERPAYMENT',
        `Payment amount (${cmd.amount}) exceeds outstanding balance (${balance}). Investigate for duplicate payment.`,
        undefined, 'amount',
      ));
    }

    const branchId = ctx.branch_id ?? (await this.getBranchFromAccount(cmd.credit_account_id));
    if (!branchId) {
      return engineFail(makeError('VALIDATION_ERROR', 'Could not determine branch for this credit account.'));
    }

    // Post accounting: Dr Cash/Mobile Money/Bank, Cr Accounts Receivable
    const receivableAcct = await accountingEngine.resolveAccountCode(ctx.business_id, '1200');
    let cashCode = '1100';
    if (cmd.payment_method === 'mobile_money') cashCode = '1120';
    else if (cmd.payment_method === 'bank_transfer' || cmd.payment_method === 'card') cashCode = '1130';
    const cashAcct = await accountingEngine.resolveAccountCode(ctx.business_id, cashCode);

    const jeResult = await accountingEngine.postJournal(ctx, {
      branch_id:      branchId,
      entry_type:     'credit_payment',
      description:    'Credit repayment received',
      reference_type: 'credit_payment',
      reference_id:   cmd.credit_account_id,
      lines: [
        {
          account_code:  cashCode,
          account_name:  cashAcct.ok ? cashAcct.data!.account_name : 'Cash',
          account_type:  'asset',
          account_id:    cashAcct.ok ? cashAcct.data!.id : undefined,
          debit_amount:  cmd.amount,
          credit_amount: 0,
        },
        {
          account_code:  '1200',
          account_name:  receivableAcct.ok ? receivableAcct.data!.account_name : 'Accounts Receivable',
          account_type:  'asset',
          account_id:    receivableAcct.ok ? receivableAcct.data!.id : undefined,
          debit_amount:  0,
          credit_amount: cmd.amount,
          description:   'Payment clears receivable',
        },
      ],
    });
    if (!jeResult.ok) return engineFail(jeResult.error!);

    const { data, error } = await db.credit_transactions()

      .insert({
        business_id:       ctx.business_id,
        branch_id:         branchId,
        credit_account_id: cmd.credit_account_id,
        transaction_type:  'payment',
        amount:            cmd.amount,
        payment_method:    cmd.payment_method,
        reference_number:  cmd.reference_number ?? null,
        notes:             cmd.notes ?? null,
        transaction_date:  new Date().toISOString(),
        created_by:        ctx.user_id,
      })
      .select('id, credit_account_id, amount')
      .single();

    if (error || !data) {
      // Surface the DB-level overpayment error clearly
      if (error?.message?.includes('IMC-CREDIT')) {
        return engineFail(makeError('OVERPAYMENT', error.message));
      }
      return engineFail(makeError('DATABASE_ERROR', 'Failed to record credit payment.', error?.message));
    }

    // Record cash inflow (received from customer)
    const cashResult = await cashEngine.recordMovement(ctx, {
      branch_id:       branchId,
      transaction_type:'cash_in',
      amount:          cmd.amount,
      payment_method:  cmd.payment_method,
      reference_type:  'credit_payment',
      reference_id:    data.id as UUID,
      description:     'Credit repayment received',
      notes:           cmd.notes,
    });
    if (!cashResult.ok) return engineFail(cashResult.error!);

    return engineOk({
      transaction_id:    data.id as UUID,
      credit_account_id: data.credit_account_id as UUID,
      amount:            Number(data.amount),
      new_balance:       balance - cmd.amount,
      transaction_type:  'payment',
    });
  }

  // ---- getOrCreateCreditAccount ---------------------------

  async getOrCreateCreditAccount(
    ctx: EngineContext,
    customerId: UUID,
    branchId:   UUID,
  ): Promise<EngineResult<{ credit_account_id: UUID }>> {
    // Try to find existing active account
    const { data: existing } = await db.credit_accounts()
      
      .select('id')
      .eq('business_id', ctx.business_id)
      .eq('customer_id', customerId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .single();

    if (existing) {
      return engineOk({ credit_account_id: existing.id as UUID });
    }

    // Create new credit account
    const { data, error } = await db.credit_accounts()
      
      .insert({
        business_id: ctx.business_id,
        branch_id:   branchId,
        customer_id: customerId,
        credit_limit: 0,
        current_balance: 0,
        is_active:   true,
        created_by:  ctx.user_id,
      })
      .select('id')
      .single();

    if (error || !data) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to create credit account.', error?.message));
    }

    return engineOk({ credit_account_id: data.id as UUID });
  }

  private async getBranchFromAccount(creditAccountId: UUID): Promise<UUID | null> {
    const { data } = await db.credit_accounts()
      
      .select('branch_id')
      .eq('id', creditAccountId)
      .single();
    return (data?.branch_id ?? null) as UUID | null;
  }
}

export const creditEngine = new CreditEngine();
