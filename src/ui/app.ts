import { AppState, emptyTripDraft } from './state';
import type { StoreAdapter } from '../store/adapter';
import { toast, applyTheme } from './util';
import { signIn, signUp, signOut, redeemInvite, createWorkspace, createInvite, revokeInvite, addMember, inviteShareText } from '../domain/auth';
import { saveTransaction, approveTx, rejectTx, deleteTransaction, needsApproval } from '../domain/transactions';
import { canDelete, can } from '../domain/permissions';
import { voidTx } from '../domain/permissions';
import { byId } from '../domain/scope';
import { reconcileItem, findPantryItemByName, guessItem } from '../domain/pantry';
import { createMenuItem, setRecipe, logOrder } from '../domain/recipes';
import { rupeesToPaise, formatMoney } from '../domain/money';
import { today, dateAddDays } from '../domain/dates';
import { createTrip, closeTrip, removeTripMember, addTripExpense, removeTripExpense, addTripPeople, parseNames, tripInviteText, ensureTripSelf, expensePayments } from '../domain/trips';
import { createGoal, addSaved, removeGoal } from '../domain/goals';

import { vLogin, vSignup, vRedeem, vPickWorkspace } from './screens/auth';
import type { Chart } from 'chart.js';
import { vHome, mountHomeChart } from './screens/home';
import { vAdd, ensureDraft } from './screens/add';
import { vTx, vDetail } from './screens/transactions';
import { vPantry, vPantryItem, vReconcile } from './screens/pantry';
import { vBuyNext } from './screens/buynext';
import { vMenu, vOrders, vDayClose } from './screens/restaurant';
import { vApprovals, vActivity } from './screens/approvals';
import { vReports } from './screens/reports';
import { vSettings } from './screens/settings';
import { vTripList, vTripDetail, vTripExpenseEditModal } from './screens/trips';
import { vGoals } from './screens/goals';
import { vTxEditModal } from './screens/txEditModal';
import { vConfirmModal } from './screens/confirmModal';
import type { AuthResult } from '../store/remote-adapter';

export class App {
  state: AppState;
  buyNextQuery = '';
  private lastView: string | null = null;
  private homeChart: Chart | null = null;

  constructor(adapter: StoreAdapter) {
    this.state = new AppState(adapter);
  }

  async boot(): Promise<void> {
    await this.state.boot();
    applyTheme(this.state.theme);
    this.render();
    this.wireGlobalEvents();
  }

  private root(): HTMLElement {
    return document.getElementById('app')!;
  }

  /** Screen-to-screen navigation gets a native crossfade via the View
   *  Transitions API (Chrome/Edge/Safari 18+; unsupported browsers just skip
   *  straight to applyRender with no error). Same-view re-renders — typing
   *  in a field, toggling a checkbox — skip it, or every keystroke would
   *  visibly flicker. */
  render(): void {
    const s = this.state;
    const viewChanged = s.view !== this.lastView;
    this.lastView = s.view;
    const vt = (document as any).startViewTransition;
    if (viewChanged && typeof vt === 'function') vt.call(document, () => this.applyRender());
    else this.applyRender();
  }

  private applyRender(): void {
    this.state.refreshScope();
    const s = this.state;
    let html = '';
    switch (s.view) {
      case 'login': html = vLogin(s); break;
      case 'signup': html = vSignup(s); break;
      case 'redeem': html = vRedeem(s); break;
      case 'pickWorkspace': html = vPickWorkspace(s); break;
      case 'home': html = vHome(s); break;
      case 'tx': html = vTx(s); break;
      case 'detail': html = vDetail(s); break;
      case 'add': html = vAdd(s); break;
      case 'pantry': html = vPantry(s); break;
      case 'pantryItem': html = vPantryItem(s); break;
      case 'reconcile': html = vReconcile(s); break;
      case 'shopping': html = vBuyNext(s, this.buyNextQuery); break;
      case 'approvals': html = vApprovals(s); break;
      case 'activity': html = vActivity(s); break;
      case 'reports': html = vReports(s); break;
      case 'settings': html = vSettings(s); break;
      case 'menu': html = vMenu(s); break;
      case 'orders': html = vOrders(s); break;
      case 'dayclose': html = vDayClose(s); break;
      case 'trips': html = vTripList(s); break;
      case 'tripDetail': html = vTripDetail(s); break;
      case 'goals': html = vGoals(s); break;
      default: html = '<div class="empty">Not found</div>';
    }
    html += vTxEditModal(s);
    html += vTripExpenseEditModal(s);
    html += vConfirmModal(s);
    const authed = s.S.session.authed;
    this.root().innerHTML = html;
    const nav = document.querySelector('nav') as HTMLElement | null;
    const inWorkspace = authed && !!s.S.session.workspaceId;
    if (nav) nav.style.display = inWorkspace ? '' : 'none';
    if (nav) {
      nav.querySelectorAll('button[data-nav]').forEach((b) => {
        const name = b.getAttribute('data-nav');
        b.classList.toggle('on', name === s.view || (name === 'home' && s.view === 'detail'));
      });
    }
    const fab = document.getElementById('fab');
    if (fab) fab.style.display = inWorkspace && s.view !== 'add' ? '' : 'none';
    this.syncModals();
    if (this.homeChart) { this.homeChart.destroy(); this.homeChart = null; }
    if (s.view === 'home') this.homeChart = mountHomeChart(s);
  }

  /** Native <dialog> needs .showModal() called in JS to get backdrop/focus-trap
   *  behavior — setting the `open` attribute in markup alone doesn't. Every
   *  render() rebuilds the DOM from scratch, so each dialog here is always a
   *  fresh, closed element; only Esc needs a listener since our own
   *  Cancel/Save buttons already close it by re-rendering without it. */
  private syncModals(): void {
    const tx = document.getElementById('txEditModal') as HTMLDialogElement | null;
    if (tx) {
      tx.showModal();
      tx.addEventListener('close', () => { this.state.draft = null; this.render(); }, { once: true });
      tx.addEventListener('click', (e) => { if (e.target === tx) tx.close(); }); // click on the backdrop
    }
    const trip = document.getElementById('tripExpenseEditModal') as HTMLDialogElement | null;
    if (trip) {
      trip.showModal();
      trip.addEventListener('close', () => { this.resetTripDraft(); this.render(); }, { once: true });
      trip.addEventListener('click', (e) => { if (e.target === trip) trip.close(); });
    }
    const confirmEl = document.getElementById('confirmModal') as HTMLDialogElement | null;
    if (confirmEl) {
      confirmEl.showModal();
      // Esc/backdrop close WITHOUT running the action — same as Cancel.
      confirmEl.addEventListener('close', () => { this.state.confirmModal = null; this.render(); }, { once: true });
      confirmEl.addEventListener('click', (e) => { if (e.target === confirmEl) confirmEl.close(); });
    }
  }

  /** Opens the shared confirm modal; onConfirm runs only if the user hits OK.
   *  Replaces the browser's native confirm() everywhere in the app. */
  private confirmAction(message: string, onConfirm: () => void | Promise<void>, opts?: { title?: string; okLabel?: string; danger?: boolean }): void {
    this.state.confirmModal = { message, onConfirm, ...opts };
    this.render();
  }

  private async withSave(fn: () => void | Promise<void>): Promise<void> {
    await fn();
    await this.state.save();
    this.render();
  }

  wireGlobalEvents(): void {
    document.body.addEventListener('click', (e) => this.onClick(e));
    document.body.addEventListener('input', (e) => this.onInput(e));
    document.body.addEventListener('change', (e) => this.onChange(e));
    document.querySelectorAll('nav button[data-nav]').forEach((b) => {
      b.addEventListener('click', () => {
        this.state.goto(b.getAttribute('data-nav') as any);
        this.render();
      });
    });
    document.getElementById('fab')?.addEventListener('click', () => {
      // Inside an event, + means "add to this event" — never the household form.
      if (this.state.view === 'tripDetail') {
        const form = document.getElementById('tripExpenseForm');
        form?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        (document.getElementById('tripAmount') as HTMLInputElement | null)?.focus({ preventScroll: true });
        return;
      }
      this.state.draft = null;
      this.state.goto('add');
      this.render();
    });
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLElement;
    const id = (el as HTMLInputElement).id;
    if (!id) return;
    let val = (el as HTMLInputElement).value;
    // Amount fields: digits and at most one decimal point only, no letters/symbols.
    if (id === 'txAmount' || id === 'tripAmount' || id.startsWith('tripPay-')) {
      const cleaned = val.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
      if (cleaned !== val) { (el as HTMLInputElement).value = cleaned; val = cleaned; }
    }
    // Note fields: plain text only, capped at 50 chars.
    if (id === 'txNote' || id === 'tripNote') {
      val = val.replace(/[^a-zA-Z0-9 .,'-]/g, '').slice(0, 50);
    }
    const d = this.state.draft;
    if (d) {
      if (id === 'txAmount') d.amount = val;
      else if (id === 'txDate') d.date = val;
      else if (id === 'txNote') { d.note = val; this.render(); this.focusEnd('txNote'); return; }
      else if (id === 'txVendor') d.vendor = val;
      else if (id === 'txAccount') {
        d.accountId = val;
        if (d.toAccountId === val) d.toAccountId = null; // stale "to" pointing at the new "from" — force a re-pick
        this.render();
        return;
      }
      else if (id === 'toAccount') d.toAccountId = val;
      else if (id === 'txPaidBy') d.paidByMembershipId = val;
      else if (id === 'txCategorySelect') d.categoryId = val || null;
      else if (id === 'txPersonal') d.isPersonal = (el as HTMLInputElement).checked;
    }
    const td = this.state.tripDraft;
    if (id === 'tripAmount') { td.amount = val; if (td.multiPay) { this.render(); this.focusEnd(id); return; } }
    else if (id === 'tripExpDate') td.date = val;
    else if (id === 'tripPaidBy') td.paidBy = val;
    else if (id === 'tripCategorySelect') { this.state.tripExpenseCategory = (val || null) as any; this.render(); return; }
    else if (id === 'tripCustomCat') { td.customCat = val.replace(/[^a-zA-Z0-9 &'-]/g, '').slice(0, 20); (el as HTMLInputElement).value = td.customCat; }
    else if (id.startsWith('tripPay-')) { td.payAmounts[id.slice(8)] = val; this.render(); this.focusEnd(id); return; }
    else if (id === 'tripNote') { td.note = val; this.render(); this.focusEnd('tripNote'); return; }
    if (id === 'buyNextQuery') { this.buyNextQuery = val; this.render(); this.focusEnd('buyNextQuery'); }
    if (id === 'txSearch') { this.state.txSearch = val; this.render(); this.focusEnd('txSearch'); }
    if (id === 'repFilterPerson') { this.state.reportFilters.personId = val; this.render(); }
    if (id === 'repFilterAccount') { this.state.reportFilters.accountId = val; this.render(); }
    if (id === 'repFilterCategory') { this.state.reportFilters.categoryId = val; this.render(); }
  }

  private onChange(e: Event): void {
    const el = e.target as HTMLInputElement;
    if (el.id === 'importFile') this.handleImport(el);
  }

  /** Restores a previously exported backup JSON. The local adapter already
   *  persists to IndexedDB on every save, so this is a convenience for moving
   *  data to a new browser/device — not the primary safety net against data loss. */
  private handleImport(el: HTMLInputElement): void {
    const file = el.files?.[0];
    el.value = '';
    if (!file) return;
    if (this.state.remote) { toast('Restoring a backup is only available in offline mode'); return; }
    this.confirmAction('This replaces all current data with the backup file. Continue?', async () => {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || !Array.isArray(data.workspaces)) throw new Error('not a backup file');
        this.state.S = data;
        this.state.refreshScope();
        await this.state.save();
        this.state.goto(this.state.S.session.authed ? 'home' : 'login');
        this.render();
        toast('Backup restored');
      } catch {
        toast('That file is not a valid backup');
      }
    }, { okLabel: 'Restore', danger: true });
  }

  private focusEnd(id: string): void {
    const el = document.getElementById(id) as HTMLInputElement | null;
    if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
  }

  private async onClick(e: Event): Promise<void> {
    const target = e.target as HTMLElement;
    const el = target.closest('[data-goto],[data-nav],button,a,[data-detail],[data-pantryitem],[data-pickws],[data-trip],[data-edittripexpense]') as HTMLElement | null;
    if (!el) return;

    const goto = el.getAttribute('data-goto');
    if (goto) { e.preventDefault(); this.state.goto(goto as any); if (goto === 'add') this.state.draft = null; this.render(); return; }

    const detail = el.getAttribute('data-detail');
    if (detail) { this.state.detailId = detail; this.state.goto('detail'); this.render(); return; }

    const pantryitem = el.getAttribute('data-pantryitem');
    if (pantryitem) { this.state.pantryItemId = pantryitem; this.state.goto('pantryItem'); this.render(); return; }

    const trip = el.getAttribute('data-trip');
    if (trip) { this.state.tripId = trip; this.state.tripPeoplePanel = null; this.resetTripDraft(); this.state.goto('tripDetail'); await this.withSave(() => ensureTripSelf(this.state.scope, trip)); return; }
    const split = el.getAttribute('data-tripsplit');
    if (split) { this.toggleTripSplit(split); return; }
    if (el.hasAttribute('data-tripmulti')) { this.state.tripDraft.multiPay = !this.state.tripDraft.multiPay; this.render(); return; }
    const peoplePanel = el.getAttribute('data-peoplepanel');
    if (peoplePanel) { const p = peoplePanel as 'list' | 'add'; this.state.tripPeoplePanel = this.state.tripPeoplePanel === p ? null : p; this.render(); return; }

    const edittripexpense = el.getAttribute('data-edittripexpense');
    if (edittripexpense) {
      const exp = byId(this.state.scope.state.tripExpenses, edittripexpense);
      if (!exp) return;
      this.state.editingTripExpenseId = exp.id;
      this.state.tripExpenseCategory = exp.category;
      const pays = expensePayments(exp);
      this.state.tripDraft = {
        ...emptyTripDraft(), amount: String(exp.amountPaise / 100), date: exp.date, note: exp.note, paidBy: exp.paidByTripMemberId,
        customCat: exp.categoryLabel ?? '', splitAmong: exp.splitAmong ?? null, multiPay: pays.length > 1,
        payAmounts: Object.fromEntries(pays.map((p) => [p.memberId, String(p.amountPaise / 100)]))
      };
      this.render();
      return;
    }
    if (el.id === 'cancelTripEdit') { this.resetTripDraft(); this.render(); return; }

    if (el.id === 'confirmCancel') { this.state.confirmModal = null; this.render(); return; }
    if (el.id === 'confirmOk') {
      const action = this.state.confirmModal?.onConfirm;
      this.state.confirmModal = null;
      if (action) await action();
      this.render();
      return;
    }

    if (el.id === 'doLogin') return this.handleLogin();
    if (el.id === 'doSignup') return this.handleSignup();
    if (el.id === 'doRedeem') return this.handleRedeem();
    if (el.id === 'doCreateWs') return this.handleCreateWorkspace();
    if (el.id === 'doSignOut' || el.id === 'switchWorkspace') return this.handleSignOut(el.id === 'switchWorkspace');

    const wstype = el.getAttribute('data-wstype');
    if (wstype) {
      document.querySelectorAll('[data-wstype]').forEach((b) => b.classList.remove('on'));
      el.classList.add('on');
      (el.closest('#wsType') as any)._selected = wstype;
      return;
    }
    const pickws = el.getAttribute('data-pickws');
    if (pickws) { this.state.S.session.workspaceId = pickws; this.state.goto('home'); await this.state.save(); this.render(); return; }

    const txtype = el.getAttribute('data-txtype');
    if (txtype) { ensureDraft(this.state); this.state.draft!.type = txtype as any; this.state.draft!.categoryId = null; this.render(); return; }
    const evkind = el.getAttribute('data-evkind');
    if (evkind) { this.state.tripKind = evkind as any; this.render(); return; }
    const cat = el.getAttribute('data-cat');
    if (cat) {
      const d = this.state.draft!;
      d.categoryId = cat;
      // New entries in a category you've used before default to the account/payer
      // from last time — most entries repeat the same category, so this saves a tap.
      const last = !d.id ? this.state.scope.meta().lastByCategory?.[cat] : undefined;
      if (last) { d.accountId = last.accountId; d.paidByMembershipId = last.paidByMembershipId; }
      this.render();
      return;
    }
    const tripcat = el.getAttribute('data-tripcat');
    if (tripcat) { this.state.tripExpenseCategory = tripcat as any; this.render(); return; }
    if (el.getAttribute('data-ackdupe')) { this.state.draft!._dupeAck = true; this.render(); return; }
    if (el.id === 'saveTx') return this.handleSaveTx();
    if (el.id === 'cancelTxEdit') { this.state.draft = null; this.render(); return; }

    const dapprove = el.getAttribute('data-dapprove') || el.getAttribute('data-approve');
    if (dapprove) return this.withSave(() => approveTx(this.state.scope, dapprove));
    const dreject = el.getAttribute('data-dreject') || el.getAttribute('data-reject');
    if (dreject) {
      const box = document.getElementById(`rej-${dreject}`) || document.getElementById('drej');
      if (box) { box.style.display = 'block'; return; }
    }
    const doreject = el.getAttribute('data-doreject') || el.getAttribute('data-dorej');
    if (doreject) {
      const input = (document.getElementById(`rr-${doreject}`) || document.getElementById('drr')) as HTMLInputElement | null;
      return this.withSave(() => rejectTx(this.state.scope, doreject, input?.value || ''));
    }
    const dedit = el.getAttribute('data-dedit');
    if (dedit) return this.handleEdit(dedit);
    const drepeat = el.getAttribute('data-repeat');
    if (drepeat) {
      this.confirmAction('Repeat this entry as a new one dated today?', () => this.handleRepeat(drepeat), { okLabel: 'Repeat' });
      return;
    }
    const ddelete = el.getAttribute('data-ddelete');
    if (ddelete) {
      const t = byId(this.state.scope.state.transactions, ddelete);
      if (!t || !canDelete(this.state.scope, t)) return;
      this.confirmAction('Delete this entry? This cannot be undone.', async () => {
        await this.withSave(() => { deleteTransaction(this.state.scope, ddelete); });
        this.state.goto('tx');
        this.render();
      }, { okLabel: 'Delete', danger: true });
      return;
    }
    const dvoid = el.getAttribute('data-dvoid');
    if (dvoid) {
      const reasonEl = document.getElementById('voidReason') as HTMLInputElement | null;
      const t = byId(this.state.scope.state.transactions, dvoid);
      if (t) {
        const res = voidTx(this.state.scope, t, reasonEl?.value || '');
        if (!res.ok) { toast(res.msg); return; }
        return this.withSave(() => {});
      }
    }

    if (el.getAttribute('data-shopdone')) {
      const id = el.getAttribute('data-shopdone')!;
      return this.withSave(() => { const it = this.state.S.shoppingList.find((x) => x.id === id); if (it) it.done = true; });
    }
    if (el.getAttribute('data-shopdel')) {
      const id = el.getAttribute('data-shopdel')!;
      return this.withSave(() => { this.state.S.shoppingList = this.state.S.shoppingList.filter((x) => x.id !== id); });
    }
    if (el.id === 'clearShop') return this.withSave(() => { this.state.S.shoppingList = this.state.S.shoppingList.filter((x) => !x.done); });
    if (el.id === 'addToShop') return this.handleAddToShop();

    if (el.getAttribute('data-reconcile')) {
      const itemId = el.getAttribute('data-reconcile')!;
      const level = el.getAttribute('data-level') as any;
      return this.withSave(() => { reconcileItem(this.state.scope, itemId, level); toast('Updated'); });
    }

    if (el.getAttribute('data-revoke')) {
      const id = el.getAttribute('data-revoke')!;
      return this.withSave(() => revokeInvite(this.state.scope, id));
    }
    const shareWa = el.getAttribute('data-sharewa');
    if (shareWa) return this.shareInvite(shareWa, 'whatsapp');
    const copyInv = el.getAttribute('data-copyinvite');
    if (copyInv) return this.shareInvite(copyInv, 'copy');
    if (el.id === 'doInvite') return this.handleInvite();
    if (el.id === 'doAddMember') return this.handleAddMember();
    if (el.id === 'doAddAccount') return this.handleAddAccount();
    if (el.id === 'toggleAccounts') { this.state.accountsExpanded = !this.state.accountsExpanded; this.render(); return; }
    const theme = el.getAttribute('data-theme-choice');
    if (theme) { this.state.setTheme(theme as any); applyTheme(this.state.theme); this.render(); return; }
    if (el.id === 'doAddCategory') return this.handleAddCategory();
    const quickcat = el.getAttribute('data-quickcat');
    if (quickcat) {
      const [name, icon, kind] = quickcat.split('|');
      return this.withSave(() => {
        this.state.scope.addRow('categories', { id: cryptoId(), name, icon, kind, archived: false });
      });
    }
    if (el.id === 'doSetOverallBudget') return this.handleSetBudget(null);
    if (el.id === 'doAddCatBudget') {
      const catEl = document.getElementById('budgetCat') as HTMLSelectElement | null;
      if (catEl?.value) return this.handleSetBudget(catEl.value);
      return;
    }

    const rmaccount = el.getAttribute('data-rmaccount');
    if (rmaccount) return this.handleRemoveAccount(rmaccount);
    const rmcategory = el.getAttribute('data-rmcategory');
    if (rmcategory) return this.handleRemoveCategory(rmcategory);
    const rmmember = el.getAttribute('data-rmmember');
    if (rmmember) return this.handleRemoveMember(rmmember);
    const rmbudget = el.getAttribute('data-rmbudget');
    if (rmbudget) return this.handleRemoveBudget(rmbudget);

    if (el.getAttribute('data-repmonth')) { this.state.reportMonth = el.getAttribute('data-repmonth')!; this.render(); return; }
    const repperiod = el.getAttribute('data-repperiod');
    if (repperiod) { this.state.reportPeriod = repperiod as any; this.render(); return; }
    const repweek = el.getAttribute('data-repweek');
    if (repweek) { this.state.reportWeekStart = dateAddDays(this.state.reportWeekStart, Number(repweek) * 7); this.render(); return; }
    const repyear = el.getAttribute('data-repyear');
    if (repyear) { this.state.reportYear = String(Number(this.state.reportYear) + Number(repyear)); this.render(); return; }

    if (el.id === 'addMenuItem') return this.handleAddMenuItem();
    const logorder = el.getAttribute('data-logorder');
    if (logorder) {
      const qtyEl = document.getElementById(`qty-${logorder}`) as HTMLInputElement | null;
      const qty = Math.max(1, parseInt(qtyEl?.value || '1', 10));
      return this.withSave(() => { logOrder(this.state.scope, logorder, qty); toast('Logged'); });
    }

    if (el.id === 'doExport') return this.handleExport();
    if (el.id === 'doImport') { document.getElementById('importFile')?.click(); return; }

    if (el.id === 'doCreateTrip') return this.handleCreateTrip();
    if (el.id === 'doAddTripMember') return this.handleAddTripMember();
    if (el.id === 'doAddTripExpense') return this.handleAddTripExpense();
    if (el.id === 'doCloseTrip') return this.withSave(() => closeTrip(this.state.scope, this.state.tripId!));
    const rmtripmember = el.getAttribute('data-rmtripmember');
    if (rmtripmember) {
      this.confirmAction('Remove this person from the event?', async () => {
        const res = removeTripMember(this.state.scope, rmtripmember);
        if (!res.ok) { toast(res.msg); return; }
        await this.withSave(() => {});
      }, { okLabel: 'Remove', danger: true });
      return;
    }
    const rmtripexpense = el.getAttribute('data-rmtripexpense');
    if (rmtripexpense) {
      this.confirmAction('Remove this expense?', () => this.withSave(() => removeTripExpense(this.state.scope, rmtripexpense)), { okLabel: 'Remove', danger: true });
      return;
    }

    if (el.id === 'doCreateGoal') return this.handleCreateGoal();
    const addsaved = el.getAttribute('data-addsaved');
    if (addsaved) return this.handleAddSaved(addsaved);
    const rmgoal = el.getAttribute('data-rmgoal');
    if (rmgoal) {
      this.confirmAction('Remove this goal?', () => this.withSave(() => removeGoal(this.state.scope, rmgoal)), { okLabel: 'Remove', danger: true });
      return;
    }
  }

  /** Shared tail of every Supabase auth step: show the error, or adopt the
   *  freshly loaded state and land on home (workspace known) or the picker. */
  private finishAuth(res: AuthResult): void {
    if (!res.ok) {
      if (res.info) this.state.goto('login'); // goto clears the message, so set it after
      this.state.authMsg = res.msg;
      this.state.authInfo = !!res.info;
      this.render();
      return;
    }
    this.state.adopt(res.S);
    this.state.goto(res.S.session.workspaceId ? 'home' : 'pickWorkspace');
    this.render();
  }

  private async handleLogin(): Promise<void> {
    const email = (document.getElementById('liEmail') as HTMLInputElement)?.value ?? '';
    const pass = (document.getElementById('liPass') as HTMLInputElement)?.value ?? '';
    const remote = this.state.remote;
    if (remote) return this.finishAuth(await remote.signIn(email, pass));
    const res = signIn(this.state.S, email, pass);
    if (!res.ok) { this.state.authMsg = res.msg; this.render(); return; }
    this.state.goto(res.workspaces.length === 1 ? 'home' : 'pickWorkspace');
    await this.state.save();
    this.render();
  }

  private async handleSignup(): Promise<void> {
    const name = (document.getElementById('suName') as HTMLInputElement)?.value ?? '';
    const email = (document.getElementById('suEmail') as HTMLInputElement)?.value ?? '';
    const pass = (document.getElementById('suPass') as HTMLInputElement)?.value ?? '';
    const remote = this.state.remote;
    if (remote) return this.finishAuth(await remote.signUp(name, email, pass));
    const res = signUp(this.state.S, name, email, pass);
    if (!res.ok) { this.state.authMsg = res.msg; this.render(); return; }
    this.state.goto('pickWorkspace');
    await this.state.save();
    this.render();
  }

  private async handleRedeem(): Promise<void> {
    const code = (document.getElementById('rdCode') as HTMLInputElement)?.value ?? '';
    const remote = this.state.remote;
    if (remote) {
      // An invite is bound to a login: the code only works for a signed-in user.
      if (!this.state.S.session.authed) { this.state.authMsg = 'Sign in or create an account first, then enter your code.'; this.render(); return; }
      return this.finishAuth(await remote.redeemInvite(code));
    }
    const res = redeemInvite(this.state.S, code);
    if (!res.ok) { this.state.authMsg = res.msg; this.render(); return; }
    this.state.goto('home');
    await this.state.save();
    this.render();
  }

  private async handleCreateWorkspace(): Promise<void> {
    const name = (document.getElementById('wsName') as HTMLInputElement)?.value ?? '';
    const typeBox = document.getElementById('wsType') as any;
    const type = typeBox?._selected || 'household';
    const remote = this.state.remote;
    if (remote) return this.finishAuth(await remote.createWorkspace(name, type));
    const res = createWorkspace(this.state.S, name, type);
    if (!res.ok) { this.state.authMsg = res.msg; this.render(); return; }
    this.state.goto('home');
    await this.state.save();
    this.render();
  }

  private async handleSignOut(switchOnly: boolean): Promise<void> {
    const remote = this.state.remote;
    if (!switchOnly && remote) {
      await this.state.save(); // flush pending edits while the session is still valid
      this.state.adopt(await remote.signOut());
      this.state.goto('login');
      this.render();
      return;
    }
    if (switchOnly) {
      this.state.S.session.workspaceId = null;
      this.state.goto('pickWorkspace');
    } else {
      signOut(this.state.S);
      this.state.goto('login');
    }
    await this.state.save();
    this.render();
  }

  private async handleSaveTx(): Promise<void> {
    const d = this.state.draft!;
    const amount = rupeesToPaise(parseFloat(d.amount || '0'));
    if (!amount || amount <= 0) { toast('Enter an amount'); return; }
    if (d.type !== 'transfer' && !d.categoryId) { toast('Pick a category'); return; }
    if (d.type === 'transfer' && !d.toAccountId) { toast('Pick a destination account'); return; }
    if (d.type === 'transfer' && d.toAccountId === d.accountId) { toast('From and to account must be different'); return; }
    await this.withSave(() => {
      saveTransaction(this.state.scope, {
        id: d.id, type: d.type, amountPaise: amount, date: d.date, categoryId: d.categoryId,
        accountId: d.accountId, toAccountId: d.toAccountId, paidByMembershipId: d.paidByMembershipId,
        isPersonal: d.isPersonal, note: d.note, vendor: d.vendor, photoPath: d.photoPath
      });
      // If the note looks like a pantry item and this was a grocery-style expense,
      // no automatic linking is done here — itemising stays a deliberate, optional
      // action (D16/D63), available from the pantry/buy-next screens.
      toast(needsApproval(this.state.scope) ? 'Submitted for approval' : 'Saved');
    });
    const wasEdit = !!d.id;
    this.state.draft = null;
    if (!wasEdit) this.state.goto('tx'); // new entries (from the fab) land on the list; edits just close their modal
    this.render();
  }

  /** Opens the edit modal on top of whatever screen we're on (detail/list) —
   *  no navigation, unlike the full-screen form new entries use. */
  private handleEdit(id: string): void {
    const t = byId(this.state.scope.state.transactions, id);
    if (!t) return;
    this.state.draft = {
      id: t.id, type: t.type, amount: String(t.amountPaise / 100), date: t.date, categoryId: t.categoryId,
      accountId: t.accountId, toAccountId: t.toAccountId, paidByMembershipId: t.paidByMembershipId,
      isPersonal: t.isPersonal, note: t.note, vendor: t.vendor, photoPath: t.photoPath, _dupeAck: true
    };
    this.render();
  }

  /** One-tap re-log of a past entry — same category/account/vendor/paid-by,
   *  dated today. Goes through saveTransaction/needsApproval exactly like a
   *  fresh entry (a worker's repeat still needs approval), so it's a real
   *  new row, not a copy that bypasses the rules. */
  private async handleRepeat(id: string): Promise<void> {
    const t = byId(this.state.scope.state.transactions, id);
    if (!t) return;
    await this.withSave(() => {
      saveTransaction(this.state.scope, {
        id: null, type: t.type, amountPaise: t.amountPaise, date: today(), categoryId: t.categoryId,
        accountId: t.accountId, toAccountId: t.toAccountId, paidByMembershipId: t.paidByMembershipId,
        isPersonal: t.isPersonal, note: t.note, vendor: t.vendor, photoPath: null
      });
      toast(needsApproval(this.state.scope) ? 'Repeated — submitted for approval' : 'Repeated');
    });
  }

  private async handleAddToShop(): Promise<void> {
    const q = this.buyNextQuery.trim();
    if (!q) return;
    const qtyEl = document.getElementById('buyNextQty') as HTMLInputElement | null;
    const existing = findPantryItemByName(this.state.scope, q);
    await this.withSave(() => {
      this.state.scope.addRow('shoppingList', {
        id: cryptoId(), itemId: existing?.id ?? null, name: q, note: qtyEl?.value || '', done: false,
        addedByMembershipId: this.state.scope.me()?.id, createdAt: new Date().toISOString()
      });
      toast('Added to list');
    });
    this.buyNextQuery = '';
  }

  private async shareInvite(id: string, via: 'whatsapp' | 'copy'): Promise<void> {
    const { S, scope } = this.state;
    const inv = S.invites.find((i) => i.id === id);
    if (!inv) return;
    const text = inviteShareText({
      name: S.memberships.find((m) => m.id === inv.membershipId)?.displayName ?? 'there',
      workspace: scope.workspace?.name ?? 'our workspace',
      inviter: scope.me()?.displayName ?? 'Someone',
      role: inv.role, code: inv.code,
      url: import.meta.env.VITE_APP_URL || location.origin
    });
    if (via === 'whatsapp') { window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); return; }
    try { await navigator.clipboard.writeText(text); toast('Invite message copied'); } catch { toast('Could not copy'); }
  }

  private async handleInvite(): Promise<void> {
    const name = (document.getElementById('memberName') as HTMLInputElement)?.value ?? '';
    const role = (document.getElementById('memberRole') as HTMLSelectElement)?.value as any;
    if (!name.trim()) { toast('Enter a name'); return; }
    await this.withSave(() => { const inv = createInvite(this.state.scope, name, role); toast(`Invite ${inv.code} created — share it below`); });
  }

  private async handleAddMember(): Promise<void> {
    const name = (document.getElementById('memberName') as HTMLInputElement)?.value ?? '';
    const role = (document.getElementById('memberRole') as HTMLSelectElement)?.value as any;
    if (!name.trim()) { toast('Enter a name'); return; }
    await this.withSave(() => { addMember(this.state.scope, name, role); toast(`${name.trim()} added`); });
  }

  private async handleAddAccount(): Promise<void> {
    const type = (document.getElementById('acctType') as HTMLSelectElement)?.value as any;
    const name = (document.getElementById('acctName') as HTMLInputElement)?.value ?? '';
    const last4 = (document.getElementById('acctLast4') as HTMLInputElement)?.value ?? '';
    if (!name.trim()) { toast('Enter an account name'); return; }
    const dupe = this.state.scope.accounts().some((a) => a.name.trim().toLowerCase() === name.trim().toLowerCase());
    if (dupe) { toast('An account with that name already exists'); return; }
    await this.withSave(() => {
      this.state.scope.addRow('accounts', {
        id: cryptoId(), ownerMembershipId: null, type, name: name.trim(), last4: last4.trim(), cycleDay: null, archived: false
      });
      toast('Account added');
    });
  }

  private async handleAddCategory(): Promise<void> {
    const icon = (document.getElementById('catIcon') as HTMLInputElement)?.value || '•';
    const name = (document.getElementById('catName') as HTMLInputElement)?.value ?? '';
    const kind = (document.getElementById('catKind') as HTMLSelectElement)?.value as any;
    if (!name.trim()) { toast('Enter a category name'); return; }
    await this.withSave(() => {
      this.state.scope.addRow('categories', { id: cryptoId(), name: name.trim(), icon, kind, archived: false });
      toast('Category added');
    });
  }

  /** categoryId null sets/updates the overall workspace budget; a category id
   *  sets/updates that category's budget. One row per (workspace, category). */
  private async handleSetBudget(categoryId: string | null): Promise<void> {
    const amtEl = document.getElementById(categoryId ? 'budgetAmt' : 'overallBudgetAmt') as HTMLInputElement | null;
    const amount = parseFloat(amtEl?.value || '0');
    if (!amount || amount <= 0) { toast('Enter an amount'); return; }
    await this.withSave(() => {
      const existing = this.state.scope.budgets().find((b) => b.categoryId === categoryId);
      if (existing) existing.limitPaise = rupeesToPaise(amount);
      else this.state.scope.addRow('budgets', { id: cryptoId(), categoryId, limitPaise: rupeesToPaise(amount) });
      toast('Budget saved');
    });
  }

  /** Accounts/categories are archived, never hard-deleted — historic transactions
   *  still reference them by id and need a name to show. Members go inactive
   *  for the same reason (D32: never deleted). Only budgets have no history
   *  pointing at them, so those are removed outright. */
  private handleRemoveAccount(id: string): void {
    if (!can(this.state.scope, 'manageSetup')) return;
    const a = byId(this.state.scope.state.accounts, id);
    if (!a) return;
    this.confirmAction(`Remove account "${a.name}"?`, () => this.withSave(() => { a.archived = true; toast('Account removed'); }), { okLabel: 'Remove', danger: true });
  }

  private handleRemoveCategory(id: string): void {
    if (!can(this.state.scope, 'manageSetup')) return;
    const c = byId(this.state.scope.state.categories, id);
    if (!c) return;
    this.confirmAction(`Remove category "${c.name}"?`, () => this.withSave(() => { c.archived = true; toast('Category removed'); }), { okLabel: 'Remove', danger: true });
  }

  private handleRemoveMember(id: string): void {
    const scope = this.state.scope;
    if (!can(scope, 'manageSetup')) return;
    if (id === scope.me()?.id) { toast('You cannot remove yourself'); return; }
    const m = byId(scope.state.memberships, id);
    if (!m) return;
    const otherActiveAdmins = scope.activeMembers().some((x) => x.id !== id && x.role === 'admin');
    if (m.role === 'admin' && !otherActiveAdmins) { toast('There must be at least one other admin'); return; }
    this.confirmAction(`Remove ${m.displayName}?`, () => this.withSave(() => { m.status = 'inactive'; toast(`${m.displayName} removed`); }), { okLabel: 'Remove', danger: true });
  }

  /** Clears the trip-expense form (amount/date/note/paidBy + category + any
   *  in-progress edit) — called when opening a trip fresh, after a
   *  successful add/update, and on cancel. Defaults the date to today so a
   *  brand-new form doesn't start blank. */
  private resetTripDraft(): void {
    this.state.tripExpenseCategory = null;
    this.state.editingTripExpenseId = null;
    this.state.tripDraft = emptyTripDraft();
  }

  /** Ticks/unticks one person in "Split between"; all ticked is stored as null (= everyone). */
  private toggleTripSplit(memberId: string): void {
    const all = this.state.scope.tripMembers(this.state.tripId!).map((m) => m.id);
    const cur = new Set(this.state.tripDraft.splitAmong ?? all);
    if (cur.has(memberId)) cur.delete(memberId); else cur.add(memberId);
    if (!cur.size) { toast('Pick at least one person'); return; }
    this.state.tripDraft.splitAmong = cur.size === all.length ? null : all.filter((id) => cur.has(id));
    this.render();
  }

  private async handleCreateTrip(): Promise<void> {
    const name = (document.getElementById('tripName') as HTMLInputElement)?.value ?? '';
    const start = (document.getElementById('tripStart') as HTMLInputElement)?.value || null;
    const end = (document.getElementById('tripEnd') as HTMLInputElement)?.value || null;
    if (!start) { toast('Pick a start date'); return; }
    const res = createTrip(this.state.scope, name, start, end, this.state.tripKind);
    if (!res.ok) { toast(res.msg); return; }
    // The creator is always a person in the event, so "Paid by" always has someone.
    ensureTripSelf(this.state.scope, res.id);
    const invited = addTripPeople(this.state.scope, res.id, parseNames((document.getElementById('tripPeople') as HTMLInputElement)?.value ?? ''));
    this.inviteToTrip(res.id, invited); // before any await, so the popup isn't blocked
    await this.withSave(() => {});
    this.state.tripId = res.id;
    this.state.tripKind = 'trip';
    this.state.tripPeoplePanel = null;
    this.resetTripDraft();
    this.state.goto('tripDetail');
    this.render();
  }

  private async handleAddTripMember(): Promise<void> {
    const names = parseNames((document.getElementById('tripMemberName') as HTMLInputElement)?.value ?? '');
    if (!names.length) { toast('Enter a name'); return; }
    const tripId = this.state.tripId!;
    const added = addTripPeople(this.state.scope, tripId, names);
    if (!added.length) { toast('Already in this event'); return; }
    this.inviteToTrip(tripId, added); // before any await, so the popup isn't blocked
    this.state.tripPeoplePanel = null;
    await this.withSave(() => {});
  }

  /** Opens WhatsApp (wa.me, contact picked in WhatsApp) with the event invite —
   *  shared by event creation and the "Add people" button. */
  private inviteToTrip(tripId: string, names: string[]): void {
    if (!names.length) return;
    const { scope } = this.state;
    const text = tripInviteText({
      names, event: byId(scope.state.trips, tripId)?.name ?? 'our event',
      inviter: scope.me()?.displayName ?? 'Someone', url: import.meta.env.VITE_APP_URL || location.origin
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }

  private async handleAddTripExpense(): Promise<void> {
    const td = this.state.tripDraft;
    const tripId = this.state.tripId!;
    const members = this.state.scope.tripMembers(tripId);
    const category = this.state.tripExpenseCategory;
    const amount = rupeesToPaise(parseFloat(td.amount || '0'));
    const label = td.customCat.trim();
    if (!category) { toast('Pick a category'); return; }
    if (category === 'custom' && !label) { toast('Name your custom category'); return; }
    if (!amount || amount <= 0) { toast('Enter an amount'); return; }
    // A <select> shows its first option without firing input, so fall back to the first member.
    const paidBy = td.paidBy || members[0]?.id || '';
    let payments = [{ memberId: paidBy, amountPaise: amount }];
    if (td.multiPay) {
      payments = members.map((m) => ({ memberId: m.id, amountPaise: rupeesToPaise(parseFloat(td.payAmounts[m.id] || '0')) })).filter((p) => p.amountPaise > 0);
      const paid = payments.reduce((n, p) => n + p.amountPaise, 0);
      if (paid !== amount) { toast(`Amounts paid add up to ${formatMoney(paid)}, bill is ${formatMoney(amount)}`); return; }
    }
    if (!payments[0]?.memberId) { toast('Add someone to the trip first'); return; }
    const input = {
      category, categoryLabel: category === 'custom' ? label : undefined, amountPaise: amount, date: td.date, note: td.note,
      paidByTripMemberId: payments[0].memberId, payments, splitAmong: td.splitAmong
    };
    const editingId = this.state.editingTripExpenseId;
    this.resetTripDraft(); // clear state before withSave's render(), or the modal reopens from stale state
    await this.withSave(() => {
      if (editingId) {
        const exp = byId(this.state.scope.state.tripExpenses, editingId);
        if (exp) Object.assign(exp, input);
        toast('Updated');
      } else {
        addTripExpense(this.state.scope, tripId, input);
        toast('Added');
      }
    });
  }

  private handleRemoveBudget(id: string): void {
    if (!can(this.state.scope, 'manageSetup')) return;
    this.confirmAction('Remove this budget?', () => this.withSave(() => {
      this.state.scope.state.budgets = this.state.scope.state.budgets.filter((b) => b.id !== id);
      toast('Budget removed');
    }), { okLabel: 'Remove', danger: true });
  }

  private async handleCreateGoal(): Promise<void> {
    const name = (document.getElementById('goalName') as HTMLInputElement)?.value ?? '';
    const target = parseFloat((document.getElementById('goalTarget') as HTMLInputElement)?.value ?? '0');
    if (!name.trim()) { toast('Enter a goal name'); return; }
    if (!target || target <= 0) { toast('Enter a target amount'); return; }
    const res = createGoal(this.state.scope, name, rupeesToPaise(target));
    if (!res.ok) { toast(res.msg); return; }
    await this.withSave(() => toast('Goal added'));
  }

  private async handleAddSaved(goalId: string): Promise<void> {
    const el = document.getElementById(`goalSaved-${goalId}`) as HTMLInputElement | null;
    const amount = parseFloat(el?.value ?? '0');
    if (!amount || amount <= 0) { toast('Enter an amount'); return; }
    await this.withSave(() => { addSaved(this.state.scope, goalId, rupeesToPaise(amount)); toast('Saved amount added'); });
  }

  private async handleAddMenuItem(): Promise<void> {
    const name = (document.getElementById('miName') as HTMLInputElement)?.value ?? '';
    const price = parseFloat((document.getElementById('miPrice') as HTMLInputElement)?.value ?? '0');
    if (!name.trim() || !price) { toast('Enter a name and price'); return; }
    await this.withSave(() => { createMenuItem(this.state.scope, name, rupeesToPaise(price)); });
  }

  private async handleExport(): Promise<void> {
    const json = JSON.stringify(this.state.S, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.setAttribute('data-testid', 'export-link');
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
}

function cryptoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
