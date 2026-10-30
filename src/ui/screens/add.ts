import type { AppState } from '../state';
import { esc } from '../util';
import { catsByFrequency, needsApproval, findDuplicate } from '../../domain/transactions';
import { can } from '../../domain/permissions';
import { buyNextPreview } from '../../domain/pantry';

export function ensureDraft(app: AppState): void {
  if (app.draft) return;
  const me = app.scope.me();
  app.draft = {
    id: null, type: 'expense', amount: '', date: new Date().toISOString().slice(0, 10),
    categoryId: null, accountId: app.scope.meta().lastAccountId || app.scope.accounts()[0]?.id || '',
    toAccountId: null, paidByMembershipId: me?.id || '', isPersonal: false, note: '', vendor: '', photoPath: null, _dupeAck: false
  };
}

export function vAdd(app: AppState): string {
  ensureDraft(app);
  const d = app.draft!;
  const { scope } = app;
  const accounts = scope.accounts();
  const cats = catsByFrequency(scope, d.type === 'income' ? 'income' : 'expense');
  const claim = needsApproval(scope);

  const typeSeg = `<div class="seg" data-testid="tx-type">
    ${(['expense', 'income', 'transfer'] as const).map((t) => `<button class="${d.type === t ? 'on' : ''}" data-txtype="${t}">${t[0]!.toUpperCase() + t.slice(1)}</button>`).join('')}
  </div>`;

  const catGrid = d.type !== 'transfer' ? `<div class="catgrid" data-testid="category-grid">
    ${cats.map((c) => `<button class="${d.categoryId === c.id ? 'on' : ''}" data-cat="${c.id}"><em>${esc(c.icon)}</em>${esc(c.name)}</button>`).join('') || '<div class="empty">No categories yet.</div>'}
  </div>` : '';

  const toAccountField = d.type === 'transfer' ? `<label class="f"><span>To account</span>
    <select id="toAccount" data-testid="to-account">${accounts.filter((a) => a.id !== d.accountId).map((a) => `<option value="${a.id}" ${d.toAccountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : '';

  const dupe = findDuplicate(scope, { id: d.id, type: d.type, amountPaise: Math.round(parseFloat(d.amount || '0') * 100), date: d.date, categoryId: d.categoryId, accountId: d.accountId, toAccountId: d.toAccountId, paidByMembershipId: d.paidByMembershipId, isPersonal: d.isPersonal, note: d.note, vendor: d.vendor, photoPath: d.photoPath });
  const dupeWarning = dupe && !d._dupeAck ? `<div class="card" style="background:var(--warn-soft);border-color:#f3dfba" data-testid="dupe-warning">
    <div class="tiny" style="color:#8a5600">This looks like a possible duplicate of an entry already logged on ${esc(dupe.date)}. <a href="#" data-ackdupe="1">It's not, add anyway</a></div></div>` : '';

  // Buy-next-style live preview when the note/vendor look like a pantry purchase — surfaced
  // inline so a grocery entry can show "you last bought this for ₹X" without a separate screen.
  const pantryPreview = d.type === 'expense' && d.note ? buyNextPreview(scope, d.note) : null;

  return `<h1>${claim ? 'Submit expense' : 'Add entry'}</h1>
  ${claim ? '<p class="sub">This goes to your admin for approval before it counts toward anything.</p>' : ''}
  ${typeSeg}
  <div class="card">
    <div class="amt-wrap"><span>₹</span><input id="txAmount" inputmode="decimal" placeholder="0" value="${esc(d.amount)}" autofocus data-testid="tx-amount"></div>
  </div>
  ${catGrid}
  <div class="card">
    <label class="f"><span>Date</span><input id="txDate" type="date" value="${esc(d.date)}" data-testid="tx-date"></label>
    <label class="f"><span>Account</span><select id="txAccount" data-testid="tx-account">${accounts.map((a) => `<option value="${a.id}" ${d.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
    ${toAccountField}
    <label class="f"><span>Note</span><input id="txNote" placeholder="Optional" value="${esc(d.note)}" data-testid="tx-note"></label>
    <label class="f"><span>Vendor</span><input id="txVendor" placeholder="Optional" value="${esc(d.vendor)}" data-testid="tx-vendor"></label>
    ${can(scope, 'attribute') ? `<label class="f"><span>Paid by</span><select id="txPaidBy" data-testid="tx-paidby">
      ${scope.activeMembers().map((m) => `<option value="${m.id}" ${d.paidByMembershipId === m.id ? 'selected' : ''}>${esc(m.displayName)}</option>`).join('')}
    </select></label>` : ''}
    <label class="row"><input type="checkbox" id="txPersonal" style="width:18px;height:18px;flex:none" ${d.isPersonal ? 'checked' : ''}><span>Personal (excluded from joint totals)</span></label>
  </div>
  ${pantryPreview && pantryPreview.item ? `<div class="preview-box" data-testid="add-pantry-preview">
    <div class="tiny" style="font-weight:600">${esc(pantryPreview.item.name)}: ${esc(pantryPreview.estimateLabel)}</div>
    ${pantryPreview.lastPurchase ? `<div class="tiny">Last bought ${esc(pantryPreview.lastPurchase.qty)} ${esc(pantryPreview.item.unit)} on ${esc(pantryPreview.lastPurchase.date)}${pantryPreview.lastPurchase.unitPricePaise ? ` at ₹${Math.round(pantryPreview.lastPurchase.unitPricePaise / 100)}/${esc(pantryPreview.item.unit)}` : ''}</div>` : ''}
  </div>` : ''}
  ${dupeWarning}
  <button class="btn wide" id="saveTx" data-testid="tx-save">${claim ? 'Submit for approval' : 'Save'}</button>
  <button class="btn wide ghost" data-goto="home" style="margin:8px 0 14px">Cancel</button>`;
}
