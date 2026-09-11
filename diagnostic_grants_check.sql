-- READ-ONLY diagnostic - does not change anything.
-- Compares table-level GRANTs for the 4 blocked tables against
-- known-working tables, for the role PostgREST uses (authenticated).
SELECT
  table_name,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS granted_privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'imagecare'
  AND grantee = 'authenticated'
  AND table_name IN ('bills', 'payroll', 'cash_transactions', 'branches', 'suppliers',
                      'customers', 'products', 'sales', 'expenses')
GROUP BY table_name
ORDER BY table_name;
