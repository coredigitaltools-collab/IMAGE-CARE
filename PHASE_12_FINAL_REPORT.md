# ImageCare ERP — Backend Implementation Pass: Final Report

**Date:** 2026-08-24
**Scope:** Clean and connect one working backend underneath the existing ImageCare frontend, without rebuilding the frontend or inventing new architecture. Fix the 10 known code issues, remove stale/nonexistent references, retire duplicate legacy services once confirmed unused, and prove the result works end-to-end against the live Supabase backend.

---

## 1. Database migration created

Six new migrations were written and applied live to the Supabase project (`dgqwcqimflidzwiqmlzq`), on top of the existing `0001`–`0019` baseline:

- `0020_stage7_pin_auth.sql` — PIN-based authentication support (from an earlier stage of this pass).
- `0021_stage8_authenticated_table_grants.sql` — GRANT statements restoring table access for the `authenticated` role (RLS policies exist, but without the underlying GRANTs Postgres denies access before RLS is ever evaluated).
- `0022_stage8_security_definer_hardening.sql` / `0023_stage8_security_definer_public_revoke.sql` — hardened `SECURITY DEFINER` functions with explicit `search_path` and revoked `PUBLIC` execute rights, keeping them callable only by `authenticated`.
- `0024_stage8_missing_tables.sql` — added tables the frontend/service layer referenced but which didn't exist (`storage_metadata`, `expense_categories`, `customer_notes`), and corrected a handful of nonexistent-table references discovered in Phase 8's audit.
- `0025_stage8_seed_coa_on_registration.sql` — **the most important migration of this pass.** Fixes an ambiguous-column bug in `fn_seed_chart_of_accounts` (it had never once run successfully) and wires it into `fn_register_business()` so every new business gets its 18-account chart of accounts atomically at registration. Backfills the two pre-existing real businesses, which both had zero accounts.

All six are applied and confirmed live via `mcp__Supabase__list_migrations`.

## 2. Grants applied

`GRANT` statements for the `authenticated` role were applied across the `imagecare` schema's core tables (migration `0021`), and `SECURITY DEFINER` functions were re-issued with `REVOKE EXECUTE ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated` (migrations `0022`/`0023`), closing the gap where RLS policies existed but the role had no table-level access to reach them. This was verified in an earlier segment of this pass by querying `information_schema.role_table_grants` and confirming `authenticated` now appears for every core table.

## 3. Transaction architecture chosen

Every financial workflow (sale, purchase, expense, payroll, credit charge/payment, supplier payment) posts through the existing double-entry engine layer in `src/engines/`: a command object goes to the relevant engine method, which builds `journal_lines` via `accountingEngine.postJournal()`, then records the matching `cash_transactions`/`inventory_movements`/`credit_transactions` row. `imagecare.vw_account_balances` aggregates `journal_lines` by `(business_id, branch_id, period, account_code)` for reporting. No new transaction architecture was introduced — this pass connected the frontend/service layer to the engine layer that already existed, and fixed the engine layer where it was itself broken (see §6/§10).

## 4. Existing engine code reused

All nine core workflows route through the pre-existing engines (`salesEngine`/`businessEngine`, `purchasingEngine`, `inventoryEngine`, `creditEngine`, `cashEngine`, `accountingEngine`) rather than new bespoke code. Where a service function called a nonexistent RPC, the fix was to delegate to the matching real engine method (e.g. `financialServices.getCashBalance` now calls `cashEngine.getCashBalance()`) or to query the real underlying table/view directly — never to invent a new table, RPC, or parallel code path.

## 5. Core workflows working

All nine core-9 workflows were exercised end-to-end against the **live** Supabase project via SQL-level simulation (see §15) and are confirmed working with correct double-entry accounting:

1. Purchase → receive → inventory increase → supplier outstanding increase
2. Cash sale → inventory decrease → revenue/COGS posted → cash increase
3. Expense → expense record → cash decrease
4. Credit sale → customer credit balance increase
5. Credit payment → customer balance decrease → cash increase → receivable cleared (**required an engine fix**, see §10)
6. Stock adjustment → inventory quantity corrected
7. Stock transfer (branch A → branch B) → both branches' balances correct
8. Supplier payment → supplier outstanding decrease → payable cleared (**required an engine fix**, see §10)
9. Payroll → salaries expense posted → cash decrease

The full ledger balances to the penny across all 7 journal entries posted during the test run: total debits = total credits = 37,750 UGX-equivalent, confirmed by direct SQL aggregation over `journal_lines`.

## 6. Reporting status

Reporting was the single most broken layer discovered in this pass. `getDashboardKPIs`, `getCashPosition` (in `src/services/reporting/reportingService.ts`) called RPCs — `fn_get_dashboard_kpis`, `fn_get_cash_position` — that do not exist in any migration or live in the schema. Since these two functions are the KPI source for the Dashboard, Daily/Monthly/Annual Summary, Sales Targets, and Branch Overview pages, **the entire reporting layer returned a hard error on every load** prior to this fix. Both were rewritten to compute the same figures directly from `sales`, `journal_entries`/`journal_lines`, `cash_transactions`, and `credit_accounts` — the same tables the engines already write to. `getPLSummary` had a second, separate bug: it queried a `branch_id` column on `journal_lines` that doesn't exist (would throw on any branch-filtered call), and hardcoded expenses to account code `6000` only, which silently excluded payroll (always posted to `6400`) from Net Profit. Both are fixed. All three functions were verified against the live E2E data (§15) and produce figures that match hand-computed values exactly.

`getSalesByPeriod`, `getTopProducts`, `getOutstandingCredit`, and `getExpenseBreakdown` remain on nonexistent RPCs — documented as a known, lower-priority deferred gap (no core-9 workflow or the Dashboard/Summary pages depend on them; they fail safely with a real error rather than fake data).

## 7. Legacy services retired/repointed

A full-repo import audit (Phase 10) was run before touching anything. No legacy service was deleted — none had zero call sites. `dashboardService.ts` was confirmed genuinely dead code (only referenced in a comment) and was fixed anyway per the Phase 7 instruction, but left in place rather than deleted since deletion wasn't requested. `Bills` remains on its local-first/IndexedDB architecture (`billsService.ts`) — confirmed still actively used by `useBillsData.ts` and out of core-9 priority scope, so left as-is and documented rather than silently reworked.

## 8. Security changes

- RLS + GRANT gap closed (§2).
- `SECURITY DEFINER` functions hardened with explicit `search_path` and `PUBLIC` execute revoked (§1).
- **New finding, not yet remediated:** a live Supabase security-advisor check run at the end of this pass shows 4 ERROR-level findings: three reporting views (`vw_account_balances`, `vw_stock_summary`, `vw_engine_account_summary`) are defined `SECURITY DEFINER`, meaning they bypass RLS and run with the view owner's privileges rather than the querying user's — every read path in the app filters explicitly by `business_id`, so this isn't exploitable through the app itself, but it means anyone with a valid Supabase session who queries these views directly (bypassing the service layer) could read another business's data. `imagecare.migration_log` also has RLS disabled. These views predate this pass; recommend converting them to `SECURITY INVOKER` (Postgres 15+) or adding an explicit `business_id` check in a follow-up migration.

## 9. Files changed

68 files were changed or added across this pass and delivered to your machine (`C:\GITHUB\IMAGE-CARE`) via the connected-folder sync run at the end of this session: 6 new database migrations, 3 root-level audit/report docs, the app shell/router/context, 5 new auth pages (PIN setup, register, unlock, forgot-PIN), 3 engine files, 20 feature-hook files, 14 service files, and 5 test files. The full list is in the git working-tree diff (`git status`/`git diff --stat`) in the repo — nothing has been committed, per instruction to only commit when explicitly asked.

One cleanup note: `vite.config.ts` was renamed to `vite.config.mts` during this pass. The old `vite.config.ts` still exists on your machine alongside the new file (this tooling can write files but not delete them) — please delete `vite.config.ts` manually once you've confirmed `vite.config.mts` is working.

## 10. Database objects created/changed

- Tables added: `storage_metadata`, `expense_categories`, `customer_notes` (migration `0024`).
- Function fixed: `imagecare.fn_seed_chart_of_accounts` (ambiguous-column bug, migration `0025`) — **the single most severe bug found in this pass.** It had never once executed successfully against the live database and was never called by any code path, meaning every registered business (including both real production businesses) had zero rows in `imagecare.accounts`. Every accounting-relevant operation for every business would have failed with `ACCOUNT_NOT_FOUND`.
- Function fixed: `imagecare.fn_register_business` — now calls `fn_seed_chart_of_accounts` atomically at registration.
- Backfill: both pre-existing real businesses ("Test Business A Holdings", "Sarafina") seeded live; both now show 18 accounts.
- Code-level fix (not a DB migration): `purchasingEngine.recordSupplierPayment()` posted `entry_type: 'supplier_payment'` to `postJournal()`, but `imagecare.journal_entry_type` is a Postgres ENUM with no `supplier_payment` member (valid values: `sale, purchase, payroll, expense, credit_payment, bank_deposit, bank_withdrawal, adjustment, opening_balance, transfer`). Every real supplier payment would have failed at the database with a `22P02` enum error. Fixed by changing it to `'purchase'`, the correct existing enum member for a payment tied to a purchase's payable. Confirmed live: the corrected supplier payment posted and balanced correctly.
- Code-level fix: `creditEngine.recordPayment()` never posted a journal entry or recorded cash for credit repayments — only the DB trigger updated `credit_accounts.current_balance`/`customers.credit_balance`. Fixed to post `Dr Cash / Cr Accounts Receivable` and record the cash inflow, matching `charge()`'s symmetric treatment.

## 11. Typecheck result

**PASS.** `npm run typecheck` (`tsc --noEmit`) — 0 errors.

## 12. Lint result

**PASS.** `npm run lint` (`eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0`) — 0 warnings, 0 errors.

## 13. Test result

**PASS.** `npm run test` (vitest) — **18 test files, 447 tests passed, 13 skipped (460 total).** Includes 3 new regression tests added this pass: `creditEngine`'s `recordPayment()` now verified to post real accounting, and `getPLSummary` now verified to correctly include payroll (account 6400) and other expense sub-accounts rather than only account 6000.

## 14. Build result

**PASS.** `npm run build` (Vite production build) — completed in ~13s, no errors.

## 15. End-to-end test results

**Method:** This sandboxed environment's network egress blocks direct HTTPS connections to `*.supabase.co` (confirmed via `curl`: `CONNECT tunnel failed, response 403`), so browser/auth-flow-based E2E testing as originally specified was not possible from here. The MCP Supabase connector's `execute_sql` tool does have live access, so the substitute methodology was: replicate each engine method's exact insert/update shape as hand-written SQL, execute it against the live database inside an atomic `DO $$ ... $$` block, then verify the resulting state via direct queries against the same views/tables the real reporting code reads. This exercises real schema, triggers, constraints, and computed views; it does not exercise RLS-as-authenticated-role (separately verified via the grants migrations) or the actual TypeScript code paths (separately covered by the 447 passing tests).

A disposable test business (`E2E-TEST-BUSINESS-DO-NOT-KEEP`, id `7430770b-5da5-43be-9f02-9a2726efba35`) was created and pushed through all 9 core workflows plus a Reports/Dashboard verification pass:

| Step | Result |
|---|---|
| Business + branches + owner + chart of accounts | 18 accounts seeded (this is what caught the COA bug) |
| Purchase → receive → inventory +10 | branch stock = 10, supplier outstanding = 10,000 |
| Cash sale (4 units) | stock = 6, revenue = 8,000, COGS = 4,000, cash = 8,000 |
| Expense (utilities, 1,500) | cash = 6,500 |
| Credit sale (2 units) | stock = 4, customer credit balance = 4,000 |
| Credit payment (1,500) | customer balance = 2,500, receivable = 2,500 (matches), cash = 8,000 (this is what caught the credit-payment accounting bug) |
| Stock adjustment (+3) | stock = 7 |
| Stock transfer (2 units, branch A → B) | branch A = 5, branch B = 2 |
| Supplier payment (4,000) | supplier outstanding = 6,000, payable balance = 6,000 (matches), cash = 4,000 (this is what caught the enum bug) |
| Payroll (net pay 2,750) | salaries expense = 2,750, cash = 1,250 |

**Books balance exactly:** total debits = total credits = 37,750 across all 7 journal entries.

**Cross-checked P&L:** Revenue 12,000 − COGS 6,000 = Gross Profit 6,000. Expenses (Utilities 1,500 + Salaries 2,750) = 4,250. Net Profit = 1,750.

**Reports/Dashboard verified:** the rewritten `getDashboardKPIs` logic was independently replicated in SQL against the same live data and produced: sale_count 2, revenue 12,000, cogs 6,000, payroll 2,750, expenses 1,500, cash_in_hand 1,250, credit_outstanding 2,500 — exact matches to every figure above, confirming the fixed reporting layer reads the real, correct numbers.

The test business is intentionally left in the database, clearly labeled `E2E-TEST-BUSINESS-DO-NOT-KEEP`, rather than attempting an ad-hoc cascading delete across ~15 tables that risked leaving orphaned rows. Recommend deleting it via a dedicated cleanup migration or the Supabase dashboard when convenient — its id is `7430770b-5da5-43be-9f02-9a2726efba35`.

## 16. Remaining blockers

- **Deferred bug #4 — credit write-off constraint mismatch:** `useCreditData.ts`'s `useWriteOffBalance` inserts `transaction_type: 'write_off'`, but the live `chk_s2_credit_txn_type` CHECK constraint only allows `'charge'`/`'payment'` (confirmed live). Any write-off attempt fails at the database. Not fixed this pass — needs either a migration to widen the constraint or a design decision on how write-offs should be represented.
- **Deferred bug #6 — Users/Permissions no-ops:** confirmed still present, not touched this pass (out of core-9 priority).
- **Deferred bug #7 — Bills local-first architecture:** confirmed still genuinely legacy/IndexedDB-backed, not touched this pass.
- **Reporting gap:** `getSalesByPeriod`, `getTopProducts`, `getOutstandingCredit`, `getExpenseBreakdown` still call nonexistent RPCs (§6) — documented, not fixed.
- **Storage/sync gaps:** `storageService.ts`'s upload/delete/access-log RPCs and `syncService.ts`'s `fn_process_sync_batch` RPC remain unimplemented server-side; both fail safely rather than faking success.
- **Security advisory:** the 3 `SECURITY DEFINER` reporting views and RLS-disabled `migration_log` table (§8) — not exploitable through the app's own service layer today, but recommended for a follow-up hardening pass.
- **Sandbox testing limitation:** true browser/auth-flow E2E testing could not be run from this environment (§15); the SQL-level substitute is a strong but not complete replacement — recommend a real signup-through-UI smoke test from a normal network environment before considering this fully proven.
