# ImageCare ERP — Backend Cleanup Plan & Implementation Roadmap

**Date:** 2026-08-24
**Status:** Planning only. No code, migrations, or Supabase config have been changed to produce this document.
**Builds on:** `BACKEND_STABILIZATION_AUDIT.md` (Step 1, delivered previously — this document does not repeat that audit's per-module tables, it acts on them).
**Primary objective restated:** One backend architecture — PAGE → FEATURE HOOK → DOMAIN SERVICE → SUPABASE → DATABASE — underneath the existing, unmodified frontend. Supabase becomes the single source of truth for core ERP data. The frontend is not touched except where a page's existing button must be rewired to a real mutation.

---

## Part 1 — Cleanup Plan (A–H)

### A. Real services to retain (target architecture — build on these, don't replace them)

These already follow the correct pattern (`supabase.schema('imagecare').from(...)` or RPC, `ServiceResponse<T>`, permission-gated) and should be the base every legacy/duplicate service gets folded into:

- `src/services/inventory/inventoryService.ts`
- `src/services/masterData/masterDataService.ts` (branches, products, customers)
- `src/services/sales/salesService.ts`
- `src/services/credit/creditService.ts`
- `src/services/purchasing/purchasingService.ts` (nested version — not the flat one)
- `src/services/financial/financialServices.ts` (expenses, cash flow)
- `src/services/reporting/reportingService.ts`
- `src/services/loyalty/loyaltyService.ts` (nested version — not the flat one)
- `src/services/settings/settingsService.ts`
- `src/services/sync/syncService.ts` (retained specifically as the Offline Mode sync layer, not as a core-ERP data source)
- `src/services/business/businessEngine.ts`
- `src/services/auth/authService.ts` (already fully real — Authentication & PIN)

### B. Legacy local services to be removed/replaced (target: eliminated once the domain's core workflow is verified against Supabase)

Flat files under `src/services/*.ts` that read/write through `src/lib/localStore.ts` → IndexedDB, for domains where Supabase must be the source of truth:

- `src/services/salesService.ts`
- `src/services/creditService.ts`
- `src/services/invoiceService.ts`
- `src/services/customerService.ts`
- `src/services/productService.ts`
- `src/services/stockService.ts`
- `src/services/branchService.ts`
- `src/services/staffService.ts`
- `src/services/roleService.ts`
- `src/services/permissionsService.ts`
- `src/services/payrollService.ts`
- `src/services/billsService.ts`
- `src/services/purchasingService.ts` (flat — distinct from the nested one kept in A)
- `src/services/accountingService.ts`

Not scheduled for removal — legitimately local by design, per the spec's own carve-out for Offline Mode and device-specific state:

- `src/lib/localStore.ts` / `src/lib/offlineDb.ts` themselves (the mechanism stays; only its use as a *primary* source for core-ERP domains goes away)
- `src/services/salesTargetsService.ts`, `src/services/stockSummaryService.ts`, `src/services/bankReconciliationService.ts`, `src/services/dailySummaryService.ts`, `src/services/monthlySummaryService.ts` — secondary modules, deferred to Phase 5, may keep a local-first pattern for now
- `src/services/offlineModeService.ts` — this *is* the offline queueing mechanism; kept as designed

### C. Duplicate services (same domain, two implementations — must be consolidated, not just have one deleted blindly)

| Domain | Real (nested) | Legacy (flat) | Action |
|---|---|---|---|
| Purchasing | `services/purchasing/purchasingService.ts` | `services/purchasingService.ts` | Fix the `'purchasing'`/`'purchases'` key bug in the real one first (Phase 3), confirm it covers every call site the flat one currently serves, then retire the flat one |
| Loyalty | `services/loyalty/loyaltyService.ts` | `services/loyaltyService.ts` | Same pattern, scheduled in Phase 5 (secondary module) |
| Sales | `services/sales/salesService.ts` | `services/salesService.ts` | Confirm engine RPC exists live (Phase 1) before cutting over; flat one retired in Phase 4 |
| Credit | `services/credit/creditService.ts` | `services/creditService.ts` | Fix payment-accumulation and write-off bugs in the real one first (Phase 3), then retire the flat one |
| Customers | `services/masterData/masterDataService.ts` | `services/customerService.ts` | Confirm real one covers all customer mutations used by pages before retiring the flat one |

Rule for every row above: retire the legacy file only after every page/hook that imports it has been repointed to the real service and the swapped path has been transaction-tested — never delete-then-discover a page still depended on it.

### D. Placeholder/no-op mutations that must be replaced with real backend operations (or explicitly labeled "not yet implemented" if they can't be, per the spec's "never silently fake success" rule)

- Users/Permissions: `useSetPermission: async (input: any) => input` and the surrounding staff/role/permission mutations in `src/features/settings/hooks/useSettingsData.ts` / `src/pages/settings/PeopleAccessPage.tsx` — the worst offender, zero persistence.
- Payroll: period creation writing only to IndexedDB (`usePayrollData.ts`) while the periods list reads only from the real `imagecare.payroll` table — not a pure no-op, but functionally equivalent to one, since created periods vanish.
- Any additional `mutationFn: async (input) => input`, hardcoded `[]`/`{}` returns, or `crypto.randomUUID()`-fabricated objects turned up during the Phase 3 sweep (the Step 1 audit found these concentrated in Users/Permissions and scattered elsewhere; Phase 3 includes a dedicated grep pass for the patterns named in the spec: `return input`, `return {}`, `return []`, bare `crypto.randomUUID()` used as persistence).

### E. Database RPCs missing from tracked migrations (status: unconfirmed until Phase 1)

- `engine_*` transaction-posting functions — sale posting, purchase posting, expense posting, credit repayment, supplier payment, payroll processing, stock adjustment/transfer.
- Several `fn_get_*` reporting functions referenced by Reports/Annual Summary/Cash Flow.

Per the spec: absence from `database/migrations/` is not proof these don't exist live, and TypeScript calling them is not proof they do. Phase 1 resolves this against the live project directly — this is the top-priority unknown blocking everything downstream of it.

### F. Live Supabase objects that must be verified before implementation (Phase 1 checklist)

1. Existence of every `engine_*` function (query `pg_proc` in the `imagecare` schema, or check Database → Functions in the dashboard).
2. Existence of every `fn_get_*` reporting function called from `reportingService.ts` and financial hooks.
3. Table-level GRANTs on core tables (`sales`, `purchase_orders`, `inventory_levels`, `credit_transactions`, `bills`, `payroll`, `branches`, etc.) to the `authenticated` role — confirmed absent from tracked migrations; must be confirmed present or absent live.
4. All RLS policies actually active on the live project vs. what's in the tracked migrations — the project's own `stage-6-qa-report.md` documents at least one live, untracked schema-exposure change, so live and tracked can diverge.
5. Any other schema objects (triggers, views, additional functions) created outside migrations, via `pg_proc`/`information_schema` queries against the live project, not just the checked-in SQL files.
6. Whether `grant_restored_module_permissions.sql` / `diagnostic_grants_check.sql` (sitting untracked in the project root) have ever actually been run against the live project — this has been sent to the user twice before with no confirmed result.

### G. RLS / table-grant corrections needed (pending Phase 1 confirmation, planned for Phase 2)

1. Table-level `GRANT SELECT/INSERT/UPDATE/DELETE` to `authenticated` on every core-ERP table — the most likely fix for the standing Bills/Payroll/Cash Flow/Branches 403s.
2. Tighten `journal_entries` INSERT policy so only the service role / engine RPCs can insert directly (currently any authenticated business member can, contradicting the policy's own comment).
3. Add enforcement (trigger or check) tying `loyalty_accounts.points_balance` to the sum of `loyalty_transactions`, plus an owner-only write gate.
4. Add RLS to `migration_log` (currently the one ungated table in an otherwise business/branch-scoped schema).
5. Apply `SET search_path = imagecare, pg_catalog` hardening to the 5 original Stage-1 authorization primitives and the 3 Stage-7 PIN/registration functions (`fn_register_business`, `fn_set_pin`, `fn_verify_pin`) — currently only 5 Stage-2 trigger functions have this hardening.
6. Add an explicit INSERT policy for `notifications` (or explicitly document that it's RPC/service-role-only, if that's intentional).
7. Confirm (and comment, so it's not mistaken for an oversight later) that `businesses` INSERT is deliberately gated to only `fn_register_business`.
8. Add a mechanism (trigger or scheduled recompute) to keep `bank_accounts.current_balance` in sync with transactions instead of drifting.

### H. Core business workflows requiring transaction testing (Phase 6, end-to-end, against a real Supabase project — not unit tests)

1. Create business → create branch → create product → create supplier.
2. Purchase stock → receive stock → verify inventory increases.
3. Make a sale → verify inventory decreases, revenue recorded, COGS computed server-side.
4. Record an expense → verify it's reflected in Net Profit.
5. Make a credit sale → verify customer balance increases correctly.
6. Record a credit payment → verify customer balance decreases by the correct amount (this is the workflow with the confirmed accumulation bug — must be retested after the Phase 3 fix, not just fixed and assumed correct).
7. Attempt a credit write-off → verify it succeeds against the actual `credit_transactions` CHECK constraint (must be fixed in Phase 3 first — currently this always fails).
8. Transfer stock between branches → verify both branches' inventory reflect the transfer.
9. Pull each report (Sales, Credit, Cash Flow, Annual Summary) → verify figures reconcile against the raw transactions, not just that the page renders without error.
10. Full profit check: Gross Profit = Revenue − COGS, Net Profit = Revenue − COGS − Expenses, computed server-side and cross-checked by hand against the test data entered in steps 1–8.

---

## Part 2 — Implementation Roadmap

### PHASE 1 — Live Supabase Verification

- **Objective:** Establish ground truth about what actually exists in the live database, replacing every assumption in the Step 1 audit with a confirmed fact.
- **Files/tables involved:** No source files changed. Live Supabase project only — `pg_proc`, `information_schema.role_table_grants`, `pg_policies`, Database → Functions/Policies in the dashboard.
- **Dependencies:** None — this is the starting point. Requires access to the live Supabase project (dashboard or SQL editor), which this sandbox does not have — must be run by the user or in an environment with live DB access.
- **Expected result:** A definitive list of which `engine_*`/`fn_get_*` functions exist, which table grants exist, which RLS policies are actually active, and whether the two untracked grant scripts in the repo root were ever run.
- **Risk level:** None — read-only queries against the live project.
- **Required before client testing:** Yes — every later phase depends on this being accurate; skipping it risks "fixing" a migration file for something that was already fixed live, or building on an RPC that doesn't actually exist.

### PHASE 2 — Database/RLS Fixes

- **Objective:** Correct the confirmed gaps from Phase 1/§G — table grants, `journal_entries` policy, loyalty balance enforcement, `migration_log` RLS, search_path hardening, `notifications` policy, `bank_accounts.current_balance` maintenance — as new, properly tracked migrations (never hand-edited directly in the SQL editor again, to stop the untracked-drift problem documented in `stage-6-qa-report.md`).
- **Files/tables involved:** New file(s) under `database/migrations/` (e.g. `0021_stage8_grants_and_rls_corrections.sql`); tables named in §G.
- **Dependencies:** Phase 1 must confirm exactly what's missing before writing the migration — otherwise this repeats the same "assumed vs. confirmed" mistake.
- **Expected result:** Every core table has correct grants; RLS gaps closed; SECURITY DEFINER functions hardened; a single new tracked migration file is the sole record of the change (superseding the two untracked root-level scripts).
- **Risk level:** Medium — touches live permissions; a bad grant/policy can either lock out legitimate access or (worse) over-expose data. Should be applied to a staging/duplicate Supabase project first if one exists, otherwise applied carefully with the diagnostic script re-run immediately after.
- **Required before client testing:** Yes — this is very likely what's silently breaking Bills/Payroll/Cash Flow/Branches right now.

### PHASE 3 — Core Service Standardization

- **Objective:** Fix the 10 confirmed code bugs, consolidate the duplicate services (§C), and replace the placeholder mutations (§D) — all within the *service* layer, with zero changes to any page's markup or visual design.
- **Files/tables involved:** `purchasingService.ts` (both), `masterDataService.ts`, `creditService.ts` (both), `useCreditData.ts`, `usePayrollData.ts`, `useSettingsData.ts`, `PeopleAccessPage.tsx` (mutation wiring only, not layout), `payrollService.ts`, `billsService.ts`; tables: `branches`, `credit_transactions`, `payroll`.
- **Dependencies:** Phase 2 grants/RLS must be correct first, or these fixes can't be verified end-to-end (a service fix can't be confirmed working if the underlying GRANT is still missing).
- **Expected result:** One real service per domain (A retained, B/C legacy and duplicate files removed only after their call sites are repointed), the 10 confirmed bugs fixed at their root cause (not worked around), and every core-domain mutation either real or explicitly labeled not-yet-implemented in the UI — never silently faking success.
- **Risk level:** Medium — this is the largest code-change phase, but scoped entirely to services/hooks, not pages. Regression risk is "a page's button stops working" rather than "a page looks different."
- **Required before client testing:** Yes — this is the phase that actually makes Purchasing, Branches, Credit, Payroll, and Users/Permissions function as intended.

### PHASE 4 — Core Transaction Integration

- **Objective:** Wire and confirm the full business cycle end-to-end at the service/RPC level: Purchase → Receive → Inventory increase; Sale → Inventory decrease → Revenue → COGS; Expense → record; Credit sale/payment → customer balance; Net Profit = Revenue − COGS − Expenses computed server-side.
- **Files/tables involved:** `sales`, `sale_lines`, `purchase_orders`, `purchase_order_lines`, `inventory_movements`, `credit_transactions`, `expenses`, `journal_entries`; the `engine_*` RPCs confirmed in Phase 1 (or newly created here if Phase 1 finds them genuinely missing — that decision point happens here, not before).
- **Dependencies:** Phases 1–3. In particular, if Phase 1 finds the `engine_*` RPCs are genuinely missing (not just untracked), creating them is itself a piece of Phase 4 work, not a surprise.
- **Expected result:** A test transaction run through the full cycle produces mathematically correct, server-computed figures with no reliance on frontend arithmetic or local state.
- **Risk level:** Medium-high — this is the financial core of the ERP; errors here have direct business impact (wrong inventory counts, wrong profit figures).
- **Required before client testing:** Yes — this is the actual definition of "core ERP works."

### PHASE 5 — Secondary Module Integration

- **Objective:** Apply the same real-service pattern to Loyalty, Sales Targets, Stock Summary, Daily/Monthly/Annual Summary, Bank Reconciliation, Branch Overview, Offline Mode, Accounting — after the core cycle in Phase 4 is confirmed stable, per the spec's explicit sequencing.
- **Files/tables involved:** The flat legacy services for these domains listed in §B; `sales_targets` (table already exists, cheapest win), `bank_accounts`, `loyalty_accounts`/`loyalty_transactions`.
- **Dependencies:** Phase 4 complete and confirmed stable — the spec is explicit that secondary modules follow core, not run in parallel with it.
- **Expected result:** Same architecture (Page → Hook → Service → Supabase → DB) extended to secondary modules; Offline Mode explicitly kept local-first by design, not converted.
- **Risk level:** Low — these modules are lower business-impact than core financial/inventory flows.
- **Required before client testing:** No — can follow after core-ERP client testing begins, per the spec's own phasing.

### PHASE 6 — End-to-End Business Testing

- **Objective:** Run the full manual scenario from §H against the live, cleaned-up backend: create business → branch → product → supplier → purchase → receive → verify inventory → sale → verify inventory reduction → verify revenue → verify COGS → record expense → verify net profit → credit sale → receive payment → transfer stock → verify reports.
- **Files/tables involved:** None changed — this is verification only, plus the existing gate commands (`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`).
- **Dependencies:** Phases 1–5 complete.
- **Expected result:** Every step in the scenario produces correct, reconciled figures with no manual browser-state correction needed; all 4 verification gates pass.
- **Risk level:** Low (it's a test phase), but a failure here means going back to Phase 3 or 4, not patching forward.
- **Required before client testing:** Yes — this *is* the client-testing readiness gate.

### PHASE 7 — Deployment

- **Objective:** Ship the stabilized backend to production, confirm the live site reflects it, and close out the two currently-open threads: the earlier browser service-worker/stale-cache issue (still unconfirmed resolved) and the untracked live-Supabase-drift risk (mitigated by Phase 2's move to tracked migrations only).
- **Files/tables involved:** GitHub Actions `deploy.yml` (unchanged — already working, per the prior deploy investigation), `Stage-5` branch.
- **Dependencies:** Phase 6 passed.
- **Expected result:** Live production site matches the tested build; module-by-module status in the audit's §4 table should now read REAL across every core-ERP row.
- **Risk level:** Low, assuming Phase 6 passed — deploy mechanism itself was already confirmed working in the earlier investigation.
- **Required before client testing:** This phase *is* what makes client testing happen against production rather than a local build.

---

## What happens next

This is a plan, not a change. Nothing above has been implemented. Per the instruction, implementation does not begin until this roadmap is approved — specifically, Phase 1 (live Supabase verification) needs to happen first, and since this sandbox has no live database access, that phase needs to be run by you directly against the Supabase dashboard/SQL editor, or I can prepare the exact verification queries for you to run and paste the results back here so Phase 2 can be scoped precisely instead of speculatively.
