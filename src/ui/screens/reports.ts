import type { AppState } from '../state';
import { esc } from '../util';
import { formatMoney } from '../../domain/money';
import { rangeSpendPaise, rangeIncomePaise, rangeCatTotalsPaise, budgetProgress } from '../../domain/selectors';
import { monthAdd, monthName, daysInMonth, dateAddDays, weekLabel } from '../../domain/dates';
import { byId } from '../../domain/scope';

/** Resolves the current period tab to a [from, to] calendar-date range, a
 *  matching range one period back (for the vs-last delta), and a header
 *  label — so the rest of the screen doesn't care which tab is active. */
function resolvePeriod(app: AppState): { from: string; to: string; prevFrom: string; prevTo: string; label: string; showBudgets: boolean } {
  if (app.reportPeriod === 'week') {
    const from = app.reportWeekStart, to = dateAddDays(from, 6);
    const prevFrom = dateAddDays(from, -7), prevTo = dateAddDays(from, -1);
    return { from, to, prevFrom, prevTo, label: weekLabel(from), showBudgets: false };
  }
  if (app.reportPeriod === 'year') {
    const y = app.reportYear;
    const from = `${y}-01-01`, to = `${y}-12-31`;
    const py = String(Number(y) - 1);
    return { from, to, prevFrom: `${py}-01-01`, prevTo: `${py}-12-31`, label: y, showBudgets: false };
  }
  const key = app.reportMonth;
  const parts = key.split('-').map(Number);
  const from = `${key}-01`, to = `${key}-${String(daysInMonth(parts[0]!, parts[1]!)).padStart(2, '0')}`;
  const prevKey = monthAdd(key, -1);
  const pparts = prevKey.split('-').map(Number);
  return { from, to, prevFrom: `${prevKey}-01`, prevTo: `${prevKey}-${String(daysInMonth(pparts[0]!, pparts[1]!)).padStart(2, '0')}`, label: monthName(key), showBudgets: true };
}

export function vReports(app: AppState): string {
  const { scope } = app;
  const period = resolvePeriod(app);
  const f = app.reportFilters;
  const filter = { personId: f.personId || null, accountId: f.accountId || null, categoryId: f.categoryId || null };

  const spend = rangeSpendPaise(scope, period.from, period.to, filter);
  const prevSpend = rangeSpendPaise(scope, period.prevFrom, period.prevTo, filter);
  const income = rangeIncomePaise(scope, period.from, period.to, false, filter);
  const totals = rangeCatTotalsPaise(scope, period.from, period.to, filter);
  const prevTotals = rangeCatTotalsPaise(scope, period.prevFrom, period.prevTo, filter);
  const deltaPct = prevSpend > 0 ? Math.round(((spend - prevSpend) / prevSpend) * 100) : null;
  const vsLabel = app.reportPeriod === 'week' ? 'vs last week' : app.reportPeriod === 'year' ? 'vs last year' : 'vs last month';

  const members = scope.activeMembers();
  const accounts = scope.accounts();
  const cats = scope.categories().filter((c) => !c.archived && c.kind === 'expense');
  const filterBar = `<div class="card">
    <div class="row">
      <select id="repFilterPerson" data-testid="report-filter-person"><option value="">Everyone</option>
        ${members.map((m) => `<option value="${m.id}" ${f.personId === m.id ? 'selected' : ''}>${esc(m.displayName)}</option>`).join('')}</select>
      <select id="repFilterAccount" data-testid="report-filter-account"><option value="">All accounts</option>
        ${accounts.map((a) => `<option value="${a.id}" ${f.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
    </div>
    <div class="row" style="margin-top:8px">
      <select id="repFilterCategory" data-testid="report-filter-category"><option value="">All categories</option>
        ${cats.map((c) => `<option value="${c.id}" ${f.categoryId === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>
    </div>
  </div>`;

  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([catId, amt]) => {
    const c = byId(scope.state.categories, catId);
    const prevAmt = prevTotals[catId] || 0;
    const d = prevAmt > 0 ? Math.round(((amt - prevAmt) / prevAmt) * 100) : null;
    return `<tr><td>${esc(c?.icon ?? '•')} ${esc(c?.name ?? '—')}</td><td class="r num">${formatMoney(amt)}</td>
      <td class="r tiny">${d === null ? '—' : (d > 0 ? '+' : '') + d + '%'}</td></tr>`;
  }).join('');

  const budgets = period.showBudgets ? budgetProgress(scope, app.reportMonth) : [];
  const budgetRows = budgets.map((b) => {
    const c = b.categoryId ? byId(scope.state.categories, b.categoryId) : null;
    const label = b.categoryId ? `${c?.icon ?? '•'} ${c?.name ?? '—'}` : 'Overall';
    const pct = b.limitPaise > 0 ? Math.round((b.spentPaise / b.limitPaise) * 100) : 0;
    const over = b.spentPaise > b.limitPaise;
    return `<div class="list-block">
      <div class="between"><span style="font-size:13.5px">${esc(label)}</span>
        <span class="tiny num">${formatMoney(b.spentPaise)} / ${formatMoney(b.limitPaise)}</span></div>
      <div class="bar" style="height:6px"><i style="width:${Math.min(100, pct)}%;${over ? 'background:var(--bad)' : ''}"></i></div>
    </div>`;
  }).join('');

  const prevAttr = app.reportPeriod === 'week' ? 'data-repweek="-1"' : app.reportPeriod === 'year' ? 'data-repyear="-1"' : `data-repmonth="${monthAdd(app.reportMonth, -1)}"`;
  const nextAttr = app.reportPeriod === 'week' ? 'data-repweek="1"' : app.reportPeriod === 'year' ? 'data-repyear="1"' : `data-repmonth="${monthAdd(app.reportMonth, 1)}"`;

  return `<h1>Reports</h1>
  <div class="seg" data-testid="report-period">
    ${(['week', 'month', 'year'] as const).map((p) => `<button class="${app.reportPeriod === p ? 'on' : ''}" data-repperiod="${p}" data-testid="report-period-${p}">${p[0]!.toUpperCase() + p.slice(1)}</button>`).join('')}
  </div>
  <div class="row" style="margin-bottom:14px">
    <button class="btn sm ghost" ${prevAttr} data-testid="report-prev">‹ Prev</button>
    <span class="grow" style="text-align:center;font-weight:600">${esc(period.label)}</span>
    <button class="btn sm ghost" ${nextAttr} data-testid="report-next">Next ›</button>
  </div>
  ${filterBar}
  <div class="card">
    <div class="grid2">
      <div><div class="mid num">${formatMoney(income)}</div><div class="tiny">Income</div></div>
      <div><div class="mid num">${formatMoney(spend)}</div><div class="tiny">Spend${deltaPct !== null ? ` (${deltaPct > 0 ? '+' : ''}${deltaPct}% ${vsLabel})` : ''}</div></div>
    </div>
  </div>
  ${budgets.length ? `<h2>Budgets</h2><div class="card">${budgetRows}</div>` : ''}
  <h2>By category</h2>
  <div class="card"><table data-testid="report-table"><thead><tr><th>Category</th><th class="r">Amount</th><th class="r">${esc(vsLabel)}</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="3" class="empty">No spend this ${app.reportPeriod}.</td></tr>`}</tbody></table></div>`;
}
