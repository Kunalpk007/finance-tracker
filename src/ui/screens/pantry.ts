import type { AppState } from '../state';
import { esc } from '../util';
import { can } from '../../domain/permissions';
import { itemState, effectiveQty, runwayDays, lastUnitPricePaise, RECONCILE_LEVELS } from '../../domain/pantry';
import { byId } from '../../domain/scope';

export function vPantry(app: AppState): string {
  const { scope } = app;
  if (!can(scope, 'viewWorkspaceTotals')) {
    return `<h1>Pantry</h1><div class="card"><div class="empty">Stock is not shown to workers.</div></div>`;
  }
  const items = scope.pantryItems();
  const overdue = items.some((i) => i.tier === 'staple' && i.lastReconciled && daysSince(i.lastReconciled) > 9);
  return `<h1>Pantry</h1>
  <p class="sub">${items.length} item${items.length === 1 ? '' : 's'} tracked</p>
  ${overdue ? `<div class="card" style="background:var(--warn-soft);border-color:#f3dfba">
    <div class="tiny" style="color:#8a5600">A weekly check is overdue for some staples — jump to Reconcile.</div>
    <button class="btn sm" data-goto="reconcile" style="margin-top:8px">Reconcile now</button></div>` : ''}
  <div class="row" style="margin-bottom:10px">
    <button class="btn grow" data-goto="shopping" data-testid="goto-buynext">Buy next</button>
    <button class="btn ghost grow" data-goto="reconcile">Weekly check</button>
  </div>
  <div class="card" data-testid="pantry-list">
    ${items.map((i) => {
      const st = itemState(scope, i);
      const price = lastUnitPricePaise(scope, i.id);
      return `<div class="list-row tap" data-pantryitem="${i.id}" data-testid="pantry-item-${esc(i.id)}">
        <div class="grow"><div style="font-weight:600;font-size:13.5px">${esc(i.name)}</div>
        <div class="tiny">${Math.round(effectiveQty(scope, i) * 100) / 100} ${esc(i.unit)} left${i.weeklyUsage ? ` · uses ~${i.weeklyUsage} ${i.unit}/week` : ''}${price ? ` · ₹${Math.round(price / 100)}/${esc(i.unit)}` : ''}</div></div>
        <span class="pill ${st.cls}">${esc(st.label)}</span></div>`;
    }).join('') || '<div class="empty">No pantry items yet.</div>'}
  </div>`;
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

export function vPantryItem(app: AppState): string {
  const { scope } = app;
  const item = byId(scope.state.pantryItems, app.pantryItemId ?? undefined);
  if (!item) return `<h1>Item</h1><div class="empty">Not found.</div><button class="btn wide ghost" data-goto="pantry">Back</button>`;
  const st = itemState(scope, item);
  const rd = runwayDays(scope, item);
  const price = lastUnitPricePaise(scope, item.id);
  return `<h1>${esc(item.name)}</h1>
  <div class="card">
    <div class="between"><span class="pill ${st.cls}">${esc(st.label)}</span></div>
    <div class="mid" style="margin-top:8px">${Math.round(effectiveQty(scope, item) * 100) / 100} ${esc(item.unit)}</div>
    ${rd !== null ? `<div class="tiny">~${Math.round(rd)} days of runway at current usage</div>` : ''}
    ${price ? `<div class="tiny">Last price: ₹${Math.round(price / 100)}/${esc(item.unit)}</div>` : ''}
  </div>
  <button class="btn wide ghost" data-goto="pantry" style="margin-bottom:14px">Back to pantry</button>`;
}

export function vReconcile(app: AppState): string {
  const { scope } = app;
  const items = scope.pantryItems().filter((i) => i.tier === 'staple');
  return `<h1>Weekly check</h1>
  <p class="sub">Quick correction — how much is actually left?</p>
  <div class="card" data-testid="reconcile-list">
    ${items.map((i) => `<div class="list-block">
      <div style="font-weight:600;font-size:13.5px;margin-bottom:7px">${esc(i.name)}</div>
      <div class="chips">
        ${RECONCILE_LEVELS.map(([key, label]) => `<button class="chip" data-reconcile="${i.id}" data-level="${key}" data-testid="reconcile-${esc(i.id)}-${key}">${esc(label)}</button>`).join('')}
      </div></div>`).join('') || '<div class="empty">No staples to check.</div>'}
  </div>
  <button class="btn wide ghost" data-goto="pantry" style="margin-bottom:14px">Back to pantry</button>`;
}
