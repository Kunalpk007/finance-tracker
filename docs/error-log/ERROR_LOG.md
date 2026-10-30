# Error log

One entry per error: what was seen, why it happened, and the fix applied.

## ERR-001 — Signup fails: Database error saving new user

- **Date:** 2026-10-30
- **Error:**
  ```
  POST /auth/v1/signup 500 'Database error saving new user'; Postgres: 23505 duplicate key value violates unique constraint "users_email_key"
  ```
- **Cause:** Profile trigger fn_handle_new_user (0005) inserts into public.users; a stale profile row with the same email (left by a deleted auth user) already existed, and ON CONFLICT (id) does not cover the email unique constraint.
- **Fix:** 0006_fix_profile_trigger.sql frees the email on stale profiles (id not in auth.users) before inserting. Client signUp now maps 'already registered' to 'That email already has an account — sign in instead.' Verified: after running 0006, signup succeeds and the app shows the "confirm your email" prompt.
- **Files:** supabase/migrations/0006_fix_profile_trigger.sql, src/store/remote-adapter.ts

## ERR-002 — Signed-in app gets permission denied on every table

- **Date:** 2026-10-30
- **Error:**
  ```
  42501 permission denied for table (workspaces, memberships, transactions, categories, ... all tables); REST GET /rest/v1/<table> 403
  ```
- **Cause:** Tables created by the migrations were never granted to the API role 'authenticated' (a GRANT problem, not RLS), so every select by a signed-in user was refused before RLS ran. RLS helper functions fn_my_membership/fn_workspace_type also lacked EXECUTE for authenticated.
- **Fix:** 0007_api_role_grants.sql grants usage + select/insert/update/delete on public tables and sequences to authenticated (RLS still gates rows/verbs, anon gets nothing), EXECUTE on the two helper functions, and default privileges for future tables. Pending: run 0007 and sign in.
- **Files:** supabase/migrations/0007_api_role_grants.sql

## ERR-003 — Creating an invite fails: missing created_at column

- **Date:** 2026-10-30
- **Error:**
  ```
  POST /rest/v1/invites 400 (Bad Request); Sync errors: invites: Could not find the 'created_at' column of 'invites' in the schema cache
  ```
- **Cause:** The client Invite model has createdAt, but 0001 created the invites table without created_at, so the insert was rejected. Every other table's columns were cross-checked against the client types and match.
- **Fix:** 0008_invites_created_at.sql adds created_at timestamptz default now() and reloads the PostgREST schema cache. Unsynced invites retry on the next save. Pending: run 0008.
- **Files:** supabase/migrations/0008_invites_created_at.sql

## ERR-004 — Goals visible to admin and other members

- **Date:** 2026-10-30
- **Error:**
  ```
  Not an error message: goals created by one member were listed for every member of the workspace (client Scope.goals filtered by workspace only; RLS policy goals_admin_member allowed admin/member read+write on all rows)
  ```
- **Cause:** 0005 gave goals the same admin/member workspace-wide policy as other books tables, and the client only scoped goals by workspace, so privacy depended on the UI alone.
- **Fix:** Scope.goals() now returns only the signed-in member's goals; 0009_private_goals.sql replaces the policy with owner-only (membership held by auth.uid()) for all verbs and roles, admins included. Pending: run 0009.
- **Files:** src/domain/scope.ts, supabase/migrations/0009_private_goals.sql, tests/unit/goals.test.ts
