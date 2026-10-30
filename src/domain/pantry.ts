/* ============================================================================
   Pantry / inventory — derived stock (D57), never a stored running total:

       stock = baseline at last reconcile
             + everything bought since, from CONFIRMED entries only
             + purchases logged for other reasons (recipe stock-ins are out of
               scope here; this file only models what's bought and consumed)
             − estimated usage since then (staples)
             − recorded waste/spoilage adjustments

   Two things fall out of that for free, and both were requirements:
   • an unapproved claim moves no stock, because it does not count as confirmed;
   • voiding a purchase reverses its stock, because the line stops counting too.
   No reversal code, no "applied" flags, nothing to fall out of step.

   Perishables get a freshness clock instead of a runway estimate — "3.4 days
   of coriander left" is false precision the app has no business claiming.
============================================================================ */
import type { PantryItem, PurchaseLine, Reconcile, StockAdjustment, Transaction } from './types';
import type { Scope } from './scope';
import { byId } from './scope';
import { daysBetween, today } from './dates';
import { sumPaise } from './money';

/** Typed at a vegetable stall, an item should not demand a form. These
 *  defaults let the app guess tier, unit and shelf life from the name;
 *  everything is editable in Pantry afterwards. */
const ITEM_DEFAULTS: Record<string, [string, string, string, number, number]> = {
  atta: ['staple', 'grain', 'kg', 10, 2], rice: ['staple', 'grain', 'kg', 10, 2], dal: ['staple', 'grain', 'kg', 5, 1],
  sugar: ['staple', 'grain', 'kg', 3, 0.5], salt: ['staple', 'spice', 'kg', 2, 0.15], oil: ['staple', 'other', 'L', 5, 1],
  milk: ['staple', 'dairy', 'L', 2, 7], curd: ['perishable', 'dairy', 'kg', 1, 4], paneer: ['perishable', 'dairy', 'g', 400, 3],
  onion: ['staple', 'vegetable', 'kg', 3, 1.5], potato: ['staple', 'vegetable', 'kg', 3, 1.5],
  tomato: ['perishable', 'vegetable', 'kg', 2, 5], garlic: ['staple', 'vegetable', 'kg', 0.5, 0.15],
  ginger: ['perishable', 'vegetable', 'g', 250, 10], coriander: ['perishable', 'vegetable', 'g', 100, 3],
  spinach: ['perishable', 'vegetable', 'g', 500, 4], methi: ['perishable', 'vegetable', 'g', 250, 3],
  bhindi: ['perishable', 'vegetable', 'kg', 1, 4], capsicum: ['perishable', 'vegetable', 'kg', 1, 6],
  banana: ['perishable', 'fruit', 'count', 6, 5], apple: ['perishable', 'fruit', 'kg', 1, 12],
  orange: ['perishable', 'fruit', 'kg', 1, 8], grapes: ['perishable', 'fruit', 'g', 500, 5],
  bread: ['perishable', 'grain', 'pack', 1, 4], eggs: ['staple', 'dairy', 'count', 12, 3],
  tea: ['staple', 'other', 'g', 500, 60], coffee: ['staple', 'other', 'g', 200, 40]
};

export function guessItem(name: string): { tier: 'staple' | 'perishable'; group: string; unit: string; fullQty: number; weeklyUsage: number; shelfLifeDays: number | null } {
  const k = name.toLowerCase().trim();
  const hitKey = Object.keys(ITEM_DEFAULTS).find((d) => k.includes(d));
  const hit = hitKey ? ITEM_DEFAULTS[hitKey] : undefined;
  const [tier, group, unit, fullQty, rate] = hit ?? (['perishable', 'other', 'count', 1, 1] as const);
  return {
    tier: tier as 'staple' | 'perishable',
    group,
    unit,
    fullQty,
    weeklyUsage: tier === 'staple' ? rate : 0,
    shelfLifeDays: tier === 'perishable' ? rate : null
  };
}

/** Lines only count when their parent entry counts (confirmed, not voided/
 *  pending/rejected/submitted) — this is the whole approval-and-void story
 *  expressed once. */
export function countedLines(scope: Scope, itemId?: string): PurchaseLine[] {
  return scope.purchaseLines().filter((l) => {
    if (itemId && l.itemId !== itemId) return false;
    const t = byId(scope.state.transactions, l.transactionId);
    return !!t && t.status === 'confirmed';
  });
}

function boughtSince(scope: Scope, itemId: string, since: string): number {
  const lines = countedLines(scope, itemId).filter((l) => {
    const t = byId(scope.state.transactions, l.transactionId) as Transaction;
    return t.date >= since;
  });
  return lines.reduce((a, l) => a + l.qty, 0);
}

export function lastBought(scope: Scope, itemId: string): string | null {
  const dates = countedLines(scope, itemId).map((l) => (byId(scope.state.transactions, l.transactionId) as Transaction).date);
  if (!dates.length) return null;
  return dates.sort().pop()!;
}

function wasteSince(scope: Scope, itemId: string, since: string): number {
  return scope.stockAdjustments()
    .filter((a) => a.itemId === itemId && a.date >= since && a.qty < 0)
    .reduce((sum, a) => sum + Math.abs(a.qty), 0);
}

/** Ingredient quantity consumed by confirmed orders since a given date,
 *  via each order's recipe (menu item -> pantry item BOM). Exact, not
 *  estimated — a stronger signal than the household usage-rate guess. */
function orderConsumptionSince(scope: Scope, itemId: string, since: string): number {
  const recipeLinesForItem = scope.recipeLines().filter((rl) => rl.itemId === itemId);
  if (!recipeLinesForItem.length) return 0;
  let total = 0;
  for (const order of scope.orderEntries()) {
    if (order.date < since) continue;
    const rl = recipeLinesForItem.find((r) => r.menuItemId === order.menuItemId);
    if (rl) total += rl.qty * order.qty;
  }
  return total;
}

export function effectiveQty(scope: Scope, item: PantryItem): number {
  const since = item.baseAt || item.createdAt || today();
  const usedByRate = item.tier === 'staple' ? ((item.weeklyUsage || 0) * daysBetween(since, today())) / 7 : 0;
  const usedByOrders = orderConsumptionSince(scope, item.id, since);
  const wasted = wasteSince(scope, item.id, since);
  return Math.max(0, (item.baseQty || 0) + boughtSince(scope, item.id, since) - usedByRate - usedByOrders - wasted);
}

export function runwayDays(scope: Scope, item: PantryItem): number | null {
  if (item.tier !== 'staple' || !item.weeklyUsage) return null;
  return effectiveQty(scope, item) / (item.weeklyUsage / 7);
}

export interface Freshness { state: 'fresh' | 'soon' | 'gone' | 'unknown'; label: string; age: number | null }

export function freshness(scope: Scope, item: PantryItem): Freshness {
  // An itemised purchase is the best signal, but an item can exist without
  // one — fall back to when we last knew it was in the house rather than
  // claiming we have no idea.
  const lb = lastBought(scope, item.id) || item.baseAt || item.createdAt;
  if (!lb) return { state: 'unknown', label: 'Not bought yet', age: null };
  const age = Math.floor(daysBetween(lb, today()));
  const life = item.shelfLifeDays || 7;
  if (age <= life * 0.5) return { state: 'fresh', label: `Fresh · day ${age}`, age };
  if (age <= life) return { state: 'soon', label: `Use soon · day ${age} of ~${life}`, age };
  return { state: 'gone', label: `Likely gone · ${age} days old`, age };
}

export interface ItemState { key: 'out' | 'low' | 'ok' | 'fresh' | 'soon' | 'gone' | 'unknown'; label: string; cls: string }

export function itemState(scope: Scope, item: PantryItem): ItemState {
  if (item.tier === 'perishable') {
    const f = freshness(scope, item);
    const cls = { fresh: 'p-good', soon: 'p-warn', gone: 'p-bad', unknown: 'p-neut' }[f.state];
    return { key: f.state, label: f.label, cls };
  }
  const q = effectiveQty(scope, item);
  const d = runwayDays(scope, item);
  if (q <= 0.001) return { key: 'out', label: 'Out', cls: 'p-bad' };
  if (d !== null && d <= (item.lowDays || 7)) {
    const days = Math.max(0, Math.round(d));
    return { key: 'low', label: `${days} day${days === 1 ? '' : 's'} left`, cls: 'p-warn' };
  }
  return { key: 'ok', label: d === null ? 'In stock' : `${Math.round(d)} days left`, cls: 'p-good' };
}

export function needsBuying(scope: Scope): PantryItem[] {
  return scope.pantryItems()
    .filter((i) => ['low', 'out', 'gone'].includes(itemState(scope, i).key))
    .sort((a, b) => (runwayDays(scope, a) ?? 99) - (runwayDays(scope, b) ?? 99));
}

/* ---- price memory: unit prices (paise) from confirmed lines, newest first --- */
export interface PricePoint { date: string; unitPaise: number }

export function priceHistory(scope: Scope, itemId: string): PricePoint[] {
  return countedLines(scope, itemId)
    .filter((l) => l.qty > 0 && l.costPaise > 0)
    .map((l) => ({ date: (byId(scope.state.transactions, l.transactionId) as Transaction).date, unitPaise: l.costPaise / l.qty }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function lastUnitPricePaise(scope: Scope, itemId: string): number | null {
  return priceHistory(scope, itemId)[0]?.unitPaise ?? null;
}

export interface PriceAlert { pct: number; medianPaise: number; dir: 'up' | 'down' }

/** Compared against the median of recent purchases, not the single last one
 *  — one odd bill shouldn't reset the app's sense of what onions cost. */
export function priceAlert(scope: Scope, itemId: string, unitPricePaise: number): PriceAlert | null {
  const h = priceHistory(scope, itemId).slice(0, 5).map((p) => p.unitPaise);
  if (h.length < 2 || !unitPricePaise) return null;
  const sorted = [...h].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  if (!median) return null;
  const pct = Math.round(((unitPricePaise - median) / median) * 100);
  if (pct >= 25) return { pct, medianPaise: median, dir: 'up' };
  if (pct <= -25) return { pct: Math.abs(pct), medianPaise: median, dir: 'down' };
  return null;
}

/* ---- reconcile: the correction that keeps runway honest (D5/D59) ---- */
export const RECONCILE_LEVELS: [string, string, number][] = [['full', 'Full', 1], ['half', 'Half', 0.5], ['low', 'Low', 0.25], ['out', 'Out', 0]];

export function reconcileItem(scope: Scope, itemId: string, level: 'full' | 'half' | 'low' | 'out'): { actual: number; implied: number | null } | null {
  const item = byId(scope.state.pantryItems, itemId);
  if (!item) return null;
  const factor = (RECONCILE_LEVELS.find((l) => l[0] === level) ?? [null, null, 0])[2] as number;
  const actual = (item.fullQty || 1) * factor;
  const since = item.baseAt || item.createdAt || today();
  const days = daysBetween(since, today());
  const start = item.baseQty || 0;
  const bought = boughtSince(scope, item.id, since);
  let implied: number | null = null;
  // Only relearn from a meaningful stretch of time; a two-day sample produces nonsense.
  if (item.tier === 'staple' && days >= 3) {
    const consumed = Math.max(0, start + bought - actual);
    implied = (consumed / days) * 7;
    // Blend rather than replace, so one unusual week doesn't rewrite the model.
    item.weeklyUsage = Math.round(((item.weeklyUsage || 0) * 0.6 + implied * 0.4) * 100) / 100;
  }
  scope.addRow('reconciles', {
    id: cryptoId(), itemId: item.id, date: today(), level,
    qtyBefore: Math.round(effectiveQty(scope, item) * 100) / 100, qtyAfter: actual,
    impliedWeekly: implied === null ? null : Math.round(implied * 100) / 100,
    actorMembershipId: scope.me()?.id ?? ''
  } satisfies Omit<Reconcile, 'workspaceId'>);
  item.baseQty = actual;
  item.baseAt = today();
  item.lastReconciled = today();
  return { actual, implied };
}

export function recordStockAdjustment(scope: Scope, itemId: string, qtyLoss: number, reason: string): StockAdjustment | null {
  if (!reason.trim()) return null;
  return scope.addRow('stockAdjustments', {
    id: cryptoId(), itemId, qty: -Math.abs(qtyLoss), reason: reason.trim(), date: today(),
    actorMembershipId: scope.me()?.id ?? '', createdAt: new Date().toISOString()
  } satisfies Omit<StockAdjustment, 'workspaceId'>);
}

/* ============================================================================
   "Buy next" lookup — the piece Kunal asked for directly: before you commit to
   buying an item again, show what the app thinks is still left, and when (and
   for how much) you last bought it. Works for ANY pantry item by name, exact
   or fuzzy match, so typing "rice" two weeks after a 5kg purchase surfaces the
   estimate and the purchase record without hunting through the pantry tab.
============================================================================ */
export interface BuyNextPreview {
  item: PantryItem | null;
  estimateLabel: string;
  estimateQty: number | null;
  lastPurchase: { date: string; qty: number; unitPricePaise: number | null } | null;
  priceAlert: PriceAlert | null;
}

export function findPantryItemByName(scope: Scope, name: string): PantryItem | null {
  const k = name.toLowerCase().trim();
  if (!k) return null;
  const exact = scope.pantryItems().find((i) => i.name.toLowerCase() === k);
  if (exact) return exact;
  return scope.pantryItems().find((i) => i.name.toLowerCase().includes(k) || k.includes(i.name.toLowerCase())) ?? null;
}

export function buyNextPreview(scope: Scope, name: string, proposedUnitPricePaise?: number): BuyNextPreview {
  const item = findPantryItemByName(scope, name);
  if (!item) {
    return { item: null, estimateLabel: 'Not tracked yet — will be added as a new pantry item.', estimateQty: null, lastPurchase: null, priceAlert: null };
  }
  const qty = effectiveQty(scope, item);
  const state = itemState(scope, item);
  const lastLine = countedLines(scope, item.id)
    .sort((a, b) => {
      const ta = (byId(scope.state.transactions, a.transactionId) as Transaction).date;
      const tb = (byId(scope.state.transactions, b.transactionId) as Transaction).date;
      return ta < tb ? 1 : -1;
    })[0];
  const lastPurchase = lastLine
    ? {
        date: (byId(scope.state.transactions, lastLine.transactionId) as Transaction).date,
        qty: lastLine.qty,
        unitPricePaise: lastLine.qty > 0 ? Math.round(lastLine.costPaise / lastLine.qty) : null
      }
    : null;
  const alert = proposedUnitPricePaise ? priceAlert(scope, item.id, proposedUnitPricePaise) : null;
  return {
    item,
    estimateLabel: `About ${formatQty(qty, item.unit)} left (${state.label})`,
    estimateQty: qty,
    lastPurchase,
    priceAlert: alert
  };
}

export function formatQty(qty: number, unit: string): string {
  const rounded = Math.round(qty * 100) / 100;
  return `${rounded} ${unit}`;
}

function cryptoId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36));
}
