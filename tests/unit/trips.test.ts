import { describe, it, expect } from 'vitest';
import { baseFixture, signInAs } from './fixtures';
import { createTrip, addTripMember, removeTripMember, addTripExpense, removeTripExpense, tripTotalPaise, tripCategoryTotals, tripBalances } from '../../src/domain/trips';

describe('trips — an isolated mini-ledger with an equal-split settle-up', () => {
  it('creating a trip requires a name and scopes it to the active workspace', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w1');
    expect(createTrip(scope, '', null, null).ok).toBe(false);
    const res = createTrip(scope, 'Goa 2026', '2026-12-20', '2026-12-25');
    expect(res.ok).toBe(true);
    expect(state.trips[0]!.workspaceId).toBe('w1');
  });

  it('trip spend never counts toward the household — it lives in its own tables', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w1');
    const trip = createTrip(scope, 'Goa 2026', null, null);
    if (!trip.ok) throw new Error('setup');
    const person = addTripMember(scope, trip.id, 'Kunal');
    addTripExpense(scope, trip.id, { category: 'hotel', amountPaise: 500000, date: '2026-12-20', paidByTripMemberId: person.id, note: '' });
    expect(state.transactions.length).toBe(0); // nothing leaked into the household ledger
    expect(tripTotalPaise(scope, trip.id)).toBe(500000);
  });

  it('category totals group expenses correctly', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w1');
    const trip = createTrip(scope, 'Goa 2026', null, null);
    if (!trip.ok) throw new Error('setup');
    const p = addTripMember(scope, trip.id, 'Kunal');
    addTripExpense(scope, trip.id, { category: 'food', amountPaise: 2000, date: '2026-12-20', paidByTripMemberId: p.id, note: '' });
    addTripExpense(scope, trip.id, { category: 'food', amountPaise: 3000, date: '2026-12-21', paidByTripMemberId: p.id, note: '' });
    addTripExpense(scope, trip.id, { category: 'hotel', amountPaise: 10000, date: '2026-12-20', paidByTripMemberId: p.id, note: '' });
    const totals = tripCategoryTotals(scope, trip.id);
    expect(totals.food).toBe(5000);
    expect(totals.hotel).toBe(10000);
  });

  it('an equal split: whoever paid more than their fair share is owed money back', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w1');
    const trip = createTrip(scope, 'Goa 2026', null, null);
    if (!trip.ok) throw new Error('setup');
    const a = addTripMember(scope, trip.id, 'Kunal');
    const b = addTripMember(scope, trip.id, 'Priya');
    // total 3000, split evenly = 1500 each. Kunal paid 3000, Priya paid 0.
    addTripExpense(scope, trip.id, { category: 'food', amountPaise: 3000, date: '2026-12-20', paidByTripMemberId: a.id, note: '' });
    const balances = tripBalances(scope, trip.id);
    const kunal = balances.find((x) => x.memberId === a.id)!;
    const priya = balances.find((x) => x.memberId === b.id)!;
    expect(kunal.balancePaise).toBe(1500); // gets 1500 back
    expect(priya.balancePaise).toBe(-1500); // owes 1500
  });

  it('a trip member with expenses attached cannot be removed until those are reassigned or deleted', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w1');
    const trip = createTrip(scope, 'Goa 2026', null, null);
    if (!trip.ok) throw new Error('setup');
    const p = addTripMember(scope, trip.id, 'Kunal');
    const expense = addTripExpense(scope, trip.id, { category: 'food', amountPaise: 1000, date: '2026-12-20', paidByTripMemberId: p.id, note: '' });
    expect(removeTripMember(scope, p.id).ok).toBe(false);
    removeTripExpense(scope, expense.id);
    expect(removeTripMember(scope, p.id).ok).toBe(true);
  });
});
