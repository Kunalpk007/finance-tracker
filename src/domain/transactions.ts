/* ============================================================================
   Transaction lifecycle: create, edit, approve, reject, audit.
   Ported from the original app's quick-add + approvals logic, with the same
   rules: a non-admin logging spend in a business workspace (when the
   workspace requires approval) is making a CLAIM, not a record (D51-D56).
============================================================================ */
import type { Category, Transaction } from './types';
import type { Scope } from './scope';
import { byId } from './scope';
import { can, onNonAdminEditApproved } from './permissions';
import { today } from './dates';
import { formatMoney } from './money';

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function logAudit(scope: Scope, action: string, txId: string | null, detail: string): void {
  if (!scope.state.audit) scope.state.audit = [];
  scope.addRow('audit', {
    id: uid(), ts: new Date().toISOString(), actorMembershipId: scope.me()?.id,
    action, entityType: 'transaction', entityId: txId, detail: detail || ''
  });
  if (scope.state.audit.length > 2000) scope.state.audit = scope.state.audit.slice(-2000);
}

/** A non-admin logging spend in a business workspace (that requires
 *  approval) is making a CLAIM, not a record. */
export function needsApproval(scope: Scope): boolean {
  const w = scope.workspace;
  return !!w && w.type === 'business' && !!w.settings?.requireApproval && !can(scope, 'logDirect');
}

export interface DraftTx {
  id: string | null;
  type: 'expense' | 'income' | 'transfer';
  amountPaise: number;
  date: string;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  paidByMembershipId: string;
  isPersonal: boolean;
  note: string;
  vendor: string;
  photoPath: string | null;
}

export function newDraft(scope: Scope, type: 'expense' | 'income' | 'transfer' = 'expense'): DraftTx {
  const me = scope.me();
  return {
    id: null, type, amountPaise: 0, date: today(), categoryId: null,
    accountId: scope.meta().lastAccountId || scope.accounts()[0]?.id || '',
    toAccountId: null, paidByMembershipId: me?.id || '', isPersonal: false,
    note: '', vendor: '', photoPath: null
  };
}

/** Same amount, same day, same vendor is almost always a double-entry or
 *  padding. Warned once, never blocked — a false positive must never stop a
 *  legitimate entry. */
export function findDuplicate(scope: Scope, d: DraftTx): Transaction | undefined {
  return scope.transactions().find((t) =>
    t.id !== d.id && t.type === d.type && t.date === d.date &&
    Math.abs(t.amountPaise - d.amountPaise) < 1 &&
    (d.vendor ? (t.vendor || '').toLowerCase() === d.vendor.toLowerCase() : t.categoryId === d.categoryId)
  );
}

/** Category order is driven by usage frequency, not the alphabet — this is
 *  what makes a sub-10-second entry possible. */
export function catsByFrequency(scope: Scope, kind: 'expense' | 'income'): Category[] {
  const freq: Record<string, number> = {};
  scope.transactions().forEach((t) => { if (t.categoryId) freq[t.categoryId] = (freq[t.categoryId] || 0) + 1; });
  return scope.categories()
    .filter((c) => c.kind === kind && !c.archived)
    .sort((a, b) => (freq[b.id] || 0) - (freq[a.id] || 0));
}

export function knownVendors(scope: Scope): string[] {
  return [...new Set(scope.transactions().map((t) => t.vendor).filter(Boolean))].sort();
}

export function saveTransaction(scope: Scope, draft: DraftTx): Transaction {
  const me = scope.me()!;
  const now = new Date().toISOString();
  if (draft.id) {
    const existing = byId(scope.state.transactions, draft.id)!;
    Object.assign(existing, {
      type: draft.type, amountPaise: draft.amountPaise, date: draft.date, categoryId: draft.categoryId,
      accountId: draft.accountId, toAccountId: draft.toAccountId, paidByMembershipId: draft.paidByMembershipId,
      isPersonal: draft.isPersonal, note: draft.note, vendor: draft.vendor, photoPath: draft.photoPath,
      updatedAt: now, version: existing.version + 1
    });
    onNonAdminEditApproved(scope, existing);
    if (existing.status === 'rejected') existing.status = 'submitted'; // resubmit (D54)
    logAudit(scope, 'edited', existing.id, `${formatMoney(existing.amountPaise)} edited`);
    return existing;
  }
  const status = needsApproval(scope) ? 'submitted' : (draft.type === 'income' ? 'confirmed' : 'confirmed');
  const row: Transaction = {
    id: uid(), workspaceId: scope.activeWorkspaceId!, type: draft.type, amountPaise: draft.amountPaise,
    date: draft.date, categoryId: draft.categoryId, accountId: draft.accountId, toAccountId: draft.toAccountId,
    paidByMembershipId: draft.paidByMembershipId, loggedByMembershipId: me.id, isPersonal: draft.isPersonal,
    vendor: draft.vendor, note: draft.note, photoPath: draft.photoPath, status,
    recurringId: null, approvedByMembershipId: null, approvedAt: null, rejectReason: null,
    voidedByMembershipId: null, voidedAt: null, voidReason: null, wasSubmitted: status === 'submitted',
    createdAt: now, updatedAt: now, version: 1, deletedAt: null
  };
  const stored = scope.addRow('transactions', row) as Transaction;
  logAudit(scope, status === 'submitted' ? 'submitted' : 'created', stored.id, `${formatMoney(stored.amountPaise)} ${stored.type}`);
  const meta = scope.meta();
  meta.lastAccountId = draft.accountId;
  if (draft.categoryId) {
    meta.lastByCategory ??= {};
    meta.lastByCategory[draft.categoryId] = { accountId: draft.accountId, paidByMembershipId: draft.paidByMembershipId };
  }
  return stored;
}

export function approveTx(scope: Scope, id: string): void {
  if (!can(scope, 'approve')) return;
  const t = byId(scope.state.transactions, id);
  if (!t) return;
  t.status = 'confirmed';
  t.wasSubmitted = true;
  t.approvedByMembershipId = scope.me()!.id;
  t.approvedAt = new Date().toISOString();
  logAudit(scope, 'approved', id, `${formatMoney(t.amountPaise)} approved`);
}

export function rejectTx(scope: Scope, id: string, reason: string): void {
  if (!can(scope, 'approve')) return;
  const t = byId(scope.state.transactions, id);
  if (!t) return;
  t.status = 'rejected';
  t.rejectReason = reason || '';
  t.approvedByMembershipId = scope.me()!.id;
  logAudit(scope, 'rejected', id, `${formatMoney(t.amountPaise)} rejected${reason ? ': ' + reason : ''}`);
}

export function pendingSubs(scope: Scope): Transaction[] {
  return scope.transactions().filter((t) => t.status === 'submitted');
}

export function deleteTransaction(scope: Scope, id: string): boolean {
  const t = byId(scope.state.transactions, id);
  if (!t) return false;
  t.deletedAt = new Date().toISOString();
  logAudit(scope, 'deleted', id, `${formatMoney(t.amountPaise)} deleted`);
  return true;
}

/* --------------------- recurring rules -> pending entries ----------------
   Recurring income posts as PENDING, never auto-confirmed (D11) — salary
   that hasn't landed yet must not show as income you have. One tap in the
   entries list confirms it once it actually arrives. */
export function runRecurring(scope: Scope, currentMonthKey: string, todayDate: number, monthAddFn: (k: string, n: number) => string, daysInMonthFn: (y: number, m: number) => number): number {
  let made = 0;
  for (const r of scope.recurring()) {
    if (!r.active) continue;
    let cursor = r.lastGenerated || monthAddFn(currentMonthKey, -1);
    while (cursor !== currentMonthKey) {
      cursor = monthAddFn(cursor, 1);
      const parts = cursor.split('-').map(Number);
      const y = parts[0]!, m = parts[1]!;
      const day = Math.min(r.dayOfMonth, daysInMonthFn(y, m));
      if (cursor === currentMonthKey && todayDate < day) break; // not due yet
      const date = `${cursor}-${String(day).padStart(2, '0')}`;
      const dupe = scope.transactions().some((t) => t.recurringId === r.id && t.date.slice(0, 7) === cursor);
      if (!dupe) {
        const me = scope.activeMembers()[0];
        scope.addRow('transactions', {
          id: uid(), type: r.type, amountPaise: r.amountPaise, date, categoryId: r.categoryId,
          accountId: r.accountId, toAccountId: null,
          paidByMembershipId: r.membershipId || me?.id, loggedByMembershipId: r.membershipId || me?.id,
          isPersonal: false, vendor: '', note: r.note || '', photoPath: null, recurringId: r.id,
          status: 'pending', approvedByMembershipId: null, approvedAt: null, rejectReason: null,
          voidedByMembershipId: null, voidedAt: null, voidReason: null, wasSubmitted: false,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, deletedAt: null
        });
        made++;
      }
      r.lastGenerated = cursor;
    }
  }
  return made;
}

/** One-tap confirm on a pending recurring entry (e.g. salary that has now landed). */
export function confirmPending(scope: Scope, id: string): void {
  const t = byId(scope.state.transactions, id);
  if (!t || t.status !== 'pending') return;
  t.status = 'confirmed';
  t.updatedAt = new Date().toISOString();
  logAudit(scope, 'confirmed', id, `${formatMoney(t.amountPaise)} confirmed`);
}
