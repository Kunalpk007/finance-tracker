import type { AppState } from '../state';
import { esc } from '../util';
import { formatMoney } from '../../domain/money';
import { can } from '../../domain/permissions';
import { recipeFor, dishMarginPaise, dayCloseSummary } from '../../domain/recipes';
import { today } from '../../domain/dates';
import { byId } from '../../domain/scope';

export function vMenu(app: AppState): string {
  const { scope } = app;
  if (scope.workspace?.type !== 'business') return `<h1>Menu</h1><div class="empty">Menu items are a business-workspace feature.</div>`;
  const items = scope.menuItems();
  return `<h1>Menu &amp; recipes</h1>
  <p class="sub">Each dish's ingredient list — orders deduct stock automatically</p>
  <div class="card" data-testid="menu-list">
    ${items.map((mi) => {
      const lines = recipeFor(scope, mi.id);
      const margin = can(scope, 'manageSetup') ? dishMarginPaise(scope, mi) : null;
      return `<div class="list-block" data-testid="menu-item-${esc(mi.id)}">
        <div class="between"><span style="font-weight:600;font-size:13.5px">${esc(mi.name)}</span><span class="num">${formatMoney(mi.pricePaise)}</span></div>
        <div class="tiny">${lines.map((l) => `${l.qty}${l.unit} ${byId(scope.state.pantryItems, l.itemId)?.name ?? '?'}`).join(', ') || 'No recipe set'}</div>
        ${margin ? `<div class="tiny" style="color:${margin.marginPaise >= 0 ? 'var(--good)' : 'var(--bad)'}">Cost ${formatMoney(margin.costPaise)} · margin ${margin.marginPct}%</div>` : ''}
      </div>`;
    }).join('') || '<div class="empty">No menu items yet.</div>'}
  </div>
  ${can(scope, 'manageSetup') ? `<div class="card">
    <h3>Add a menu item</h3>
    <label class="f"><span>Name</span><input id="miName" placeholder="e.g. Butter Chicken" data-testid="menu-name"></label>
    <label class="f"><span>Price (₹)</span><input id="miPrice" inputmode="decimal" data-testid="menu-price"></label>
    <button class="btn wide" id="addMenuItem" data-testid="menu-add">Add</button>
  </div>` : ''}
  <button class="btn wide ghost" data-goto="home" style="margin-bottom:14px">Back</button>`;
}

export function vOrders(app: AppState): string {
  const { scope } = app;
  if (scope.workspace?.type !== 'business') return `<h1>Orders</h1><div class="empty">Order logging is a business-workspace feature.</div>`;
  const items = scope.menuItems();
  return `<h1>Log a sale</h1>
  <p class="sub">Deducts ingredients automatically via the recipe</p>
  <div class="card">
    ${items.map((mi) => `<div class="list-row">
      <span style="font-weight:600;font-size:13.5px">${esc(mi.name)}</span>
      <div class="row" style="gap:6px">
        <input type="number" min="1" value="1" style="width:64px;padding:7px" id="qty-${mi.id}" data-testid="order-qty-${esc(mi.id)}">
        <button class="btn sm" data-logorder="${mi.id}" data-testid="order-log-${esc(mi.id)}">Sold</button>
      </div></div>`).join('') || '<div class="empty">Add menu items first.</div>'}
  </div>
  <button class="btn wide ghost" data-goto="dayclose" style="margin-bottom:14px">Day close summary</button>`;
}

export function vDayClose(app: AppState): string {
  const { scope } = app;
  const date = today();
  const summary = dayCloseSummary(scope, date);
  const revenue = summary.reduce((a, s) => a + s.revenuePaise, 0);
  return `<h1>Day close</h1>
  <p class="sub">${esc(date)}</p>
  <div class="card"><div class="mid num">${formatMoney(revenue)}</div><div class="tiny">Total sales logged today</div></div>
  <div class="card" data-testid="dayclose-list">
    ${summary.map((s) => `<div class="list-row">
      <span style="font-size:13.5px">${esc(s.menuItemName)} × ${s.qty}</span><span class="num">${formatMoney(s.revenuePaise)}</span></div>`).join('') || '<div class="empty">Nothing sold yet today.</div>'}
  </div>
  <button class="btn wide ghost" data-goto="home" style="margin-bottom:14px">Back</button>`;
}
