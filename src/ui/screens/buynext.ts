/* ============================================================================
   "Buy next" screen — what Kunal asked for directly: before you commit to
   buying something again, see what the app thinks is still left and when (and
   for how much) you last bought it. Example from the request: buy 5kg rice,
   two weeks later type "rice" again — see the estimate and the purchase
   record right there, before adding it to the shopping list.

   This extends the existing shopping-list screen (H3/D59) with a live search
   preview, rather than replacing it — the "running low" auto-list is still
   the fastest path for the common case, and this adds the "let me check on
   something specific" path Kunal described.
============================================================================ */
import type { AppState } from '../state';
import { esc } from '../util';
import { can, visibleTx } from '../../domain/permissions';
import { needsBuying, itemState, effectiveQty, lastUnitPricePaise, buyNextPreview } from '../../domain/pantry';
import { formatMoney } from '../../domain/money';

export function vBuyNext(app: AppState, query: string): string {
  const { scope } = app;
  if (!can(scope, 'viewWorkspaceTotals')) {
    return `<h1>Buy next</h1><div class="card"><div class="empty">Stock is not shown to workers.</div></div>`;
  }
  const auto = needsBuying(scope);
  const manual = scope.shoppingList().filter((x) => !x.done);
  const done = scope.shoppingList().filter((x) => x.done);

  const preview = query.trim() ? buyNextPreview(scope, query.trim()) : null;

  return `<h1>Buy next</h1>
  <p class="sub">Check what's left before you buy it again</p>

  <div class="card">
    <label class="f"><span>What are you about to buy?</span>
      <input id="buyNextQuery" placeholder="e.g. rice" value="${esc(query)}" data-testid="buynext-query"></label>
    ${preview ? renderPreview(preview, query) : ''}
    <div class="row" style="margin-top:10px">
      <input id="buyNextQty" placeholder="Quantity (optional)" style="flex:1" data-testid="buynext-qty">
      <button class="btn sm" id="addToShop" data-testid="buynext-add">Add to list</button>
    </div>
  </div>

  <div class="card">
    <h3>Running low or out</h3>
    ${auto.length ? auto.map((i) => {
      const st = itemState(scope, i);
      const price = lastUnitPricePaise(scope, i.id);
      return `<div class="list-row" data-testid="low-item-${esc(i.id)}">
        <div class="grow"><div style="font-weight:600;font-size:13.5px">${esc(i.name)}</div>
          <div class="tiny">About ${Math.round(effectiveQty(scope, i) * 100) / 100} ${esc(i.unit)} left${price ? ` · was ₹${Math.round(price / 100)}/${esc(i.unit)}` : ''}</div></div>
        <span class="pill ${st.cls}">${esc(st.label)}</span></div>`;
    }).join('') : '<div class="empty">Nothing is low.</div>'}
  </div>

  <div class="card">
    <h3>Also on the list</h3>
    ${manual.map((x) => `<div class="listitem" data-testid="shop-item-${esc(x.id)}">
      <span class="grow" style="font-weight:600;font-size:13.5px">${esc(x.name)}</span>
      <button class="btn sm ghost" data-shopdone="${x.id}">Got it</button>
      <button class="x" data-shopdel="${x.id}">×</button></div>`).join('') || '<div class="empty">Nothing added.</div>'}
  </div>
  ${done.length ? `<div class="card"><h3>Picked up</h3>
    ${done.map((x) => `<div class="listitem"><span class="grow tiny" style="text-decoration:line-through">${esc(x.name)}</span>
      <button class="x" data-shopdel="${x.id}">×</button></div>`).join('')}
    <button class="btn sm ghost" id="clearShop" style="margin-top:9px">Clear these</button></div>` : ''}
  <button class="btn wide ghost" data-goto="pantry" style="margin-bottom:14px">Back to pantry</button>`;
}

function renderPreview(preview: ReturnType<typeof buyNextPreview>, query: string): string {
  if (!preview.item) {
    return `<div class="preview-box" data-testid="buynext-preview-new">
      <div class="tiny">"${esc(query)}" isn't tracked yet — adding it will create a new pantry item you can refine later.</div>
    </div>`;
  }
  const lp = preview.lastPurchase;
  return `<div class="preview-box" data-testid="buynext-preview">
    <div style="font-weight:650;font-size:14.5px">${esc(preview.item.name)}</div>
    <div class="tiny" style="margin-top:3px" data-testid="buynext-estimate">${esc(preview.estimateLabel)}</div>
    ${lp
      ? `<div class="tiny" style="margin-top:3px" data-testid="buynext-last-purchase">Last bought ${esc(String(lp.qty))} ${esc(preview.item.unit)} on ${esc(lp.date)}${lp.unitPricePaise ? ` for ₹${Math.round((lp.unitPricePaise * lp.qty) / 100)} (₹${Math.round(lp.unitPricePaise / 100)}/${esc(preview.item.unit)})` : ''}</div>`
      : `<div class="tiny" style="margin-top:3px">No purchase on record yet for this item.</div>`}
    ${preview.priceAlert ? `<div class="tiny" style="margin-top:3px;color:var(--warn)">Price ${preview.priceAlert.dir === 'up' ? 'up' : 'down'} ${preview.priceAlert.pct}% vs your recent median.</div>` : ''}
  </div>`;
}
