/* ============================================================================
   Auth (local rehearsal) — a stand-in for Supabase Auth. Authenticates the
   person, resolves the memberships they hold, then enters one workspace.
   Role is never a property of the login — it's a property of the membership
   (D49), so the same credentials give admin here and worker there.

   Passwords sit in the clear ONLY in this local adapter, because there is no
   server. RemoteAdapter (store/remote-adapter.ts) never lets the client hold
   a credential at all — Supabase Auth issues a session token and the
   password never reaches this codebase.
============================================================================ */
import type { StoreState, Workspace } from './types';
import type { Scope } from './scope';

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function workspacesFor(state: StoreState, userId: string): Workspace[] {
  return state.workspaces.filter((w) => state.memberships.some((m) => m.workspaceId === w.id && m.userId === userId && m.status === 'active'));
}

export function signIn(state: StoreState, email: string, password: string): { ok: true; workspaces: Workspace[] } | { ok: false; msg: string } {
  const u = state.users.find((x) => (x.email || '').toLowerCase() === email.trim().toLowerCase());
  if (!u || u.password !== password) return { ok: false, msg: 'Email or password is incorrect' };
  const mine = workspacesFor(state, u.id);
  state.session = { userId: u.id, workspaceId: mine.length === 1 ? mine[0]!.id : null, authed: true };
  return { ok: true, workspaces: mine };
}

export function signOut(state: StoreState): void {
  state.session = { userId: null, workspaceId: null, authed: false };
}

export function signUp(state: StoreState, name: string, email: string, password: string): { ok: true } | { ok: false; msg: string } {
  const e = email.trim().toLowerCase();
  if (!name.trim()) return { ok: false, msg: 'Enter your name' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return { ok: false, msg: 'That email does not look right' };
  if (password.length < 6) return { ok: false, msg: 'Password needs at least 6 characters' };
  if (state.users.some((u) => (u.email || '').toLowerCase() === e)) return { ok: false, msg: 'That email already has an account' };
  const u = { id: uid(), displayName: name.trim(), email: e, phone: null, password, createdAt: new Date().toISOString() };
  state.users.push(u);
  state.session = { userId: u.id, workspaceId: null, authed: true };
  return { ok: true };
}

export function authed(state: StoreState): boolean {
  return !!(state.session?.authed && state.users.some((u) => u.id === state.session.userId));
}

/* ---------------------------- invites -------------------------------------
   Single-use, expiring, never self-service: an admin issues a code, and the
   membership is pre-created so the person's name/role are already correct
   before they ever sign in. Redeeming binds the login to that row. */
const INVITE_DAYS = 7;

export function newCode(name: string): string {
  const prefix = (name || 'INV').replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || 'IN';
  // 32 symbols = 5 bits, so a byte & 31 is unbiased. No I/O/0/1 — misread when typed off a screen.
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const body = Array.from(bytes, (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b & 31]).join('');
  return `${prefix}-${body}`; // one per invitee (single-use); the DB's unique(code) backs this up
}

/** The WhatsApp/clipboard text for an invite: app link plus the personal code. */
export function inviteShareText(a: { name: string; workspace: string; inviter: string; role: string; code: string; url: string; days?: number }): string {
  return [
    `Hi ${a.name}! ${a.inviter} invited you to join "${a.workspace}" on Finance Tracker as ${a.role}.`,
    '',
    `1. Open the app: ${a.url}`,
    '2. Sign in, or create an account',
    `3. Enter your invite code: ${a.code}`,
    '',
    `This code is just for you — it works once and expires in ${a.days ?? INVITE_DAYS} days. You need to sign in to use it.`
  ].join('\n');
}

export function inviteState(i: { status: string; expiresAt: string }): string {
  return i.status !== 'pending' ? i.status : (new Date(i.expiresAt) < new Date() ? 'expired' : 'pending');
}

/** Add a member directly, no invite code — local single-device use, where
 *  "adding someone" just means having a name to attribute spend to, not a
 *  separate login. Never blocks on auth (D-local): status is 'active' from
 *  the start, userId stays null forever unless a real invite links it later. */
export function addMember(scope: Scope, name: string, role: 'admin' | 'member' | 'worker') {
  const colors = ['#3b5bdb', '#0f9960', '#c77700', '#7048e8', '#0c8599', '#d64545'];
  return scope.addRow('memberships', {
    id: uid(), userId: null, displayName: name.trim(),
    color: colors[scope.memberships().length % colors.length], role, status: 'active', joinedAt: new Date().toISOString()
  });
}

export function createInvite(scope: Scope, name: string, role: 'admin' | 'member' | 'worker') {
  const colors = ['#3b5bdb', '#0f9960', '#c77700', '#7048e8', '#0c8599', '#d64545'];
  const mem = scope.addRow('memberships', {
    id: uid(), userId: null, displayName: name.trim(),
    color: colors[scope.memberships().length % colors.length], role, status: 'invited', joinedAt: null
  });
  const inv = scope.addRow('invites', {
    id: uid(), membershipId: mem.id, role,
    code: newCode(name), createdBy: scope.me()!.id, createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + INVITE_DAYS * 864e5).toISOString(),
    status: 'pending', acceptedBy: null, acceptedAt: null
  });
  return inv;
}

export function revokeInvite(scope: Scope, id: string): void {
  const inv = scope.state.invites.find((i) => i.id === id);
  if (!inv) return;
  inv.status = 'revoked';
  const mem = scope.state.memberships.find((m) => m.id === inv.membershipId);
  if (mem && mem.status === 'invited') mem.status = 'inactive'; // never deleted (D32)
}

export function redeemInvite(state: StoreState, code: string): { ok: true; workspace: Workspace } | { ok: false; msg: string } {
  const inv = state.invites.find((i) => i.code.toUpperCase() === code.trim().toUpperCase());
  if (!inv) return { ok: false, msg: 'No invite matches that code' };
  const st = inviteState(inv);
  if (st === 'accepted') return { ok: false, msg: 'That code has already been used' };
  if (st === 'revoked') return { ok: false, msg: 'That invite was cancelled' };
  if (st === 'expired') return { ok: false, msg: 'That code has expired — ask for a new one' };
  const mem = state.memberships.find((m) => m.id === inv.membershipId);
  if (!mem) return { ok: false, msg: 'That invite is no longer valid' };
  if (state.memberships.some((m) => m.workspaceId === inv.workspaceId && m.userId === state.session.userId && m.status !== 'inactive')) {
    return { ok: false, msg: 'You are already in that workspace' };
  }
  mem.userId = state.session.userId;
  mem.status = 'active';
  mem.joinedAt = new Date().toISOString();
  const u = state.users.find((x) => x.id === state.session.userId);
  if (u && mem.displayName.startsWith('Invited')) mem.displayName = u.displayName;
  inv.status = 'accepted';
  inv.acceptedBy = state.session.userId;
  inv.acceptedAt = new Date().toISOString();
  state.session.workspaceId = inv.workspaceId;
  const workspace = state.workspaces.find((w) => w.id === inv.workspaceId)!;
  return { ok: true, workspace };
}

export function createWorkspace(state: StoreState, name: string, type: 'household' | 'business'): { ok: true } | { ok: false; msg: string } {
  if (!name.trim()) return { ok: false, msg: 'Give the workspace a name' };
  const wid = uid();
  const u = state.users.find((x) => x.id === state.session.userId)!;
  state.workspaces.push({
    id: wid, type, name: name.trim(), currency: 'INR',
    settings: { requireApproval: true, warnDuplicates: true, gstEnabled: type === 'business' },
    createdBy: u.id, createdAt: new Date().toISOString()
  });
  state.memberships.push({ id: uid(), workspaceId: wid, userId: u.id, displayName: u.displayName, color: '#3b5bdb', role: 'admin', status: 'active', joinedAt: new Date().toISOString() });
  const expenseCats = type === 'business'
    ? [['Materials', '📦'], ['Wages', '👷'], ['Fuel', '⛽'], ['Repairs', '🔧'], ['Rent', '🏠'], ['Utilities', '💡'], ['Other', '•']]
    : [['Groceries', '🧄'], ['Food & Dining', '🍽'], ['Transport', '🚗'], ['Utilities', '💡'], ['Rent', '🏠'], ['Health', '⚕'], ['Shopping', '🛍'], ['Entertainment', '🎬'], ['Bills & Subs', '📅'], ['Education', '📚'], ['Household', '🧹'], ['Other', '•']];
  const incomeCats = type === 'business' ? [['Sales', '🧾'], ['Other Income', '•']] : [['Salary', '💰'], ['Dividends', '📈'], ['Interest', '🏦'], ['Rental', '🔑'], ['Freelance', '💼'], ['Gift', '🎁'], ['Other Income', '•']];
  expenseCats.forEach((c) => state.categories.push({ id: uid(), workspaceId: wid, name: c[0]!, icon: c[1]!, kind: 'expense', archived: false }));
  incomeCats.forEach((c) => state.categories.push({ id: uid(), workspaceId: wid, name: c[0]!, icon: c[1]!, kind: 'income', archived: false }));
  state.accounts.push({ id: uid(), workspaceId: wid, ownerMembershipId: null, type: 'cash', name: 'Cash', last4: '', cycleDay: null, archived: false });
  state.session.workspaceId = wid;
  return { ok: true };
}
