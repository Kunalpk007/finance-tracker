import { describe, it, expect } from 'vitest';
import { rupeesToPaise, paiseToRupees, formatMoney, formatShortMoney, sumPaise } from '../../src/domain/money';

describe('money (integer paise, D35/T8)', () => {
  it('never drifts on repeated fractional sums the way floats do', () => {
    // classic float trap: 0.1 + 0.2 !== 0.3 in rupees; paise as integers must not drift.
    const values = [rupeesToPaise(10.10), rupeesToPaise(20.20), rupeesToPaise(0.10)];
    const total = sumPaise(values);
    expect(total).toBe(3040); // 30.40 rupees exactly, as integer paise
  });

  it('round-trips rupees -> paise -> rupees', () => {
    expect(paiseToRupees(rupeesToPaise(1234.56))).toBeCloseTo(1234.56, 2);
  });

  it('formats with Indian digit grouping', () => {
    expect(formatMoney(rupeesToPaise(150000))).toBe('₹1,50,000');
  });

  it('formats compact short money', () => {
    expect(formatShortMoney(rupeesToPaise(150000))).toBe('₹1.50L');
    expect(formatShortMoney(rupeesToPaise(45000))).toBe('₹45k');
  });
});
