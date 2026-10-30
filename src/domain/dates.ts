/* ============================================================================
   Calendar-date helpers.

   A financial date is a CALENDAR date, never an instant. The original app had
   two live bugs from `toISOString()`: it converts to UTC, so in IST (+5:30)
   any entry logged before 05:30 local time was stamped "yesterday", and month
   arithmetic built on top of it landed a month early. Both were found by the
   test harness, not by looking at the screen. Every date in this codebase is
   therefore built from local calendar components only — never from
   toISOString(), never from millisecond-diff month math.
============================================================================ */

export function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' -> 'YYYY-MM' */
export function toMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function daysInMonth(year: number, month1based: number): number {
  return new Date(year, month1based, 0).getDate();
}

/** Pure integer month arithmetic — no Date object touches it, so no timezone can. */
export function monthAdd(key: string, n: number): string {
  const parts = key.split('-').map(Number);
  const y = parts[0]!, m = parts[1]!;
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

export function monthName(key: string): string {
  const parts = key.split('-').map(Number);
  const y = parts[0]!, m = parts[1]!;
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

const DAY_MS = 86400000;

/** Whole/fractional days between two calendar-date strings, floored at 0. */
export function daysBetween(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / DAY_MS);
}

export function today(clock: () => Date = () => new Date()): string {
  return iso(clock());
}

/** Local calendar-date arithmetic — built from y/m/d components, never from
 *  millisecond math, for the same IST-shift reason as the rest of this file. */
export function dateAddDays(dateStr: string, days: number): string {
  const parts = dateStr.split('-').map(Number);
  return iso(new Date(parts[0]!, parts[1]! - 1, parts[2]! + days));
}

/** Monday of the week containing dateStr. */
export function weekStart(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  const dow = new Date(parts[0]!, parts[1]! - 1, parts[2]!).getDay(); // 0=Sun..6=Sat
  return dateAddDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

/** 'Jul 7 – 13, 2026', or 'Jul 28 – Aug 3, 2026' across a month boundary. */
export function weekLabel(startStr: string): string {
  const endStr = dateAddDays(startStr, 6);
  const sameMonth = startStr.slice(0, 7) === endStr.slice(0, 7);
  const fmt = (dStr: string, withMonth: boolean) => {
    const parts = dStr.split('-').map(Number);
    const d = new Date(parts[0]!, parts[1]! - 1, parts[2]!);
    return withMonth ? d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) : String(d.getDate());
  };
  return `${fmt(startStr, true)} – ${fmt(endStr, !sameMonth)}, ${endStr.slice(0, 4)}`;
}
