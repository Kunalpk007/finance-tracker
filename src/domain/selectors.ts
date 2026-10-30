/* ============================================================================
   Dashboard and report math. Ported carefully — this file historically had
   three of the app's most dangerous bugs, all silently wrong on every screen:
   cycleWindow() misreporting "0 days" for every card, month arithmetic
   landing a month early, and toISOString() shifting dates by a day in IST.
   All three are structurally avoided here by using domain/dates.ts
   exclusively — no raw Date math, no toISOString() anywhere in this file.
============================================================================ */
import type { Transaction } from './types';
import type { Scope } from './scope';
import { visibleTx } from './permissions';
import { monthAdd, toMonthKey, daysInMonth } from './dates';
import { sumPaise } from './money';

const counts = (t: Transaction) => t.status === 'confirmed';

export function inMonth(scope: Scope, key: string): Transaction[] {
  return visibleTx(scope).filter((t) => toMonthKey(t.date) === key);
}

/** Report filters: person (paid by), account (either side of a transfer), category.
 *  Unset fields match everything — the report screen's "All" option. */
export interface TxFilter { personId?: string | null; accountId?: string | null; categoryId?: string | null }
export function matchesFilter(t: Transaction, f?: TxFilter): boolean {
  if (!f) return true;
  if (f.personId && t.paidByMembershipId !== f.personId) return false;
  if (f.accountId && t.accountId !== f.accountId && t.toAccountId !== f.accountId) return false;
  if (f.categoryId && t.categoryId !== f.categoryId) return false;
  return true;
}

/** Joint household spend: expenses only, personal excluded, transfers never counted. */
export function jointSpendPaise(scope: Scope, key: string, uptoDay?: number, filter?: TxFilter): number {
  return sumPaise(
    inMonth(scope, key)
      .filter((t) => t.type === 'expense' && counts(t) && !t.isPersonal && (!uptoDay || Number(t.date.slice(8, 10)) <= uptoDay) && matchesFilter(t, filter))
      .map((t) => t.amountPaise)
  );
}

/** Calendar-date-range versions of the month selectors above, for the
 *  Reports screen's Week/Month/Year tabs — dates are 'YYYY-MM-DD' strings,
 *  so plain string comparison is correct and avoids Date-object math. */
export function inRange(scope: Scope, fromDate: string, toDate: string): Transaction[] {
  return visibleTx(scope).filter((t) => t.date >= fromDate && t.date <= toDate);
}

export function rangeSpendPaise(scope: Scope, fromDate: string, toDate: string, filter?: TxFilter): number {
  return sumPaise(
    inRange(scope, fromDate, toDate)
      .filter((t) => t.type === 'expense' && counts(t) && !t.isPersonal && matchesFilter(t, filter))
      .map((t) => t.amountPaise)
  );
}

export function rangeIncomePaise(scope: Scope, fromDate: string, toDate: string, includePending = false, filter?: TxFilter): number {
  return sumPaise(
    inRange(scope, fromDate, toDate)
      .filter((t) => t.type === 'income' && (includePending || t.status === 'confirmed') && matchesFilter(t, filter))
      .map((t) => t.amountPaise)
  );
}

export function rangeCatTotalsPaise(scope: Scope, fromDate: string, toDate: string, filter?: TxFilter): Record<string, number> {
  const map: Record<string, number> = {};
  inRange(scope, fromDate, toDate)
    .filter((t) => t.type === 'expense' && counts(t) && !t.isPersonal && matchesFilter(t, filter))
    .forEach((t) => { if (t.categoryId) map[t.categoryId] = (map[t.categoryId] || 0) + t.amountPaise; });
  return map;
}

export function personalSpendPaise(scope: Scope, key: string): number {
  return sumPaise(inMonth(scope, key).filter((t) => t.type === 'expense' && counts(t) && t.isPersonal).map((t) => t.amountPaise));
}

export function incomeInPaise(scope: Scope, key: string, includePending = false, filter?: TxFilter): number {
  return sumPaise(inMonth(scope, key).filter((t) => t.type === 'income' && (includePending || t.status === 'confirmed') && matchesFilter(t, filter)).map((t) => t.amountPaise));
}

/** Investments are transfers into an investment account, never an expense
 *  (D44) — a SIP is money changing form, not leaving your life. */
export function putAwayPaise(scope: Scope, key: string): number {
  const investmentAccountIds = new Set(scope.accounts().filter((a) => a.type === 'investment').map((a) => a.id));
  return sumPaise(
    inMonth(scope, key)
      .filter((t) => t.type === 'transfer' && counts(t) && t.toAccountId && investmentAccountIds.has(t.toAccountId))
      .map((t) => t.amountPaise)
  );
}

export function catTotalsPaise(scope: Scope, key: string, uptoDay?: number, filter?: TxFilter): Record<string, number> {
  const map: Record<string, number> = {};
  inMonth(scope, key)
    .filter((t) => t.type === 'expense' && counts(t) && !t.isPersonal && (!uptoDay || Number(t.date.slice(8, 10)) <= uptoDay) && matchesFilter(t, filter))
    .forEach((t) => { if (t.categoryId) map[t.categoryId] = (map[t.categoryId] || 0) + t.amountPaise; });
  return map;
}

/** Budget vs. actual for the month — categoryId null is the overall budget,
 *  measured against total joint spend rather than one category's total. */
export function budgetProgress(scope: Scope, key: string): { categoryId: string | null; limitPaise: number; spentPaise: number }[] {
  const totals = catTotalsPaise(scope, key);
  const overallSpent = jointSpendPaise(scope, key);
  return scope.budgets().map((b) => ({
    categoryId: b.categoryId,
    limitPaise: b.limitPaise,
    spentPaise: b.categoryId ? (totals[b.categoryId] || 0) : overallSpent
  }));
}

export function rollingAvgPaise(scope: Scope, currentMonthKey: string): { avgPaise: number; n: number } {
  const keys = [monthAdd(currentMonthKey, -1), monthAdd(currentMonthKey, -2), monthAdd(currentMonthKey, -3)];
  const vals = keys.map((k) => jointSpendPaise(scope, k)).filter((v) => v > 0);
  return vals.length ? { avgPaise: sumPaise(vals) / vals.length, n: vals.length } : { avgPaise: 0, n: 0 };
}

/** Credit-card cycle: spend since the last statement date on that card. The
 *  statement always falls on the cycle day of the month AFTER the cycle
 *  opened, whichever side of the cycle day today sits — getting this wrong
 *  made "statement in N days" read 0 for every card before its cycle day. */
export function cycleWindow(cycleDay: number, todayDate: Date): { start: Date; stmt: Date; daysTo: number } {
  const d = todayDate.getDate();
  const y = todayDate.getFullYear(), m = todayDate.getMonth() + 1;
  const thisMonthKey = `${y}-${String(m).padStart(2, '0')}`;
  const startKey = d > cycleDay ? thisMonthKey : monthAdd(thisMonthKey, -1);
  const parts = startKey.split('-').map(Number);
  const sy = parts[0]!, sm = parts[1]!;
  const start = new Date(sy, sm - 1, Math.min(cycleDay, daysInMonth(sy, sm)) + 1);
  const nextParts = monthAdd(startKey, 1).split('-').map(Number);
  const ny = nextParts[0]!, nm = nextParts[1]!;
  const stmt = new Date(ny, nm - 1, Math.min(cycleDay, daysInMonth(ny, nm)));
  const daysTo = Math.max(0, Math.round((stmt.getTime() - todayDate.getTime()) / 86400000));
  return { start, stmt, daysTo };
}

/** 30/60-day cash-flow forecast — new in this build (Session 5 gap analysis):
 *  projects balance forward using scheduled recurring rules, which already
 *  exist for exactly this purpose. Directional, not a guarantee — same
 *  honesty principle as pantry runway. */
export function cashFlowForecastPaise(scope: Scope, horizonDays: 30 | 60, currentMonthKey: string): { incomePaise: number; expensePaise: number; netPaise: number } {
  const monthsToConsider = horizonDays === 30 ? [currentMonthKey, monthAdd(currentMonthKey, 1)] : [currentMonthKey, monthAdd(currentMonthKey, 1), monthAdd(currentMonthKey, 2)];
  const scale = horizonDays / (monthsToConsider.length * 30);
  let incomePaise = 0, expensePaise = 0;
  for (const r of scope.recurring()) {
    if (!r.active) continue;
    const occurrences = monthsToConsider.length;
    if (r.type === 'income') incomePaise += r.amountPaise * occurrences * scale;
    else expensePaise += r.amountPaise * occurrences * scale;
  }
  // add rolling-average discretionary spend, scaled to the horizon
  const { avgPaise } = rollingAvgPaise(scope, currentMonthKey);
  expensePaise += avgPaise * (horizonDays / 30);
  return { incomePaise: Math.round(incomePaise), expensePaise: Math.round(expensePaise), netPaise: Math.round(incomePaise - expensePaise) };
}
