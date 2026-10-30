/* ============================================================================
   Restaurant recipe / BOM module.

   Answers the product's own open question (Q11 in PROJECT-CONTEXT.md): what
   kind of business inventory is this? Raw materials consumed via a recipe —
   not stock-for-resale. When an order is logged ("3x Butter Chicken sold"),
   each recipe line's pantry item is deducted by qty * count sold. This is a
   small, mechanical extension of the Phase 2 pantry model (D57) — order
   consumption is EXACT, unlike the household's usage-rate estimate, because
   it comes from what was actually prepared and served rather than a guess.

   Waste/spoilage is tracked separately (stockAdjustments, see pantry.ts) so
   shrinkage stays visible instead of being silently absorbed into "usage".
============================================================================ */
import type { MenuItem, RecipeLine, OrderEntry } from './types';
import type { Scope } from './scope';
import { byId } from './scope';
import { today } from './dates';
import { lastUnitPricePaise } from './pantry';

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createMenuItem(scope: Scope, name: string, pricePaise: number, category = ''): MenuItem {
  return scope.addRow('menuItems', { id: uid(), name: name.trim(), pricePaise, category, active: true });
}

export function setRecipe(scope: Scope, menuItemId: string, lines: { itemId: string; qty: number; unit: string }[]): void {
  // replace existing recipe lines for this menu item
  scope.state.recipeLines = scope.state.recipeLines.filter((rl) => rl.menuItemId !== menuItemId);
  for (const line of lines) {
    scope.addRow('recipeLines', { id: uid(), menuItemId, itemId: line.itemId, qty: line.qty, unit: line.unit });
  }
}

export function recipeFor(scope: Scope, menuItemId: string): RecipeLine[] {
  return scope.recipeLines().filter((rl) => rl.menuItemId === menuItemId);
}

/** Log a sale: N of this menu item, today (or a given date). No approval
 *  workflow for sales in this design — they're direct entries, confirmed
 *  immediately, same as a household logging its own spend. */
export function logOrder(scope: Scope, menuItemId: string, qty: number, date = today()): OrderEntry {
  const me = scope.me()!;
  return scope.addRow('orderEntries', {
    id: uid(), menuItemId, qty, date, loggedByMembershipId: me.id, createdAt: new Date().toISOString()
  });
}

/** Plate cost from current price memory on each ingredient — falls out of
 *  data already being captured (D60's price memory) for essentially free. */
export function dishCostPaise(scope: Scope, menuItemId: string): number {
  const lines = recipeFor(scope, menuItemId);
  let total = 0;
  for (const line of lines) {
    const unitPrice = lastUnitPricePaise(scope, line.itemId) ?? 0;
    total += unitPrice * line.qty;
  }
  return Math.round(total);
}

export function dishMarginPaise(scope: Scope, menuItem: MenuItem): { costPaise: number; marginPaise: number; marginPct: number } {
  const costPaise = dishCostPaise(scope, menuItem.id);
  const marginPaise = menuItem.pricePaise - costPaise;
  const marginPct = menuItem.pricePaise > 0 ? Math.round((marginPaise / menuItem.pricePaise) * 100) : 0;
  return { costPaise, marginPaise, marginPct };
}

export function ordersOn(scope: Scope, date: string): OrderEntry[] {
  return scope.orderEntries().filter((o) => o.date === date);
}

export function dayCloseSummary(scope: Scope, date: string): { menuItemName: string; qty: number; revenuePaise: number }[] {
  const orders = ordersOn(scope, date);
  const grouped = new Map<string, { qty: number; revenuePaise: number }>();
  for (const o of orders) {
    const mi = byId(scope.state.menuItems, o.menuItemId);
    if (!mi) continue;
    const cur = grouped.get(mi.id) ?? { qty: 0, revenuePaise: 0 };
    cur.qty += o.qty;
    cur.revenuePaise += mi.pricePaise * o.qty;
    grouped.set(mi.id, cur);
  }
  return [...grouped.entries()].map(([id, v]) => ({ menuItemName: byId(scope.state.menuItems, id)?.name ?? '—', ...v }));
}
