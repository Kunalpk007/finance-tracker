/* ============================================================================
   Permissions — one function holding every permission decision (D37), so it
   can be mirrored one-for-one into Postgres RLS (see
   supabase/migrations/0004_rls.sql) rather than rediscovered. This client copy
   is for UX — never offer a button that will fail — it is NOT the security
   boundary. RLS is the boundary (H7).
============================================================================ */
import type { Transaction } from './types';
import type { Scope } from './scope';

export type Action =
  | 'approve' | 'manageSetup' | 'viewAudit' | 'editOthers' | 'exportAll'
  | 'attribute' | 'viewWorkspaceTotals' | 'logDirect';

export function can(scope: Scope, action: Action): boolean {
  const me = scope.me();
  if (!me) return false;
  const r = me.role;
  const biz = scope.workspace?.type === 'business';
  switch (action) {
    case 'approve':
    case 'manageSetup':
    case 'viewAudit':
    case 'editOthers':
    case 'exportAll':
      return r === 'admin';
    case 'attribute':
      return r === 'admin' && !biz; // D20
    case 'viewWorkspaceTotals':
      return r !== 'worker'; // D34
    case 'logDirect':
      return r === 'admin' || (!biz && r === 'member');
    default:
      return false;
  }
}

/** A worker sees only their own rows. Applied at the source, so every total,
 *  chart and export inherits the restriction instead of each one remembering
 *  to apply it. */
export function visibleTx(scope: Scope): Transaction[] {
  if (can(scope, 'viewWorkspaceTotals')) return scope.transactions();
  const me = scope.me();
  if (!me) return [];
  return scope.transactions().filter((t) => t.paidByMembershipId === me.id || t.loggedByMembershipId === me.id);
}

function owns(scope: Scope, t: Transaction | undefined): boolean {
  const me = scope.me();
  if (!t || !me) return false;
  return t.loggedByMembershipId === me.id || t.paidByMembershipId === me.id;
}

/* ------------------- entry lifecycle: what may still change ---------------
     new ──> submitted ──> approved(confirmed) ──> voided
                 │              (immutable)         (admin only, with a reason)
                 └──> rejected ──> edit & resubmit

   submitted : nobody edits. The owner may withdraw it. Editing a pending
               claim would let an amount change under the approver between
               the moment they read it and the moment they tap Approve.
   approved  : nobody edits, nobody deletes. It is counted in totals and
               probably reimbursed; deleting it would silently rewrite
               reports someone has already read. An admin voids it instead,
               with a required reason, and the row stays.
   rejected  : the owner may edit and resubmit — that is what the reason is
               for.

   Entries logged directly (a household, or an admin) never enter this
   machine and stay editable by their owner, which is why `wasSubmitted` is
   tracked separately from `status`.
--------------------------------------------------------------------------- */
export function canEdit(scope: Scope, t: Transaction | undefined): boolean {
  if (!t) return false;
  if (t.status === 'submitted' || t.status === 'voided') return false;
  if (t.status === 'confirmed' && t.wasSubmitted) return false; // approved is final
  return can(scope, 'editOthers') || owns(scope, t);
}

export function canDelete(scope: Scope, t: Transaction | undefined): boolean {
  if (!t) return false;
  if (t.status === 'voided') return false;
  if (t.status === 'confirmed' && t.wasSubmitted) return false; // void it, don't erase it
  return can(scope, 'editOthers') || owns(scope, t);
}

/** Only an admin, only on an approved claim, and only with a reason on the record. */
export function canVoid(scope: Scope, t: Transaction | undefined): boolean {
  return !!t && t.status === 'confirmed' && t.wasSubmitted && can(scope, 'approve');
}

export function lifecycleNote(t: Transaction | undefined): string {
  if (!t) return '';
  if (t.status === 'submitted') return 'Waiting for approval — it cannot be edited while it sits in the queue. Withdraw it if it is wrong.';
  if (t.status === 'rejected') return 'Sent back to you. Fix it and it returns to the queue.';
  if (t.status === 'voided') return 'Voided. It stays on record but counts toward nothing.';
  if (t.status === 'confirmed' && t.wasSubmitted) return 'Approved, so it is final. An admin can void it with a reason if it is wrong.';
  return '';
}

/** The remedy for a genuine mistake on an approved entry. The reason is
 *  enforced HERE, not in a UI click handler — a rule that only lives in the
 *  UI is a suggestion, not a rule (this was bug #6 found by the original
 *  test harness: `voidTx()` accepted an empty reason). */
export function voidTx(scope: Scope, t: Transaction, reason: string): { ok: true } | { ok: false; msg: string } {
  if (!canVoid(scope, t)) return { ok: false, msg: 'This entry cannot be voided.' };
  if (!reason || !reason.trim()) return { ok: false, msg: 'A reason is required to void an entry.' };
  const me = scope.me()!;
  t.status = 'voided';
  t.voidedByMembershipId = me.id;
  t.voidedAt = new Date().toISOString();
  t.voidReason = reason.trim();
  t.updatedAt = new Date().toISOString();
  return { ok: true };
}

/** Editing an already-approved entry as a non-admin sends it back to the
 *  approval queue (D50) — otherwise approval is theatre: the submitter could
 *  approve a small amount then quietly raise it. */
export function onNonAdminEditApproved(scope: Scope, t: Transaction): void {
  if (t.status === 'confirmed' && t.wasSubmitted && !can(scope, 'approve')) {
    t.status = 'submitted';
    t.approvedByMembershipId = null;
    t.approvedAt = null;
  }
}
