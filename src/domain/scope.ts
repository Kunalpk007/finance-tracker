/* ============================================================================
   Workspace scoping.

   Every books table is a flat array carrying `workspaceId`, exactly matching
   the real schema (ARCHITECTURE.md §4 / supabase/migrations). Nothing reads a
   raw array from state; everything goes through a scoped accessor here, so a
   row from the wrong workspace cannot be reached even by mistake — hazard H1
   made structural rather than remembered. `addRow` stamps the active
   workspace itself, so a caller cannot forget to.
============================================================================ */
import type {
  StoreState, Workspace, Membership, Category, Account, Transaction,
  RecurringRule, Budget, AuditEntry, PantryItem, PurchaseLine, Reconcile,
  ShoppingListEntry, MenuItem, RecipeLine, OrderEntry, StockAdjustment,
  Trip, TripMember, TripExpense, Goal
} from './types';

export function byId<T extends { id: string }>(arr: T[], id: string | null | undefined): T | undefined {
  if (!id) return undefined;
  return arr.find((x) => x.id === id);
}

export class Scope {
  constructor(public state: StoreState) {}

  get activeWorkspaceId(): string | null {
    return this.state.session.workspaceId;
  }

  get workspace(): Workspace | undefined {
    return byId(this.state.workspaces, this.activeWorkspaceId ?? undefined) ?? this.state.workspaces[0];
  }

  private scope<T extends { workspaceId: string }>(arr: T[]): T[] {
    const wid = this.activeWorkspaceId;
    return arr.filter((r) => r.workspaceId === wid);
  }

  memberships(): Membership[] { return this.scope(this.state.memberships); }
  activeMembers(): Membership[] { return this.memberships().filter((m) => m.status === 'active'); }
  invitedMembers(): Membership[] { return this.memberships().filter((m) => m.status === 'invited'); }
  categories(): Category[] { return this.scope(this.state.categories); }
  accounts(): Account[] { return this.scope(this.state.accounts).filter((a) => !a.archived); }
  transactions(): Transaction[] { return this.scope(this.state.transactions).filter((t) => !t.deletedAt); }
  recurring(): RecurringRule[] { return this.scope(this.state.recurring); }
  budgets(): Budget[] { return this.scope(this.state.budgets); }
  audit(): AuditEntry[] { return this.scope(this.state.audit); }
  pantryItems(): PantryItem[] { return this.scope(this.state.pantryItems).filter((i) => !i.archived); }
  purchaseLines(): PurchaseLine[] { return this.scope(this.state.purchaseLines); }
  reconciles(): Reconcile[] { return this.scope(this.state.reconciles); }
  shoppingList(): ShoppingListEntry[] { return this.scope(this.state.shoppingList); }
  menuItems(): MenuItem[] { return this.scope(this.state.menuItems).filter((m) => m.active); }
  recipeLines(): RecipeLine[] { return this.scope(this.state.recipeLines); }
  orderEntries(): OrderEntry[] { return this.scope(this.state.orderEntries); }
  stockAdjustments(): StockAdjustment[] { return this.scope(this.state.stockAdjustments); }
  trips(): Trip[] { return this.scope(this.state.trips); }
  tripMembers(tripId: string): TripMember[] { return this.scope(this.state.tripMembers).filter((m) => m.tripId === tripId); }
  tripExpenses(tripId: string): TripExpense[] { return this.scope(this.state.tripExpenses).filter((e) => e.tripId === tripId); }
  /** Goals are private: only the signed-in member's own (the server enforces the same via RLS). */
  goals(): Goal[] {
    const me = this.me();
    return this.scope(this.state.goals).filter((g) => !g.archived && g.membershipId === me?.id);
  }

  meta(): { lastAccountId?: string; lastByCategory?: Record<string, { accountId: string; paidByMembershipId: string }> } {
    const wid = this.activeWorkspaceId;
    if (!wid) return {};
    if (!this.state.meta[wid]) this.state.meta[wid] = {};
    return this.state.meta[wid]!;
  }

  /** The signed-in human, resolved to their membership IN THIS workspace. */
  me(): Membership | undefined {
    const uid = this.state.session.userId;
    return this.memberships().find((m) => m.userId === uid) ?? this.activeMembers()[0] ?? this.memberships()[0];
  }

  myWorkspaces(): Workspace[] {
    const uid = this.state.session.userId;
    return this.state.workspaces.filter((w) =>
      this.state.memberships.some((m) => m.workspaceId === w.id && m.userId === uid && m.status === 'active')
    );
  }

  addRow<K extends keyof StoreState>(collection: K, row: any): any {
    const stamped = { ...row, workspaceId: this.activeWorkspaceId };
    (this.state[collection] as any[]).push(stamped);
    return stamped;
  }
}
