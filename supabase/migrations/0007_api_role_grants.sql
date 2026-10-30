-- 0007_api_role_grants.sql
-- After sign-in the app got "permission denied for table ..." (42501) on every
-- table. That is a missing GRANT, not an RLS rule (RLS would return no rows).
-- Tables created from SQL aren't granted to the API roles on this project, so
-- the signed-in role (`authenticated`) could not touch them at all.
--
-- Grant table access to `authenticated` only; RLS (0004) still decides which
-- rows and verbs are allowed (e.g. audit_log has no UPDATE/DELETE policy).
-- `anon` gets nothing: the app has no signed-out data access.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- RLS policies call these helpers as the signed-in user, so they need EXECUTE too.
grant execute on function fn_my_membership(uuid) to authenticated;
grant execute on function fn_workspace_type(uuid) to authenticated;

-- Same for tables added by future migrations.
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
