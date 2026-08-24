# ImageCare ERP — Module Restoration & Reconnection: Final Report

**Date:** 2026-08-23
**Branch:** Stage-5 (base commit `9d48a177e461578280d38ab6f8f382a2e6881848`)
**Scope:** Restore routing/sidebar for the 10 unwired modules; connect real backend data wherever it genuinely exists; keep the 13 already-connected modules working.

---

## 1. Modules restored (sidebar + routing)

All 10 modules now have full nested routes in `src/app/router.tsx` and a sidebar entry in `src/components/layout/AppShell.tsx`, in the exact order you specified:

Dashboard, Sales, Inventory, Purchasing, Customers, Credit, Invoices, Bills, Expenses, Payroll, Cash Flow, Reports, **Loyalty, Sales Targets, Stock Summary, Daily Summary, Monthly Summary, Annual Summary, Bank Reconciliation, Branch Overview, Offline Mode, Accounting**, Settings.

Every route path and sub-route was taken from each module's own `*Tabs.tsx` component (which already hard-coded the internal navigation) and cross-checked against the old `06972ff` router — they matched. No new pages were created; only existing, already-implemented page components were wired in. No route or sidebar entry is a duplicate (verified by grep).

## 2. Backend wiring — what's real vs. what's still local

Each module's feature hook file (`src/features/<module>/hooks/use<Module>Data.ts`) was rewritten in place, function-by-function, following the same pattern already proven on Invoices/Bills/Payroll/Cash Flow: real functions call the actual Supabase-backed services; anything without genuine backend support was left calling the local IndexedDB service and tagged `// LOCAL-ONLY`. No page file was touched, and no business rule was invented to make something look "connected."

**Fully real (all exports backend-wired):**
- **Daily Summary** — `getDashboardKPIs`, `getCashPosition`, `listCashTransactions`, `getStockSummary`.
- **Monthly Summary** — same real functions plus `getSalesByPeriod`, `getTopProducts`; per-branch comparison via real `branches` + per-branch KPI calls.
- **Annual Summary** — year-scoped KPIs/sales/top products/cash transactions; year-over-year is real arithmetic on two real KPI fetches.
- **Branch Overview** — real branch list (scoped by permission), real per-branch KPIs, real inventory movements for stock in/out.

**Mostly real, with specific gaps disclosed in-code:**
- **Stock Summary** — dashboard KPIs and current-stock list are real (`getStockSummary`); Branch Comparison stays **local** because the real stock view has no movement/history data, only a current snapshot.
- **Offline Mode** — "Sync now" genuinely calls the real sync engine (`runSyncSession`); pending queue, sync history, and conflict list stay **local** because the real sync functions only return aggregate counts, not an inspectable list. Encryption status and offline settings are correctly local-only (device concerns, not backend).

**Partially real by explicit design (do not overstate):**
- **Bank Reconciliation** — only "unmatched deposits" (real `cash_transactions` rows tagged `bank_transfer`) is real. Bank account management, statement lines, matching, and reconciled balance all stay local — there is a real `bank_accounts` table but no service function against it, and **no `bank_statement_lines` table exists in the database at all**.
- **Accounting** (`cash-movements`) — already partially wired earlier this session: cash-flow KPIs, cash ledger, and cash-in-hand breakdown are real (same `getCashPosition`/`listCashTransactions` Cash Flow uses). Manual cash movements, settings, bank balance, forecast, and reconciliation entries stay local — no real backend exists for those yet.
- **Sales Targets** — **stays entirely local.** The `imagecare.sales_targets` table exists with real columns and RLS, but no service function anywhere reads or writes it, and the pages need actual stored target amounts and per-staff/branch achievement percentages to render honestly — there's nothing real to compare "actual" against. Wiring the dashboard to generic sales KPIs would have silently faked target data, so it was left alone.
- **Loyalty** — new minimum-safe real service created at `src/services/loyalty/loyaltyService.ts`: real list/detail of loyalty accounts, real transaction history (per account), real enrollment (zero-balance row creation), and a real top-members ranking (sorted by real stored `points_balance`). Everything requiring an invented business rule — points-per-currency rate, redemption minimums, expiry policy — stays local, because none of those numbers exist anywhere in the database; the current local values are simply invented defaults, not sourced data.

## 3. The 13 already-connected modules

Unaffected. Dashboard, Sales, Inventory, Purchasing, Customers, Credit, Invoices, Bills, Expenses, Payroll, Cash Flow, Reports, and Settings were not touched in this pass (Invoices/Bills/Payroll/Cash Flow's real wiring and the Invoices `ToastProvider` fix were completed and already committed to Stage-5 earlier this session, commit `9d48a177`).

## 4. Files changed in this pass (14 files, relative to Stage-5 tip `9d48a177`)

- `src/App.tsx` — mounts the correct `ToastProvider` at the app root (fixes the Invoices crash; this was pending from earlier this session and had not yet reached Stage-5).
- `src/app/router.tsx` — adds nested routes for all 10 restored modules.
- `src/components/layout/AppShell.tsx` — adds the 10 sidebar entries in the required order.
- `src/config/env.ts` — adds the 9 new `MODULES` permission keys (Bank Reconciliation reuses the existing `bank` key).
- `src/features/annualSummary/hooks/useAnnualSummaryData.ts`
- `src/features/bankReconciliation/hooks/useBankReconciliationData.ts`
- `src/features/branchOverview/hooks/useBranchOverviewData.ts`
- `src/features/dailySummary/hooks/useDailySummaryData.ts`
- `src/features/loyalty/hooks/useLoyaltyData.ts`
- `src/features/monthlySummary/hooks/useMonthlySummaryData.ts`
- `src/features/offlineMode/hooks/useOfflineModeData.ts`
- `src/features/salesTargets/hooks/useSalesTargetsData.ts`
- `src/features/stockSummary/hooks/useStockSummaryData.ts`
- `src/services/loyalty/loyaltyService.ts` (new file)

All 14 have already been written into your local `C:\GITHUB\IMAGE-CARE` checkout (confirmed on the `Stage-5` branch, with no local drift beforehand — your working copy was exactly at `9d48a177`).

**Not part of this commit:** `diagnostic_grants_check.sql` — a leftover, read-only diagnostic query from the still-open 403 permissions investigation (Bills/Payroll/Cash Flow). It's scratch, not application code, and wasn't delivered to your repo folder. That issue is still unresolved and separate from this restoration — see §8.

## 5. Verification gates — all passed

Run against the full restored codebase (not just the changed files):

- **`npx tsc --noEmit`** — 0 errors.
- **`npm run lint`** (`eslint . --max-warnings 0`) — 0 errors, 0 warnings.
- **`npx vitest run --coverage`** — 429 tests passed, 13 skipped (pre-existing, unrelated), 0 failed. Coverage: 63.13% statements / 51.52% branch / 64.19% functions / 63.13% lines — above the configured gate (functions ≥60%, lines ≥60%).
- **`npm run build`** — succeeded, produced a working `dist/` bundle.
- Manual check: no duplicate route paths, no duplicate sidebar entries, sidebar order matches your spec exactly, no module hidden behind a "Coming Soon" placeholder.

No conflict was found between the old frontend and the current backend architecture — nothing hit the STOP condition.

## 6. Permission grants needed (separate script, already sent to you)

The 9 new module keys need explicit `imagecare.user_permissions` rows before their sidebar items become visible to any user, including the owner — `is_owner` never auto-grants module view access in this app's permission model. A separate file, `grant_restored_module_permissions.sql`, was sent to you: it's idempotent (safe to re-run) and only touches the 9 new module keys, granting view/create/edit to every `is_owner = true` user. Run it once in the Supabase SQL editor after you deploy.

## 7. What you need to do next

1. Open GitHub Desktop, confirm you're on the `Stage-5` branch (you are).
2. Review the diff for the 14 files listed in §4.
3. Commit with a message like: `Restore routing/sidebar for 10 modules; wire real backend where it exists`.
4. Push to `Stage-5`.
5. Run the `Deploy to GitHub Pages` workflow manually (`workflow_dispatch` on `deploy.yml`) — `ci.yml` does not trigger on Stage-5 pushes, so there's no automatic CI gate here; the results in §5 are the equivalent verification.
6. Run `grant_restored_module_permissions.sql` in the Supabase SQL editor.
7. Reload the app and confirm all 22 sidebar items are visible and the 10 restored pages load without errors.

I don't have push access to your GitHub repo in this session, so I can't complete steps 3–5 myself — everything is staged and ready in your local checkout.

## 8. Still open, not part of this restoration

The 403 Forbidden issue on Bills/Payroll/Cash Flow/branches (likely a missing table-level `GRANT` to the `authenticated` Postgres role) is still unresolved — I sent you a read-only diagnostic query earlier this session and haven't received results back yet. That's unrelated to this module-restoration pass and should be picked up separately.

## 9. Is deployment safe?

Yes, based on everything checked in this session: typecheck, lint, full test suite with coverage, and a production build all pass cleanly, and no page or route conflicts were found. The one caveat is the pre-existing, separate 403 permissions issue in §8 — that will still affect Bills/Payroll/Cash Flow after this deploys, exactly as it does today, since this pass didn't touch that code path.
