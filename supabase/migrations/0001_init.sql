-- 0001_init.sql
-- Core identity, workspace, membership, and books schema.
-- Implements the already-decided architecture faithfully:
--  - every books table is workspace-scoped
--  - composite-FK integrity (H11): child rows must belong to the same workspace as their parent
--  - archive-never-delete pattern for most reference data (archived boolean)
--  - money stored as integer paise, never floats
--  - dates stored as calendar `date`, not timestamps, for transaction.date
--  - H12: a workspace must always retain at least one active admin
--  - H13: audit_log is append-only, no update/delete grants to anyone

-- pgcrypto gives us gen_random_uuid(); Supabase projects generally have this available.
create extension if not exists pgcrypto;

-- ============================================================
-- identity
-- ============================================================

create table users (
  id            uuid primary key,          -- = auth.uid()
  email         text unique,               -- nullable if phone-only
  phone         text unique,
  display_name  text not null,
  created_at    timestamptz not null default now()
);

create table workspaces (
  id            uuid primary key default gen_random_uuid(),
  type          text not null check (type in ('household','business')),
  name          text not null,
  currency      char(3) not null default 'INR',
  settings      jsonb not null default '{}',   -- requireApproval, warnDuplicates, ...
  created_by    uuid not null references users(id),
  created_at    timestamptz not null default now()
);

create table memberships (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  user_id       uuid references users(id),     -- null until an invite is accepted
  role          text not null check (role in ('admin','member','worker')),
  display_name  text not null,                 -- shown in the UI; survives the user leaving
  color         text,
  status        text not null default 'active' check (status in ('active','inactive')),
  joined_at     timestamptz,
  unique (workspace_id, user_id),               -- one membership per person per workspace
  unique (workspace_id, id)                     -- support composite FKs from child tables
);

create table invites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  membership_id uuid references memberships(id),  -- set when pre-creating a worker
  role          text not null,
  code          text not null unique,
  expires_at    timestamptz not null,
  accepted_by   uuid references users(id),
  accepted_at   timestamptz,
  created_by    uuid not null references memberships(id)
);

-- ============================================================
-- books (every row workspace-scoped)
-- ============================================================

create table categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('expense','income')),
  icon text,
  archived boolean not null default false,
  unique (workspace_id, name, kind),
  unique (workspace_id, id)   -- support composite FK from transactions/recurring_rules/budgets
);

create table accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  owner_membership_id uuid references memberships(id),  -- NULL = shared/household account
  type text not null check (type in ('cash','bank','credit_card','upi','wallet','investment')),
  name text not null,
  last4 text,
  cycle_day int check (cycle_day between 1 and 28),
  archived boolean not null default false,
  unique (workspace_id, id)   -- support composite FK from transactions/recurring_rules
);

-- recurring_rules is referenced by transactions.recurring_id, so declare it first.
create table recurring_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null check (type in ('expense','income')),
  amount_paise bigint not null check (amount_paise > 0),
  category_id uuid references categories(id),
  account_id uuid not null references accounts(id),
  day_of_month int not null check (day_of_month between 1 and 28),
  note text,
  active boolean not null default true,
  last_generated text,  -- 'YYYY-MM' of the last month a pending entry was generated for
  membership_id uuid references memberships(id),
  unique (workspace_id, id),
  foreign key (workspace_id, category_id) references categories(workspace_id, id),
  foreign key (workspace_id, account_id) references accounts(workspace_id, id)
);

create table transactions (
  id uuid primary key,                       -- client-generated
  workspace_id uuid not null references workspaces(id) on delete cascade,
  type text not null check (type in ('expense','income','transfer')),
  amount_paise bigint not null check (amount_paise > 0),   -- integers, never floats
  date date not null,                        -- CALENDAR date, not a timestamp
  category_id uuid references categories(id),
  account_id uuid not null references accounts(id),
  to_account_id uuid references accounts(id),
  paid_by_membership_id   uuid not null references memberships(id),
  logged_by_membership_id uuid not null references memberships(id),
  is_personal boolean not null default false,
  vendor text,
  note text,
  photo_path text,
  status text not null default 'confirmed'
    check (status in ('confirmed','submitted','pending','rejected','voided')),
  recurring_id uuid references recurring_rules(id),
  approved_by_membership_id uuid references memberships(id),
  approved_at timestamptz,
  reject_reason text,
  voided_by_membership_id uuid references memberships(id),
  voided_at timestamptz,
  void_reason text,
  was_submitted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version int not null default 1,            -- optimistic concurrency
  deleted_at timestamptz,                    -- soft delete
  check ((type = 'transfer') = (to_account_id is not null)),
  check ((type = 'transfer') = (category_id is null)),
  -- H11 composite-FK integrity: child rows must live in the same workspace as their parents
  foreign key (workspace_id, category_id) references categories(workspace_id, id),
  foreign key (workspace_id, account_id) references accounts(workspace_id, id),
  foreign key (workspace_id, to_account_id) references accounts(workspace_id, id)
);

create index on transactions (workspace_id, date desc);
create index on transactions (workspace_id, status) where status = 'submitted';
create index on transactions (workspace_id, paid_by_membership_id, date desc);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_membership_id uuid not null references memberships(id),
  action text not null,           -- created|edited|deleted|submitted|approved|rejected|voided|exported|invited
  entity_type text not null,
  entity_id uuid,
  detail jsonb,
  ts timestamptz not null default now()
);
-- H13: No UPDATE or DELETE grant on this table to anyone, ever. Append-only.
-- (RLS policies in 0004_rls.sql intentionally define INSERT/SELECT only, no UPDATE/DELETE policy.)

create table budgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  category_id uuid not null references categories(id),
  limit_paise bigint not null check (limit_paise > 0),
  unique (workspace_id, category_id),
  foreign key (workspace_id, category_id) references categories(workspace_id, id)
);

-- ============================================================
-- H12: last-admin guard
-- Blocks any UPDATE/DELETE on memberships that would leave a workspace with
-- zero active admins. In practice memberships are archived (status='inactive')
-- rather than deleted, but we guard DELETE too for defense in depth.
-- ============================================================

create function fn_guard_last_admin() returns trigger as $$
declare
  ws_id uuid;
  remaining_admins int;
begin
  ws_id := coalesce(old.workspace_id, new.workspace_id);

  -- Only need to check when the change could plausibly remove an active admin:
  --   - DELETE of an active admin row
  --   - UPDATE where the row WAS an active admin and after the update it is not
  --     (role changed away from admin, or status changed away from active)
  if tg_op = 'DELETE' then
    if old.role = 'admin' and old.status = 'active' then
      select count(*) into remaining_admins
      from memberships
      where workspace_id = ws_id
        and role = 'admin'
        and status = 'active'
        and id <> old.id;
      if remaining_admins = 0 then
        raise exception 'Cannot remove the last active admin of workspace %', ws_id;
      end if;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'admin' and old.status = 'active'
       and (new.role <> 'admin' or new.status <> 'active') then
      select count(*) into remaining_admins
      from memberships
      where workspace_id = ws_id
        and role = 'admin'
        and status = 'active'
        and id <> old.id;
      if remaining_admins = 0 then
        raise exception 'Cannot leave workspace % with zero active admins', ws_id;
      end if;
    end if;
    return new;
  end if;

  return new;
end;
$$ language plpgsql;

create constraint trigger trg_guard_last_admin_update
  after update on memberships
  for each row execute function fn_guard_last_admin();

create constraint trigger trg_guard_last_admin_delete
  after delete on memberships
  for each row execute function fn_guard_last_admin();

-- ============================================================
-- updated_at auto-touch trigger on transactions
-- ============================================================

create function fn_touch_updated_at() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger trg_transactions_touch_updated_at
  before update on transactions
  for each row execute function fn_touch_updated_at();
