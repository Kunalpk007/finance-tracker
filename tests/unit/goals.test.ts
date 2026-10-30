import { describe, expect, it } from 'vitest';
import { baseFixture, signInAs } from './fixtures';
import { createGoal } from '../../src/domain/goals';

describe('goals are private', () => {
  it('a member sees only their own goals, even the workspace admin cannot see theirs', () => {
    const { state, scope } = baseFixture();
    state.goals ??= []; // the app does this in AppState.adopt
    signInAs(state, 'u2', 'w1'); // Priya
    createGoal(scope, 'Bike', 100000);
    expect(scope.goals().map((g) => g.name)).toEqual(['Bike']);

    signInAs(state, 'u1', 'w1'); // Kunal, the admin
    expect(scope.goals()).toEqual([]);
    createGoal(scope, 'Car', 500000);
    expect(scope.goals().map((g) => g.name)).toEqual(['Car']);

    signInAs(state, 'u2', 'w1');
    expect(scope.goals().map((g) => g.name)).toEqual(['Bike']);
  });
});
