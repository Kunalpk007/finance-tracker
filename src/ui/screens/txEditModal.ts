import type { AppState } from '../state';
import { esc } from '../util';
import { catsByFrequency } from '../../domain/transactions';
import { can } from '../../domain/permissions';

/** Editing an existing entry opens this modal (category as a dropdown, not
 *  the tap-grid — the grid is for fast NEW entries; editing is a correction,
 *  not a race). Skips the duplicate-warning/pantry-preview shown on the new-
 *  entry screen — those exist to catch mistakes going IN, not on a fix-up. */
export function vTxEditModal(app: AppState): string {
  const d = app.draft;
  if (!d || !d.id) return '';
  const { scope } = app;
  const accounts = scope.accounts();
  const cats = catsByFrequency(scope, d.type === 'income' ? 'income' : 'expense');

  const toAccountField = d.type === 'transfer' ? `<label class="f"><span>To account</span>
    <select id="toAccount" data-testid="edit-tx-to-account">${accounts.filter((a) => a.id !== d.accountId).map((a) => `<option value="${a.id}" ${d.toAccountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>` : '';

  return `<dialog class="modal" id="txEditModal">
    <div class="modal-body">
      <h2>Edit entry</h2>
      <div class="amt-wrap"><span>₹</span><input id="txAmount" inputmode="decimal" value="${esc(d.amount)}" autofocus data-testid="edit-tx-amount"></div>
      ${d.type !== 'transfer' ? `<label class="f"><span>Category</span><select id="txCategorySelect" data-testid="edit-tx-category">
        ${cats.map((c) => `<option value="${c.id}" ${d.categoryId === c.id ? 'selected' : ''}>${esc(c.icon)} ${esc(c.name)}</option>`).join('')}
      </select></label>` : ''}
      <label class="f"><span>Date</span><input id="txDate" type="date" value="${esc(d.date)}" data-testid="edit-tx-date"></label>
      <label class="f"><span>Account</span><select id="txAccount" data-testid="edit-tx-account">${accounts.map((a) => `<option value="${a.id}" ${d.accountId === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      ${toAccountField}
      <label class="f"><span>Note</span><input id="txNote" value="${esc(d.note)}" data-testid="edit-tx-note"></label>
      <label class="f"><span>Vendor</span><input id="txVendor" value="${esc(d.vendor)}" data-testid="edit-tx-vendor"></label>
      ${can(scope, 'attribute') ? `<label class="f"><span>Paid by</span><select id="txPaidBy" data-testid="edit-tx-paidby">
        ${scope.activeMembers().map((m) => `<option value="${m.id}" ${d.paidByMembershipId === m.id ? 'selected' : ''}>${esc(m.displayName)}</option>`).join('')}
      </select></label>` : ''}
      <label class="row"><input type="checkbox" id="txPersonal" style="width:18px;height:18px;flex:none" ${d.isPersonal ? 'checked' : ''}><span>Personal (excluded from joint totals)</span></label>
      <div class="row" style="margin-top:12px">
        <button class="btn grow" id="saveTx" data-testid="edit-tx-save">Save</button>
        <button class="btn ghost" id="cancelTxEdit" data-testid="edit-tx-cancel">Cancel</button>
      </div>
    </div>
  </dialog>`;
}
