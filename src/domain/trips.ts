/* ============================================================================
   Trips — a self-contained mini-ledger for one-off travel spend, deliberately
   isolated from the household's regular transactions/budgets (see Trip in
   domain/types.ts). Trip members are ad-hoc names, not workspace memberships,
   so a friend who isn't in the household can still be attributed spend and
   included in the settle-up split.
============================================================================ */
import type { Scope } from './scope';
import type { TripCategory, TripExpense, TripKind } from './types';
import { sumPaise } from './money';

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export const TRIP_CATEGORIES: [TripCategory, string, string][] = [
  ['commute', '🚕', 'Commute'], ['flights', '✈', 'Flights'], ['hotel', '🏨', 'Hotel'],
  ['food', '🍽', 'Food'], ['shopping', '🛍', 'Shopping'], ['entertainment', '🎬', 'Entertainment'],
  ['activities', '🎫', 'Activities'], ['health', '⚕', 'Health'], ['other', '•', 'Other']
];

/** An "Event" is a Trip row with a kind — trip/festival/other — all sharing
 *  the same self-contained mini-ledger below, just labeled/iconed differently. */
export const TRIP_KINDS: [TripKind, string, string][] = [
  ['trip', '🧳', 'Trip'], ['festival', '🪔', 'Festival'], ['other', '📌', 'Occasion']
];

export function createTrip(scope: Scope, name: string, startDate: string | null, endDate: string | null, kind: TripKind = 'trip'): { ok: true; id: string } | { ok: false; msg: string } {
  if (!name.trim()) return { ok: false, msg: 'Give the event a name' };
  const trip = scope.addRow('trips', {
    id: uid(), name: name.trim(), kind, startDate: startDate || null, endDate: endDate || null,
    status: 'active', createdByMembershipId: scope.me()?.id ?? null, createdAt: new Date().toISOString()
  });
  return { ok: true, id: trip.id };
}

export function closeTrip(scope: Scope, tripId: string): void {
  const t = scope.state.trips.find((x) => x.id === tripId);
  if (t) t.status = t.status === 'closed' ? 'active' : 'closed';
}

export function addTripMember(scope: Scope, tripId: string, name: string) {
  const colors = ['#3b5bdb', '#0f9960', '#c77700', '#7048e8', '#0c8599', '#d64545'];
  const existing = scope.tripMembers(tripId).length;
  return scope.addRow('tripMembers', { id: uid(), tripId, name: name.trim(), color: colors[existing % colors.length] });
}

/** Comma/newline-separated names -> trimmed, non-empty list. */
export function parseNames(csv: string): string[] {
  return csv.split(/[,\n]/).map((n) => n.trim()).filter(Boolean);
}

/** The single path for adding people to an event — used at creation and by the
 *  "Add people" button. Skips names already in the event (case-insensitive) and
 *  returns just the newly added names, so callers invite only those. */
export function addTripPeople(scope: Scope, tripId: string, names: string[]): string[] {
  const have = new Set(scope.tripMembers(tripId).map((m) => m.name.toLowerCase()));
  const added: string[] = [];
  for (const n of names) {
    if (have.has(n.toLowerCase())) continue;
    have.add(n.toLowerCase());
    addTripMember(scope, tripId, n);
    added.push(n);
  }
  return added;
}

/** WhatsApp text for inviting people to an event. Trip members are ad-hoc names
 *  (no login), so this is a heads-up with the app link, not a redeemable code. */
export function tripInviteText(a: { names: string[]; event: string; inviter: string; url: string }): string {
  return [
    `Hi ${a.names.join(', ')}! ${a.inviter} added you to the event "${a.event}" on Finance Tracker to split expenses.`,
    '',
    `Open the app: ${a.url}`
  ].join('\n');
}

/** Blocks removal if the member has expenses attached — reassigning or
 *  deleting those first keeps every expense's paidBy pointing at someone real. */
export function removeTripMember(scope: Scope, memberId: string): { ok: true } | { ok: false; msg: string } {
  const used = scope.state.tripExpenses.some((e) => expensePayments(e).some((p) => p.memberId === memberId));
  if (used) return { ok: false, msg: 'This person has expenses logged — remove those first.' };
  scope.state.tripMembers = scope.state.tripMembers.filter((m) => m.id !== memberId);
  return { ok: true };
}

/** An event always has at least its creator, so "Paid by" is never empty. */
export function ensureTripSelf(scope: Scope, tripId: string): void {
  if (!scope.tripMembers(tripId).length) addTripPeople(scope, tripId, [scope.me()?.displayName ?? 'Me']);
}

export type TripExpenseInput = Omit<TripExpense, 'id' | 'workspaceId' | 'tripId' | 'createdAt'>;

export function addTripExpense(scope: Scope, tripId: string, input: TripExpenseInput) {
  return scope.addRow('tripExpenses', { id: uid(), tripId, createdAt: new Date().toISOString(), ...input });
}

/** [icon, label] for an expense's category, built-in or user-typed. */
export function tripCategoryMeta(category: TripCategory, label?: string): [string, string] {
  if (category === 'custom') return ['✏', label || 'Custom'];
  const c = TRIP_CATEGORIES.find((x) => x[0] === category);
  return [c?.[1] ?? '•', c?.[2] ?? category];
}

/** Who paid how much; legacy single-payer rows have no `payments`. */
export function expensePayments(e: TripExpense): { memberId: string; amountPaise: number }[] {
  return e.payments?.length ? e.payments : [{ memberId: e.paidByTripMemberId, amountPaise: e.amountPaise }];
}

/** Each sharer's cut of one bill: the chosen members (or everyone), with the
 *  odd paise handed out one each so the shares always sum to the bill. */
export function expenseShares(scope: Scope, e: TripExpense): Record<string, number> {
  const all = scope.tripMembers(e.tripId).map((m) => m.id);
  const picked = (e.splitAmong ?? []).filter((id) => all.includes(id));
  const who = picked.length ? picked : all;
  const base = Math.floor(e.amountPaise / who.length), extra = e.amountPaise - base * who.length;
  return Object.fromEntries(who.map((id, i) => [id, base + (i < extra ? 1 : 0)]));
}

export function removeTripExpense(scope: Scope, expenseId: string): void {
  scope.state.tripExpenses = scope.state.tripExpenses.filter((e) => e.id !== expenseId);
}

export function tripTotalPaise(scope: Scope, tripId: string): number {
  return sumPaise(scope.tripExpenses(tripId).map((e) => e.amountPaise));
}

/** Keyed by category id; custom ones by "custom:<label>" so each name totals separately. */
export function tripCategoryTotals(scope: Scope, tripId: string): Record<string, number> {
  const map: Record<string, number> = {};
  scope.tripExpenses(tripId).forEach((e) => {
    const k = e.category === 'custom' ? `custom:${e.categoryLabel ?? ''}` : e.category;
    map[k] = (map[k] || 0) + e.amountPaise;
  });
  return map;
}

/** Per-member balance: what they paid minus their share of every bill they
 *  were part of. Positive = owed money back, negative = still owes. */
export function tripBalances(scope: Scope, tripId: string): { memberId: string; name: string; paidPaise: number; balancePaise: number }[] {
  const expenses = scope.tripExpenses(tripId);
  const shares = expenses.map((e) => expenseShares(scope, e));
  return scope.tripMembers(tripId).map((m) => {
    const paid = sumPaise(expenses.flatMap(expensePayments).filter((p) => p.memberId === m.id).map((p) => p.amountPaise));
    const owed = sumPaise(shares.map((s) => s[m.id] ?? 0));
    return { memberId: m.id, name: m.name, paidPaise: paid, balancePaise: paid - owed };
  });
}
