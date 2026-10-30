/* ============================================================================
   Money is always an integer number of paise (bigint on the server, a plain
   JS number here — safe because a family/small-business ledger never
   approaches Number.MAX_SAFE_INTEGER paise, which is ~90 trillion rupees).
   Floats were the original app's stated tech debt (D35/T8): 0.1 + 0.2 !== 0.3,
   and over hundreds of rows a float sum drifts until an export stops tying to
   the dashboard. Every amount in this codebase is paise from the moment it is
   entered; formatting to rupees happens only at render time.
============================================================================ */

export const CUR = '₹';

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/** Whole-rupee display, matching the original app's `money()` — Indian digit grouping. */
export function formatMoney(paise: number): string {
  const rupees = Math.round(Math.abs(paise) / 100);
  return CUR + rupees.toLocaleString('en-IN');
}

/** Compact form for tight spaces: ₹1.2L, ₹45k, etc. */
export function formatShortMoney(paise: number): string {
  const rupees = Math.abs(paise) / 100;
  if (rupees >= 1e7) return CUR + (rupees / 1e7).toFixed(2) + 'Cr';
  if (rupees >= 1e5) return CUR + (rupees / 1e5).toFixed(2) + 'L';
  if (rupees >= 1000) return CUR + (rupees / 1000).toFixed(rupees >= 10000 ? 0 : 1) + 'k';
  return CUR + Math.round(rupees);
}

export function sumPaise(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
