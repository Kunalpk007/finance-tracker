-- 0004_rls.sql
-- Row Level Security for every table, mirroring the decided permission matrix:
--
-- | Capability                                   | admin | member          | worker |
-- |-----------------------------------------------|:-----:|:---------------:|:------:|
-- | Log an entry that counts immediately           | yes   | yes (household) | no     |
-- | Submit a claim for approval                    | -     | yes (business)  | yes    |
-- | Approve/reject claims                          | yes   | no              | no     |
-- | See workspace dashboard/totals                 | yes   | yes             | own rows only |
-- | Edit/delete someone else's entry               | yes   | no              | no     |
-- | Manage categories/accounts/budgets/recipes/menu| yes   | no              | no     |
-- | Invite/deactivate/change roles                 | yes   | no              | no     |
-- | Export                                         | whole workspace | own rows | own rows |
-- | See audit log                                  | yes   | no              | no     |
--
-- Every policy below is commented with which matrix row (or judgment call) it implements.

-- ============================================================
-- helper functions
--
-- These are SECURITY DEFINER so they can read `memberships`/`workspaces`
-- without triggering RLS recursion on those same tables (a policy on
-- `memberships` that queried `memberships` under RLS would recurse).
-- search_path is pinned to prevent search-path hijacking in SECURITY DEFINER
-- functions.
-- ============================================================

create function fn_my_membership(p_workspace_id uuid)
returns table(membership_id uuid, role text)
language sql stable security definer set search_path = public as $$
  select id, role
  from memberships
  where workspace_id = p_workspace_id
    and user_id = auth.uid()
    and status = 'active';
$$;

create function fn_workspace_type(p_workspace_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select type from workspaces where id = p_workspace_id;
$$;

-- ============================================================
-- users
-- Not workspace-scoped: a user may only see/manage their own profile row.
-- (memberships.display_name is the copy shown across a workspace, so other
-- members never need to read another user's `users` row.)
-- ============================================================

alter table users enable row level security;

create policy users_select_own on users for select
  using (id = auth.uid());

create policy users_insert_own on users for insert
  with check (id = auth.uid());

create policy users_update_own on users for update
  using (id = auth.uid())
  with check (id = auth.uid());
-- No delete policy: user rows are never deleted via the client (H-style archive-never-delete).

-- ============================================================
-- workspaces
-- ============================================================

alter table workspaces enable row level security;

-- Any active member (any role) can read basic workspace metadata (name,
-- currency, settings) -- needed just to use the app at all.
create policy workspaces_select_member on workspaces for select
  using (exists (select 1 from fn_my_membership(workspaces.id)));

-- Any authenticated user can create a workspace; they become its creator
-- (the app then inserts their admin membership in the same transaction).
create policy workspaces_insert_creator on workspaces for insert
  with check (created_by = auth.uid());

-- matrix row: "Manage ... " / admin-only workspace settings changes.
create policy workspaces_update_admin on workspaces for update
  using (exists (select 1 from fn_my_membership(workspaces.id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(workspaces.id) fm where fm.role = 'admin'));
-- No delete policy: workspaces are never deleted through the client.

-- ============================================================
-- memberships
-- ============================================================

alter table memberships enable row level security;

-- matrix row: "See workspace dashboard/totals" -- admin/member see the whole
-- roster; a worker only sees their own membership row.
create policy memberships_select on memberships for select
  using (
    exists (
      select 1 from fn_my_membership(memberships.workspace_id) fm
      where fm.role in ('admin','member') or fm.membership_id = memberships.id
    )
  );

-- matrix row: "Invite/deactivate/change roles" -- admin only creates rows
-- (invites pre-create a worker membership, or an admin adds someone directly).
create policy memberships_insert_admin on memberships for insert
  with check (exists (select 1 from fn_my_membership(memberships.workspace_id) fm where fm.role = 'admin'));

-- matrix row: "Invite/deactivate/change roles" -- admin only. The H12
-- last-admin-standing guard is enforced separately by the constraint trigger
-- in 0001_init.sql, on top of this policy.
create policy memberships_update_admin on memberships for update
  using (exists (select 1 from fn_my_membership(memberships.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(memberships.workspace_id) fm where fm.role = 'admin'));
-- JUDGMENT CALL: no self-accept-invite policy here. Claiming a pre-created
-- worker membership (setting user_id from null to the accepting user) needs
-- to validate an invite code + expiry, which plain row-level RLS can't do
-- safely in one step. That flow should go through a SECURITY DEFINER RPC
-- (e.g. `accept_invite(code text)`) that validates the invite row and then
-- performs the update with elevated privilege -- not a direct client UPDATE
-- against `memberships`. No such RPC is defined in this migration set.
-- No delete policy: memberships are archived (status='inactive'), never deleted.

-- ============================================================
-- invites
-- ============================================================

alter table invites enable row level security;

-- matrix row: "Invite/deactivate/change roles" -- admin only, all verbs.
create policy invites_select_admin on invites for select
  using (exists (select 1 from fn_my_membership(invites.workspace_id) fm where fm.role = 'admin'));

create policy invites_insert_admin on invites for insert
  with check (exists (select 1 from fn_my_membership(invites.workspace_id) fm where fm.role = 'admin'));

create policy invites_update_admin on invites for update
  using (exists (select 1 from fn_my_membership(invites.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(invites.workspace_id) fm where fm.role = 'admin'));

-- JUDGMENT CALL: unlike most other tables, invites are ephemeral records
-- (they carry their own expires_at) rather than audited financial history,
-- so allowing admin delete for cleanup is fine here.
create policy invites_delete_admin on invites for delete
  using (exists (select 1 from fn_my_membership(invites.workspace_id) fm where fm.role = 'admin'));

-- ============================================================
-- categories / accounts
-- Read needed by every role to populate transaction forms; management is
-- admin-only per the matrix.
-- ============================================================

alter table categories enable row level security;

-- matrix row: read is a prerequisite for "Log an entry" (all roles).
create policy categories_select_member on categories for select
  using (exists (select 1 from fn_my_membership(categories.workspace_id)));

-- matrix row: "Manage categories/accounts/budgets/recipes/menu" -- admin only.
create policy categories_insert_admin on categories for insert
  with check (exists (select 1 from fn_my_membership(categories.workspace_id) fm where fm.role = 'admin'));

create policy categories_update_admin on categories for update
  using (exists (select 1 from fn_my_membership(categories.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(categories.workspace_id) fm where fm.role = 'admin'));

create policy categories_delete_admin on categories for delete
  using (exists (select 1 from fn_my_membership(categories.workspace_id) fm where fm.role = 'admin'));

alter table accounts enable row level security;

create policy accounts_select_member on accounts for select
  using (exists (select 1 from fn_my_membership(accounts.workspace_id)));

create policy accounts_insert_admin on accounts for insert
  with check (exists (select 1 from fn_my_membership(accounts.workspace_id) fm where fm.role = 'admin'));

create policy accounts_update_admin on accounts for update
  using (exists (select 1 from fn_my_membership(accounts.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(accounts.workspace_id) fm where fm.role = 'admin'));

create policy accounts_delete_admin on accounts for delete
  using (exists (select 1 from fn_my_membership(accounts.workspace_id) fm where fm.role = 'admin'));

-- ============================================================
-- budgets
-- JUDGMENT CALL: budgets are workspace-wide totals/limits, so treat them
-- like the "See workspace dashboard/totals" row -- readable by admin/member,
-- not by worker (who only ever sees their own rows).
-- ============================================================

alter table budgets enable row level security;

create policy budgets_select_admin_member on budgets for select
  using (exists (select 1 from fn_my_membership(budgets.workspace_id) fm where fm.role in ('admin','member')));

create policy budgets_insert_admin on budgets for insert
  with check (exists (select 1 from fn_my_membership(budgets.workspace_id) fm where fm.role = 'admin'));

create policy budgets_update_admin on budgets for update
  using (exists (select 1 from fn_my_membership(budgets.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(budgets.workspace_id) fm where fm.role = 'admin'));

create policy budgets_delete_admin on budgets for delete
  using (exists (select 1 from fn_my_membership(budgets.workspace_id) fm where fm.role = 'admin'));

-- ============================================================
-- recurring_rules
-- JUDGMENT CALL: recurring rules are financial scheduling config, not
-- explicitly named in the "Manage ..." matrix row but the same kind of
-- setup-only-admin-touches data as budgets/categories/accounts. Read
-- restricted to admin/member (a worker doesn't need to see scheduled
-- recurring income/expense amounts); manage is admin-only.
-- ============================================================

alter table recurring_rules enable row level security;

create policy recurring_rules_select_admin_member on recurring_rules for select
  using (exists (select 1 from fn_my_membership(recurring_rules.workspace_id) fm where fm.role in ('admin','member')));

create policy recurring_rules_insert_admin on recurring_rules for insert
  with check (exists (select 1 from fn_my_membership(recurring_rules.workspace_id) fm where fm.role = 'admin'));

create policy recurring_rules_update_admin on recurring_rules for update
  using (exists (select 1 from fn_my_membership(recurring_rules.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(recurring_rules.workspace_id) fm where fm.role = 'admin'));

create policy recurring_rules_delete_admin on recurring_rules for delete
  using (exists (select 1 from fn_my_membership(recurring_rules.workspace_id) fm where fm.role = 'admin'));

-- ============================================================
-- transactions
-- ============================================================

alter table transactions enable row level security;

-- matrix row: "See workspace dashboard/totals" -- admin/member see everything;
-- worker sees only rows they paid or logged (own rows only).
-- This is the reference shape given in the design doc, expressed via the
-- fn_my_membership() helper instead of an inline join.
create policy tx_select on transactions for select
  using (
    exists (
      select 1 from fn_my_membership(transactions.workspace_id) fm
      where fm.role in ('admin','member')
         or fm.membership_id = transactions.paid_by_membership_id
         or fm.membership_id = transactions.logged_by_membership_id
    )
  );

-- matrix rows: "Log an entry that counts immediately" (admin: always;
-- member: household only) and "Submit a claim for approval" (member:
-- business only; worker: always). The caller must be the logged_by
-- membership (no impersonation), except admin who may log/import on
-- behalf of someone else.
create policy tx_insert_admin on transactions for insert
  with check (exists (select 1 from fn_my_membership(transactions.workspace_id) fm where fm.role = 'admin'));

create policy tx_insert_member_worker on transactions for insert
  with check (
    exists (
      select 1 from fn_my_membership(transactions.workspace_id) fm
      where fm.membership_id = transactions.logged_by_membership_id
        and (
          -- member, household workspace: entry counts immediately
          (fm.role = 'member' and fn_workspace_type(transactions.workspace_id) = 'household'
             and transactions.status = 'confirmed')
          -- member, business workspace: must be submitted for approval
          or (fm.role = 'member' and fn_workspace_type(transactions.workspace_id) = 'business'
             and transactions.status in ('submitted','pending'))
          -- worker: always submits for approval, never logs directly
          or (fm.role = 'worker' and transactions.status in ('submitted','pending'))
        )
    )
  );

-- matrix rows: "Approve/reject claims" (admin only) and "Edit/delete
-- someone else's entry" (admin: yes, others: no).
create policy tx_update_admin on transactions for update
  using (exists (select 1 from fn_my_membership(transactions.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(transactions.workspace_id) fm where fm.role = 'admin'));

-- matrix row: "Edit/delete someone else's entry" -- member/worker may only
-- touch their own rows (paid_by or logged_by = them), never a voided row,
-- and JUDGMENT CALL: cannot self-approve -- approved_by_membership_id must
-- stay null coming out of this policy, and they may only leave a row
-- 'confirmed' if it was already a direct household entry (never flip a
-- submitted/pending business claim to confirmed themselves; only the
-- admin-only policy above can do that).
create policy tx_update_own on transactions for update
  using (
    exists (
      select 1 from fn_my_membership(transactions.workspace_id) fm
      where fm.role in ('member','worker')
        and (fm.membership_id = transactions.paid_by_membership_id
             or fm.membership_id = transactions.logged_by_membership_id)
        and transactions.status <> 'voided'
    )
  )
  with check (
    exists (
      select 1 from fn_my_membership(transactions.workspace_id) fm
      where fm.role in ('member','worker')
        and (fm.membership_id = transactions.paid_by_membership_id
             or fm.membership_id = transactions.logged_by_membership_id)
        and transactions.status <> 'voided'
        and transactions.approved_by_membership_id is null
        and (
          transactions.status <> 'confirmed'
          or fn_workspace_type(transactions.workspace_id) = 'household'
        )
    )
  );

-- matrix row: "Edit/delete someone else's entry" -- admin can delete any row.
create policy tx_delete_admin on transactions for delete
  using (exists (select 1 from fn_my_membership(transactions.workspace_id) fm where fm.role = 'admin'));

-- matrix row: "Edit/delete someone else's entry" -- member/worker delete
-- only their own, non-voided rows (mirrors tx_update_own's using clause).
create policy tx_delete_own on transactions for delete
  using (
    exists (
      select 1 from fn_my_membership(transactions.workspace_id) fm
      where fm.role in ('member','worker')
        and (fm.membership_id = transactions.paid_by_membership_id
             or fm.membership_id = transactions.logged_by_membership_id)
        and transactions.status <> 'voided'
    )
  );

-- ============================================================
-- audit_log
-- H13: append-only. INSERT + SELECT policies only -- deliberately no
-- UPDATE or DELETE policy for any role, so no one (other than a service-role
-- connection that bypasses RLS entirely) can alter or remove audit history.
-- ============================================================

alter table audit_log enable row level security;

-- Any active member may write an audit entry for their own action.
create policy audit_log_insert_self on audit_log for insert
  with check (
    exists (
      select 1 from fn_my_membership(audit_log.workspace_id) fm
      where fm.membership_id = audit_log.actor_membership_id
    )
  );

-- matrix row: "See audit log" -- admin only.
create policy audit_log_select_admin on audit_log for select
  using (exists (select 1 from fn_my_membership(audit_log.workspace_id) fm where fm.role = 'admin'));

-- ============================================================
-- pantry_items
-- D34: "worker sees no business totals" -- a worker in a business workspace
-- gets no read access to pantry_items at all. (Household workspaces don't
-- typically have workers, but the check is written generically: it keys off
-- workspace type, not workspace category, so it only blocks the business
-- case explicitly called out.)
-- ============================================================

alter table pantry_items enable row level security;

create policy pantry_items_select on pantry_items for select
  using (
    exists (
      select 1 from fn_my_membership(pantry_items.workspace_id) fm
      where fm.role in ('admin','member')
         or (fm.role = 'worker' and fn_workspace_type(pantry_items.workspace_id) <> 'business')
    )
  );

-- matrix row: "Manage categories/accounts/budgets/recipes/menu" -- pantry
-- setup is treated the same way: admin only.
create policy pantry_items_insert_admin on pantry_items for insert
  with check (exists (select 1 from fn_my_membership(pantry_items.workspace_id) fm where fm.role = 'admin'));

create policy pantry_items_update_admin on pantry_items for update
  using (exists (select 1 from fn_my_membership(pantry_items.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(pantry_items.workspace_id) fm where fm.role = 'admin'));

create policy pantry_items_delete_admin on pantry_items for delete
  using (exists (select 1 from fn_my_membership(pantry_items.workspace_id) fm where fm.role = 'admin'));

-- ============================================================
-- purchase_lines
-- JUDGMENT CALL: purchase_lines are line-item detail on a transaction, so
-- visibility mirrors that transaction's visibility (own rows only for a
-- worker) rather than pantry_items' stricter business-only block -- a
-- worker who is allowed to see their own purchase transaction should also
-- see what it itemised. Mutation is restricted to admin to keep derived
-- stock math from being casually edited after the fact.
-- ============================================================

alter table purchase_lines enable row level security;

create policy purchase_lines_select on purchase_lines for select
  using (
    exists (
      select 1 from fn_my_membership(purchase_lines.workspace_id) fm
      where fm.role in ('admin','member')
         or (
           fm.role = 'worker'
           and exists (
             select 1 from transactions t
             where t.id = purchase_lines.transaction_id
               and (t.paid_by_membership_id = fm.membership_id or t.logged_by_membership_id = fm.membership_id)
           )
         )
    )
  );

-- Any active member may itemise a transaction they are allowed to insert
-- (the transactions table's own INSERT policies gate the parent row).
create policy purchase_lines_insert_member on purchase_lines for insert
  with check (exists (select 1 from fn_my_membership(purchase_lines.workspace_id)));

-- JUDGMENT CALL: admin-only update/delete, so corrections to derived-stock
-- inputs are a deliberate, reviewable action rather than something a member
-- can silently edit after the transaction was logged.
create policy purchase_lines_update_admin on purchase_lines for update
  using (exists (select 1 from fn_my_membership(purchase_lines.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(purchase_lines.workspace_id) fm where fm.role = 'admin'));

create policy purchase_lines_delete_admin on purchase_lines for delete
  using (exists (select 1 from fn_my_membership(purchase_lines.workspace_id) fm where fm.role = 'admin'));

-- ============================================================
-- reconciles
-- Weekly stock correction. Same visibility rule as pantry_items (business
-- worker blocked). JUDGMENT CALL: no UPDATE/DELETE policy for anyone --
-- like audit_log, a reconcile is a point-in-time correction record and
-- should stay append-only.
-- ============================================================

alter table reconciles enable row level security;

create policy reconciles_select on reconciles for select
  using (
    exists (
      select 1 from fn_my_membership(reconciles.workspace_id) fm
      where fm.role in ('admin','member')
         or (fm.role = 'worker' and fn_workspace_type(reconciles.workspace_id) <> 'business')
    )
  );

create policy reconciles_insert on reconciles for insert
  with check (
    exists (
      select 1 from fn_my_membership(reconciles.workspace_id) fm
      where fm.membership_id = reconciles.actor_membership_id
        and (
          fm.role in ('admin','member')
          or (fm.role = 'worker' and fn_workspace_type(reconciles.workspace_id) <> 'business')
        )
    )
  );

-- ============================================================
-- shopping_list
-- JUDGMENT CALL (per the product doc's open question, resolved to the safe
-- default): a worker who does the actual buying needs to see the shopping
-- list, so worker gets read-only access. Worker write access was left
-- ambiguous in the design doc and is deliberately NOT granted here --
-- revisit if the product decision is made explicit later.
-- ============================================================

alter table shopping_list enable row level security;

create policy shopping_list_select on shopping_list for select
  using (exists (select 1 from fn_my_membership(shopping_list.workspace_id)));  -- admin/member/worker all read

create policy shopping_list_insert_admin_member on shopping_list for insert
  with check (exists (select 1 from fn_my_membership(shopping_list.workspace_id) fm where fm.role in ('admin','member')));

create policy shopping_list_update_admin_member on shopping_list for update
  using (exists (select 1 from fn_my_membership(shopping_list.workspace_id) fm where fm.role in ('admin','member')))
  with check (exists (select 1 from fn_my_membership(shopping_list.workspace_id) fm where fm.role in ('admin','member')));

create policy shopping_list_delete_admin_member on shopping_list for delete
  using (exists (select 1 from fn_my_membership(shopping_list.workspace_id) fm where fm.role in ('admin','member')));

-- ============================================================
-- menu_items / recipe_lines
-- D34: worker gets no read access to menu/recipe cost data at all.
-- Manage is admin only, same as the other "books setup" tables.
-- ============================================================

alter table menu_items enable row level security;

create policy menu_items_select_admin_member on menu_items for select
  using (exists (select 1 from fn_my_membership(menu_items.workspace_id) fm where fm.role in ('admin','member')));

create policy menu_items_insert_admin on menu_items for insert
  with check (exists (select 1 from fn_my_membership(menu_items.workspace_id) fm where fm.role = 'admin'));

create policy menu_items_update_admin on menu_items for update
  using (exists (select 1 from fn_my_membership(menu_items.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(menu_items.workspace_id) fm where fm.role = 'admin'));

create policy menu_items_delete_admin on menu_items for delete
  using (exists (select 1 from fn_my_membership(menu_items.workspace_id) fm where fm.role = 'admin'));

alter table recipe_lines enable row level security;

create policy recipe_lines_select_admin_member on recipe_lines for select
  using (exists (select 1 from fn_my_membership(recipe_lines.workspace_id) fm where fm.role in ('admin','member')));

create policy recipe_lines_insert_admin on recipe_lines for insert
  with check (exists (select 1 from fn_my_membership(recipe_lines.workspace_id) fm where fm.role = 'admin'));

create policy recipe_lines_update_admin on recipe_lines for update
  using (exists (select 1 from fn_my_membership(recipe_lines.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(recipe_lines.workspace_id) fm where fm.role = 'admin'));

create policy recipe_lines_delete_admin on recipe_lines for delete
  using (exists (select 1 from fn_my_membership(recipe_lines.workspace_id) fm where fm.role = 'admin'));

-- ============================================================
-- order_entries
-- Sales are always direct-entry (no approval workflow), so any active
-- member -- including a worker taking orders -- may insert one for
-- themselves. Read/edit/delete follow the usual own-rows-only rule for
-- non-admins.
-- ============================================================

alter table order_entries enable row level security;

-- matrix row: "See workspace dashboard/totals" -- worker sees own rows only.
create policy order_entries_select on order_entries for select
  using (
    exists (
      select 1 from fn_my_membership(order_entries.workspace_id) fm
      where fm.role in ('admin','member')
         or fm.membership_id = order_entries.logged_by_membership_id
    )
  );

create policy order_entries_insert_admin on order_entries for insert
  with check (exists (select 1 from fn_my_membership(order_entries.workspace_id) fm where fm.role = 'admin'));

-- member/worker: direct-entry sale logging, must log as themselves.
create policy order_entries_insert_self on order_entries for insert
  with check (
    exists (
      select 1 from fn_my_membership(order_entries.workspace_id) fm
      where fm.role in ('member','worker')
        and fm.membership_id = order_entries.logged_by_membership_id
    )
  );

-- matrix row: "Edit/delete someone else's entry" -- admin: any row.
create policy order_entries_update_admin on order_entries for update
  using (exists (select 1 from fn_my_membership(order_entries.workspace_id) fm where fm.role = 'admin'))
  with check (exists (select 1 from fn_my_membership(order_entries.workspace_id) fm where fm.role = 'admin'));

-- matrix row: "Edit/delete someone else's entry" -- member/worker: own rows only.
create policy order_entries_update_own on order_entries for update
  using (
    exists (
      select 1 from fn_my_membership(order_entries.workspace_id) fm
      where fm.role in ('member','worker') and fm.membership_id = order_entries.logged_by_membership_id
    )
  )
  with check (
    exists (
      select 1 from fn_my_membership(order_entries.workspace_id) fm
      where fm.role in ('member','worker') and fm.membership_id = order_entries.logged_by_membership_id
    )
  );

create policy order_entries_delete_admin on order_entries for delete
  using (exists (select 1 from fn_my_membership(order_entries.workspace_id) fm where fm.role = 'admin'));

create policy order_entries_delete_own on order_entries for delete
  using (
    exists (
      select 1 from fn_my_membership(order_entries.workspace_id) fm
      where fm.role in ('member','worker') and fm.membership_id = order_entries.logged_by_membership_id
    )
  );

-- ============================================================
-- stock_adjustments
-- JUDGMENT CALL: manual waste/shrinkage correction is inventory-cost data,
-- same treatment as pantry_items/menu_items -- admin/member only, worker
-- excluded entirely (not just in business workspaces, since this table only
-- makes sense alongside pantry/recipe management which is already
-- admin-gated). No UPDATE/DELETE policy for anyone: append-only correction
-- log, same rationale as reconciles/audit_log.
-- ============================================================

alter table stock_adjustments enable row level security;

create policy stock_adjustments_select_admin_member on stock_adjustments for select
  using (exists (select 1 from fn_my_membership(stock_adjustments.workspace_id) fm where fm.role in ('admin','member')));

create policy stock_adjustments_insert_admin_member on stock_adjustments for insert
  with check (
    exists (
      select 1 from fn_my_membership(stock_adjustments.workspace_id) fm
      where fm.role in ('admin','member')
        and fm.membership_id = stock_adjustments.actor_membership_id
    )
  );

-- ============================================================
-- Export (matrix row: "Export -- admin: whole workspace, member/worker: own
-- rows") is not a separate grant: it rides on the SELECT policies above,
-- since an export is just a client-side bulk read through the same RLS.
-- ============================================================
