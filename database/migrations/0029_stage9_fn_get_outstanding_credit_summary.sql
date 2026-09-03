-- Implements the RPC that src/services/credit/creditService.ts and
-- src/services/reporting/reportingService.ts have called since Stage 2 but
-- that never existed live (documented KNOWN GAP in reportingService.ts).
-- Without it, CreditAccountsPage.tsx silently renders an empty state
-- (error is swallowed into serviceFail with no error UI), hiding the
-- Record Payment / Write Off / Set Credit Limit actions for every account
-- not reached via a customer's own detail page. Save-button audit 2026-09-01.

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
    AND c.credit_balance > 0
    AND (p_branch_id IS NULL OR c.branch_id = p_branch_id)
  ORDER BY c.credit_balance DESC;
$function$;
