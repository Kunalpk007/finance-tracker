import { describe, it, expect } from 'vitest';
import { baseFixture, signInAs } from './fixtures';
import { needsApproval, newDraft, saveTransaction, findDuplicate, approveTx, rejectTx, pendingSubs } from '../../src/domain/transactions';

describe('transaction save — the claim vs. record distinction (D51)', () => {
  it('a worker logging spend in a business workspace that requires approval creates a submitted claim', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u3', 'w2');
    expect(needsApproval(scope)).toBe(true);
    const draft = newDraft(scope, 'expense');
    draft.amountPaise = 50000;
    draft.categoryId = 'c2';
    const saved = saveTransaction(scope, draft);
    expect(saved.status).toBe('submitted');
    expect(saved.wasSubmitted).toBe(true);
    expect(pendingSubs(scope).map((t) => t.id)).toContain(saved.id);
  });

  it('a household member logging spend records it directly, confirmed', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u2', 'w1');
    expect(needsApproval(scope)).toBe(false);
    const draft = newDraft(scope, 'expense');
    draft.amountPaise = 30000;
    draft.categoryId = 'c1';
    const saved = saveTransaction(scope, draft);
    expect(saved.status).toBe('confirmed');
    expect(saved.wasSubmitted).toBe(false);
  });

  it('an admin approving a claim marks it confirmed and stamps who/when', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u3', 'w2');
    const draft = newDraft(scope, 'expense');
    draft.amountPaise = 40000;
    draft.categoryId = 'c2';
    const saved = saveTransaction(scope, draft);

    signInAs(state, 'u1', 'w2');
    approveTx(scope, saved.id);
    expect(saved.status).toBe('confirmed');
    expect(saved.approvedByMembershipId).toBe('b1');
  });

  it('a worker cannot approve their own claim (approveTx no-ops without permission)', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u3', 'w2');
    const draft = newDraft(scope, 'expense');
    draft.amountPaise = 40000;
    draft.categoryId = 'c2';
    const saved = saveTransaction(scope, draft);
    approveTx(scope, saved.id); // still signed in as the worker
    expect(saved.status).toBe('submitted'); // unchanged
  });

  it('rejecting records a reason and leaves the claim rejectable-and-editable', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u3', 'w2');
    const draft = newDraft(scope, 'expense');
    draft.amountPaise = 40000;
    draft.categoryId = 'c2';
    const saved = saveTransaction(scope, draft);
    signInAs(state, 'u1', 'w2');
    rejectTx(scope, saved.id, 'No receipt');
    expect(saved.status).toBe('rejected');
    expect(saved.rejectReason).toBe('No receipt');
  });
});

describe('duplicate detection', () => {
  it('flags same amount + same day + same vendor as a likely duplicate, warns not blocks', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u2', 'w1');
    const draft = newDraft(scope, 'expense');
    draft.amountPaise = 30000;
    draft.categoryId = 'c1';
    draft.vendor = 'DMart';
    saveTransaction(scope, draft);

    const dupeDraft = newDraft(scope, 'expense');
    dupeDraft.amountPaise = 30000;
    dupeDraft.vendor = 'DMart';
    const dupe = findDuplicate(scope, dupeDraft);
    expect(dupe).toBeDefined();
  });

  it('does not flag a different amount as a duplicate', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u2', 'w1');
    const draft = newDraft(scope, 'expense');
    draft.amountPaise = 30000;
    draft.vendor = 'DMart';
    saveTransaction(scope, draft);

    const other = newDraft(scope, 'expense');
    other.amountPaise = 45000;
    other.vendor = 'DMart';
    expect(findDuplicate(scope, other)).toBeUndefined();
  });
});
