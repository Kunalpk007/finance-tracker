/* ============================================================================
   Personal savings goals — declared by a member in Settings, updated by hand
   as they save. Deliberately not tied to any account/transfer: someone might
   save in cash, round up spare change, or just track a target mentally, and
   the goal should work the same way regardless.
============================================================================ */
import type { Scope } from './scope';

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function createGoal(scope: Scope, name: string, targetPaise: number): { ok: true; id: string } | { ok: false; msg: string } {
  if (!name.trim()) return { ok: false, msg: 'Give the goal a name' };
  const me = scope.me();
  if (!me) return { ok: false, msg: 'No active member to own this goal' };
  const goal = scope.addRow('goals', {
    id: uid(), membershipId: me.id, name: name.trim(), targetPaise, savedPaise: 0,
    archived: false, createdAt: new Date().toISOString()
  });
  return { ok: true, id: goal.id };
}

export function addSaved(scope: Scope, goalId: string, amountPaise: number): void {
  const goal = scope.goals().find((g) => g.id === goalId);
  if (goal) goal.savedPaise += amountPaise;
}

export function removeGoal(scope: Scope, goalId: string): void {
  const goal = scope.goals().find((g) => g.id === goalId);
  if (goal) goal.archived = true;
}
