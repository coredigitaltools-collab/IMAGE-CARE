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

### Removing hardcoded industry assumptions (post-IMP-004 refinement)

A person using this app pointed out, correctly, that the Inventory seed data (categories like "Photo Paper," brands like "Canon," sample suppliers and products) baked in an assumption that every business using this app sells photography supplies. That's wrong for a template — fixed:

- **`inventorySeed.ts` now returns empty arrays** for categories, brands, suppliers, and products. Only Units of Measure (Piece, Box, Pack, Kilogram, Litre) ship pre-populated, since those aren't industry-specific — virtually any business selling physical goods needs at least one to create its first product.
- **`salesSeed.ts`'s sample customers were removed** for the same reason — a fresh install now has zero customers, exactly like it has zero products.
- **New: `CategoryQuickSelect` component** — every place a product's category is picked (the Add Product wizard, and the Product Detail edit page) now includes an always-available "+ Add new category…" option that lets someone type a brand-new category name on the spot and immediately continue — so an empty or unfamiliar category list never blocks product creation. Verified: created a "Denim Jacket" product with a freshly-typed "Outerwear" category from a completely empty category list, with zero pre-existing options to choose from.
- **The home Dashboard was still showing the original IMP-001 mock data** (fabricated sales, a fake "Grace Nakato" transaction, fake low-stock items) completely disconnected from the real Sales/Inventory modules built since. `dashboardService.ts` now computes Today's Sales, Recent Sales, and Low Stock from real `salesService`/inventory data — Cash Available is documented as a simple placeholder (cumulative non-credit revenue) pending a real Cash Flow module, and Today's Expenses stays honestly at 0 until an Expenses module exists, rather than fabricating a number.
- **A real staleness bug was caught and fixed while verifying the above:** `dashboardService`'s offline-fallback cache was being treated as a permanent cache whenever Supabase wasn't configured, not just when genuinely offline — so once any Dashboard data was computed once, it would never recompute again even as real sales happened. Invisible before (mock numbers never changed anyway), but a real bug now that the Dashboard reflects live data. Fixed: the cache is now purely an offline safety net; being online always recomputes fresh, whether the data source is Supabase or local Sales/Inventory reads.
- **A second real bug was caught while testing the above: opening stock was being double-counted.** `createProduct()` set a new product's `currentStock` directly to the entered opening stock *and* separately recorded an "opening" stock movement that added the same amount again — so entering "5" as opening stock silently resulted in 10 in stock. Root cause: the code comment already claimed "the opening movement is the sole source of truth for starting stock," but the code didn't actually do that. Fixed to match what was already documented — new products start at 0, and the opening-stock movement is the only thing that brings it up to the entered count. Verified with a dedicated test confirming a product created with opening stock 5 ends up at exactly 5 (not 10), and that exactly one "opening" movement is recorded, not two.

### POS production polish (checkout experience refinement)

- **Category filter chips** above the product grid — only categories that actually have a sellable product show up as a chip (never a fixed list), so a fresh install shows just "All" until real products with real categories exist.
- **Product cards** now show SKU and a category badge, plus a genuine out-of-stock overlay (not just a disabled/greyed button) that blocks selection outright.
- **Customer panel expands on selection** to show phone, loyalty points, credit balance, and last purchase (computed live from real Sales data, not stored redundantly) — "None yet" for a customer with no completed purchases, never a fabricated date.
- **Payment fields are now genuinely dynamic and validated**, not just decorative: Cash shows an "Amount received" field with live change-due calculation, and blocks completing the sale if the amount is short (`InsufficientPaymentError`). Mobile Money and Card each require a reference/transaction ID before completing (`PaymentReferenceRequiredError`). Verified: attempted a Mobile Money sale with no reference — correctly blocked; a Card sale with a transaction ID — receipt correctly shows it afterward.
- **The receipt modal is now a clear confirmation dialog** — a checkmark icon, "Sale completed" heading, the receipt number prominently placed, and payment-method-specific details (change due for cash; reference/transaction ID for Mobile Money/Card) rather than a generic "Payment: Cash" line.
- **Keyboard shortcuts for desktop cashiers:** F2 focuses the product search (verified via `document.activeElement`), F9 completes the sale, F10 parks it, Esc clears the cart — all skipped while a modal is open so they never fight with normal typing.
- **Touch targets enlarged** (quantity +/- buttons, payment method buttons) for comfortable use on a tablet POS setup, not just desktop with a mouse.
- **Stayed strictly industry-neutral throughout:** even the category quick-create's placeholder text ("e.g. Menswear, Beverages...") was replaced with generic wording once flagged as still assuming a retail-like business. Verified: a fresh POS shows "No products found. Add your first product to get started." with zero industry-specific wording anywhere on the screen.
- **No real regressions** — re-ran the full IMP-003/IMP-004 test suite after these changes; the only "failure" was cash checkout now correctly requiring an amount received before completing (a deliberate new validation, not a bug) — the old test was updated to fill that field in, matching how a real cashier would use it.



## Design System v2.0 (Navy / Electric Blue)

A visual-only redesign — no business logic, routing, database schema, or functionality changed. Every screen was already built from shared components (`Card`, `Button`, `Modal`, `Badge`, `FormField`, `KpiCard`, `EmptyState`, `Skeleton`, etc.), so most of this cascaded automatically from one change rather than needing hundreds of individual edits.

- **Color tokens redefined in `src/index.css`.** `brand-blue-700` (the app's primary color, used in hundreds of places already) is now Navy `#0F172A`. `brand-blue-500` (the one accent color — active states, focus rings, chart lines, selected controls) is now Electric Blue `#3B82F6`. Because every component already referenced these token names rather than hardcoded hex values, the whole app re-themed from this one file. Verified with an automated check reading the actual rendered pixel color, not just the source: sidebar background is exactly `rgb(15, 23, 42)`, the active nav highlight is exactly `rgb(59, 130, 246)`.
- **Sidebar rebuilt for the navy theme** — navy background, white icons/labels, blue highlight for the active module, dimmed "Soon" entries, clean hover transitions.
- **Core shared components polished**: `Button` (press feedback, subtle shadow), `Modal` (fade/scale entrance), `FormField` inputs (focus glow), `KpiCard` (hover lift) — all cascade to every screen that uses them, which is effectively the whole app.
- **New: `RowActionButton`** — a single reusable icon-button component establishing one consistent pattern for Edit/Archive/Reactivate/Duplicate actions on any list row, anywhere in the app, so future modules don't need to invent this again.
  - **Products list** gained inline View/Edit, Duplicate, and Archive/Reactivate icon actions (previously "View" and "Duplicate" were the only options, styled as plain text links).
  - **Customers list** gained inline Edit and Archive/Reactivate icon actions (previously editing a customer required navigating to their profile page first).
  - **A real functional gap was caught and fixed while doing this**: there was no way to *reactivate* an archived customer anywhere in the app — `archiveCustomer` existed but `reactivateCustomer` didn't. Added the missing service function, hook, and UI consistently to both the Customers list and the Customer profile page.
- **No hardcoded demo data was reintroduced.** This pass only touched visual/component code — the empty-state and empty-seed work from the previous pass is untouched.
- **Verified with real interaction tests**, not just visual inspection: archiving, reactivating, and editing were tested end-to-end for both Products and Customers, and the full POS regression suite (keyboard shortcuts, checkout, receipt) was re-run afterward to confirm zero functional regressions.
- **Not yet done, flagged honestly:** a page-by-page confirmation pass of every remaining screen (Inventory Reports tables, POS-specific controls, notification dropdowns) wasn't performed individually — coverage relies on the shared-component cascade plus spot-checks (Settings landing, POS, Customers) rather than an exhaustive screen-by-screen audit. If something looks visually inconsistent on a specific screen, it's worth flagging directly.



## CRM (IMP-005) — built on the existing Customer Master, not a parallel system

Every element here was held to one standard: does it answer a real question an owner would actually ask? Nothing decorative was added.

- **`/customers` is now a real CRM Dashboard**, not the directory. Six KPIs, each answering a specific question: Total Customers ("how many"), New (30d) ("is the base growing"), Active (30d) ("who's actually buying recently"), Lifetime Value ("how much revenue have customers generated"), Outstanding Credit ("how much is owed to us"), Loyalty Members ("how many are engaged"). "Active" is deliberately defined as "purchased in the last 30 days," computed from real Sales data, not a vanity number.
- **Two panels replace a separate "Reports" page**: "Top customers by spend" (who deserves priority service) and "Outstanding credit" (who to follow up with for collections) — both directly actionable, both computed from real data, both linking straight to the customer's profile.
- **The old customer list moved to `/customers/directory`** and gained real filters: an "Owes credit" toggle and a tag filter built from tags that actually exist (never a preset list) — both answer "which customers do I need to look at right now," not just decoration.
- **Customer tags** — free-text, business-defined (e.g. "Wholesale," "Priority"), never a preset industry taxonomy. Shown as chips in the Directory and on the profile.
- **Customer profile restructured into the full tab set IMP-005 specifies**: Overview (contact info + 4 real insight numbers: lifetime value, average purchase value, last purchase, total orders), Purchases, Credit (balance + which sales caused it), Loyalty (points + how they're earned), Quotes and Invoices (honest "module not built yet" empty states, matching the same pattern used elsewhere for unbuilt modules — never fake data), Notes (a real dated, attributed log — separate from the single free-text description field on the quick-add form), and Audit Log.
- **New: a proper Notes log** (`CustomerNote`, distinct from `Customer.notes`) — answers "what have we discussed with this customer and when," not just a single overwritable text field.
- **A real, pre-existing documentation/implementation mismatch was caught and fixed**: the README from an earlier pass claimed sample seed customers ("Grace Nakato," "Daniel Okello") had been removed — they hadn't been; `salesSeed.ts` still returned them. Fixed to actually match what was already documented.
- **A systemic bug was found and fixed at its root, not just patched**: four separate places in the app used the `FormField` component in "controlled" mode (`value`/`onChange`) without passing an `id` or `name`, silently breaking the `<label>`-to-`<input>` association each time (caught because a Playwright test using `getByLabel('Tags')` couldn't find the field). Rather than fix only the Tags field that surfaced it, audited and fixed all four existing occurrences, then fixed `FormField` itself to always generate a valid id as a fallback — so this bug class can't recur in future code, even code written without knowing this history.
- **Verified with real interaction tests**, not visual inspection: added a tagged customer, confirmed the KPI and tag filter both reflect it; ran a full credit sale through the POS and confirmed the Overview, Purchases, Credit, and Loyalty tabs all show the correct real numbers computed from that one sale; added and displayed a dated note; confirmed Quotes shows an honest empty state rather than fabricated data.



## Credit Management (IMC-SRS-006) — built on Customer Master, not a parallel ledger

"One customer has one credit account" is implemented literally: there is no separate CreditAccount entity. `Customer.creditLimit` and `Customer.creditBalance` *are* the account; `CreditPayment`, `CreditWriteOff`, and `CreditLimitChange` are the transaction log behind it.

- **"Credit limits enforced through approvals" is a real mechanism, not a slogan.** Every new customer starts with `creditLimit: 0` — meaning credit sales are impossible until an owner/manager explicitly approves a limit via "Approve credit limit." Checkout (`salesService.ts`) now blocks a credit sale outright if no limit has been approved, or if the sale would push the balance past the approved limit — verified with a real 3-step test: sale blocked with no limit approved → limit approved → same sale now succeeds → a second sale exceeding what's left is blocked again.
- **Credit Dashboard** (`/credit`) — 5 KPIs (Total Outstanding, Accounts with Balance, Overdue Accounts, Overdue Amount, Collected This Month) plus a "Most overdue accounts" panel, all computed from real Sales/Customer data.
- **Credit Accounts** (`/credit/accounts`) — every account with an approved limit or a balance, with Record Payment / Approve Limit / Write Off actions right on each row, plus an "overdue only" filter.
- **Credit Reports** (`/credit/reports`) — an aging report (Current / 31-60 / 61-90 / 90+ day buckets). Documented honestly in `creditService.ts`: aging is a running-balance approximation (oldest unpaid credit sale since the last payment), not a full sub-ledger matching specific payments to specific invoices — reasonable for a single-branch business, worth revisiting if per-invoice allocation is ever needed.
- **Payments** reduce the balance and are logged permanently (method, reference, who recorded it, when) — validated so a payment can never exceed the outstanding balance.
- **Write-offs** require a reason, are permanently logged as bad debt, and are validated the same way.
- **The Customer Profile's Credit tab** (the same page every other module already reads from) now shows the limit, available credit, full payment history, and write-off history alongside the existing credit sales list, with the same three actions available in context.
- **Two components that existed but were never wired in were connected during this pass**: a Customer Health widget and a unified activity Timeline (both built in an earlier session) now actually appear on the Customer Profile's Overview tab.
- **A real bug was found and fixed while testing, not before:** the two new credit-blocking errors (no approved limit, limit exceeded) weren't in the POS's list of recognized errors, so a correctly-blocked sale showed a generic "Something went wrong" instead of the actual reason. Fixed by adding both to the POS's error handling, verified by confirming the specific message now appears.
- **Role-based permissions**: added a `manage_credit` permission to the existing Permission Matrix (Owner/Manager/Accountant: yes by default, Cashier: no) — structurally complete, though full UI-level gating is limited by the same stub authentication noted elsewhere in this README (there's currently one hardcoded "Owner" user, not a real multi-user login system).
- **Not built in this pass, flagged honestly:** Customer Statements (printable running-balance documents) and Notifications integration (overdue-account alerts in the existing bell-icon Notification Center) were in scope for a complete module but weren't completed here — the core accounting (limits, sales, payments, write-offs, aging) was prioritized as the part that had to be correct.

## Purchasing & Procurement (IMC-SRS-007) — the full requisition-to-payment workflow

Follows the spec's exact workflow: Supplier → Requisition → Purchase Order → Approval → Goods Receipt → Inventory Update → Invoice → Payment.

- **"Receiving stock updates inventory automatically" is not a description, it's literally what happens.** `recordGoodsReceipt()` calls the exact same `stockService.recordMovement()` that every other stock change in the app goes through — same no-negative-stock guarantee, same permanent audit trail. Verified: created a PO for 10 units, approved it, received 6 (partial), confirmed stock went from 5→11 and the order correctly showed "Partially Received," then received the remaining 4, confirmed stock reached 15 and the order became fully "Received."
- **The approval gate is real, not cosmetic.** A purchase order cannot have goods received against it until it's been approved — verified by confirming the "Receive Goods" button is genuinely absent before approval and appears immediately after.
- **Over-receiving is blocked.** Tried receiving 999 units against an order with far less remaining — correctly rejected with a clear message, validated at the service layer (not just an HTML `max` attribute that a user could bypass).
- **"Suppliers from Supplier Master only" / "Products from Product Master only"** — every dropdown in every Purchasing form (Requisitions, Purchase Orders, Goods Receipt, Returns, Invoices) pulls live from the existing Supplier and Product Master; nothing is free-text entry of either.
- **Requisitions convert cleanly into Purchase Orders** — approved a requisition, converted it, confirmed it's correctly marked "Converted to PO" and the resulting order carries the right line items.
- **Supplier Invoices support partial payments** — recorded a 100,000 UGX invoice, paid 40,000, confirmed it correctly shows "partially paid" rather than snapping straight to paid or unpaid.
- **Purchase Returns reduce stock immediately** (with a mandatory reason) — verified stock dropped by exactly the returned quantity.
- **A reusable `ProductLineItemsEditor`** component is shared across all four forms that need "pick a real product and a quantity" (Requisition, PO, Goods Receipt, Return) rather than four separate implementations.
- **Not built in this pass, said plainly:** Purchase Reports currently covers spend-by-supplier only, not a fuller reporting suite; and — consistent with the same limitation noted under Credit Management — the Approval Workflow is a single-step approve/reject rather than a multi-tier workflow, since the app currently has one hardcoded "Owner" user rather than real multi-user authentication.

## Loyalty Programme (IMC-SRS-008) — a real Points Engine, not a hardcoded rule

- **The points calculation used to be a hardcoded constant** sitting inline in the Sales checkout code (1 point per 1,000 UGX, not configurable). That's gone — replaced with `loyaltyService.ts`, a proper Points Engine with editable settings (earn rate, redemption value per point, minimum redemption, expiry days).
- **"Audit every loyalty transaction" is enforced structurally, not just followed as a guideline.** Every points change — earned, redeemed, reversed, expired, or manually adjusted — writes a permanent `LoyaltyTransaction` record. `Customer.loyaltyPoints` itself can only ever be changed by one function (`adjustCustomerLoyaltyPoints`), and that function is only ever called from inside `loyaltyService`, so the balance and the transaction log behind it can never drift apart.
- **A proactive fix, not a reactive one:** while wiring this up, I found the old code had two different places capable of writing to `Customer.loyaltyPoints` — a leftover from before this module existed. I consolidated that down to one, the same category of bug (double-writes to a single field from two code paths) that was caught and fixed for stock levels earlier in this project. Here it was caught by design review before it ever caused a visible bug, not by a failing test.
- **"Refunds reverse points" required building real refund capability that didn't exist before**, not just wiring up an existing one. `salesService.refundSale()` is new: it reverses stock (a genuine audited "refund" stock movement, not a silent edit), reverses the customer's lifetime spend and any credit balance the sale created, and reverses loyalty points via the same Points Engine that awarded them — never a separate calculation that could disagree with the original. Verified with a full round-trip test: sold 2 units for 80,000 UGX (stock 8→6, 80 points earned), refunded the sale, confirmed stock went back to exactly 8, points back to exactly 0, and a "Reversed (refund)" entry appeared in the transaction log.
- **Reward Catalogue is entirely business-defined** — no preset rewards, matching "No hard coded data." Verified: created a reward, redeemed it against a real customer's balance, confirmed the exact point deduction, and confirmed redeeming more points than a customer has is correctly blocked.
- **Points expiry is a deliberate, logged, manually-triggered action**, not a silent background job — there's no server-side cron in this offline-first PWA, so expiring a customer's points without them (or you) knowing would be worse than not expiring them automatically at all.
- **The Customer Profile is the same flagship page every other module reads from** — its Loyalty tab now shows real transaction history (not a placeholder), and its Purchases tab gained the Refund action, both pulling from the exact same services the dedicated Loyalty pages use.

## Invoices (IMC-SRS-009) — a document layer over Sales, not a parallel record

- **An Invoice references a Sale rather than re-implementing it.** The transaction (Sale) and the formal document a customer receives (Invoice) are deliberately different things with independent lifecycles — a sale happens once at checkout; an invoice can be generated later, resent, marked paid separately, or cancelled while the underlying sale stays exactly as it was. This is also why sale references (`INV-xxxxx`, assigned at checkout) and invoice numbers (`IVC-xxxxx`, assigned when formally invoiced) are deliberately different numbering sequences.
- **"Invoices are generated from completed sales only" is enforced, not just true by convention.** `generateInvoice()` rejects anything that isn't a completed sale, and rejects generating a second invoice for a sale that already has one — verified: the "Invoice" action correctly disappears from a sale's row the moment it's been invoiced.
- **Cash/mobile money/card invoices are automatically marked paid** (the money already changed hands at checkout) while **credit invoices start unpaid**, since Credit Management's balance — not the invoice itself — is the real source of truth for whether a credit sale has actually been settled. Verified both paths independently: a cash sale's invoice showed "Paid" immediately; a credit sale's invoice showed "Unpaid" until manually marked paid.
- **"Cancelled invoices remain in audit history"** — cancellation is a status flip (with a mandatory reason), never a deletion. A paid invoice can't be cancelled at all (the correct path is a refund on the underlying sale, which Loyalty's refund work already built).
- **Overdue status is derived, not stored** — an invoice becomes "overdue" purely because its due date has passed while still unpaid, computed fresh every time rather than requiring a background job to keep it accurate.
- **The Customer Profile's Invoices tab is real now**, not the placeholder it was — and the Purchases tab gained a "Generate Invoice" action, tested end-to-end for both a cash and a credit sale.
- **Settings are genuinely configurable** (default due days, footer text, tax-breakdown visibility, business-name visibility) — not hardcoded into the invoice template.
- **Not built in this pass, said plainly:** Email/Share Invoice (the spec lists it as a core feature) wasn't implemented — there's no email-sending infrastructure anywhere in this offline-first PWA yet, so building a convincing "share" action without real delivery behind it would have been decorative. Print is fully functional; sharing isn't.

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

**De-hardcoding + bug fixes (post-IMP-004)** — verified with fresh-session scripted tests:
- ✅ Fresh install has zero pre-populated categories, brands, suppliers, or products — confirmed no "Photo Paper"/"Canon" text anywhere
- ✅ Inventory Dashboard shows the welcoming empty state on a genuinely empty catalogue
- ✅ A product for an entirely unrelated business type (clothing) can be created end-to-end using only the inline "+ Add new category…" flow, starting from zero existing categories
- ✅ Home Dashboard shows zero/empty state on fresh install (no fake "Grace Nakato" sale), then correctly reflects a real POS sale's total and customer once one happens
- ✅ Opening stock bug: created a product with opening stock 5, confirmed it shows exactly 5 (previously showed 10) and exactly one "opening" movement is recorded (previously two)
- ✅ Re-ran the full IMP-003/IMP-004 regression suite (product creation, stock decrement on sale, park/resume, credit sales, customer profile updates) against freshly-created test data to confirm nothing broke

**Credit Management (IMC-SRS-006)** — verified with scripted browser tests exercising the real accounting flow end-to-end:
- ✅ Credit sale blocked with a clear message when no limit has been approved for the customer
- ✅ Full lifecycle: approve a 250,000 UGX limit → sell 200,000 on credit (succeeds) → attempt another 200,000 (blocked — only 50,000 available) → record a 200,000 payment → balance confirmed back to exactly 0
- ✅ Write-off: sold on credit → wrote off the full balance with a reason → balance confirmed 0 and the reason confirmed visible on the customer's Credit tab
- ✅ Credit Dashboard KPIs correctly reflect 0 outstanding after everything above is settled
- ✅ Found and fixed a real bug in the process: the two new credit-blocking errors weren't recognized by the POS's error handler, so a correctly-blocked sale showed a generic message instead of the actual reason — fixed and re-verified

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
