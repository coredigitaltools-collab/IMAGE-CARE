# ImageCare ERP — Phase 1: Live Supabase Verification Report

**Date:** 2026-08-24
**Method:** Read-only SQL introspection (`pg_proc`, `information_schema`, `pg_policies`, `pg_constraint`, `has_table_privilege()`, Supabase security advisors) run directly against the live project via the Supabase MCP connector, cross-checked against the tracked migration files in `database/migrations/` and the actual frontend source in `src/`.
**Project verified:** `dgqwcqimflidzwiqmlzq` ("coredigitaltools-collab's Project", org `rbdgfcsglrrtsnjqiyus`) — the only Supabase project on this account, confirmed as the ImageCare project.
**Nothing was modified.** No GRANT, no RLS policy, no function, no table, no data, no frontend code, no migration, no deploy. Read-only queries only.

---

## Read this first — the two findings that change everything

**1. Every table in the `imagecare` schema has zero grants to `authenticated` or `anon`. Not four tables — all 39.**

Direct query of `information_schema.role_table_grants` and `has_table_privilege()` checks both confirm: the only grantee on any `imagecare` table is `postgres` (the owner). `authenticated` and `anon` have schema-level `USAGE` on `imagecare` (so the schema itself is reachable) but **no SELECT/INSERT/UPDATE/DELETE on a single table**. This is not limited to Bills, Payroll, Cash Flow, and Branches — it is every table: `sales`, `products`, `customers`, `branches`, everything. Any frontend call that goes through `supabase.schema('imagecare').from(...)` directly (not through a SECURITY DEFINER RPC) fails with a Postgres permission error, project-wide. The reason Authentication/PIN and a handful of other flows still appear to work is that they go exclusively through `SECURITY DEFINER` functions, which execute as the function owner (`postgres`) and bypass the caller's own table grants entirely — they are the only thing currently unaffected by this gap.

**2. The frontend's entire transaction-posting layer calls RPCs that do not exist — confirmed from three independent directions, not an assumption.**

`src/services/business/businessEngine.ts` — the file whose own header comment says "This mirrors the DB-003 Business Engine on the server" — calls `rpc('engine_post_sale', ...)`, `rpc('engine_post_purchase', ...)`, `rpc('engine_post_expense', ...)`, `rpc('engine_process_credit_repayment', ...)`, and `rpc('engine_process_payroll', ...)`. `inventoryService.ts` and `purchasingService.ts` add `engine_stock_adjustment`, `engine_dispatch_transfer`, `engine_receive_transfer`, `engine_return_sale`, `engine_process_supplier_payment`, and `fn_imc_receive_purchase`. None of these 11 functions exist in the live database (confirmed by querying every function actually present in the `imagecare` schema — 20 total, listed in §A). None of them are defined in any of the 20 tracked migration files either (confirmed by grepping every `CREATE FUNCTION` in `database/migrations/*.sql`). And `MIGRATIONS.md`'s own description of what "the engine" is supposed to do (two journal-entry pairs per sale, COGS never touching cash) is implemented in a different, working file — `src/engines/accounting/accountingEngine.ts` — but that file is **only ever imported by test files**; it is not wired into the app that real users touch. The server-side "DB-003 Business Engine" the frontend comment says it mirrors was never built, on either side.

Net effect: right now, completing a sale, purchase, expense, credit repayment, supplier payment, payroll run, stock adjustment, or stock transfer through the app's real (non-legacy) service layer calls a function that doesn't exist and fails outright — independent of and in addition to the grants problem in Finding 1. A user attempting a sale today gets a `sales` row inserted (draft status) and then the posting call fails, leaving an orphaned draft row behind with no journal entry, no inventory movement, and no COGS.

Everything else in this report is detail underneath these two findings.

---

## A. LIVE RPC STATUS

Every function actually present in the `imagecare` schema, queried directly from `pg_proc` (20 total — this is the complete list, nothing omitted):

| FUNCTION NAME | EXISTS LIVE | ARGUMENTS | RETURN TYPE |
|---|---|---|---|
| fn_audit_trigger | YES | (trigger fn) | trigger |
| fn_business_engine_health_check | YES | p_business_id uuid | TABLE(check_name, status, detail) |
| fn_can_access_branch | YES | p_branch_id uuid | boolean |
| fn_check_account_hierarchy_integrity | YES | (trigger fn) | trigger |
| fn_check_cross_business_refs | YES | (trigger fn) | trigger |
| fn_check_journal_line_integrity | YES | (trigger fn) | trigger |
| fn_current_business_id | YES | — | uuid |
| fn_current_user_id | YES | — | uuid |
| fn_get_my_business_id | YES | — | uuid |
| fn_get_user_context | YES | p_business_id uuid | jsonb |
| fn_guard_posted_journal | YES | (trigger fn) | trigger |
| fn_has_pin | YES | — | boolean |
| fn_is_business_owner | YES | p_business_id uuid | boolean |
| fn_log_migration | YES | p_migration_id, p_description, ... | void |
| fn_register_business | YES | p_business_name, p_owner_first_name, p_owner_last_name | jsonb |
| fn_seed_chart_of_accounts | YES | p_business_id uuid | TABLE(account_code, account_name, action) |
| fn_set_pin | YES | p_pin, p_pin_confirm | jsonb |
| fn_set_updated_at | YES | (trigger fn) | trigger |
| fn_update_credit_balance | YES | (trigger fn) | trigger |
| fn_verify_pin | YES | p_pin | jsonb |

**Every `engine_*` function the frontend calls: EXISTS LIVE = NO.** `engine_post_sale`, `engine_post_purchase`, `engine_post_expense`, `engine_process_credit_repayment`, `engine_process_payroll`, `engine_process_supplier_payment`, `engine_stock_adjustment`, `engine_dispatch_transfer`, `engine_receive_transfer`, `engine_return_sale`, `fn_imc_receive_purchase` — none of these appear in the list above. This is a closed question now, not an open one: they are not "untracked but live," they simply do not exist.

## B. LIVE REPORTING FUNCTIONS

Of the reporting/list/dashboard RPCs called from the frontend (`reportingService.ts`, `financialServices.ts`, dashboard hooks, cursor-paginated list hooks), the only ones that exist live are the two general-purpose auth/context functions already covered in §A (`fn_get_my_business_id`, `fn_get_user_context`). Every dedicated reporting RPC the frontend calls is **missing**:

`fn_get_account_balance`, `fn_get_cash_position`, `fn_get_dashboard_kpis`, `fn_get_expense_breakdown`, `fn_get_outstanding_credit_summary`, `fn_get_sales_by_period`, `fn_get_top_products`, `dashboard_summary`, `fn_list_audit_logs_cursor`, `fn_list_expenses_cursor`, `fn_list_inventory_movements_cursor`, `fn_list_purchases_cursor`, `fn_list_sales_cursor`.

This means Reports, Cash Flow, Daily/Monthly/Annual Summary, and even the cursor-paginated list views for Sales/Purchases/Expenses/Inventory Movements/Audit Logs are calling functions that don't exist — this is broader than the earlier code-based audit's "Reports/Cash Flow: PARTIAL" assessment; those cursor-list RPCs back ordinary list pages, not just report tabs.

Also missing and worth flagging separately since they're infrastructure, not reporting: `fn_get_changes_since`, `fn_get_initial_sync_payload`, `fn_process_sync_batch` (Offline Mode sync), `fn_register_device`, `fn_register_upload`, `fn_soft_delete_file`, `fn_log_file_access` (device/storage management).

## C. TABLE GRANTS

Table privileges for `authenticated` on every core table, confirmed via `information_schema.role_table_grants` (unfiltered — every grantee on every `imagecare` table, no exceptions) and cross-checked with direct `has_table_privilege()` calls:

| TABLE | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| **All 39 tables in `imagecare`** (businesses, branches, products, inventory_movements, sales, sale_items, purchases, purchase_items, customers, credit_transactions, credit_accounts, invoices, invoice_items, bills, expenses, payroll, journal_entries, journal_lines, bank_accounts, loyalty_accounts, loyalty_transactions, sales_targets, users, permission_groups, group_permissions, user_permissions, and all others) | **NO** | **NO** | **NO** | **NO** |

`anon` has the same: zero table-level privileges on any `imagecare` table. Both `authenticated` and `anon` do have schema-level `USAGE` on `imagecare` (confirmed via `has_schema_privilege`), which is necessary but not sufficient — it makes the schema visible to PostgREST's routing but does not grant access to anything inside it.

No `anon` table access beyond that was found — `anon` is not over-privileged on business data; it is simply as under-privileged as `authenticated`.

## D. LIVE RLS POLICIES

RLS is **enabled** on every `imagecare` table except `migration_log` (confirmed disabled — matches the code-based audit's Gap #5) and is not **forced** (`relforcerowsecurity = false`) on any table, meaning the table owner (`postgres`) and any role with `BYPASSRLS` would skip RLS — standard Supabase default, not itself a problem given `postgres` is meant to have full access.

Every table has policies (full listing captured; representative pattern below — the policies themselves are well-formed and consistent):

- Most tables: `SELECT`/`ALL` policies scoped to `business_id = imagecare.fn_current_business_id()`, many additionally gated by `imagecare.fn_can_access_branch(branch_id)` for branch-scoped tables (bills, cash_transactions, expenses, inventory_movements, invoices, journal_entries, purchases, purchase_items, sale_items, sales).
- Owner-only tables (accounts, audit_logs, bank_accounts, payroll modify, sales_targets modify, group_permissions, permission_groups, user_permissions, user_branch_access): gated additionally by `imagecare.fn_is_business_owner(business_id)`.
- `journal_entries` UPDATE policy: `status = 'draft'` only — correctly prevents editing posted entries via direct table access.
- `notifications`: scoped to `business_id` **and** `user_id = imagecare.fn_current_user_id()` — correctly private per-user.
- `branches` INSERT/UPDATE: owner-only via `with_check`/`qual` on `fn_is_business_owner`.
- `businesses` UPDATE: owner-only. No `businesses` INSERT policy exists — consistent with registration being intentionally routed only through `fn_register_business` (SECURITY DEFINER, bypasses RLS).

**RLS itself is well-designed and matches the tracked migrations closely.** The problem is entirely upstream of RLS: with zero table grants, RLS is never even evaluated for any direct `.from()` call — the request is rejected at the grant-check stage before Postgres gets to RLS at all. Fixing RLS without fixing grants would change nothing.

No live/tracked-migration divergence was found in RLS policy definitions themselves.

## E. SECURITY DEFINER FUNCTIONS

All 18 non-trigger-adjacent functions with `SECURITY DEFINER` were checked for `search_path` hardening (`SET search_path = imagecare, pg_catalog` in `proconfig`):

**Hardened (7):** `fn_audit_trigger`, `fn_business_engine_health_check`, `fn_check_account_hierarchy_integrity`, `fn_check_cross_business_refs`, `fn_check_journal_line_integrity`, `fn_seed_chart_of_accounts`, `fn_update_credit_balance`.

**NOT hardened (13) — mutable search_path, confirmed by both direct `pg_proc.proconfig` inspection and the Supabase security advisor:** `fn_can_access_branch`, `fn_current_business_id`, `fn_current_user_id`, `fn_get_my_business_id`, `fn_get_user_context`, `fn_guard_posted_journal`, `fn_has_pin`, `fn_is_business_owner`, `fn_log_migration`, `fn_register_business`, `fn_set_pin`, `fn_set_updated_at`, `fn_verify_pin`.

This is worse than the code-based audit estimated — it isn't just the 5 Stage-1 primitives and 3 PIN functions (8), it's 13, including `fn_set_updated_at` and `fn_guard_posted_journal` (generic trigger utilities).

Additionally, the security advisor flags all 18 SECURITY DEFINER functions in `imagecare` as **executable by both `anon` and `authenticated`** — including `fn_set_pin`, `fn_verify_pin`, `fn_register_business`, and `fn_get_user_context`. Whether unauthenticated (`anon`) execution of these is actually exploitable depends on what each function does when `auth.uid()` is null (most likely they no-op or error safely, since they read the authenticated user's own ID internally) — but granting `EXECUTE` to `anon` at all on account-sensitive functions is broader than necessary and worth tightening to `authenticated`-only where a function has no legitimate pre-login caller.

## F. LIVE SCHEMA DRIFT

**Correction to the concern raised in the Step 1 audit and cleanup roadmap:** the tracked migration files (`database/migrations/0001` through `0020`) were re-checked directly against this live introspection, and **they match the live schema table-for-table** — `sale_items`, `purchase_items`, `credit_accounts`, `journal_lines`, `permission_groups`, `group_permissions`, `user_permissions`, `user_branch_access`, `accounts`, and all 38 other tables in the live schema are exactly what the tracked migrations create; there is no naming drift between the tracked SQL files and the live database. The earlier audit's references to table names like `purchase_orders`, `sale_lines`, `invoice_lines`, `inventory_levels`, or standalone `roles`/`permissions` tables do not correspond to anything in the tracked migrations or the live database — that was an error in how the prior audit pass was summarized, not a real discrepancy. Treat this report's table names (matching both live and tracked-migration reality) as authoritative going forward.

Where real drift does exist:

1. **The live `imagecare.migration_log` audit table stops at `IMC-STAGE-3-0019`** ("Engine support: fn_seed_chart_of_accounts, fn_business_engine_health_check, vw_engine_account_summary", applied 2026-08-14 13:19:53 UTC) and has no entry for the Stage-7 PIN/auth work — even though `fn_register_business`, `fn_set_pin`, `fn_verify_pin`, and `fn_has_pin` all exist live and are working (this session ran that migration earlier and confirmed registration succeeded). The migration was applied but never logged. Supabase's own CLI-level migration tracking (`list_migrations`) returned zero entries entirely — confirming, consistent with `stage-6-qa-report.md`'s documented history, that none of this was ever applied via `supabase db push`; everything has been pasted into the SQL editor by hand, and the app's own internal audit log (`migration_log`) is itself incomplete and can't be fully trusted as a record of what's been run.

2. **This Supabase project is not dedicated to ImageCare.** The `public` schema (separate from `imagecare`) contains a substantial, apparently active and unrelated application — table/function names include `traxxo_credits`, `traxxo_customers`, `traxxo_expenses`, `traxxo_inventory`, `traxxo_sales`, `traxxo_recycle_bin`, plus what looks like a device-activation/subscription licensing system (`activation_codes`, `devices`, `pairing_codes`, `subscriptions`, `payment_config`, `invite_codes`, `admin_bootstrap_status`, and about 90 more objects) with its own, differently-modeled `businesses`, `users`, `sales`, `expenses`, `inventory`, `roles`, `staff`, `clients`, `credits` tables in `public`. This is a second, unrelated product sharing the same Supabase project as ImageCare.

   This matters concretely, not just as trivia: `src/services/dashboardService.ts` has two calls that omit `.schema('imagecare')` — `supabase.from('inventory_items')` (line 117) and `supabase.from('sales')` (line 138) — which by default target the `public` schema. `public.inventory_items` doesn't exist (fails cleanly), but **`public.sales` does exist** — it belongs to the unrelated app. If that dashboard code path is ever reached with working grants on the public schema (untested — not verified either way in this pass), it would silently return the wrong application's sales data instead of erroring, which is a much worse failure mode than the clean 404s everywhere else. This needs to be fixed regardless of what the grant investigation on `public` finds, simply by adding `.schema('imagecare')` to those two calls.

3. **Duplicate "business engine" implementations, only one of which is wired to real users.** `src/services/business/businessEngine.ts` (imported by `useServerState.ts`, and in turn by `salesService.ts`/`purchasingService.ts`/`inventoryService.ts` — this is the live path) calls the missing `engine_*` RPCs and does not touch `journal_entries`/`journal_lines`/COGS at all. `src/engines/accounting/accountingEngine.ts` (plus `src/engines/business/businessEngine.ts` and `src/engines/purchasing/purchasingEngine.ts`) correctly implements the two-journal-pair, COGS-never-touches-cash logic described in `MIGRATIONS.md` — but is imported only by test files, never by any page or hook. The working double-entry logic exists in the codebase; it's just disconnected from the app real users touch.

4. Six `public`-schema tables (all in the unrelated app: `activation_codes`, `activity_log`, `devices`, `pairing_codes`, `staff`, `sync_snapshots`) have RLS enabled with zero policies defined — meaning they're fully locked (nothing can read/write them, including their own app, unless accessed via SECURITY DEFINER functions). Not an ImageCare concern directly, but worth a heads-up since it shares billing/quota with this project.

5. `pg_trgm` extension is installed in `public` rather than a dedicated extensions schema — minor hygiene item, Supabase's own linter default recommendation, unrelated to imagecare specifically.

6. Global project auth setting: leaked-password protection (HaveIBeenPwned check) is not enabled — a one-toggle project setting in Supabase Auth settings, unrelated to any code change.

## G. 403 ROOT CAUSE

Based strictly on the live evidence above: the previously-reported 403s on Bills, Payroll, Cash Flow, and Branches are caused by **A — missing table GRANT**, confirmed directly (zero grants on all four tables, and on every other table too). RLS policies on all four tables are correctly defined (ruling out B), the schema is correctly exposed and named consistently between live and tracked migrations (ruling out C), and the frontend queries target the right table names in the right schema for these four specifically (ruling out D — though see the two `dashboardService.ts` exceptions in §F.2). No missing database function is implicated in the 403s specifically (ruling out E for this particular symptom — the missing-RPC problem is real but produces a different error, PGRST202/"function not found," not a 403).

The real puzzle this resolves is why only *four* modules were ever reported as 403 when the grant gap is universal: it's very likely that most other direct-table reads (Products, Customers, Branches-as-read, etc.) are either (a) failing the same way but silently, with the UI falling back to an empty/cached state rather than surfacing a visible error, or (b) not actually being exercised live in the way the user tested. This can't be fully resolved without the user reproducing a few specific actions and reporting the exact error — see Required Next Actions.

## H. TRANSACTION ENGINE STATUS

| OPERATION | RPC EXISTS | RPC NAME | FRONTEND CALLS IT | CONFIRMED LIVE |
|---|---|---|---|---|
| PURCHASE (post) | NO | `engine_post_purchase` | YES (`businessEngine.ts`) | Confirmed missing |
| RECEIVE | NO | `fn_imc_receive_purchase` | YES (`purchasingService.ts`) | Confirmed missing |
| SALE (post) | NO | `engine_post_sale` | YES (`businessEngine.ts`) | Confirmed missing |
| SALE (return) | NO | `engine_return_sale` | YES | Confirmed missing |
| EXPENSE (post) | NO | `engine_post_expense` | YES (`businessEngine.ts`) | Confirmed missing |
| CREDIT PAYMENT | NO | `engine_process_credit_repayment` | YES (`businessEngine.ts`) | Confirmed missing |
| SUPPLIER PAYMENT | NO | `engine_process_supplier_payment` | YES | Confirmed missing |
| PAYROLL | NO | `engine_process_payroll` | YES (`businessEngine.ts`) | Confirmed missing |
| STOCK ADJUSTMENT | NO | `engine_stock_adjustment` | YES (`inventoryService.ts`) | Confirmed missing |
| STOCK TRANSFER (dispatch) | NO | `engine_dispatch_transfer` | YES (`inventoryService.ts`) | Confirmed missing |
| STOCK TRANSFER (receive) | NO | `engine_receive_transfer` | YES (`inventoryService.ts`) | Confirmed missing |

**Every single core business operation's posting RPC is confirmed missing, live.** None of these are "assumed missing because absent from migrations" — each was checked directly against the live `pg_proc` catalog and is absent. Right now, with a working Supabase connection and even with grants fixed, attempting any of these 11 operations through the real (non-legacy) service layer fails immediately with a PostgREST "could not find function" error.

## I. UNTRACKED GRANT SCRIPT STATUS

`grant_restored_module_permissions.sql` and `diagnostic_grants_check.sql` both exist in the repository root (confirmed by file listing). Their intended effect — granting table-level privileges to `authenticated` — is fully consistent with, and would directly address, the total absence of table grants confirmed in §C. Whether they've ever been run cannot be determined from their presence in the repo alone, but the live grant query in §C is unambiguous either way: **whatever their intended effect, it has not taken hold on the live database.** Zero grants exist right now, full stop, regardless of whether these scripts were run and then somehow reverted, or never run at all.

## J. EXACT BLOCKERS BEFORE IMPLEMENTATION

1. No table-level GRANTs exist on any `imagecare` table for `authenticated` (or `anon`) — blocks every direct-table read/write in the entire app.
2. 11 core-transaction RPCs (`engine_*` and `fn_imc_receive_purchase`) do not exist live or in tracked migrations — blocks every sale, purchase, receipt, expense, credit repayment, supplier payment, payroll run, stock adjustment, and stock transfer attempted through the real service layer.
3. 13 additional RPCs backing reporting, list views, sync, and file/device management also don't exist live — blocks Reports, Cash Flow, Dashboard KPIs, and even ordinary cursor-paginated list pages for Sales/Purchases/Expenses/Inventory Movements/Audit Logs.
4. The working double-entry accounting logic (`src/engines/accounting/accountingEngine.ts`) is not wired into the live app — even once grants and RPCs are fixed, journal posting needs a decision: build the missing `engine_*` functions as real database RPCs (matching the frontend's `businessEngine.ts` expectations and `MIGRATIONS.md`'s documented design), or rewire the frontend to call the already-working `accountingEngine.ts`/`engines/business/businessEngine.ts` path instead of the currently-dead-end `services/business/businessEngine.ts` path. This is a real architectural decision, not a one-line fix, and belongs in Phase 3/4 of the roadmap, not Phase 2.
5. Two `dashboardService.ts` calls omit `.schema('imagecare')` and are one path away from silently reading the unrelated app's `public.sales` table instead of erroring — low effort, should be fixed early regardless of grant/RPC decisions.
6. Several frontend calls target tables that don't exist in either schema at all: `expense_categories`, `customer_notes`, `stock_transfers`, `stock_transfer_items`, `file_metadata` (live table is `storage_metadata`), `sync_batches` (live table is `sync_queue`) — these features are currently calling nonexistent tables regardless of grants.

---

### VERIFIED FACTS

- Zero table-level GRANTs exist to `authenticated` or `anon` on any of the 39 tables in the `imagecare` schema. Schema-level `USAGE` is granted to both roles; table-level access is not.
- 20 functions exist live in `imagecare`; the complete list is in §A. No `engine_*` function of any name exists live.
- The 20 live functions match exactly the 20 functions defined across the 20 tracked migration files — no drift between tracked migrations and live functions.
- The 38 live tables match exactly the tables created across the 20 tracked migration files — no drift between tracked migrations and live schema (this corrects an assumption from the earlier Step 1 audit).
- 13 of 20 SECURITY DEFINER functions in `imagecare` have a mutable (unhardened) `search_path`; the other 7 are hardened.
- All 18 SECURITY DEFINER functions in `imagecare` are EXECUTE-granted to both `anon` and `authenticated`.
- RLS is enabled on every `imagecare` table except `migration_log`, and every RLS-enabled table has at least one policy; policy logic is internally consistent and matches tracked migrations.
- The frontend calls 35 distinct RPC names across its real service layer; only 6 (`fn_get_my_business_id`, `fn_get_user_context`, `fn_has_pin`, `fn_register_business`, `fn_set_pin`, `fn_verify_pin` — all Authentication/PIN) exist live. The other 29 do not.
- `src/services/business/businessEngine.ts` is the live-wired transaction path (via `salesService.ts`/`purchasingService.ts`/`inventoryService.ts`) and calls the missing `engine_*` RPCs; it performs no journal-entry or COGS logic itself.
- `src/engines/accounting/accountingEngine.ts` correctly implements double-entry journal posting with COGS/cash separation as described in `MIGRATIONS.md`, but is imported only by test files — not wired into any page, hook, or live-path service.
- `imagecare.migration_log` (the app's own internal audit table) records 19 applied migrations, the last being Stage 3 (`IMC-STAGE-3-0019`, applied 2026-08-14). It has no entry for the Stage-7 PIN work even though that work is confirmed present live — the log is incomplete.
- Supabase's own CLI migration history (`list_migrations`) is empty — nothing here has ever been applied via `supabase db push`; all applied SQL has gone through the SQL editor by hand.
- The Supabase project also hosts a second, unrelated application in the `public` schema (apparent name "Traxxo," plus a device/subscription licensing system) with its own similarly-named tables (`businesses`, `users`, `sales`, `expenses`, `inventory`, `roles`).
- `src/services/dashboardService.ts` has two `.from()` calls that omit the `.schema('imagecare')` qualifier; one of them (`'sales'`) targets a table that exists in the unrelated app's `public` schema.
- Six frontend-referenced table names (`expense_categories`, `customer_notes`, `stock_transfers`, `stock_transfer_items`, `file_metadata`, `sync_batches`) do not exist as such in either schema live.
- `grant_restored_module_permissions.sql` and `diagnostic_grants_check.sql` exist in the repo root; regardless of their history, their intended grants are not present on the live database right now.

### UNKNOWN

- Whether `public` schema tables/functions (the unrelated app) have working grants for `authenticated`/`anon` — not checked, out of scope for an ImageCare audit, but relevant only to the extent it affects how "silently" the `dashboardService.ts` schema-omission bug would fail (error vs. wrong data).
- Whether the 403 errors reported earlier for Bills/Payroll/Cash Flow/Branches are reproducible today with the *exact* same symptom on every other table too, or whether some modules fail more silently (empty state, swallowed error) — needs the user to reproduce a couple of actions live and report the console/network error.
- Whether `grant_restored_module_permissions.sql` / `diagnostic_grants_check.sql` were ever actually executed and then something reverted them, or never executed at all — the end state (no grants) is confirmed either way, but the history isn't.
- Whether reaching `dashboardService.ts`'s schema-omitting calls in practice returns an error or actual cross-app data — not exercised in this read-only pass.
- Full behavior of `fn_business_engine_health_check` if run for a real business (it exists and looks like it could serve as a useful live self-test) — not invoked, since this pass stayed strictly read-only per instruction and running it wasn't necessary to answer the ten questions asked.

### REQUIRED NEXT ACTIONS

Strictly from the verified facts above, before any Step 3/Phase 3 module work should start:

1. Write and apply one tracked migration that grants `SELECT, INSERT, UPDATE, DELETE` on every `imagecare` table (and `USAGE`/`SELECT` as appropriate on sequences) to `authenticated`, matching what RLS already correctly restricts row-by-row. This alone should resolve the reported 403s and unblock every direct-table read across the app.
2. Decide — as an explicit architectural decision, not a silent default — whether to (a) build the 11 missing `engine_*`/`fn_imc_receive_purchase` functions as real database RPCs, wiring in the already-correct COGS/journal logic from `src/engines/accounting/accountingEngine.ts`, or (b) rewire `src/services/business/businessEngine.ts` (and its callers) to use the already-working `src/engines/` implementation directly instead of calling nonexistent RPCs. Either is viable; leaving it as-is is not, since it silently fails every core transaction today.
3. Decide the same for the 13 missing reporting/list/sync/file RPCs — likely lower priority than #2, but Reports, Dashboard KPIs, and ordinary paginated lists all depend on them.
4. Add `.schema('imagecare')` to the two calls in `dashboardService.ts` regardless of the above — cheap, isolates ImageCare from the unrelated app sharing this project.
5. Resolve the six frontend calls to nonexistent tables (`expense_categories`, `customer_notes`, `stock_transfers`, `stock_transfer_items`, `file_metadata`→`storage_metadata`, `sync_batches`→`sync_queue`) — either create the missing tables if the features are meant to be real, or confirm they're intentionally unimplemented and label them as such in the UI per the "no fake success" rule.
6. Apply `SET search_path = imagecare, pg_catalog` to the 13 unhardened SECURITY DEFINER functions, and review whether `anon` genuinely needs EXECUTE on all 18 SECURITY DEFINER functions or whether that can be narrowed to `authenticated` only.

This is the full Phase 1 deliverable. Per the instruction, nothing above has been implemented — code, migrations, RLS, grants, and the frontend are all untouched. Awaiting direction on which of the Required Next Actions to act on and in what order.
