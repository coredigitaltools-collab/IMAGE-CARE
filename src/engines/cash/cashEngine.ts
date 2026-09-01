// ============================================================
// ImageCare ERP - Stage 3: Cash Engine
// File: src/engines/cash/cashEngine.ts
// Purpose: Tracks actual cash movements. NOT accounting profit.
//
// RULES:
//   Cash in Hand = cash_transactions, not revenue totals.
//   Credit sales are NOT cash received.
//   COGS is NOT a cash movement.
//   Cash != Profit. Cash != Inventory.
//   Every movement is traceable to a source transaction.
// ============================================================

import { db } from '../../lib/db';
import type { UUID } from '../../types/database';
import type {
  EngineContext, EngineResult,
  RecordCashMovementCommand, CashMovementResult,
} from '../types';
import { engineOk, engineFail, makeError } from '../types';

async function nextTxnNumber(businessId: UUID): Promise<string> {
  const { count } = await db.cash_transactions()
    
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId);
  const seq = ((count ?? 0) + 1).toString().padStart(6, '0');
  return `CT-${seq}`;
}

export class CashEngine {

  // ---- recordMovement -------------------------------------
  // Records a cash_in or cash_out movement.
  // Cash must always trace to a source transaction.

  async recordMovement(
    ctx: EngineContext,
    cmd: RecordCashMovementCommand,
  ): Promise<EngineResult<CashMovementResult>> {
    if (cmd.amount <= 0) {
      return engineFail(makeError('VALIDATION_ERROR', 'Cash movement amount must be positive.', undefined, 'amount'));
    }

    const txnNum = await nextTxnNumber(ctx.business_id);

    const { data, error } = await db.cash_transactions()
      
      .insert({
        business_id:       ctx.business_id,
        branch_id:         cmd.branch_id,
        bank_account_id:   cmd.bank_account_id ?? null,
        transaction_number:txnNum,
        transaction_date:  new Date().toISOString(),
        transaction_type:  cmd.transaction_type,
        amount:            cmd.amount,
        reference_type:    cmd.reference_type  ?? null,
        reference_id:      cmd.reference_id    ?? null,
        description:       cmd.description,
        payment_method:    cmd.payment_method,
        status:            'confirmed',
        notes:             cmd.notes           ?? null,
        created_by:        ctx.user_id,
      })
      .select('id, transaction_number, amount, transaction_type')
      .single();

    if (error || !data) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to record cash movement.', error?.message));
    }

    return engineOk({
      transaction_id:     data.id as UUID,
      transaction_number: data.transaction_number as string,
      amount:             Number(data.amount),
      transaction_type:   data.transaction_type as string,
    });
  }

  // ---- getCashBalance -------------------------------------
  // Returns cash in hand for a branch.
  // Derived from cash_transactions, NEVER from accounting profit.

  async getCashBalance(
    ctx: EngineContext,
    branchId: UUID,
  ): Promise<EngineResult<{ balance: number; total_in: number; total_out: number }>> {
    const { data, error } = await db.cash_transactions()
      
      .select('transaction_type, amount')
      .eq('business_id', ctx.business_id)
      .eq('branch_id', branchId)
      .eq('status', 'confirmed')
      .is('deleted_at', null);

    if (error) {
      return engineFail(makeError('DATABASE_ERROR', 'Failed to calculate cash balance.', error.message));
    }

    let totalIn  = 0;
    let totalOut = 0;

    for (const row of data ?? []) {
      const amt = Number(row.amount);
      if (['cash_in', 'deposit'].includes(row.transaction_type)) {
        totalIn += amt;
      } else if (['cash_out', 'withdrawal'].includes(row.transaction_type)) {
        totalOut += amt;
      }
    }

    return engineOk({ balance: totalIn - totalOut, total_in: totalIn, total_out: totalOut });
  }

  // ---- recordSaleCashIn -----------------------------------
  // Convenience: records cash-in from a confirmed cash sale.

  async recordSaleCashIn(
    ctx: EngineContext,
    opts: { branch_id: UUID; sale_id: UUID; amount: number; payment_method: string },
  ): Promise<EngineResult<CashMovementResult>> {
    return this.recordMovement(ctx, {
      branch_id:       opts.branch_id,
      transaction_type:'cash_in',
      amount:          opts.amount,
      payment_method:  opts.payment_method as import('../../types/database').PaymentMethod,
      reference_type:  'sale',
      reference_id:    opts.sale_id,
      description:     `Cash received for sale`,
    });
  }

  // ---- reverseSaleCashIn ------------------------------------
  // Backs out the cash received for a sale that is being deleted.
  // Recorded as a cash_out so the balance nets back to zero for
  // this sale, fully traceable to it via reference_type/reference_id.

  async reverseSaleCashIn(
    ctx: EngineContext,
    opts: { branch_id: UUID; sale_id: UUID; amount: number; payment_method: string },
  ): Promise<EngineResult<CashMovementResult>> {
    return this.recordMovement(ctx, {
      branch_id:       opts.branch_id,
      transaction_type:'cash_out',
      amount:          opts.amount,
      payment_method:  opts.payment_method as import('../../types/database').PaymentMethod,
      reference_type:  'sale',
      reference_id:    opts.sale_id,
      description:     `Reversal of cash received for cancelled sale`,
    });
  }

  // ---- recordExpenseCashOut --------------------------------

  async recordExpenseCashOut(
    ctx: EngineContext,
    opts: { branch_id: UUID; expense_id: UUID; amount: number; payment_method: string; description: string },
  ): Promise<EngineResult<CashMovementResult>> {
    return this.recordMovement(ctx, {
      branch_id:       opts.branch_id,
      transaction_type:'cash_out',
      amount:          opts.amount,
      payment_method:  opts.payment_method as import('../../types/database').PaymentMethod,
      reference_type:  'expense',
      reference_id:    opts.expense_id,
      description:     opts.description,
    });
  }
}

export const cashEngine = new CashEngine();
