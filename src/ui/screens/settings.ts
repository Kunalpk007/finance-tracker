import type { AppState } from '../state';
import { esc } from '../util';
import { formatMoney } from '../../domain/money';
import { can } from '../../domain/permissions';
import { inviteState } from '../../domain/auth';
import { pendingSubs } from '../../domain/transactions';
import type { AccountType } from '../../domain/types';

const ACCOUNT_TYPES: [AccountType, string][] = [
  ['cash', 'Cash'], ['bank', 'Bank'], ['upi', 'UPI'], ['credit_card', 'Credit card'],
  ['wallet', 'Wallet'], ['investment', 'Investment (stocks, FD, SIP…)'], ['custom', 'Other']
];

/** Suggested budget buckets beyond the fine-grained spend categories — the
 *  higher-level groupings people actually think in when setting a budget. */
const QUICK_CATS: [string, string, 'expense' | 'income'][] = [
  ['House Expenses', '🏠', 'expense'], ['EMIs & Loans', '💳', 'expense'], ['Health', '⚕', 'expense'],
  ['Lifestyle', '🎉', 'expense'], ['Self Expense', '🧍', 'expense'], ['Education', '📚', 'expense'],
  ['Savings & Investments', '📈', 'expense'], ['Subscriptions', '📅', 'expense']
];

function catChip(c: { id: string; icon: string; name: string }, isAdmin: boolean): string {
  return `<span class="chip">${esc(c.icon)} ${esc(c.name)}${isAdmin ? `<button data-rmcategory="${c.id}" data-testid="rm-category-${c.id}" style="border:none;background:transparent;margin:-2px -4px -2px 5px;padding:0 2px;cursor:pointer;font-weight:700;color:var(--ink3);font-size:13px">×</button>` : ''}</span>`;
}

export function vSettings(app: AppState): string {
  const { scope } = app;
  const w = scope.workspace!;
  const isAdmin = can(scope, 'manageSetup');
  const members = scope.memberships().filter((m) => m.status !== 'inactive');
  const me = scope.me();
  const expenseCats = scope.categories().filter((c) => !c.archived && c.kind === 'expense');
  const incomeCats = scope.categories().filter((c) => !c.archived && c.kind === 'income');
  const existingNames = new Set(scope.categories().map((c) => c.name.toLowerCase()));
  const quickPicks = QUICK_CATS.filter(([name]) => !existingNames.has(name.toLowerCase()));

  const overallBudget = scope.budgets().find((b) => b.categoryId === null);
  const catBudgets = scope.budgets().filter((b) => b.categoryId !== null);
  const budgetableCats = expenseCats.filter((c) => !catBudgets.some((b) => b.categoryId === c.id));

  const accounts = scope.accounts();
  const myGoals = scope.goals().filter((g) => g.membershipId === me?.id);

  return `<h1>Settings</h1>
  <p class="sub">${esc(w.name)} · ${w.type === 'business' ? 'Business' : 'Household'}</p>

  <div class="card">
    <h3>Appearance</h3>
    <div class="seg" data-testid="theme-toggle">
      ${(['light', 'system', 'dark'] as const).map((t) => `<button class="${app.theme === t ? 'on' : ''}" data-theme-choice="${t}" data-testid="theme-${t}">${t[0]!.toUpperCase() + t.slice(1)}</button>`).join('')}
    </div>
  </div>

  <div class="card">
    <h3>${w.type === 'business' ? 'Worker' : 'Member'}s</h3>
    ${members.map((m) => `<div class="list-row">
      <div class="row"><span class="dot" style="background:${esc(m.color ?? '#ccc')}"></span>
        <span style="font-size:13.5px">${esc(m.displayName)}</span></div>
      <div class="row">
        <span class="tiny">${esc(m.role)}${m.status === 'invited' ? ' · invited' : ''}</span>
        ${isAdmin && m.id !== me?.id ? `<button class="x" data-rmmember="${m.id}" data-testid="rm-member-${m.id}">×</button>` : ''}
      </div></div>`).join('')}
    ${isAdmin ? `<div class="row" style="margin-top:10px">
      <input id="memberName" placeholder="Name" data-testid="member-name">
      <select id="memberRole" data-testid="member-role">
        <option value="member">Member</option><option value="worker">Worker</option><option value="admin">Admin</option>
      </select>
    </div>
    <div class="row" style="margin-top:8px">
      ${app.remote ? '' : '<button class="btn sm" id="doAddMember" data-testid="add-member">Add (no login)</button>'}
      <button class="btn sm ghost" id="doInvite" data-testid="invite-create">Invite by code</button>
    </div>` : ''}
  </div>

  ${isAdmin ? `<div class="card">
    <h3>Pending invites</h3>
    ${scope.state.invites.filter((i) => i.workspaceId === scope.activeWorkspaceId).map((i) => {
      const st = inviteState(i);
      const who = scope.state.memberships.find((m) => m.id === i.membershipId);
      return `<div class="list-row" style="align-items:flex-start">
      <div>
        <div style="font-size:13.5px">${esc(who?.displayName ?? 'Invite')} <span class="tiny">· ${esc(i.role)} · ${esc(st)}</span></div>
        <div style="font-family:ui-monospace,monospace;font-size:17px;font-weight:600;letter-spacing:1px;margin-top:2px;user-select:all" data-testid="invite-code">${esc(i.code)}</div>
      </div>
      ${st === 'pending' ? `<div class="row">
        <button class="btn sm" data-sharewa="${i.id}" data-testid="invite-whatsapp">WhatsApp</button>
        <button class="btn sm ghost" data-copyinvite="${i.id}">Copy</button>
        <button class="x" data-revoke="${i.id}">×</button></div>` : ''}
    </div>`;
    }).join('') || '<div class="empty">No pending invites.</div>'}
  </div>` : ''}

  <div class="card">
    <button class="between" id="toggleAccounts" style="width:100%;background:none;border:none;padding:0;text-align:left" data-testid="toggle-accounts">
      <span style="font-size:15px;font-weight:650">Accounts <span class="tiny" style="font-weight:500">(${accounts.length})</span></span>
      <em style="font-style:normal;color:var(--ink3);display:inline-block;transform:rotate(${app.accountsExpanded ? '180' : '0'}deg);transition:transform .18s var(--ease)">⌄</em>
    </button>
    ${app.accountsExpanded ? `<div data-testid="accounts-list" style="margin-top:6px">
      ${accounts.map((a) => `<div class="list-row">
        <span style="font-size:13.5px">${esc(a.name)}${a.last4 ? ` ···${esc(a.last4)}` : ''}</span>
        <div class="row">
          <span class="tiny">${esc(ACCOUNT_TYPES.find((t) => t[0] === a.type)?.[1] ?? a.type)}</span>
          ${isAdmin ? `<button class="x" data-rmaccount="${a.id}" data-testid="rm-account-${a.id}">×</button>` : ''}
        </div></div>`).join('') || '<div class="empty">No accounts yet.</div>'}
      ${isAdmin ? `<div class="row" style="margin-top:10px">
        <select id="acctType" data-testid="account-type">
          ${ACCOUNT_TYPES.map(([v, label]) => `<option value="${v}">${esc(label)}</option>`).join('')}
        </select>
        <input id="acctName" placeholder="Name (e.g. HDFC Savings, Zerodha)" data-testid="account-name">
      </div>
      <div class="row" style="margin-top:8px">
        <input id="acctLast4" placeholder="Last 4 digits (optional)" maxlength="4" style="max-width:160px">
        <button class="btn sm" id="doAddAccount" data-testid="add-account">Add account</button>
      </div>` : ''}
    </div>` : ''}
  </div>

  <div class="card">
    <h3>Categories</h3>
    <div class="tiny" style="margin-bottom:4px;font-weight:600">Expense</div>
    <div class="chips" style="margin-bottom:10px">${expenseCats.map((c) => catChip(c, isAdmin)).join('') || '<span class="tiny">None yet</span>'}</div>
    <div class="tiny" style="margin-bottom:4px;font-weight:600">Income</div>
    <div class="chips">${incomeCats.map((c) => catChip(c, isAdmin)).join('') || '<span class="tiny">None yet</span>'}</div>
    ${isAdmin ? `${quickPicks.length ? `<div class="tiny" style="margin:12px 0 4px;font-weight:600">Quick add</div>
    <div class="chips">${quickPicks.map(([name, icon, kind]) => `<button class="chip" data-quickcat="${esc(name)}|${esc(icon)}|${kind}">${esc(icon)} ${esc(name)}</button>`).join('')}</div>` : ''}
    <div class="row" style="margin-top:12px">
      <input id="catIcon" placeholder="🏷" maxlength="2" style="max-width:56px;text-align:center">
      <input id="catName" placeholder="Category name" data-testid="cat-name">
      <select id="catKind" data-testid="cat-kind"><option value="expense">Expense</option><option value="income">Income</option></select>
    </div>
    <button class="btn sm" id="doAddCategory" style="margin-top:8px" data-testid="add-category">Add category</button>` : ''}
  </div>

  ${isAdmin ? `<div class="card">
    <h3>Budgets</h3>
    <div class="between" style="padding:6px 0">
      <span style="font-size:13.5px">Overall monthly budget</span>
      <div class="row" style="max-width:180px">
        <input id="overallBudgetAmt" type="number" placeholder="Amount ₹" value="${overallBudget ? Math.round(overallBudget.limitPaise / 100) : ''}" data-testid="overall-budget-input">
      </div>
    </div>
    <div class="row">
      <button class="btn sm ghost" id="doSetOverallBudget" data-testid="set-overall-budget">${overallBudget ? 'Update' : 'Set'} overall budget</button>
      ${overallBudget ? `<button class="x" data-rmbudget="${overallBudget.id}" data-testid="rm-budget-overall">×</button>` : ''}
    </div>
    ${catBudgets.length ? `<div style="margin-top:12px">${catBudgets.map((b) => {
      const c = scope.categories().find((x) => x.id === b.categoryId);
      return `<div class="list-row">
        <span style="font-size:13.5px">${esc(c?.icon ?? '•')} ${esc(c?.name ?? '—')}</span>
        <div class="row"><span class="num">${formatMoney(b.limitPaise)}</span>
          <button class="x" data-rmbudget="${b.id}" data-testid="rm-budget-${b.id}">×</button></div></div>`;
    }).join('')}</div>` : ''}
    ${budgetableCats.length ? `<div class="row" style="margin-top:12px">
      <select id="budgetCat" data-testid="budget-category">${budgetableCats.map((c) => `<option value="${c.id}">${esc(c.icon)} ${esc(c.name)}</option>`).join('')}</select>
      <input id="budgetAmt" type="number" placeholder="Amount ₹" style="max-width:120px" data-testid="budget-amount">
    </div>
    <button class="btn sm" id="doAddCatBudget" style="margin-top:8px" data-testid="add-category-budget">Add category budget</button>` : ''}
  </div>` : ''}

  <div class="card">
    <h3>Your goals <span class="tiny">· private to you</span></h3>
    ${myGoals.map((g) => `<div class="list-row">
      <span style="font-size:13.5px">${esc(g.name)}</span>
      <div class="row"><span class="tiny">${formatMoney(g.savedPaise)} / ${formatMoney(g.targetPaise)}</span>
        <button class="x" data-rmgoal="${g.id}" data-testid="rm-goal-${g.id}">×</button></div></div>`).join('') || '<div class="empty">No goals yet.</div>'}
    <div class="row" style="margin-top:10px">
      <input id="goalName" placeholder="e.g. New laptop" data-testid="goal-name">
      <input id="goalTarget" type="number" placeholder="Target ₹" style="max-width:120px" data-testid="goal-target">
    </div>
    <button class="btn sm" id="doCreateGoal" style="margin-top:8px" data-testid="add-goal">Add goal</button>
  </div>

  ${isAdmin ? `<div class="card">
    <h3>Approvals</h3>
    <div class="tiny">${pendingSubs(scope).length} waiting</div>
    <button class="btn sm ghost" data-goto="approvals" style="margin-top:8px" data-testid="goto-approvals">Open</button>
  </div>` : ''}

  ${w.type === 'business' ? `<div class="card">
    <h3>Restaurant</h3>
    <button class="btn sm ghost" data-goto="menu" style="margin-right:6px">Menu &amp; recipes</button>
    <button class="btn sm ghost" data-goto="orders">Log a sale</button>
  </div>` : ''}

  <div class="card">
    <h3>Backup</h3>
    <button class="btn sm ghost" id="doExport" data-testid="export-backup" style="margin-right:6px">Download backup</button>
    <button class="btn sm ghost" id="doImport" data-testid="import-backup">Restore backup</button>
    <input type="file" id="importFile" accept="application/json" style="display:none">
  </div>

  <button class="btn wide ghost" id="switchWorkspace" style="margin-bottom:8px" data-testid="switch-workspace">Switch account</button>
  <button class="btn wide ghost" id="doSignOut" style="margin-bottom:14px" data-testid="settings-signout">Sign out</button>`;
}
