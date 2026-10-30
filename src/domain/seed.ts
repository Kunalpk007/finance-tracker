/* ============================================================================
   Sample data — deterministic (seeded PRNG) so the demo is stable between
   reloads. Two workspaces on purpose: a household and a business, sharing one
   login for Kunal, to exercise the multi-workspace/multi-role model from the
   first screen. Ported from the original app's seed(), amounts converted to
   paise, plus new pantry/recipe rows for the restaurant module.
============================================================================ */
import type { StoreState } from './types';
import { iso, monthAdd, daysInMonth, today } from './dates';
import { rupeesToPaise } from './money';
import { guessItem } from './pantry';

let _s = 20260804;
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const pick = <T,>(a: T[]): T => a[Math.floor(rnd() * a.length)]!;
const between = (a: number, b: number) => Math.round((a + rnd() * (b - a)) / 10) * 10;

export function buildSeed(): StoreState {
  const TODAY = new Date();
  const CURMONTH = iso(TODAY).slice(0, 7);

  const users = [
    { id: 'u1', displayName: 'Kunal', email: 'kunal@example.com', phone: null, password: 'demo1234', createdAt: new Date().toISOString() },
    { id: 'u2', displayName: 'Priya', email: 'priya@example.com', phone: null, password: 'demo1234', createdAt: new Date().toISOString() },
    { id: 'u3', displayName: 'Ramesh', email: 'ramesh@example.com', phone: null, password: 'demo1234', createdAt: new Date().toISOString() }
  ];
  const workspaces = [
    { id: 'w1', type: 'household' as const, name: 'Our Home', currency: 'INR', settings: { requireApproval: true, warnDuplicates: true, gstEnabled: false }, createdBy: 'u1', createdAt: new Date().toISOString() },
    { id: 'w2', type: 'business' as const, name: 'Kadam Traders', currency: 'INR', settings: { requireApproval: true, warnDuplicates: true, gstEnabled: true }, createdBy: 'u1', createdAt: new Date().toISOString() }
  ];
  const memberships = [
    { id: 'm1', workspaceId: 'w1', userId: 'u1', displayName: 'Kunal', color: '#3b5bdb', role: 'admin' as const, status: 'active' as const, joinedAt: new Date().toISOString() },
    { id: 'm2', workspaceId: 'w1', userId: 'u2', displayName: 'Priya', color: '#0f9960', role: 'member' as const, status: 'active' as const, joinedAt: new Date().toISOString() },
    { id: 'b1', workspaceId: 'w2', userId: 'u1', displayName: 'Kunal', color: '#3b5bdb', role: 'admin' as const, status: 'active' as const, joinedAt: new Date().toISOString() },
    { id: 'b2', workspaceId: 'w2', userId: 'u3', displayName: 'Ramesh', color: '#c77700', role: 'worker' as const, status: 'active' as const, joinedAt: new Date().toISOString() },
    { id: 'b3', workspaceId: 'w2', userId: null, displayName: 'Suresh', color: '#7048e8', role: 'worker' as const, status: 'invited' as const, joinedAt: null }
  ];
  const accounts = [
    { id: 'a1', workspaceId: 'w1', ownerMembershipId: 'm1', type: 'credit_card' as const, name: 'HDFC Regalia', last4: '4412', cycleDay: 18, archived: false },
    { id: 'a2', workspaceId: 'w1', ownerMembershipId: 'm1', type: 'bank' as const, name: 'ICICI Savings', last4: '8890', cycleDay: null, archived: false },
    { id: 'a3', workspaceId: 'w1', ownerMembershipId: null, type: 'cash' as const, name: 'Cash', last4: '', cycleDay: null, archived: false },
    { id: 'a4', workspaceId: 'w1', ownerMembershipId: 'm2', type: 'upi' as const, name: 'GPay · SBI', last4: '2231', cycleDay: null, archived: false },
    { id: 'a5', workspaceId: 'w1', ownerMembershipId: 'm2', type: 'credit_card' as const, name: 'Axis Ace', last4: '7756', cycleDay: 5, archived: false },
    { id: 'a6', workspaceId: 'w1', ownerMembershipId: 'm1', type: 'investment' as const, name: 'Index SIP', last4: '', cycleDay: null, archived: false },
    { id: 'a7', workspaceId: 'w1', ownerMembershipId: 'm2', type: 'investment' as const, name: 'PPF', last4: '', cycleDay: null, archived: false },
    { id: 'ba1', workspaceId: 'w2', ownerMembershipId: 'b1', type: 'bank' as const, name: 'Current A/C', last4: '3301', cycleDay: null, archived: false },
    { id: 'ba2', workspaceId: 'w2', ownerMembershipId: null, type: 'cash' as const, name: 'Shop cash', last4: '', cycleDay: null, archived: false },
    { id: 'ba3', workspaceId: 'w2', ownerMembershipId: 'b1', type: 'credit_card' as const, name: 'Business card', last4: '9021', cycleDay: 22, archived: false }
  ];
  const CATS: [string, string][] = [['Groceries', '🧄'], ['Food & Dining', '🍽'], ['Transport', '🚗'], ['Utilities', '💡'], ['Rent', '🏠'], ['Health', '⚕'], ['Shopping', '🛍'], ['Entertainment', '🎬'], ['Bills & Subs', '📅'], ['Education', '📚'], ['Household', '🧹'], ['Other', '❔']];
  const INCCATS: [string, string][] = [['Salary', '💰'], ['Dividends', '📈'], ['Interest', '🏦'], ['Rental', '🔑'], ['Freelance', '💼'], ['Gift', '🎁'], ['Other Income', '❔']];
  const BIZCATS: [string, string][] = [['Materials', '📦'], ['Wages', '👷'], ['Fuel', '⛽'], ['Repairs', '🔧'], ['Rent', '🏠'], ['Utilities', '💡'], ['Transport', '🚚'], ['Other', '❔']];
  const BIZINC: [string, string][] = [['Sales', '🧾'], ['Other Income', '❔']];
  const categories = [
    ...CATS.map((c, i) => ({ id: 'c' + i, workspaceId: 'w1', name: c[0], icon: c[1], kind: 'expense' as const, archived: false })),
    ...INCCATS.map((c, i) => ({ id: 'i' + i, workspaceId: 'w1', name: c[0], icon: c[1], kind: 'income' as const, archived: false })),
    ...BIZCATS.map((c, i) => ({ id: 'bc' + i, workspaceId: 'w2', name: c[0], icon: c[1], kind: 'expense' as const, archived: false })),
    ...BIZINC.map((c, i) => ({ id: 'bi' + i, workspaceId: 'w2', name: c[0], icon: c[1], kind: 'income' as const, archived: false }))
  ];
  const cid = (n: string) => categories.find((c) => c.name === n && c.workspaceId === 'w1')!.id;
  const bcid = (n: string) => categories.find((c) => c.name === n && c.workspaceId === 'w2')!.id;

  const profile: [string, number, number, number][] = [
    ['Groceries', 7, 400, 2600], ['Food & Dining', 6, 250, 1800], ['Transport', 6, 60, 650],
    ['Utilities', 3, 600, 2400], ['Health', 2, 300, 1600], ['Shopping', 3, 600, 4200],
    ['Entertainment', 3, 200, 1200], ['Bills & Subs', 4, 149, 999], ['Household', 2, 200, 1400], ['Other', 1, 100, 900]
  ];
  const spendAccts = ['a1', 'a2', 'a3', 'a4', 'a5'];
  const tx: any[] = [];
  const uidc = (() => { let n = 0; return () => 'tx' + (n++); })();

  function addExpense(dateStr: string, catName: string, amtRupees: number, note = '', personal = false) {
    const acc = pick(spendAccts);
    const owner = accounts.find((a) => a.id === acc)!.ownerMembershipId || 'm1';
    tx.push({
      id: uidc(), workspaceId: 'w1', type: 'expense', amountPaise: rupeesToPaise(amtRupees), date: dateStr, categoryId: cid(catName),
      accountId: acc, toAccountId: null, paidByMembershipId: owner, loggedByMembershipId: 'm1',
      isPersonal: personal, note, vendor: '', photoPath: null, status: 'confirmed', recurringId: null,
      approvedByMembershipId: null, approvedAt: null, rejectReason: null, voidedByMembershipId: null, voidedAt: null, voidReason: null,
      wasSubmitted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, deletedAt: null
    });
  }

  const months = [monthAdd(CURMONTH, -3), monthAdd(CURMONTH, -2), monthAdd(CURMONTH, -1), CURMONTH];
  months.forEach((mkey) => {
    const isCur = mkey === CURMONTH;
    const parts = mkey.split('-').map(Number);
    const y = parts[0]!, m = parts[1]!;
    const lastDay = isCur ? TODAY.getDate() : daysInMonth(y, m);
    if (!isCur || lastDay >= 3) addExpense(`${mkey}-03`, 'Rent', 32000, 'Monthly rent');
    profile.forEach(([cat, count, lo, hi]) => {
      const n = isCur ? Math.max(1, Math.round((count * lastDay) / daysInMonth(y, m) * 1.6)) : count;
      for (let k = 0; k < n; k++) {
        const day = 1 + Math.floor(rnd() * lastDay);
        addExpense(`${mkey}-${String(Math.min(day, lastDay)).padStart(2, '0')}`, cat, between(lo, hi));
      }
    });
    addExpense(`${mkey}-${String(Math.min(9, lastDay)).padStart(2, '0')}`, 'Shopping', between(700, 2200), 'Personal', true);
    tx.push({
      id: uidc(), workspaceId: 'w1', type: 'income', amountPaise: rupeesToPaise(145000), date: `${mkey}-01`, categoryId: cid('Salary'),
      accountId: 'a2', toAccountId: null, paidByMembershipId: 'm1', loggedByMembershipId: 'm1', isPersonal: false, note: 'Salary', vendor: '', photoPath: null,
      status: mkey === CURMONTH ? 'pending' : 'confirmed', recurringId: 'r1', approvedByMembershipId: null, approvedAt: null, rejectReason: null,
      voidedByMembershipId: null, voidedAt: null, voidReason: null, wasSubmitted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, deletedAt: null
    });
    if (!isCur || lastDay >= 5) {
      tx.push({
        id: uidc(), workspaceId: 'w1', type: 'transfer', amountPaise: rupeesToPaise(15000), date: `${mkey}-05`, categoryId: null,
        accountId: 'a2', toAccountId: 'a6', paidByMembershipId: 'm1', loggedByMembershipId: 'm1', isPersonal: false, note: 'Monthly SIP', vendor: '', photoPath: null,
        status: 'confirmed', recurringId: null, approvedByMembershipId: null, approvedAt: null, rejectReason: null, voidedByMembershipId: null, voidedAt: null, voidReason: null,
        wasSubmitted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, deletedAt: null
      });
    }
  });

  const bizTx: any[] = [];
  const bizProfile: [string, number, number, number][] = [['Materials', 5, 1200, 9000], ['Fuel', 6, 400, 2200], ['Transport', 4, 300, 1800], ['Repairs', 2, 500, 3500], ['Utilities', 2, 900, 3200]];
  [monthAdd(CURMONTH, -2), monthAdd(CURMONTH, -1), CURMONTH].forEach((mkey) => {
    const isCur = mkey === CURMONTH;
    const parts = mkey.split('-').map(Number);
    const by = parts[0]!, bm = parts[1]!;
    const lastDay = isCur ? TODAY.getDate() : daysInMonth(by, bm);
    bizTx.push({
      id: uidc(), workspaceId: 'w2', type: 'expense', amountPaise: rupeesToPaise(28000), date: `${mkey}-05`, categoryId: bcid('Rent'),
      accountId: 'ba1', toAccountId: null, paidByMembershipId: 'b1', loggedByMembershipId: 'b1', isPersonal: false, note: 'Shop rent', vendor: 'Landlord', photoPath: null,
      status: 'confirmed', recurringId: null, approvedByMembershipId: null, approvedAt: null, rejectReason: null, voidedByMembershipId: null, voidedAt: null, voidReason: null,
      wasSubmitted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, deletedAt: null
    });
    bizProfile.forEach(([cat, count, lo, hi]) => {
      const n = isCur ? Math.max(1, Math.round((count * lastDay) / daysInMonth(by, bm))) : count;
      for (let k = 0; k < n; k++) {
        bizTx.push({
          id: uidc(), workspaceId: 'w2', type: 'expense', amountPaise: rupeesToPaise(between(lo, hi)), date: `${mkey}-${String(1 + Math.floor(rnd() * lastDay)).padStart(2, '0')}`,
          categoryId: bcid(cat), accountId: pick(['ba1', 'ba2', 'ba3']), toAccountId: null, paidByMembershipId: 'b1', loggedByMembershipId: 'b1', isPersonal: false, note: '', vendor: '', photoPath: null,
          status: 'confirmed', recurringId: null, approvedByMembershipId: null, approvedAt: null, rejectReason: null, voidedByMembershipId: null, voidedAt: null, voidReason: null,
          wasSubmitted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, deletedAt: null
        });
      }
    });
    bizTx.push({
      id: uidc(), workspaceId: 'w2', type: 'income', amountPaise: rupeesToPaise(between(180000, 260000)), date: `${mkey}-10`, categoryId: bcid('Sales'),
      accountId: 'ba1', toAccountId: null, paidByMembershipId: 'b1', loggedByMembershipId: 'b1', isPersonal: false, note: 'Monthly sales', vendor: '', photoPath: null,
      status: 'confirmed', recurringId: null, approvedByMembershipId: null, approvedAt: null, rejectReason: null, voidedByMembershipId: null, voidedAt: null, voidReason: null,
      wasSubmitted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, deletedAt: null
    });
  });
  // Ramesh's outstanding claims — counted by nothing until approved.
  bizTx.push({
    id: 'claim1', workspaceId: 'w2', type: 'expense', amountPaise: rupeesToPaise(1450), date: iso(TODAY), categoryId: bcid('Fuel'),
    accountId: 'ba2', toAccountId: null, paidByMembershipId: 'b2', loggedByMembershipId: 'b2', isPersonal: false, note: 'Diesel for the tempo', vendor: 'HP Petrol', photoPath: null,
    status: 'submitted', recurringId: null, approvedByMembershipId: null, approvedAt: null, rejectReason: null, voidedByMembershipId: null, voidedAt: null, voidReason: null,
    wasSubmitted: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, deletedAt: null
  });
  bizTx.push({
    id: 'claim2', workspaceId: 'w2', type: 'expense', amountPaise: rupeesToPaise(620), date: iso(TODAY), categoryId: bcid('Repairs'),
    accountId: 'ba2', toAccountId: null, paidByMembershipId: 'b2', loggedByMembershipId: 'b2', isPersonal: false, note: 'Puncture and tyre air', vendor: 'Roadside', photoPath: null,
    status: 'submitted', recurringId: null, approvedByMembershipId: null, approvedAt: null, rejectReason: null, voidedByMembershipId: null, voidedAt: null, voidReason: null,
    wasSubmitted: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, deletedAt: null
  });

  // Pantry: household + business consumables, back-dated purchases.
  const pantry: any[] = [], plines: any[] = [];
  const mkItem = (wid: string, name: string, base: number, daysAgoBought: number) => {
    const g = guessItem(name);
    const boughtOn = iso(new Date(TODAY.getTime() - daysAgoBought * 864e5));
    const it = {
      id: 'p_' + name.toLowerCase().replace(/\s+/g, ''), workspaceId: wid, name, tier: g.tier, group: g.group, unit: g.unit,
      fullQty: g.fullQty, weeklyUsage: g.weeklyUsage, shelfLifeDays: g.shelfLifeDays, lowDays: 7,
      baseQty: base, baseAt: boughtOn, lastReconciled: g.tier === 'staple' ? boughtOn : null, archived: false, createdAt: boughtOn
    };
    pantry.push(it);
    return it;
  };
  ([['Atta', 8, 10], ['Rice', 6, 12], ['Toor dal', 2.5, 14], ['Sugar', 1.2, 20], ['Cooking oil', 1.6, 9], ['Milk', 1, 1], ['Onion', 0.9, 6], ['Potato', 2.2, 6], ['Tea', 180, 25], ['Eggs', 6, 3]] as [string, number, number][])
    .forEach(([n, q, d]) => mkItem('w1', n, q, d));
  ([['Tomato', 1, 3], ['Spinach', 250, 4], ['Coriander', 100, 5], ['Banana', 6, 2], ['Curd', 0.5, 2]] as [string, number, number][])
    .forEach(([n, q, d]) => mkItem('w1', n, q, d));
  ([['Diesel', 40, 5], ['Engine oil', 6, 20], ['Cleaning supplies', 4, 15], ['Packing tape', 12, 10]] as [string, number, number][])
    .forEach(([n, q, d]) => {
      const it = mkItem('w2', n, q, d);
      it.tier = 'staple'; it.unit = 'L';
      it.weeklyUsage = ({ Diesel: 35, 'Engine oil': 1, 'Cleaning supplies': 1.5, 'Packing tape': 4 } as Record<string, number>)[n]!;
      it.fullQty = ({ Diesel: 60, 'Engine oil': 10, 'Cleaning supplies': 6, 'Packing tape': 24 } as Record<string, number>)[n]!;
      it.shelfLifeDays = null;
    });
  // restaurant ingredients for the recipe demo
  (['Chicken', 'Butter', 'Cream', 'Naan flour'] as string[]).forEach((n) => {
    const it = mkItem('w2', n, 8, 3);
    it.tier = 'staple'; it.unit = 'kg'; it.weeklyUsage = 15; it.fullQty = 20;
  });

  const priceSeed: [string, [number, number][]][] = [
    ['p_onion', [[28, 2], [34, 2], [58, 1.5]]], ['p_tomato', [[22, 1], [30, 1]]],
    ['p_atta', [[42, 5], [44, 5]]], ['p_milk', [[62, 2], [62, 2]]]
  ];
  priceSeed.forEach(([itemId, buys]) => {
    buys.forEach(([unitPrice, qty], idx) => {
      const when = iso(new Date(TODAY.getTime() - (buys.length - idx) * 7 * 864e5));
      const t = {
        id: uidc(), workspaceId: 'w1', type: 'expense', amountPaise: rupeesToPaise(Math.round(unitPrice * qty)), date: when, categoryId: cid('Groceries'),
        accountId: 'a3', toAccountId: null, paidByMembershipId: 'm1', loggedByMembershipId: 'm1', isPersonal: false, note: '', vendor: 'Sharma Vegetables', photoPath: null,
        status: 'confirmed', recurringId: null, approvedByMembershipId: null, approvedAt: null, rejectReason: null, voidedByMembershipId: null, voidedAt: null, voidReason: null,
        wasSubmitted: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1, deletedAt: null
      };
      tx.push(t);
      plines.push({ id: uidc() + '_l', workspaceId: 'w1', transactionId: t.id, itemId, qty, costPaise: rupeesToPaise(Math.round(unitPrice * qty)) });
    });
  });

  // restaurant menu + recipe (BOM) demo
  const menuItems = [
    { id: 'mi1', workspaceId: 'w2', name: 'Butter Chicken', pricePaise: rupeesToPaise(320), category: 'Main', active: true },
    { id: 'mi2', workspaceId: 'w2', name: 'Naan', pricePaise: rupeesToPaise(45), category: 'Bread', active: true }
  ];
  const recipeLines = [
    { id: 'rl1', workspaceId: 'w2', menuItemId: 'mi1', itemId: 'p_chicken', qty: 0.2, unit: 'kg' },
    { id: 'rl2', workspaceId: 'w2', menuItemId: 'mi1', itemId: 'p_butter', qty: 0.05, unit: 'kg' },
    { id: 'rl3', workspaceId: 'w2', menuItemId: 'mi1', itemId: 'p_cream', qty: 0.03, unit: 'kg' },
    { id: 'rl4', workspaceId: 'w2', menuItemId: 'mi2', itemId: 'p_naanflour', qty: 0.08, unit: 'kg' }
  ];
  const orderEntries = [
    { id: 'oe1', workspaceId: 'w2', menuItemId: 'mi1', qty: 12, date: iso(TODAY), loggedByMembershipId: 'b1', createdAt: new Date().toISOString() },
    { id: 'oe2', workspaceId: 'w2', menuItemId: 'mi2', qty: 20, date: iso(TODAY), loggedByMembershipId: 'b1', createdAt: new Date().toISOString() }
  ];

  return {
    schemaVersion: 4,
    users, workspaces, memberships,
    invites: [{ id: 'inv1', workspaceId: 'w2', membershipId: 'b3', role: 'worker', code: 'KT-4F2QX9', createdBy: 'b1', createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 7 * 864e5).toISOString(), status: 'pending', acceptedBy: null, acceptedAt: null }],
    session: { userId: null, workspaceId: null, authed: false },
    audit: [],
    accounts, categories,
    transactions: tx.concat(bizTx),
    recurring: [{ id: 'r1', workspaceId: 'w1', type: 'income', amountPaise: rupeesToPaise(145000), categoryId: cid('Salary'), accountId: 'a2', dayOfMonth: 1, note: 'Salary', active: true, lastGenerated: CURMONTH, membershipId: 'm1' }],
    budgets: [
      { id: 'bud1', workspaceId: 'w1', categoryId: cid('Food & Dining'), limitPaise: rupeesToPaise(9000) },
      { id: 'bud2', workspaceId: 'w1', categoryId: cid('Groceries'), limitPaise: rupeesToPaise(13000) },
      { id: 'bud3', workspaceId: 'w1', categoryId: cid('Shopping'), limitPaise: rupeesToPaise(6000) },
      { id: 'bud4', workspaceId: 'w2', categoryId: bcid('Fuel'), limitPaise: rupeesToPaise(18000) }
    ],
    meta: { w1: { lastAccountId: 'a4' }, w2: { lastAccountId: 'ba2' } },
    pantryItems: pantry, purchaseLines: plines, reconciles: [],
    shoppingList: [{ id: 'sh1', workspaceId: 'w1', itemId: null, name: 'Dishwash bar', note: '', done: false, addedByMembershipId: 'm1', createdAt: new Date().toISOString() }],
    menuItems, recipeLines, orderEntries, stockAdjustments: [],
    trips: [], tripMembers: [], tripExpenses: [], goals: []
  };
}
