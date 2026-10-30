-- 0005_remote_wiring.sql
-- Closes the gaps between the client's data model and 0001-0004 so the app can
-- run against Supabase Auth + RLS:
--  - schema drift: invite status, 'invited' membership status, 'custom' account type, overall budgets
--  - tables the local app has but the schema lacked: trips, trip_members, trip_expenses, goals
--  - auth.users -> public.users profile row (users.id = auth.uid())
--  - SECURITY DEFINER RPCs for the two flows plain RLS can't express safely:
--    create_workspace (the creator is not yet an admin, so RLS would block the
--    first membership insert) and accept_invite (0004 documents why).

-- ============================================================
-- schema drift
-- ============================================================

alter table memberships drop constraint if exists memberships_status_check;
alter table memberships add constraint memberships_status_check check (status in ('active','inactive','invited'));

alter table accounts drop constraint if exists accounts_type_check;
alter table accounts add constraint accounts_type_check check (type in ('cash','bank','credit_card','upi','wallet','investment','custom'));

alter table invites add column status text not null default 'pending' check (status in ('pending','accepted','revoked'));

-- null category = overall workspace budget
alter table budgets alter column category_id drop not null;

-- ============================================================
-- trips / events and savings goals (previously local-only)
-- ============================================================

create table trips (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name text not null,
  kind text not null default 'trip' check (kind in ('trip','festival','other')),
  start_date date,
  end_date date,
  status text not null default 'active' check (status in ('active','closed')),
  created_by_membership_id uuid references memberships(id),
  created_at timestamptz not null default now()
);

create table trip_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  color text
);

create table trip_expenses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  category text not null,
  amount_paise bigint not null check (amount_paise >= 0),
  date date not null,
  paid_by_trip_member_id uuid not null references trip_members(id) on delete cascade,
  note text,
  created_at timestamptz not null default now()
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  membership_id uuid not null references memberships(id),
  name text not null,
  target_paise bigint not null check (target_paise >= 0),
  saved_paise bigint not null default 0 check (saved_paise >= 0),
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

-- Same visibility as the other cost/books data: admin + member, never worker.
do $$
declare t text;
begin
  foreach t in array array['trips','trip_members','trip_expenses','goals'] loop
    execute format('alter table %I enable row level security', t);
    execute format($p$
      create policy %I on %I for all
        using (exists (select 1 from fn_my_membership(%I.workspace_id) fm where fm.role in ('admin','member')))
        with check (exists (select 1 from fn_my_membership(%I.workspace_id) fm where fm.role in ('admin','member')))
    $p$, t || '_admin_member', t, t, t);
  end loop;
end $$;

-- ============================================================
-- auth.users -> public.users
-- ============================================================

create function fn_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function fn_handle_new_user();

-- accounts created before this migration
insert into public.users (id, email, display_name)
select id, email, coalesce(nullif(raw_user_meta_data->>'display_name', ''), split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

-- ============================================================
-- create_workspace(name, type) -> workspace id
-- ============================================================

create function create_workspace(p_name text, p_type text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_wid uuid;
  v_name text;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_type not in ('household','business') then raise exception 'Unknown workspace type'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Give the workspace a name'; end if;

  select display_name into v_name from users where id = v_uid;

  insert into workspaces (type, name, created_by, settings)
  values (p_type, btrim(p_name), v_uid,
          jsonb_build_object('requireApproval', true, 'warnDuplicates', true, 'gstEnabled', p_type = 'business'))
  returning id into v_wid;

  insert into memberships (workspace_id, user_id, role, display_name, color, status, joined_at)
  values (v_wid, v_uid, 'admin', coalesce(v_name, 'Me'), '#3b5bdb', 'active', now());

  if p_type = 'business' then
    insert into categories (workspace_id, name, icon, kind)
    select v_wid, n, i, k from (values
      ('Materials','📦','expense'), ('Wages','👷','expense'), ('Fuel','⛽','expense'), ('Repairs','🔧','expense'),
      ('Rent','🏠','expense'), ('Utilities','💡','expense'), ('Other','•','expense'),
      ('Sales','🧾','income'), ('Other Income','•','income')
    ) as c(n, i, k);
  else
    insert into categories (workspace_id, name, icon, kind)
    select v_wid, n, i, k from (values
      ('Groceries','🧄','expense'), ('Food & Dining','🍽','expense'), ('Transport','🚗','expense'), ('Utilities','💡','expense'),
      ('Rent','🏠','expense'), ('Health','⚕','expense'), ('Shopping','🛍','expense'), ('Entertainment','🎬','expense'),
      ('Bills & Subs','📅','expense'), ('Education','📚','expense'), ('Household','🧹','expense'), ('Other','•','expense'),
      ('Salary','💰','income'), ('Dividends','📈','income'), ('Interest','🏦','income'), ('Rental','🔑','income'),
      ('Freelance','💼','income'), ('Gift','🎁','income'), ('Other Income','•','income')
    ) as c(n, i, k);
  end if;

  insert into accounts (workspace_id, type, name, last4) values (v_wid, 'cash', 'Cash', '');

  return v_wid;
end;
$$;

-- ============================================================
-- accept_invite(code) -> workspace id
-- ============================================================

create function accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_inv invites%rowtype;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;

  select * into v_inv from invites where upper(code) = upper(btrim(p_code)) for update;
  if not found then raise exception 'No invite matches that code'; end if;
  if v_inv.status = 'accepted' or v_inv.accepted_at is not null then raise exception 'That code has already been used'; end if;
  if v_inv.status = 'revoked' then raise exception 'That invite was cancelled'; end if;
  if v_inv.expires_at < now() then raise exception 'That code has expired — ask for a new one'; end if;
  if exists (select 1 from memberships where workspace_id = v_inv.workspace_id and user_id = v_uid and status <> 'inactive') then
    raise exception 'You are already in that workspace';
  end if;

  update memberships
  set user_id = v_uid,
      status = 'active',
      joined_at = now(),
      display_name = case when display_name like 'Invited%' then (select display_name from users where id = v_uid) else display_name end
  where id = v_inv.membership_id and workspace_id = v_inv.workspace_id and user_id is null;
  if not found then raise exception 'That invite is no longer valid'; end if;

  update invites set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_inv.id;

  return v_inv.workspace_id;
end;
$$;

-- RPCs are for signed-in users only.
revoke execute on function create_workspace(text, text) from public, anon;
revoke execute on function accept_invite(text) from public, anon;
grant execute on function create_workspace(text, text) to authenticated;
grant execute on function accept_invite(text) to authenticated;
