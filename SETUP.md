# Setup Guide

This is a step-by-step guide to take this repo from a checkout to a live,
production household + business finance tracker running on Supabase
(database/auth) and Netlify (hosting). It assumes you're comfortable with
git, npm, and a terminal, but have never used Supabase before.

## Current state — read this first

Everything below the app layer is real and tested: the full Postgres schema
and RLS policies (`supabase/migrations/`), the domain logic (permissions,
lifecycle, derived stock, recipes — 37 unit tests), and the UI (22 Playwright
end-to-end tests). All of that testing ran against **`LocalAdapter`**
(IndexedDB, in-browser only) — the app today does not talk to Supabase yet.

`RemoteAdapter` (`src/store/remote-adapter.ts`) is written and type-checked
against the same schema — auth, and typed CRUD for every table — but it was
**not live-tested against a real Supabase project this session**, and it is
**not wired into `src/main.ts`** (which still constructs `new LocalAdapter()`
unconditionally). Two things need to happen before this is genuinely
production-ready, and neither is optional polish:

1. **Verify `RemoteAdapter` against your real project** once you've completed
   step 1–3 below (create the project, run the migrations) — sign up, sign
   in, create a workspace, add a transaction, confirm the row lands in the
   `transactions` table and RLS blocks what it should.
2. **Wire it in**: swap `main.ts` to use `RemoteAdapter` when
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are present (falling back to
   `LocalAdapter` otherwise), and build the local-first sync layer described
   in `ARCHITECTURE.md` §7 — a mutation queue and an IndexedDB read cache in
   front of `RemoteAdapter`, not a direct swap, so the app stays fast offline
   and multi-device writes don't collide (H5). This is real, scoped work —
   budget a session for it rather than treating it as a config flip.

Until both of those happen, treat this as: **a fully working local app, a
fully designed and schema-validated backend, and a documented, typed bridge
between them that still needs its first real test and its wiring-up.**

---

## 1. Create a free Supabase account and project

1. Go to [supabase.com](https://supabase.com) and click **Start your project**
   (or **Sign in** if you already have an account). Sign up with GitHub or
   email — no card required for the free tier.
2. Once logged in, click **New project**.
3. Fill in the form:
   - **Organization**: create one if you don't have one yet (any name).
   - **Name**: e.g. `finance-tracker`.
   - **Database Password**: generate/enter a strong password and **save it
     somewhere safe** (a password manager) — you'll need it again in step 3
     and step 8. This is *not* the same as your Supabase login password.
   - **Region**: pick `ap-south-1 (Mumbai)` if you or your data are in
     India — it minimizes latency and keeps data in-region.
   - **Pricing plan**: Free.
4. Click **Create new project**. It takes 1–2 minutes to provision.

## 2. Find your API keys and database connection string

Once the project is ready:

- **Settings → API** (left sidebar → the gear icon → API):
  - **Project URL** — looks like `https://<project-ref>.supabase.co`.
  - **Project API keys → `anon` `public`** — a long JWT-looking string.

  These two values are **safe to embed in frontend code / env vars**. The
  anon key is designed to be public; it only grants what your Row Level
  Security policies (already written into `supabase/migrations/0004_rls.sql`)
  allow.

- **Settings → Database** (left sidebar → gear icon → Database):
  - **Connection string** section, "URI" tab — this is your full Postgres
    connection string, e.g.
    `postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres`.
    Replace `[YOUR-PASSWORD]` with the database password from step 1.

  This connection string (and the `service_role` key, also under Settings →
  API) is **secret** — it bypasses Row Level Security entirely. Never put it
  in frontend code or a `VITE_*` env var. It's only used server-side: for
  running migrations from your terminal and for the GitHub Actions backup
  workflow (as a repo secret, step 8).

## 3. Run the migration files, in order

The schema lives in `supabase/migrations/`, split into four files that must
run **in order**: `0001_init.sql` → `0002_pantry_and_recipes.sql` →
`0003_recipes.sql` → `0004_rls.sql`.

**Option A — Supabase SQL Editor (no terminal needed):**

1. In your project dashboard, go to **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `supabase/migrations/0001_init.sql` in your editor, copy its full
   contents, paste into the SQL Editor, and click **Run**.
4. Repeat for `0002_pantry_and_recipes.sql`, `0003_recipes.sql`, then
   `0004_rls.sql`, each as a fresh query, in that order.

**Option B — command line with `psql`:**

```bash
export DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.<project-ref>.supabase.co:5432/postgres"

psql "$DATABASE_URL" -f supabase/migrations/0001_init.sql
psql "$DATABASE_URL" -f supabase/migrations/0002_pantry_and_recipes.sql
psql "$DATABASE_URL" -f supabase/migrations/0003_recipes.sql
psql "$DATABASE_URL" -f supabase/migrations/0004_rls.sql
```

If any step errors, fix the cause and re-run just that file — each file is
plain SQL (`create table`, `create policy`, etc.) and isn't designed to be
run twice, so if a file partially applied you may need to drop the
partially-created objects first, or restore from a fresh project.

## 4. (Optional) Load the sample data

`supabase/seed/sample_data.sql` inserts a small set of realistic rows (two
workspaces, three users, some transactions, pantry items, a menu item) so
you can sanity-check the schema before wiring up the frontend. It's optional
and safe to skip on a real production project — it's meant for a fresh
dev/staging database only.

```bash
psql "$DATABASE_URL" -f supabase/seed/sample_data.sql
```

or paste its contents into the SQL Editor the same way as step 3.

## 5. Create your local environment file

In the project root, create a file named `.env.local` (this filename is
already covered by the standard Vite `.gitignore` pattern, so it won't be
committed):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your anon public key>
```

Use the values from step 2. Do **not** put the database password or
service role key in this file.

## 6. Run it locally

```bash
npm install
npm run dev
```

This starts the Vite dev server (check your terminal for the local URL,
typically `http://localhost:5173`).

## 7. Deploy to Netlify

1. Go to [netlify.com](https://netlify.com) and log in (or sign up).
2. Click **Add new site → Import an existing project**.
3. Connect your GitHub account if prompted, then select this repository.
4. Configure the build:
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
5. Before deploying, add the environment variables: **Site settings →
   Environment variables → Add a variable**, and add both:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

   (same values as in your `.env.local`).
6. Click **Deploy site**. Netlify will build and give you a live URL
   (e.g. `https://your-site-name.netlify.app`).

## 8. Push to GitHub and add repo secrets for CI/backups

If you haven't already:

```bash
git init   # if not already a git repo
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then, on GitHub: **Settings → Secrets and variables → Actions → New
repository secret**, and add:

- `SUPABASE_DB_URL` — the **full** connection string including the database
  password, from step 2 (`Settings → Database`).
- `SUPABASE_URL` — same value as `VITE_SUPABASE_URL` from step 5.
- `SUPABASE_ANON_KEY` — same value as `VITE_SUPABASE_ANON_KEY` from step 5.

These power `.github/workflows/backup.yml` (daily `pg_dump` backup) and are
checked explicitly at the start of that workflow — it will fail loudly with
a clear error if any of them are missing, rather than silently skipping the
backup. `.github/workflows/ci.yml` (typecheck/unit/e2e tests on every push
and PR) doesn't need any secrets and will work as soon as it's pushed.

## 9. Verify everything end-to-end

1. Open your deployed Netlify URL.
2. Sign up for an account (this uses Supabase Auth under the hood).
3. Confirm your email if Supabase's default email confirmation is enabled
   (check your inbox — including spam — for a confirmation link; you can
   turn this requirement off during development under **Authentication →
   Providers → Email → Confirm email**, but keep it on for production).
4. Create a workspace (household or business).
5. Add a transaction (an expense or income entry).
6. Confirm it shows up in the workspace's transaction list / dashboard.

If all of that works, your database, RLS policies, and frontend are wired
up correctly end to end.

## 10. If something breaks

- **Supabase-side issues** (queries failing, RLS denying access, auth
  errors): Supabase dashboard → **Logs** (left sidebar) → pick **API**,
  **Postgres**, or **Auth** logs depending on what's failing. You can also
  run queries directly in **SQL Editor** to debug RLS by hand (e.g.
  `select * from transactions;` as different roles).
- **Netlify build/deploy issues**: Netlify dashboard → your site →
  **Deploys** tab → click the failing deploy to see the full build log.
  Most failures here are missing env vars (step 7) or a failing
  `npm run build`.
- **GitHub Actions issues** (CI or backup workflow failing): on GitHub, go
  to the **Actions** tab of the repo → click the failing workflow run to
  see step-by-step logs. A red X on "Verify required secrets are set" in
  the backup workflow means you skipped step 8 above.
