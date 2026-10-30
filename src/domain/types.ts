/* ============================================================================
   Shared types — mirror the Postgres schema (supabase/migrations) field for
   field, using camelCase in the client and mapping at the adapter boundary.
   Money is always integer paise. Dates are calendar strings 'YYYY-MM-DD',
   never Date/timestamp — see domain/dates.ts for why.
============================================================================ */

export type WorkspaceType = 'household' | 'business';
export type Role = 'admin' | 'member' | 'worker';
export type AccountType = 'cash' | 'bank' | 'credit_card' | 'upi' | 'wallet' | 'investment' | 'custom';
export type TxType = 'expense' | 'income' | 'transfer';
export type TxStatus = 'confirmed' | 'submitted' | 'pending' | 'rejected' | 'voided';
export type PantryTier = 'staple' | 'perishable';
export type ReconcileLevel = 'full' | 'half' | 'low' | 'out';
export type InviteStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
export type TripCategory = 'commute' | 'flights' | 'hotel' | 'food' | 'shopping' | 'entertainment' | 'activities' | 'health' | 'other' | 'custom';
/** What an "Event" is scoped to — a trip is the original case, festival/other
 *  cover any occasion-bound spend (Diwali, a wedding, …) that shouldn't skew
 *  the household's normal monthly numbers, same reasoning as a trip. */
export type TripKind = 'trip' | 'festival' | 'other';

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  displayName: string;
  /** Local-only rehearsal field. Never exists once Supabase Auth is wired up —
   *  the password never reaches this codebase at all once RemoteAdapter is live. */
  password?: string;
  createdAt: string;
}

export interface Workspace {
  id: string;
  type: WorkspaceType;
  name: string;
  currency: string;
  settings: { requireApproval: boolean; warnDuplicates: boolean; gstEnabled: boolean };
  createdBy: string;
  createdAt: string;
}

export interface Membership {
  id: string;
  workspaceId: string;
  userId: string | null; // null until an invite is accepted
  role: Role;
  displayName: string;
  color: string | null;
  status: 'active' | 'inactive' | 'invited';
  joinedAt: string | null;
}

export interface Invite {
  id: string;
  workspaceId: string;
  membershipId: string | null;
  role: Role;
  code: string;
  expiresAt: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
  createdBy: string;
  createdAt: string;
  status: 'pending' | 'accepted' | 'revoked';
}

export interface Category {
  id: string;
  workspaceId: string;
  name: string;
  kind: 'expense' | 'income';
  icon: string;
  archived: boolean;
}

export interface Account {
  id: string;
  workspaceId: string;
  ownerMembershipId: string | null; // null = shared/household account
  type: AccountType;
  name: string;
  last4: string;
  cycleDay: number | null;
  archived: boolean;
}

export interface Transaction {
  id: string;
  workspaceId: string;
  type: TxType;
  amountPaise: number;
  date: string; // calendar date
  categoryId: string | null;
  accountId: string;
  toAccountId: string | null;
  paidByMembershipId: string;
  loggedByMembershipId: string;
  isPersonal: boolean;
  vendor: string;
  note: string;
  photoPath: string | null;
  status: TxStatus;
  recurringId: string | null;
  approvedByMembershipId: string | null;
  approvedAt: string | null;
  rejectReason: string | null;
  voidedByMembershipId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  wasSubmitted: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  deletedAt: string | null;
}

export interface RecurringRule {
  id: string;
  workspaceId: string;
  type: 'expense' | 'income';
  amountPaise: number;
  categoryId: string | null;
  accountId: string;
  dayOfMonth: number;
  note: string;
  active: boolean;
  lastGenerated: string | null; // 'YYYY-MM'
  membershipId: string | null;
}

export interface Budget {
  id: string;
  workspaceId: string;
  categoryId: string | null; // null = overall workspace budget, not tied to one category
  limitPaise: number;
}

export interface AuditEntry {
  id: string;
  workspaceId: string;
  actorMembershipId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: string;
  ts: string;
}

export interface PantryItem {
  id: string;
  workspaceId: string;
  name: string;
  tier: PantryTier;
  group: string;
  unit: string;
  fullQty: number;
  weeklyUsage: number | null;
  shelfLifeDays: number | null;
  lowDays: number;
  baseQty: number;
  baseAt: string;
  lastReconciled: string | null;
  archived: boolean;
  createdAt: string;
}

export interface PurchaseLine {
  id: string;
  workspaceId: string;
  transactionId: string;
  itemId: string;
  qty: number;
  costPaise: number;
}

export interface Reconcile {
  id: string;
  workspaceId: string;
  itemId: string;
  date: string;
  level: ReconcileLevel;
  qtyBefore: number;
  qtyAfter: number;
  impliedWeekly: number | null;
  actorMembershipId: string;
}

export interface ShoppingListEntry {
  id: string;
  workspaceId: string;
  itemId: string | null; // null = free-text item not linked to a tracked pantry item
  name: string;
  note: string;
  done: boolean;
  addedByMembershipId: string;
  createdAt: string;
}

export interface MenuItem {
  id: string;
  workspaceId: string;
  name: string;
  pricePaise: number;
  category: string;
  active: boolean;
}

export interface RecipeLine {
  id: string;
  workspaceId: string;
  menuItemId: string;
  itemId: string; // pantry item consumed
  qty: number;
  unit: string;
}

export interface OrderEntry {
  id: string;
  workspaceId: string;
  menuItemId: string;
  qty: number;
  date: string;
  loggedByMembershipId: string;
  createdAt: string;
}

export interface StockAdjustment {
  id: string;
  workspaceId: string;
  itemId: string;
  qty: number; // negative = loss
  reason: string;
  date: string;
  actorMembershipId: string;
  createdAt: string;
}

/** A trip is a self-contained mini-ledger (D-trip): its spend never rolls into
 *  jointSpendPaise/catTotalsPaise/budgets, since one-off travel costs would
 *  otherwise skew the household's normal monthly numbers. Trip members are
 *  deliberately NOT workspace memberships — a trip companion is often not a
 *  household member at all, and doesn't need a role or login. */
export interface Trip {
  id: string;
  workspaceId: string;
  name: string;
  kind: TripKind;
  startDate: string | null;
  endDate: string | null;
  status: 'active' | 'closed';
  createdByMembershipId: string | null;
  createdAt: string;
}

export interface TripMember {
  id: string;
  workspaceId: string;
  tripId: string;
  name: string;
  color: string | null;
}

export interface TripExpense {
  id: string;
  workspaceId: string;
  tripId: string;
  category: TripCategory;
  amountPaise: number;
  date: string;
  /** Primary payer; `payments` (when set) is the full breakdown for multi-payer bills. */
  paidByTripMemberId: string;
  payments?: { memberId: string; amountPaise: number }[];
  /** Members sharing this bill; null/absent = everyone in the event. */
  splitAmong?: string[] | null;
  /** The user-typed name when category is 'custom'. */
  categoryLabel?: string;
  note: string;
  createdAt: string;
}

/** A personal savings goal — declared in Settings by whoever owns it, and
 *  updated by hand as they save (D-goal: no auto-tracking from transfers,
 *  keeps it independent of how the person actually saves). */
export interface Goal {
  id: string;
  workspaceId: string;
  membershipId: string;
  name: string;
  targetPaise: number;
  savedPaise: number;
  archived: boolean;
  createdAt: string;
}

export interface Session {
  userId: string | null;
  workspaceId: string | null;
  authed: boolean;
}

/** The whole local state blob — one document under the IndexedDB adapter, one
 *  set of tables under the Supabase adapter. Kept as a single shape so both
 *  adapters can satisfy the same `StoreState` interface (D17). */
export interface StoreState {
  schemaVersion: number;
  users: User[];
  workspaces: Workspace[];
  memberships: Membership[];
  invites: Invite[];
  categories: Category[];
  accounts: Account[];
  transactions: Transaction[];
  recurring: RecurringRule[];
  budgets: Budget[];
  audit: AuditEntry[];
  pantryItems: PantryItem[];
  purchaseLines: PurchaseLine[];
  reconciles: Reconcile[];
  shoppingList: ShoppingListEntry[];
  menuItems: MenuItem[];
  recipeLines: RecipeLine[];
  orderEntries: OrderEntry[];
  stockAdjustments: StockAdjustment[];
  trips: Trip[];
  tripMembers: TripMember[];
  tripExpenses: TripExpense[];
  goals: Goal[];
  session: Session;
  meta: Record<string, { lastAccountId?: string; lastByCategory?: Record<string, { accountId: string; paidByMembershipId: string }> }>;
}

export type Result<T = void> = { ok: true } & T | { ok: false; msg: string };
