import type { AppState } from '../state';
import { esc } from '../util';
import { formatMoney, paiseToRupees } from '../../domain/money';
import { visibleTx, canEdit, canDelete, canVoid, lifecycleNote, can } from '../../domain/permissions';
import { byId } from '../../domain/scope';

export function vTx(app: AppState): string {
  const { scope } = app;
  const q = app.txSearch.trim().toLowerCase();
  let rows = visibleTx(scope).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  if (q) {
    rows = rows.filter((t) => {
      const c = byId(scope.state.categories, t.categoryId);
      const haystack = `${t.note} ${t.vendor} ${c?.name ?? ''} ${paiseToRupees(t.amountPaise)}`.toLowerCase();
      return haystack.includes(q);
    });
  }
  return `<h1>Entries</h1>
  <input id="txSearch" placeholder="Search by note, vendor, category, amount…" value="${esc(app.txSearch)}" style="margin-bottom:10px" data-testid="tx-search">
  <p class="sub">${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}${q ? ` matching “${esc(app.txSearch.trim())}”` : ''}</p>
  <div class="card" data-testid="tx-list">
    ${rows.map((t) => {
      const c = byId(scope.state.categories, t.categoryId);
      const badge = t.status === 'submitted' ? 'p-warn' : t.status === 'rejected' ? 'p-bad' : t.status === 'voided' ? 'p-neut' : t.status === 'pending' ? 'p-warn' : 'p-good';
      const sign = t.type === 'income' ? '+' : t.type === 'expense' ? '−' : '';
      return `<div class="tx" data-detail="${t.id}" data-testid="tx-row-${esc(t.id)}">
        <div class="ic">${esc(c?.icon ?? (t.type === 'transfer' ? '⇄' : '•'))}</div>
        <div class="grow"><div class="t1">${esc(c?.name ?? (t.type === 'transfer' ? 'Transfer' : 'Entry'))}${t.vendor ? ' · ' + esc(t.vendor) : ''}</div>
        <div class="t2">${esc(t.date)} ${t.status !== 'confirmed' ? `<span class="pill ${badge}">${esc(t.status)}</span>` : ''}</div></div>
        <div class="val num">${sign}${formatMoney(t.amountPaise)}</div>
        <button class="x" data-repeat="${t.id}" data-testid="repeat-${t.id}" title="Repeat as a new entry today">↻</button>
        ${canDelete(scope, t) ? `<button class="x" data-ddelete="${t.id}" data-testid="rm-tx-${esc(t.id)}" title="Delete entry" style="color:var(--bad)">×</button>` : ''}
      </div>`;
    }).join('') || (q ? `<div class="empty">Nothing matches “${esc(app.txSearch.trim())}”.</div>` : '<div class="empty">No entries yet.</div>')}
  </div>`;
}

export function vDetail(app: AppState): string {
  const { scope } = app;
  const t = byId(scope.state.transactions, app.detailId ?? undefined);
  if (!t || t.workspaceId !== scope.activeWorkspaceId || !visibleTx(scope).some((x) => x.id === t.id)) {
    return `<h1>Entry</h1><div class="card"><div class="empty">That entry is not available.</div></div>
      <button class="btn wide ghost" data-goto="tx">Back to entries</button>`;
  }
  const c = byId(scope.state.categories, t.categoryId);
  const a = byId(scope.state.accounts, t.accountId);
  const to = byId(scope.state.accounts, t.toAccountId ?? undefined);
  const paid = byId(scope.state.memberships, t.paidByMembershipId);
  const logged = byId(scope.state.memberships, t.loggedByMembershipId);
  const badgeMap: Record<string, [string, string]> = {
    submitted: ['p-warn', 'Awaiting approval'], rejected: ['p-bad', 'Rejected'], voided: ['p-neut', 'Voided'],
    pending: ['p-warn', 'Pending confirmation'], confirmed: [t.wasSubmitted ? 'p-good' : 'p-neut', t.wasSubmitted ? 'Approved' : 'Recorded']
  };
  const badge = badgeMap[t.status] ?? ['p-neut', t.status];
  const row = (k: string, v: string | null | undefined) => v ? `<div class="list-row">
      <span class="tiny">${esc(k)}</span><span style="font-size:13.5px;font-weight:600;text-align:right">${esc(v)}</span></div>` : '';
  const note = lifecycleNote(t);

  return `<h1>${t.type === 'transfer' ? 'Transfer' : (c ? c.name : 'Entry')}</h1>
  <p class="sub">${esc(t.date)}</p>
  <div class="card" data-testid="detail-card">
    <div class="between" style="align-items:flex-start">
      <div class="big num" style="font-size:27px">${t.type === 'income' ? '+' : t.type === 'expense' ? '−' : ''}${formatMoney(t.amountPaise)}</div>
      <span class="pill ${badge[0]}">${esc(badge[1])}</span>
    </div>
    <div style="margin-top:9px">
      ${row('Category', t.type === 'transfer' ? `to ${to ? to.name : '—'}` : (c ? c.name : '—'))}
      ${row(t.type === 'income' ? 'Received into' : 'Paid with', a ? a.name + (a.last4 ? ' ··' + a.last4 : '') : '')}
      ${row('Vendor', t.vendor)}
      ${row('Note', t.note)}
      ${row(t.type === 'income' ? 'Received by' : 'Paid by', paid ? paid.displayName : '')}
      ${row('Logged by', logged ? logged.displayName : '')}
      ${row('Personal', t.isPersonal ? 'excluded from joint totals' : '')}
      ${row('Rejected because', t.rejectReason)}
      ${row('Voided because', t.voidReason)}
    </div>
  </div>
  ${note ? `<div class="card" style="background:${t.status === 'rejected' ? 'var(--bad-soft)' : 'var(--warn-soft)'};border-color:${t.status === 'rejected' ? '#f5c6c4' : '#f3dfba'}">
    <div class="tiny" style="line-height:1.5">${esc(note)}</div></div>` : ''}

  ${t.status === 'submitted' && can(scope, 'approve') ? `<div class="row" style="margin-bottom:10px">
    <button class="btn grow" data-dapprove="${t.id}" data-testid="detail-approve">Approve</button>
    <button class="btn ghost grow" data-dreject="${t.id}" style="color:var(--bad);border-color:#f5c6c4" data-testid="detail-reject">Reject</button></div>` : ''}

  ${canEdit(scope, t) ? `<button class="btn wide" data-dedit="${t.id}" style="margin-bottom:10px" data-testid="detail-edit">
    ${t.status === 'rejected' ? 'Correct and resubmit' : 'Edit entry'}</button>` : ''}

  <button class="btn wide ghost" data-repeat="${t.id}" style="margin-bottom:10px" data-testid="detail-repeat">Repeat as a new entry today</button>

  ${canDelete(scope, t) ? `<button class="btn wide ghost" data-ddelete="${t.id}"
    style="color:var(--bad);border-color:#f5c6c4;margin-bottom:10px" data-testid="detail-delete">
    ${t.status === 'submitted' ? 'Withdraw this claim' : 'Delete entry'}</button>` : ''}

  ${canVoid(scope, t) ? `<div class="card">
    <h3>Void this entry</h3>
    <div class="tiny" style="margin-bottom:9px">It stays on record and stops counting toward every total. A reason is required.</div>
    <input id="voidReason" placeholder="Why is this being voided?" style="margin-bottom:9px" data-testid="void-reason">
    <button class="btn wide danger" data-dvoid="${t.id}" data-testid="detail-void">Void entry</button>
  </div>` : ''}

  <button class="btn wide ghost" data-goto="tx" style="margin-bottom:14px">Back to entries</button>`;
}
