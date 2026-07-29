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
- **IMP-003 — Product Master & Inventory Management**: Product catalogue, Categories (with merge), Brands, Units of Measure, Suppliers, Stock Movements (permanent audit trail), Stock Adjustments (mandatory reason), Barcode generation/printing, and 7 Inventory Reports.
- **IMP-003 — Inventory**: Product Master (with barcode support), Categories (with merge), Brands, Units of Measure, Suppliers, Stock Movements (permanent audit trail), Stock Adjustments (mandatory reason), Barcode Management (generate/search/print), 7 Inventory Reports, and an Inventory Dashboard with KPIs and quick actions.
- **IMP-004 — Sales & POS + Customer Master**: an offline-first point-of-sale workspace (search/scan products, cart, discounts, tax, payment methods, park/resume sales, printable receipts) plus the Customer Master — the single customer record every future module (Credit, Loyalty, Invoices, Reports) will reuse.

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

### Inventory module (IMP-003)

- **Transaction-based stock (IMP-003 §18):** `currentStock` is never edited directly by the product form — the *only* path that changes it is `stockService.recordMovement()`, which every create (opening stock), adjustment, and future sale/purchase will go through. This means stock levels are always reconstructable from the movement log.
- **No negative stock (IMP-003 §17):** `recordMovement` computes the resulting quantity and throws `NegativeStockError` before writing anything if it would go below zero — tested directly (see Testing summary).
- **Unique SKU/barcode (IMP-003 §17):** enforced in `productService`, case/whitespace-normalized, tested directly.
- **Archive instead of delete (IMP-003 §18):** products, categories, brands, units are all soft-deleted (`is_active`/`status` flips); nothing is ever hard-deleted.
- **Category merge (IMP-003 §7):** reassigns every product on the source category to the target, then archives the source — implemented as a single service call (`categoryService.mergeCategories`) so it can't leave products half-migrated.
- **Barcodes are real**, not placeholders — rendered with `jsbarcode` (CODE128), each with a genuinely unique generated value.
- **A real concurrency bug was found and fixed during testing:** on a completely fresh install (empty IndexedDB), two hooks that both trigger `listProducts()` on the same page load (`useProducts` and `useGeneratedSku`) could each see "no data yet" and independently seed the product list with *different* random IDs — the second write would silently clobber the first, leaving a product link pointing at an ID that no longer existed ("Product not found" when clicking a product that was clearly right there in the list). Fixed with a single-flight lock (`lib/localStore.ts` → `withSingleFlight`) so concurrent first-load seed calls for the same storage key share one result instead of racing. The same latent bug existed in `staffService.listStaff` (Settings module) and was fixed there too, even though it hadn't been observed failing — it was the identical pattern.
- **A related cache-invalidation gap was also found and fixed:** archiving/reactivating a product updated the *products list* cache but not the *single-product* cache the detail page reads from, so the Archive/Reactivate button wouldn't visually update after being clicked. Fixed by invalidating both query keys on every product mutation.

### Inventory module (IMP-003)

- **Transaction-based stock (IMP-003 §18):** `currentStock` is never edited directly by the product form — the only path that changes it is `stockService.recordMovement()`, which also writes a permanent `StockMovement` record. Even a brand-new product's opening stock creates a movement.
- **No negative stock (IMP-003 §17):** every movement (including adjustments) is validated against current stock before being applied; `NegativeStockError` is thrown and shown to the user rather than allowing stock to go below zero.
- **Unique SKU and barcode (IMP-003 §17):** enforced in `productService.ts` (`DuplicateSkuError`, `DuplicateBarcodeError`), checked on both create and edit.
- **Archive instead of delete (IMP-003 §18):** products, categories, brands, and units are all soft-deleted (`is_active`/`status` flags). Archived products are hidden from the default product list and blocked from selling via `assertSellable()` — ready for the Sales module to call once it exists.
- **Category merge (IMP-003 §7):** reassigns every product on the source category to the target, then archives the source — implemented in `categoryService.mergeCategories()`, verified with a scripted test that a product's category actually changes.
- **Stock Adjustments (IMP-003 §12):** require a mandatory reason (enforced by both Zod and the service layer). There's no multi-step approval workflow yet — the acting user is recorded as both creator and authorizer, which is honest about today's single-session reality while keeping the data shape ready for a real approval flow later.
- **Barcode rendering:** uses `jsbarcode` (CODE128) — genuinely renders and prints, not a placeholder.
- **Inventory Reports:** all 7 (Valuation, Stock Levels, Low Stock, Out of Stock, Dead Stock, Fast/Slow Moving, Profitability) compute from real product/movement data. Fast/Slow Moving will show 0 units for everything until the Sales module exists and starts recording `sale`-type movements — that's accurate, not a bug.
- **Product Detail page** has 9 tabs per IMP-003 §6. Purchase History and Sales History currently show honest empty states, since the Purchase Orders and Sales modules don't exist yet.
- **Inventory Dashboard refinements:** global search (Name/SKU/Barcode/Category, live autocomplete), filter bar (Category/Supplier/Brand/Status/Branch — narrows the Recent Stock Activity and Low Stock Preview panels), an Inventory Value Trend chart with 7d/30d/12mo ranges (see below), a Product Statistics widget, and a polished empty state for zero-product installs. `react-is` had to be added explicitly as a direct dependency — Recharts needs it but it wasn't resolving through the `--legacy-peer-deps` install chain.
- **Inventory Value Trend is reconstructed from real movement history, not fabricated.** `getInventoryValueTrend()` in `inventoryReportsService.ts` replays each product's movements up to a given moment to compute what stock (and therefore value) looked like then. On a fresh install this legitimately renders as a flat line that steps up once — that's accurate, not a bug. It recomputes on every call, which is fine at demo data volume; a real deployment should switch to daily valuation snapshots instead of replaying full history.
- **Bundle size note:** the Inventory Dashboard's lazy chunk is now ~365 KB (Recharts is the majority of that) — isolated to that one page/chunk, not the initial load, but worth knowing if more chart-heavy pages get added later.
- **Business name is now genuinely editable end-to-end.** Earlier, the sidebar logo text and the Dashboard's "Welcome back" subtitle both read from a hardcoded stub (`useAuth.ts`'s fake signed-in user) rather than the real Business Profile record — editing the name in Settings silently did nothing elsewhere. Fixed: `businessName` was removed from `AuthedUser`/`useAuth` entirely (it's Settings data, not user-identity data), and both the Sidebar and Dashboard now read it live from `useBusinessProfile()`. Verified end-to-end: changed the name in Settings, confirmed it updated in both places and the old name was gone. The "IMC" monogram badge in the sidebar (ImageCare's initials, changed from an earlier "IC" version that read awkwardly) is left as a fixed logo mark (it's also baked into the actual PWA icon image files) rather than derived from the name — making just the text dynamic while the app icon stays fixed would be a worse inconsistency than leaving both fixed.

### Inventory Dashboard — production polish pass

- **One sync indicator, not two.** The Dashboard previously rendered its own `SyncStatusIndicator` next to the branch/currency selectors, duplicating the global one already in the app header (`RootLayout`). Removed the page-level one; there's now exactly one, globally, verified by a scoped test.
- **Quick actions redesigned around a clear primary action:** "Add product" is now a filled, brand-blue button — the obvious next step — while Import/Export/Print/Stock adjustment/Barcode labels are visually secondary (white, bordered). Card height reduced ~20-25% via tighter padding.
- **Record counts in the Inventory sub-navigation** — "Products(5)", "Categories(4)", etc. — computed live from the same data each destination page shows (active-only counts, matching each page's default filter).
- **A global Notification Center** (bell icon, header) surfaces low-stock and out-of-stock alerts app-wide, not just on the Inventory Dashboard — clicking an alert jumps straight to that product.
- **Three-column operational row** beneath the KPIs: Recent Stock Activity, Low Stock Preview, and a compact Inventory Value Trend chart side by side. Product Statistics moved to its own horizontal strip below (added a `layout="horizontal"` mode to the widget rather than forcing it to compete for space in the 3-column row).
- **Multi-step Add Product wizard** (Basic Info → Pricing & Stock → Supplier & Details → Review) replaces the old single-screen form, with per-step validation blocking "Next" until that step's required fields pass.
- **A real bug found and fixed during this pass:** the wizard's final "Create product" button was a native `type="submit"`. Because it physically replaces the "Next" button in the same DOM position the instant the last step is reached, the browser could submit the form a step early — a timing issue between React's re-render and native form-submit handling, not a validation bug. Fixed by having both step-navigation and final submission handled explicitly via `onClick`, never relying on native form-submit timing. Verified with an automated step-by-step run of the wizard, including the exact failure case that first caught it.
- **Sticky search + filter toolbar** — pins just below the app header while scrolling (verified: stays within ~76px of the top after scrolling 600px down), independent of the (non-sticky) breadcrumb/header/quick-actions above it.
- **Friendlier empty state** for zero-product installs, with a clear single call to action.

## Rebranding this app for a different business

This started as ImageCare's app, but the business name is no longer hardcoded — it's designed so this codebase can be reused as a template for a different business later, without a full rebuild.

**Already dynamic — no code change needed:** the business name shown in the sidebar, the Dashboard's "Welcome back" line, the Settings landing page subtitle, and the About page all read live from **Settings → Business Profile**. Change it there and it updates everywhere immediately (this was fixed in this pass — it used to be hardcoded in two places disconnected from Business Profile).

**Needs a one-time manual edit** (these are baked in at build time — the installed app's icon/name and the GitHub Pages URL have to exist before any user data loads, so they can't come from Settings):
- `vite.config.ts` — the PWA `manifest.name`/`manifest.short_name` (shown when someone installs the app), and the `base` path (must match your GitHub repo name)
- `index.html` — the browser tab title and meta description
- `public/icons/*.png`, `public/favicon.svg` — the "IC" logo mark; regenerate with a different monogram/logo for a different business
- `package.json` — the `name` field is cosmetic (internal npm identifier only), not user-visible, safe to leave or change

Each of these is commented in place pointing back to this section. Everything else in `src/` is already business-name-agnostic.

**What this is *not*:** this app is still single-tenant — one deployment serves one business, with data stored in each visitor's own browser. It is **not** set up for multiple businesses to share one live deployment with separate logins and isolated data (that would need a real backend database, real authentication, and per-business data isolation — a substantially larger project, out of scope here). "Rebrandable template" means: copy this repo, edit the handful of files above, deploy it separately for a different business.

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

### Sales & POS + Customer Master (IMP-004)

- **The cashier never leaves the POS workspace** — customer creation happens inline via a modal ("Save & Continue Sale"), never a page navigation, per IMP-004's explicit workflow requirement. Verified: after adding a customer mid-sale, the page is still `/sales` and the new customer is auto-selected into the current cart.
- **Heavy reuse of existing infrastructure, not a parallel system:** checkout calls the same `stockService.recordMovement()` the Inventory module uses (so a sale is just another movement type, with the same no-negative-stock and audit-trail guarantees), reads Tax Rates and Receipt Settings from IMP-002 as-is, and enforces `SalesSettingsConfig` (`allowDiscounts`, `maxDiscountPercent`, `requireCustomerForCredit`) that already existed but had nothing enforcing it until now.
- **Archived products can't be sold:** enforced via `productService.assertSellable()` (already built for Inventory) — and since the POS product grid only lists `status === 'active'` products in the first place, an archived item never even appears to be clickable.
- **Customer Master duplicate detection is a warning, not a hard block** (IMP-004 business rule: "Detect duplicates") — matching name, phone, or email surfaces existing candidates with a "create anyway" override, since two real customers can legitimately share partial contact info. Verified: creating a customer with a phone number that only differs in formatting from an existing one triggers the warning.
- **Parking a sale never touches stock.** Only a completed sale calls `recordMovement`; resuming a parked sale reloads its cart and lets the cashier complete (or re-park) it normally. Verified end-to-end: park → resume → item is back in the cart.
- **Every registered (non-walk-in) customer's profile updates automatically** on a completed sale — lifetime purchases, a simple placeholder loyalty-points rule (documented in `salesService.ts` as a stand-in for a real future Loyalty Programme module), and credit balance for credit-method sales. Verified: a credit sale to an existing customer updated all three fields and appeared in that customer's purchase history.
- **Known gap, flagged honestly:** the home Dashboard's "Today's Sales" KPI and "Recent Sales" list still read from the original IMP-001 mock data service, not from real POS sales. Wiring the home Dashboard to real `salesService` data is a natural next step but wasn't in this pack's scope — until then, sales completed through the POS won't show up on the main Dashboard, only in Sales/Customer screens themselves.



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

**Inventory (IMP-003)** — verified with scripted browser tests interacting with the real rendered UI:
- ✅ Duplicate SKU rejected; duplicate barcode rejected; product created successfully once both are unique
- ✅ Stock adjustment that would take a product below 0 is rejected with a clear error
- ✅ Valid stock-in adjustment is recorded and appears in the adjustments list
- ✅ Merging one category into another archives the source and reassigns every affected product — confirmed a specific product's category actually changed
- ✅ Archiving a product hides it from the default product list; "Show archived" reveals it again
- ✅ All 7 Inventory Dashboard KPIs render with real computed values
- ✅ Low Stock report returns real rows computed from actual product data

Also fixed during this pass: several form labels across the Inventory module weren't properly associated with their inputs (`<label>` without `htmlFor`/`id`) — a real accessibility gap, not just a test-script issue. Fixed in `StockAdjustmentModal`, `ProductFormModal`, `SupplierFormModal`, and `ProductDetailPage`.

**Inventory Dashboard refinement** — verified with scripted browser tests plus a zero-console-error structural check:
- ✅ Breadcrumb renders "Dashboard > Inventory"
- ✅ Search autocomplete finds a product by partial name match
- ✅ Category filter correctly narrows the Low Stock Preview panel (confirmed by reading the panel's actual text content, not just page-wide text presence)
- ✅ Trend chart range buttons (7 days/30 days/12 months) switch active state on click
- ✅ Product Statistics, Recent Stock Activity, Low Stock Preview, and the KPI grid all render with zero console/page errors
- Not separately screenshot-verified in this pass beyond the automated checks above (relied on structural/functional checks rather than pixel inspection this round)

**Sales & POS + Customer Master (IMP-004)** — verified with scripted browser tests exercising the real checkout flow end-to-end:
- ✅ Adding a product to the cart and completing a sale actually reduces inventory — confirmed a product's stock dropped from 2 to 1 immediately after the sale, with a matching "sale" movement in Stock Movements
- ✅ Customer creation happens inline mid-sale without navigating away ("Save & Continue Sale") — confirmed still on `/sales` afterward, with the new customer auto-selected
- ✅ Duplicate customer detection triggers on a phone-number match even with different formatting, with a "create anyway" override
- ✅ Park → resume round-trip: parking clears the cart, resuming reloads the exact same items
- ✅ Discount above the Sales Settings limit is rejected with a clear error
- ✅ Credit sale without a selected customer is blocked; succeeds once a customer is selected
- ✅ A completed credit sale updates the customer's lifetime purchases, loyalty points, and credit balance, and appears in their purchase history — all verified within one continuous session (re-verified after an initial false read from checking a fresh, unrelated browser session by mistake)

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

**IMP-004 (Sales & POS + Customer Master)** — new files:
- `src/types/sales.ts` — Customer, Sale, SaleLineItem, CartItem, CheckoutInput and related types
- `src/data/salesSeed.ts` — default seed customers
- `src/services/customerService.ts` — Customer Master CRUD, duplicate detection, purchase/loyalty/credit updates
- `src/services/salesService.ts` — the checkout engine (validation, stock movements, receipts, park/resume)
- `src/features/sales/hooks/useSalesData.ts` — all React Query hooks
- `src/components/sales/*` — CustomerFormModal, CustomerSelector, ProductSearchGrid, CartPanel, ParkedSalesButton, ReceiptModal
- `src/pages/sales/PointOfSalePage.tsx`, `CustomersListPage.tsx`, `CustomerDetailPage.tsx`

**Modified for IMP-004:**
- `src/app/router.tsx` — added `/sales`, `/customers`, `/customers/:id` lazy routes
- `src/components/layout/Sidebar.tsx` — Sales and Clients are now real links
- `src/pages/DashboardPage.tsx` — the "New sale" quick action now navigates to `/sales` instead of showing a "coming soon" toast
