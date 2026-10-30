import type { AppState } from '../state';
import { esc } from '../util';
import { formatMoney, sumPaise } from '../../domain/money';
import { can } from '../../domain/permissions';
import { pendingSubs } from '../../domain/transactions';
import { byId } from '../../domain/scope';

export function vApprovals(app: AppState): string {
  const { scope } = app;
  const subs = pendingSubs(scope).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const recent = scope.transactions().filter((t) => t.status === 'rejected').slice(-5).reverse();
  const isAdmin = can(scope, 'approve');
  const card = (t: (typeof subs)[number]) => {
    const c = byId(scope.state.categories, t.categoryId);
    const who = byId(scope.state.memberships, t.loggedByMembershipId);
    return `<div class="card" data-testid="approval-${esc(t.id)}">
      <div class="row" style="align-items:flex-start">
        <div class="ic" style="width:64px;height:64px;border-radius:10px;font-size:24px">${esc(c?.icon ?? '•')}</div>
        <div class="grow" data-detail="${t.id}" style="cursor:pointer">
          <div class="mid num">${formatMoney(t.amountPaise)}</div>
          <div style="font-weight:600;font-size:13.5px">${esc(c?.name ?? 'Uncategorised')}${t.vendor ? ' · ' + esc(t.vendor) : ''}</div>
          <div class="tiny">${esc(who?.displayName ?? '?')} · ${esc(t.date)}</div>
          ${t.note ? `<div class="tiny" style="margin-top:3px">"${esc(t.note)}"</div>` : ''}
        </div>
      </div>
      <div class="row" style="margin-top:11px">
        <button class="btn sm grow" data-approve="${t.id}" data-testid="approve-${esc(t.id)}">Approve</button>
        <button class="btn sm ghost grow" data-reject="${t.id}" style="color:var(--bad);border-color:#f5c6c4" data-testid="reject-${esc(t.id)}">Reject</button>
      </div>
      <div id="rej-${t.id}" style="display:none;margin-top:9px">
        <input id="rr-${t.id}" placeholder="Reason (optional)" style="margin-bottom:7px" data-testid="reject-reason-${esc(t.id)}">
        <button class="btn sm danger" data-doreject="${t.id}" data-testid="confirm-reject-${esc(t.id)}">Confirm rejection</button>
      </div>
    </div>`;
  };
  return `<h1>Approvals</h1>
  <p class="sub">${subs.length ? `${subs.length} claim${subs.length === 1 ? '' : 's'} worth ${formatMoney(sumPaise(subs.map((t) => t.amountPaise)))} waiting` : 'Nothing waiting'}</p>
  ${!isAdmin ? `<div class="card" style="background:var(--warn-soft);border-color:#f3dfba"><div class="tiny" style="color:#8a5600">Only an admin can approve.</div></div>` : ''}
  ${subs.length ? subs.map(card).join('') : '<div class="card"><div class="empty">No claims pending.</div></div>'}
  ${recent.length ? `<h2>Recently rejected</h2><div class="card">${recent.map((t) => {
    const c = byId(scope.state.categories, t.categoryId);
    return `<div class="listitem"><div class="grow"><div style="font-weight:600;font-size:13.5px">${formatMoney(t.amountPaise)} · ${esc(c?.name ?? '—')}</div>
      <div class="tiny">${esc(t.date)}${t.rejectReason ? ' · ' + esc(t.rejectReason) : ''}</div></div>
      <button class="btn sm ghost" data-approve="${t.id}">Approve anyway</button></div>`;
  }).join('')}</div>` : ''}`;
}

export function vActivity(app: AppState): string {
  const { scope } = app;
  if (!can(scope, 'viewAudit')) return `<h1>Activity</h1><div class="card"><div class="empty">Only an admin can view the audit log.</div></div>
    <button class="btn wide ghost" data-goto="home">Back</button>`;
  const entries = scope.audit().slice().reverse();
  return `<h1>Activity</h1>
  <p class="sub">Append-only — every rupee has a provenance</p>
  <div class="card" data-testid="audit-list">
    ${entries.map((e) => {
      const who = byId(scope.state.memberships, e.actorMembershipId);
      const d = new Date(e.ts);
      return `<div class="listitem"><div class="grow">
        <div style="font-size:13.5px"><b>${esc(who?.displayName ?? '?')}</b> ${esc(e.action)} ${esc(e.detail)}</div>
        <div class="tiny">${d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</div>
      </div></div>`;
    }).join('') || '<div class="empty">No activity yet.</div>'}
  </div>`;
}
