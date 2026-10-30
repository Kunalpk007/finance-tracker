-- 0003_recipes.sql
-- Restaurant recipe / bill-of-materials feature: menu items consume pantry
-- items via a recipe; logging an order deducts stock by (recipe qty x qty sold).
-- This is an exact deduction model, distinct from the household's estimated
-- usage-rate model in 0002. Same conventions: workspace-scoped, composite-FK
-- integrity (H11).

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  price_paise bigint not null check (price_paise >= 0),
  category text,
  active boolean not null default true,
  unique (workspace_id, id)
);

create table recipe_lines (
  -- the BOM: this menu item consumes this much of this pantry item per unit sold
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id) on delete cascade,
  item_id uuid not null references pantry_items(id),
  qty numeric not null check (qty > 0),
  unit text not null,
  foreign key (workspace_id, menu_item_id) references menu_items(workspace_id, id),
  foreign key (workspace_id, item_id) references pantry_items(workspace_id, id)
);

create index on recipe_lines (workspace_id, menu_item_id);

create table order_entries (
  -- a logged sale event: N of this menu item, on this date. Deducts stock via its recipe_lines.
  -- Treat like purchase_lines: only counts once 'confirmed' -- but order_entries in this design
  -- are always direct-entry (no approval workflow for sales), so default status confirmed.
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id),
  qty int not null check (qty > 0),
  date date not null,
  logged_by_membership_id uuid not null references memberships(id),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, menu_item_id) references menu_items(workspace_id, id)
);

create index on order_entries (workspace_id, date desc);
create index on order_entries (workspace_id, menu_item_id, date desc);

create table stock_adjustments (
  -- manual waste/spoilage/shrinkage correction, kept separate from sale-driven deduction
  -- and from the weekly reconcile, so shrinkage is visible rather than silently absorbed.
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  item_id uuid not null references pantry_items(id),
  qty numeric not null,   -- negative = loss
  reason text not null,
  date date not null,
  actor_membership_id uuid not null references memberships(id),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, item_id) references pantry_items(workspace_id, id)
);

create index on stock_adjustments (workspace_id, item_id, date desc);
