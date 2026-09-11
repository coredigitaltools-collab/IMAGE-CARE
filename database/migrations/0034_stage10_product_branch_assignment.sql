-- ============================================================
-- 0034_stage10_product_branch_assignment.sql
-- Product-to-branch assignment.
--
-- Applied live to the Supabase project on 2026-09-06 via
-- mcp__Supabase__apply_migration (name: product_branch_assignment).
-- This file is the version-controlled record of that change - see
-- MIGRATIONS.md.
--
-- Lets a business restrict which branches actually carry which products,
-- so a branch-scoped product list (POS product picker/grid) can show only
-- what that branch carries, instead of every business-wide product
-- appearing everywhere as a disabled/out-of-stock tile.
--
-- products stays business-wide (unchanged) - this is a many-to-many join,
-- not a move of products onto branches, so no product is duplicated and
-- no existing product row changes.
-- ============================================================

create table if not exists imagecare.product_branches (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references imagecare.businesses(id) on delete cascade,
  product_id  uuid not null references imagecare.products(id) on delete cascade,
  branch_id   uuid not null references imagecare.branches(id) on delete cascade,
  created_at  timestamptz not null default now(),
  created_by  uuid references imagecare.users(id),
  unique (product_id, branch_id)
);

create index if not exists idx_product_branches_business on imagecare.product_branches(business_id);
create index if not exists idx_product_branches_product  on imagecare.product_branches(product_id);
create index if not exists idx_product_branches_branch   on imagecare.product_branches(branch_id);

alter table imagecare.product_branches enable row level security;

-- Same shape as rls_s2_products_select/rls_s2_products_modify on
-- imagecare.products: tenant isolation only at the RLS layer (business_id
-- match), feature-level permission (who may edit a product's branches) is
-- enforced in the application layer via canDo(), matching how product
-- edits are already gated today.
drop policy if exists rls_product_branches_select on imagecare.product_branches;
create policy rls_product_branches_select on imagecare.product_branches
  for select using (business_id = imagecare.fn_current_business_id());

drop policy if exists rls_product_branches_modify on imagecare.product_branches;
create policy rls_product_branches_modify on imagecare.product_branches
  for all using (business_id = imagecare.fn_current_business_id());

-- Backfill so nothing regresses for data that already exists: assign every
-- current product to the branch(es) where it actually has real stock
-- movement history today (opening stock, purchases, sales, adjustments,
-- etc. all write inventory_movements.branch_id).
insert into imagecare.product_branches (business_id, product_id, branch_id)
select distinct p.business_id, p.id, im.branch_id
from imagecare.products p
join imagecare.inventory_movements im on im.product_id = p.id
where p.deleted_at is null
on conflict (product_id, branch_id) do nothing;

-- A product with literally no movement history anywhere yet (never
-- stocked at all, e.g. just created) falls back to every active branch of
-- its business, so a never-touched product doesn't silently vanish from
-- every branch's till the moment this ships.
insert into imagecare.product_branches (business_id, product_id, branch_id)
select p.business_id, p.id, b.id
from imagecare.products p
join imagecare.branches b on b.business_id = p.business_id and b.is_active
where p.deleted_at is null
  and not exists (
    select 1 from imagecare.product_branches pb where pb.product_id = p.id
  )
on conflict (product_id, branch_id) do nothing;
