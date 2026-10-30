import type { StoreState } from '../../src/domain/types';
import { Scope } from '../../src/domain/scope';

export function emptyState(): StoreState {
  return {
    schemaVersion: 4,
    users: [], workspaces: [], memberships: [], invites: [],
    categories: [], accounts: [], transactions: [], recurring: [], budgets: [], audit: [],
    pantryItems: [], purchaseLines: [], reconciles: [], shoppingList: [],
    menuItems: [], recipeLines: [], orderEntries: [], stockAdjustments: [],
    trips: [], tripMembers: [], tripExpenses: [],
    session: { userId: null, workspaceId: null, authed: false },
    meta: {}
  };
}

/** A household workspace with one admin (Kunal) and one member (Priya), plus
 *  a business workspace with Kunal as admin and Ramesh as worker — mirrors
 *  the app's own seed shape so tests read close to the real scenarios. */
export function baseFixture(): { state: StoreState; scope: Scope } {
  const state = emptyState();
  state.users = [
    { id: 'u1', displayName: 'Kunal', email: 'kunal@example.com', phone: null, password: 'demo1234', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'u2', displayName: 'Priya', email: 'priya@example.com', phone: null, password: 'demo1234', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'u3', displayName: 'Ramesh', email: 'ramesh@example.com', phone: null, password: 'demo1234', createdAt: '2026-01-01T00:00:00Z' }
  ];
  state.workspaces = [
    { id: 'w1', type: 'household', name: 'Our Home', currency: 'INR', settings: { requireApproval: true, warnDuplicates: true, gstEnabled: false }, createdBy: 'u1', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'w2', type: 'business', name: 'Kadam Traders', currency: 'INR', settings: { requireApproval: true, warnDuplicates: true, gstEnabled: true }, createdBy: 'u1', createdAt: '2026-01-01T00:00:00Z' }
  ];
  state.memberships = [
    { id: 'm1', workspaceId: 'w1', userId: 'u1', displayName: 'Kunal', color: '#3b5bdb', role: 'admin', status: 'active', joinedAt: '2026-01-01T00:00:00Z' },
    { id: 'm2', workspaceId: 'w1', userId: 'u2', displayName: 'Priya', color: '#0f9960', role: 'member', status: 'active', joinedAt: '2026-01-01T00:00:00Z' },
    { id: 'b1', workspaceId: 'w2', userId: 'u1', displayName: 'Kunal', color: '#3b5bdb', role: 'admin', status: 'active', joinedAt: '2026-01-01T00:00:00Z' },
    { id: 'b2', workspaceId: 'w2', userId: 'u3', displayName: 'Ramesh', color: '#c77700', role: 'worker', status: 'active', joinedAt: '2026-01-01T00:00:00Z' }
  ];
  state.categories = [
    { id: 'c1', workspaceId: 'w1', name: 'Groceries', icon: '🧄', kind: 'expense', archived: false },
    { id: 'c2', workspaceId: 'w2', name: 'Fuel', icon: '⛽', kind: 'expense', archived: false }
  ];
  state.accounts = [
    { id: 'a1', workspaceId: 'w1', ownerMembershipId: 'm1', type: 'cash', name: 'Cash', last4: '', cycleDay: null, archived: false },
    { id: 'ba1', workspaceId: 'w2', ownerMembershipId: 'b1', type: 'cash', name: 'Shop cash', last4: '', cycleDay: null, archived: false }
  ];
  const scope = new Scope(state);
  return { state, scope };
}

export function signInAs(state: StoreState, userId: string, workspaceId: string) {
  state.session = { userId, workspaceId, authed: true };
}
