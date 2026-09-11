-- Adds a genuine 'write_off' transaction_type to credit_transactions so the
-- "Write Off Balance" save action (previously always failed: CHECK constraint
-- and trigger only allowed 'charge'/'payment') can actually persist.
-- Save-button audit 2026-09-01.

ALTER TABLE imagecare.credit_transactions
  DROP CONSTRAINT chk_s2_credit_txn_type;

ALTER TABLE imagecare.credit_transactions
  ADD CONSTRAINT chk_s2_credit_txn_type
  CHECK (transaction_type = ANY (ARRAY['charge'::text, 'payment'::text, 'write_off'::text]));

CREATE OR REPLACE FUNCTION imagecare.fn_update_credit_balance()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'imagecare', 'pg_catalog'
AS $function$
DECLARE
  v_delta        NUMERIC(14,2);
  v_account      imagecare.credit_accounts%ROWTYPE;
BEGIN
  SELECT * INTO v_account
    FROM imagecare.credit_accounts
   WHERE id = NEW.credit_account_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'IMC-CREDIT: credit_account % not found', NEW.credit_account_id;
  END IF;

  IF NEW.transaction_type = 'charge' THEN
    v_delta := NEW.amount;

  ELSIF NEW.transaction_type = 'payment' THEN
    IF NEW.amount > v_account.current_balance THEN
      RAISE EXCEPTION
        'IMC-CREDIT: payment amount (%) exceeds current credit balance (%) on account %. '
        'Investigate for duplicate payment or data entry error.',
        NEW.amount,
        v_account.current_balance,
        NEW.credit_account_id;
    END IF;
    v_delta := -NEW.amount;

  ELSIF NEW.transaction_type = 'write_off' THEN
    IF NEW.amount > v_account.current_balance THEN
      RAISE EXCEPTION
        'IMC-CREDIT: write-off amount (%) exceeds current credit balance (%) on account %.',
        NEW.amount,
        v_account.current_balance,
        NEW.credit_account_id;
    END IF;
    v_delta := -NEW.amount;

  ELSE
    RAISE EXCEPTION
      'IMC-CREDIT: unknown transaction_type %. Must be ''charge'', ''payment'' or ''write_off''.',
      NEW.transaction_type;
  END IF;

  UPDATE imagecare.credit_accounts
     SET current_balance = current_balance + v_delta,
         updated_at      = NOW()
   WHERE id = NEW.credit_account_id;

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
$function$;
