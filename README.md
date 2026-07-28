# ImageCare Business Management System

Progressive Web Application for ImageCare. This build implements **IMP-001 — Dashboard Implementation Pack** only, per the approved scope in IMC-000 through IMC-003.

## Stack

- React + Vite + TypeScript
- Tailwind CSS v4 (brand tokens in `src/index.css`)
- React Router
- TanStack Query (data fetching/caching)
- Supabase (database, auth, storage) — optional until configured
- IndexedDB (via `idb`) for offline read caching
- vite-plugin-pwa (installable app, service worker, manifest)
- React Hook Form + Zod (ready for forms in future packs)
- Recharts (ready for charts in future packs)
- Lucide React (icons — no emojis anywhere in the UI, per IMC-003)

## Getting started

```bash
npm install
npm run dev       # http://localhost:5173
```

The app runs fully on local mock data out of the box — no Supabase project is required to see the Dashboard working.

### Connecting Supabase

1. Copy `.env.example` to `.env`.
2. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from your Supabase project.
3. Restart the dev server.

`src/lib/supabaseClient.ts` detects the presence of these variables. Every function in `src/services/dashboardService.ts` checks this automatically and switches from mock data to live Supabase queries — no other code changes needed. Expected tables/RPCs for the Dashboard:

- `dashboard_summary(branch_id)` — RPC returning `{ todaysSales, todaysExpenses, cashAvailable, currency }`
- `inventory_items` — table with `quantity_remaining`, `reorder_level`, `branch_id`
- `sales` — table with `created_at`, `branch_id`, ordered/filterable for "recent sales"

### Build & preview

```bash
npm run build
npm run preview
```

## Deploying to GitHub Pages

Two ways to deploy — pick one:

### Option A: Automatic (recommended — no terminal needed after initial setup)

This repo includes `.github/workflows/deploy.yml`. Once GitHub Pages is set to **Source: GitHub Actions** (Settings → Pages), every push to `main` — including files edited or uploaded directly on github.com — automatically builds and publishes the site. No local `npm` commands required for day-to-day updates.

### Option B: Manual, from your own machine

```bash
npm run deploy
```
Builds the app and pushes `dist/` to the `gh-pages` branch directly (requires Pages **Source: Deploy from a branch** → `gh-pages` → `/(root)`). Only use one of the two source settings at a time — mixing them will cause your live site to flip-flop between old and new builds depending on which method ran last.

The project is pre-configured for a repo named `IMAGE-CARE` (see `base: '/IMAGE-CARE/'` in `vite.config.ts`). If your repo has a different name, change that value to match — case matters.

## Modules implemented

- **IMP-001 — Dashboard**: KPIs, recent sales, low stock, quick actions, branch/currency selectors.
- **IMP-002 — Settings**: full administration centre — Business Profile, People & Access (staff + roles + permission matrix), Branch Management, Tax, Receipts, Inventory Settings, Sales Settings, Notifications, Backup & Restore, Synchronization, Appearance, About.

## Architecture notes

- **Offline-first (IMC-000 §7, IMC-002 §8):** every read goes through `withOfflineFallback` in `dashboardService.ts` — online results are cached to IndexedDB; when offline, the last cached result is served instead of an error. The Sync Status indicator in the top bar reflects real online/offline state.
- **No duplicate data entry / single source of truth (IMC-002 §5, §9):** the Dashboard is read-only by design (IMP-001 §7 — "No manual editing from dashboard cards"). It only aggregates data other modules will own.
- **Branch awareness (IMP-001 §7):** `useAuth` currently returns a fixed user with `allowedBranchIds`; the Dashboard filters the branch selector and all queries against this list. Swap the internals of `useAuth` when the real auth/Settings module lands — the `AuthedUser` type is the contract, so Dashboard code won't need to change.
- **Scope discipline (IMC-000 §4, IMP-001 §3):** only the Dashboard module is implemented. The sidebar lists all 20 approved modules from IMC-000; everything except Dashboard is visibly disabled ("Soon") rather than hidden, so the approved scope stays visible without implying unbuilt functionality exists. Quick actions that point at unbuilt modules (Sales, Purchase Orders, Expenses, Monthly Summary) show a toast rather than failing silently or navigating nowhere.

### Settings module (IMP-002)

- **Audit fields & UUIDs (IMC-005 §3–4):** every entity (`StaffMember`, `BranchRecord`, `TaxRate`, config singletons) carries `id` (UUID), `created_at`, `updated_at`, `created_by`, `updated_by`, `branch_id`, `is_active`, `sync_status`, `last_synced_at` — stamped consistently via `src/lib/audit.ts`.
- **Offline-first writes (IMC-002 §8, IMC-005 §6):** every mutation is written to IndexedDB immediately and queued (`src/lib/localStore.ts`) rather than requiring a live connection. The Synchronization settings page shows the queue and lets you manually "sync" (simulated — see below).
- **Business rules enforced in code, not just UI:** unique branch codes (`DuplicateBranchCodeError`), unique usernames (`DuplicateUsernameError`), and "can't disable the last active Owner" (`LastActiveOwnerError`) all throw from the service layer, so they hold even if a UI check is bypassed.
- **Soft delete only:** disabling a staff member sets `is_active: false`; nothing is ever hard-deleted, per IMP-002's business rules.
- **Owner permissions are locked:** the Permission Matrix's Owner column is always fully granted and its checkboxes are disabled in the UI *and* rejected server-side (`OwnerPermissionsLockedError`) if called directly.
- **Backup & Restore is genuinely functional today**, no backend required: "Download backup" serializes all Settings data to a JSON file via the browser; "Restore" reads a chosen file back in. This isn't a stub.
- **Synchronization is simulated** until Supabase is connected: "Sync now" clears the local pending-changes queue and stamps a last-synced time, so the flow is fully testable, but it isn't pushing anywhere yet. Swap `runSync()` in `src/services/backupSyncService.ts` for a real push loop once Supabase is configured.
- **Lazy loading (IMC-004 §6):** every route is code-split (`React.lazy`), so the Dashboard's initial load doesn't pull in Settings code, and vice versa.

## Folder structure

```
src/
  app/            Router
  components/
    dashboard/    Dashboard-specific UI (KPI cards, low stock, recent sales, ...)
    layout/       AppShell, Sidebar, Topbar
    ui/           Reusable primitives (Card, Badge, EmptyState, ErrorState, Toast, Skeleton)
  data/           Mock data source (stands in for Supabase until configured)
  features/
    dashboard/    React Query hooks for dashboard data
  hooks/          useAuth (stub), useOnlineStatus
  lib/            supabaseClient, offlineDb (IndexedDB), queryClient, format helpers
  pages/          DashboardPage
  services/       dashboardService — the Supabase/mock/offline abstraction
  types/          Domain types (Branch, DashboardSummary, LowStockItem, RecentSale, SyncStatus, AuthedUser)
```

## Testing summary

**Dashboard (IMP-001):**
- `npm run build` (`tsc -b && vite build`) completes with zero type errors.
- Verified visually at desktop (1440px) and mobile (390px) widths after the IMP-002 layout refactor — still renders correctly.
- Manual QA against IMP-001 §13: dashboard loads without errors, KPIs read from a single source, quick actions give clear feedback, responsive layout confirmed, offline mode serves cached data.

**Settings (IMP-002)** — verified with scripted browser tests (Playwright) that interact with the real rendered UI, not just visual inspection:
- ✅ Duplicate branch code is rejected; a branch with a unique code is created successfully
- ✅ Duplicate username is rejected; a new staff member is created successfully
- ✅ The last active Owner cannot be disabled (button click is silently blocked with an error toast)
- ✅ Owner's row in the Permission Matrix is locked (checkboxes disabled)
- ✅ A permission change for a non-Owner role persists after a full page reload
- ✅ "Download backup" triggers a real file download
- ✅ Editing Business Profile adds an entry to the sync queue; that entry is visible on the Synchronization page
- ✅ "Sync now" clears the pending queue and shows "Everything is synced"

Not yet covered (needs a real device/browser session or a connected Supabase project): full backup→restore round-trip verification, PWA install prompt behavior, Lighthouse PWA audit, RLS policies (no live database yet to apply them to).

## Modified / created files

**IMP-001 (Dashboard)** — see prior notes; all files under `src/` except `src/pages/settings/*`, `src/components/settings/*`, `src/services/{businessProfile,branch,staff,permissions,tax,configSettings,backupSync}Service.ts`, `src/types/settings.ts`, `src/lib/{audit,localStore}.ts`, `src/features/settings/*`, `src/components/layout/RootLayout.tsx`, `src/components/ui/{Button,Modal}.tsx`.

**IMP-002 (Settings)** — new files:
- `src/types/settings.ts` — all Settings domain types
- `src/lib/audit.ts`, `src/lib/localStore.ts` — audit-field stamping and offline persistence
- `src/data/settingsSeed.ts` — default seed data
- `src/services/businessProfileService.ts`, `branchService.ts`, `staffService.ts`, `permissionsService.ts`, `taxSettingsService.ts`, `configSettingsService.ts`, `backupSyncService.ts`
- `src/features/settings/hooks/useSettingsData.ts` — all React Query hooks
- `src/components/settings/*` — SettingsSectionCard, SettingsPageHeader, FormField, ToggleRow, RoleBadge, StaffFormModal, BranchFormModal, TaxRateFormModal, PermissionMatrixTable
- `src/components/ui/Button.tsx`, `src/components/ui/Modal.tsx` — new reusable primitives
- `src/pages/settings/*` — all 12 section pages
- `src/components/layout/RootLayout.tsx` — new layout route wrapping AppShell

**Modified for IMP-002:**
- `src/app/router.tsx` — restructured to nested, lazy-loaded routes
- `src/components/layout/Sidebar.tsx` — Dashboard and Settings are now real links with active-state highlighting
- `src/pages/DashboardPage.tsx` — no longer renders its own `AppShell` (moved to `RootLayout`); Branch/Currency selectors moved from the topbar into the page's own header row
