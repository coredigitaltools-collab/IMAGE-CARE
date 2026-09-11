-- ============================================================
-- IMC-STAGE-9-0031 | Loyalty: real point-awarding + redemption
--
-- Bug report (2026-09-05): "I believe loyalty should be connected to
-- customers. I set a reward but i have a customer that has bought over
-- 500000 but is not showing on Loyalty."
--
-- Root cause (confirmed by code + data audit, not guessed): the real
-- imagecare.loyalty_accounts / loyalty_transactions tables have existed
-- since 0011_stage2_supporting_domains.sql and are correctly read by the
-- Loyalty Dashboard's "Top members" list and the Customer Detail page's
-- Loyalty tab - but NOTHING in the app has ever written to them. The
-- only code that ever called an "award points" function
-- (src/services/loyaltyService.ts's awardPoints) is wired into the OLD,
-- fully local-storage checkout path (src/services/salesService.ts),
-- which the real Point-of-Sale checkout (useCheckout -> createSale in
-- src/services/sales/salesService.ts) does not use at all. Confirmed via
-- direct query: 0 rows in imagecare.loyalty_accounts for this business,
-- despite 3 customers having real completed sales (Malkia 946,000 UGX,
-- May 354,000 UGX, Kendi 300,000 UGX).
--
-- This migration adds the two real, atomic operations the frontend needs
-- (award on a completed sale, redeem for a reward) and backfills the
-- three customers above so their existing purchase history counts, per
-- the business owner's explicit choice (AskUserQuestion, 2026-09-05:
-- "Yes, backfill past sales too") using the 1 point per 1,000 UGX rate
-- already configured as the default in Loyalty Settings
-- (src/services/loyaltyService.ts's seedLoyaltySettings).
--
-- Scope, deliberately unchanged: the loyalty_rewards catalogue and
-- loyalty_redemptions log still have no table in the real schema (see
-- docs/MODULE_INTEGRATION_MAP.md gap, restated in loyaltyService.ts) and
-- stay local-storage - this migration does not invent those tables. Only
-- the points balance itself (which now has real, verified money behind
-- it via awarded sales) is made real.
-- ============================================================

-- ---------- fn_award_loyalty_points ----------
-- Called once per completed sale that has a customer attached. Enrolls
-- the customer automatically on their first qualifying sale (matches the
-- product's own stated promise on the Loyalty Dashboard: "every customer
-- is enrolled automatically, they start earning points the moment they
-- make their first sale"). The UGX-per-point rate is passed in by the
-- caller (read from the business's own editable Loyalty Settings) rather
-- than hardcoded here - this function only makes the write atomic and
-- idempotent, it does not decide the business rule.
CREATE OR REPLACE FUNCTION imagecare.fn_award_loyalty_points(
  p_customer_id UUID,
  p_sale_id UUID,
  p_amount_ugx NUMERIC,
  p_ugx_per_point NUMERIC,
  p_description TEXT DEFAULT 'Points earned on completed sale'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = imagecare, pg_catalog
AS $$
DECLARE
  v_business_id UUID;
  v_user_id     UUID;
  v_account_id  UUID;
  v_points      NUMERIC;
  v_new_balance NUMERIC;
BEGIN
  v_business_id := imagecare.fn_current_business_id();
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: No active user found for this session';
  END IF;
  v_user_id := imagecare.fn_current_user_id();

  IF p_ugx_per_point IS NULL OR p_ugx_per_point <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Invalid points conversion rate';
  END IF;

  -- Idempotency: a retried checkout (or a duplicate call) must never
  -- award the same sale twice.
  IF p_sale_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM imagecare.loyalty_transactions
    WHERE business_id = v_business_id AND sale_id = p_sale_id AND transaction_type = 'earn'
  ) THEN
    RETURN jsonb_build_object('success', TRUE, 'points', 0, 'already_awarded', TRUE);
  END IF;

  v_points := floor(p_amount_ugx / p_ugx_per_point);
  IF v_points <= 0 THEN
    RETURN jsonb_build_object('success', TRUE, 'points', 0);
  END IF;

  SELECT id INTO v_account_id FROM imagecare.loyalty_accounts
    WHERE business_id = v_business_id AND customer_id = p_customer_id;

  IF v_account_id IS NULL THEN
    INSERT INTO imagecare.loyalty_accounts (business_id, customer_id, points_balance, last_activity)
      VALUES (v_business_id, p_customer_id, v_points, NOW())
      RETURNING id, points_balance INTO v_account_id, v_new_balance;
  ELSE
    UPDATE imagecare.loyalty_accounts
      SET points_balance = points_balance + v_points, last_activity = NOW(), updated_at = NOW()
      WHERE id = v_account_id
      RETURNING points_balance INTO v_new_balance;
  END IF;

  INSERT INTO imagecare.loyalty_transactions
      (business_id, loyalty_account_id, sale_id, transaction_type, points, description, created_by)
    VALUES (v_business_id, v_account_id, p_sale_id, 'earn', v_points, p_description, v_user_id);

  RETURN jsonb_build_object('success', TRUE, 'points', v_points, 'new_balance', v_new_balance);
END;
$$;
GRANT EXECUTE ON FUNCTION imagecare.fn_award_loyalty_points(UUID, UUID, NUMERIC, NUMERIC, TEXT) TO authenticated;

-- ---------- fn_redeem_loyalty_points ----------
-- Debits a real, verified points balance. The reward catalogue itself
-- (which reward, its point cost) stays in the frontend's local store -
-- this function only knows "take N points from this customer, if they
-- have them" so the balance it debits is always the same real balance
-- fn_award_loyalty_points credits.
CREATE OR REPLACE FUNCTION imagecare.fn_redeem_loyalty_points(
  p_customer_id UUID,
  p_points NUMERIC,
  p_description TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = imagecare, pg_catalog
AS $$
DECLARE
  v_business_id UUID;
  v_user_id     UUID;
  v_account     imagecare.loyalty_accounts%ROWTYPE;
  v_new_balance NUMERIC;
BEGIN
  v_business_id := imagecare.fn_current_business_id();
  IF v_business_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: No active user found for this session';
  END IF;
  v_user_id := imagecare.fn_current_user_id();

  IF p_points IS NULL OR p_points <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: Points to redeem must be greater than zero';
  END IF;

  SELECT * INTO v_account FROM imagecare.loyalty_accounts
    WHERE business_id = v_business_id AND customer_id = p_customer_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: This customer is not enrolled in the loyalty programme yet';
  END IF;
  IF v_account.points_balance < p_points THEN
    RAISE EXCEPTION 'INSUFFICIENT_POINTS: % available, % needed', v_account.points_balance, p_points;
  END IF;

  UPDATE imagecare.loyalty_accounts
    SET points_balance = points_balance - p_points, last_activity = NOW(), updated_at = NOW()
    WHERE id = v_account.id
    RETURNING points_balance INTO v_new_balance;

  INSERT INTO imagecare.loyalty_transactions
      (business_id, loyalty_account_id, sale_id, transaction_type, points, description, created_by)
    VALUES (v_business_id, v_account.id, NULL, 'redeem', p_points, p_description, v_user_id);

  RETURN jsonb_build_object('success', TRUE, 'new_balance', v_new_balance);
END;
$$;
GRANT EXECUTE ON FUNCTION imagecare.fn_redeem_loyalty_points(UUID, NUMERIC, TEXT) TO authenticated;

-- ---------- One-time backfill ----------
-- Business owner's explicit choice: credit every customer's already-real,
-- already-completed sales at the 1,000 UGX = 1 point default rate, so
-- historical purchases (e.g. Malkia's 946,000 UGX) count immediately
-- instead of only sales made after this fix ships.
DO $$
DECLARE
  r RECORD;
  v_account_id UUID;
  v_points NUMERIC;
BEGIN
  FOR r IN
    SELECT c.id AS customer_id, c.business_id, SUM(s.total_amount) AS total_spent
    FROM imagecare.customers c
    JOIN imagecare.sales s ON s.customer_id = c.id AND s.business_id = c.business_id AND s.status = 'confirmed'
    WHERE NOT EXISTS (
      SELECT 1 FROM imagecare.loyalty_accounts la
      WHERE la.business_id = c.business_id AND la.customer_id = c.id
    )
    GROUP BY c.id, c.business_id
  LOOP
    v_points := floor(r.total_spent / 1000);
    IF v_points > 0 THEN
      INSERT INTO imagecare.loyalty_accounts (business_id, customer_id, points_balance, last_activity)
        VALUES (r.business_id, r.customer_id, v_points, NOW())
        RETURNING id INTO v_account_id;

      INSERT INTO imagecare.loyalty_transactions
          (business_id, loyalty_account_id, sale_id, transaction_type, points, description)
        VALUES (
          r.business_id, v_account_id, NULL, 'earn', v_points,
          'Backfill: historical purchases as of 2026-09-05 (1,000 UGX = 1 pt)'
        );
    END IF;
  END LOOP;
END $$;

DO $$ BEGIN
  PERFORM imagecare.fn_log_migration(
    'IMC-STAGE-9-0031',
    'Real loyalty point award/redeem functions (fn_award_loyalty_points, fn_redeem_loyalty_points) so a completed sale actually credits imagecare.loyalty_accounts/loyalty_transactions, plus a one-time backfill crediting existing customers'' historical confirmed sales at 1,000 UGX = 1 point.',
    'system', FALSE, NULL, NULL
  );
END $$;
