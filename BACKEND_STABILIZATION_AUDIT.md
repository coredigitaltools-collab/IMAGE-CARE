# ImageCare ERP — Backend Stabilization Audit (Step 1)

**Date:** 2026-08-24
**Scope:** Read-only audit. No files were modified, no migrations were run, no code was changed to produce this report.
**Branch inspected:** `Stage-5`
**Method:** 6 parallel read-only research passes — one full migration/RLS/RPC inventory across all 20 tracked migration files, plus 5 module-group traces of every page → hook → service → Supabase call in the current source tree.

---

## 0. Read this first — the two findings that block almost everything else

**1. Several RPCs the frontend calls do not exist in any tracked migration.**
The transactional "engine" functions the working code calls for sale posting, purchase posting, expense posting, credit repayment, supplier payment, payroll processing, and stock adjustment/transfer (the `engine_*` functions), plus several `fn_get_*` reporting functions, are referenced correctly from TypeScript but are **not defined by a `CREATE FUNCTION` in any of the 20 files in `database/migrations/`**. `database/MIGRATIONS.md` describes an "engine" that posts two-sided journal entries for sales, in the present tense, as if it exists — but no migration creates it.

This means one of two things, and it cannot be resolved from inside this sandbox because there is no live database access here:
- these functions exist only as **live, undocumented objects created directly in the Supabase SQL Editor** (consistent with `stage-6-qa-report.md`'s documented history of ad-hoc, untracked changes to the live project, including an "Exposed schemas" setting change made outside version control), or
- every one of these calls **fails at runtime** right now.

This has to be checked against the actual Supabase project directly (Database → Functions, or `SELECT proname FROM pg_proc WHERE pronamespace = 'imagecare'::regnamespace`) before Step 3 work starts, because it determines whether "REAL" modules below are really working or only compiling.

**2. No migration grants table-level privileges to `authenticated`/`anon`.**
Across all 20 migrations, the only `GRANT` statements found are `GRANT EXECUTE ON FUNCTION ...` (all in `0020_stage7_pin_auth.sql`). There is no `GRANT SELECT/INSERT/UPDATE/DELETE ... TO authenticated` anywhere. RLS policies alone don't matter if the underlying role has no grant on the table — Postgres checks table-level privileges before RLS is ever evaluated. This is very likely the root cause of the **403 Forbidden errors on Bills, Payroll, Cash Flow, and Branches** that `module-restoration-final-report.md` §8 already flagged as unresolved. `grant_restored_module_permissions.sql` and `diagnostic_grants_check.sql` sitting untracked in the project root (sent to the user twice before with no reported result) are almost certainly the fix for this — they just haven't been confirmed run against the live project.

Both of these should be checked against the live Supabase project as the very first action of Step 2, before any other backend work, because they will otherwise silently undermine fixes made to individual modules.

---

## 1. Module-by-module backend map

Legend — **STATUS**: REAL (real Supabase read + write, no mock fallback on the tested path) · PARTIAL (real for some operations, mock/local/broken for others) · MOCK (no real persistence on the core path).

| MODULE | DATABASE TABLES | SERVICES | HOOKS | RLS | TRANSACTIONS | LOCAL STORAGE | STATUS | BLOCKERS |
|---|---|---|---|---|---|---|---|---|
| **Inventory** | `inventory_levels`, `inventory_movements`, `products` | `src/services/inventory/inventoryService.ts` (real) vs `src/services/stockService.ts` (legacy/local) both present | `src/features/inventory/hooks/useInventoryData.ts` | Present, business/branch-scoped | Movements insert real rows | `localStore`/IndexedDB used by the legacy `stockService.ts` path, still reachable from some pages | **PARTIAL** | `useStockAdjustments()` calls `useInventoryMovements({ productId: undefined })`; that hook's query is `enabled: Boolean(productId)`, so it is permanently disabled — the Stock Adjustments page never fetches real data no matter what's in the DB. |
| **Products** | `products` | `src/services/masterData/masterDataService.ts` | Product hooks in `useModuleHooks.ts` / feature hooks | Present | Real inserts/updates | None on the real path | **PARTIAL** | Shares the branch-insert bug below when a product creation flow touches branch defaults; otherwise largely real. |
| **Purchasing** | `purchase_orders`, `purchase_order_lines` | `src/services/purchasing/purchasingService.ts` (real RPC path) vs `src/services/purchasingService.ts` (flat/legacy) | Purchasing feature hooks | Present | PO creation real; **Approve/Receive broken** | Legacy flat service uses `localStore` | **PARTIAL → effectively MOCK for Approve/Receive** | `canDo(ctx, 'purchasing', ...)` is called with the string `'purchasing'`, but `src/config/env.ts` defines the module key as `MODULES.PURCHASES = 'purchases'`. This key mismatch (confirmed at `purchasingService.ts:163` and `:193`) means the permission check can never pass, permanently blocking Approve, Receive, and dashboard KPIs for every user regardless of role. |
| **Receiving** | `purchase_order_lines`, `inventory_movements` | Depends on the same purchasing service | Purchasing/receiving hooks | Present | Should increment inventory on receipt | — | **MOCK** (downstream of the Purchasing key-mismatch bug — receive action is unreachable in practice) | Same root cause as Purchasing above; also depends on the unconfirmed `engine_*` receipt-posting RPC (see §0.1). |
| **Sales** | `sales`, `sale_lines`, `inventory_movements`, `journal_entries` | `src/services/sales/salesService.ts` (real, RPC-backed) vs `src/services/salesService.ts` (legacy) | Sales feature hooks | Present | Sale posting depends on `engine_*` RPC not found in tracked migrations | Legacy path uses `localStore` | **PARTIAL** | Depends on §0.1 — cannot confirm sale posting, COGS, and inventory-decrement actually happen server-side until the live RPCs are confirmed to exist. |
| **Customers** | `customers` | `src/services/masterData/masterDataService.ts` / `src/services/customerService.ts` (legacy, still referenced in places) | Customer hooks | Present | Mostly real CRUD | Legacy service uses `localStore` | **PARTIAL, mostly REAL** | Legacy flat `customerService.ts` is still imported in some places alongside the real path — duplicate source of truth risk. |
| **Credit** | `credit_transactions`, `customers` | `src/services/credit/creditService.ts` | `src/features/credit/hooks/useCreditData.ts` | Present | **Payment math bug; write-off constraint violation** | — | **PARTIAL** | `recordInvoicePayment` (`creditService.ts:139-148`) computes `amount_paid: (invoice.balance_due) + input.amount - invoice.balance_due`, which algebraically reduces to just `input.amount` — every payment **overwrites** `amount_paid` instead of accumulating it, and `status` is never flipped to `'paid'` on full payment. Separately, `useWriteOffBalance` (`useCreditData.ts` ~line 110-126) inserts `transaction_type: 'write_off'`, but the `credit_transactions` CHECK constraint (`0008_stage2_credit_invoices_bills.sql:98-100`) only allows `('charge','payment')` — every write-off attempt fails at the database. |
| **Invoices** | `invoices`, `invoice_lines` | Mixed real/legacy | Invoice hooks | Present | "Mark paid" surface is weak | Legacy `invoiceService.ts` uses `localStore` | **PARTIAL, leaning MOCK** | Invoice "Mark paid" does not reliably reconcile against `credit_transactions`/`sales`; see Payments row below for the three distinct payment surfaces. |
| **Payments — Credit repayments** | `credit_transactions` | `src/services/credit/creditService.ts` | `useCreditData.ts` | Present | Real insert, but see the payment-math bug above | — | **REAL** (call reaches Supabase) but **carries the accumulation bug above** | Same as Credit row. |
| **Payments — Invoice "Mark paid"** | `invoices` | Mixed | Invoice hooks | Present | Weak/partial | — | **PARTIAL/MOCK** | Does not consistently write a corresponding ledger-side transaction. |
| **Payments — Bills/Payables payment** | `bills` | `src/services/billsService.ts` (legacy, local-first) | Bills hooks | Present on table, but see §0.2 GRANT gap | Effectively client-only | `localStore`/IndexedDB primary path | **PARTIAL → effectively MOCK** | Bills module is on the legacy local-first pattern; also directly exposed to the 403/GRANT gap in §0.2. |
| **Expenses** | `expenses` | `src/services/financial/financialServices.ts` | Expense hooks | Present | Core create/list real | Settings/recurring-expense UI still mock | **REAL (core) / MOCK (settings, recurring)** | Recurring-expense scheduling has no backend table/job behind it. |
| **Bills** | `bills` | `src/services/billsService.ts` (legacy) | Bills hooks | Present, but see §0.2 | Local-first | `localStore` primary | **PARTIAL → effectively MOCK** | Same 403/GRANT root cause as flagged in `module-restoration-final-report.md` §8. |
| **Payroll** | `payroll` (real table exists) | `src/services/payrollService.ts` (legacy/local) + real RPCs for approve/pay | `src/features/payroll/hooks/usePayrollData.ts` | Present | **Structural break** | Period creation writes only to IndexedDB | **PARTIAL, functionally closer to MOCK** | No code path inserts a new row into the real `imagecare.payroll` table — period creation is local-only, while the periods list reads only from the real table. A newly created period never appears in the list, orphaning the otherwise-real, RPC-backed Approve/Pay actions (they have nothing to act on). |
| **Branches** | `branches` | `src/services/masterData/masterDataService.ts` | Branch hooks | Present | **Real insert will fail at runtime** | — | **PARTIAL** | `masterDataService.ts:503` inserts `is_main: false`, but the actual `branches` table column (per `0001_stage1_foundation.sql:108`) is `is_main_branch`. Every branch creation through the real path throws a Postgres column-not-found error. |
| **Users / Permissions** | `users`, `roles`, `permissions`, `user_permissions` (tables exist) | None wired for mutation | `src/features/settings/hooks/useSettingsData.ts`, page `src/pages/settings/PeopleAccessPage.tsx` | Present on tables, unused by the app | None | Client-side objects only | **MOCK** | Nearly every staff/role/permission mutation is a client-side no-op or fabricated object. The starkest example: `useSetPermission: async (input: any) => input` — an identity function that returns whatever was passed in, persists nothing, and reports success. |
| **Reports** | Various (`sales`, `inventory_movements`, `credit_transactions`, etc.) | `src/services/reporting/reportingService.ts` | Report hooks | Present | Reads depend on `fn_get_*` RPCs, some unconfirmed (§0.1) | — | **PARTIAL** | Credit tab confirmed broken (depends on the Credit payment-math bug above cascading into totals); other tabs depend on unconfirmed reporting RPCs. |
| **Cash Flow** | `journal_entries`, bank/expense tables | `src/services/financial/financialServices.ts` | Cash flow hooks | Present, but `journal_entries` INSERT policy is weaker than its own comment claims (§2, Gap 2) | Partially real | — | **PARTIAL** | Depends on §0.1 (engine posting) and the `journal_entries` policy gap. |
| **Accounting** | `journal_entries`, `bank_accounts` | `src/services/accountingService.ts` (legacy) | Accounting hooks | Present, `bank_accounts.current_balance` unmaintained (§2, Gap 4) | Partial | `localStore` in places | **PARTIAL** | Balance fields drift from the transaction ledger since nothing recomputes them server-side. |
| **Authentication & Daily PIN** | `users`, PIN columns on `users` (`pin_hash`, `pin_set_at`, `pin_failed_attempts`, `pin_locked_until`) | `src/services/auth/authService.ts` | `AppContext.tsx` + auth pages | Present, `fn_*` SECURITY DEFINER functions, but see §2 Gap 8 (search_path hardening not applied to Stage-7 functions) | Real, RPC-backed (`fn_register_business`, `fn_set_pin`, `fn_verify_pin`, `fn_has_pin`) | None | **REAL** | No mocks found anywhere in this subsystem — confirmed clean by this audit. Only gap is the unhardened `search_path` noted in §2. |
| **Loyalty** | `loyalty_accounts`, `loyalty_transactions` | `src/services/loyalty/loyaltyService.ts` (real) vs `src/services/loyaltyService.ts` (legacy) | Loyalty hooks | Present, but `points_balance` is unenforced and has no owner-only gate (§2, Gap 3) | Partial | Legacy path uses `localStore` | **PARTIAL** | Points balance can be manipulated without a matching transaction row; no server-side recompute/enforcement. |
| **Sales Targets** | `sales_targets` (table already exists) | `src/services/salesTargetsService.ts` (legacy) | Sales target hooks | Present | None real | `localStore` primary | **MOCK** | Cheapest fix in the whole audit — the table already exists and is unused; wiring a real service is comparatively low effort. |
| **Stock Summary** | `inventory_levels`, `inventory_movements` | `src/services/stockSummaryService.ts` (legacy) | Stock summary hooks | Present | Partial | `localStore` | **PARTIAL** | Aggregation largely computed client-side from partially-real data. |
| **Daily Summary** | `sales`, `expenses`, `journal_entries` | Real reporting path | Summary hooks | Present | Real reads | — | **REAL** | Confirmed real by this audit — no mock fallback found. |
| **Monthly Summary** | Same as Daily Summary | Real reporting path | Summary hooks | Present | Real reads | — | **REAL** | Confirmed real by this audit. |
| **Annual Summary** | Same as above | Real reporting path, partial | Summary hooks | Present | Partial | — | **PARTIAL** | Some rollups depend on unconfirmed `fn_get_*` RPCs (§0.1). |
| **Bank Reconciliation** | `bank_accounts`, `bank_transactions` (if present) | `src/services/bankReconciliationService.ts` (legacy) | Bank recon hooks | Present | Minimal | `localStore` primary | **PARTIAL, near-MOCK** | Mostly local-first; real balance columns unmaintained (ties to §2 Gap 4). |
| **Branch Overview** | `branches`, `inventory_levels` | Real | Branch overview hooks | Present | Real reads | — | **REAL** | Confirmed real by this audit. |
| **Offline Mode** | `sync_queue`/local queue tables | `src/services/sync/syncService.ts` + `src/services/offlineModeService.ts` (legacy) | Offline mode hooks | N/A (client-side by design) | Sync-on-reconnect logic present but thin | IndexedDB is the intended design here, not a bug | **PARTIAL, near-MOCK** | Sync-back-to-server path is thin; needs verification that queued mutations actually replay against real services rather than only against `localStore`. |

---

## 2. Migration / RLS / RPC inventory — numbered gaps

Full table-by-table RLS and function/RPC inventory was produced by tracing all 20 files in `database/migrations/` (`0001_stage1_foundation.sql` through `0020_stage7_pin_auth.sql`). Nine gaps were identified:

1. **Missing `engine_*` transactional RPCs and several `fn_get_*` reporting RPCs in tracked migrations** — see §0.1. Highest priority; blocks confident assessment of every "REAL" transaction-posting module above.
2. **`journal_entries` INSERT policy is not actually restricted to the service role**, despite a comment in the migration implying it should be — any authenticated business member can currently insert journal entries directly, bypassing the intended engine-only posting path.
3. **`loyalty_accounts.points_balance` is unenforced** — no CHECK/trigger ties it to the sum of `loyalty_transactions`, and there is no owner-only write gate, so it can be set arbitrarily by any writer with table access.
4. **`bank_accounts.current_balance` is unmaintained** — nothing recomputes it from transactions; it will drift from reality over time.
5. **`migration_log` has no RLS** — minor, but it's an ungated table in a schema where every other table is business/branch-scoped.
6. **Confirmed-by-absence: no table-level GRANTs to `authenticated`/`anon` in any tracked migration** — see §0.2. Likely root cause of the known Bills/Payroll/Cash Flow/Branches 403s.
7. **`search_path` hardening inconsistently applied.** `0018_stage2_delete_action_and_searchpath_corrections.sql` sets `SET search_path = imagecare, pg_catalog` on 5 specific Stage-2 trigger functions, but this was never applied to the original 5 Stage-1 authorization primitives (`fn_current_user_id`, `fn_current_business_id`, `fn_is_business_owner`, `fn_can_access_branch`, `fn_get_user_context`) or to the 3 new Stage-7 PIN/registration functions from `0020` (`fn_register_business`, `fn_set_pin`, `fn_verify_pin`). This is a real, unaddressed hardening gap on both the oldest and the newest SECURITY DEFINER functions in the schema.
8. **`notifications` table has no INSERT policy** — if anything is meant to write notifications from the client side, it currently can't; if it's meant to be service-role/RPC-only, that should be made explicit rather than implicit.
9. **No `businesses` INSERT policy prior to `0020`** other than through the one blessed function (`fn_register_business`) — correct in intent (registration should be the only way to create a business), but worth confirming this is deliberate and not an oversight, since no comment documents it as intentional.

---

## 3. Cross-cutting patterns found across the codebase

Three distinct data-access patterns coexist in the same app, sometimes for the same domain:

- **Real pattern (intended target architecture):** `src/services/<domain>/*Service.ts` — calls `supabase.schema('imagecare').from(...)` or RPCs, returns `ServiceResponse<T>`, gated by `canDo()`/`usePermission` against `UserContext`.
- **Legacy/local pattern:** flat files directly under `src/services/*.ts` (not in a subfolder) — read/write through `src/lib/localStore.ts`, backed by an AES-256-GCM-encrypted IndexedDB cache (`src/lib/offlineDb.ts`). Several domains have **both** a real nested service and a same-named-but-different flat legacy service (e.g. `services/purchasing/purchasingService.ts` vs `services/purchasingService.ts`, `services/loyalty/loyaltyService.ts` vs `services/loyaltyService.ts`) — a real duplicate-source-of-truth risk, not just a naming quirk.
- **Outright placeholder mutations:** a small number of hooks have no service call at all — `mutationFn: async (input) => input` (identity no-op), hardcoded `[]`/`{}` returns, or `crypto.randomUUID()`-fabricated fake objects. Users/Permissions is the worst offender.

A secondary, repeated dead-code pattern: pages in Sales, Credit, Branches, and People & Access import Error subclasses (`NegativeStockError`, `CreditLimitExceededError`, `DuplicateBranchCodeError`, `PaymentExceedsBalanceError`) from the **legacy local service files** purely for `instanceof` checks in `catch` blocks — but the real, wired RPC path never actually throws those specific classes, so the specific error handling UI is currently unreachable and all real errors fall through to a generic message.

The project's own `docs/MODULE_INTEGRATION_MAP.md` already self-documents many of these gaps in place, with the recurring comment pattern `// LOCAL-ONLY: no real backend service yet for this operation (see docs/MODULE_INTEGRATION_MAP.md gap)` — this audit's findings are consistent with, and extend, that existing internal tracking document.

---

## 4. Status summary (quick reference)

| Status | Modules |
|---|---|
| **REAL** | Authentication & Daily PIN, Daily Summary, Monthly Summary, Branch Overview |
| **PARTIAL** | Inventory, Products, Purchasing, Sales, Customers, Credit, Invoices, Expenses, Branches, Reports, Cash Flow, Accounting, Loyalty, Stock Summary, Annual Summary, Bank Reconciliation, Offline Mode, Payroll, Payments (Credit repayments / Invoice "Mark paid") |
| **MOCK** | Receiving, Bills/Payables payment (effectively), Users/Permissions, Sales Targets |

Note on Payroll and Bills: both have real tables and, in Payroll's case, real RPCs for part of the flow — they are classified PARTIAL-leaning-MOCK above because the specific breaks found (period creation never reaching the real table for Payroll; the GRANT gap plus local-first pattern for Bills) mean the real path is currently unreachable in normal use, not just incomplete.

---

## 5. What this report does NOT do

Per the explicit scope for this step, this audit made **no code changes, no migration changes, and no Supabase configuration changes**. The frontend — navigation, module pages, visual design, Vite setup — was not touched and is not proposed to change except where a fix is unavoidably backend-integration-related (e.g. wiring a real mutation behind an existing button — never redesigning the button or the page around it).

---

## 6. Recommended next step

Before any Step 3 implementation work begins, the two items in §0 need to be checked directly against the live Supabase project (not this sandbox, which has no DB access):

1. Confirm whether the `engine_*` and missing `fn_get_*` functions exist live (Database → Functions in the Supabase dashboard, or a `pg_proc` query).
2. Run/confirm `grant_restored_module_permissions.sql` (or an equivalent table-level GRANT migration) against the live project, and confirm with `diagnostic_grants_check.sql` that it resolved the Bills/Payroll/Cash Flow/Branches 403s.

Once those two are confirmed one way or the other, Step 3 (Core ERP first: Inventory, Products, Purchasing, Receiving, Sales, Customers, Credit, Payments, Expenses, Branches, Users/Permissions, Reports) can be prioritized with real information instead of assumptions — starting with the cheapest, highest-confidence fixes already identified here: the Purchasing `'purchasing'` vs `'purchases'` key typo, the `branches.is_main` vs `is_main_branch` column typo, and the Credit payment-accumulation math bug, all of which are one- or two-line fixes with a confirmed root cause.

**No implementation changes have been made.** This report is the complete Step 1 deliverable. Awaiting direction on Step 2 (frontend freeze — already the default posture, nothing further needed unless integration requires a minimal wiring change) and Step 3 (core-ERP-first backend fixes) before any code is touched.
