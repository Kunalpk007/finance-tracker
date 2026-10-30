import { describe, it, expect } from 'vitest';
import { baseFixture, signInAs } from './fixtures';
import { iso } from '../../src/domain/dates';
import { createMenuItem, setRecipe, logOrder, dishCostPaise, dishMarginPaise } from '../../src/domain/recipes';
import { effectiveQty } from '../../src/domain/pantry';
import type { PantryItem, PurchaseLine, Transaction } from '../../src/domain/types';

function daysAgo(n: number): string {
  return iso(new Date(Date.now() - n * 86400000));
}

describe('restaurant recipe/BOM — order-driven ingredient deduction', () => {
  it('logging a sale deducts exact ingredient quantity via the recipe, not an estimate', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w2');

    const chicken: PantryItem = {
      id: 'p-chicken', workspaceId: 'w2', name: 'Chicken', tier: 'staple', group: 'other', unit: 'kg',
      fullQty: 20, weeklyUsage: 0, shelfLifeDays: null, lowDays: 7,
      baseQty: 10, baseAt: daysAgo(5), lastReconciled: null, archived: false, createdAt: daysAgo(5)
    };
    state.pantryItems = [chicken];

    const menuItem = createMenuItem(scope, 'Butter Chicken', 32000); // paise
    setRecipe(scope, menuItem.id, [{ itemId: chicken.id, qty: 0.2, unit: 'kg' }]); // 200g chicken per plate

    const before = effectiveQty(scope, chicken);
    expect(before).toBe(10);

    logOrder(scope, menuItem.id, 5, iso(new Date())); // 5 plates sold today
    const after = effectiveQty(scope, chicken);
    expect(after).toBeCloseTo(10 - 0.2 * 5, 5); // exactly 1kg consumed, not an estimate
  });

  it('dish cost and margin fall out of price memory almost for free', () => {
    const { state, scope } = baseFixture();
    signInAs(state, 'u1', 'w2');

    const naanFlour: PantryItem = {
      id: 'p-flour', workspaceId: 'w2', name: 'Naan flour', tier: 'staple', group: 'grain', unit: 'kg',
      fullQty: 20, weeklyUsage: 10, shelfLifeDays: null, lowDays: 7,
      baseQty: 15, baseAt: daysAgo(5), lastReconciled: null, archived: false, createdAt: daysAgo(5)
    };
    state.pantryItems = [naanFlour];
    const tx: Transaction = {
      id: 'tx-flour', workspaceId: 'w2', type: 'expense', amountPaise: 100000, date: daysAgo(4),
      categoryId: 'c2', accountId: 'ba1', toAccountId: null, paidByMembershipId: 'b1', loggedByMembershipId: 'b1',
      isPersonal: false, vendor: '', note: '', photoPath: null, status: 'confirmed', recurringId: null,
      approvedByMembershipId: null, approvedAt: null, rejectReason: null, voidedByMembershipId: null, voidedAt: null, voidReason: null,
      wasSubmitted: false, createdAt: '', updatedAt: '', version: 1, deletedAt: null
    };
    state.transactions = [tx];
    const line: PurchaseLine = { id: 'pl-flour', workspaceId: 'w2', transactionId: tx.id, itemId: naanFlour.id, qty: 20, costPaise: 100000 }; // ₹50/kg
    state.purchaseLines = [line];

    const naan = createMenuItem(scope, 'Naan', 4500); // ₹45
    setRecipe(scope, naan.id, [{ itemId: naanFlour.id, qty: 0.08, unit: 'kg' }]); // 80g flour per naan

    const cost = dishCostPaise(scope, naan.id);
    expect(cost).toBe(Math.round(5000 * 0.08)); // 50 rupees/kg * 0.08kg = 4 rupees = 400 paise

    const margin = dishMarginPaise(scope, naan);
    expect(margin.costPaise).toBe(cost);
    expect(margin.marginPaise).toBe(4500 - cost);
    expect(margin.marginPct).toBeGreaterThan(0);
  });
});
