-- sample_data.sql
-- Small smoke-test seed for the schema in supabase/migrations/. Not a full
-- demo dataset -- just enough rows in enough tables to sanity-check that the
-- migrations, constraints, and composite FKs all actually work together.
--
-- NOTE ON IDS: real `users` rows normally get their id from Supabase Auth
-- (id = auth.uid()). This seed inserts users directly with fixed literal
-- UUIDs so that later inserts can reference them by name -- it bypasses
-- Auth entirely and is meant to be run against a fresh dev/staging database
-- for schema smoke-testing, not as real login-able accounts. Leaf rows that
-- nothing else needs to reference (individual transactions, purchase_lines,
-- recipe_lines, order_entries) use gen_random_uuid() instead.
--
-- Run after 0001_init.sql .. 0004_rls.sql have all applied successfully.
-- If running via the Supabase SQL Editor or `psql`, this runs as the
-- postgres/service role, which bypasses RLS -- so it works regardless of
-- the policies defined in 0004_rls.sql.

begin;

-- ============================================================
-- users
-- ============================================================

insert into users (id, email, display_name) values
  ('11111111-1111-1111-1111-111111111111', 'kunalpk007@gmail.com', 'Kunal'),
  ('22222222-2222-2222-2222-222222222222', 'priya@example.com',    'Priya'),
  ('33333333-3333-3333-3333-333333333333', 'ramesh@example.com',   'Ramesh');

-- ============================================================
-- workspaces: one household, one business
-- ============================================================

insert into workspaces (id, type, name, currency, created_by) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'household', 'Our Home',      'INR', '11111111-1111-1111-1111-111111111111'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'business',  'Kadam Traders', 'INR', '11111111-1111-1111-1111-111111111111');

-- ============================================================
-- memberships: Kunal is admin in both; Priya is a household member;
-- Ramesh is a worker in the business.
-- ============================================================

insert into memberships (id, workspace_id, user_id, role, display_name, status, joined_at) values
  ('c1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'admin',  'Kunal', 'active', now()),
  ('c1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'member', 'Priya', 'active', now()),
  ('c2000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'admin',  'Kunal',  'active', now()),
  ('c2000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'worker', 'Ramesh', 'active', now());

-- ============================================================
-- categories
-- ============================================================

insert into categories (id, workspace_id, name, kind) values
  ('d1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Groceries', 'expense'),
  ('d1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Utilities', 'expense'),
  ('d1000000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Salary', 'income'),
  ('d2000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Ingredients', 'expense'),
  ('d2000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Sales', 'income');

-- ============================================================
-- accounts
-- ============================================================

insert into accounts (id, workspace_id, owner_membership_id, type, name) values
  ('e1000000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'bank', 'HDFC Bank'),
  ('e1000000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', null, 'cash', 'Home Cash'),
  ('e2000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, 'bank', 'Business Bank'),
  ('e2000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', null, 'cash', 'Cash Register');

-- ============================================================
-- transactions (household)
-- ============================================================

insert into transactions (id, workspace_id, type, amount_paise, date, category_id, account_id,
                           paid_by_membership_id, logged_by_membership_id, vendor, status)
values
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'income',  8000000, '2026-08-01',
   'd1000000-0000-0000-0000-000000000003', 'e1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Employer', 'confirmed'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', 180000,  '2026-08-03',
   'd1000000-0000-0000-0000-000000000002', 'e1000000-0000-0000-0000-000000000001',
   'c1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'BESCOM', 'confirmed'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'expense', 250000,  '2026-08-05',
   'd1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000002',
   'c1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000002', 'D-Mart', 'confirmed');

-- ============================================================
-- transactions (business) -- one confirmed ingredient purchase (itemised
-- below via purchase_lines), one confirmed daily sales lump-sum, and one
-- worker expense claim awaiting admin approval.
-- ============================================================

insert into transactions (id, workspace_id, type, amount_paise, date, category_id, account_id,
                           paid_by_membership_id, logged_by_membership_id, vendor, status, was_submitted)
values
  ('f2000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'expense', 1640000, '2026-08-02',
   'd2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Local Mandi', 'confirmed', false),
  (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'income', 1800000, '2026-08-09',
   'd2000000-0000-0000-0000-000000000002', 'e2000000-0000-0000-0000-000000000002',
   'c2000000-0000-0000-0000-000000000001', 'c2000000-0000-0000-0000-000000000001', 'Daily till', 'confirmed', false),
  (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'expense', 45000, '2026-08-08',
   'd2000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000001',
   'c2000000-0000-0000-0000-000000000002', 'c2000000-0000-0000-0000-000000000002', 'Corner Store', 'submitted', true);

-- ============================================================
-- pantry_items (business)
-- ============================================================

insert into pantry_items (id, workspace_id, name, tier, item_group, unit, full_qty, weekly_usage,
                           shelf_life_days, low_days, base_qty, base_at)
values
  ('a1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Rice',        'staple',     'grain',     'kg', 25, 8,    null, 7, 10, '2026-08-02'),
  ('a1000000-0000-0000-0000-000000000002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Onions',      'perishable', 'vegetable', 'kg', 20, null, 10,   4, 15, '2026-08-02'),
  ('a1000000-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Cooking Oil', 'staple',     'other',     'L',  10, 3,    null, 7, 5,  '2026-08-02'),
  ('a1000000-0000-0000-0000-000000000004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Paneer',      'perishable', 'dairy',     'kg', 5,  null, 5,    2, 2,  '2026-08-02');

-- purchase_lines: itemise the confirmed 'Local Mandi' transaction above.
insert into purchase_lines (workspace_id, transaction_id, item_id, qty, cost_paise) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 10, 500000),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 15, 300000),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 5,  750000),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'f2000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 3,  90000);

-- ============================================================
-- menu_items + recipe_lines (BOM) for the business
-- ============================================================

insert into menu_items (id, workspace_id, name, price_paise, category) values
  ('b1000000-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Veg Thali', 15000, 'Meals');

insert into recipe_lines (workspace_id, menu_item_id, item_id, qty, unit) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 0.2,  'kg'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 0.1,  'kg'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 0.05, 'L'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000004', 0.08, 'kg');

-- order_entries: logged sales of the Veg Thali (deducts stock via the BOM above).
insert into order_entries (workspace_id, menu_item_id, qty, date, logged_by_membership_id) values
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1000000-0000-0000-0000-000000000001', 8,  '2026-08-08', 'c2000000-0000-0000-0000-000000000001'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b1000000-0000-0000-0000-000000000001', 12, '2026-08-09', 'c2000000-0000-0000-0000-000000000002');

commit;
