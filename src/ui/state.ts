import type { StoreState, TripCategory, TripKind } from '../domain/types';
import type { StoreAdapter } from '../store/adapter';
import { RemoteAdapter } from '../store/remote-adapter';
import { Scope } from '../domain/scope';
import { buildSeed } from '../domain/seed';
import { weekStart } from '../domain/dates';
import { toast } from './util';

export type ViewName =
  | 'login' | 'signup' | 'redeem' | 'pickWorkspace'
  | 'home' | 'tx' | 'detail' | 'add' | 'export'
  | 'pantry' | 'pantryItem' | 'reconcile' | 'shopping'
  | 'approvals' | 'activity' | 'reports' | 'settings'
  | 'menu' | 'orders' | 'dayclose'
  | 'trips' | 'tripDetail' | 'goals';

export type Theme = 'light' | 'dark' | 'system';

function loadTheme(): Theme {
  try {
    const t = localStorage.getItem('theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch { return 'system'; }
}

export interface DraftTxUI {
  id: string | null;
  type: 'expense' | 'income' | 'transfer';
  amount: string;
  date: string;
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  paidByMembershipId: string;
  isPersonal: boolean;
  note: string;
  vendor: string;
  photoPath: string | null;
  _dupeAck: boolean;
}

/** The event-expense form. splitAmong null = everyone; multiPay switches "Paid by"
 *  from one person to an amount per person (payAmounts, by member id). */
export interface TripDraft {
  amount: string; date: string; note: string; paidBy: string;
  customCat: string; splitAmong: string[] | null; multiPay: boolean; payAmounts: Record<string, string>;
}
export const emptyTripDraft = (): TripDraft => ({
  amount: '', date: new Date().toISOString().slice(0, 10), note: '', paidBy: '',
  customCat: '', splitAmong: null, multiPay: false, payAmounts: {}
});

/** Central app state: the store blob, a Scope over it, and UI-only view
 *  state (current screen, in-flight draft, selected ids). Mirrors the
 *  original app's single-module design, just split across files. */
export class AppState {
  S!: StoreState;
  scope!: Scope;
  view: ViewName = 'login';
  draft: DraftTxUI | null = null;
  detailId: string | null = null;
  pantryItemId: string | null = null;
  tripId: string | null = null;
  tripKind: TripKind = 'trip';
  tripExpenseCategory: TripCategory | null = null;
  editingTripExpenseId: string | null = null;
  /** Which people panel is open on the event screen: the names list or the add-people form. */
  tripPeoplePanel: 'list' | 'add' | null = null;
  tripDraft: TripDraft = emptyTripDraft();
  reportMonth = '';
  reportPeriod: 'week' | 'month' | 'year' = 'month';
  reportWeekStart = '';
  reportYear = '';
  reportFilters: { personId: string; accountId: string; categoryId: string } = { personId: '', accountId: '', categoryId: '' };
  confirmModal: { title?: string; message: string; okLabel?: string; danger?: boolean; onConfirm: () => void | Promise<void> } | null = null;
  authMsg = '';
  /** True when authMsg is a neutral notice (e.g. "check your email"), not an error. */
  authInfo = false;
  theme: Theme = loadTheme();
  accountsExpanded = false;
  txSearch = '';

  constructor(private adapter: StoreAdapter) {}

  /** The Supabase adapter when configured, else null (local-only mode). */
  get remote(): RemoteAdapter | null {
    return this.adapter instanceof RemoteAdapter ? this.adapter : null;
  }

  /** Installs a state blob (boot, or after a remote sign-in/out reload). */
  adopt(S: StoreState): void {
    this.S = S;
    this.S.trips ??= [];
    this.S.tripMembers ??= [];
    this.S.tripExpenses ??= [];
    this.S.goals ??= [];
    this.scope = new Scope(this.S);
  }

  async boot(): Promise<void> {
    const loaded = await this.adapter.load();
    this.adopt(loaded ?? buildSeed());
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    this.reportMonth = todayStr.slice(0, 7);
    this.reportWeekStart = weekStart(todayStr);
    this.reportYear = todayStr.slice(0, 4);
    this.view = this.S.session.authed ? (this.S.session.workspaceId ? 'home' : 'pickWorkspace') : 'login';
    await this.save();
  }

  async save(): Promise<void> {
    const ok = await this.adapter.save(this.S);
    if (!ok) toast(this.adapter.lastError ? `Could not save — ${this.adapter.lastError}` : 'Could not save — storage unavailable');
  }

  refreshScope(): void {
    this.scope = new Scope(this.S);
  }

  goto(view: ViewName): void {
    this.view = view;
    this.authMsg = '';
    this.authInfo = false;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    try { localStorage.setItem('theme', theme); } catch { /* private browsing etc. — theme just won't persist */ }
  }
}
