import { describe, it, expect } from 'vitest';
import { baseFixture, signInAs } from './fixtures';
import { iso } from '../../src/domain/dates';
import {
  effectiveQty, runwayDays, itemState, needsBuying, priceAlert, reconcileItem,
  buyNextPreview, lastBought, guessItem, recordStockAdjustment
} from '../../src/domain/pantry';
import type { PantryItem, PurchaseLine, Transaction } from '../../src/domain/types';

function daysAgo(n: number): string {
  return iso(new Date(Date.now() - n * 86400000));
}

function confirmedExpense(overrides: Partial<Transaction>): Transaction {
  return {
    id: overrides.id ?? 't-buy', workspaceId: 'w1', type: 'expense', amountPaise: 0, date: daysAgo(0),
    categoryId: 'c1', accountId: 'a1', toAccountId: null, paidByMembershipId: 'm1', loggedByMembershipId: 'm1',
    isPersonal: false, vendor: '', note: '', photoPath: null, status: 'confirmed', recurringId: null,
    approvedByMembershipId: null, approvedAt: null, rejectReason: null, voidedByMembershipId: null, voidedAt: null, voidReason: null,
    wasSubmitted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, deletedAt: null,
    ...overrides
  };
}

describe('pantry — derived stock (D57)', () => {
  it("Kunal's own example: buy 5kg rice, ask again 2 weeks later — shows the estimate and the last purchase", () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w1');

    const boughtDate = daysAgo(14); // "2 weeks ago"
    const item: PantryItem = {
      id: 'p-rice', workspaceId: 'w1', name: 'Rice', tier: 'staple', group: 'grain', unit: 'kg',
      fullQty: 10, weeklyUsage: 1.5, shelfLifeDays: null, lowDays: 7,
      baseQty: 0, baseAt: boughtDate, lastReconciled: null, archived: false, createdAt: boughtDate
    };
    state.pantryItems = [item];

    const tx = confirmedExpense({ id: 'tx-rice', date: boughtDate, amountPaise: 30000 }); // ₹300 for 5kg
    state.transactions = [tx];
    const line: PurchaseLine = { id: 'pl-rice', workspaceId: 'w1', transactionId: tx.id, itemId: item.id, qty: 5, costPaise: 30000 };
    state.purchaseLines = [line];

    // effective stock after 14 days at 1.5kg/week usage: 5 - 1.5*14/7 = 5 - 3 = 2kg
    const qty = effectiveQty(scope, item);
    expect(qty).toBeCloseTo(2, 5);

    const preview = buyNextPreview(scope, 'rice');
    expect(preview.item?.id).toBe('p-rice');
    expect(preview.estimateQty).toBeCloseTo(2, 5);
    expect(preview.estimateLabel).toContain('kg left');
    expect(preview.lastPurchase).toEqual({ date: boughtDate, qty: 5, unitPricePaise: 6000 }); // ₹60/kg
    expect(lastBought(scope, item.id)).toBe(boughtDate);
  });

  it('an unapproved (submitted) claim does not move stock, and voiding reverses it', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w2');
    const item: PantryItem = {
      id: 'p-diesel', workspaceId: 'w2', name: 'Diesel', tier: 'staple', group: 'other', unit: 'L',
      fullQty: 60, weeklyUsage: 35, shelfLifeDays: null, lowDays: 7,
      baseQty: 10, baseAt: daysAgo(2), lastReconciled: null, archived: false, createdAt: daysAgo(2)
    };
    state.pantryItems = [item];
    const submittedTx = confirmedExpense({ id: 'tx-d', workspaceId: 'w2', status: 'submitted', date: daysAgo(1), accountId: 'ba1', paidByMembershipId: 'b1', loggedByMembershipId: 'b1' });
    state.transactions = [submittedTx];
    state.purchaseLines = [{ id: 'pl-d', workspaceId: 'w2', transactionId: submittedTx.id, itemId: item.id, qty: 40, costPaise: 400000 }];

    const beforeApproval = effectiveQty(scope, item);
    expect(beforeApproval).toBeLessThan(10 + 40); // the 40L purchase is not counted yet

    submittedTx.status = 'confirmed';
    const afterApproval = effectiveQty(scope, item);
    expect(afterApproval).toBeGreaterThan(beforeApproval);

    submittedTx.status = 'voided';
    const afterVoid = effectiveQty(scope, item);
    expect(afterVoid).toBeCloseTo(beforeApproval, 5);
  });

  it('perishables get freshness, not a runway estimate', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w1');
    const item: PantryItem = {
      id: 'p-tom', workspaceId: 'w1', name: 'Tomato', tier: 'perishable', group: 'vegetable', unit: 'kg',
      fullQty: 2, weeklyUsage: 0, shelfLifeDays: 5, lowDays: 7,
      baseQty: 1, baseAt: daysAgo(6), lastReconciled: null, archived: false, createdAt: daysAgo(6)
    };
    state.pantryItems = [item];
    expect(runwayDays(scope, item)).toBe(null);
    const st = itemState(scope, item);
    expect(st.key).toBe('gone'); // 6 days old against a 5-day shelf life
  });

  it('reconcile blends the implied usage rate 60/40 rather than replacing it, and refuses a sub-3-day sample', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w1');
    const item: PantryItem = {
      id: 'p-atta', workspaceId: 'w1', name: 'Atta', tier: 'staple', group: 'grain', unit: 'kg',
      fullQty: 10, weeklyUsage: 2, shelfLifeDays: null, lowDays: 7,
      baseQty: 8, baseAt: daysAgo(10), lastReconciled: null, archived: false, createdAt: daysAgo(10)
    };
    state.pantryItems = [item];
    const before = item.weeklyUsage;
    const result = reconcileItem(scope, item.id, 'half'); // says 5kg (half of fullQty=10) actually left
    expect(result).not.toBeNull();
    expect(item.weeklyUsage).not.toBe(before); // relearned after a 10-day gap
    expect(item.baseQty).toBe(5);

    // now a same-day re-reconcile: too short a sample to relearn from
    const rateAfterFirst = item.weeklyUsage;
    reconcileItem(scope, item.id, 'full');
    expect(item.weeklyUsage).toBe(rateAfterFirst); // unchanged — days since baseAt is 0
  });

  it('price alert triggers at +/-25% against the median of the last 5 purchases, not the single last one', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w1');
    const item: PantryItem = {
      id: 'p-onion', workspaceId: 'w1', name: 'Onion', tier: 'staple', group: 'vegetable', unit: 'kg',
      fullQty: 3, weeklyUsage: 1.5, shelfLifeDays: null, lowDays: 7,
      baseQty: 1, baseAt: daysAgo(30), lastReconciled: null, archived: false, createdAt: daysAgo(30)
    };
    state.pantryItems = [item];
    const prices = [2800, 3000, 2900]; // paise/kg, 3 historical buys
    state.transactions = prices.map((_, i) => confirmedExpense({ id: `tx-on-${i}`, date: daysAgo(21 - i * 7) }));
    state.purchaseLines = prices.map((p, i) => ({ id: `pl-on-${i}`, workspaceId: 'w1', transactionId: `tx-on-${i}`, itemId: item.id, qty: 1, costPaise: p }));

    expect(priceAlert(scope, item.id, 2900)).toBe(null); // near the median, no alert
    const alert = priceAlert(scope, item.id, 5800); // one odd bill roughly double
    expect(alert?.dir).toBe('up');
    expect(alert!.pct).toBeGreaterThanOrEqual(25);
  });

  it('guessItem infers tier/unit/shelf-life from a typed name so a new item never demands a form', () => {
    expect(guessItem('Coriander').tier).toBe('perishable');
    expect(guessItem('Rice').tier).toBe('staple');
    expect(guessItem('Rice').unit).toBe('kg');
    expect(guessItem('Something Unknown').tier).toBe('perishable'); // safe fallback
  });

  it('a stock adjustment (waste/spoilage) reduces effective quantity and requires a reason', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w1');
    const item: PantryItem = {
      id: 'p-milk', workspaceId: 'w1', name: 'Milk', tier: 'staple', group: 'dairy', unit: 'L',
      fullQty: 2, weeklyUsage: 7, shelfLifeDays: null, lowDays: 3,
      baseQty: 2, baseAt: daysAgo(1), lastReconciled: null, archived: false, createdAt: daysAgo(1)
    };
    state.pantryItems = [item];
    const before = effectiveQty(scope, item);
    expect(recordStockAdjustment(scope, item.id, 1, '')).toBe(null); // empty reason rejected
    recordStockAdjustment(scope, item.id, 1, 'Spilled');
    const after = effectiveQty(scope, item);
    expect(after).toBeCloseTo(before - 1, 5);
  });

  it('needsBuying sorts by soonest-to-run-out first', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w1');
    state.pantryItems = [
      { id: 'p-a', workspaceId: 'w1', name: 'A', tier: 'staple', group: 'other', unit: 'kg', fullQty: 5, weeklyUsage: 7, shelfLifeDays: null, lowDays: 7, baseQty: 0.5, baseAt: daysAgo(0), lastReconciled: null, archived: false, createdAt: daysAgo(0) },
      { id: 'p-b', workspaceId: 'w1', name: 'B', tier: 'staple', group: 'other', unit: 'kg', fullQty: 5, weeklyUsage: 7, shelfLifeDays: null, lowDays: 7, baseQty: 0.1, baseAt: daysAgo(0), lastReconciled: null, archived: false, createdAt: daysAgo(0) },
      { id: 'p-c', workspaceId: 'w1', name: 'C (plenty)', tier: 'staple', group: 'other', unit: 'kg', fullQty: 5, weeklyUsage: 1, baseQty: 5, shelfLifeDays: null, lowDays: 7, baseAt: daysAgo(0), lastReconciled: null, archived: false, createdAt: daysAgo(0) }
    ];
    const order = needsBuying(scope).map((i) => i.id);
    expect(order).toEqual(['p-b', 'p-a']); // B has less runway than A; C isn't low at all
  });
});
