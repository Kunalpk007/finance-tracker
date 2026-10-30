import type { AppState } from '../state';
import { esc } from '../util';
import { formatMoney } from '../../domain/money';
import { byId } from '../../domain/scope';

export function vGoals(app: AppState): string {
  const { scope } = app;
  const goals = scope.goals().slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const rows = goals.map((g) => {
    const owner = byId(scope.state.memberships, g.membershipId);
    const pct = g.targetPaise > 0 ? Math.min(100, Math.round((g.savedPaise / g.targetPaise) * 100)) : 0;
    const done = g.savedPaise >= g.targetPaise;
    return `<div class="card" data-testid="goal-${g.id}">
      <div class="between">
        <div>
          <div class="tiny" style="text-transform:uppercase;letter-spacing:.06em">${esc(owner?.displayName ?? '—')}'s goal</div>
          <h3 style="margin:2px 0 0">${esc(g.name)}</h3>
        </div>
        <button class="x" data-rmgoal="${g.id}" data-testid="rm-goal-${g.id}">×</button>
      </div>
      <div class="between" style="margin-top:8px">
        <span class="tiny">${formatMoney(g.savedPaise)} of ${formatMoney(g.targetPaise)} saved</span>
        <span class="tiny" style="font-weight:650;color:${done ? 'var(--good)' : 'var(--ink2)'}">${done ? 'Reached 🎉' : pct + '%'}</span>
      </div>
      <div class="bar"><i style="width:${pct}%${done ? ';background:var(--good)' : ''}"></i></div>
      ${!done ? `<div class="row" style="margin-top:10px">
        <input id="goalSaved-${g.id}" type="number" placeholder="Amount saved, ₹" data-testid="goal-add-input-${g.id}">
        <button class="btn sm" data-addsaved="${g.id}" data-testid="goal-add-btn-${g.id}">Add</button>
      </div>` : ''}
    </div>`;
  }).join('');

  return `<h1>Goals</h1>
  <p class="sub">Personal savings targets, visible only to you — log what you've put aside as you go.</p>
  ${rows || '<div class="card"><div class="empty">No goals yet. Declare one from Settings.</div></div>'}`;
}
