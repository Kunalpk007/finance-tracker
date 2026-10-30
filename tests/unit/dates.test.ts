import { describe, it, expect } from 'vitest';
import { iso, monthAdd, daysInMonth, toMonthKey, daysBetween } from '../../src/domain/dates';

describe('dates', () => {
  it('iso() uses local calendar components, not toISOString (the original app\'s bug #2)', () => {
    // A date constructed from local Y/M/D must round-trip without a UTC shift.
    const d = new Date(2026, 7, 10); // 10 Aug 2026 local, midnight local
    expect(iso(d)).toBe('2026-08-10');
  });

  it('monthAdd is pure integer arithmetic and never lands a month early (bug #3)', () => {
    expect(monthAdd('2026-08', -1)).toBe('2026-07');
    expect(monthAdd('2026-01', -1)).toBe('2025-12'); // year boundary backward
    expect(monthAdd('2025-12', 1)).toBe('2026-01'); // year boundary forward
    expect(monthAdd('2026-08', -3)).toBe('2026-05');
  });

  it('toMonthKey slices the month out of a calendar date', () => {
    expect(toMonthKey('2026-08-10')).toBe('2026-08');
  });

  it('daysInMonth respects leap years', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('daysBetween never goes negative', () => {
    expect(daysBetween('2026-08-10', '2026-08-01')).toBe(0);
    expect(daysBetween('2026-08-01', '2026-08-10')).toBe(9);
  });
});
