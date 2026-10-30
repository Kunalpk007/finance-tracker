-- 0002_pantry_and_recipes.sql
-- Pantry / inventory model, promoted from the local-only app into real SQL.
-- Same conventions as 0001: workspace-scoped, composite-FK integrity (H11),
-- archive-never-delete on pantry_items, numeric (not float-of-float) quantities.

create table pantry_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  tier text not null check (tier in ('staple','perishable')),
  item_group text,              -- 'grain','vegetable','dairy','fruit','spice','other' etc, informational
  unit text not null,           -- 'kg','g','L','count','pack'
  full_qty numeric not null default 1,   -- what "full stock" looks like, used by reconcile levels
  weekly_usage numeric,          -- staples only: learned/estimated units consumed per week
  shelf_life_days numeric,       -- perishables only
  low_days numeric not null default 7,   -- runway threshold that triggers "low"
  base_qty numeric not null default 0,   -- baseline quantity as of base_at (D57 formula anchor)
  base_at date not null,
  last_reconciled date,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table purchase_lines (
  -- itemises a transaction: this transaction bought this much of this pantry item.
  -- Only counts toward derived stock when its parent transaction is 'confirmed' (D57) --
  -- enforce this in application logic / a view, not a constraint, since status changes over time.
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  transaction_id uuid not null references transactions(id) on delete cascade,
  item_id uuid not null references pantry_items(id),
  qty numeric not null check (qty > 0),
  cost_paise bigint not null check (cost_paise >= 0),
  foreign key (workspace_id, item_id) references pantry_items(workspace_id, id)
);

create index on purchase_lines (workspace_id, item_id);
create index on purchase_lines (transaction_id);

create table reconciles (
  -- D5/D59: the weekly correction that keeps the derived-stock model honest.
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  item_id uuid not null references pantry_items(id),
  date date not null,
  level text not null check (level in ('full','half','low','out')),
  qty_before numeric,
  qty_after numeric,
  implied_weekly numeric,
  actor_membership_id uuid not null references memberships(id),
  foreign key (workspace_id, item_id) references pantry_items(workspace_id, id)
);

create index on reconciles (workspace_id, item_id, date desc);

create table shopping_list (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  item_id uuid references pantry_items(id),   -- null = free-text item not yet a tracked pantry item
  name text not null,
  note text,
  done boolean not null default false,
  added_by_membership_id uuid not null references memberships(id),
  created_at timestamptz not null default now(),
  foreign key (workspace_id, item_id) references pantry_items(workspace_id, id)
);

create index on shopping_list (workspace_id, done);
