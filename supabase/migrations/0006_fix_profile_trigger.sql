-- 0006_fix_profile_trigger.sql
-- Signup failed with "Database error saving new user" (23505 users_email_key):
-- a public.users profile with the same email survived from an earlier auth user
-- (e.g. one deleted in the dashboard), so fn_handle_new_user's insert hit the
-- unique email constraint. `on conflict (id)` only covers the id, not the email.
--
-- Fix: before inserting, free the email on any stale profile (one whose id is no
-- longer in auth.users). It keeps its row, so anything it created stays intact;
-- it just no longer holds the email.

create or replace function fn_handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.users
  set email = null
  where email = new.email
    and id <> new.id
    and not exists (select 1 from auth.users a where a.id = public.users.id);

  insert into public.users (id, email, display_name)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
