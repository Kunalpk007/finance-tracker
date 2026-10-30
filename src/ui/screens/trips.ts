import type { AppState } from '../state';
import { esc } from '../util';
import { formatMoney } from '../../domain/money';
import { byId } from '../../domain/scope';
import type { TripMember } from '../../domain/types';
import { TRIP_CATEGORIES, TRIP_KINDS, tripTotalPaise, tripCategoryTotals, tripBalances, tripCategoryMeta, expensePayments } from '../../domain/trips';

/** Custom-category name box, shown while the "Custom" category is selected. */
const customCatField = (app: AppState) => app.tripExpenseCategory === 'custom'
  ? `<label class="f"><span>Category name</span><input id="tripCustomCat" placeholder="e.g. Gifts" value="${esc(app.tripDraft.customCat)}" data-testid="trip-custom-cat"></label>` : '';

/** "Split between" chips + "Paid by" (one person, or an amount per person) —
 *  shared by the add form and the edit modal. */
function splitAndPaidBy(app: AppState, members: TripMember[]): string {
  const td = app.tripDraft;
  const many = members.length > 1;
  const picked = new Set(td.splitAmong ?? members.map((m) => m.id));
  const split = many ? `<div class="f"><span>Split between</span><div class="chips">
    ${members.map((m) => `<button type="button" class="chip ${picked.has(m.id) ? 'on' : ''}" data-tripsplit="${m.id}" data-testid="trip-split-${m.id}">${esc(m.name)}</button>`).join('')}
  </div></div>` : '';

  let paidBy: string;
  if (td.multiPay && many) {
    const paid = members.reduce((n, m) => n + Math.round(parseFloat(td.payAmounts[m.id] || '0') * 100), 0);
    const left = Math.round(parseFloat(td.amount || '0') * 100) - paid;
    paidBy = `<div class="f"><span>Paid by</span>
      ${members.map((m) => `<div class="row" style="margin-bottom:6px"><span class="grow" style="font-size:13.5px">${esc(m.name)}</span>
        <div class="amt-wrap" style="width:120px"><span>₹</span><input id="tripPay-${m.id}" inputmode="decimal" placeholder="0" value="${esc(td.payAmounts[m.id] ?? '')}" data-testid="trip-pay-${m.id}"></div></div>`).join('')}
      <div class="tiny" data-testid="trip-pay-left">${left === 0 ? 'Fully covered' : left > 0 ? `${formatMoney(left)} still to assign` : `${formatMoney(-left)} over the bill`}</div></div>`;
  } else {
    paidBy = `<label class="f"><span>Paid by</span><select id="tripPaidBy" data-testid="trip-paidby">${members.map((m) => `<option value="${m.id}" ${td.paidBy === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>`;
  }
  const toggle = many ? `<button type="button" class="btn sm ghost" data-tripmulti="1" data-testid="trip-multi-pay">${td.multiPay ? 'One person paid' : 'Multiple people paid'}</button>` : '';
  return split + paidBy + toggle;
}

export function vTripList(app: AppState): string {
  const { scope } = app;
  const trips = scope.trips().slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const rows = trips.map((t) => {
    const total = tripTotalPaise(scope, t.id);
    const dates = t.startDate ? `${esc(t.startDate)}${t.endDate ? ' – ' + esc(t.endDate) : ''}` : '';
    const icon = TRIP_KINDS.find((k) => k[0] === t.kind)?.[1] ?? '🧳';
    return `<div class="tx" data-trip="${t.id}" data-testid="trip-${t.id}">
      <div class="ic">${icon}</div>
      <div class="grow"><div class="t1">${esc(t.name)}${t.status === 'closed' ? ' · closed' : ''}</div><div class="t2">${dates}</div></div>
      <div class="val">${formatMoney(total)}</div>
    </div>`;
  }).join('');

  return `<h1>Events</h1>
  <p class="sub">Trips, festivals, and any occasion-scoped spend — kept separate from your household reports and budgets.</p>

  <div class="card">
    <label class="f"><span>Event name</span><input id="tripName" placeholder="e.g. Goa 2026, Diwali 2026" data-testid="trip-name"></label>
    <div class="seg" data-testid="event-kind">
      ${TRIP_KINDS.map(([k, icon, label]) => `<button class="${app.tripKind === k ? 'on' : ''}" data-evkind="${k}" data-testid="event-kind-${k}">${icon} ${esc(label)}</button>`).join('')}
    </div>
    <label class="f"><span>People (comma separated, optional)</span><input id="tripPeople" placeholder="e.g. Priya, Rahul — you're added automatically" data-testid="trip-people"></label>
    <div class="row">
      <label class="f"><span>Start date</span><input id="tripStart" type="date" required data-testid="trip-start"></label>
      <label class="f"><span>End date (optional)</span><input id="tripEnd" type="date" data-testid="trip-end"></label>
    </div>
    <button class="btn sm" id="doCreateTrip" data-testid="create-trip">Create event</button>
  </div>

  <div class="card">${rows || '<div class="empty">No events yet.</div>'}</div>`;
}

export function vTripDetail(app: AppState): string {
  const { scope } = app;
  const trip = byId(scope.state.trips, app.tripId);
  if (!trip) return '<div class="empty">Event not found.</div>';

  const members = scope.tripMembers(trip.id);
  const expenses = scope.tripExpenses(trip.id).slice().sort((a, b) => b.date.localeCompare(a.date));
  const total = tripTotalPaise(scope, trip.id);
  const catTotals = tripCategoryTotals(scope, trip.id);
  const balances = tripBalances(scope, trip.id);

  const catRows = Object.entries(catTotals).map(([key, paise]) => {
    const [icon, label] = key.startsWith('custom:') ? tripCategoryMeta('custom', key.slice(7)) : tripCategoryMeta(key as any);
    return `<div class="list-row"><span style="font-size:13.5px">${icon} ${esc(label)}</span><span class="num">${formatMoney(paise)}</span></div>`;
  }).join('');

  const expenseRows = expenses.map((e) => {
    const m = byId(scope.state.tripMembers, e.paidByTripMemberId);
    const [icon, label] = tripCategoryMeta(e.category, e.categoryLabel);
    const pays = expensePayments(e);
    const payers = pays.length > 1 ? pays.map((p) => byId(scope.state.tripMembers, p.memberId)?.name ?? '—').join(', ') : (m?.name ?? '—');
    const sharers = e.splitAmong?.length ? ` · split ${e.splitAmong.length} ways` : '';
    return `<div class="list-row tap" data-edittripexpense="${e.id}" data-testid="trip-expense-${e.id}">
      <div><div style="font-size:13.5px">${icon} ${esc(label)}${e.note ? ' · ' + esc(e.note) : ''}</div>
        <div class="tiny">${esc(e.date)} · paid by ${esc(payers)}${sharers}</div></div>
      <div class="row"><span class="num">${formatMoney(e.amountPaise)}</span>
        <button class="x" data-rmtripexpense="${e.id}" data-testid="rm-trip-expense-${e.id}">×</button></div>
    </div>`;
  }).join('');

  const balanceRows = balances.map((b) => `<div class="list-row">
    <span style="font-size:13.5px">${esc(b.name)}</span>
    <span class="tiny" style="color:${b.balancePaise >= 0 ? 'var(--good)' : 'var(--bad)'}">
      ${b.balancePaise >= 0 ? 'gets back ' : 'owes '}${formatMoney(Math.abs(b.balancePaise))}</span></div>`).join('');

  return `<h1>${esc(trip.name)}</h1>
  <p class="sub">${trip.startDate ? esc(trip.startDate) + (trip.endDate ? ' – ' + esc(trip.endDate) : '') : ''}${trip.status === 'closed' ? ' · closed' : ''}</p>

  <div class="card hero">
    <div class="hero-count big num" data-testid="trip-total">${formatMoney(total)}</div>
    <div class="tiny" style="margin-top:4px">Total event spend</div>
  </div>

  <div class="row" style="margin-bottom:10px">
    <button class="btn sm ghost grow" data-peoplepanel="list" data-testid="trip-people-count">👥 ${members.length} ${members.length === 1 ? 'person' : 'people'}</button>
    <button class="btn sm" data-peoplepanel="add" data-testid="trip-add-people">Add people</button>
  </div>

  ${app.tripPeoplePanel === 'list' ? `<div class="card" data-testid="trip-people-list">
    ${members.map((m) => `<div class="list-row">
      <div class="row"><span class="dot" style="background:${esc(m.color ?? '#ccc')}"></span><span style="font-size:13.5px">${esc(m.name)}</span></div>
      <button class="x" data-rmtripmember="${m.id}" data-testid="rm-trip-member-${m.id}">×</button></div>`).join('') || '<div class="empty">No one added yet.</div>'}
  </div>` : ''}

  ${app.tripPeoplePanel === 'add' ? `<div class="card">
    <label class="f"><span>Names (comma separated)</span><input id="tripMemberName" placeholder="e.g. Priya, Rahul" data-testid="trip-member-name"></label>
    <button class="btn sm" id="doAddTripMember" data-testid="add-trip-member">Add &amp; invite on WhatsApp</button>
  </div>` : ''}

  ${!app.editingTripExpenseId ? `<div class="card" id="tripExpenseForm">
    <h3>Add expense</h3>
    <div class="catgrid" data-testid="trip-category-grid">
      ${TRIP_CATEGORIES.map(([cat, icon, label]) => `<button class="${app.tripExpenseCategory === cat ? 'on' : ''}" data-tripcat="${cat}"><em>${icon}</em>${esc(label)}</button>`).join('')}
      <button class="${app.tripExpenseCategory === 'custom' ? 'on' : ''}" data-tripcat="custom" data-testid="trip-cat-custom"><em>＋</em>Custom</button>
    </div>
    ${customCatField(app)}
    <div class="amt-wrap" style="margin-top:10px"><span>₹</span><input id="tripAmount" inputmode="decimal" placeholder="0" value="${esc(app.tripDraft.amount)}" data-testid="trip-amount"></div>
    <label class="f"><span>Date</span><input id="tripExpDate" type="date" value="${esc(app.tripDraft.date)}" data-testid="trip-expense-date"></label>
    ${splitAndPaidBy(app, members)}
    <label class="f"><span>Note</span><input id="tripNote" placeholder="Optional" value="${esc(app.tripDraft.note)}" data-testid="trip-note"></label>
    <button class="btn wide" id="doAddTripExpense" style="margin-top:8px" data-testid="add-trip-expense">Add expense</button>
  </div>` : ''}

  ${catRows ? `<h2>By category</h2><div class="card">${catRows}</div>` : ''}
  ${balanceRows ? `<h2>Who owes what</h2><div class="card">${balanceRows}<div class="tiny" style="margin-top:8px">Assumes an equal split of the total across everyone added.</div></div>` : ''}

  <h2>Expenses</h2>
  <div class="card">${expenseRows || '<div class="empty">Nothing logged yet.</div>'}</div>

  <button class="btn wide ghost" id="doCloseTrip" style="margin:8px 0" data-testid="toggle-trip-status">${trip.status === 'closed' ? 'Reopen event' : 'Close event'}</button>
  <button class="btn wide ghost" data-goto="trips" style="margin-bottom:14px">Back to events</button>`;
}

export function vTripExpenseEditModal(app: AppState): string {
  if (!app.editingTripExpenseId || !app.tripId) return '';
  const { scope } = app;
  const members = scope.tripMembers(app.tripId);

  return `<dialog class="modal" id="tripExpenseEditModal">
    <div class="modal-body">
      <h2>Edit expense</h2>
      <label class="f"><span>Category</span><select id="tripCategorySelect" data-testid="edit-trip-category">
        ${TRIP_CATEGORIES.map(([cat, icon, label]) => `<option value="${cat}" ${app.tripExpenseCategory === cat ? 'selected' : ''}>${icon} ${esc(label)}</option>`).join('')}
        <option value="custom" ${app.tripExpenseCategory === 'custom' ? 'selected' : ''}>＋ Custom</option>
      </select></label>
      ${customCatField(app)}
      <div class="amt-wrap" style="margin-top:10px"><span>₹</span><input id="tripAmount" inputmode="decimal" value="${esc(app.tripDraft.amount)}" data-testid="edit-trip-amount"></div>
      <label class="f"><span>Date</span><input id="tripExpDate" type="date" value="${esc(app.tripDraft.date)}" data-testid="edit-trip-date"></label>
      ${splitAndPaidBy(app, members)}
      <label class="f"><span>Note</span><input id="tripNote" placeholder="Optional" value="${esc(app.tripDraft.note)}" data-testid="edit-trip-note"></label>
      <div class="row" style="margin-top:12px">
        <button class="btn grow" id="doAddTripExpense" data-testid="edit-trip-save">Save</button>
        <button class="btn ghost" id="cancelTripEdit" data-testid="edit-trip-cancel">Cancel</button>
      </div>
    </div>
  </dialog>`;
}
