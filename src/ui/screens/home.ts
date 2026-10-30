import { Chart, DoughnutController, ArcElement, Tooltip, type ChartConfiguration } from 'chart.js';
import type { AppState } from '../state';
import { esc } from '../util';
import { formatMoney } from '../../domain/money';
import { can } from '../../domain/permissions';
import { jointSpendPaise, rollingAvgPaise, catTotalsPaise, incomeInPaise, putAwayPaise, budgetProgress } from '../../domain/selectors';
import { pendingSubs } from '../../domain/transactions';
import { byId, Scope } from '../../domain/scope';
import { today, toMonthKey } from '../../domain/dates';
import { tripTotalPaise, TRIP_KINDS } from '../../domain/trips';

Chart.register(DoughnutController, ArcElement, Tooltip);
const HOME_CHART_ID = 'homeCatChart';

/** Reads the app's actual CSS tokens at paint time (not a hardcoded palette)
 *  so the chart matches whichever theme — light/dark/system — is active. */
function chartPalette(): string[] {
  const cs = getComputedStyle(document.documentElement);
  return ['--chart-1', '--chart-2', '--chart-3', '--chart-4'].map((v) => cs.getPropertyValue(v).trim() || '#888');
}

/** Top 3 categories this month plus an "Other" bucket for the rest — shared
 *  by the chart (mountHomeChart) and its legend (vHome) so they never drift
 *  out of sync with each other. */
function topCategoryBreakdown(scope: Scope, monthKey: string, day: number): { label: string; amt: number }[] {
  const totals = catTotalsPaise(scope, monthKey, day);
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 3).map(([id, amt]) => ({ label: byId(scope.state.categories, id)?.name ?? '—', amt }));
  const otherSum = sorted.slice(3).reduce((s, [, v]) => s + v, 0);
  if (otherSum > 0) top.push({ label: 'Other', amt: otherSum });
  return top;
}

/** Called by App after every render — builds/rebuilds the category doughnut
 *  if the canvas is on screen, and destroys the previous instance (a fresh
 *  canvas element exists after each innerHTML rebuild, so the old Chart.js
 *  instance would otherwise leak). Returns the new instance, or null. */
export function mountHomeChart(app: AppState): Chart | null {
  const canvas = document.getElementById(HOME_CHART_ID) as HTMLCanvasElement | null;
  if (!canvas) return null;
  const monthKey = toMonthKey(today());
  const breakdown = topCategoryBreakdown(app.scope, monthKey, new Date().getDate());
  if (!breakdown.length) return null;
  const cfg: ChartConfiguration<'doughnut'> = {
    type: 'doughnut',
    data: {
      labels: breakdown.map((b) => b.label),
      datasets: [{ data: breakdown.map((b) => b.amt), backgroundColor: chartPalette(), borderWidth: 0 }]
    },
    options: { cutout: '68%', maintainAspectRatio: false, plugins: { legend: { display: false } }, animation: { duration: 500 } }
  };
  return new Chart(canvas, cfg);
}

export function vHome(app: AppState): string {
  const { scope } = app;
  const w = scope.workspace;
  if (!w) return '<div class="empty">No workspace selected.</div>';
  const monthKey = toMonthKey(today());
  const day = new Date().getDate();

  const spendSoFar = jointSpendPaise(scope, monthKey, day);
  const { avgPaise, n } = rollingAvgPaise(scope, monthKey);
  const daysInMonthNow = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
  const pace = day > 0 ? Math.round((spendSoFar / day) * daysInMonthNow) : spendSoFar;
  const paceDeltaPct = avgPaise > 0 ? Math.round(((pace - avgPaise) / avgPaise) * 100) : null;

  const putAway = putAwayPaise(scope, monthKey);

  const isWorker = !can(scope, 'viewWorkspaceTotals');

  if (isWorker) {
    const mine = scope.transactions().filter((t) => t.loggedByMembershipId === scope.me()?.id || t.paidByMembershipId === scope.me()?.id);
    const submitted = mine.filter((t) => t.status === 'submitted');
    const approved = mine.filter((t) => t.status === 'confirmed');
    const rejected = mine.filter((t) => t.status === 'rejected');
    return `<h1>Hi ${esc(scope.me()?.displayName ?? '')}</h1>
    <p class="sub">Your submissions in ${esc(w.name)}</p>
    <div class="card"><div class="grid2">
      <div><div class="big num">${submitted.length}</div><div class="tiny">Waiting</div></div>
      <div><div class="big num">${approved.length}</div><div class="tiny">Approved</div></div>
    </div>${rejected.length ? `<div class="tiny" style="margin-top:9px;color:var(--bad)">${rejected.length} rejected — check Entries to fix and resubmit.</div>` : ''}</div>
    <button class="btn wide" data-goto="add" data-testid="quick-add">Submit an expense</button>
    <h2>Recent</h2>
    <div class="card">${mine.slice(-8).reverse().map((t) => {
      const c = byId(scope.state.categories, t.categoryId);
      return `<div class="tx" data-detail="${t.id}"><div class="ic">${esc(c?.icon ?? '•')}</div>
        <div class="grow"><div class="t1">${esc(c?.name ?? 'Entry')}</div><div class="t2">${esc(t.date)} · ${esc(t.status)}</div></div>
        <div class="val">${formatMoney(t.amountPaise)}</div></div>`;
    }).join('') || '<div class="empty">Nothing yet.</div>'}</div>`;
  }

  // Insight cards, replacing the old plain "needs attention" bullet list —
  // each one tagged good/warn/info so the type reads at a glance, not just the text.
  const insights: { tag: string; tone: 'good' | 'warn' | 'info'; text: string }[] = [];
  const pendingIncome = scope.transactions().filter((t) => t.status === 'pending');
  if (pendingIncome.length) insights.push({ tag: 'Action needed', tone: 'info', text: `${pendingIncome.length} income entr${pendingIncome.length === 1 ? 'y needs' : 'ies need'} confirming.` });
  if (can(scope, 'approve')) {
    const waiting = pendingSubs(scope);
    if (waiting.length) insights.push({ tag: 'Action needed', tone: 'info', text: `${waiting.length} claim${waiting.length === 1 ? '' : 's'} waiting for your approval.` });
  }
  budgetProgress(scope, monthKey).forEach((b) => {
    if (b.limitPaise <= 0) return;
    const pct = b.spentPaise / b.limitPaise;
    if (pct < 0.9) return;
    const label = b.categoryId ? (byId(scope.state.categories, b.categoryId)?.name ?? 'A category') : 'Your overall budget';
    insights.push(b.spentPaise > b.limitPaise
      ? { tag: 'Over budget', tone: 'warn', text: `${label} is over budget by ${formatMoney(b.spentPaise - b.limitPaise)}.` }
      : { tag: 'Close to budget', tone: 'warn', text: `${label} is at ${Math.round(pct * 100)}% of its budget.` });
  });
  if (paceDeltaPct !== null && paceDeltaPct <= -5) {
    insights.push({ tag: 'On pace', tone: 'good', text: `You're tracking ${Math.abs(paceDeltaPct)}% under your ${n}-month average — ${formatMoney(avgPaise - pace)} to the good if it holds.` });
  }
  const toneColor = { good: 'var(--good)', warn: 'var(--warn)', info: 'var(--accent)' } as const;

  const breakdown = topCategoryBreakdown(scope, monthKey, day);
  const chartColors = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'];

  const overallBudget = budgetProgress(scope, monthKey).find((b) => b.categoryId === null);
  const budgetPct = overallBudget && overallBudget.limitPaise > 0 ? Math.min(100, Math.round((spendSoFar / overallBudget.limitPaise) * 100)) : null;

  return `<h1>${esc(w.name)}</h1>
  <p class="sub">Spend so far this month</p>
  <div class="card hero">
    <div class="hero-count big num" data-testid="spend-so-far">${formatMoney(spendSoFar)}</div>
    ${paceDeltaPct !== null ? `<div class="tiny" style="margin-top:4px">
      On pace for ${formatMoney(pace)} · ${paceDeltaPct > 0 ? '+' : ''}${paceDeltaPct}% vs your ${n}-month average</div>` : `<div class="tiny" style="margin-top:4px">Not enough history yet for a pace comparison.</div>`}
    ${putAway > 0 ? `<div class="tiny" style="margin-top:4px;color:var(--good)">Put away this month: ${formatMoney(putAway)}</div>` : ''}
    ${budgetPct !== null ? `<div class="bar" style="background:rgba(255,255,255,.25)"><i style="width:${budgetPct}%;background:#fff" data-testid="budget-bar"></i></div>` : ''}
  </div>

  ${insights.length ? `<div class="insight-row" data-testid="insights">
    ${insights.map((i) => `<div class="insight">
      <div class="tiny" style="text-transform:uppercase;letter-spacing:.06em;font-weight:700;color:${toneColor[i.tone]};margin-bottom:5px">${esc(i.tag)}</div>
      <div class="tiny">${esc(i.text)}</div>
    </div>`).join('')}
  </div>` : ''}

  <h2>Where it went</h2>
  <div class="card" data-testid="cat-chart-card">
    ${breakdown.length ? `<div class="row" style="gap:16px">
      <div class="chartbox" style="height:96px;width:96px;flex:none;margin:0"><canvas id="${HOME_CHART_ID}"></canvas></div>
      <div class="grow" style="min-width:0">
        ${breakdown.map((b, i) => `<div class="list-row" style="border-top:none;padding:4px 0">
          <span class="row" style="gap:7px;font-size:13px"><span class="dot" style="background:${chartColors[i]}"></span>${esc(b.label)}</span>
          <span class="num" style="font-weight:600;font-size:12.5px">${formatMoney(b.amt)}</span>
        </div>`).join('')}
      </div>
    </div>` : '<div class="empty">Nothing logged yet this month.</div>'}
  </div>

  ${goalTeaser(scope)}
  ${eventsCard(scope)}`;
}

/** Just the most recently created goal as a teaser — the full list lives on
 *  the Goals screen. */
function goalTeaser(scope: Scope): string {
  const goals = scope.goals();
  if (!goals.length) return '';
  const g = goals[goals.length - 1]!;
  const owner = byId(scope.state.memberships, g.membershipId);
  const pct = g.targetPaise > 0 ? Math.min(100, Math.round((g.savedPaise / g.targetPaise) * 100)) : 0;
  return `<div class="card tap" data-goto="goals" data-testid="goal-teaser">
    <div class="between"><h3 style="margin:0">${esc(owner?.displayName ?? '')}'s goal · ${esc(g.name)}</h3><span class="tiny">${pct}%</span></div>
    <div class="bar"><i style="width:${pct}%"></i></div>
    <div class="tiny" style="margin-top:7px">${formatMoney(g.savedPaise)} of ${formatMoney(g.targetPaise)} saved</div>
  </div>`;
}

function eventsCard(scope: Scope): string {
  const active = scope.trips().filter((t) => t.status === 'active');
  return `<div class="card">
    <div class="between"><h3 style="margin:0">Events</h3><a href="#" data-goto="trips" class="tiny" data-testid="goto-trips">${active.length ? 'View all ›' : 'Plan one ›'}</a></div>
    ${active.length ? active.slice(0, 3).map((t) => {
      const icon = TRIP_KINDS.find((k) => k[0] === t.kind)?.[1] ?? '🧳';
      return `<div class="list-row tap" data-trip="${t.id}">
        <span style="font-size:13.5px">${icon} ${esc(t.name)}</span><span class="num">${formatMoney(tripTotalPaise(scope, t.id))}</span></div>`;
    }).join('')
      : '<div class="tiny" style="padding:4px 0">Trips, festivals, or any one-off occasion — tracked separately from your household budget.</div>'}
  </div>`;
}
