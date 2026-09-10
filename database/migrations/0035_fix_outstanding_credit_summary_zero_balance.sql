-- Bug fix (2026-09-10), "Open customer credit accounts view": a customer
-- who just had a credit limit set (Set credit limit / CreditLimitModal)
-- but has not yet been charged anything has credit_balance = 0, so the old
-- "AND c.credit_balance > 0" filter silently excluded them from
-- fn_get_outstanding_credit_summary entirely - the Credit Accounts page
-- (CreditAccountsPage.tsx, via useCreditAccounts) and every other reader
-- of this RPC never saw them at all, even though the page's own empty-
-- state copy promises "Accounts appear here once a customer has a credit
-- limit set OR an outstanding balance." Widened to match that documented
-- behavior: a customer now appears once EITHER is true. A zero-balance
-- account still contributes 0 to every summed total (credit_balance is
-- still 0), so this only adds visibility, it does not change any existing
-- balance/outstanding figure anywhere the RPC is already read.
--
-- Applied live to Supabase on 2026-09-10.

CREATE OR REPLACE FUNCTION imagecare.fn_get_outstanding_credit_summary(
  p_business_id UUID,
  p_branch_id   UUID DEFAULT NULL
)
RETURNS TABLE (
  customer_id     UUID,
  customer_name   TEXT,
  phone           TEXT,
  credit_limit    NUMERIC,
  credit_balance  NUMERIC,
  utilization_pct NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'imagecare', 'pg_catalog'
AS $function$
  SELECT
    c.id                                                              AS customer_id,
    c.name                                                            AS customer_name,
    c.phone                                                           AS phone,
    c.credit_limit                                                    AS credit_limit,
    c.credit_balance                                                  AS credit_balance,
    CASE WHEN c.credit_limit > 0
         THEN ROUND((c.credit_balance / c.credit_limit) * 100, 1)
         ELSE 0
    END                                                                AS utilization_pct
  FROM imagecare.customers c
  WHERE c.business_id = p_business_id
    AND c.deleted_at IS NULL
    AND c.is_active = true
    AND (c.credit_balance > 0 OR c.credit_limit > 0)
    AND (
      p_branch_id IS NULL
      OR EXISTS (
        SELECT 1 FROM imagecare.credit_accounts ca
        WHERE ca.customer_id  = c.id
          AND ca.branch_id    = p_branch_id
          AND ca.deleted_at IS NULL
      )
    )
  ORDER BY c.credit_balance DESC;
$function$;
