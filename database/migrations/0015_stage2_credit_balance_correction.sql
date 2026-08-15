-- ============================================================
-- ImageCare ERP - Stage 2 Correction Migration 0015
-- File: 0015_stage2_credit_balance_correction.sql
-- Version: IMC-STAGE-2-v1.1
-- Purpose: Correct fn_update_credit_balance() to explicitly
--   reject an invalid payment (amount > current_balance)
--   rather than silently clamping to zero with GREATEST(0, ...).
--
-- Business rules:
--   CHARGE: customer uses credit. Balance increases. No cap
--     beyond credit_limit (enforcement is at service layer).
--   PAYMENT: customer pays credit balance. Amount must not
--     exceed current_balance - this would indicate a data error
--     or a double payment. The function raises an exception so
--     the caller can investigate and correct, rather than
--     silently creating a phantom zero balance.
--
-- Distinction preserved:
--   credit_accounts.current_balance = outstanding credit owed
--   customers.credit_balance        = denormalized for fast lookup
--   Neither is cash. Cash in Hand is in cash_transactions.
--   Receivables are in invoices. These remain separate.
--
-- Depends on: 0014_stage2_journal_line_account_integrity.sql
-- Replaces the SECURITY DEFINER function created in 0008.
-- ============================================================

SET search_path TO imagecare, public;

CREATE OR REPLACE FUNCTION imagecare.fn_update_credit_balance()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_delta        NUMERIC(14,2);
  v_account      imagecare.credit_accounts%ROWTYPE;
BEGIN
  -- Load the credit account record BEFORE applying delta
  SELECT * INTO v_account
    FROM imagecare.credit_accounts
   WHERE id = NEW.credit_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'IMC-CREDIT: credit_account % not found', NEW.credit_account_id;
  END IF;

  IF NEW.transaction_type = 'charge' THEN
    -- Balance increases when customer uses credit
    v_delta := NEW.amount;

  ELSIF NEW.transaction_type = 'payment' THEN
    -- Validate: payment must not exceed the outstanding balance.
    -- GREATEST(0, ...) silently masks data errors - rejected per correction #4.
    IF NEW.amount > v_account.current_balance THEN
      RAISE EXCEPTION
        'IMC-CREDIT: payment amount (%) exceeds current credit balance (%) on account %. '
        'Investigate for duplicate payment or data entry error.',
        NEW.amount,
        v_account.current_balance,
        NEW.credit_account_id;
    END IF;
    v_delta := -NEW.amount;

  ELSE
    RAISE EXCEPTION
      'IMC-CREDIT: unknown transaction_type %. Must be ''charge'' or ''payment''.',
      NEW.transaction_type;
  END IF;

  -- Apply delta to credit_account
  UPDATE imagecare.credit_accounts
     SET current_balance = current_balance + v_delta,
         updated_at      = NOW()
   WHERE id = NEW.credit_account_id;

  -- Apply delta to denormalized balance on customers or suppliers.
  -- These are mirrors for fast lookup only - credit != cash.
  IF v_account.customer_id IS NOT NULL THEN
    UPDATE imagecare.customers
       SET credit_balance = credit_balance + v_delta,
           updated_at     = NOW()
     WHERE id = v_account.customer_id;
  ELSIF v_account.supplier_id IS NOT NULL THEN
    UPDATE imagecare.suppliers
       SET outstanding = outstanding + v_delta,
           updated_at  = NOW()
     WHERE id = v_account.supplier_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- MIGRATION LOG
-- ============================================================
DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
  'IMC-STAGE-2-0015',
  'Stage 2 Correction: fn_update_credit_balance - reject overpayment instead of silent clamp',
  'system', FALSE, NULL, NULL
);
END $$;
