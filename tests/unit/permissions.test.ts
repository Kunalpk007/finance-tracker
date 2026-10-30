import { describe, it, expect } from 'vitest';
import { baseFixture, signInAs } from './fixtures';
import { can, canEdit, canDelete, canVoid, visibleTx, voidTx, onNonAdminEditApproved } from '../../src/domain/permissions';
import type { Transaction } from '../../src/domain/types';

function mkTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 't1', workspaceId: 'w2', type: 'expense', amountPaise: 100000, date: '2026-08-01',
    categoryId: 'c2', accountId: 'ba1', toAccountId: null, paidByMembershipId: 'b2', loggedByMembershipId: 'b2',
    isPersonal: false, vendor: '', note: '', photoPath: null, status: 'submitted', recurringId: null,
    approvedByMembershipId: null, approvedAt: null, rejectReason: null, voidedByMembershipId: null, voidedAt: null, voidReason: null,
    wasSubmitted: true, createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-01T00:00:00Z', version: 1, deletedAt: null,
    ...overrides
  };
}

describe('permissions — role matrix', () => {
  it('a worker cannot approve, manage setup, or see the audit log', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u3', 'w2');
    expect(can(scope, 'approve')).toBe(false);
    expect(can(scope, 'manageSetup')).toBe(false);
    expect(can(scope, 'viewAudit')).toBe(false);
  });

  it('an admin can approve in both workspace types', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w2');
    expect(can(scope, 'approve')).toBe(true);
    signInAs(state, 'u1', 'w1');
    expect(can(scope, 'approve')).toBe(true);
  });

  it('a household member can log directly; a business worker cannot (D51 claim flow)', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u2', 'w1');
    expect(can(scope, 'logDirect')).toBe(true);
    signInAs(state, 'u3', 'w2');
    expect(can(scope, 'logDirect')).toBe(false);
  });

  it('business mode locks attribution permanently (D20)', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w2');
    expect(can(scope, 'attribute')).toBe(false); // even admin, because it's a business
    signInAs(state, 'u1', 'w1');
    expect(can(scope, 'attribute')).toBe(true); // household admin may attribute
  });
});

describe('permissions — worker visibility (D34/D41)', () => {
  it('a worker sees only rows they paid for or logged; an admin sees everything', () => {
    const { state, scope } = baseFixture();
    state.transactions = [
      mkTx({ id: 't-own', paidByMembershipId: 'b2', loggedByMembershipId: 'b2' }),
      mkTx({ id: 't-other', paidByMembershipId: 'b1', loggedByMembershipId: 'b1' })
    ];
    signInAs(state, 'u3', 'w2');
    const seenByWorker = visibleTx(scope).map((t) => t.id);
    expect(seenByWorker).toEqual(['t-own']);

    signInAs(state, 'u1', 'w2');
    const seenByAdmin = visibleTx(scope).map((t) => t.id).sort();
    expect(seenByAdmin).toEqual(['t-other', 't-own']);
  });
});

describe('permissions — entry lifecycle (D51-D56)', () => {
  it('a submitted claim cannot be edited or deleted by anyone, only withdrawn by its owner', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u3', 'w2');
    const t = mkTx({ status: 'submitted', paidByMembershipId: 'b2', loggedByMembershipId: 'b2' });
    expect(canEdit(scope, t)).toBe(false);
    expect(canDelete(scope, t)).toBe(true); // owner may withdraw (delete while submitted)
  });

  it('an approved (confirmed + wasSubmitted) entry is immutable, even to its owner', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u3', 'w2');
    const t = mkTx({ status: 'confirmed', wasSubmitted: true, paidByMembershipId: 'b2', loggedByMembershipId: 'b2' });
    expect(canEdit(scope, t)).toBe(false);
    expect(canDelete(scope, t)).toBe(false);
  });

  it('an admin may void an approved entry, but only with a non-empty reason (bug the original harness caught)', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w2');
    const t = mkTx({ status: 'confirmed', wasSubmitted: true });
    expect(canVoid(scope, t)).toBe(true);
    expect(voidTx(scope, t, '   ')).toEqual({ ok: false, msg: 'A reason is required to void an entry.' });
    expect(t.status).toBe('confirmed'); // rejected attempt must not have mutated the row
    const result = voidTx(scope, t, 'Duplicate entry');
    expect(result.ok).toBe(true);
    expect(t.status).toBe('voided');
    expect(t.voidReason).toBe('Duplicate entry');
  });

  it('a rejected claim stays editable by its owner (D54)', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u3', 'w2');
    const t = mkTx({ status: 'rejected', paidByMembershipId: 'b2', loggedByMembershipId: 'b2' });
    expect(canEdit(scope, t)).toBe(true);
  });

  it('a non-admin editing an approved entry sends it back to submitted (D50)', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u3', 'w2');
    const t = mkTx({ status: 'confirmed', wasSubmitted: true, paidByMembershipId: 'b2', loggedByMembershipId: 'b2' });
    onNonAdminEditApproved(scope, t);
    expect(t.status).toBe('submitted');
    expect(t.approvedByMembershipId).toBe(null);
  });

  it('a household entry (never submitted) stays editable by its owner regardless of status quirks', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u2', 'w1');
    const t = mkTx({ workspaceId: 'w1', status: 'confirmed', wasSubmitted: false, paidByMembershipId: 'm2', loggedByMembershipId: 'm2' });
    expect(canEdit(scope, t)).toBe(true);
    expect(canDelete(scope, t)).toBe(true);
  });
});
