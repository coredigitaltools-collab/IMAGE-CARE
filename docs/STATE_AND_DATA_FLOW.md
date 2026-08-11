# IMC-BLD-005 - State & Data Flow Architecture

Defines how data moves through ImageCare ERP and who owns each type of state.

---

## State Categories and Owners

| State Category | Owner | Technology | Examples |
|---|---|---|---|
| Authentication State | Supabase Auth + AppContext | Session storage | User ID, tokens, session expiry |
| Authorization State | AppContext (loaded from DB) | React context | Permissions map, branch access list |
| Application State | AppContext | React context | Active business, active branch, nav state |
| Server State | React Query | In-memory cache | Sales list, stock levels, KPIs |
| Local Offline State | IndexedDB (localStore) | Persistent | Pending transactions, cached master data |
| UI State | Component useState | Component memory | Form values, filter selections, dialogs |
| Error State | Per-service / per-form | Component state | Validation errors, service errors |

---

## State Ownership Rules

1. **Frontend state is never authoritative for financial or inventory truth.**
2. **PostgreSQL is the authoritative store for all business data.**
3. **React Query cache is a read-through cache — never the source of truth.**
4. **IndexedDB holds pending operations, not confirmed business records.**
5. **Component state holds only short-lived UI interaction state.**
6. **No component maintains its own copy of the same financial value.**

---

## Standard Online Data Flow

```
User Action
    │
    ▼
Frontend Validation        ← useFormState rules
    │
    ▼
Permission Check           ← usePermission hook
    │
    ▼
Service Call               ← src/services/
    │
    ▼
Business Engine            ← Supabase RPC (engine_post_sale etc.)
    │
    ├── Inventory Engine   ← inventory_movements
    ├── Accounting Engine  ← journal_entries + journal_lines
    ├── Cash Engine        ← cash_transactions
    ├── Credit Engine      ← customer credit_balance
    └── Audit Engine       ← audit_logs
    │
    ▼
Database Transaction       ← PostgreSQL COMMIT / ROLLBACK
    │
    ▼
ServiceResponse<T>         ← success + data OR error
    │
    ▼
Cache Invalidation         ← invalidateAfter.sale() etc.
    │
    ▼
React Query Refetch        ← stale queries refresh
    │
    ▼
UI Update                  ← components re-render with new data
```

---

## Standard Offline Data Flow

```
User Action (offline)
    │
    ▼
Cached Permission Check    ← ctx.permissions from sessionStorage
    │
    ▼
Local Validation           ← useFormState + cached master data
    │
    ▼
Write to IndexedDB         ← localStore.set('offline_sales', ...)
    │
    ▼
Enqueue Sync Operation     ← sync_queue entry in IndexedDB
    │
    ▼
UI marks as PENDING        ← OfflineBanner shows pending count
    │
    ▼
[User continues working]
    │
    ▼
Network Restored
    │
    ▼
runSyncSession()
    ├── pushQueuedOperations()  ← fn_process_sync_batch (server)
    │       ├── engine_post_sale()     ← same Business Engine
    │       ├── Idempotency check
    │       └── Permission revalidation
    │
    └── pullChanges(cursor)            ← fn_get_changes_since (server)
            └── Apply server changes to local cache
    │
    ▼
UI marks as SYNCED         ← React Query invalidated
```

---

## Cross-Module Data Flow Effects

| Transaction | Inventory | Accounting | Cash/Bank | Credit | Reporting |
|---|---|---|---|---|---|
| Sale (cash) | Stock out | Dr Cash / Cr Revenue + COGS | Cash in | - | Revenue, Gross Profit |
| Sale (credit) | Stock out | Dr Receivable / Cr Revenue + COGS | - | Balance up | Revenue, Credit |
| Purchase (cash) | Stock in | Dr Inventory / Cr Cash | Cash out | - | COGS base |
| Purchase (credit) | Stock in | Dr Inventory / Cr Payable | - | - | Payable |
| Credit repayment | - | Dr Cash / Cr Receivable | Cash in | Balance down | Cash, Credit |
| Expense (cash) | - | Dr Expense / Cr Cash | Cash out | - | Net Profit |
| Payroll | - | Dr Salary / Cr Cash + PAYE + NSSF | Cash out | - | Net Profit |
| Stock adjustment in | Stock in | Dr Inventory | - | - | Stock value |
| Stock adjustment out | Stock out | Cr Inventory | - | - | Stock value |

Every downstream effect originates from the shared Business Engine, never from frontend logic.

---

## Dashboard KPI Data Flow

```
useDashboardKPIs hook
    │
    ▼
getDashboardKPIs() service
    │
    ▼
fn_get_dashboard_kpis() Supabase RPC
    │
    ├── imagecare.sales (confirmed, in period)
    ├── imagecare.sale_items (COGS from unit_cost snapshots)
    ├── imagecare.expenses (confirmed, in period)
    ├── imagecare.payroll (paid, in period)
    ├── imagecare.cash_transactions (all time for cash position)
    └── imagecare.customers (credit_balance > 0)
    │
    ▼
Returns: { revenue, cogs, gross_profit, expenses, payroll,
           net_profit, cash_in_hand, credit_outstanding }
    │
    ▼
React Query cache (staleTime: 60s)
    │
    ▼
Dashboard renders KPI cards
```

Dashboard NEVER calculates these values. All values come from `fn_get_dashboard_kpis`.

---

## Cache Invalidation Map

After each mutation, these cache keys are invalidated:

| Mutation | Invalidated Keys |
|---|---|
| `createSale` / `cancelSale` | sales, inventory, stock summary, dashboard KPIs, sales reports, cash balance |
| `createPurchase` | purchases, inventory, stock summary, dashboard KPIs, cash balance, suppliers |
| `recordCreditRepayment` | outstanding credit, customer credit, customers, cash balance, dashboard KPIs |
| `createExpense` | expenses, cash balance, dashboard KPIs, expense reports |
| `processPayroll` | payroll, cash balance, dashboard KPIs |
| `createStockAdjustment` | inventory, stock summary, dashboard KPIs, movements |
| `updateProduct` | products, product detail, inventory |
| `syncComplete` | everything under business_id |

---

## Mutation State Flow

```
User submits form
    │
    ▼
useMutationGuard.guard()   ← prevents duplicate submission
    │
    ▼
form.setSubmitting(true)   ← disables submit button
    │
    ▼
Service call with idempotency_key
    │
    ├── SUCCESS ──────────────────────────────┐
    │                                          ▼
    │                                   invalidateAfter.*()
    │                                          │
    │                                          ▼
    │                                   form.setSuccess()
    │                                          │
    │                                          ▼
    │                                   Show confirmation toast
    │
    └── ERROR ────────────────────────────────┐
                                              ▼
                              Map error code to user message
                                              │
                                              ▼
                              form.setSubmitError(message, code)
                                              │
                                              ▼
                              Show error (inline or toast)
```

---

## State Management Files

| File | Purpose |
|---|---|
| `src/lib/queryClient.ts` | React Query client, cache keys, invalidation helpers |
| `src/hooks/shared/useServerState.ts` | Typed React Query hooks for all entities |
| `src/hooks/shared/useFormState.ts` | Form state, validation, unsaved changes guard |
| `src/hooks/shared/useServiceCall.ts` | (BLD-004) Raw service call with loading/error state |
| `src/context/AppContext.tsx` | (BLD-004) Auth + user context + branch state |

---

## Rules Summary

1. Server state → React Query (`useQuery`, `useMutation`)
2. Form state → `useFormState`
3. Loading/error → `useServiceCall` or React Query state
4. Auth/user → `AppContext`
5. Offline → `localStore` (IndexedDB)
6. Never: financial calculations in components
7. Never: duplicate copies of the same server value
8. Always: invalidate React Query cache after mutations

---

*ImageCare ERP - IMC-BLD-005 v1.0*
