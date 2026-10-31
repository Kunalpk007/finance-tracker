/* ============================================================================
   RemoteAdapter — Supabase-backed store (Auth + Postgres/RLS).

   The UI works on one in-memory StoreState and calls save(state) after every
   mutation, exactly as with LocalAdapter. Here save() diffs each table against
   a snapshot of what the server last held and pushes only the changed rows
   (insert / update / delete). RLS on the server stays the real boundary: a
   write it refuses is reported through `lastError`, not hidden.

   Auth is Supabase's: the password never enters this codebase. Role is a
   property of the membership row (D49), so sign-in only establishes who you
   are and the load below fetches whatever memberships RLS lets you see.
============================================================================ */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { StoreState } from '../domain/types';
import { workspacesFor } from '../domain/auth';
import type { StoreAdapter } from './adapter';

export interface RemoteConfig { url: string; anonKey: string }

/** Both values are safe to ship to the client — RLS is the actual security
 *  boundary (H7), not secrecy of the anon key. */
export function configFromEnv(): RemoteConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export type AuthResult = { ok: true; S: StoreState } | { ok: false; msg: string; info?: boolean };

type Row = Record<string, unknown> & { id: string };
type Key = Exclude<keyof StoreState, 'schemaVersion' | 'users' | 'session' | 'meta'>;

/** state key -> table. Order is FK-safe for inserts; deletes run in reverse. */
const TABLES: [Key, string][] = [
  ['workspaces', 'workspaces'], ['memberships', 'memberships'], ['invites', 'invites'],
  ['categories', 'categories'], ['accounts', 'accounts'], ['recurring', 'recurring_rules'],
  ['budgets', 'budgets'], ['transactions', 'transactions'], ['audit', 'audit_log'],
  ['pantryItems', 'pantry_items'], ['purchaseLines', 'purchase_lines'], ['reconciles', 'reconciles'],
  ['shoppingList', 'shopping_list'], ['menuItems', 'menu_items'], ['recipeLines', 'recipe_lines'],
  ['orderEntries', 'order_entries'], ['stockAdjustments', 'stock_adjustments'],
  ['trips', 'trips'], ['tripMembers', 'trip_members'], ['tripExpenses', 'trip_expenses'], ['goals', 'goals']
];

const PAGE = 1000; // PostgREST caps a response at 1000 rows by default
const WS_KEY = 'ht.workspace';
const metaKey = (userId: string) => `ht.meta.${userId}`;

// `group` is a reserved word in SQL, so pantry_items names it item_group.
const snake = (s: string) => (s === 'group' ? 'item_group' : s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()));
const camel = (s: string) => (s === 'item_group' ? 'group' : s.replace(/_([a-z])/g, (_, c) => c.toUpperCase()));
const mapKeys = (row: object, f: (k: string) => string) => Object.fromEntries(Object.entries(row).map(([k, v]) => [f(k), v]));
const sig = (row: Row) => JSON.stringify(Object.entries(row).sort(([a], [b]) => (a < b ? -1 : 1)));

function blank(): StoreState {
  const S: any = { schemaVersion: 4, users: [], session: { userId: null, workspaceId: null, authed: false }, meta: {} };
  for (const [k] of TABLES) S[k] = [];
  return S;
}

function ls<T>(f: () => T): T | undefined {
  try { return f(); } catch { return undefined; } // private browsing etc.
}

export class RemoteAdapter implements StoreAdapter {
  name = 'remote';
  lastError = '';
  client: SupabaseClient;
  private snap = new Map<string, Map<string, string>>(); // table -> id -> signature at last sync
  private queue: Promise<unknown> = Promise.resolve();

  constructor(cfg: RemoteConfig) {
    this.client = createClient(cfg.url, cfg.anonKey);
  }

  /* ----------------------------- load ------------------------------------ */
  async load(): Promise<StoreState | null> {
    try {
      const { data } = await this.client.auth.getSession();
      return data.session ? await this.hydrate(data.session.user.id) : blank();
    } catch (e) {
      console.error('Could not load from Supabase', e);
      return blank();
    }
  }

  private async fetchAll(table: string): Promise<Row[]> {
    const out: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      let res = await this.client.from(table).select('*').order('id').range(from, from + PAGE - 1);
      // Clock skew between Supabase's auth and API servers right after sign-in is transient.
      for (let i = 0; i < 3 && res.error?.message.includes('issued at future'); i++) {
        await new Promise((r) => setTimeout(r, 1500));
        res = await this.client.from(table).select('*').order('id').range(from, from + PAGE - 1);
      }
      const { data, error } = res;
      if (error) throw new Error(`${table}: ${error.message}`);
      out.push(...(data as Row[]));
      if (data.length < PAGE) return out;
    }
  }

  /** Pulls everything RLS lets this user see into a fresh StoreState and
   *  re-baselines the diff snapshot against it. */
  private async hydrate(userId: string, preferWorkspace?: string): Promise<StoreState> {
    const S: any = blank();
    const [tables, me] = await Promise.all([
      Promise.all(TABLES.map(([, t]) => this.fetchAll(t))),
      this.client.from('users').select('*').eq('id', userId).maybeSingle()
    ]);
    if (me.error) throw new Error(`users: ${me.error.message}`);
    TABLES.forEach(([k], i) => { S[k] = tables[i]!.map((r) => mapKeys(r, camel)); });
    S.users = me.data ? [mapKeys(me.data, camel)] : [];
    S.meta = ls(() => JSON.parse(localStorage.getItem(metaKey(userId)) ?? '{}')) ?? {};

    const mine = workspacesFor(S, userId);
    const remembered = ls(() => localStorage.getItem(WS_KEY));
    const pick = [preferWorkspace, remembered].find((id) => id && mine.some((w) => w.id === id)) ?? (mine.length === 1 ? mine[0]!.id : null);
    S.session = { userId, workspaceId: pick ?? null, authed: true };

    this.snap = new Map(TABLES.map(([k, t]) => [t, new Map((S[k] as Row[]).map((r) => [r.id, sig(mapKeys(r, snake) as Row)]))]));
    return S;
  }

  /* ----------------------------- auth ------------------------------------ */
  private async attempt(f: () => Promise<AuthResult>): Promise<AuthResult> {
    try { return await f(); } catch (e) { return { ok: false, msg: e instanceof Error ? e.message : 'Something went wrong' }; }
  }

  private async reload(preferWorkspace?: string): Promise<AuthResult> {
    const { data } = await this.client.auth.getSession();
    if (!data.session) return { ok: false, msg: 'Not signed in' };
    return { ok: true, S: await this.hydrate(data.session.user.id, preferWorkspace) };
  }

  signIn(email: string, password: string): Promise<AuthResult> {
    return this.attempt(async () => {
      const { error } = await this.client.auth.signInWithPassword({ email: email.trim(), password });
      return error ? { ok: false, msg: error.message } : this.reload();
    });
  }

  signUp(name: string, email: string, password: string): Promise<AuthResult> {
    return this.attempt(async () => {
      if (!name.trim()) return { ok: false, msg: 'Enter your name' };
      const { data, error } = await this.client.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() } } });
      // Supabase says "already registered" (or, with Confirm email on, returns a user with no identities).
      if (error?.code === 'user_already_exists' || (!error && data.user?.identities?.length === 0)) {
        return { ok: false, msg: 'That email already has an account — sign in instead.' };
      }
      if (error) return { ok: false, msg: error.message };
      // With "Confirm email" on, there is no session until the link is clicked.
      if (!data.session) return { ok: false, info: true, msg: `We've sent a confirmation link to ${email.trim()}. Open it to verify your account, then sign in here.` };
      return this.reload();
    });
  }

  async signOut(): Promise<StoreState> {
    await this.client.auth.signOut();
    this.snap.clear();
    ls(() => localStorage.removeItem(WS_KEY));
    return blank();
  }

  createWorkspace(name: string, type: 'household' | 'business'): Promise<AuthResult> {
    return this.attempt(async () => {
      const { data, error } = await this.client.rpc('create_workspace', { p_name: name, p_type: type });
      return error ? { ok: false, msg: error.message } : this.reload(data as string);
    });
  }

  redeemInvite(code: string): Promise<AuthResult> {
    return this.attempt(async () => {
      const { data, error } = await this.client.rpc('accept_invite', { p_code: code });
      return error ? { ok: false, msg: error.message } : this.reload(data as string);
    });
  }

  /* ----------------------------- save ------------------------------------ */
  save(state: StoreState): Promise<boolean> {
    const run = this.queue.then(() => this.push(state));
    this.queue = run.catch(() => undefined);
    return run;
  }

  // ponytail: re-signs every row on each save (O(rows)); fine for a household's
  // data, switch to dirty-tracking in Scope.addRow/update if saves get slow.
  private async push(S: StoreState): Promise<boolean> {
    if (!S.session.authed || !S.session.userId) return true;
    const { userId, workspaceId } = S.session;
    ls(() => (workspaceId ? localStorage.setItem(WS_KEY, workspaceId) : localStorage.removeItem(WS_KEY)));
    ls(() => localStorage.setItem(metaKey(userId), JSON.stringify(S.meta)));

    const errors: string[] = [];
    const removals: [string, string[]][] = [];

    for (const [key, table] of TABLES) {
      const prev = this.snap.get(table) ?? new Map<string, string>();
      this.snap.set(table, prev);
      const rows = (S[key] as object[]).map((r) => mapKeys(r, snake) as Row);
      const inserts = rows.filter((r) => !prev.has(r.id));
      const updates = rows.filter((r) => prev.has(r.id) && prev.get(r.id) !== sig(r));
      const live = new Set(rows.map((r) => r.id));
      const gone = [...prev.keys()].filter((id) => !live.has(id));
      if (gone.length) removals.push([table, gone]);

      if (inserts.length) {
        const { error } = await this.client.from(table).insert(inserts);
        if (!error) inserts.forEach((r) => prev.set(r.id, sig(r)));
        else for (const r of inserts) { // isolate the bad row so it doesn't block the rest
          const one = await this.client.from(table).insert(r);
          if (one.error) errors.push(`${table}: ${one.error.message}`); else prev.set(r.id, sig(r));
        }
      }
      for (const r of updates) {
        // RLS-denied updates affect 0 rows without an error, so check the count.
        const { data, error } = await this.client.from(table).update(r).eq('id', r.id).select('id');
        if (error) errors.push(`${table}: ${error.message}`);
        else if (!data?.length) errors.push(`${table}: change not permitted`);
        else prev.set(r.id, sig(r));
      }
    }

    for (const [table, ids] of removals.reverse()) {
      const { data, error } = await this.client.from(table).delete().in('id', ids).select('id');
      if (error) errors.push(`${table}: ${error.message}`);
      else {
        const done = new Set((data ?? []).map((r) => r.id as string));
        done.forEach((id) => this.snap.get(table)!.delete(id));
        if (done.size < ids.length) errors.push(`${table}: delete not permitted`);
      }
    }

    this.lastError = errors[0] ?? '';
    if (errors.length) console.error('Sync errors', errors);
    return errors.length === 0;
  }
}
