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

## Architecture notes

- **Offline-first (IMC-000 §7, IMC-002 §8):** every read goes through `withOfflineFallback` in `dashboardService.ts` — online results are cached to IndexedDB; when offline, the last cached result is served instead of an error. The Sync Status indicator in the top bar reflects real online/offline state.
- **No duplicate data entry / single source of truth (IMC-002 §5, §9):** the Dashboard is read-only by design (IMP-001 §7 — "No manual editing from dashboard cards"). It only aggregates data other modules will own.
- **Branch awareness (IMP-001 §7):** `useAuth` currently returns a fixed user with `allowedBranchIds`; the Dashboard filters the branch selector and all queries against this list. Swap the internals of `useAuth` when the real auth/Settings module lands — the `AuthedUser` type is the contract, so Dashboard code won't need to change.
- **Scope discipline (IMC-000 §4, IMP-001 §3):** only the Dashboard module is implemented. The sidebar lists all 20 approved modules from IMC-000; everything except Dashboard is visibly disabled ("Soon") rather than hidden, so the approved scope stays visible without implying unbuilt functionality exists. Quick actions that point at unbuilt modules (Sales, Purchase Orders, Expenses, Monthly Summary) show a toast rather than failing silently or navigating nowhere.

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

- `npm run build` (`tsc -b && vite build`) completes with zero type errors.
- Verified visually via rendered screenshots at desktop (1440px) and mobile (390px) widths — card-based layout, brand colors, professional icons (no emojis), responsive grid collapse confirmed.
- Manual QA against IMP-001 §13:
  - Dashboard loads without errors — verified (build + preview)
  - KPIs match underlying records — verified (KPI cards read directly from `dashboardService`, no separately maintained totals)
  - Quick actions navigate correctly — verified within scope (unbuilt modules show a clear "coming soon" toast instead of a dead link)
  - Responsive layout — verified at desktop and mobile widths
  - Offline mode — verified: `dashboardService` serves cached IndexedDB data when `navigator.onLine` is false; Sync Status indicator reflects offline state

Not yet covered (needs a real device/browser session, out of scope for this static check): PWA install prompt behavior, actual service worker offline reload after a real network drop, Lighthouse PWA audit.

## Modified / created files (this pack)

All files under `imagecare/` are new — this is the first implementation pack. Notable ones:

- `vite.config.ts` — Tailwind + PWA plugin wiring, manifest, runtime caching
- `src/index.css` — brand design tokens
- `src/types/domain.ts` — shared domain types
- `src/lib/supabaseClient.ts`, `src/lib/offlineDb.ts`, `src/lib/queryClient.ts`, `src/lib/format.ts`
- `src/services/dashboardService.ts` — data abstraction layer
- `src/data/mockData.ts` — standalone mock data source
- `src/hooks/useAuth.ts`, `src/hooks/useOnlineStatus.ts`
- `src/features/dashboard/hooks/useDashboardData.ts`
- `src/components/ui/*` — Card, Badge, Skeleton, EmptyState, ErrorState, Toast
- `src/components/dashboard/*` — WelcomeHeader, BranchSelector, SyncStatusIndicator, KpiCard, KpiGrid, QuickActions, LowStockAlert, RecentSalesList
- `src/components/layout/*` — AppShell, Sidebar, Topbar
- `src/pages/DashboardPage.tsx`
- `src/app/router.tsx`, `src/App.tsx`, `src/main.tsx`
- `public/icons/*`, `public/favicon.svg` — PWA icon set
- `.env.example`
