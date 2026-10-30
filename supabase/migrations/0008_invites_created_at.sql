-- 0008_invites_created_at.sql
-- The client's Invite has createdAt, but 0001 gave `invites` no created_at, so
-- creating an invite failed with "Could not find the 'created_at' column of
-- 'invites' in the schema cache" (HTTP 400).
alter table invites add column created_at timestamptz not null default now();

-- ask PostgREST to refresh its schema cache so the new column is visible at once
notify pgrst, 'reload schema';
