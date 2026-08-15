# ImageCare ERP - Database Migrations

Version-controlled record of all schema changes.
Every schema change must be recorded here before deployment.

---

## Stage 1 Migrations

| File | Version | Description | Status |
|---|---|---|---|
| `0001_stage1_foundation.sql` | IMC-STAGE-1-v1.0 | Foundation identity and access tables | Deploy to Supabase |

---

## 0001_stage1_foundation.sql

**Tables created (IF NOT EXISTS - safe to run on existing DB):**

- `imagecare.businesses` - root multi-tenancy boundary
- `imagecare.branches` - unlimited branches per business
- `imagecare.users` - staff with explicit `is_owner` field and display-only `role`
- `imagecare.permission_groups` - owner-managed collections (not fixed roles)
- `imagecare.group_permissions` - module/action grants per group
- `imagecare.permission_group_members` - user-to-group assignments
- `imagecare.user_permissions` - direct per-user permission grants
- `imagecare.user_branch_access` - explicit branch access grants

**Functions created:**

- `imagecare.fn_current_user_id()` - get user ID for current session
- `imagecare.fn_current_business_id()` - get business ID for current session
- `imagecare.fn_is_business_owner(business_id)` - check if current user is owner
- `imagecare.fn_can_access_branch(branch_id)` - check branch authorization
- `imagecare.fn_get_user_context(business_id)` - load full permission context

**RLS policies:**

- `businesses`: read own business; owner can update
- `branches`: read own business branches; owner can create/update
- `users`: read own business users; owner can create/update; self-update allowed
- `permission_groups`: read own business groups; owner can create/modify/delete
- `group_permissions`: read own business; owner can manage
- `permission_group_members`: read own business; owner can assign/remove
- `user_permissions`: owner can grant/revoke; users can read own
- `user_branch_access`: owner can grant/revoke; users can read own

**Permission architecture:**

`users.is_owner` is an explicit BOOLEAN column. It is:
- Set at provisioning via `provision_admin_user()`
- Never derived from counting or combining permissions
- The single source of truth for ownership authorization
- Checked by `fn_is_business_owner()` which gates all permission management

`users.role` is a display label. It is:
- Returned in the user context for UI display only
- Never checked by any RLS policy
- Never checked by `fn_get_user_context` for authorization
- Assigned by the owner as a human-readable position name

Permission groups are owner-managed collections. They are:
- Created and named by the owner (e.g. "Morning Team", "Branch Supervisors")
- Not system-defined roles (no hardcoded "Admin", "Manager", "Cashier")
- Applied by assigning users via `permission_group_members`
- Combinable: a user in multiple groups gets the union of permissions

Direct user permissions (`user_permissions`) override or supplement groups:
- The most permissive value wins across all sources
- Owner grants these to individual users for fine-grained control

---

## Deployment Instructions

Run `0001_stage1_foundation.sql` in Supabase SQL Editor:

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Open `database/migrations/0001_stage1_foundation.sql`
4. Paste content and run
5. Verify: all `CREATE TABLE IF NOT EXISTS` statements succeed
6. Verify: all `CREATE POLICY` statements succeed
7. Run health check: `SELECT * FROM imagecare.fn_health_check();`

This migration is idempotent - safe to run against the existing deployed schema.

---

## Note on Existing Deployment

The imagecare schema was deployed via IMC-DB-001 through IMC-DB-008 before
Stage 1 began. Those packs already created these tables and basic RLS.
Migration `0001_stage1_foundation.sql` adds:
- The `is_owner` column (if not already present from DB-002)
- The `user_permissions` table (direct grants)
- The `fn_get_user_context` function with explicit `is_owner` in result
- Corrected RLS policies that use `fn_is_business_owner()` consistently

---

*ImageCare ERP - Stage 1 Database Migrations*

---

## 0002_stage1_branch_authorization.sql

**Version:** IMC-STAGE-1-v1.1
**Depends on:** 0001_stage1_foundation.sql

**Changes:**

1. **branches SELECT RLS** — replaced the too-broad policy:
   - Before: `business_id = fn_current_business_id()` (all branches readable)
   - After: `business_id = fn_current_business_id() AND fn_can_access_branch(id)`
   - Effect: database enforces branch visibility. Users only see branches they are authorized for. Frontend filtering is not relied upon for security.

2. **fn_get_user_context - branches** — rebuilt to include all three authorization sources:
   - (a) Home branch (`users.branch_id`) — always included if set
   - (b) Explicit `user_branch_access` grants — carries the `can_transact` flag
   - (c) All active business branches for owners (`is_owner = TRUE`)
   - De-duplicated by `branch_id`. Explicit grant `can_transact` value takes precedence over home-branch default.

3. **fn_can_access_branch** — reproduced from 0001 (already correct) and ensures it is current before branch RLS uses it.

**Authorization sources for branch access:**

| Source | Who it applies to | can_transact |
|---|---|---|
| `users.branch_id` (home branch) | All users with a home branch | TRUE (default) |
| `user_branch_access` row | Users explicitly granted by owner | Set by owner |
| `is_owner = TRUE` | Business owner only | TRUE |

`role` is never checked for branch access.

**Deployment:** Run after 0001_stage1_foundation.sql in Supabase SQL Editor.

---

## Stage 2 Migrations (0003-0018)

All Stage 2 migrations are included in the Stage 3 project. They must be
deployed in order, after 0001 and 0002, before deploying 0019.

| File | Version | Description |
|---|---|---|
| `0003_stage2_extensions_and_enums.sql` | IMC-STAGE-2-v1.0 | pg_trgm, pgcrypto, 8 shared ENUM types |
| `0004_stage2_master_data.sql` | IMC-STAGE-2-v1.0 | settings, units, product_categories, products |
| `0005_stage2_parties.sql` | IMC-STAGE-2-v1.0 | customers, suppliers |
| `0006_stage2_inventory.sql` | IMC-STAGE-2-v1.0 | inventory_movements, vw_stock_summary |
| `0007_stage2_transactions.sql` | IMC-STAGE-2-v1.0 | sales, sale_items, purchases, purchase_items |
| `0008_stage2_credit_invoices_bills.sql` | IMC-STAGE-2-v1.0 | credit_accounts, credit_transactions, invoices, invoice_items, bills; fn_update_credit_balance trigger |
| `0009_stage2_financial.sql` | IMC-STAGE-2-v1.0 | expenses, payroll, bank_accounts, cash_transactions |
| `0010_stage2_accounting.sql` | IMC-STAGE-2-v1.0 | journal_entries, journal_lines, vw_account_balances; fn_guard_posted_journal immutability trigger |
| `0011_stage2_supporting_domains.sql` | IMC-STAGE-2-v1.0 | sales_targets, loyalty_accounts, loyalty_transactions, audit_logs, sync_queue, notifications, storage_metadata; fn_audit_trigger |
| `0012_stage2_accounts_and_composite_uniques.sql` | IMC-STAGE-2-v1.1 | accounts (Chart of Accounts) table; composite UNIQUE constraints on all parent tables |
| `0013_stage2_cross_business_fk_integrity.sql` | IMC-STAGE-2-v1.1 | Composite FK constraints; fn_check_cross_business_refs trigger on 6 tables |
| `0014_stage2_journal_line_account_integrity.sql` | IMC-STAGE-2-v1.1 | journal_lines.account_id FK; fn_check_journal_line_integrity trigger |
| `0015_stage2_credit_balance_correction.sql` | IMC-STAGE-2-v1.1 | fn_update_credit_balance corrected: rejects overpayment explicitly (no silent clamp) |
| `0016_stage2_account_hierarchy_integrity.sql` | IMC-STAGE-2-v1.2 | accounts parent_account_id composite FK; fn_check_account_hierarchy_integrity trigger |
| `0017_stage2_branch_business_fk_integrity.sql` | IMC-STAGE-2-v1.2 | Composite FK (business_id, branch_id) -> branches on all 22 branch-scoped tables |
| `0018_stage2_delete_action_and_searchpath_corrections.sql` | IMC-STAGE-2-v1.3 | All nullable-branch FKs corrected to ON DELETE RESTRICT; all SECURITY DEFINER functions hardened with SET search_path = imagecare, pg_catalog |

### Stage 2 key DB objects

**29 tables** across all ERP domains.

**2 views:**
- `vw_stock_summary` - derives stock_on_hand, stock_value, stock_status per product per branch from inventory_movements. Never reads a stored balance column. This is the single authoritative stock calculation.
- `vw_account_balances` - aggregates posted journal lines per account per period. Only includes status='posted' entries.

**Security functions (all with SET search_path = imagecare, pg_catalog):**
- `fn_update_credit_balance()` - rejects overpayment with IMC-CREDIT exception
- `fn_audit_trigger()` - records who/what/when on sensitive tables
- `fn_check_cross_business_refs()` - prevents cross-business FK violations on nullable references
- `fn_check_journal_line_integrity()` - validates business_id and account_code match
- `fn_check_account_hierarchy_integrity()` - prevents cross-business parent accounts

**Integrity constraints:**
- Composite FKs: (business_id, sale_id), (business_id, product_id), (business_id, branch_id), (business_id, account_id) on all child tables
- All composite FKs for branch references use ON DELETE RESTRICT
- Journal entry balance enforced: ABS(total_debit - total_credit) < 0.01 on posted entries
- Journal entry immutability: tg_imc_guard_posted_journal blocks UPDATE on posted rows

**RLS:** All 29 tables have RLS enabled. All policies use fn_current_business_id(). Branch-scoped tables use fn_can_access_branch(). Owner-only tables use fn_is_business_owner().

---

## Stage 3 Migration (0019)

| File | Version | Description |
|---|---|---|
| `0019_stage3_engine_support.sql` | IMC-STAGE-3-v1.0 | Engine support: fn_seed_chart_of_accounts, fn_business_engine_health_check, vw_engine_account_summary |

### 0019_stage3_engine_support.sql

**Depends on:** 0018_stage2_delete_action_and_searchpath_corrections.sql

**Functions created:**

- `fn_seed_chart_of_accounts(p_business_id UUID)` - Seeds the standard Uganda Chart of Accounts for a business. Inserts 18 accounts covering cash, receivables, inventory, payables, equity, revenue, COGS, and expenses. Idempotent via ON CONFLICT DO NOTHING. The accounting engine resolves account codes at runtime using these records. Required account codes: 1100 (Cash in Hand), 1120 (Mobile Money), 1130 (Bank), 1200 (Receivables), 1300 (Inventory), 2000 (Payables), 4000 (Revenue), 5000 (COGS), 6000 (Expenses). Security: SECURITY DEFINER, SET search_path = imagecare, pg_catalog. Called once during business onboarding.

- `fn_business_engine_health_check(p_business_id UUID)` - Returns a pass/fail/warn table for all Stage 3 engine prerequisites: business active, branch exists, owner exists, accounts seeded, vw_stock_summary accessible, journal immutability trigger active, credit balance trigger active, cross-business FK triggers active, audit trigger active, RLS enabled on key tables. For deployment validation only.

**Views created:**

- `vw_engine_account_summary` - Joins vw_account_balances (posted entries only) with the accounts table. Adds account_id, parent_account_id, is_system, account_active columns. Used by the Stage 3 reporting engine. Inherits the posted-only filter from vw_account_balances.

### Accounting architecture enforced at DB level

The Stage 3 engines enforce the following distinctions architecturally:

**Revenue != Profit:** Revenue is Cr 4000 Sales Revenue. Gross Profit = Revenue - COGS. Net Profit = Gross Profit - Operating Expenses. These are always calculated from journal lines, never equated.

**Profit != Cash:** Cash in Hand derives from cash_transactions (transaction_type IN ('cash_in','cash_out')). It is never computed from revenue minus expenses. A credit sale posts Dr Receivable 1200 / Cr Revenue 4000 - it does NOT create a cash_transaction.

**Cash != Inventory:** Inventory value is derived from inventory_movements (SUM of unit_cost * quantity). It is never stored on the products table. Inventory appears in the balance sheet via Dr 1300 Inventory / Cr 2000 Payable on purchase receipt, and Dr 5000 COGS / Cr 1300 Inventory on sale posting.

**COGS affects profit, never cash:** When a sale is posted, the engine creates TWO journal entry pairs: (1) Dr Cash/Receivable / Cr Revenue for the sale amount, and (2) Dr COGS 5000 / Cr Inventory 1300 for the cost. The COGS pair affects the Income Statement (reducing Gross Profit) but never touches the cash account (1100/1120/1130) or the cash_transactions table.

### Multi-business isolation

Enforced at three independent layers:
1. PostgreSQL RLS on every table: `WHERE business_id = fn_current_business_id()`
2. Composite FK constraints: (business_id, child_id) REFERENCES parent(business_id, id) - prevents cross-business references at insert/update time, independently of RLS
3. SECURITY DEFINER check triggers: fn_check_cross_business_refs on nullable FK columns where composite FK cannot fire

### Branch authorization

Enforced at two independent layers:
1. PostgreSQL RLS on branch-scoped tables: `AND fn_can_access_branch(branch_id)`
2. Composite FK constraints: (business_id, branch_id) REFERENCES branches(business_id, id) with ON DELETE RESTRICT on all 22 branch-scoped tables

### Owner-controlled flexible permissions

- is_owner is an explicit NOT NULL BOOLEAN on users table - never derived
- Permission groups are owner-named collections (no fixed system roles)
- Direct user permissions via user_permissions table for fine-grained control
- Most-permissive-wins across all sources via fn_get_user_context()
- RLS: permission management tables (user_permissions, group_permissions) gated by fn_is_business_owner()

### Auditability

- fn_audit_trigger attached to: users, user_permissions, sales, journal_entries, payroll
- Records: table_name, record_id, action, previous_value JSONB, new_value JSONB, changed_fields[], user_id, business_id, branch_id, created_at
- Audit logs are immutable: no UPDATE or DELETE RLS policy on audit_logs
- Only owners can SELECT audit_logs (fn_is_business_owner() gated RLS)
- Journal entry immutability: tg_imc_guard_posted_journal raises IMC-IMMUTABLE exception on any UPDATE to a posted entry

---

## Complete Deployment Order

Run all migrations in Supabase SQL Editor in this exact order:

```
0001_stage1_foundation.sql
0002_stage1_branch_authorization.sql
0003_stage2_extensions_and_enums.sql
0004_stage2_master_data.sql
0005_stage2_parties.sql
0006_stage2_inventory.sql
0007_stage2_transactions.sql
0008_stage2_credit_invoices_bills.sql
0009_stage2_financial.sql
0010_stage2_accounting.sql
0011_stage2_supporting_domains.sql
0012_stage2_accounts_and_composite_uniques.sql
0013_stage2_cross_business_fk_integrity.sql
0014_stage2_journal_line_account_integrity.sql
0015_stage2_credit_balance_correction.sql
0016_stage2_account_hierarchy_integrity.sql
0017_stage2_branch_business_fk_integrity.sql
0018_stage2_delete_action_and_searchpath_corrections.sql
0019_stage3_engine_support.sql
```

All migrations are idempotent (CREATE IF NOT EXISTS, DROP POLICY IF EXISTS, ON CONFLICT DO NOTHING).

After deployment, for each business run:
```sql
SELECT * FROM imagecare.fn_seed_chart_of_accounts('<business_uuid>');
SELECT * FROM imagecare.fn_business_engine_health_check('<business_uuid>');
```

*ImageCare ERP - Stage 3 Database Migrations*
