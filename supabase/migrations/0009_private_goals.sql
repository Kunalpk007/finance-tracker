-- 0009_private_goals.sql
-- Savings goals are personal. 0005 let any admin/member of the workspace read and
-- write every goal; replace that with owner-only access, for every verb and every
-- role (admins included). A goal belongs to one membership, and only the signed-in
-- user holding that membership can see or change it.

drop policy if exists goals_admin_member on goals;

create policy goals_owner_only on goals for all
  using (exists (select 1 from fn_my_membership(goals.workspace_id) fm where fm.membership_id = goals.membership_id))
  with check (exists (select 1 from fn_my_membership(goals.workspace_id) fm where fm.membership_id = goals.membership_id));
